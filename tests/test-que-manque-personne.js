#!/usr/bin/env node
/* 🔍 « Que manque-t-il ? » (Recherche) : pour qui, et un cadre par personne.   node tests/test-que-manque-personne.js
 *  1. l'API (lib/research_gaps.php) : la personne de départ choisie (Sosa comptés depuis elle), un numéro qui n'existe pas ou
 *     n'est pas un nombre → le de cujus (person_invalid), générations de 3 à 30 (au-delà : 30), « Voir les suivantes » (limit) ;
 *  2. 30 générations sur une grosse lignée (implexe compris) : rapide, une génération lue de plus, limite de personnes ;
 *  3. le navigateur : choisir une autre personne au clavier (👤 … ▾, taper, Entrée) → la liste change, Sosa depuis elle,
 *     retenue (genealogie-gaps-person), « ↺ Revenir à … » ; un cadre par personne (nom, Sosa · génération, dates, « N recherches »,
 *     une ligne par recherche, boutons à droite ; dessous à 390 px) ; la case « Un cadre par personne » (genealogie-cadres) :
 *     sans cadres, les lignes d'avant ; Réglages → 🔎 Recherche : la même case ; la fiche ⋯ → « Que manque-t-il pour lui ? » ;
 *     rien de collé (1440 / 390, clair / sombre), pas d'erreur. Capture : SHOT=fichier.png
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawnSync} = require('child_process');
const {start, newPage, settle, scan, closeDialogs} = require('./test-rien-de-colle.js');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
const root = path.join(__dirname, '..');

let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 14).join('\n  ')); } };

/* 2. une grosse lignée inventée, directement en PHP : 12 générations complètes (4095 ancêtres), un implexe, une branche de 30 générations */
function bigTree() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-qm-'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    try {
        const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$birt = (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='BIRT' ORDER BY id LIMIT 1")->fetchColumn();
$pdo->prepare("INSERT INTO places(name, county, country) VALUES('Tulle', 'Corrèze', 'France')")->execute(); $tulle = (int) $pdo->lastInsertId();
$pdo->beginTransaction();
$per = function ($s, $year) use ($pdo, $birt, $tulle) { $pdo->prepare("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES(?,?,?,'deceased')")->execute(['P' . $s, $s % 2 ? 'LACOMBE' : 'MAZAUD', $s % 2 ? 'female' : 'male']); $id = (int) $pdo->lastInsertId();
    $pdo->prepare("INSERT INTO events(scope, person_id, event_type_id, year, date_text, place_id) VALUES('person',?,?,?,?,?)")->execute([$id, $birt, $year, (string) $year, $tulle]); return $id; };
$fam = function ($a, $b, $kid) use ($pdo) { $pdo->prepare('INSERT INTO families(partner1_id, partner2_id) VALUES(?,?)')->execute([$a, $b]); $pdo->prepare('INSERT INTO family_children(family_id, child_id, position) VALUES(?,?,0)')->execute([(int) $pdo->lastInsertId(), $kid]); };
$id = [];
for ($s = 1; $s < 4096; $s++) { $g = (int) floor(log($s, 2)); $id[$s] = $per($s, 1990 - 28 * $g); }
for ($s = 1; $s < 2048; $s++) { $fam($id[2 * $s], $id[2 * $s + 1], $id[$s]); }
// implexe : 3000 (12e génération) est aussi l'enfant des parents de 1000 : 2000 et 2001 reviennent en 6000 et 6001
$pdo->prepare('INSERT INTO family_children(family_id, child_id, position) SELECT family_id, ?, 1 FROM family_children WHERE child_id=?')->execute([$id[3000], $id[1000]]);
// une branche de 18 générations de plus au-dessus de 2048 (pères seulement) : 30 générations en tout
$child = $id[2048];
for ($k = 1; $k <= 18; $k++) { $f = $per(5000 + $k, 1650 - 28 * $k); $pdo->prepare('INSERT INTO families(partner1_id) VALUES(?)')->execute([$f]); $pdo->prepare('INSERT INTO family_children(family_id, child_id, position) VALUES(?,?,0)')->execute([(int) $pdo->lastInsertId(), $child]); $child = $f; }
$pdo->exec('UPDATE persons SET is_start=1 WHERE id=' . $id[1]);
$pdo->commit();
$t0 = microtime(true); $d = research_gaps_data($pdo, ['gen' => 30]); $dt = microtime(true) - $t0;
$t1 = microtime(true); $d12 = research_gaps_data($pdo, ['gen' => 12]);
$lin = gaps_positions($pdo, $id[1], 30, 500);
$all = research_gaps_data($pdo, ['gen' => 30, 'limit' => 20000]); $maxGen = max(array_map(fn($i) => $i['generation'], $all['items']));
echo json_encode(['dt' => $dt, 'gens' => $d['generations'], 'ancestors' => $d['ancestors'], 'total' => $d['total'], 'shown' => count($d['items']), 'maxGen' => $maxGen,
    'a12' => $d12['ancestors'], 'trunc' => $lin['truncated'], 'n500' => count(array_unique($lin['positions'])), 'sosa2000' => array_values(array_unique(array_map(fn($i) => $i['sosa'], array_filter($all['items'], fn($i) => $i['person_id'] === $id[2000])))),
    'parents12' => count(array_filter(research_gaps_data($pdo, ['gen' => 12, 'limit' => 20000])['items'], fn($i) => $i['kind'] === 'parents' && $i['generation'] === 12)),
    'p2048' => count(array_filter(research_gaps_data($pdo, ['gen' => 12, 'limit' => 20000])['items'], fn($i) => $i['kind'] === 'parents' && in_array($i['person_id'], [$id[2048], $id[3000]], true)))]);
`], {cwd: root, encoding: 'utf8', env: {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: tmp, GENEALOGY_SKIP_REFERENCE: '1'}, maxBuffer: 1 << 26});
        if (r.status !== 0) throw new Error(r.stderr || r.stdout);
        return JSON.parse(r.stdout.trim().split('\n').pop());
    } finally { fs.rmSync(tmp, {recursive: true, force: true}); }
}

(async () => {
    await t('30 générations sur une grosse lignée (4 000 ancêtres, implexe) : rapide, toutes les générations, limite de personnes', async () => {
        const r = bigTree();
        assert.equal(r.gens, 30);
        assert.ok(r.dt < 8, `trop lent : ${r.dt.toFixed(2)} s`); console.log(`  (30 générations, ${r.ancestors} ancêtres : ${r.dt.toFixed(2)} s)`);
        assert.ok(r.ancestors >= 4095 + 17, 'les 4 095 de la lignée et la branche haute : ' + r.ancestors);
        assert.equal(r.maxGen, 30, 'jusqu’à la 30e génération');
        assert.equal(r.shown, Math.min(600, r.total), '600 lignes d’abord, le total à côté');
        assert.ok(r.total > 600);
        assert.ok(r.a12 < r.ancestors);
        assert.equal(r.trunc, true, 'au-delà de la limite : signalé'); assert.ok(r.n500 <= 500);
        assert.deepEqual(r.sosa2000, [2000], 'implexe : un seul numéro, le plus petit');
        assert.ok(r.parents12 > 1000, 'à 12 générations, les parents inconnus de la 12e sont proposés');
        assert.equal(r.p2048, 0, 'mais pas ceux qu’on connaît (une génération lue de plus)');
    });

    const {ID, base, browser, stop} = await start();
    const api = async (q) => (await fetch(base + 'api.php?action=research_gaps&' + new URLSearchParams(q))).json();
    try {
        await t('API : pour qui (Sosa depuis la personne choisie), numéro invalide → le de cujus, générations 3 à 30, limit', async () => {
            const d0 = await api({gen: 7});
            assert.equal(d0.root_id, ID.jean); assert.equal(d0.default_root_id, ID.jean); assert.equal(d0.root_name, 'Jean MAZAUD'); assert.equal(d0.person_invalid, false);
            const h0 = d0.items.find(i => i.person_id === ID.henri); assert.ok(h0, 'Henri DURAND dans la lignée de Jean'); assert.equal(h0.sosa, 6); assert.equal(h0.generation, 3);
            assert.ok(d0.items.some(i => i.person_id === ID.louis));
            const d1 = await api({gen: 7, person: ID.marie});
            assert.equal(d1.root_id, ID.marie); assert.equal(d1.root_name, 'Marie DURAND'); assert.equal(d1.default_root_name, 'Jean MAZAUD');
            const h1 = d1.items.find(i => i.person_id === ID.henri); assert.equal(h1.sosa, 2); assert.equal(h1.generation, 2);
            assert.equal(d1.items.find(i => i.person_id === ID.rose)?.sosa, 3);
            assert.ok(!d1.items.some(i => [ID.louis, ID.anne, ID.pierre, ID.jean].includes(i.person_id)), 'seulement la lignée de Marie');
            assert.ok(d1.ancestors < d0.ancestors);
            assert.deepEqual(d1.life[ID.henri], {birth: 1888, death: null}, 'les dates de vie pour l’en-tête du cadre');
            for (const bad of [999999, -4, 'abc', '']) { const d = await api({gen: 7, person: bad}); assert.equal(d.root_id, ID.jean, String(bad)); assert.equal(d.person_invalid, bad === 999999, String(bad)); }
            assert.equal((await api({gen: 7, person: 999999})).person_invalid, true);
            assert.equal((await api({gen: 30})).generations, 30); assert.equal((await api({gen: 99})).generations, 30); assert.equal((await api({gen: 11})).generations, 11);
            assert.equal((await api({gen: 7, limit: 1})).items.length, d0.items.length, 'limit jamais sous 600');
        });

        for (const [w, dark] of [[1440, false], [390, false], [1440, true], [390, true]]) {
            const p = await newPage(browser, base, {width: w, dark});
            const open = async () => { await closeDialogs(p); await p.evaluate(() => { const A = window.LCNDA_APP; A.state.researchKind = 'gaps'; A.setModule('recherche'); }); await p.waitForSelector('#workspace .h-gaps [data-gaps-list]', {timeout: 30000}); await settle(p); };
            const tag = `${w} px${dark ? ', sombre' : ''}`;
            if (w === 1440 && !dark) {
                await t(`choisir une autre personne au clavier → la liste change, Sosa depuis elle, retenue, « ↺ Revenir » — ${tag}`, async () => {
                    await p.evaluate(() => { localStorage.removeItem('genealogie-gaps-person'); localStorage.removeItem('genealogie-cadres'); delete window.LCNDA_APP.state.gapsView; });
                    await open();
                    assert.match(await p.textContent('#workspace .h-gaps h2'), /Jean MAZAUD/);
                    assert.ok(await p.$eval('[data-gaps-gen]', s => [...s.options].map(o => +o.value).join(',') === Array.from({length: 28}, (_, i) => i + 3).join(',')), 'générations 3 à 30, sans trou');
                    assert.equal(await p.$('[data-gaps-reset]'), null, 'pas de « Revenir » pour le de cujus');
                    await p.focus('[data-gaps-pick]'); await p.keyboard.press('Enter');
                    await p.waitForSelector('dialog.pk-dialog[open] .pk-input'); await p.keyboard.type('Marie DUR');
                    await p.waitForSelector('dialog.pk-dialog[open] .pk-item'); await p.keyboard.press('Enter');
                    await p.waitForFunction(() => /Marie DURAND/.test(document.querySelector('#workspace .h-gaps h2')?.textContent || ''), null, {timeout: 20000}); await settle(p);
                    const cards = await p.$$eval('[data-gap-person]', cs => cs.map(c => ({name: c.querySelector('.h-gap-card-name').textContent, meta: c.querySelector('.h-gap-card-head small').textContent, count: c.querySelector('[data-gap-card-count]').textContent, rows: c.querySelectorAll('.h-gap[data-gap-i]').length})));
                    const henri = cards.find(c => c.name === 'Henri DURAND'); assert.ok(henri, JSON.stringify(cards));
                    assert.match(henri.meta, /Sosa 2 · génération 2/); assert.match(henri.meta, /1888/);
                    assert.ok(!cards.some(c => /MAZAUD|Anne/.test(c.name)), 'plus la lignée de Jean');
                    for (const c of cards) assert.match(c.count, new RegExp(`^${c.rows} recherches?$`), 'le nombre = les lignes du cadre');
                    assert.equal(await p.evaluate(() => localStorage.getItem('genealogie-gaps-person')), String(ID.marie));
                    // retenue : on revient sur l'écran → toujours Marie
                    await p.evaluate(() => delete window.LCNDA_APP.state.gapsView); await open();
                    assert.match(await p.textContent('#workspace .h-gaps h2'), /Marie DURAND/);
                    assert.match(await p.textContent('[data-gaps-reset]'), /Revenir à Jean MAZAUD/);
                    // une ligne par recherche, les boutons à droite du texte
                    const lay = await p.$eval('[data-gap-person] .h-gap', a => { const who = a.querySelector('.h-gap-who').getBoundingClientRect(), act = a.querySelector('.h-gap-act').getBoundingClientRect(); return {right: act.left >= who.right - 1, sameLine: act.top < who.bottom}; });
                    assert.ok(lay.right && lay.sameLine, JSON.stringify(lay));
                    if (process.env.SHOT) await p.screenshot({path: process.env.SHOT, fullPage: false});
                    await p.focus('[data-gaps-reset]'); await p.keyboard.press('Enter');
                    await p.waitForFunction(() => /Jean MAZAUD/.test(document.querySelector('#workspace .h-gaps h2')?.textContent || '')); await settle(p);
                    assert.equal(await p.evaluate(() => localStorage.getItem('genealogie-gaps-person')), '0');
                    assert.ok(await p.$$eval('[data-gap-person]', cs => cs.some(c => /Sosa 6 · génération 3/.test(c.textContent) && /Henri DURAND/.test(c.textContent))));
                });
                await t(`la case « Un cadre par personne » (genealogie-cadres) : sans cadres, les lignes d’avant ; Réglages → 🔎 Recherche — ${tag}`, async () => {
                    await open();
                    const n = await p.$$eval('.h-gap[data-gap-i]', a => a.length);
                    await p.click('[data-gaps-frames]'); await settle(p);
                    assert.equal(await p.evaluate(() => localStorage.getItem('genealogie-cadres')), '0');
                    assert.equal(await p.$$eval('[data-gap-person]', a => a.length), 0);
                    assert.equal(await p.$$eval('.h-gap[data-gap-i]', a => a.length), n, 'les mêmes recherches');
                    assert.ok(await p.$$eval('.h-gap[data-gap-i] .h-gap-who [data-h-person]', a => a.length) > 0, 'le nom sur chaque ligne, comme avant');
                    await p.selectOption('[data-gaps-group]', 'person'); await settle(p);
                    assert.ok(await p.$$eval('.h-gaps-group h3 [data-h-person]', a => a.length) > 0, 'rangé par ancêtre : le titre d’avant');
                    await p.click('[data-gaps-frames]'); await settle(p);
                    assert.ok(await p.$$eval('[data-gap-person]', a => a.length) > 0); assert.equal(await p.$$eval('.h-gaps-group h3', a => a.length), 0, 'un cadre = le groupe');
                    await p.selectOption('[data-gaps-group]', 'archives'); await settle(p);
                    await closeDialogs(p); await p.evaluate(async () => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'recherche_fr'; await A.setModule('maintenance'); });
                    await p.waitForSelector('[data-cadres-pref]', {timeout: 20000});
                    assert.equal(await p.$eval('[data-cadres-pref]', c => c.checked), true);
                    await p.click('[data-cadres-pref] + i'); assert.equal(await p.evaluate(() => localStorage.getItem('genealogie-cadres')), '0');
                    await p.click('[data-cadres-pref] + i'); assert.equal(await p.evaluate(() => window.LCNDA_CADRES.on()), true);
                });
                await t(`la fiche, ⋯ → « Que manque-t-il pour lui ? » — ${tag}`, async () => {
                    await closeDialogs(p); await p.evaluate(i => window.LCNDA_APP.openPersonById(i), ID.pierre);
                    await p.waitForFunction(i => window.LCNDA_APP.state.currentPerson?.person?.id === i, ID.pierre, {timeout: 30000});
                    const it = await p.evaluate(() => (window.LCNDA_EXT.personMenuItems(window.LCNDA_APP.state.currentPerson) || []).find(x => x.key === 'que-manque')?.label);
                    assert.equal(it, 'Que manque-t-il pour lui ?');
                    await p.evaluate(() => window.LCNDA_EXT.personMenuItems(window.LCNDA_APP.state.currentPerson).find(x => x.key === 'que-manque').run());
                    await p.waitForFunction(() => /Pierre MAZAUD/.test(document.querySelector('#workspace .h-gaps h2')?.textContent || ''), null, {timeout: 20000}); await settle(p);
                    assert.ok(await p.$$eval('[data-gap-person]', cs => cs.some(c => /Louis MAZAUD/.test(c.textContent) && /Sosa 2 ·/.test(c.textContent))));
                    await p.click('[data-gaps-reset]'); await settle(p);
                });
            }
            await t(`cadres par personne : rien de collé, rien qui déborde ; à 390 px les boutons sous le texte — ${tag}`, async () => {
                await p.evaluate(() => { localStorage.setItem('genealogie-gaps-person', '0'); localStorage.removeItem('genealogie-cadres'); delete window.LCNDA_APP.state.gapsView; });
                await open();
                assert.ok(await p.$$eval('[data-gap-person]', a => a.length) >= 3);
                const found = await scan(p, '#workspace');
                assert.deepStrictEqual(found.map(f => `${f.bad.map(b => `${b.kind} ${b.side} ${b.gap}px`).join(', ')} — ${f.kind} « ${f.label} » (${f.item}) dans ${f.box}`), []);
                const pad = await p.$eval('.h-gap-card', c => { const s = getComputedStyle(c); return [parseFloat(s.paddingLeft), parseFloat(s.paddingTop), s.borderTopStyle]; });
                assert.ok(pad[0] >= 12 && pad[1] >= 10 && pad[2] !== 'none', 'un vrai cadre, avec sa marge : ' + pad);
                assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'pas de défilement de côté');
                if (w === 390) assert.ok(await p.$eval('[data-gap-person] .h-gap', a => a.querySelector('.h-gap-act').getBoundingClientRect().top >= a.querySelector('.h-gap-who').getBoundingClientRect().bottom - 1), 'boutons sous le texte');
                if (dark) { const bg = await p.$eval('.h-gap-card', c => getComputedStyle(c).backgroundColor); const v = (bg.match(/\d+/g) || []).slice(0, 3).map(Number); assert.ok(Math.max(...v) < 90, 'cadre sombre : ' + bg); }
            });
            assert.deepStrictEqual(p.errs, []);
            await p.context().close();
        }
    } finally { await stop(); }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
