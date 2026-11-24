#!/usr/bin/env node
/* 🗳 Élections d'autrefois (lib/elections.php, assets/js/heritage-elections.js, scripts/elections/, .github/workflows/elections.yml).
 * Le « serveur » des données (la version « elections-donnees » du dépôt) est un dossier local (GENEALOGY_TEST=1 + LCNDA_TEST_ELECTIONS_DIR) :
 * le pack d'essai (scripts/elections/make-fixture.py, chiffres inventés) coupé en 3 morceaux + elections-manifest.json.
 *  1. éteint au départ : aucun bloc, rien dans la liste des blocs ; seule la page de Réglages existe ;
 *  2. Réglages → 🗳 Élections d'autrefois : « ⤓ Installer » → vérifié, rangé (↶ Annuler) ; reprise d'un téléchargement ;
 *  3. allumé : le bloc « 🗳 Comment votait sa commune » (À Tulle, 62 % votent républicain) ; une femme avant 1945 ;
 *  4. profil « Homme / femme politique » : l'élection trouvée sous son nom s'ajoute au profil « à vérifier », ↶ Annuler la retire ;
 *  5. éteint de nouveau : plus rien.
 *   node tests/test-elections.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const {spawn, spawnSync} = require('child_process');
let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
const root = path.join(__dirname, '..');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-elections-')), fx = path.join(tmp, 'fx'), site = path.join(tmp, 'site');
    [path.join(tmp, 'media'), site].forEach(d => fs.mkdirSync(d, {recursive: true}));
    const mk = spawnSync('python3', [path.join(root, 'scripts/elections/make-fixture.py'), fx], {encoding: 'utf8'});
    if (mk.status !== 0) { console.error(mk.stderr || mk.stdout); process.exit(1); }
    const buf = fs.readFileSync(path.join(fx, 'elections.sqlite')), cut = [0, Math.floor(buf.length / 3), Math.floor(buf.length * 0.8), buf.length];
    const parts = [0, 1, 2].map(i => { const name = `elections.sqlite.00${i}`; fs.writeFileSync(path.join(site, name), buf.subarray(cut[i], cut[i + 1])); return {name, size: cut[i + 1] - cut[i]}; });
    fs.writeFileSync(path.join(site, 'elections-manifest.json'), JSON.stringify({version: '2026-11', packs: {elections: {size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex'), built: '2026-11-24', parts}}}));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1', LCNDA_TEST_ELECTIONS_DIR: site};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','MAZAUD','male','deceased',1),(2,'Marie','LAFON','female','deceased',0)");
$pdo->exec("INSERT INTO places(id,name,county,country,admin2_code,admin4_code) VALUES(1,'Tulle','Corrèze','France','19','19272'),(2,'Lectoure','Gers','France','32','')");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$ev = $pdo->prepare('INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES(?,?,?,?,?,?)');
$ev->execute(['person', 1, $t('BIRT'), '1830', 1830, 1]); $ev->execute(['person', 1, $t('DEAT'), '1900', 1900, 1]);
$ev->execute(['person', 2, $t('BIRT'), '1880', 1880, 2]); $ev->execute(['person', 2, $t('DEAT'), '1970', 1970, 2]);
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
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP.defaultMaintenanceTabs, null, {timeout: 30000});
        // pas encore branché dans index.php : on charge le fichier comme le ferait la page
        if (!(await p.evaluate(() => !!window.LCNDA_EXT?.elections))) await p.addScriptTag({url: 'assets/js/heritage-elections.js'});
        await p.waitForFunction(() => window.LCNDA_EXT?.elections);
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);
        const openPerson = async id => { await p.evaluate(i => window.LCNDA_APP.openPersonById(i), id); await p.waitForSelector('.person-page', {timeout: 20000}); await sleep(600); };
        const toastClick = async re => { await p.waitForFunction(r => [...document.querySelectorAll('.ui-toast')].some(x => new RegExp(r).test(x.textContent)), re, {timeout: 30000}); await p.evaluate(r => [...document.querySelectorAll('.ui-toast')].reverse().find(x => new RegExp(r).test(x.textContent)).querySelector('button').click(), re); await sleep(800); };

        await t('éteint au départ : aucun bloc, rien dans la liste des blocs ; le serveur répond (pas installé)', async () => {
            assert.strictEqual(await p.evaluate(() => window.LCNDA_EXT.elections.isOn()), false);
            assert.ok(!(await p.evaluate(() => window.LCNDA_APP.defaultPersonBlocks.some(b => b[0] === 'elections'))), 'pas dans la liste des blocs');
            assert.ok(await p.evaluate(() => window.LCNDA_APP.defaultMaintenanceTabs.some(b => b[0] === 'elections')), 'la page des Réglages existe');
            await openPerson(1);
            assert.strictEqual(await p.$$eval('[data-pblock="elections"], [data-el-person]', l => l.length), 0);
            assert.ok(!/Comment votait/.test(await p.textContent('#workspace')));
            assert.strictEqual((await api('elections_status')).installed, false);
            assert.strictEqual((await api('elections_person', {id: 1})).installed, false);
        });
        await t('serveur : le sommaire en ligne ; par tranches, reprendre, abandonner', async () => {
            const r = await api('elections_dl_info'); assert.strictEqual(r.pack.size, buf.length); assert.strictEqual(r.pack.parts.length, 3);
            const s = await post('elections_dl_start', {}); assert.ok(s.id, JSON.stringify(s));
            const a = await post('elections_dl_step', {id: s.id}); assert.strictEqual(a.received, parts[0].size, 'le 1er morceau');
            const z = await api('elections_dl_resume', {id: s.id}); assert.deepStrictEqual([z.exists, z.received], [true, parts[0].size]);
            assert.match((await post('elections_dl_finish', {id: s.id})).error || '', /incomplet/, 'un pack incomplet n’est pas installé');
            assert.strictEqual((await api('elections_dl_resume', {id: s.id})).exists, false);
        });
        await t('Réglages → 🗳 Élections d’autrefois : l’interrupteur est éteint ; « ⤓ Installer » → installé et vérifié ; ↶ Annuler le retire', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'elections'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-el-dl]', {timeout: 20000});
            assert.strictEqual(await p.$eval('[data-el-on]', x => x.checked), false);
            await p.click('[data-el-dl]');
            await toastClick('installées');
            assert.strictEqual((await api('elections_status')).installed, false, '↶ Annuler');
            await p.waitForSelector('[data-el-dl]', {timeout: 20000}); await p.click('[data-el-dl]');
            await p.waitForFunction(() => /installées/.test([...document.querySelectorAll('.ui-toast')].map(x => x.textContent).join(' ')), null, {timeout: 30000});
            await sleep(500);
            const st = await api('elections_status'); assert.strictEqual(st.installed, true); assert.strictEqual(st.elections, 4); assert.ok(st.fixture);
            assert.ok(fs.existsSync(path.join(tmp, 'elections', 'elections.sqlite')), 'dans le dossier des données');
            assert.match(await p.textContent('.el-set'), /Julia Cagé et Thomas Piketty/);
        });
        await t('éteint mais installé : toujours rien sur la fiche', async () => {
            await openPerson(1);
            assert.strictEqual(await p.$$eval('[data-el-person]', l => l.length), 0);
        });
        await t('allumé : le bloc « 🗳 Comment votait sa commune » — À Tulle, 62 % votent républicain en 1877', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'elections'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-el-on]'); await p.click('label:has([data-el-on])');
            await sleep(300);
            assert.strictEqual(await p.evaluate(() => window.LCNDA_EXT.elections.isOn()), true);
            assert.ok(await p.evaluate(() => window.LCNDA_APP.defaultPersonBlocks.some(b => b[0] === 'elections')));
            await openPerson(1);
            await p.waitForSelector('[data-el-person] .el-row', {timeout: 20000});
            const txt = await p.textContent('[data-pblock="elections"]');
            assert.match(txt, /Comment votait sa commune/);
            assert.match(txt, /À Tulle, 62 % votent républicain en 1877/);
            assert.ok(!/1848|1936|1965/.test(txt), 'seulement pendant sa vie d’adulte (18 ans en 1848 : trop jeune ; mort en 1900)');
            assert.ok(!/Ajouter au profil/.test(txt), 'pas de profil politique : pas de proposition');
        });
        await t('une femme avant 1945 : « Elle ne votait pas encore » (commune trouvée par son nom)', async () => {
            await openPerson(2);
            await p.waitForSelector('[data-el-person] .el-row', {timeout: 20000});
            const txt = await p.textContent('[data-pblock="elections"]');
            assert.match(txt, /Lectoure/); assert.match(txt, /1936/); assert.match(txt, /Elle ne votait pas encore/); assert.match(txt, /1965/);
        });
        await t('profil « Homme / femme politique » : l’élection trouvée sous son nom → ajoutée « à vérifier » ; ↶ Annuler la retire', async () => {
            assert.strictEqual((await post('art_write', {op: 'set_profile', person_id: 1, profile: 'politic', on: 1})).ok, true);
            await openPerson(1);
            await p.waitForSelector('[data-el-add]', {timeout: 20000});
            assert.match(await p.textContent('.el-prop'), /Législatives 1877 : élu député/);
            await p.click('[data-el-add]');
            await p.waitForFunction(() => /Ajouté au profil/.test([...document.querySelectorAll('.ui-toast')].map(x => x.textContent).join(' ')), null, {timeout: 20000});
            let b = await api('art', {op: 'boot', person_id: 1});
            const it = b.items.find(i => i.type_key === 'pol_election' || i.kind === 'pol_election');
            assert.ok(it, JSON.stringify(b.items));
            assert.match(it.title, /Législatives 1877 \(à vérifier\)/);
            assert.ok(!(await p.$('[data-el-add]')), 'la proposition ajoutée disparaît');
            await toastClick('Ajouté au profil');
            b = await api('art', {op: 'boot', person_id: 1});
            assert.ok(!b.items.some(i => i.type_key === 'pol_election' || i.kind === 'pol_election'), '↶ Annuler');
        });
        await t('éteint de nouveau : plus de bloc', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'elections'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-el-on]'); await p.click('label:has([data-el-on])'); await sleep(300);
            assert.strictEqual(await p.evaluate(() => window.LCNDA_EXT.elections.isOn()), false);
            await openPerson(1);
            assert.strictEqual(await p.$$eval('[data-el-person]', l => l.length), 0);
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally { await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    console.log(fails ? `${fails} essai(s) en échec` : 'Les élections d’autrefois marchent.');
    process.exit(fails ? 1 : 0);
})();
