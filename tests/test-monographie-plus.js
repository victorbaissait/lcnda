#!/usr/bin/env node
/* 📜 Monographie de commune plus complète et à ranger soi-même (assets/js/heritage-monographie-plus.js, assets/css/monographie-plus.css ;
 * app-graphiques.js l'appelle, heritage-tabs.js prend sa liste de parties ; lib/histoire.php hist_place&from&to ; lib/elections.php elections_place).
 * Base temporaire, familles inventées MAZAUD, LACOMBE, DURAND à Tulle.
 *  1. serveur : hist_place et elections_place répondent sans pack (installed: false) ; lieu inconnu → erreur ;
 *  2. écran : parties ajoutées (la famille ici, noms, métiers, carte, où chercher) dessinées quand elles arrivent à l'écran, avec leur source ;
 *     parties vides passées (battues, histoire sans pack) ; ⚙︎ Personnaliser : masquer (grisé, ↶ Annuler), ↑ ↓, glisser, « seulement pour
 *     cette commune », ↶ Réinitialiser ; le registre (une partie ajoutée par un autre fichier, une partie vide) ; l'export suit l'ordre ;
 *     un écran d'onglet garde son organisation ; heritage-tabs voit toutes les parties ; aucune erreur.
 *   node tests/test-monographie-plus.js */
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
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-mp-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$tag = function ($t) use ($pdo) { $s = $pdo->prepare('SELECT id FROM event_types WHERE gedcom_tag=? ORDER BY id LIMIT 1'); $s->execute([$t]); return (int) $s->fetchColumn(); };
$pdo->prepare('INSERT INTO places(name, county, state, country, admin4_code, latitude, longitude) VALUES(?,?,?,?,?,?,?)')->execute(['Tulle', 'Corrèze', 'Nouvelle-Aquitaine', 'France', '19272', 45.2658, 1.7722]); $tul = (int) $pdo->lastInsertId();
$people = [['Pierre','MAZAUD','male',1820,1880,'cloutier'], ['Marie','LACOMBE','female',1825,1890,''], ['Jean','MAZAUD','male',1850,1915,'armurier'], ['Louise','DURAND','female',1855,1930,'dentellière'], ['Paul','MAZAUD','male',1880,1950,'armurier']];
$ids = [];
foreach ($people as [$f, $l, $g, $b, $d, $job]) {
    $pdo->prepare("INSERT INTO persons(first_name,last_name,gender,living_status,is_start) VALUES(?,?,?,'deceased',?)")->execute([$f, $l, $g, $ids ? 0 : 1]); $id = (int) $pdo->lastInsertId(); $ids[] = $id;
    $pdo->prepare("INSERT INTO events(scope, person_id, event_type_id, year, date_text, place_id) VALUES('person',?,?,?,?,?)")->execute([$id, $tag('BIRT'), $b, "12 mars $b", $tul]);
    $pdo->prepare("INSERT INTO events(scope, person_id, event_type_id, year, date_text, place_id) VALUES('person',?,?,?,?,?)")->execute([$id, $tag('DEAT'), $d, "3 juin $d", $tul]);
    if ($job) { $pdo->prepare("INSERT INTO events(scope, person_id, event_type_id, year, date_text, place_id, title) VALUES('person',?,?,?,?,?,?)")->execute([$id, $tag('OCCU'), $b + 25, (string) ($b + 25), $tul, $job]); }
}
$pdo->prepare('INSERT INTO families(partner1_id, partner2_id) VALUES(?,?)')->execute([$ids[0], $ids[1]]); $fam = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO events(scope, family_id, event_type_id, year, date_text, place_id) VALUES('family',?,?,1845,'20 mai 1845',?)")->execute([$fam, $tag('MARR'), $tul]);
echo json_encode(['tul' => $tul, 'ids' => $ids]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"tul"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const ID = JSON.parse(seed.stdout.trim().split('\n').pop());
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
        await ctx.route(u => !u.href.startsWith(base), r => r.abort()); // pas d'internet (tuiles de carte)
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf, null, {timeout: 30000});
        // tant que index.php ne les charge pas : la feuille de style et le script
        if (!(await p.evaluate(() => !!window.LCNDA_EXT?.monographiePlus))) {
            await p.addStyleTag({url: 'assets/css/monographie-plus.css'}); await p.addScriptTag({url: 'assets/js/heritage-monographie-plus.js'});
        }
        await p.waitForFunction(() => window.LCNDA_EXT?.monographiePlus, null, {timeout: 10000});
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).then(r => r.result || r).catch(e => ({error: e.message})), [x, q]);

        await t('serveur : histoire du lieu et élections d’une commune, sans pack : « pas installé » ; lieu inconnu : erreur', async () => {
            const h = await api('hist_place', {id: ID.tul, from: 1820, to: 1950}); assert.strictEqual(h.installed, false, JSON.stringify(h));
            const e = await api('elections_place', {id: ID.tul}); assert.strictEqual(e.installed, false, JSON.stringify(e));
            const bad = await api('hist_place', {id: 999999}); assert.ok(bad.error, JSON.stringify(bad));
        });

        const open = () => p.evaluate(id => { const A = window.LCNDA_APP; A.state.graphPlaceMonograph = {...(A.state.graphPlaceMonograph || {}), id, name: 'Tulle', county: 'Corrèze', showEvents: true, showDigests: true, showBattues: true, showCemetery: true}; A.state.graphMode = 'place_monograph'; A.setModule('graphiques'); }, ID.tul);
        await p.evaluate(() => { localStorage.removeItem('genealogie-monographie-parties'); localStorage.removeItem('genealogie-monographie-lieux'); });
        await open();
        await p.waitForSelector('.place-monograph-sections[data-mp-mounted] [data-mp="family"]');
        const sec = id => `.place-monograph-sections > [data-mp="${id}"]`;
        const ids = () => p.evaluate(() => [...document.querySelectorAll('.place-monograph-sections > *')].filter(el => !el.hidden).map(el => el.dataset.mp || (el.className.match(/is-(\w+)/) || [])[1] || el.className.split(' ')[0]));

        await t('écran : les parties ajoutées se dessinent en arrivant à l’écran, avec leur source ; les vides sont passées', async () => {
            for (const id of ['family', 'surnames', 'jobs', 'search']) {
                await p.locator(sec(id)).scrollIntoViewIfNeeded();
                await p.waitForSelector(`${sec(id)}[data-mp-state="done"]`, {timeout: 15000});
            }
            const fam = await p.textContent(sec('family'));
            assert.match(fam, /5 personnes de ta famille ont vécu ici/); assert.match(fam, /de 1820 à 1950/); assert.match(fam, /Source : ta généalogie/);
            assert.match(await p.textContent(sec('surnames')), /MAZAUD/); assert.match(await p.textContent(sec('surnames')), /LACOMBE/);
            assert.match(await p.textContent(sec('jobs')), /armurier/);
            assert.match(await p.textContent(sec('search')), /Archives|registres/i);
            await p.locator(sec('minimap')).scrollIntoViewIfNeeded(); await p.waitForSelector(`${sec('minimap')}[data-mp-state="done"] .h-village-pin`);
            // histoire du lieu (pas de pack), élections (éteintes), mouvements (aucun) : rien → passées
            await p.evaluate(() => window.LCNDA_EXT.monographiePlus.renderAll());
            assert.strictEqual(await p.locator(`${sec('histoire')}`).isHidden(), true);
            assert.strictEqual(await p.locator(sec('elections')).count(), 0, 'élections éteintes : pas de partie');
            assert.strictEqual(await p.locator('.place-monograph-section.is-battues').isHidden(), true, '0 battue : passée');
            assert.strictEqual(await p.locator('.place-monograph-section.is-events').isVisible(), true);
        });

        await t('⚙︎ Personnaliser : masquer une partie (grisée, toujours dans la liste), ↶ Annuler la remet', async () => {
            await p.click('[data-mp-custom]'); await p.waitForSelector('.mp-panel [data-mp-order]');
            assert.ok(await p.locator('.mp-panel li[data-k="battues"] small').textContent().then(x => /rien pour cette commune/.test(x)));
            await p.uncheck('.mp-panel li[data-k="surnames"] [data-mp-show]');
            assert.strictEqual(await p.locator(sec('surnames')).isHidden(), true);
            assert.ok(await p.locator('.mp-panel li[data-k="surnames"].is-off').count());
            const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-monographie-parties')));
            assert.deepStrictEqual(saved.hidden, ['surnames']);
            await p.click('.toast button:has-text("Annuler"), .ui-toast button:has-text("Annuler"), button:has-text("↶ Annuler")', {timeout: 5000});
            await p.waitForFunction(() => !document.querySelector('.place-monograph-sections > [data-mp="surnames"]').hidden);
            assert.ok(!(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-monographie-parties') || '{"hidden":[]}').hidden.includes('surnames'))));
        });

        await t('⚙︎ ↑ ↓ et glisser : l’ordre de la page change, il est retenu', async () => {
            const before = await ids(); const i = before.indexOf('family');
            await p.click('.mp-panel li[data-k="family"] [data-mp-move="-1"]');
            const after = await ids(); assert.strictEqual(after.indexOf('family'), i - 1, after.join(','));
            // glisser « Où chercher » tout en haut de la liste
            await p.locator('.mp-panel li[data-k="search"]').dragTo(p.locator('.mp-panel [data-mp-order] li').first(), {targetPosition: {x: 20, y: 2}});
            await p.waitForFunction(() => document.querySelector('.place-monograph-sections > *:not([hidden])')?.dataset.mp === 'search', null, {timeout: 5000});
            const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-monographie-parties')));
            assert.ok(saved.order.indexOf('search') < saved.order.indexOf('events'), saved.order.join(','));
            // rouvrir la monographie : même ordre
            await open(); await p.waitForSelector('.place-monograph-sections[data-mp-mounted] [data-mp="family"]');
            assert.strictEqual((await ids())[0], 'search');
        });

        await t('⚙︎ seulement pour cette commune, puis ↶ Réinitialiser (↶ Annuler)', async () => {
            if (!(await p.locator('.mp-panel').count())) await p.click('[data-mp-custom]');
            await p.check('.mp-panel [data-mp-local]');
            await p.uncheck('.mp-panel li[data-k="jobs"] [data-mp-show]');
            await sleep(100);
            const st = await p.evaluate(() => ({g: JSON.parse(localStorage.getItem('genealogie-monographie-parties')), l: JSON.parse(localStorage.getItem('genealogie-monographie-lieux'))}));
            assert.ok(st.l[String(ID.tul)].hidden.includes('jobs')); assert.ok(!st.g.hidden.includes('jobs'), 'les autres communes ne changent pas');
            assert.strictEqual(await p.locator(sec('jobs')).isHidden(), true);
            await p.uncheck('.mp-panel [data-mp-local]');
            assert.strictEqual(await p.locator(sec('jobs')).isHidden(), false);
            await sleep(1200);
            await p.click('.mp-panel [data-mp-reset]');
            assert.strictEqual(await p.evaluate(() => localStorage.getItem('genealogie-monographie-parties')), null);
            assert.strictEqual((await ids())[0], 'events', 'ordre de départ');
            await p.click('button:has-text("↶ Annuler")', {timeout: 5000});
            await p.waitForFunction(() => document.querySelector('.place-monograph-sections > *:not([hidden])')?.dataset.mp === 'search');
        });

        await t('registre : une partie d’un autre fichier arrive (avec sa source), une partie vide est passée ; heritage-tabs la voit', async () => {
            await p.evaluate(() => {
                const R = window.LCNDA_EXT.monographSections;
                R.push({id: 'essai', icon: '⛏️', label: 'Mines et usines (essai)', group: 'Le lieu', source: 'BRGM (essai)', render: async (place, host) => { host.innerHTML = `<p>Mine près de ${place.name}</p>`; return true; }});
                R.push({id: 'vide', icon: '🌳', label: 'Arbres (essai)', render: async () => false});
            });
            await p.evaluate(() => window.LCNDA_EXT.monographiePlus.renderAll());
            await p.waitForSelector(`${sec('essai')}[data-mp-state="done"]`);
            assert.match(await p.textContent(sec('essai')), /Mine près de Tulle[\s\S]*Source : BRGM \(essai\)/);
            assert.strictEqual(await p.locator(sec('vide')).isHidden(), true);
            assert.ok(await p.locator('.mp-panel li[data-k="vide"]').count(), 'une partie vide reste dans la liste');
            const list = await p.evaluate(() => window.LCNDA_EXT.monographSectionList().map(x => x[0]));
            for (const k of ['filters', 'metrics', 'events', 'family', 'essai', 'postcards']) assert.ok(list.includes(k), k);
        });

        await t('impression et export : tout est dessiné, dans l’ordre choisi, sans les parties masquées ni le panneau', async () => {
            await p.uncheck('.mp-panel li[data-k="jobs"] [data-mp-show]');
            const r = await p.evaluate(() => {
                const st = document.querySelector('.place-monograph-stage').cloneNode(true);
                st.querySelectorAll('.no-export').forEach(n => n.remove());
                const shown = [...st.querySelectorAll('.place-monograph-sections > *')].filter(el => !el.hidden).map(el => el.dataset.mp || el.className);
                return {shown, panel: !!st.querySelector('.mp-panel'), wait: document.querySelectorAll('.mp-sec[data-mp-state="wait"]:not([hidden])').length};
            });
            assert.strictEqual(r.panel, false); assert.strictEqual(r.wait, 0); assert.strictEqual(r.shown[0], 'search'); assert.ok(!r.shown.includes('jobs'));
        });

        await t('un écran d’onglet garde l’organisation de son onglet (le panneau le dit, sans rien changer)', async () => {
            await p.evaluate(() => { window.LCNDA_SCREEN_LAYOUT = {kind: 'monograph', order: ['filters', 'metrics', 'jobs', 'events'], hidden: ['family']}; });
            await open(); await p.waitForSelector('.place-monograph-sections[data-mp-mounted] [data-mp="family"]');
            const o = await ids(); assert.strictEqual(o[0], 'jobs'); assert.ok(!o.includes('family'));
            await p.click('[data-mp-custom]'); assert.match(await p.textContent('.mp-panel'), /propre organisation/);
            assert.strictEqual(await p.locator('.mp-panel [data-mp-show]:not([disabled])').count(), 0);
            await p.evaluate(() => { delete window.LCNDA_SCREEN_LAYOUT; });
        });

        await t('téléphone : le panneau tient dans l’écran, pas de défilement de côté', async () => {
            await p.setViewportSize({width: 390, height: 800});
            await open(); await p.waitForSelector('.place-monograph-sections[data-mp-mounted]');
            await p.click('[data-mp-custom]'); await p.waitForSelector('.mp-panel');
            const w = await p.evaluate(() => document.querySelector('.mp-panel').getBoundingClientRect().right);
            assert.ok(w <= 392, String(w));
        });

        await t('aucune erreur dans la page', async () => assert.deepStrictEqual(errs, []));
    } finally {
        await browser.close(); proc.kill();
        fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `${fails} échec(s)` : 'Tout est bon.');
    process.exit(fails ? 1 : 0);
})();
