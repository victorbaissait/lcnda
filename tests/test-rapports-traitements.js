#!/usr/bin/env node
/* 📊 Mes rapports et 🧰 Traitements en lot (lib/rapports_traitements.php, assets/js/heritage-rapports.js, assets/css/rapports.css).
 *  0. Node : tri, groupes, moyennes ; le rapport est échappé (aucun HTML exécuté) ; CSV sans formule ; vérification d'un fichier piégé ;
 *  1. serveur : les lignes d'un rapport (colonnes de « Mes listes » + colonnes de rapport), vivants et fiches 🔒 retirés (mode
 *     confidentialité compris) ; un .lcnda-rapport exporté puis importé ; des fichiers piégés (HTML, script, clé inconnue) refusés sans
 *     rien écrire ; un traitement en lot : aperçu = ce qui sera écrit, lignes décochées laissées, fiche verrouillée laissée, copie de
 *     la base faite avant, journal ; ↶ remet tout EXACTEMENT (même les lieux fusionnés), ↷ refait ; une case retouchée depuis n'est
 *     pas écrasée ;
 *  2. écran : Listes → Outils de modification → 📊 Mes rapports (modèle « Décès par commune », aperçu, 🖨 impression, CSV, HTML,
 *     enregistrer) ; « 🖨 En faire un rapport » depuis une de « Mes listes » ; 🧰 Traitements en lot (recette de deux gestes, aperçu,
 *     décocher, appliquer, ↶ Annuler du message) ; 390 px ; aucune erreur JavaScript.
 *   node tests/test-rapports-traitements.js        (RT_SHOTS=dossier pour garder des captures) */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const {spawn, spawnSync} = require('child_process');
const root = path.join(__dirname, '..');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const R = require('../assets/js/heritage-rapports.js');

(async () => {
    /* ═════════ 0. Node ═════════ */
    const rows = [
        {key: 'p:1', people: [{id: 1, name: 'Jean MAZAUD'}], year: 1801, cells: {name: 'Jean MAZAUD', birth: 'vers 1801', birth_year: '1801', age: '65 ans', commune: 'Naves', sources: '0', sosa: '4'}},
        {key: 'p:2', people: [{id: 2, name: 'Pierre MAZAUD'}], year: 1772, cells: {name: 'Pierre MAZAUD', birth: '1772', birth_year: '1772', age: '67 ans', commune: 'Naves', sources: '2', sosa: '8'}},
        {key: 'p:3', people: [{id: 3, name: 'Marie LACOMBE'}], year: 1776, cells: {name: 'Marie LACOMBE', birth: '1776', birth_year: '1776', age: '75 ans', commune: 'Tulle', sources: '1', sosa: '9'}},
        {key: 'p:4', people: [{id: 4, name: 'Anne <b>DURAND</b>'}], year: null, cells: {name: 'Anne <b>DURAND</b>', birth: '', age: '', commune: '', sources: '0', sosa: '12'}},
    ];
    await t('Node : regrouper par commune, trier par naissance, âge moyen par groupe et total', async () => {
        const def = {source: 'persons', columns: ['sosa', 'name', 'birth', 'age'], sort: [{col: 'birth', dir: 'asc'}], group: {col: 'commune', agg: {col: 'age', fn: 'avg'}}};
        const r = R.buildReport(def, rows);
        assert.deepStrictEqual(r.groups.map(g => g.label), ['Naves', 'Tulle', ''], 'les cases vides à la fin');
        const naves = r.groups.find(g => g.label === 'Naves');
        assert.deepStrictEqual(naves.rows.map(x => x.key), ['p:2', 'p:1'], 'naissance croissante');
        assert.strictEqual(naves.agg, 66); assert.strictEqual(r.total, 4); assert.strictEqual(r.agg, (65 + 67 + 75) / 3);
        assert.strictEqual(R.aggregate([1, 9, 3], 'median'), 3); assert.strictEqual(R.aggregate([], 'avg'), null);
        const bySosa = R.buildReport({source: 'persons', sort: [{col: 'sosa', dir: 'desc'}]}, rows);
        assert.deepStrictEqual(bySosa.rows.map(x => x.cells.sosa), ['12', '9', '8', '4'], 'Sosa en nombres, pas en texte');
    });
    await t('Node : le rapport est du texte (aucun HTML exécuté), les noms deviennent des liens dans le fichier HTML', async () => {
        const def = {source: 'persons', columns: ['name', 'birth'], layout: {title: '<img src=x onerror=alert(1)>', footer: '<script>alert(2)</script>', color_nosource: true}};
        const doc = R.reportDoc(def, {rows}, {columns: {name: 'Personne', birth: 'Naissance'}, appUrl: 'http://127.0.0.1/'});
        assert.ok(!/<script|<img|<b>/i.test(doc), 'aucune balise venue des données');
        assert.match(doc, /&lt;img src=x onerror=alert\(1\)&gt;/); assert.match(doc, /Anne &lt;b&gt;DURAND&lt;\/b&gt;/);
        assert.match(doc, /<a href="http:\/\/127\.0\.0\.1\/#personnes\/1">Jean MAZAUD<\/a>/);
        assert.match(doc, /class="rt-nosrc"/, 'lignes sans source colorées');
        assert.match(doc, /@page\{size:A4 portrait/);
    });
    await t('Node : CSV (point-virgule, BOM) sans formule glissée', async () => {
        const csv = R.reportCsv({source: 'persons', columns: ['name', 'birth']}, {rows: [...rows, {key: 'p:9', people: [], cells: {name: '=HYPERLINK("http://x")', birth: '-1'}}]}, {columns: {name: 'Personne', birth: 'Naissance'}});
        assert.ok(csv.startsWith('﻿"Personne";"Naissance"'));
        assert.match(csv, /"'=HYPERLINK\(""http:\/\/x""\)"/); assert.match(csv, /"-1"/);
    });
    await t('Node : un fichier .lcnda-rapport piégé est refusé avant même l’envoi', async () => {
        const ok = {type: 'lcnda-rapport', version: 1, kind: 'report', name: 'Décès', definition: {source: 'events', columns: ['date']}};
        assert.strictEqual(R.checkFile(JSON.stringify(ok)).ok, true);
        for (const bad of [{...ok, name: '<script>alert(1)</script>'}, {...ok, definition: {...ok.definition, layout: {title: 'x', footer: '<img src=x onerror=alert(1)>'}}},
            {...ok, description: 'javascript:alert(1)'}, {...ok, kind: 'script'}, {type: 'autre'}]) assert.strictEqual(R.checkFile(JSON.stringify(bad)).ok, false, JSON.stringify(bad));
        assert.strictEqual(R.checkFile('pas du json').ok, false);
    });

    /* ═════════ 1. serveur ═════════ */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-rt-'));
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
    const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES
 (1,'jean-pierre','Mazaud','male','deceased',1),(2,'Pierre','mazaud','male','deceased',0),(3,'Marie','LACOMBE','female','deceased',0),
 (4,'Paul','Durand','male','living',0),(5,'Anne','DURAND  ','female','deceased',0),(6,'Léonard','Lacombe','male','deceased',0),(7,'Louise','Lacombe','female','deceased',0)");
$pdo->exec("UPDATE persons SET is_private=1 WHERE id=6");
$pdo->exec("UPDATE persons SET is_locked=1 WHERE id=7");
$pdo->exec("INSERT INTO places(id,name,county,country) VALUES(1,'St Priest-de-Gimel','',''),(2,'Saint-Priest-de-Gimel','Corrèze','France'),(3,'Naves, Corrèze, France','',''),(4,'Tulle','Corrèze','France'),(5,'Tulle','',''),(6,'Rue St Pierre,, Tulle','','')");
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,2,3)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,1)");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id,description) VALUES('person',?,?,?,?,?,?)");
foreach ([[1,'BIRT','env. 1801',1801,1,''],[1,'DEAT','1866',1866,4,''],[2,'BIRT','ca 1772',1772,3,'  fils  de ,, Jean '],[2,'DEAT','1839',1839,5,''],[3,'BIRT','~1776',1776,2,''],
    [3,'DEAT','ABT 1851',1851,4,''],[4,'BIRT','1980',1980,4,''],[5,'BIRT','bef. 1850',1849,6,''],[6,'BIRT','1768',1768,4,''],[6,'DEAT','1820',1820,4,''],[7,'BIRT','env. 1790',1790,4,''],[7,'DEAT','1850',1850,1,'']] as $e) { $ins->execute([$e[0],$t($e[1]),$e[2],$e[3],$e[4],$e[5]]); }
$pdo->exec("INSERT INTO sources(id,title) VALUES(1,'Registre paroissial de Naves')");
$pdo->exec("INSERT INTO source_links(source_record_id,entity_type,entity_id) VALUES(1,'person',2)");
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const db = path.join(tmp, 'genealogy.sqlite');
    const q = sql => JSON.parse(spawnSync(phpPath, ['-r', `$p=new PDO('sqlite:${db}');echo json_encode($p->query(${JSON.stringify(sql)})->fetchAll(PDO::FETCH_ASSOC));`], {encoding: 'utf8'}).stdout || '[]');
    // l'état complet de ce qu'un traitement peut toucher (fiches, événements, lieux, étiquettes) : pour comparer avant / après ↶
    const snapshot = () => JSON.stringify(['SELECT id,first_name,middle_name,last_name,occupation,updated_at FROM persons', 'SELECT id,date_text,title,description,place_id,updated_at FROM events',
        'SELECT * FROM places', 'SELECT label_id,entity_type,entity_id FROM label_links', 'SELECT * FROM labels', 'SELECT * FROM census_records'].map(s => q(s + ' ORDER BY 1')));
    const browser = await chromium.launch();
    const errs = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}, acceptDownloads: true});
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.editToolsList, null, {timeout: 30000});
        // index.php ne charge pas encore ces fichiers : on les ajoute (comme le feront les balises)
        if (!await p.evaluate(() => !!window.LCNDA_EXT?.rapports)) { await p.addStyleTag({url: base + 'assets/css/rapports.css'}); await p.addScriptTag({url: base + 'assets/js/heritage-rapports.js'}); }
        await p.waitForFunction(() => window.LCNDA_EXT?.rapports, null, {timeout: 10000});
        const api = (x, qq = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, qq]);
        const post = (x, body) => p.evaluate(([y, b]) => window.LCNDA_APP.api(y, {}, {method: 'POST', body: b}).then(r => r.result).catch(e => ({error: e.message})), [x, body]);
        const deathId = q("SELECT id FROM event_types WHERE gedcom_tag='DEAT' LIMIT 1")[0].id;

        await t('rt_report_rows : colonnes de « Mes listes » + colonnes de rapport ; vivants et fiches 🔒 retirés', async () => {
            const r = await api('rt_report_rows', {def: JSON.stringify({source: 'persons', columns: ['name', 'birth', 'sosa', 'generation', 'source_titles', 'missing', 'century']})});
            assert.ok(!r.error, r.error);
            const names = r.rows.map(x => x.cells.name).sort();
            assert.deepStrictEqual(names, ['Anne DURAND', 'Louise Lacombe', 'Marie LACOMBE', 'Pierre mazaud', 'jean-pierre Mazaud'].sort());
            assert.deepStrictEqual(r.removed, {living: 1, private: 1}, 'Paul (vivant) et Léonard (🔒) retirés');
            const pierre = r.rows.find(x => x.people[0].id === 2);
            assert.strictEqual(pierre.cells.source_titles, 'Registre paroissial de Naves'); assert.strictEqual(pierre.cells.generation, '2'); assert.strictEqual(pierre.cells.century, 'XVIIIe siècle');
            assert.match(r.rows.find(x => x.people[0].id === 5).cells.missing, /décès.*parents.*sources/);
            const keep = await api('rt_report_rows', {def: JSON.stringify({source: 'persons', privacy: {keep_living: true}})});
            assert.strictEqual(keep.rows.length, 7, 'gardés pour soi');
            const pm = await api('rt_report_rows', {def: JSON.stringify({source: 'persons', privacy: {keep_living: true}}), privacy: '1'});
            assert.strictEqual(pm.rows.length, 5, 'mode confidentialité : toujours retirés'); assert.strictEqual(pm.privacy_mode, true);
            const ev = await api('rt_report_rows', {def: JSON.stringify({source: 'events', rules: [{field: 'event_type', values: [deathId]}], columns: ['date', 'who', 'commune', 'age']})});
            assert.deepStrictEqual(ev.rows.map(x => x.cells.commune).sort(), ['St Priest-de-Gimel', 'Tulle', 'Tulle', 'Tulle'].sort(), 'le décès de Léonard (🔒) n’y est pas');
        });

        let savedId = 0;
        await t('.lcnda-rapport : exporté (types d’événements par leur nom), importé dans une autre base ; vie privée remise à la tienne', async () => {
            const s = await post('rt_saved_save', {kind: 'report', name: 'Décès par commune', definition: {source: 'events', rules: [{field: 'event_type', values: [deathId]}], columns: ['date', 'who'], group: {col: 'commune'}, privacy: {keep_living: true}}});
            assert.ok(s.id, JSON.stringify(s)); savedId = s.id;
            const pkg = await api('rt_export', {id: s.id});
            assert.strictEqual(pkg.type, 'lcnda-rapport'); assert.deepStrictEqual(pkg.definition.rules[0].values, [{tag: 'DEAT', label: q(`SELECT label FROM event_types WHERE id=${deathId}`)[0].label}]);
            assert.strictEqual(pkg.definition.privacy.keep_living, false, 'jamais « garder les vivants » dans un fichier');
            const im = await post('rt_import', {json: JSON.stringify(pkg)});
            assert.ok(im.id && im.kind === 'report', JSON.stringify(im));
            const back = await api('rt_saved_get', {id: im.id});
            assert.deepStrictEqual(back.definition.rules[0].values, [deathId]); assert.strictEqual(back.definition.group.col, 'commune');
        });
        await t('.lcnda-rapport piégé (HTML, script, clé inconnue, javascript:) : refusé en entier, rien n’est écrit', async () => {
            const n0 = q('SELECT count(*) AS n FROM rt_saved')[0].n, l0 = q('SELECT count(*) AS n FROM labels')[0].n;
            const ok = {type: 'lcnda-rapport', version: 1, kind: 'report', name: 'Piège', definition: {source: 'persons', columns: ['name'], rules: [{field: 'label', values: [{name: 'Nouvelle'}]}]}};
            const traps = [
                {...ok, name: '<script>fetch("http://evil")</script>'},
                {...ok, definition: {...ok.definition, layout: {title: 'Titre', footer: '<img src=x onerror=alert(1)>'}}},
                {...ok, definition: {...ok.definition, formula: '=SYSTEM("rm")'}},
                {...ok, onload: 'x'},
                {...ok, definition: {...ok.definition, rules: [{field: 'last_name', value: 'javascript:alert(1)'}]}},
                {...ok, definition: {...ok.definition, steps: [{op: 'clean', params: {code: 'x'}}]}},
                {...ok, definition: {...ok.definition, columns: [{evil: 1}]}},
                {...ok, kind: 'script'},
            ];
            for (const trap of traps) { const r = await post('rt_import', {json: JSON.stringify(trap)}); assert.ok(r.error && /refusé|n’est pas|inconnu/i.test(r.error), JSON.stringify(trap) + ' → ' + JSON.stringify(r)); }
            assert.strictEqual(q('SELECT count(*) AS n FROM rt_saved')[0].n, n0, 'aucun rapport ajouté'); assert.strictEqual(q('SELECT count(*) AS n FROM labels')[0].n, l0, 'aucune étiquette créée');
            const big = await post('rt_import', {json: JSON.stringify({...ok, description: 'x'.repeat(210000)})}); assert.ok(big.error);
        });

        await t('🧰 aperçu d’une recette : chaque étape voit la précédente, rien n’est écrit', async () => {
            const before = snapshot();
            const def = {steps: [{op: 'place_abbrev', params: {find: 'St', replace: 'Saint'}}, {op: 'clean'}, {op: 'place_split'}, {op: 'dates_vers'}, {op: 'names_case', params: {field: 'last_name', mode: 'upper'}}]};
            const r = await api('rt_batch_preview', {def: JSON.stringify(def)});
            assert.ok(!r.error, r.error);
            const by = k => r.rows.find(x => x.key === k);
            assert.strictEqual(by('0:places:name:1').note, 'fusion', '« Saint-Priest-de-Gimel » existe déjà : fusion');
            assert.strictEqual(by('1:places:clean:6').before, 'Rue Saint-Pierre,, Tulle', 'l’étape 2 voit le résultat de l’étape 1');
            assert.strictEqual(by('2:places:split:3').after, 'Naves · Corrèze · France');
            assert.strictEqual(by('3:events:date_text:1').after, 'vers 1801'); assert.strictEqual(by('3:events:date_text:8').after, 'avant 1850');
            assert.strictEqual(by('4:persons:last_name:2').after, 'MAZAUD');
            assert.strictEqual(by('3:events:date_text:11').locked, true, 'fiche verrouillée 🔒 : montrée, laissée');
            assert.strictEqual(by('1:events:clean:3').after, 'fils de, Jean');
            assert.strictEqual(snapshot(), before, 'l’aperçu n’a rien écrit');
        });
        await t('🧰 appliquer (une ligne décochée) puis ↶ : tout revient EXACTEMENT, ↷ refait, une case retouchée depuis n’est pas écrasée', async () => {
            const before = snapshot();
            const def = {steps: [{op: 'place_abbrev', params: {find: 'St', replace: 'Saint'}}, {op: 'clean'}, {op: 'place_split'}, {op: 'dates_vers'}, {op: 'names_case', params: {field: 'last_name', mode: 'upper'}}, {op: 'place_merge'}, {op: 'label', params: {name: 'Import Paul 2026'}}],
                who: {mode: 'all'}};
            const r = await post('rt_batch_apply', {def, skip: ['3:events:date_text:8']});
            assert.ok(r.undo_id && r.count > 10, JSON.stringify(r));
            assert.ok(fs.existsSync(path.join(tmp, 'backups', r.backup)), 'copie de la base faite juste avant');
            assert.strictEqual(q('SELECT date_text FROM events WHERE id=8')[0].date_text, 'bef. 1850', 'ligne décochée : laissée');
            assert.strictEqual(q('SELECT date_text FROM events WHERE id=11')[0].date_text, 'env. 1790', 'fiche verrouillée : laissée');
            assert.strictEqual(q('SELECT date_text FROM events WHERE id=1')[0].date_text, 'vers 1801');
            assert.strictEqual(q('SELECT count(*) AS n FROM places WHERE id IN (1,5)')[0].n, 0, 'lieux fusionnés');
            assert.strictEqual(q('SELECT place_id FROM events WHERE id=1')[0].place_id, 2);
            assert.deepStrictEqual(q('SELECT name, county, country FROM places WHERE id=3')[0], {name: 'Naves', county: 'Corrèze', country: 'France'});
            assert.ok(q("SELECT count(*) AS n FROM change_log WHERE entity_type='batch'")[0].n >= 1, 'noté dans le journal');
            const after = snapshot();
            const u = await post('rt_undo', {id: r.undo_id});
            assert.strictEqual(u.kept, 0);
            const norm = s => s.replace(/"updated_at":"[^"]*"/g, '"updated_at":"-"');
            assert.strictEqual(norm(snapshot()), norm(before), '↶ remet tout exactement');
            assert.deepStrictEqual(await post('rt_undo', {id: r.undo_id}), {already: true});
            await post('rt_redo', {id: r.undo_id});
            assert.strictEqual(norm(snapshot()).replace(/"label_id":\d+/g, ''), norm(after).replace(/"label_id":\d+/g, ''), '↷ refait la même chose');
            // une case retouchée entre-temps : ↶ la laisse et le dit
            spawnSync(phpPath, ['-r', `$p=new PDO('sqlite:${db}');$p->exec("UPDATE events SET date_text='vers 1801 (vu)' WHERE id=1");`]);
            const u2 = await post('rt_undo', {id: r.undo_id});
            assert.strictEqual(u2.kept, 1);
            assert.strictEqual(q('SELECT date_text FROM events WHERE id=1')[0].date_text, 'vers 1801 (vu)', 'pas écrasée');
            spawnSync(phpPath, ['-r', `$p=new PDO('sqlite:${db}');$p->exec("UPDATE events SET date_text='env. 1801' WHERE id=1");`]);
            assert.strictEqual(norm(snapshot()), norm(before));
        });
        await t('🧰 sur qui : seulement les personnes choisies (critères de « Mes listes »)', async () => {
            const r = await api('rt_batch_preview', {def: JSON.stringify({steps: [{op: 'names_case', params: {field: 'last_name', mode: 'upper'}}], who: {mode: 'rules', rules: [{field: 'last_name', value: 'maz'}]}})});
            assert.deepStrictEqual(r.rows.map(x => x.key).sort(), ['0:persons:last_name:1', '0:persons:last_name:2']);
            const bad = await api('rt_batch_preview', {def: JSON.stringify({steps: [{op: 'place_abbrev', params: {find: ''}}]})});
            assert.match(bad.error || '', /Tape le texte/);
        });

        /* ═════════ 2. écran ═════════ */
        const toasts = () => p.evaluate(() => [...document.querySelectorAll('.ui-toast, .toast')].map(x => x.textContent).join(' | '));
        await t('Outils de modification : les onglets « 📊 Mes rapports » et « 🧰 Traitements en lot »', async () => {
            await p.evaluate(() => { localStorage.setItem('genealogie-edittools-tab', 'rapports'); const S = window.LCNDA_APP.state; S.listType = 'edit_tools'; return window.LCNDA_APP.setModule('listes'); });
            await p.waitForSelector('[data-et-tab="rapports"].is-active', {timeout: 15000});
            assert.ok(await p.$('[data-et-tab="traitements"]'));
            await p.waitForFunction(() => /Décès par commune/.test(document.querySelector('[data-et-list]')?.textContent || ''), null, {timeout: 10000});
        });
        await t('📊 modèle « Décès par commune » : aperçu groupé, âge moyen, rien du 🔒, 🖨 impression de l’app, CSV et HTML', async () => {
            await p.click('[data-et-new]');
            await p.waitForSelector('[data-rt-tpl="deces_commune"]', {timeout: 10000});
            await p.click('[data-rt-tpl="deces_commune"]');
            await p.waitForSelector('[data-rt-sheet] .rt-doc h2', {timeout: 15000});
            const sheet = await p.textContent('[data-rt-sheet]');
            assert.match(sheet, /Décès par commune/); assert.match(sheet, /Tulle/); assert.match(sheet, /Moyenne · Âge/);
            assert.ok(!/Léonard/.test(sheet), 'fiche 🔒 retirée');
            assert.match(await p.textContent('[data-rt-priv]'), /Vivants : retirés/);
            assert.match(await p.textContent('[data-rt-info]'), /4 événements · 2 groupes/);
            if (process.env.RT_SHOTS) await p.screenshot({path: path.join(process.env.RT_SHOTS, 'rapport.png'), fullPage: true});
            // regrouper autrement : l'aperçu suit
            await p.selectOption('[data-rt-f="group.col"]', 'type');
            await p.waitForFunction(() => /Décès/.test(document.querySelector('[data-rt-sheet] h2')?.textContent || ''), null, {timeout: 5000});
            await p.selectOption('[data-rt-f="group.col"]', 'commune');
            await p.waitForFunction(() => document.querySelectorAll('[data-rt-sheet] h2').length === 2, null, {timeout: 5000});
            // un titre piégé tapé à la main reste du texte
            await p.fill('[data-rt-f="layout.title"]', '<img src=x onerror="window.__pwned=1">Décès');
            await sleep(600);
            assert.strictEqual(await p.evaluate(() => window.__pwned), undefined);
            assert.match(await p.textContent('[data-rt-sheet] h1'), /<img src=x/);
            await p.fill('[data-rt-f="layout.title"]', 'Décès par commune');
            // 🖨 : l'impression de l'app (aperçu, ⤓ PDF)
            await p.click('[data-rt-print]');
            await p.waitForSelector('dialog.k-print[open] [data-k-pdf]', {timeout: 10000});
            assert.strictEqual(await p.getAttribute('dialog.k-print[open]', 'data-k-print-key'), 'rapport');
            await p.click('dialog.k-print[open] [data-k-x]'); await sleep(300);
            // ⤓ CSV et HTML
            for (const [label, ext, check] of [['CSV', '.csv', s => /^﻿"Commune";"Date"/.test(s) && /Tulle/.test(s)], ['Page HTML', '.html', s => /<h1>Décès par commune<\/h1>/.test(s) && !/<script/i.test(s) && /#personnes\/\d+/.test(s)]]) {
                await p.click('[data-rt-export]');
                const dl = p.waitForEvent('download', {timeout: 10000});
                await p.click(`.ui-menu button:has-text("${label}"), [role=menu] button:has-text("${label}")`);
                const d = await dl; assert.ok(d.suggestedFilename().endsWith(ext), d.suggestedFilename());
                const s = fs.readFileSync(await d.path(), 'utf8'); assert.ok(check(s), label + ' : ' + s.slice(0, 200));
            }
            // 💾 enregistrer
            await p.click('[data-rt-save]');
            await p.waitForFunction(() => /Rapport enregistré/.test([...document.querySelectorAll('.ui-toast, .toast')].map(x => x.textContent).join(' ')), null, {timeout: 10000});
            assert.ok(q("SELECT count(*) AS n FROM rt_saved WHERE kind='report' AND name='Décès par commune'")[0].n >= 2);
        });
        await t('📋 « 🖨 En faire un rapport » depuis une de « Mes listes »', async () => {
            const l = await post('save_my_list', {name: 'Les MAZAUD', icon: '📋', source: 'persons', definition: {match: 'all', rules: [{field: 'last_name', value: 'mazaud'}], columns: ['name', 'birth']}});
            await p.evaluate(id => { const S = window.LCNDA_APP.state; S.maintenanceTab = 'my_lists'; S.hListOpen = id; return window.LCNDA_APP.setModule('maintenance'); }, l.id);
            await p.waitForSelector(`[data-lv-report="${l.id}"]`, {state: 'attached', timeout: 15000});
            await p.evaluate(id => document.querySelector(`[data-lv-report="${id}"]`).click(), l.id);
            await p.waitForSelector('[data-rt-sheet] .rt-doc h1', {timeout: 15000});
            assert.match(await p.textContent('[data-rt-sheet] h1'), /Les MAZAUD/);
            await p.waitForFunction(() => /2 personnes/.test(document.querySelector('[data-rt-info]')?.textContent || ''), null, {timeout: 10000});
            await p.evaluate(() => { const S = window.LCNDA_APP.state; S.hListOpen = 0; });
        });
        await t('🧰 écran : recette de deux gestes, aperçu, décocher, appliquer, ↶ Tout annuler remet tout', async () => {
            const before = snapshot();
            await p.evaluate(() => window.LCNDA_EXT.rapports.openBatch({}));
            await p.waitForSelector('[data-rb-op="dates_vers"]', {timeout: 10000});
            await p.click('[data-rb-op="dates_vers"]'); await p.click('[data-rb-addstep]');
            await p.click('[data-rb-op="names_case"]'); await p.click('[data-rb-addstep]');
            assert.strictEqual(await p.$$eval('.rt-chain li', x => x.length), 2);
            await p.click('[data-rb-preview]');
            await p.waitForSelector('.rt-pv tbody tr', {timeout: 15000});
            const txt = await p.textContent('.rt-pv');
            assert.match(txt, /env\. 1801/); assert.match(txt, /vers 1801/); assert.match(txt, /MAZAUD/); assert.match(txt, /fiche verrouillée/);
            await p.uncheck('[data-rb-key="0:events:date_text:3"]');
            if (process.env.RT_SHOTS) await p.screenshot({path: path.join(process.env.RT_SHOTS, 'traitements.png'), fullPage: true});
            assert.match(await p.textContent('[data-rb-row="0:events:date_text:3"]'), /décoché par toi/);
            await p.click('[data-rb-apply]');
            await p.waitForSelector('[data-rb-done]', {timeout: 15000});
            assert.strictEqual(q('SELECT date_text FROM events WHERE id=3')[0].date_text, 'ca 1772', 'décoché : laissé');
            assert.strictEqual(q('SELECT date_text FROM events WHERE id=5')[0].date_text, 'vers 1776');
            assert.strictEqual(q('SELECT last_name FROM persons WHERE id=1')[0].last_name, 'MAZAUD');
            assert.match(await toasts(), /Traitement en lot/);
            await p.click('[data-rb-undo]');
            await p.waitForFunction(() => !document.querySelector('[data-rb-undo]'), null, {timeout: 10000});
            const norm = s => s.replace(/"updated_at":"[^"]*"/g, '"updated_at":"-"');
            assert.strictEqual(norm(snapshot()), norm(before), '↶ Tout annuler remet tout');
            // 💾 garder comme recette, puis elle est dans l'onglet
            await p.click('[data-rb-preview]'); await p.waitForSelector('[data-rb-keep]', {timeout: 10000});
            await p.evaluate(() => { window.LCNDA_APP.askText = async () => 'Après un import'; });
            await p.click('[data-rb-keep]');
            await p.waitForFunction(() => /Recette enregistrée/.test([...document.querySelectorAll('.ui-toast, .toast')].map(x => x.textContent).join(' ')), null, {timeout: 10000});
            const rec = q("SELECT def_json FROM rt_saved WHERE kind='recipe'");
            assert.strictEqual(rec.length, 1); assert.strictEqual(JSON.parse(rec[0].def_json).steps.length, 2);
        });
        await t('390 px, mode sombre : pas de défilement de côté', async () => {
            const m = await (await browser.newContext({viewport: {width: 390, height: 800}, colorScheme: 'dark'})).newPage();
            m.on('pageerror', e => errs.push(e.message));
            await m.goto(base); await m.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.editToolsList, null, {timeout: 30000});
            if (!await m.evaluate(() => !!window.LCNDA_EXT?.rapports)) { await m.addStyleTag({url: base + 'assets/css/rapports.css'}); await m.addScriptTag({url: base + 'assets/js/heritage-rapports.js'}); }
            await m.evaluate(id => window.LCNDA_EXT.rapports.openBuilder({id}), savedId);
            await m.waitForSelector('[data-rt-sheet] .rt-doc', {timeout: 15000}); await sleep(500);
            assert.ok(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'rapport');
            await m.evaluate(() => window.LCNDA_EXT.rapports.openBatch({}));
            await m.waitForSelector('[data-rb-op]', {timeout: 10000}); await sleep(300);
            assert.ok(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'traitements');
        });
        await t('pas d’erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
