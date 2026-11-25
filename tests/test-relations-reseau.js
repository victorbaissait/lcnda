#!/usr/bin/env node
/* 🤝 Son réseau : les relations hors famille (lib/relations_reseau.php, assets/js/heritage-reseau.js, lib/gedcom.php ASSO).
 *  1. serveur : ajouter (fiche ou nom libre), lire des deux côtés (employeur ↔ employée, selon le sexe), changer, retirer,
 *     « ↶ Annuler » (restore), liste, liens entre fiches (génogramme), diagramme « Réseau social », réglages ;
 *  2. GEDCOM : export 5.5.1 (ASSO + RELA) et 7 (ASSO + ROLE / PHRASE, @VOID@) valables (règles officielles), dates, lieu, source ;
 *     vivante cachée en mode « pour partager » (ni la relation, ni sa source) ; import d'un ASSO sans événement → relation
 *     (5.5.1 et 7), aller-retour, pas de doublon quand les deux côtés sont écrits ;
 *  3. écran : bloc « 🤝 Son réseau » sur les deux fiches, ＋ Ajouter (↶ Annuler), 🗑 Retirer (↶ Annuler), Listes → 🧰 Données,
 *     génogramme (liens affectifs), 🔎 Ce qui le concerne, Réglages.
 *   node tests/test-relations-reseau.js */
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
const {gedcom7Errors, gedcom551Errors} = require('./gedcom7-valide');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-rs-'));
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','MAZAUD','male','deceased',1),(2,'Marie','LACOMBE','female','deceased',0),(3,'Pierrette','DURAND','female','deceased',0),(4,'Anne','DURAND','female','living',0),(5,'Paul','MAZAUD','male','deceased',0)");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code) VALUES(1,'Tulle','Corrèze','France',45.2694,1.768,'19272')");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id,title,description) VALUES('person',?,?,?,?,1,'','')");
foreach ([[1,'BIRT','1830',1830],[2,'BIRT','1832',1832],[3,'BIRT','1800',1800],[5,'BIRT','1855',1855],[4,'BIRT','1990',1990]] as [$pid,$tag,$d,$y]) { $ins->execute([$pid,$t($tag),$d,$y]); }
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,1,2)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,5)");
$pdo->exec("INSERT INTO sources(id,title,url) VALUES(1,'Livret d’ouvrier de Jean MAZAUD','https://archives.example.org/livret-mazaud'),(2,'Carnet de voisinage','')");
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const sql = q => JSON.parse(spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `$d=new PDO('sqlite:'.$argv[1]);echo json_encode($d->query($argv[2])->fetchAll(PDO::FETCH_ASSOC));`, path.join(tmp, 'genealogy.sqlite'), q], {encoding: 'utf8'}).stdout || '[]');
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    let serverErr = '';
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: ['ignore', 'ignore', 'pipe']});
    proc.stderr.on('data', d => { serverErr += d; });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const p = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultPersonBlocks, null, {timeout: 30000});
        if (!await p.evaluate(() => !!window.LCNDA_EXT?.reseau)) { await p.addStyleTag({url: base + 'assets/css/commune-reseau.css'}); await p.addScriptTag({url: base + 'assets/js/heritage-reseau.js'}); }
        await p.waitForFunction(() => window.LCNDA_EXT?.reseau, null, {timeout: 10000});
        const api = (x, qq = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, qq]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);
        const text = q => p.evaluate(async x => (await fetch('api.php?' + x)).text(), q);
        const importGed = (content, name) => p.evaluate(async ([c, n]) => {
            const fd = new FormData(); fd.append('file', new Blob([c]), n); fd.append('csrf', window.LCNDA_APP.state.csrf);
            const pr = await (await fetch('api.php?action=import_preview', {method: 'POST', body: fd, headers: {'X-CSRF-Token': window.LCNDA_APP.state.csrf}})).json();
            if (!pr.token) return {error: pr.error || JSON.stringify(pr).slice(0, 300)};
            const r = await window.LCNDA_APP.api('import_pending', {}, {method: 'POST', body: {token: pr.token}}).catch(e => ({error: e.message}));
            return r.result || r;
        }, [content, name]);
        const ids = {};

        /* ═════════ 1. serveur ═════════ */
        await t('ajouter : Pierrette DURAND employeuse de Jean (1850–1860, Tulle, note, source) ; lu des deux côtés, selon le sexe', async () => {
            const r = await post('reseau_save', {person_id: 1, other_id: 3, rel_type: 'employeur', date_from: '1850', date_to: 'vers 1860', place_id: 1, note: 'Valet de ferme à la Borie.', source_id: 1, source_page: 'f° 3'});
            assert.ok(r.id && r.before === null, JSON.stringify(r)); ids.emp = r.id;
            const a = await api('reseau_person', {id: 1});
            const ra = a.relations.find(x => x.id === ids.emp);
            assert.strictEqual(ra.label, 'Employeuse'); assert.strictEqual(ra.other.name, 'Pierrette DURAND'); assert.strictEqual(ra.dir, 'out');
            assert.strictEqual(ra.year_from, 1850); assert.strictEqual(ra.year_to, 1860); assert.strictEqual(ra.place.name, 'Tulle');
            assert.strictEqual(ra.sources[0].url, 'https://archives.example.org/livret-mazaud'); assert.strictEqual(ra.sources[0].page, 'f° 3');
            const b = await api('reseau_person', {id: 3});
            const rb = b.relations.find(x => x.id === ids.emp);
            assert.strictEqual(rb.label, 'Employé'); assert.strictEqual(rb.other.name, 'Jean MAZAUD'); assert.strictEqual(rb.dir, 'in'); assert.strictEqual(rb.type, 'employe');
        });
        await t('nom libre (sans fiche), lien affectif « en conflit » entre époux, voisine vivante ; erreurs claires', async () => {
            ids.free = (await post('reseau_save', {person_id: 1, other_id: 'txt:Louis LACOMBE, meunier', rel_type: 'ami', date_from: '1848', source_id: 2})).id;
            ids.conf = (await post('reseau_save', {person_id: 1, other_id: 2, rel_type: 'conflit', date_from: '1870'})).id;
            ids.liv = (await post('reseau_save', {person_id: 1, other_id: 4, rel_type: 'voisin', source_id: 2, source_page: 'p. 9'})).id;
            ids.autre = (await post('reseau_save', {person_id: 5, other_id: 3, rel_type: 'autre', rel_label: 'compagnon de voyage', date_from: '1875'})).id;
            const a = await api('reseau_person', {id: 1});
            const free = a.relations.find(x => x.id === ids.free);
            assert.strictEqual(free.free, true); assert.strictEqual(free.other_name, 'Louis LACOMBE, meunier'); assert.strictEqual(free.label, 'Ami ou amie');
            assert.strictEqual(a.relations.find(x => x.id === ids.conf).label, 'En conflit');
            assert.strictEqual((await api('reseau_person', {id: 3})).relations.find(x => x.id === ids.autre).label, 'compagnon de voyage', 'le mot libre, des deux côtés');
            assert.match((await post('reseau_save', {person_id: 1, other_id: 1, rel_type: 'ami'})).error, /elle-même/);
            assert.match((await post('reseau_save', {person_id: 1, rel_type: 'ami'})).error, /Choisis une fiche ou écris un nom/);
        });
        await t('changer puis ↶ Annuler (restore) ; retirer puis ↶ Annuler : même numéro, sources comprises', async () => {
            const c = await post('reseau_save', {id: ids.emp, person_id: 1, other_id: 3, rel_type: 'maitre', date_from: '1851', date_to: '1859', place_id: 1, note: 'x'});
            assert.strictEqual(c.before.rel_type, 'employeur');
            assert.strictEqual((await api('reseau_person', {id: 3})).relations.find(x => x.id === ids.emp).label, 'Domestique');
            await post('reseau_restore', {row: c.before});
            const back = sql(`SELECT rel_type, date_from, date_to, note FROM person_relations WHERE id=${ids.emp}`)[0];
            assert.deepStrictEqual(back, {rel_type: 'employeur', date_from: '1850', date_to: 'vers 1860', note: 'Valet de ferme à la Borie.'});
            const d = await post('reseau_delete', {id: ids.emp});
            assert.strictEqual(sql(`SELECT count(*) n FROM person_relations WHERE id=${ids.emp}`)[0].n, 0);
            assert.strictEqual(sql(`SELECT count(*) n FROM source_links WHERE entity_type='relation' AND entity_id=${ids.emp}`)[0].n, 0);
            await post('reseau_restore', {row: d.row});
            assert.strictEqual(sql(`SELECT count(*) n FROM source_links WHERE entity_type='relation' AND entity_id=${ids.emp} AND page='f° 3'`)[0].n, 1, 'la source revient');
        });
        await t('liste (Listes), liens entre fiches (génogramme), diagramme « Réseau social », réglages', async () => {
            const L = await api('reseau_list');
            const row = L.rows.find(r => r.id === ids.emp);
            assert.deepStrictEqual([row.person, row.role, row.other, row.role_back, row.place, row.year_from], ['Jean MAZAUD', 'Employeuse', 'Pierrette DURAND', 'Employé', 'Tulle', 1850]);
            assert.strictEqual(row.source_url, 'https://archives.example.org/livret-mazaud');
            const am = await api('reseau_among', {ids: '1,2,5'});
            assert.deepStrictEqual(am.links.map(l => [l.a, l.b, l.type]), [[1, 2, 'conflit']]);
            const g = await api('graph_network', {kind: 'social', id: 1});
            assert.ok(g.nodes.some(n => n.person_id === 3) && g.edges.some(e => /Employeuse/.test(e.label)), JSON.stringify(g.edges));
            await post('reseau_settings_save', {diagramme: 0});
            assert.ok(!(await api('graph_network', {kind: 'social', id: 1})).edges.some(e => /Employeuse/.test(e.label)), 'éteint dans Réglages');
            await post('reseau_settings_save', {diagramme: 1});
        });

        /* ═════════ 2. GEDCOM ═════════ */
        await t('export 5.5.1 : ASSO + RELA, note (dates, lieu), source ; nom libre en note ; valable', async () => {
            const g = await text('action=export_gedcom&gedcom_version=5.5.1');
            assert.deepStrictEqual(gedcom551Errors(g).slice(0, 10), []);
            const indi1 = g.split(/\n0 /).find(b => /^@I1@ INDI/.test(b));
            assert.match(indi1, /\n1 ASSO @I3@\n2 RELA Employeuse\n2 NOTE Dates : de 1850 à vers 1860\n3 CONT Lieu : Tulle\n3 CONT Valet de ferme à la Borie\.\n2 SOUR @S1@\n3 PAGE f° 3/);
            assert.match(indi1, /\n1 ASSO @I2@\n2 RELA En conflit/);
            assert.match(indi1, /\n1 NOTE Réseau — Ami ou amie : Louis LACOMBE, meunier/);
            assert.match(g, /0 @I5@ INDI[\s\S]*?1 ASSO @I3@\n2 RELA compagnon de voyage/);
        });
        await t('export 7 : ASSO + ROLE (FRIEND, NGHBR, OTHER + PHRASE), @VOID@ + PHRASE ; valable (règles officielles)', async () => {
            const g = await text('action=export_gedcom&gedcom_version=7');
            assert.deepStrictEqual(gedcom7Errors(g).slice(0, 10), []);
            const indi1 = g.split(/\n0 /).find(b => /^@I1@ INDI/.test(b));
            assert.match(indi1, /\n1 ASSO @I3@\n2 ROLE OTHER\n3 PHRASE Employeuse\n2 NOTE Dates : de 1850 à vers 1860/);
            assert.match(indi1, /\n1 ASSO @VOID@\n2 PHRASE Louis LACOMBE, meunier\n2 ROLE FRIEND/);
            assert.match(indi1, /\n1 ASSO @I4@\n2 ROLE NGHBR/);
        });
        await t('pour partager : la voisine vivante n’apparaît pas (ni la relation, ni sa source seule), ni le nom libre', async () => {
            for (const v of ['5.5.1', '7']) {
                const g = await text(`action=export_gedcom&gedcom_version=${v}&share=1`);
                assert.doesNotMatch(g, /ASSO @I4@/, v); assert.doesNotMatch(g, /Louis LACOMBE/, v);
                assert.match(g, /ASSO @I3@/, v);
                assert.doesNotMatch(g, /Carnet de voisinage/, `${v} : la source citée seulement par des relations cachées ne part pas`);
                assert.deepStrictEqual((v === '7' ? gedcom7Errors(g) : gedcom551Errors(g)).slice(0, 10), [], v);
            }
        });
        await t('import : ASSO de fiche sans événement → vraie relation (5.5.1 RELA, 7 ROLE/PHRASE, @VOID@) ; pas de doublon des deux côtés', async () => {
            const before = sql('SELECT count(*) n FROM person_relations')[0].n;
            const g551 = `0 HEAD\n1 GEDC\n2 VERS 5.5.1\n2 FORM LINEAGE-LINKED\n1 CHAR UTF-8\n1 SUBM @U1@\n0 @A1@ INDI\n1 NAME Léon /LACOMBE/\n1 SEX M\n1 ASSO @A2@\n2 RELA Neighbor\n2 NOTE Dates : de 1890 à 1900\n3 CONT Lieu : Tulle\n3 CONT Ils partageaient le four.\n1 ASSO @A3@\n2 RELA Godfather\n0 @A2@ INDI\n1 NAME Rose /DURAND/\n1 SEX F\n1 ASSO @A1@\n2 RELA Neighbour\n0 @A3@ INDI\n1 NAME Henri /MAZAUD/\n1 SEX M\n0 @U1@ SUBM\n1 NAME x\n0 TRLR\n`;
            const r = await importGed(g551, 'voisins.ged');
            assert.ok(!r.error, JSON.stringify(r).slice(0, 300));
            const rows = sql(`SELECT pr.rel_type, pr.date_from, pr.date_to, pr.place_id, pr.note, a.first_name AS a, b.first_name AS b FROM person_relations pr JOIN persons a ON a.id=pr.person_id JOIN persons b ON b.id=pr.other_id WHERE pr.id > (SELECT max(id) FROM person_relations) - 10 ORDER BY pr.id`).filter(x => ['Léon', 'Rose'].includes(x.a));
            assert.deepStrictEqual(rows.map(x => [x.a, x.b, x.rel_type]), [['Léon', 'Rose', 'voisin'], ['Léon', 'Henri', 'parrain']], 'Rose → Léon (voisine, l’autre sens) n’est pas en double');
            assert.deepStrictEqual([rows[0].date_from, rows[0].date_to, rows[0].place_id, rows[0].note], ['1890', '1900', 1, 'Ils partageaient le four.']);
            assert.strictEqual(sql(`SELECT count(*) n FROM notes WHERE title='Liens avec d’autres personnes'`)[0].n, 0, 'plus une simple note');
            const g7 = `0 HEAD\n1 GEDC\n2 VERS 7.0\n0 @B1@ INDI\n1 NAME Octave /DURAND/\n1 SEX M\n1 ASSO @B2@\n2 ROLE OTHER\n3 PHRASE Associé\n1 ASSO @VOID@\n2 PHRASE Le notaire Bardon\n2 ROLE FRIEND\n0 @B2@ INDI\n1 NAME Émile /LACOMBE/\n1 SEX M\n0 TRLR\n`;
            const r7 = await importGed(g7, 'associes.ged');
            assert.ok(!r7.error, JSON.stringify(r7).slice(0, 300));
            const oct = sql(`SELECT pr.rel_type, pr.other_name, pr.other_id FROM person_relations pr JOIN persons a ON a.id=pr.person_id WHERE a.first_name='Octave' ORDER BY pr.id`);
            assert.deepStrictEqual(oct.map(x => [x.rel_type, x.other_name, x.other_id === null]), [['associe', '', false], ['ami', 'Le notaire Bardon', true]]);
            assert.ok(sql('SELECT count(*) n FROM person_relations')[0].n === before + 4);
        });
        await t('aller-retour : export 7 puis import → la relation revient (sorte, dates, lieu, source)', async () => {
            const g = await text('action=export_gedcom&gedcom_version=7');
            const n0 = sql('SELECT max(id) m FROM persons')[0].m;
            const r = await importGed(g, 'aller-retour.ged');
            assert.ok(!r.error, JSON.stringify(r).slice(0, 300));
            const back = sql(`SELECT pr.id, pr.rel_type, pr.date_from, pr.date_to, pr.place_id, pr.note FROM person_relations pr JOIN persons a ON a.id=pr.person_id JOIN persons b ON b.id=pr.other_id WHERE a.id > ${n0} AND a.first_name='Jean' AND b.first_name='Pierrette'`);
            assert.strictEqual(back.length, 1, JSON.stringify(back));
            assert.deepStrictEqual([back[0].rel_type, back[0].date_from, back[0].date_to, back[0].note], ['employeur', '1850', 'vers 1860', 'Valet de ferme à la Borie.']);
            assert.ok(back[0].place_id, 'le lieu retrouvé');
            assert.strictEqual(sql(`SELECT count(*) n FROM source_links WHERE entity_type='relation' AND entity_id=${back[0].id} AND page='f° 3'`)[0].n, 1, 'la source suit');
        });

        /* ═════════ 3. écran ═════════ */
        await t('fiche : bloc « 🤝 Son réseau » sur Jean (Employeuse : Pierrette) et, à l’envers, sur Pierrette (Employé : Jean), ↗ source', async () => {
            await p.evaluate(() => window.LCNDA_APP.openPersonById(1));
            await p.waitForSelector('[data-rs-person="1"][data-rs-ready]', {timeout: 30000, state: 'attached'});
            const s1 = await p.textContent('[data-rs-person="1"]');
            assert.match(s1, /Employeuse : Pierrette DURAND/); assert.match(s1, /Louis LACOMBE, meunier \(sans fiche\)/); assert.match(s1, /En conflit : Marie LACOMBE/);
            assert.ok(await p.$('[data-rs-person="1"] a[href="https://archives.example.org/livret-mazaud"][target="_blank"][rel~="noopener"]'));
            await p.evaluate(() => window.LCNDA_APP.openPersonById(3));
            await p.waitForSelector('[data-rs-person="3"][data-rs-ready]', {timeout: 30000, state: 'attached'});
            assert.match(await p.textContent('[data-rs-person="3"]'), /Employé : Jean MAZAUD/);
        });
        await t('＋ Ajouter une relation (fenêtre) → ↶ Annuler ; 🗑 Retirer → ↶ Annuler', async () => {
            await p.click('[data-rs-add="3"]');
            await p.waitForSelector('dialog.rs-modal[open]');
            await p.evaluate(() => { const d = document.querySelector('dialog.rs-modal'); window.LCNDA_PICKER.pickerSet(d.querySelector('.pk'), 5); });
            await p.selectOption('dialog.rs-modal select[name="rel_type"]', 'apprenti');
            await p.fill('dialog.rs-modal input[name="date_from"]', '1870');
            await p.waitForFunction(() => document.querySelector('dialog.rs-modal .pk input[type=hidden][name="other"]')?.value === '5', null, {timeout: 5000});
            await p.click('dialog.rs-modal button[value="ok"]');
            await p.waitForFunction(() => /Apprenti : Paul MAZAUD/.test(document.querySelector('[data-rs-person="3"]')?.textContent || ''), null, {timeout: 10000});
            const id = sql("SELECT id FROM person_relations WHERE person_id=3 AND other_id=5 AND rel_type='apprenti'")[0].id;
            await p.locator('text=↶ Annuler').last().click();
            await p.waitForFunction(() => !/Apprenti : Paul/.test(document.querySelector('[data-rs-person="3"]')?.textContent || ''), null, {timeout: 10000});
            assert.strictEqual(sql(`SELECT count(*) n FROM person_relations WHERE id=${id}`)[0].n, 0);
            await p.click(`[data-rs-person="3"] [data-rs-del="${ids.autre}"]`);
            await p.waitForFunction(() => !/compagnon de voyage/.test(document.querySelector('[data-rs-person="3"]')?.textContent || ''), null, {timeout: 10000});
            await p.locator('text=↶ Annuler').last().click();
            await p.waitForFunction(() => /compagnon de voyage : Paul MAZAUD/.test(document.querySelector('[data-rs-person="3"]')?.textContent || ''), null, {timeout: 10000});
        });
        await t('Listes → 🧰 Données, 🔎 Ce qui le concerne, génogramme (trait « en conflit » entre Jean et Marie)', async () => {
            const L = await p.evaluate(async () => { const d = window.LCNDA_EXT.dataLists.find(x => x.id === 'reseau'); const rows = await d.load(); return {n: rows.length, f: d.fields.map(f => f.key), one: rows.find(r => r.role === 'Employeuse')}; });
            assert.ok(L.n >= 5 && L.f.includes('url') && L.one.url === 'https://archives.example.org/livret-mazaud', JSON.stringify(L).slice(0, 300));
            const ts = await p.evaluate(async () => { const d = window.LCNDA_EXT.dataSources.find(x => x.id === 'reseau_personne'); const h = document.createElement('div'); return [await d.run({person: {id: 1}}, h), h.textContent]; });
            assert.strictEqual(ts[0], true); assert.match(ts[1], /Pierrette DURAND/);
            await p.evaluate(() => { const st = window.LCNDA_APP.state; st.currentPersonId = 5; st.graphMode = 'genogram'; st.graphDepth = 3; window.LCNDA_APP.setModule('graphiques'); });
            await p.waitForSelector('.special-diagram.genogram path[data-rs-affect="conflit"]', {timeout: 30000, state: 'attached'});
            assert.match(await p.textContent('.genogram-legend'), /⚡ en conflit/);
        });
        await t('Réglages → 🤝 Son réseau : interrupteurs (gardés dans la base), ↶ Annuler ; bloc éteint', async () => {
            await p.evaluate(() => window.LCNDA_EXT.reseau.openSettings());
            await p.waitForSelector('[data-rs-settings]', {timeout: 15000});
            assert.match(await p.textContent('[data-rs-settings]'), /ASSO/);
            await p.click('[data-rs-tg="fiche"] input');
            await p.waitForFunction(async () => (await window.LCNDA_APP.api('reseau_settings')).settings.fiche === false, null, {timeout: 5000, polling: 300});
            await p.locator('text=↶ Annuler').last().click();
            await p.waitForFunction(async () => (await window.LCNDA_APP.api('reseau_settings')).settings.fiche === true, null, {timeout: 5000, polling: 300});
        });
        await t('pas d’erreur JavaScript ni PHP', async () => {
            assert.deepStrictEqual(errs, []);
            const bad = serverErr.split('\n').filter(l => /PHP (Fatal|Warning|Deprecated|Notice)|Uncaught/.test(l));
            assert.deepStrictEqual(bad.slice(0, 5), []);
        });
    } finally { await browser.close(); proc.kill(); }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
