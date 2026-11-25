#!/usr/bin/env node
/* 🔁 Interrupteurs et mémoires : éteindre → rallumer doit tout remettre, et une fiche modifiée doit se voir tout de suite
 * (sans recharger la page). Chaque essai reproduit un défaut trouvé à l'audit « aller-retour » :
 *  1. 🧭 Ton lien (colonne Personnes) : éteint, il laissait les liens dans la fiche ouverte (parents, enfants) ; rallumé
 *     après avoir changé de fiche, il ne les y remettait pas (app.js) ;
 *  2. 🧭 Ton lien : un lien ajouté (Marie ← son père Henri) n'apparaissait pas dans la colonne : l'ancienne réponse
 *     « aucun lien » restait en mémoire jusqu'au rechargement (app.js, paKinCache) ;
 *  3. 📍 Images de lieux : une image située depuis les Médias n'apparaissait pas sur la Carte (calque gardé en mémoire,
 *     heritage-place-photos.js) ;
 *  4. 🌌 Le ciel de sa naissance : la date de naissance changée, le ciel restait l'ancien (arbre des Trésors gardé
 *     20 secondes, heritage-tresors.js) ;
 *  5. blocs « contexte » de la fiche (🧭 boussole, 🌍 monde et coutumes, ⛰️ terre et gens, 🪨 terre et mots,
 *     🏷️ nom et villages, 🌊 rivières, 🌾 terroir) : la naissance déplacée (date, lieu), ils montraient encore
 *     l'ancienne (réponses gardées en mémoire par personne).
 *   node tests/test-interrupteurs-aller-retour.js */
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
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 7).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-ar-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$tag = function ($t) use ($pdo) { $s = $pdo->prepare('SELECT id FROM event_types WHERE gedcom_tag=? ORDER BY id LIMIT 1'); $s->execute([$t]); return (int) $s->fetchColumn(); };
$pl = function ($name, $county, $la, $lo) use ($pdo) { $pdo->prepare("INSERT INTO places(name, county, country, latitude, longitude) VALUES(?, ?, 'France', ?, ?)")->execute([$name, $county, $la, $lo]); return (int) $pdo->lastInsertId(); };
$tulle = $pl('Tulle', 'Corrèze', 45.2671, 1.77); $paris = $pl('Paris', 'Paris', 48.8566, 2.3522);
$per = function ($f, $l, $g, $evs = []) use ($pdo, $tag) { $pdo->prepare("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES(?,?,?,'deceased')")->execute([$f, $l, $g]); $id = (int) $pdo->lastInsertId();
    foreach ($evs as $e) { [$t, $d, $p] = $e; $pdo->prepare("INSERT INTO events(scope, person_id, event_type_id, year, date_text, place_id) VALUES('person',?,?,?,?,?)")->execute([$id, $tag($t), (int) substr($d, -4), $d, $p]); } return $id; };
$fam = function ($a, $b, $kids) use ($pdo) { $pdo->prepare('INSERT INTO families(partner1_id, partner2_id) VALUES(?,?)')->execute([$a, $b]); $f = (int) $pdo->lastInsertId(); foreach ($kids as $i => $k) { $pdo->prepare('INSERT INTO family_children(family_id, child_id, position) VALUES(?,?,?)')->execute([$f, $k, $i]); } return $f; };
$I = ['tulle' => $tulle, 'paris' => $paris];
$I['louis'] = $per('Louis', 'MAZAUD', 'male', [['BIRT', '1890', $tulle], ['DEAT', '1960', $tulle]]);
$I['anne'] = $per('Anne', 'LACOMBE', 'female', [['BIRT', '1895', $tulle]]);
$I['pierre'] = $per('Pierre', 'MAZAUD', 'male', [['BIRT', '1920', $tulle]]);
$I['marie'] = $per('Marie', 'DURAND', 'female', [['BIRT', '1925', $paris]]);
$I['jean'] = $per('Jean', 'MAZAUD', 'male', [['BIRT', '1950', $tulle]]);
$I['henri'] = $per('Henri', 'DURAND', 'male', [['BIRT', '1888', $paris]]);
$pdo->exec('UPDATE persons SET is_start=1 WHERE id=' . $I['jean']);
$fam($I['louis'], $I['anne'], [$I['pierre']]);
$fam($I['pierre'], $I['marie'], [$I['jean']]);
// deux images (une carte postale de Tulle déjà située, une vue de Paris pas encore)
$I['gd'] = function_exists('imagecreatetruecolor');
if ($I['gd']) { foreach (['a.jpg', 'b.jpg'] as $n) { $im = imagecreatetruecolor(300, 200); imagefill($im, 0, 0, imagecolorallocate($im, 200, 180, 150)); imagejpeg($im, MEDIA_DIR . '/' . $n, 85); } }
$ins = $pdo->prepare("INSERT INTO media(title, filename, thumbnail, media_type, date_text) VALUES(?,?,?, 'image', ?)");
$ins->execute(['Tulle, le pont', 'a.jpg', 'a.jpg', 'vers 1905']); $I['m1'] = (int) $pdo->lastInsertId();
$ins->execute(['Paris, la rue', 'b.jpg', 'b.jpg', 'vers 1910']); $I['m2'] = (int) $pdo->lastInsertId();
echo json_encode($I);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/louis/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const ID = JSON.parse(seed.stdout.trim().split('\n').pop());

    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    // la feuille de style des ajouts de Personnes (le <link> est posé dans index.php par la personne qui intègre)
    const css = fs.readFileSync(path.join(root, 'assets/css/audit-personnes.css'), 'utf8');
    const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
    await ctx.route(/tile\.|openstreetmap|arcgisonline|ign\.fr|carto/, r => r.fulfill({status: 200, contentType: 'image/png', body: PNG}));
    await ctx.route(url => new URL(url).pathname === '/' || /index\.php$/.test(new URL(url).pathname), async route => {
        const r = await route.fetch(); let body = await r.text();
        if (!/audit-personnes\.css/.test(body)) body = body.replace('</head>', `<style id="ar-test-css">${css}</style></head>`);
        await route.fulfill({response: r, body, headers: {...r.headers(), 'content-length': String(Buffer.byteLength(body))}});
    });
    try {
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        p.on('dialog', d => d.dismiss().catch(() => {}));
        await p.goto(`${base}#personnes`); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_I18N, null, {timeout: 30000});
        await sleep(2500); // le démarrage écrit dans la base (Sosa, réglages) : on le laisse finir
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);
        const openPerson = async id => { await p.evaluate(i => window.LCNDA_APP.openPersonById(i), id); await p.waitForFunction(i => window.LCNDA_APP.state.currentPerson?.person?.id === i && document.querySelector('.person-page h2'), id, {timeout: 20000}); };
        const kinIn = sel => p.evaluate(s => document.querySelectorAll(s).length, sel);
        const TREE_KIN = '#workspace .lineage-tree .pa-kin, #workspace .lineage-person + .pa-kin';
        const toggleKin = () => p.click('label:has(#person-kin-show)');

        await t('🧭 Ton lien éteint puis rallumé : la colonne ET la fiche ouverte (parents, enfants) suivent', async () => {
            await openPerson(ID.jean);
            await p.waitForFunction(s => document.querySelectorAll(s).length > 0, TREE_KIN, {timeout: 15000});
            await p.waitForSelector('#person-list .pa-kin', {timeout: 15000});
            await toggleKin();
            await p.waitForFunction(() => !document.querySelector('#person-list .pa-kin'), null, {timeout: 5000});
            assert.equal(await kinIn(TREE_KIN), 0, 'éteint : plus de lien dans la fiche ouverte');
            await toggleKin();
            await p.waitForFunction(s => document.querySelectorAll(s).length > 0, TREE_KIN, {timeout: 15000});
            // éteint, on change de fiche, puis on rallume : les liens reviennent dans la nouvelle fiche
            await toggleKin(); await p.waitForFunction(() => !document.querySelector('#person-list .pa-kin'), null, {timeout: 5000});
            await openPerson(ID.pierre); await sleep(800);
            assert.equal(await kinIn(TREE_KIN), 0);
            await toggleKin();
            await p.waitForFunction(s => [...document.querySelectorAll(s)].some(x => /grand-père|père|personne de départ/.test(x.textContent)), TREE_KIN, {timeout: 15000});
            await p.waitForSelector('#person-list .pa-kin', {timeout: 15000});
        });

        await t('🧭 Ton lien : un lien ajouté se voit dans la colonne sans recharger la page', async () => {
            const kinOf = id => p.evaluate(i => document.querySelector(`#person-list .person-list-item[data-person-id="${i}"] .pa-kin`)?.textContent || '', id);
            await p.waitForFunction(i => document.querySelector(`#person-list .person-list-item[data-person-id="${i}"]`) && document.querySelector('#person-list .pa-kin'), ID.henri, {timeout: 15000});
            await sleep(500);
            assert.equal(await kinOf(ID.henri), '', 'Henri n’est encore relié à personne');
            const r = await post('add_relation', {person_id: ID.marie, related_id: ID.henri, relation_type: 'parent'});
            assert.ok(!r.error, r.error);
            await p.evaluate(() => window.LCNDA_APP.setModule('personnes'));
            await p.waitForFunction(i => /grand-père/.test(document.querySelector(`#person-list .person-list-item[data-person-id="${i}"] .pa-kin`)?.textContent || ''), ID.henri, {timeout: 15000});
        });

        await t('🌌 Le ciel de sa naissance suit la date de naissance changée', async () => {
            // la fiche redessinée sur place, comme après « Enregistrer » dans la fenêtre d'un événement (le bloc d'avant est marqué)
            const sky = async () => {
                await p.evaluate(i => { document.querySelectorAll(`[data-sky-block="${i}"]`).forEach(b => { b.dataset.old = '1'; }); window.LCNDA_APP.openPersonById(i); }, ID.louis);
                await p.waitForFunction(i => document.querySelector(`[data-sky-block="${i}"]:not([data-old]) [data-sky-txt]`)?.textContent, ID.louis, {timeout: 20000});
                return p.evaluate(i => ({txt: document.querySelector(`[data-sky-block="${i}"]:not([data-old]) [data-sky-txt]`).textContent}), ID.louis);
            };
            const before = await sky();
            assert.match(before.txt, /pleine lune/);
            const d = await api('person', {id: ID.louis}); const ev = d.events.find(e => (e.gedcom_tag || e.tag) === 'BIRT');
            const birthInTree = () => p.evaluate(async i => (await window.LCNDA_EXT.tresors.T.tree()).evBy.get('p' + i).find(e => e.tag === 'BIRT').y, ID.louis);
            await p.evaluate(() => window.LCNDA_EXT.tresors.T.tree(true)); // l'arbre des Trésors vient d'être lu (il est gardé 20 s)
            assert.equal(await birthInTree(), 1890);
            const r = await post('save_event', {...ev, date_text: '1790', year: 1790, place_id: ID.paris}); assert.ok(!r.error, r.error);
            assert.equal(await birthInTree(), 1790, 'l’arbre gardé en mémoire doit être relu après l’enregistrement');
            const after = await sky();
            assert.match(after.txt, /lune gibbeuse décroissante/, `ciel encore celui de 1890 : ${after.txt}`);
        });

        await t('🧭🌍⛰️🪨🏷️🌊🌾 les blocs « contexte » de la fiche suivent la naissance déplacée (1790, Paris)', async () => {
            // (la naissance de Louis a été changée à l'essai précédent) : sa fiche redessinée après l'enregistrement
            await p.evaluate(i => { document.querySelectorAll(`[data-br-person="${i}"]`).forEach(b => { b.dataset.old = '1'; }); window.LCNDA_APP.openPersonById(i); }, ID.louis);
            await p.waitForFunction(i => document.querySelector(`[data-br-person="${i}"]:not([data-old])`), ID.louis, {timeout: 20000});
            const host = (sel, re) => p.waitForFunction(([s, r]) => new RegExp(r).test(document.querySelector(s)?.innerText || ''), [sel, re], {timeout: 30000}).then(() => true, () => false);
            const text = sel => p.evaluate(s => (document.querySelector(s)?.innerText || '(absent)').replace(/\s+/g, ' ').slice(0, 300), sel);
            const want = [
                [`[data-br-person="${ID.louis}"]`, 'En 1790 à Paris'], // 🧭 boussole
                [`[data-l9-person="${ID.louis}"]`, 'À sa naissance \\(1790\\)'], // 🌍 monde et coutumes
                [`[data-tm-person="${ID.louis}"]`, 'Sous Paris'], // 🪨 terre et mots
                [`[data-cc-person="${ID.louis}"]`, 'armoiries de Paris'], // 🏷️ nom et villages
                [`[data-hist-life="${ID.louis}"] [data-mr-hist]`, 'passent à Paris'] // 🌊 rivières (bloc 🏘 Le lieu à son époque)
            ];
            const bad = []; // tous les blocs vérifiés, puis la liste de ceux restés sur l'ancienne naissance
            for (const [sel, re] of want) if (!await host(sel, re)) bad.push(`${sel} : « ${re} » attendu, lu : ${await text(sel)}`);
            // ⛰️ terre et gens, 🌾 terroir : plus rien de la naissance de 1890 à Tulle
            const l10 = `[data-l10-person="${ID.louis}"]`, trr = `[data-trr-person="${ID.louis}"]`;
            if (!await host(l10, '1816') || /il avait 68 ans/.test(await text(l10))) bad.push(`⛰️ ${l10} : ${await text(l10)}`);
            await host(trr, 'Louis');
            if (/costume traditionnel de son pays \(Corrèze\)/.test(await p.evaluate(s => document.querySelector(s)?.innerText || '', trr))) bad.push(`🌾 ${trr} : encore le costume de la Corrèze`);
            assert.deepStrictEqual(bad, []);
        });

        await t('📍 Images de lieux : une image située depuis les Médias paraît sur la Carte sans recharger', async () => {
            if (!ID.gd) { console.log('  – sauté (PHP sans GD)'); return; }
            const r = await post('place_photo_write', {op: 'guess', media_id: ID.m1, place_id: ID.tulle, certainty: 'certain'}); assert.ok(!r.error, r.error);
            const pins = () => p.evaluate(() => [...document.querySelectorAll('#pp-layer [data-pp-pin]')].map(x => Number(x.dataset.ppPin)).sort());
            await p.evaluate(() => { localStorage.setItem('lcnda-map-place-photos', '1'); window.LCNDA_APP.setModule('carte'); });
            await p.waitForFunction(i => document.querySelector(`#pp-layer [data-pp-pin="${i}"]`), ID.m1, {timeout: 20000});
            assert.deepEqual(await pins(), [ID.m1]);
            // ailleurs (Listes, Médias…) : « Où a-t-elle été prise ? » → une hypothèse « Paris » pour la 2e image
            await p.evaluate(() => window.LCNDA_APP.setModule('listes')); await sleep(800);
            await p.evaluate(i => window.LCNDA_EXT.placePhotos.open(i), ID.m2);
            await p.click('.pp-dlg [data-pp-new]'); await p.waitForSelector('.pp-gform .pk-input');
            await p.fill('.pp-gform .pk-input', 'Paris');
            await p.waitForSelector('.pp-gform .pk-list [role=option]', {state: 'attached', timeout: 10000});
            await (await p.$('.pp-gform .pk-list [role=option]')).click({force: true});
            await p.waitForFunction(() => document.querySelector('.pp-gform [name=place_id]')?.value, null, {timeout: 5000});
            await p.click('.pp-gform [data-pp-gsave]');
            await p.waitForFunction(() => document.querySelector('.pp-dlg .pp-guess.is-retained'), null, {timeout: 10000});
            await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
            await p.evaluate(() => window.LCNDA_APP.setModule('carte'));
            await p.waitForFunction(i => document.querySelector(`#pp-layer [data-pp-pin="${i}"]`), ID.m2, {timeout: 20000}).catch(() => {});
            assert.deepEqual(await pins(), [ID.m1, ID.m2].sort(), 'la vue de Paris doit être sur la Carte');
        });

        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs.filter(e => !/ResizeObserver/.test(e)), []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
