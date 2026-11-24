#!/usr/bin/env node
/* 🏰 Lieux anciens (GOV) : lib/gov.php, assets/js/heritage-gov.js, scripts/gov/build-gov.py, .github/workflows/gov.yml.
 * Le « serveur » des données (version « gov-donnees » du dépôt) est un dossier local (GENEALOGY_TEST=1 + LCNDA_TEST_GOV_DIR) :
 * le pack d'essai (scripts/gov/make-fixture.py : lieux inventés) coupé en 2 morceaux + gov-manifest.json.
 *  1. fabrication : en-tête LCGOV1, taille, empreinte, tables, noms datés, licence et mention dans meta ;
 *  2. Réglages → 🏰 Lieux anciens (GOV) : « ⤓ Installer » → installé ; rien dans le dossier de l'app ;
 *  3. serveur : chercher « Lakomice » / « lacombsdorf » ; à quoi appartenait Lacombsdorf en 1870 et aujourd'hui ;
 *  4. fiche de Jean MAZAUD (né à Lacombsdorf en 1870) : « 🏰 en 1870 : Kirchspiel Lacombsdorf, Kreis Durandsberg, Province de Lacombie, Royaume de Durandie » ;
 *  5. page du lieu sans coordonnées (deux Lacombsdorf) : « C'est celui-ci » (↶ Annuler) ;
 *  6. « Trouver un lieu ancien » → « Ajouter ce lieu à ma base » (↶ Annuler) ; le choix d'un lieu propose la recherche GOV ;
 *  7. « 🗑 Supprimer » (↶ Annuler) ; aucune erreur JavaScript.
 *   node tests/test-gov.js */
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
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-gov-')), fx = path.join(tmp, 'fx'), site = path.join(tmp, 'site');
    [path.join(tmp, 'media'), site].forEach(d => fs.mkdirSync(d, {recursive: true}));
    const mk = spawnSync('python3', [path.join(root, 'scripts/gov/make-fixture.py'), fx], {encoding: 'utf8'});
    if (mk.status !== 0) { console.error(mk.stderr || mk.stdout); process.exit(1); }
    const buf = fs.readFileSync(path.join(fx, 'gov-pack.lcgov'));
    await t('fabrication : en-tête LCGOV1, taille et empreinte de la base', async () => {
        assert.strictEqual(buf.subarray(0, 7).toString(), 'LCGOV1\n');
        const h = JSON.parse(buf.subarray(7, 4096).toString().trim());
        const db = buf.subarray(4096);
        assert.deepStrictEqual([h.kind, h.format, h.size, h.objects], ['gov', 1, db.length, 11]);
        assert.strictEqual(h.sha256, crypto.createHash('sha256').update(db).digest('hex'));
        assert.strictEqual(db.subarray(0, 16).toString('latin1'), 'SQLite format 3\0');
    });
    await t('fabrication : noms datés, liens datés, licence et mention dans meta', async () => {
        const q = sql => spawnSync('python3', ['-I', '-c', `import sqlite3,json,sys;d=sqlite3.connect(sys.argv[1]);print(json.dumps(d.execute(sys.argv[2]).fetchall()))`, path.join(fx, 'gov.sqlite'), sql], {encoding: 'utf8'});
        const names = JSON.parse(q("SELECT n.name, n.lang, n.y1, n.y2 FROM name n JOIN obj o ON o.id=n.obj WHERE o.gov='LACORFJO70AA' ORDER BY n.name").stdout);
        assert.deepStrictEqual(names, [['Lacombsdorf', 'deu', null, 1945], ['Lakomice', 'pol', 1945, null]]);
        const rel = JSON.parse(q("SELECT p.gov, r.y1, r.y2, r.yr FROM rel r JOIN obj c ON c.id=r.child JOIN obj p ON p.id=r.parent WHERE c.gov='LACORFJO70AA' ORDER BY p.gov").stdout);
        assert.deepStrictEqual(rel, [['object_900003', null, 1945, null], ['object_900004', null, 1945, null], ['object_900006', null, null, 1880], ['object_900011', 1999, null, null]]);
        const meta = Object.fromEntries(JSON.parse(q('SELECT key, value FROM meta').stdout));
        assert.match(meta.mention, /GOV – Geschichtliches Orts-Verzeichnis \(gov\.genealogy\.net\), Verein für Computergenealogie/);
        assert.strictEqual(meta.licence_url, 'https://wiki.genealogy.net/GOV/Webservice');
        assert.strictEqual(meta.fixture, '1');
        assert.ok(JSON.parse(meta.fold_map), 'table de pliage');
    });
    // le pack coupé en 2 morceaux, comme la version GitHub
    const cut = Math.floor(buf.length / 2);
    const parts = [[0, cut], [cut, buf.length]].map(([a, b], i) => { const name = `gov-pack.lcgov.00${i}`; fs.writeFileSync(path.join(site, name), buf.subarray(a, b)); return {name, size: b - a}; });
    fs.writeFileSync(path.join(site, 'gov-manifest.json'), JSON.stringify({version: '2026-11', packs: {gov: {size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex'), zone: 'essai', built: '2026-11-24', parts}}}));

    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1', LCNDA_TEST_GOV_DIR: site};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$tag = function ($t) use ($pdo) { $s = $pdo->prepare('SELECT id FROM event_types WHERE gedcom_tag=? ORDER BY id LIMIT 1'); $s->execute([$t]); return (int) $s->fetchColumn(); };
$pl = function ($name, $country, $lat, $lon) use ($pdo) { $pdo->prepare('INSERT INTO places(name, country, latitude, longitude) VALUES(?,?,?,?)')->execute([$name, $country, $lat, $lon]); return (int) $pdo->lastInsertId(); };
$near = $pl('Lacombsdorf', 'Allemagne', 50.801, 15.602); $vague = $pl('Lacombsdorf', '', null, null); $fr = $pl('Tulle', 'France', 45.27, 1.77);
$per = function ($f, $l, $g, $evs) use ($pdo, $tag) { $pdo->prepare("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES(?,?,?,'deceased')")->execute([$f, $l, $g]); $id = (int) $pdo->lastInsertId();
    foreach ($evs as [$tg, $y, $p]) { $pdo->prepare('INSERT INTO events(scope, person_id, event_type_id, year, date_text, place_id) VALUES(\'person\',?,?,?,?,?)')->execute([$id, $tag($tg), $y, (string) $y, $p]); } return $id; };
$jean = $per('Jean', 'MAZAUD', 'male', [['BIRT', 1870, $near], ['DEAT', 1930, $fr]]);
$marie = $per('Marie', 'LACOMBE', 'female', [['BIRT', 1890, $vague]]);
$pdo->exec('UPDATE persons SET is_start=1 WHERE id=' . $jean);
echo json_encode(['jean' => $jean, 'marie' => $marie, 'near' => $near, 'vague' => $vague, 'fr' => $fr]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/jean/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
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
        await p.goto(base);
        // la page charge heritage-gov.js quand index.php a sa balise ; sinon l'essai l'ajoute
        await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf, null, {timeout: 30000});
        if (!(await p.evaluate(() => !!window.LCNDA_EXT?.gov))) { await p.addScriptTag({url: 'assets/js/heritage-gov.js'}); await p.waitForFunction(() => window.LCNDA_EXT?.gov); }
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);
        const undoLast = async re => { await p.evaluate(src => { const r = new RegExp(src); [...document.querySelectorAll('.ui-toast')].reverse().find(x => r.test(x.textContent)).querySelector('button').click(); }, re.source); await sleep(800); };

        await t('serveur : le sommaire en ligne ; rien d’installé au départ', async () => {
            const r = await api('gov_dl_info'); assert.strictEqual(r.packs.gov.size, buf.length); assert.strictEqual(r.packs.gov.parts.length, 2);
            assert.strictEqual((await api('gov_status')).installed, false);
            assert.match((await api('gov_search', {q: 'Lakomice'})).error, /pas installés/);
        });
        await t('Réglages → 🏰 Lieux anciens (GOV) : « ⤓ Installer » → installé', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; window.LCNDA_EXT.gov.register(); A.state.maintenanceTab = 'gov'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-gov-dl]', {timeout: 20000});
            assert.match(await p.textContent('[data-gov-dl]'), /Installer/);
            await p.click('[data-gov-dl]');
            await p.waitForFunction(() => /installés/.test([...document.querySelectorAll('.ui-toast')].map(x => x.textContent).join(' ')), null, {timeout: 30000});
            const st = await api('gov_status'); assert.deepStrictEqual([st.installed, st.objects, st.fixture], [true, 11, true]);
            assert.ok(fs.existsSync(path.join(tmp, 'gov', 'gov.sqlite')), 'dans le dossier des données');
            assert.ok(!fs.existsSync(path.join(root, 'data-gov')), 'rien dans le dossier de l’app');
            await p.waitForSelector('[data-gov-remove]', {timeout: 10000});
        });
        await t('serveur : chercher un ancien nom, un nom d’aujourd’hui, sans accents ni majuscules', async () => {
            const a = (await api('gov_search', {q: 'Lakomice'})).items;
            assert.deepStrictEqual([a[0].gov, a[0].name_today, a[0].lat, a[0].lon, a[0].matched_lang], ['LACORFJO70AA', 'Lakomice', 50.8, 15.6, 'polonais']);
            assert.strictEqual(a[0].url, 'https://gov.genealogy.net/item/show/LACORFJO70AA');
            const b = (await api('gov_search', {q: 'lacombsdorf'})).items.map(x => x.gov);
            assert.ok(b.includes('LACORFJO70AA') && b.includes('LACORFJN47BB'), JSON.stringify(b));
        });
        await t('serveur : à quoi appartenait Lacombsdorf en 1870, en 1885 et aujourd’hui', async () => {
            const o = await api('gov_object', {gov: 'LACORFJO70AA', year: 1870});
            assert.strictEqual(o.at.sentence, 'en 1870 : Kirchspiel Lacombsdorf, Kreis Durandsberg, Province de Lacombie, Royaume de Durandie');
            assert.deepStrictEqual(o.names.map(n => [n.name, n.lang_fr, n.from, n.to]), [['Lacombsdorf', 'allemand', null, 1945], ['Lakomice', 'polonais', 1945, null]]);
            assert.deepStrictEqual(o.postal, ['58-999']); assert.strictEqual(o.name_today, 'Lakomice');
            assert.deepStrictEqual(o.today.admin.map(x => x.name), ['Powiat durandzki', 'Mazaudie']);
            assert.strictEqual(o.today.church.length, 0, 'plus de Kirchspiel aujourd’hui');
            const o2 = await api('gov_object', {gov: 'LACORFJO70AA', year: 1885});
            assert.deepStrictEqual(o2.at.civil.map(x => x.text), ['État civil de Lacombsdorf']);
        });
        await t('fiche de Jean MAZAUD : « 🏰 en 1870 : … » sous la naissance, rien sous le décès à Tulle', async () => {
            const ev = await api('gov_events', {ids: '1,2'});
            assert.strictEqual(Object.keys(ev.events).length, 1);
            await p.evaluate(id => { const A = window.LCNDA_APP; A.state.currentPersonId = id; A.setModule('personnes'); }, ID.jean);
            await p.waitForSelector('.gov-ev', {timeout: 20000});
            assert.strictEqual((await p.$$('.gov-ev')).length, 1);
            assert.match(await p.textContent('.gov-ev'), /🏰 en 1870 : Kirchspiel Lacombsdorf, Kreis Durandsberg, Province de Lacombie, Royaume de Durandie/);
            await p.click('.gov-ev button');
            await p.waitForSelector('dialog[open] [data-gov-obj="LACORFJO70AA"]', {timeout: 10000});
            assert.match(await p.textContent('dialog[open]'), /Lakomice \(polonais, depuis 1945\)/);
            assert.match(await p.textContent('dialog[open]'), /CC BY-SA/);
            await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
        });
        const openPlace = id => p.evaluate(pid => { const A = window.LCNDA_APP; A.state.graphMode = 'place_monograph'; A.state.graphPlaceMonograph = {id: pid, name: 'Lacombsdorf', showEvents: true, showDigests: true, showBattues: true, showCemetery: true}; A.setModule('graphiques'); }, id);
        await t('page du lieu placé : « 🏰 Ce lieu dans GOV » trouvé par la position ; ✓ C’est bien ce lieu (↶ Annuler)', async () => {
            await openPlace(ID.near);
            await p.waitForSelector('[data-gov-place] [data-gov-obj]', {timeout: 20000});
            const txt = await p.textContent('[data-gov-place]');
            assert.match(txt, /Ce lieu dans GOV/); assert.match(txt, /Trouvé par le nom et la position/); assert.match(txt, /en 1870 : Kirchspiel Lacombsdorf/);
            await p.$eval('[data-gov-place] [data-gov-link]', b => b.click()); // la page de la monographie bouge encore (zoom) : clic direct
            await p.waitForFunction(() => /relié à GOV/.test([...document.querySelectorAll('.ui-toast')].map(x => x.textContent).join(' ')), null, {timeout: 10000});
            assert.strictEqual((await api('gov_place', {id: ID.near})).how, 'link');
            await undoLast(/relié à GOV/);
            assert.strictEqual((await api('gov_place', {id: ID.near})).how, 'near', '↶ Annuler');
        });
        await t('page du lieu sans coordonnées : deux Lacombsdorf → « C’est celui-ci » (↶ Annuler)', async () => {
            await openPlace(ID.vague);
            await p.waitForSelector('[data-gov-place] .gov-choice', {timeout: 20000});
            assert.strictEqual((await p.$$('[data-gov-place] .gov-choice')).length, 2);
            assert.match(await p.textContent('[data-gov-place]'), /Plusieurs lieux de GOV portent ce nom/);
            await p.$eval('[data-gov-place] [data-gov-link="LACORFJO70AA"]', b => b.click());
            await p.waitForSelector('[data-gov-place] [data-gov-obj="LACORFJO70AA"]', {timeout: 10000});
            const r = await api('gov_place', {id: ID.vague}); assert.deepStrictEqual([r.how, r.year, r.object.at.sentence.slice(0, 7)], ['link', 1890, 'en 1890']);
            assert.ok(Object.values((await api('gov_events', {ids: '3'})).events).length === 1, 'l’événement de Marie LACOMBE suit le lien');
            await undoLast(/relié à GOV/);
            assert.strictEqual((await api('gov_place', {id: ID.vague})).how, 'choose', '↶ Annuler');
        });
        await t('« Trouver un lieu ancien » → « ＋ Ajouter ce lieu à ma base » (↶ Annuler)', async () => {
            await p.evaluate(() => window.LCNDA_EXT.gov.openSearch('Lakomice'));
            await p.waitForSelector('dialog[open] [data-gov-hit="LACORFJO70AA"]', {timeout: 10000});
            assert.match(await p.textContent('dialog[open] [data-gov-hit]'), /Lakomice.*Trouvé par « Lakomice » \(polonais\).*Powiat durandzki, Mazaudie/s);
            assert.strictEqual(await p.getAttribute('dialog[open] [data-gov-hit] a', 'href'), 'https://gov.genealogy.net/item/show/LACORFJO70AA');
            await p.click('dialog[open] [data-gov-hit] [data-gov-add]');
            await p.waitForFunction(() => /ajouté à ta base/.test([...document.querySelectorAll('.ui-toast')].map(x => x.textContent).join(' ')), null, {timeout: 10000});
            const rows = spawnSync('python3', ['-I', '-c', `import sqlite3,json,sys;d=sqlite3.connect(sys.argv[1]);print(json.dumps(d.execute("SELECT name,country,alternate_names,latitude,longitude FROM places WHERE name='Lakomice'").fetchall()))`, path.join(tmp, 'genealogy.sqlite')], {encoding: 'utf8'});
            assert.deepStrictEqual(JSON.parse(rows.stdout), [['Lakomice', 'Mazaudie', 'Lacombsdorf', 50.8, 15.6]]);
            await undoLast(/ajouté à ta base/);
            const after = spawnSync('python3', ['-I', '-c', `import sqlite3,sys;d=sqlite3.connect(sys.argv[1]);print(d.execute("SELECT count(*) FROM places WHERE name='Lakomice'").fetchone()[0])`, path.join(tmp, 'genealogy.sqlite')], {encoding: 'utf8'});
            assert.strictEqual(after.stdout.trim(), '0', '↶ Annuler');
            await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
        });
        await t('serveur : un identifiant GOV mal formé est refusé ; le lieu d’un événement n’est pas effacé par ↶', async () => {
            assert.ok((await post('gov_place_link', {place_id: ID.near, gov: '../x'})).error);
            assert.match((await post('gov_place_add_undo', {place_id: ID.near})).error, /sert déjà/);
        });
        await t('choix d’un lieu : « 🏰 Chercher … dans les lieux anciens (GOV) »', async () => {
            // un menu de lieux tel que app-picker.js le dessine (champ 📍, liste ouverte)
            await p.evaluate(() => {
                const d = document.createElement('div'); d.innerHTML = '<div class="pk-search"><div class="pk-box"><span class="pk-ico">📍</span><input class="pk-input" value="Lakom"></div><div class="pk-list" role="listbox" hidden></div></div>';
                document.body.appendChild(d); const l = d.querySelector('.pk-list'); l.innerHTML = '<div class="pk-empty">x</div>'; l.hidden = false; window.__govPk = d; });
            await p.waitForSelector('.pk-list [data-gov-pk]', {timeout: 5000});
            await p.click('.pk-list [data-gov-pk]');
            await p.waitForSelector('dialog[open] [data-gov-hit="LACORFJO70AA"]', {timeout: 10000});
            await p.evaluate(() => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); window.__govPk.remove(); });
        });
        await t('« 🗑 Supprimer » puis ↶ Annuler ; « À propos des données »', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'gov'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-gov-remove]', {timeout: 20000});
            await p.click('[data-gov-remove]');
            await p.waitForFunction(() => /supprimés/.test([...document.querySelectorAll('.ui-toast')].map(x => x.textContent).join(' ')), null, {timeout: 10000});
            assert.strictEqual((await api('gov_status')).installed, false);
            await undoLast(/supprimés/);
            assert.strictEqual((await api('gov_status')).installed, true, '↶ Annuler');
            await p.evaluate(() => window.LCNDA_EXT.gov.openAbout());
            await p.waitForSelector('dialog[open] a[href="https://wiki.genealogy.net/GOV/Webservice"]', {timeout: 10000});
            assert.match(await p.textContent('dialog[open]'), /Verein für Computergenealogie/);
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally { await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    console.log(fails ? `${fails} essai(s) en échec` : 'Les lieux anciens (GOV) marchent.');
    process.exit(fails ? 1 : 0);
})();
