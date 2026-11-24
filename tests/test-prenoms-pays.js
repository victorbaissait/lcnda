#!/usr/bin/env node
/* 📊 Prénoms d'ici et d'ailleurs (lib/prenoms_pays.php, assets/js/heritage-prenoms-pays.js, scripts/prenoms/build-prenoms.py,
 * .github/workflows/prenoms.yml) et la page « Prénoms : la famille et la France » (assets/js/heritage.js, lib/heritage.php).
 * Le « serveur » des données (la version « prenoms-donnees » du dépôt) est un dossier local (GENEALOGY_TEST=1 +
 * LCNDA_TEST_PRENOMS_DIR) : le petit pack d'essai de tests/fixtures/prenoms (build-prenoms.py --essai : quelques prénoms,
 * le Cantal et les pays entiers, chiffres et rangs RÉELS des fichiers de l'Insee, de l'OFS et de Retraite Québec), coupé en 2.
 *  1. Node : le sommaire d'essai, les mots (« dans le Cantal », « dans l’Ain »…), le prénom rangé comme l'Insee ;
 *  2. serveur : par tranches, reprendre, abandonner, incomplet refusé ; l'import à la main de l'Insee marche toujours ;
 *  3. la page : « ⤓ Installer » → installé (↶ Annuler) ; « Comparer avec » le Cantal ; 🗑 Supprimer (↶) ;
 *  4. la fiche : « 📊 En 1912 dans le Cantal, 1 fille sur 4 s’appelait Marie (rang 1) » ; « voir la courbe » ; le pays faute
 *     de département ; Suisse, Québec ; rien pour une personne en vie, confidentielle, ou née hors des années.
 *   node tests/test-prenoms-pays.js */
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
    const fx = path.join(root, 'tests/fixtures/prenoms');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-prenoms-pays-'));
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1', LCNDA_TEST_PRENOMS_DIR: fx};
    const php = code => spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], {cwd: root, encoding: 'utf8', env});

    await t('Node : le sommaire d’essai décrit bien ses morceaux (taille, empreinte)', async () => {
        const m = JSON.parse(fs.readFileSync(path.join(fx, 'prenoms-manifest.json'), 'utf8')).packs.pays;
        const buf = Buffer.concat(m.parts.map(x => fs.readFileSync(path.join(fx, x.name))));
        assert.strictEqual(buf.length, m.size); assert.strictEqual(crypto.createHash('sha256').update(buf).digest('hex'), m.sha256);
        assert.ok(m.parts.length >= 2, 'coupé en morceaux');
        const wf = fs.readFileSync(path.join(root, '.github/workflows/prenoms.yml'), 'utf8');
        assert.match(wf, /workflow_dispatch/); assert.match(wf, /prenoms-donnees/); assert.match(wf, /build-prenoms\.py/);
        const py = spawnSync('python3', ['-I', '-m', 'py_compile', path.join(root, 'scripts/prenoms/build-prenoms.py')], {encoding: 'utf8'});
        assert.strictEqual(py.status, 0, py.stderr);
    });
    await t('Node (PHP) : « dans le Cantal », « dans l’Ain », « dans les Vosges », « dans la Manche », « au Québec » ; MARIE-THERESE', async () => {
        const r = php(String.raw`require 'lib/paths.php'; require 'lib/bootstrap.php'; require 'lib/prenoms_pays.php';
$w = fn($n, $c = 'FR', $code = 'x') => pp_where(['country' => $c, 'code' => $code, 'name' => $n]);
echo json_encode([$w('Cantal'), $w('Ain'), $w('Vosges'), $w('Manche'), $w('Haute-Loire'), $w('Hérault'), $w('Paris'), $w('Québec', 'QC', ''), $w('France', 'FR', ''), pp_key('Marie-Thérèse Jeanne'), pp_key('Œdipe'),
  pp_place_zone(['name' => 'Aurillac', 'county' => 'Cantal', 'country' => 'France']), pp_place_zone(['name' => 'Ajaccio', 'country' => 'France', 'admin2_code' => '2A']), pp_place_zone(['name' => 'Montréal', 'state' => 'Québec', 'country' => 'Canada']),
  pp_place_zone(['name' => 'Genève', 'country' => 'Suisse']), pp_place_zone(['name' => 'Liège', 'country' => 'Belgique'])], JSON_UNESCAPED_UNICODE);`);
        const v = JSON.parse(r.stdout);
        assert.deepStrictEqual(v.slice(0, 9), ['dans le Cantal', 'dans l’Ain', 'dans les Vosges', 'dans la Manche', 'dans la Haute-Loire', 'dans l’Hérault', 'à Paris', 'au Québec', 'en France']);
        assert.deepStrictEqual(v.slice(9, 11), ['MARIE-THERESE', 'OEDIPE']);
        assert.deepStrictEqual(v.slice(11), [['FR', '15'], ['FR', '20'], ['QC', ''], ['CH', ''], null]);
    });

    const seed = php(String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start,is_private) VALUES
 (1,'Marie','MAZAUD','female','deceased',1,0),(2,'Jean','LACOMBE','male','deceased',0,0),(3,'Pierre','DURAND','male','living',0,0),
 (4,'Anne','DURAND','female','deceased',0,0),(5,'Marie','LACOMBE','female','deceased',0,0),(6,'Jeanne','MAZAUD','female','deceased',0,0),(7,'Marie','DURAND','female','deceased',0,1)");
$pdo->exec("INSERT INTO places(id,name,county,state,country) VALUES(1,'Aurillac','Cantal','','France'),(2,'Quelque part','','','France'),(3,'Montréal','','Québec','Canada'),(4,'Genève','','','Suisse')");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$ev = $pdo->prepare('INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES(?,?,?,?,?,?)');
foreach ([[1,1912,1],[2,1950,2],[3,1912,1],[4,1985,3],[5,1950,4],[6,1850,1],[7,1912,1]] as [$id,$y,$pl]) { $ev->execute(['person', $id, $t('BIRT'), (string) $y, $y, $pl]); }
foreach ([1,2,4,5,6,7] as $id) { $ev->execute(['person', $id, $t('DEAT'), '2000', 2000, null]); }
echo json_encode(['ok' => 1]);`);
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
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.graphStats?.firstnames_france, null, {timeout: 30000});
        // pas encore branché dans index.php : on charge les fichiers comme le ferait la page
        if (!(await p.evaluate(() => !!window.LCNDA_EXT?.prenomsPays))) { await p.addStyleTag({url: base + 'assets/css/prenoms-pays.css'}); await p.addScriptTag({url: base + 'assets/js/heritage-prenoms-pays.js'}); }
        await p.waitForFunction(() => window.LCNDA_EXT?.prenomsPays);
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);
        const openPerson = async id => { await p.evaluate(i => window.LCNDA_APP.openPersonById(i), id); await p.waitForSelector('.person-page', {timeout: 20000}); await sleep(900); };
        const openPage = async () => { await p.evaluate(() => { const A = window.LCNDA_APP; A.state.graphMode = 'stats'; A.state.graphStatsType = 'firstnames_france'; A.setModule('graphiques'); }); await p.waitForSelector('#h-prenoms-import', {state: 'attached', timeout: 20000}); await sleep(500); };
        const toastClick = async re => { await p.waitForFunction(r => [...document.querySelectorAll('.ui-toast')].some(x => new RegExp(r).test(x.textContent)), re, {timeout: 30000}); await p.evaluate(r => [...document.querySelectorAll('.ui-toast')].reverse().find(x => new RegExp(r).test(x.textContent)).querySelector('button').click(), re); await sleep(800); };
        const ppLine = async () => { await sleep(700); return p.evaluate(() => document.querySelector('#workspace .ppx-line')?.textContent || ''); };

        await t('rien d’installé : pas de ligne sur la fiche, le serveur le dit', async () => {
            assert.strictEqual((await api('prenoms_pays_status')).installed, false);
            assert.strictEqual((await api('prenoms_pays_person', {id: 1})).installed, false);
            await openPerson(1); assert.strictEqual(await ppLine(), '');
        });
        await t('serveur : le sommaire en ligne ; par tranches, reprendre, abandonner ; un pack incomplet n’est pas installé', async () => {
            const r = await api('prenoms_pays_dl_info'); assert.strictEqual(r.pack.parts.length, 2);
            const s = await post('prenoms_pays_dl_start', {}); assert.ok(s.id, JSON.stringify(s));
            const a = await post('prenoms_pays_dl_step', {id: s.id}); assert.strictEqual(a.received, r.pack.parts[0].size);
            const z = await api('prenoms_pays_dl_resume', {id: s.id}); assert.deepStrictEqual([z.exists, z.received], [true, r.pack.parts[0].size]);
            assert.match((await post('prenoms_pays_dl_finish', {id: s.id})).error || '', /incomplet/);
            assert.strictEqual((await api('prenoms_pays_dl_resume', {id: s.id})).exists, false);
            const s2 = await post('prenoms_pays_dl_start', {}); await post('prenoms_pays_dl_cancel', {id: s2.id});
            assert.strictEqual((await api('prenoms_pays_dl_resume', {id: s2.id})).exists, false);
        });
        await t('la page « Prénoms : la famille et la France » : l’import à la main de l’Insee marche toujours (#h-prenoms-import)', async () => {
            const csv = 'sexe;preusuel;annais;nombre\n2;MARIE;1912;43695\n2;MARIE;1913;43000\n1;JEAN;1950;38206\n2;_PRENOMS_RARES;1912;5\n';
            const r = await p.evaluate(async body => { const fd = new FormData(); fd.append('file', new File([body], 'nat.csv', {type: 'text/csv'})); fd.append('csrf', window.LCNDA_APP.state.csrf);
                const resp = await fetch('api.php?action=insee_prenoms_import', {method: 'POST', body: fd, headers: {'X-CSRF-Token': window.LCNDA_APP.state.csrf}}); return resp.json(); }, csv);
            assert.deepStrictEqual([r.ok, r.rows, r.from, r.to], [true, 3, 1912, 1950]);
            const d = await api('firstnames_france'); assert.strictEqual(d.meta.rows, 3); assert.ok(!d.meta.pack);
            await openPage();
            assert.match(await p.textContent('#workspace'), /3 lignes importées/);
        });
        await t('la page : « ⤓ Installer » → installé (↶ Annuler le retire) ; puis installé pour de bon', async () => {
            await p.waitForSelector('[data-ppx-dl]', {timeout: 20000});
            assert.match(await p.textContent('[data-ppx-dl]'), /Installer/);
            await p.click('[data-ppx-dl]');
            await toastClick('installées');
            assert.strictEqual((await api('prenoms_pays_status')).installed, false, '↶ Annuler');
            await openPage(); await p.waitForSelector('[data-ppx-dl]', {timeout: 20000}); await p.click('[data-ppx-dl]');
            await p.waitForFunction(() => /installées/.test([...document.querySelectorAll('.ui-toast')].map(x => x.textContent).join(' ')), null, {timeout: 30000});
            await sleep(1200);
            const st = await api('prenoms_pays_status'); assert.strictEqual(st.installed, true); assert.ok(st.fixture);
            assert.deepStrictEqual([...new Set(st.zones.map(z => z.country))].sort(), ['CH', 'FR', 'QC']);
            assert.ok(fs.existsSync(path.join(tmp, 'prenoms', 'prenoms-pays.sqlite')), 'dans le dossier des données');
            assert.strictEqual(await p.evaluate(() => localStorage.getItem('genealogie-prenoms-pays-dl')), null);
            await p.waitForSelector('#h-names-zone', {timeout: 20000});
            assert.match(await p.textContent('#workspace'), /Comparé avec : France \(1900–2023\)/);
        });
        await t('la page : « Comparer avec » le Cantal → la colonne et la phrase suivent ; le choix est retenu', async () => {
            const cantal = (await api('prenoms_pays_status')).zones.find(z => z.code === '15');
            await p.selectOption('#h-names-zone', String(cantal.id)); await sleep(1200);
            const txt = await p.textContent('#workspace');
            assert.match(txt, /Comparé avec : Cantal/); assert.match(txt, /au sommet dans le Cantal vers/);
            assert.strictEqual(await p.evaluate(() => localStorage.getItem('genealogie-prenoms-zone')), String(cantal.id));
            const d = await api('firstnames_france', {zone: cantal.id}); const m = d.names.find(x => x.name === 'Marie');
            assert.strictEqual(m.series[1912], 380, 'Insee, Cantal, 1912 : 380 Marie');
            await p.selectOption('#h-names-zone', '0'); await sleep(800);
        });
        await t('la fiche : « 📊 En 1912 dans le Cantal, 1 fille sur 4 s’appelait Marie (rang 1) »', async () => {
            const r = await api('prenoms_pays_person', {id: 1});
            assert.deepStrictEqual([r.line.n, r.line.total, r.line.rank, r.line.one_in], [380, 1391, 1, 4]);
            await openPerson(1);
            const line = await ppLine();
            assert.match(line, /En 1912 dans le Cantal, 1 fille sur 4 s’appelait Marie \(rang 1\)/);
            assert.match(line, /voir la courbe/); assert.match(line, /Insee/);
        });
        await t('« voir la courbe » : le Cantal et la France, l’année marquée, la source', async () => {
            await p.click('[data-ppx-curve]');
            await p.waitForSelector('.ppx-chart', {timeout: 10000});
            const txt = await p.evaluate(() => document.querySelector('dialog[open]').textContent);
            assert.match(txt, /Marie au fil des années/); assert.match(txt, /Cantal/); assert.match(txt, /France/);
            assert.match(txt, /en 1912 : 380 sur 1\s391/); assert.match(txt, /Licence Ouverte/);
            assert.strictEqual(await p.$$eval('dialog[open] .ppx-chart polyline', l => l.length), 2);
            await p.evaluate(() => document.querySelector('dialog[open]').close());
        });
        await t('la fiche : faute de département, le pays (Jean, 1950, France : 1 garçon sur 12, rang 1)', async () => {
            await openPerson(2); assert.match(await ppLine(), /En 1950 en France, 1 garçon sur 12 s’appelait Jean \(rang 1\)/);
        });
        await t('la fiche : Québec (Anne, 1985 : 1 fille sur 364, rang 76) et Suisse (personnes qui vivent en Suisse)', async () => {
            await openPerson(4); assert.match(await ppLine(), /En 1985 au Québec, 1 fille sur 364 s’appelait Anne \(rang 76\)/);
            await openPerson(5); assert.match(await ppLine(), /Parmi les femmes nées en 1950 qui vivent en Suisse, 1 sur 73 s’appelle Marie \(rang 12\)/);
        });
        await t('jamais pour une personne en vie, confidentielle, ou née hors des années du fichier', async () => {
            for (const id of [3, 7, 6]) {
                const r = await api('prenoms_pays_person', {id}); assert.strictEqual(r.line, null, `fiche ${id}`);
                await openPerson(id); assert.strictEqual(await ppLine(), '', `fiche ${id}`);
            }
            assert.strictEqual((await api('prenoms_pays_person', {id: 3})).why, 'hidden');
            assert.strictEqual((await api('prenoms_pays_person', {id: 6})).why, 'years');
        });
        await t('la case « Montrer la petite ligne » : décochée, plus de ligne sur la fiche', async () => {
            await openPage(); await p.waitForSelector('[data-ppx-fiche]', {timeout: 20000});
            await p.click('[data-ppx-fiche]'); await sleep(300);
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-prenoms-pays')).fiche), false);
            await openPerson(1); assert.strictEqual(await ppLine(), '');
            await p.evaluate(() => localStorage.setItem('genealogie-prenoms-pays', JSON.stringify({fiche: true})));
        });
        await t('À propos des données : les sources, leurs licences, et les pays absents (Belgique, Luxembourg)', async () => {
            await openPage(); await p.click('[data-ppx-about]');
            await p.waitForSelector('dialog[open]', {timeout: 10000});
            const txt = await p.evaluate(() => document.querySelector('dialog[open]').textContent);
            assert.match(txt, /Insee/); assert.match(txt, /CC BY 4\.0/); assert.match(txt, /OPEN-BY/); assert.match(txt, /Belgique/); assert.match(txt, /Luxembourg/);
            assert.match(txt, /1900–2023/);
            await p.evaluate(() => document.querySelector('dialog[open]').close());
        });
        await t('🗑 Supprimer → plus de ligne ; ↶ Annuler remet les données', async () => {
            await p.click('[data-ppx-remove]');
            await p.waitForFunction(() => /supprimées/.test([...document.querySelectorAll('.ui-toast')].map(x => x.textContent).join(' ')), null, {timeout: 20000});
            assert.strictEqual((await api('prenoms_pays_status')).installed, false);
            assert.strictEqual((await api('prenoms_pays_person', {id: 1})).line, null);
            assert.ok(!(await api('firstnames_france')).meta.pack, 'la page retombe sur le fichier importé à la main');
            await toastClick('supprimées');
            assert.strictEqual((await api('prenoms_pays_status')).installed, true);
        });
        await t('aucune erreur de page', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(fails ? `${fails} échec(s)` : 'tout est bon');
    process.exit(fails ? 1 : 0);
})();
