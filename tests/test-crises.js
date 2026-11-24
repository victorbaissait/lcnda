#!/usr/bin/env node
/* 🦠 Les crises, plus fines (lib/heritage_more.php historical_context, assets/data/monde-autour.json, heritage-more.js, diagramme « Naissances et décès »).
 *  1. données : les crises locales (choléra de 1832 à Paris, crue de la Garonne…) dans la liste unique « Le monde autour », chacune sourcée ;
 *  2. serveur : la cause lue (« décédé du choléra » dans un acte transcrit relié) rend la crise sûre ; la saison (mois par mois) ; enfants / adultes ;
 *     un département lu par son nom (« Seine ») ; mes événements « épidémie » deviennent des crises ; « Noter comme cause du décès » ;
 *     le diagramme « Naissances et décès » prend ses crises dans la même liste ;
 *  3. écran : Listes → « Épidémies, guerres, hivers terribles » : la cause, la source, les mois, « Noter comme cause du décès » (↶ Annuler).
 *   node tests/test-crises.js */
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
    await t('données : les crises locales dans la liste unique, sourcées', async () => {
        const d = JSON.parse(fs.readFileSync(path.join(root, 'assets/data/monde-autour.json'), 'utf8'));
        const c = d.events.filter(e => e.crisis);
        assert.ok(c.length >= 45, c.length); assert.strictEqual(d.count, d.events.length);
        const local = c.filter(e => e.scope !== 'France'); assert.ok(local.length >= 20, local.length);
        c.forEach(e => { assert.ok(e.src && /^https:\/\/fr\.wikipedia\.org\//.test(e.url), e.title); assert.ok(e.to >= e.from); });
        assert.ok(c.some(e => e.title === 'Choléra de 1832 à Paris' && e.scope === '75,92,93,94'));
        assert.strictEqual(new Set(d.events.map(e => e.id)).size, d.events.length, 'identifiants uniques');
        const js = fs.readFileSync(path.join(root, 'assets/js/heritage-diagram-more.js'), 'utf8');
        assert.match(js, /r\.crises\?\.length \? r\.crises\.map/, 'le diagramme prend la liste du serveur');
    });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-crises-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$tag = function ($t) use ($pdo) { $s = $pdo->prepare('SELECT id FROM event_types WHERE gedcom_tag=? ORDER BY id LIMIT 1'); $s->execute([$t]); return (int) $s->fetchColumn(); };
$pl = function ($name, $county, $insee) use ($pdo) { $pdo->prepare("INSERT INTO places(name, county, country, admin4_code) VALUES(?,?,'France',?)")->execute([$name, $county, $insee]); return (int) $pdo->lastInsertId(); };
$paris = $pl('Paris', 'Seine', ''); $tulle = $pl('Tulle', 'Corrèze', '19272'); $malv = $pl('Malvialle', 'Corrèze', '19100');
$per = function ($f, $l, $by, $dd, $place, $cause = '') use ($pdo, $tag) { $pdo->prepare("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES(?,?,'male','deceased')")->execute([$f, $l]); $id = (int) $pdo->lastInsertId();
    $pdo->prepare("INSERT INTO events(scope, person_id, event_type_id, year, date_text) VALUES('person',?,?,?,?)")->execute([$id, $tag('BIRT'), $by, (string) $by]);
    $pdo->prepare("INSERT INTO events(scope, person_id, event_type_id, year, date_text, place_id, cause) VALUES('person',?,?,?,?,?,?)")->execute([$id, $tag('DEAT'), (int) substr($dd, -4), $dd, $place, $cause]); return $id; };
$ids = ['pierre' => $per('Pierre', 'MAZAUD', 1790, '12 juillet 1832', $paris), 'jean' => $per('Jean', 'DURAND', 1830, '3 août 1832', $tulle),
  'louis' => $per('Louis', 'LACOMBE', 1800, '20 avril 1832', $paris, 'fluxion de poitrine'), 'marc' => $per('Marc', 'LACOMBE', 1750, '10 mars 1789', $malv)];
act_transcriptions_ensure($pdo);
$pdo->prepare("INSERT INTO act_transcriptions(title, kind, body, data_json) VALUES(?,?,?,?)")->execute(['Décès de Pierre MAZAUD', 'deces', 'Le douze juillet mil huit cent trente deux est décédé du choléra Pierre MAZAUD, âgé de 42 ans.', json_encode(['zones' => [], 'people' => [['key' => 'p1', 'person_id' => $ids['pierre']]]])]);
$pdo->prepare("INSERT INTO history_events(from_year, to_year, title, category, description, reach, place_id) VALUES(1789, 1789, 'Incendie de Malvialle', 'crise', 'Le village brûle.', 'commune', ?)")->execute([$malv]);
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
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf, null, {timeout: 30000});
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);
        const crisis = (d, title) => d.crises.find(c => c.title === title);
        await t('serveur : la cause lue rend la crise sûre ; la saison ; enfants et adultes ; un département lu par son nom', async () => {
            const d = await api('historical_context');
            const paris = crisis(d, 'Choléra de 1832 à Paris'); assert.ok(paris, 'crise locale');
            assert.deepStrictEqual(paris.victims.map(v => v.person.first_name || v.person.name).length, 2, 'Paris (« Seine ») : Pierre et Louis');
            const pv = paris.victims.find(v => v.person.id === ID.pierre);
            assert.deepStrictEqual([pv.sure, pv.cause.text, pv.cause.from, pv.month], [true, 'choléra', 'act', 7]);
            const lv = paris.victims.find(v => v.person.id === ID.louis); assert.deepStrictEqual([lv.sure, lv.cause.from], [false, 'noted'], 'une autre cause notée : pas sûr');
            assert.strictEqual(paris.sure, 1); assert.strictEqual(paris.months[6], 1); assert.strictEqual(paris.months[3], 1);
            assert.match(paris.url, /^https:\/\/fr\.wikipedia\.org\//);
            const nat = crisis(d, 'Choléra de 1832'); assert.ok(nat.victims.some(v => v.person.id === ID.jean)); assert.strictEqual(nat.kids, 1, 'Jean a 2 ans'); assert.strictEqual(nat.adults, 2);
            assert.ok(!paris.victims.some(v => v.person.id === ID.jean), 'Tulle n’est pas à Paris');
            const own = crisis(d, 'Incendie de Malvialle'); assert.ok(own && own.own, 'mes événements « crise »'); assert.deepStrictEqual(own.victims.map(v => v.person.id), [ID.marc]);
        });
        await t('serveur : « Noter comme cause du décès » (et l’ancienne pour ↶ Annuler) ; le diagramme prend la liste unique', async () => {
            const d = await api('historical_context'); const pv = crisis(d, 'Choléra de 1832 à Paris').victims.find(v => v.person.id === ID.pierre);
            const r = await post('set_death_cause', {event_id: pv.event_id, cause: 'choléra'}); assert.strictEqual(r.old, '');
            const pv2 = crisis(await api('historical_context'), 'Choléra de 1832 à Paris').victims.find(v => v.person.id === ID.pierre); assert.deepStrictEqual([pv2.cause.from, pv2.sure], ['noted', true]);
            await post('set_death_cause', {event_id: pv.event_id, cause: ''});
            assert.ok((await post('set_death_cause', {event_id: 999999, cause: 'x'})).error);
            const dm = await api('diagram_more', {what: 'crises'});
            assert.ok(dm.crises.some(c => c.label === 'Choléra de 1832'), JSON.stringify(dm.crises).slice(0, 200));
            assert.ok(!dm.crises.some(c => c.label === 'Choléra de 1832 à Paris'), 'seulement les crises de toute la France (et les miennes)');
            assert.ok(dm.crises.some(c => c.label === 'Incendie de Malvialle'));
        });
        await t('écran : la cause, la source, les mois ; « Noter comme cause du décès » (↶ Annuler)', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'historical_context'; A.setModule('listes'); });
            await p.waitForSelector('.h-crisis', {timeout: 20000});
            const card = await p.evaluateHandle(() => [...document.querySelectorAll('.h-crisis')].find(a => /Choléra de 1832 à Paris/.test(a.textContent)));
            const txt = await card.evaluate(a => a.textContent);
            assert.match(txt, /cause : choléra/); assert.match(txt, /lu dans l’acte « Décès de Pierre MAZAUD »/); assert.match(txt, /1 sûrs? \(cause lue\)/); assert.match(txt, /Source : Wikipédia/);
            assert.ok(await card.evaluate(a => !!a.querySelector('.h-crisis-season i')), 'les mois');
            await card.evaluate(a => a.querySelector('[data-crisis-cause]').click());
            await p.waitForFunction(() => /Cause du décès notée/.test([...document.querySelectorAll('.ui-toast')].map(x => x.textContent).join(' ')), null, {timeout: 10000});
            const d = await api('historical_context'); assert.strictEqual(crisis(d, 'Choléra de 1832 à Paris').victims.find(v => v.person.id === ID.pierre).cause.from, 'noted');
            await p.evaluate(() => [...document.querySelectorAll('.ui-toast')].reverse().find(x => /Cause du décès notée/.test(x.textContent)).querySelector('button').click()); await sleep(800);
            assert.strictEqual(crisis(await api('historical_context'), 'Choléra de 1832 à Paris').victims.find(v => v.person.id === ID.pierre).cause.from, 'act', '↶ Annuler');
        });
        await t('écran : « ＋ Nouvelle crise » (sortes de crises seulement), elle apparaît ; ✎ la modifie ; 🗑 la supprime (↶ Annuler)', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'historical_context'; A.setModule('listes'); });
            await p.waitForSelector('[data-crisis-new]', {timeout: 20000});
            await p.click('[data-crisis-new]'); await p.waitForSelector('dialog[open] select[name="category"]', {timeout: 5000});
            const cats = await p.$$eval('dialog[open] select[name="category"] option', o => o.map(x => x.value));
            assert.deepStrictEqual(cats.sort(), ['crise', 'famine', 'guerre', 'hiver', 'épidémie'].sort()); assert.strictEqual(await p.inputValue('dialog[open] select[name="category"]'), 'épidémie');
            await p.fill('dialog[open] input[name="title"]', 'Dysenterie de Tulle'); await p.fill('dialog[open] input[name="from_year"]', '1832');
            await p.selectOption('dialog[open] select[name="reach"]', 'france');
            await p.evaluate(() => document.querySelector('dialog[open] form').requestSubmit());
            await p.waitForFunction(() => [...document.querySelectorAll('.h-crisis')].some(a => /Dysenterie de Tulle/.test(a.textContent)), null, {timeout: 10000});
            const own = crisis(await api('historical_context'), 'Dysenterie de Tulle'); assert.ok(own.own > 0 && own.victims.length >= 2, JSON.stringify(own).slice(0, 200));
            await p.evaluate(id => document.querySelector(`[data-crisis-edit="${id}"]`).click(), own.own); await p.waitForSelector('dialog[open] input[name="title"]', {timeout: 5000});
            assert.strictEqual(await p.inputValue('dialog[open] input[name="title"]'), 'Dysenterie de Tulle');
            await p.fill('dialog[open] input[name="title"]', 'Dysenterie de 1832'); await p.evaluate(() => document.querySelector('dialog[open] form').requestSubmit());
            await p.waitForFunction(() => [...document.querySelectorAll('.h-crisis')].some(a => /Dysenterie de 1832/.test(a.textContent)), null, {timeout: 10000});
            await p.evaluate(id => document.querySelector(`[data-crisis-del="${id}"]`).click(), own.own);
            await p.waitForFunction(() => ![...document.querySelectorAll('.h-crisis')].some(a => /Dysenterie de 1832/.test(a.textContent)), null, {timeout: 10000});
            await p.evaluate(() => [...document.querySelectorAll('.ui-toast')].reverse().find(x => /supprimé/.test(x.textContent)).querySelector('button').click());
            await p.waitForFunction(() => [...document.querySelectorAll('.h-crisis')].some(a => /Dysenterie de 1832/.test(a.textContent)), null, {timeout: 10000});
        });
        assert.deepStrictEqual(errs, [], 'erreurs JS : ' + errs.join(' | '));
    } finally { await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    console.log(fails ? `${fails} échec(s)` : 'tout est bon'); process.exit(fails ? 1 : 0);
})();
