#!/usr/bin/env node
/* 🌍 Ta famille dans les grands mouvements (lib/mouvements.php, assets/js/heritage-mouvements.js, assets/data/grands-mouvements.json).
 *  1. données : chaque mouvement a ses dates, d'où, vers où et une source ;
 *  2. serveur : Pierre MAZAUD (Cantal → Paris, 1895) dans l'exode vers Paris et chez les « bougnats » ; Jean DURAND (Barcelonnette → Mexique) ;
 *     Marie LACOMBE (restée à Tulle) nulle part ; Paul (né à Paris, mort à Lyon) pas dans l'exode rural ; « Non » le retire, « Oui » le confirme ;
 *     un mouvement à moi (Carmaux → Albi) retrouve la personne ;
 *  3. écran : Listes → Histoire → la liste, « Oui, c'est ça » (↶ Annuler), 🗺 sur la carte des migrations, « Seulement ceux de ma famille » ; la fiche : « a fait partie de ».
 *   node tests/test-mouvements.js */
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

(async () => {
    await t('données : dates, d’où, vers où, une source pour chaque mouvement', async () => {
        const d = JSON.parse(fs.readFileSync(path.join(root, 'assets/data/grands-mouvements.json'), 'utf8'));
        assert.ok(d.mouvements.length >= 30); assert.strictEqual(d.count, d.mouvements.length);
        const ids = new Set();
        d.mouvements.forEach(m => {
            assert.ok(m.id && !ids.has(m.id), m.id); ids.add(m.id);
            assert.ok(m.from >= 1500 && m.to >= m.from && m.to <= 2000, m.id);
            assert.ok(Object.values(m.de).flat().length && Object.values(m.vers).flat().length, m.id);
            assert.match(m.src, /^Wikipédia : /); assert.match(m.url, /^https:\/\/fr\.wikipedia\.org\//);
            assert.ok(m.desc.length > 20, m.id);
        });
    });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-mv-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$tag = function ($t) use ($pdo) { $s = $pdo->prepare('SELECT id FROM event_types WHERE gedcom_tag=? ORDER BY id LIMIT 1'); $s->execute([$t]); return (int) $s->fetchColumn(); };
$pl = function ($name, $county, $country, $insee, $lat = null, $lon = null) use ($pdo) { $pdo->prepare('INSERT INTO places(name, county, country, admin4_code, latitude, longitude) VALUES(?,?,?,?,?,?)')->execute([$name, $county, $country, $insee, $lat, $lon]); return (int) $pdo->lastInsertId(); };
$malv = $pl('Malvialle', 'Cantal', 'France', '15100', 45.1, 2.6); $paris = $pl('Paris', 'Seine', 'France', '75056', 48.85, 2.35); $barc = $pl('Barcelonnette', 'Basses-Alpes', 'France', '04019');
$puebla = $pl('Puebla', 'Puebla', 'Mexique', ''); $tulle = $pl('Tulle', 'Corrèze', 'France', '19272'); $lyon = $pl('Lyon', 'Rhône', 'France', '69123');
$carm = $pl('Carmaux', 'Tarn', 'France', '81060'); $albi = $pl('Albi', 'Tarn', 'France', '81004');
$per = function ($f, $l, $g, $evs) use ($pdo, $tag) { $pdo->prepare("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES(?,?,?,'deceased')")->execute([$f, $l, $g]); $id = (int) $pdo->lastInsertId();
    foreach ($evs as [$t, $y, $p]) { $pdo->prepare('INSERT INTO events(scope, person_id, event_type_id, year, date_text, place_id) VALUES(\'person\',?,?,?,?,?)')->execute([$id, $tag($t), $y, (string) $y, $p]); } return $id; };
$ids = [
  'pierre' => $per('Pierre', 'MAZAUD', 'male', [['BIRT', 1870, $malv], ['RESI', 1895, $paris], ['DEAT', 1930, $paris]]),
  'jean' => $per('Jean', 'DURAND', 'male', [['BIRT', 1860, $barc], ['DEAT', 1902, $puebla]]),
  'marie' => $per('Marie', 'LACOMBE', 'female', [['BIRT', 1880, $tulle], ['DEAT', 1950, $tulle]]),
  'paul' => $per('Paul', 'DURAND', 'male', [['BIRT', 1900, $paris], ['DEAT', 1960, $lyon]]),
  'louis' => $per('Louis', 'LACOMBE', 'male', [['BIRT', 1890, $carm], ['DEAT', 1940, $albi]]),
];
echo json_encode($ids);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/pierre/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const ID = JSON.parse(seed.stdout.trim().split('\n').pop());
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const p = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.mouvements && window.LCNDA_APP?.state?.csrf, null, {timeout: 30000});
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);
        const whoIn = (d, id) => (d.mouvements.find(m => m.id === id)?.people || []).map(x => x.name);
        await t('serveur : qui a pris part à quel mouvement', async () => {
            const d = await api('grands_mouvements');
            assert.deepStrictEqual(whoIn(d, 'bougnats'), ['Pierre MAZAUD']);
            assert.deepStrictEqual(whoIn(d, 'exode-paris'), ['Pierre MAZAUD']);
            const b = d.mouvements.find(m => m.id === 'bougnats').people[0];
            assert.deepStrictEqual([b.level, b.from, b.to, b.y1], ['sur', 'Malvialle', 'Paris', 1895]);
            assert.deepStrictEqual(whoIn(d, 'barcelonnettes'), ['Jean DURAND']);
            assert.ok(!whoIn(d, 'exode-villes').includes('Paul DURAND'), 'né à Paris : pas l’exode rural');
            assert.ok(!d.mouvements.some(m => m.people.some(x => x.name === 'Marie LACOMBE')), 'restée à Tulle');
            assert.match(d.mouvements.find(m => m.id === 'bougnats').de_text, /Cantal \(15\)/);
            assert.strictEqual(d.mouvements.find(m => m.id === 'exode-paris').vers_text, 'Paris et sa région');
        });
        await t('serveur : « Non » le retire, « Oui » le confirme ; un mouvement à moi', async () => {
            let r = await post('movement_mark', {person_id: ID.pierre, movement_id: 'exode-paris', verdict: 'non'}); assert.strictEqual(r.old, '');
            assert.deepStrictEqual(whoIn(await api('grands_mouvements'), 'exode-paris'), []);
            assert.deepStrictEqual(whoIn(await api('grands_mouvements', {non: 1}), 'exode-paris'), ['Pierre MAZAUD']);
            r = await post('movement_mark', {person_id: ID.pierre, movement_id: 'exode-paris', verdict: ''}); assert.strictEqual(r.old, 'non');
            assert.ok((await post('movement_mark', {person_id: ID.pierre, movement_id: '../x', verdict: 'oui'})).error);
            const o = await post('save_own_movement', {title: 'Les verriers de Carmaux vers Albi', from_year: 1895, to_year: 1950, de: 'Carmaux', vers: 'Albi, 31', source: 'Monographie'});
            assert.ok(o.id);
            assert.deepStrictEqual(whoIn(await api('grands_mouvements'), 'o' + o.id), ['Louis LACOMBE']);
            assert.ok((await post('save_own_movement', {title: 'x', from_year: 1900, de: 'a', vers: 'b', url: 'javascript:alert(1)'})).error, 'lien refusé');
            const m = (await api('person_movements', {id: ID.jean})).moves; assert.deepStrictEqual(m.map(x => x.id), ['barcelonnettes']);
        });
        await t('écran : Listes → Histoire → la liste ; « Oui, c’est ça » (↶ Annuler) ; seulement ma famille', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'grands_mouvements'; A.setModule('listes'); });
            await p.waitForSelector('[data-mv-card="bougnats"]', {timeout: 20000});
            assert.ok(!(await p.$('[data-mv-card="quebec"]')), 'seulement ceux de ma famille par défaut');
            assert.match(await p.textContent('[data-mv-card="bougnats"]'), /Pierre MAZAUD.*Malvialle → Paris, 1895/s);
            await p.click(`[data-mv-card="bougnats"] [data-mv-mark="oui"]`);
            await p.waitForFunction(() => /Confirmé/.test(document.querySelector('[data-mv-card="bougnats"]')?.textContent || ''), null, {timeout: 10000});
            await p.evaluate(() => [...document.querySelectorAll('.ui-toast')].reverse().find(x => /Confirmé/.test(x.textContent)).querySelector('button').click()); await sleep(800);
            const d = await api('grands_mouvements'); assert.strictEqual(d.mouvements.find(m => m.id === 'bougnats').people[0].verdict, '', '↶ Annuler');
            await p.click('[data-mv-map="bougnats"]');
            await p.waitForSelector('dialog[open] svg', {timeout: 20000});
            const spec = await p.evaluate(() => window.LCNDA_EXT.mouvements.flowSpec(window.__mv = {title: 't', from: 1, to: 2, de_text: 'a', vers_text: 'b', people: [{from: 'Malvialle', to: 'Paris', from_ll: [45.1, 2.6], to_ll: [48.85, 2.35]}]}));
            assert.deepStrictEqual([spec.kind, spec.o.map, spec.rows[0].from, spec.rows[0].value, spec.places.paris.lat], ['flowmap', 'fr', 'Malvialle', 1, 48.85]);
            await p.keyboard.press('Escape'); await sleep(400);
            await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
            await p.click('[data-mv-mine]'); await p.waitForSelector('[data-mv-card="quebec"]', {timeout: 10000});
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-mouvements')).mine), false, 'le choix est gardé');
        });
        await t('fiche : « Pierre a fait partie de : … » dans le bloc « Le monde autour »', async () => {
            await p.evaluate(id => { const A = window.LCNDA_APP; A.state.currentPersonId = id; A.setModule('personnes'); }, ID.pierre);
            await p.waitForFunction(() => /a fait partie de/.test(document.querySelector('[data-mv-person]')?.textContent || ''), null, {timeout: 20000});
            assert.match(await p.textContent('[data-mv-person]'), /Pierre a fait partie de : Auvergnats et Aveyronnais/);
        });
        assert.deepStrictEqual(errs, [], 'erreurs JS : ' + errs.join(' | '));
    } finally { await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    console.log(fails ? `${fails} échec(s)` : 'tout est bon'); process.exit(fails ? 1 : 0);
})();
