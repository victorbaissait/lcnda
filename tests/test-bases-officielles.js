#!/usr/bin/env node
/* 🎖️ Morts pour la France 1914–1918 et 🏅 Léonore (lib/bases_officielles.php, assets/js/heritage-bases-officielles.js,
 * scripts/bases-officielles/build-bases.py, .github/workflows/bases-officielles.yml).
 * Les packs d'essai sont fabriqués par le vrai programme à partir de quelques vraies lignes des sources
 * (scripts/bases-officielles/fixture-*.csv ; quelques noms changés en MAZAUD, LACOMBE, DURAND).
 * Le « serveur » des données (la version « bases-officielles-donnees » du dépôt) est un dossier local (GENEALOGY_TEST=1 + LCNDA_TEST_BO_DIR).
 *  1. fabrication : dates, noms, lieux, liens vers la fiche numérisée refaits à l'identique, clés des noms (Python = PHP) ;
 *  2. serveur : le sommaire, par tranches, reprendre, abandonner, un pack incomplet refusé ;
 *  3. fiche : l'offre discrète (✕ retenu, ↶) → Réglages « ⤓ Installer » (↶ Annuler) → « Peut-être dans … », lien en ligne,
 *     « ＋ Ajouter comme source (à vérifier) » (↶ Annuler) ; un autre département écarte la fiche ; une femme dans la Léonore ;
 *  4. la recherche par nom ; LCNDA_EXT.officialBases.suggest() pour « Où chercher » ; 🗑 Supprimer (↶).
 *   node tests/test-bases-officielles.js */
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
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-bo-')), fx = path.join(tmp, 'fx'), site = path.join(tmp, 'site');
    [path.join(tmp, 'media'), site].forEach(d => fs.mkdirSync(d, {recursive: true}));
    const script = path.join(root, 'scripts/bases-officielles/build-bases.py');
    const mk = spawnSync('python3', ['-I', script, 'fixture', fx], {encoding: 'utf8'});
    if (mk.status !== 0) { console.error(mk.stderr || mk.stdout); process.exit(1); }
    const rep = JSON.parse(mk.stdout);
    const phpPath = findPhp([devBundledPhp()]) || 'php';

    /* ── 1. la fabrication ── */
    await t('fabrication : les vraies lignes lues (Canopé, Nancy 1GM seulement, Léonore), dates et lieux remis d’aplomb', async () => {
        assert.deepStrictEqual([rep.mpf.records, rep.mpf.sources.canope.gardées, rep.mpf.sources.nancy.gardées, rep.leonore.records, rep.leonore.liens_wikidata], [9, 5, 4, 6, 1]);
        const q = spawnSync('python3', ['-I', '-c', `
import sqlite3, json, sys
m = sqlite3.connect(sys.argv[1]); l = sqlite3.connect(sys.argv[2])
print(json.dumps({'mazaud': m.execute("select nom,prenoms,naiss,lieu,dep,deces,lieu_deces,unite,ref from records where nom='MAZAUD'").fetchone(),
  'cary': m.execute("select nom,naiss,lieu_deces from records where nom='CARY'").fetchone(), 'ww2': m.execute("select count(*) from records where nom='ADAMY'").fetchone()[0],
  'lacombe': l.execute("select nom,prenoms,naiss,lieu,dep,cote,ref,autre from records where nom='LACOMBE'").fetchone(),
  'ahmed': l.execute("select naiss,lieu,dep from records where nom like 'AHMED%'").fetchone(), 'names': [r[0] for r in l.execute("select cle from names where id=5 order by cle")],
  'meta': dict(l.execute('select key,value from meta').fetchall())}))`, path.join(fx, 'bo-mpf.sqlite'), path.join(fx, 'bo-leonore.sqlite')], {encoding: 'utf8'});
        const d = JSON.parse(q.stdout);
        assert.deepStrictEqual(d.mazaud, ['MAZAUD', 'Jean Victor', '1892-05-06', 'Gap', '05', '1914-08-28', 'Ménil-sur-Belvitte (88)', "157e régiment d'infanterie (157e RI)", 'v:1253111']);
        assert.deepStrictEqual(d.cary, ['CARY', '1895-11-28', 'Ferme du Pantheon, Chemin des Dames (02)'], 'la ligne « entre guillemets » de Nancy est lue');
        assert.strictEqual(d.ww2, 0, 'seulement 1914–1918');
        assert.deepStrictEqual(d.lacombe, ['LACOMBE', 'Lucien', '1872-02-11', 'Nancy', '54', '19800035/1303/50521', 'w:3', 'autre nom : Georges DELAHACHE']);
        assert.deepStrictEqual(d.ahmed, ['1820', 'Beni-Mahalla', null], '« 1820/00/00 » → 1820');
        assert.deepStrictEqual(d.names, ['DURAND', 'MAZAUD'], 'le nom de jeune fille sert aussi à chercher');
        assert.strictEqual(d.meta.kind, 'leonore'); assert.strictEqual(d.meta.fixture, '1');
    });
    await t('fabrication : les clés des noms sont les mêmes en Python et en PHP ; le lien de la fiche numérisée est refait à l’identique', async () => {
        const words = ['Le Bœuf', 'de La Tour-d’Auvergne', 'ZIVRÉ', 'Lacombe', 'Ménil', 'Çà'];
        const py = spawnSync('python3', ['-I', '-c', `import importlib.util, json, sys
s = importlib.util.spec_from_file_location('b', sys.argv[1]); b = importlib.util.module_from_spec(s); s.loader.exec_module(b)
print(json.dumps([b.cle(w) for w in json.loads(sys.argv[2])]))`, script, JSON.stringify(words)], {encoding: 'utf8'});
        const php = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require 'lib/paths.php'; require 'lib/bootstrap.php'; require 'lib/bases_officielles.php';
echo json_encode(['keys' => array_map('bo_key', json_decode($argv[1], true)), 'url' => bo_record_url('mpf', ['ref' => 'v:1253111']), 'lh' => bo_record_url('leonore', ['ref' => 'w:3']), 'none' => bo_record_url('leonore', ['ref' => ''])]);`, JSON.stringify(words)], {cwd: root, encoding: 'utf8', env: {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_SKIP_REFERENCE: '1'}});
        const p = JSON.parse(php.stdout.slice(php.stdout.indexOf('{')));
        assert.deepStrictEqual(JSON.parse(py.stdout), p.keys);
        assert.deepStrictEqual(p.keys.slice(0, 3), ['LEBOEUF', 'DELATOURDAUVERGNE', 'ZIVRE']);
        const orig = fs.readFileSync(path.join(root, 'scripts/bases-officielles/fixture-canope.csv'), 'utf8').split('\n')[1].split(',')[0];
        assert.strictEqual(p.url, orig.replace(/^http:/, 'https:'), 'le lien de la liste Canopé');
        assert.strictEqual(p.lh, 'https://www.leonore.archives-nationales.culture.gouv.fr/ui/notice/3');
        assert.strictEqual(p.none, '');
    });

    /* ── le « serveur » : bo-mpf en 2 morceaux, bo-leonore en 1, + un pack mal décrit ── */
    const packs = {};
    for (const [k, n] of [['mpf', 2], ['leonore', 1]]) {
        const buf = fs.readFileSync(path.join(fx, `bo-${k}.sqlite.gz`)), cut = n === 2 ? [0, Math.floor(buf.length / 2), buf.length] : [0, buf.length];
        const parts = cut.slice(0, -1).map((c, i) => { const name = `bo-${k}.sqlite.gz.00${i}`; fs.writeFileSync(path.join(site, name), buf.subarray(c, cut[i + 1])); return {name, size: cut[i + 1] - c}; });
        packs[k] = {size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex'), built: '2026-11-24', records: rep[k].records, sqlite_size: rep[k].sqlite_size, parts};
    }
    fs.writeFileSync(path.join(site, 'bases-officielles-manifest.json'), JSON.stringify({version: '2026-11', packs: {...packs, autre: {size: 5, parts: [{name: 'x', size: 5}]}}}));

    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1', LCNDA_TEST_BO_DIR: site};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','MAZAUD','male','deceased',1),(2,'Lucien','LACOMBE','male','deceased',0),(3,'Marie Louise','DURAND','female','deceased',0),(4,'Michel','DURAND','male','deceased',0),(5,'Paul','LACOMBE','male','living',0)");
$pdo->exec("INSERT INTO places(id,name,county,country,admin2_code) VALUES(1,'Gap, Hautes-Alpes, France','Hautes-Alpes','France','05'),(2,'Nancy','Meurthe-et-Moselle','France','54'),(3,'Paris','Paris','France','75'),(4,'Lyon','Rhône','France','69')");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$ev = $pdo->prepare('INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES(?,?,?,?,?,?)');
$ev->execute(['person', 1, $t('BIRT'), '6 mai 1892', 1892, 1]); $ev->execute(['person', 1, $t('DEAT'), '1914', 1914, null]);
$ev->execute(['person', 2, $t('BIRT'), '1872', 1872, 2]);
$ev->execute(['person', 3, $t('BIRT'), '1881', 1881, 3]);
$ev->execute(['person', 4, $t('BIRT'), '1884', 1884, 4]);
$ev->execute(['person', 5, $t('BIRT'), '1950', 1950, 2]);
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
        // pas encore branché dans index.php : on charge les fichiers comme le ferait la page
        if (!(await p.evaluate(() => !!window.LCNDA_EXT?.officialBases))) { await p.addStyleTag({url: 'assets/css/bases-officielles.css'}); await p.addScriptTag({url: 'assets/js/heritage-bases-officielles.js'}); }
        await p.waitForFunction(() => window.LCNDA_EXT?.officialBases);
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);
        const openPerson = async id => { await p.evaluate(i => window.LCNDA_APP.openPersonById(i), id); await p.waitForSelector('.person-page', {timeout: 20000}); await sleep(900); };
        const toastWait = re => p.waitForFunction(r => [...document.querySelectorAll('.ui-toast')].some(x => new RegExp(r).test(x.textContent)), re, {timeout: 30000});
        const toastClick = async re => { await toastWait(re); await p.evaluate(r => [...document.querySelectorAll('.ui-toast')].reverse().find(x => new RegExp(r).test(x.textContent)).querySelector('button').click(), re); await sleep(900); };
        const settings = async () => { await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'bases_officielles'; A.setModule('maintenance'); }); await p.waitForSelector('.bo-set [data-bo-row="mpf"]', {timeout: 20000}); };
        const sources = () => spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `$p = new PDO('sqlite:' . $argv[1]); echo json_encode($p->query("SELECT s.title, s.url, s.text, sl.entity_id, sl.note FROM sources s JOIN source_links sl ON sl.source_record_id=s.id")->fetchAll(PDO::FETCH_ASSOC));`, path.join(tmp, 'genealogy.sqlite')], {encoding: 'utf8'});

        await t('Réglages : la page « 🎖️ Bases officielles » est juste après la météo ; rien d’installé au départ', async () => {
            const tabs = await p.evaluate(() => window.LCNDA_APP.defaultMaintenanceTabs.map(x => x[0]));
            assert.strictEqual(tabs[tabs.indexOf('meteo') + 1], 'bases_officielles');
            const st = await api('bo_status'); assert.strictEqual(st.bases.mpf.installed, false); assert.strictEqual(st.bases.leonore.installed, false);
            const d = await api('bo_person', {id: 1}); assert.deepStrictEqual([d.bases.mpf.could, d.bases.mpf.matches.length, d.bases.leonore.could], [true, 0, true]);
            assert.strictEqual((await api('bo_person', {id: 3})).bases.mpf.could, false, 'une femme : pas dans les Morts pour la France');
            assert.strictEqual((await api('bo_person', {id: 5})).bases.mpf.could, false, 'né en 1950');
        });
        await t('fiche : l’offre discrète « ⤓ Installer la base … » ; ✕ retenu (genealogie-bases-officielles) et ↶ Annuler', async () => {
            await openPerson(1);
            await p.waitForSelector('.bo-person [data-bo-offer="mpf"]', {timeout: 20000});
            assert.ok(await p.$('.bo-person [data-bo-offer="leonore"]'));
            await p.waitForFunction(() => /Installer la base Morts pour la France \(\d/.test(document.querySelector('[data-bo-offer="mpf"]').textContent), null, {timeout: 20000});
            await p.click('[data-bo-dismiss="leonore"]'); await sleep(400);
            assert.ok(!(await p.$('.bo-person [data-bo-offer="leonore"]')), 'plus proposée');
            assert.deepStrictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-bases-officielles'))), {dismiss: {leonore: true}});
            await toastClick('ne sera plus proposée');
            assert.ok(await p.$('.bo-person [data-bo-offer="leonore"]'), '↶ Annuler');
            await openPerson(5);
            assert.ok(!(await p.$('.bo-person [data-bo-offer="mpf"]')), 'pas d’offre Morts pour la France pour un homme né en 1950');
            assert.ok(await p.$('.bo-person [data-bo-offer="leonore"]'));
        });
        await t('serveur : le sommaire (un pack mal décrit écarté) ; par tranches, reprendre, abandonner ; incomplet refusé', async () => {
            const r = await api('bo_dl_info'); assert.deepStrictEqual(Object.keys(r.packs).sort(), ['leonore', 'mpf']); assert.strictEqual(r.packs.mpf.parts.length, 2);
            const s = await post('bo_dl_start', {kind: 'mpf'}); assert.ok(s.id, JSON.stringify(s));
            const a = await post('bo_dl_step', {id: s.id}); assert.strictEqual(a.received, packs.mpf.parts[0].size, 'le 1er morceau');
            const z = await api('bo_dl_resume', {id: s.id}); assert.deepStrictEqual([z.exists, z.kind, z.received], [true, 'mpf', packs.mpf.parts[0].size]);
            assert.match((await post('bo_dl_finish', {id: s.id})).error || '', /incomplet/);
            assert.strictEqual((await api('bo_dl_resume', {id: s.id})).exists, false);
            const c = await post('bo_dl_start', {kind: 'leonore'}); await post('bo_dl_cancel', {id: c.id}); assert.strictEqual((await api('bo_dl_resume', {id: c.id})).exists, false);
            assert.match((await post('bo_dl_start', {kind: 'autre'})).error || '', /inconnue/);
        });
        await t('Réglages : « ⤓ Installer » → installée et vérifiée, ↶ Annuler la retire ; puis les deux bases installées (dans le dossier des données)', async () => {
            await settings();
            await p.waitForSelector('[data-bo-row="mpf"] [data-bo-install="mpf"]', {timeout: 20000});
            assert.match(await p.textContent('[data-bo-row="mpf"]'), /Installer \(\d/);
            await p.click('[data-bo-install="mpf"]');
            await toastClick('Morts pour la France 1914–1918 installée \\(9 fiches\\)');
            assert.strictEqual((await api('bo_status')).bases.mpf.installed, false, '↶ Annuler');
            await p.waitForSelector('[data-bo-install="mpf"]', {timeout: 20000}); await p.click('[data-bo-install="mpf"]');
            await toastWait('Morts pour la France 1914–1918 installée');
            await p.waitForSelector('[data-bo-install="leonore"]', {timeout: 20000}); await p.click('[data-bo-install="leonore"]');
            await toastWait('Léonore installée \\(6 fiches\\)');
            await sleep(600);
            const st = await api('bo_status');
            assert.deepStrictEqual([st.bases.mpf.installed, st.bases.mpf.records, st.bases.leonore.installed, st.bases.leonore.records, st.bases.mpf.fixture], [true, 9, true, 6, true]);
            assert.ok(fs.existsSync(path.join(tmp, 'bases-officielles', 'bo-mpf.sqlite')) && fs.existsSync(path.join(tmp, 'bases-officielles', 'bo-leonore.sqlite')));
            await p.waitForSelector('[data-bo-row="leonore"] [data-bo-remove]', {timeout: 20000});
            const txt = await p.textContent('.bo-set');
            assert.match(txt, /ODC-BY/); assert.match(txt, /ODbL/); assert.match(txt, /Archives nationales, base Léonore/); assert.match(txt, /À propos des données/);
            assert.deepStrictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-bases-officielles-dl') || '{}')), {});
        });
        await t('fiche : « 🎖️ Peut-être dans Morts pour la France » — la fiche, pourquoi, le lien vers la fiche numérisée', async () => {
            await openPerson(1);
            await p.waitForSelector('.bo-hit[data-bo-base="mpf"]', {timeout: 20000});
            const txt = await p.textContent('.bo-hit[data-bo-base="mpf"]');
            assert.match(txt, /Peut-être dans Morts pour la France/); assert.match(txt, /MAZAUD Jean Victor/); assert.match(txt, /6 mai 1892 à Gap \(05\)/);
            assert.match(txt, /28 août 1914 à Ménil-sur-Belvitte/); assert.match(txt, /157e régiment d'infanterie/); assert.match(txt, /même lieu de naissance \(Gap\)/); assert.match(txt, /Réseau Canopé/);
            const href = await p.getAttribute('.bo-hit[data-bo-base="mpf"] a[target="_blank"]', 'href');
            assert.match(href, /^https:\/\/www\.memoiredeshommes\.sga\.defense\.gouv\.fr\/fr\/arkotheque\/arkotheque_visionneuse_archives\.php\?arko=/);
            assert.ok(!(await p.$('.bo-hit[data-bo-base="leonore"]')), 'pas dans la Léonore');
            assert.ok(!(await p.$('[data-bo-offer]')), 'les deux bases sont là : plus d’offre');
        });
        await t('fiche : « ＋ Ajouter comme source (à vérifier) » → la source sur sa fiche ; ↶ Annuler la retire', async () => {
            await p.click('.bo-hit[data-bo-base="mpf"] [data-bo-add]');
            await toastWait('Source ajoutée, à vérifier');
            await p.waitForSelector('.bo-hit .bo-added', {timeout: 20000});
            let s = JSON.parse(sources().stdout);
            assert.strictEqual(s.length, 1); assert.match(s[0].title, /^Morts pour la France 1914–1918 — MAZAUD Jean Victor \(1892\)$/);
            assert.match(s[0].text, /À VÉRIFIER : est-ce bien Jean MAZAUD/); assert.match(s[0].text, /ODC-BY/); assert.match(s[0].url, /arkotheque/); assert.strictEqual(s[0].entity_id, 1); assert.match(s[0].note, /À vérifier/);
            assert.match((await post('bo_add', {person_id: 1, kind: 'mpf', id: 1})).error || '', /déjà une source/);
            await toastClick('Source ajoutée, à vérifier');
            assert.strictEqual(JSON.parse(sources().stdout).length, 0, '↶ Annuler');
            await p.waitForSelector('.bo-hit[data-bo-base="mpf"] [data-bo-add]', {timeout: 20000});
            // ajoutée de nouveau, puis « ↶ Annuler » à côté de « ✓ Ajouté »
            await p.click('.bo-hit[data-bo-base="mpf"] [data-bo-add]'); await p.waitForSelector('[data-bo-unadd]', {timeout: 20000});
            assert.strictEqual(JSON.parse(sources().stdout).length, 1);
            await p.click('[data-bo-unadd]'); await p.waitForSelector('.bo-hit[data-bo-base="mpf"] [data-bo-add]', {timeout: 20000});
            assert.strictEqual(JSON.parse(sources().stdout).length, 0);
        });
        await t('fiche : un autre département de naissance écarte la fiche (DURAND Michel, né à Lyon ; la liste : né à Gap)', async () => {
            const d = await api('bo_person', {id: 4});
            assert.strictEqual(d.person.dep, '69'); assert.strictEqual(d.bases.mpf.matches.length, 0);
            await openPerson(4);
            assert.ok(!(await p.$('.bo-hit')));
        });
        await t('fiche : « 🏅 Peut-être dans la Léonore » — la cote, le lien vers la notice (Wikidata) ; une femme sous son nom d’épouse', async () => {
            await openPerson(2);
            await p.waitForSelector('.bo-hit[data-bo-base="leonore"]', {timeout: 20000});
            const txt = await p.textContent('.bo-hit[data-bo-base="leonore"]');
            assert.match(txt, /Peut-être dans la Léonore/); assert.match(txt, /LACOMBE Lucien/); assert.match(txt, /cote 19800035\/1303\/50521/); assert.match(txt, /11 février 1872 à Nancy \(54\)/);
            assert.strictEqual(await p.getAttribute('.bo-hit[data-bo-base="leonore"] a[target="_blank"]', 'href'), 'https://www.leonore.archives-nationales.culture.gouv.fr/ui/notice/3');
            await openPerson(3);
            await p.waitForSelector('.bo-hit[data-bo-base="leonore"]', {timeout: 20000});
            const t3 = await p.textContent('.bo-hit[data-bo-base="leonore"]');
            assert.match(t3, /DURAND Marie/); assert.match(t3, /née MAZAUD/); assert.match(t3, /né\(e\) en 1882 \(sa fiche : 1881\)/); assert.match(t3, /Chercher sur le site Léonore/);
        });
        await t('la recherche par nom : depuis la fiche (« 🔎 Chercher ce nom dans la base ») et dans les Réglages', async () => {
            await p.click('.bo-hit[data-bo-base="leonore"] [data-bo-search]');
            await p.waitForSelector('.bo-search-page .bo-results .bo-rec', {timeout: 20000});
            assert.match(await p.textContent('.bo-search-page'), /DURAND Marie/);
            await p.fill('.bo-form [name="nom"]', 'aar'); await p.click('.bo-form [type="submit"]');
            await p.waitForFunction(() => document.querySelectorAll('.bo-search-page .bo-rec').length === 3, null, {timeout: 20000});
            await p.fill('.bo-form [name="prenom"]', 'Luc'); await p.click('.bo-form [type="submit"]');
            await p.waitForFunction(() => document.querySelectorAll('.bo-search-page .bo-rec').length === 1, null, {timeout: 20000});
            assert.match(await p.textContent('.bo-search-page .bo-rec'), /AARON Lucien Isaac/);
            await p.selectOption('.bo-form [name="kind"]', 'mpf'); await p.fill('.bo-form [name="nom"]', 'La'); await p.fill('.bo-form [name="prenom"]', ''); await p.click('.bo-form [type="submit"]');
            await p.waitForFunction(() => /LACOMBE Charles Louis/.test(document.querySelector('.bo-search-page')?.textContent || ''), null, {timeout: 20000});
            await p.click('[data-bo-back]'); await p.waitForSelector('.bo-set [data-bo-row="mpf"]');
            assert.strictEqual((await api('bo_search', {kind: 'mpf', nom: 'M'})).short, true);
        });
        await t('« Où chercher » : LCNDA_EXT.officialBases.suggest(person) — en local quand c’est installé', async () => {
            const s = await p.evaluate(async () => (await window.LCNDA_EXT.officialBases.suggest({id: 1})).map(x => ({id: x.id, local: x.local, count: x.count, why: x.why, url: x.url, open: typeof x.open})));
            assert.deepStrictEqual(s.map(x => [x.id, x.local, x.count]), [['bo_mpf', true, 1], ['bo_leonore', true, 0]]);
            assert.match(s[0].url, /arkotheque/); assert.strictEqual(s[0].open, 'function'); assert.match(s[1].why, /Rien sous son nom/);
            if (await p.evaluate(() => typeof window.LCNDA_EXT.ouChercher?.openPerson === 'function')) {
                await p.evaluate(() => window.LCNDA_EXT.ouChercher.openPerson(1));
                await p.waitForSelector('.bo-ouc [data-bo-ouc="mpf"]', {timeout: 20000});
                assert.match(await p.textContent('.bo-ouc'), /1 fiche\(s\) qui lui ressemblent/);
            }
        });
        await t('le bloc est avec les blocs de contexte de la fiche ; il s’éteint dans les Réglages (genealogie-bases-officielles, ↶) ; caché quand il n’a rien à dire', async () => {
            const keys = await p.evaluate(() => window.LCNDA_APP.defaultPersonBlocks.map(b => b[0]));
            const i = keys.indexOf('bases_officielles'), before = ['histoire', 'monde_contexte', 'world'].map(k => keys.indexOf(k)).find(x => x >= 0);
            assert.ok(i > 0 && (before === undefined || i === before + 1), JSON.stringify(keys.slice(Math.max(0, i - 3), i + 2)));
            await openPerson(4);
            assert.strictEqual(await p.$eval('.bo-card', c => c.hidden), true, 'rien à dire : le bloc est caché');
            await settings();
            await p.click('label:has([data-bo-on])'); await sleep(300);
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-bases-officielles')).off), true);
            await openPerson(1);
            assert.ok(!(await p.$('.bo-card')), 'éteint : pas de bloc');
            await settings(); await p.click('label:has([data-bo-on])'); await sleep(300);
            await openPerson(1); await p.waitForSelector('.bo-card:not([hidden]) .bo-hit', {timeout: 20000});
            assert.match(await p.textContent('.bo-card .bo-more summary'), /▸ plus/);
        });
        await t('🧰 registre commun (LCNDA_EXT.dataSources) : chaque base, pour n’importe quelle personne, quand on veut', async () => {
            const ds = await p.evaluate(() => window.LCNDA_EXT.dataSources.filter(d => d.id.startsWith('bases_officielles_')).map(d => ({id: d.id, group: d.group, needs: d.needs})));
            assert.deepStrictEqual(ds.map(d => d.id), ['bases_officielles_mpf', 'bases_officielles_leonore']);
            assert.deepStrictEqual(ds[0].needs, ['person']);
            const out = await p.evaluate(async () => {
                const h = document.createElement('div'); document.body.appendChild(h);
                const d = window.LCNDA_EXT.dataSources.find(x => x.id === 'bases_officielles_mpf');
                const inst = await d.installed(); await d.run({person: {id: 1}}, h); const a = h.textContent;
                await window.LCNDA_EXT.dataSources.find(x => x.id === 'bases_officielles_leonore').run({person: {id: 1}}, h); const b = h.textContent; h.remove();
                return {inst, a, b};
            });
            assert.strictEqual(out.inst, true); assert.match(out.a, /MAZAUD Jean Victor/); assert.match(out.b, /Personne de ce nom/);
        });
        await t('Réglages : « 🗑 Supprimer » puis ↶ Annuler la remet ; sans la base, « Où chercher » propose le site en ligne et l’installation', async () => {
            await settings();
            await p.click('[data-bo-remove="mpf"]');
            await toastWait('supprimée');
            assert.strictEqual((await api('bo_status')).bases.mpf.installed, false);
            const s = await p.evaluate(async () => (await window.LCNDA_EXT.officialBases.suggest({id: 1})).map(x => ({id: x.id, local: x.local, url: x.url, install: typeof x.install})));
            assert.deepStrictEqual(s[0], {id: 'bo_mpf', local: false, url: 'https://www.memoiredeshommes.sga.defense.gouv.fr/', install: 'function'});
            await toastClick('supprimée');
            assert.strictEqual((await api('bo_status')).bases.mpf.installed, true, '↶ Annuler');
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally { await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    console.log(fails ? `${fails} essai(s) en échec` : 'Les bases officielles marchent.');
    process.exit(fails ? 1 : 0);
})();
