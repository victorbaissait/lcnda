#!/usr/bin/env node
/* ⤓ Décès INSEE : « Tout installer (1970 → aujourd'hui) » en un bouton, en arrière-plan, et les mises à jour
 * (lib/insee_remote.php : insee_maj_* ; assets/js/app-recherche.js : le cadre, la barre, l'avis « 🆕 Nouveau fichier »).
 * data.gouv.fr est remplacé par un dossier local (GENEALOGY_TEST=1 + LCNDA_TEST_INSEE_DIR) : dataset.json + petits fichiers
 * en positions fixes (lignes de 198 caractères + CRLF, comme les vrais), un .zip, un fichier à l'empreinte fausse.
 *  1. serveur : liste, ordre, trimestres en doublon écartés, par petits pas, pause, reprise dans un autre processus (= app fermée),
 *     sans doublon ; mise à jour (le fichier de l'année remplace les mois, retirés) ; fichier abîmé ; hors ligne ; retirer une année ;
 *  2. dans l'app : « ⤓ Tout installer » → barre → pause → rechargée → reprendre ; « Seulement certaines années… » (la place) ;
 *     reprise toute seule à l'ouverture ; « 🆕 Nouveau fichier des décès » → « ⤓ Mettre à jour » ; « 🗑 Retirer » → « ↶ Annuler » ;
 *     la recherche dans l'index marche toujours ; mode consultation : rien n'est proposé, rien n'est écrit.
 *   node tests/test-insee-maj.js */
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
const phpPath = findPhp([devBundledPhp()]) || 'php';
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── le faux data.gouv.fr ───
const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
const NOMS = ['MARTIN', 'BERNARD', 'DUBOIS', 'THOMAS', 'ROBERT', 'PETIT', 'DURAND', 'LEROY', 'MOREAU', 'MAZAUD'];
const line = (y, m, i, nom) => pad(pad((nom || NOMS[i % NOMS.length]) + '*' + (i % 2 ? 'MARIE LOUISE' : 'JEAN') + '/', 80) + (i % 2 ? '2' : '1') + `${y - 80}0412` + '59279' + pad('HALLUIN', 30) + pad('', 30)
    + `${y}${String(m).padStart(2, '0')}${String(1 + i % 28).padStart(2, '0')}` + '59350' + pad(String(i), 9), 198);
const URL0 = 'https://static.data.gouv.fr/resources/fichier-des-personnes-decedees/2026/';
function mkSite(site, files, extra = []) {
    fs.mkdirSync(site, {recursive: true});
    const res = [];
    for (const f of files) {
        const p = path.join(site, f.name);
        if (!f.keep) {
            const lines = [];
            for (let i = 0; i < f.n; i++) lines.push(line(f.y, f.m ? f.m : 1 + i % 12, i, i === 0 ? f.first : ''));
            const txt = lines.join('\r\n') + '\r\n';
            if (f.zip) { const zip = spawnSync(phpPath, ['-r', `$z=new ZipArchive();$z->open('${p}',ZipArchive::CREATE|ZipArchive::OVERWRITE);$z->addFromString('${f.name.replace('.zip', '.txt')}',stream_get_contents(STDIN));$z->close();`], {input: txt}); if (zip.status) throw new Error(String(zip.stderr)); }
            else fs.writeFileSync(p, txt);
        }
        const sha1 = crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex');
        res.push({url: URL0 + f.name, title: f.name, filesize: fs.statSync(p).size, last_modified: '2026-11-10T08:00:00', checksum: f.sha1 === false ? null : {type: 'sha1', value: f.badSha1 ? '0'.repeat(40) : sha1}});
    }
    res.push(...extra);
    fs.writeFileSync(path.join(site, 'dataset.json'), JSON.stringify({resources: res}));
}
const V1 = [
    {name: 'deces-2022.zip', y: 2022, n: 700, zip: true},
    {name: 'deces-2023.txt', y: 2023, n: 1500, first: 'BAISSAIT'},
    {name: 'deces-2024.txt', y: 2024, n: 2000, sha1: false},
    {name: 'deces-2025-m01.txt', y: 2025, m: 1, n: 300},
    {name: 'deces-2025-m02.txt', y: 2025, m: 2, n: 300},
    {name: 'deces-2025-t1.txt', y: 2025, n: 650}, // le trimestre : en doublon avec les mois, jamais installé avec eux
];
const V1_EXTRA = [{url: URL0 + 'fichier-opposition-deces-261110.csv', title: 'Fichier des oppositions', filesize: 10}, {url: 'https://evil.example.com/deces-2021.txt', title: 'piège', filesize: 10}];
const V2 = [...V1.map(f => ({...f, keep: true})), {name: 'deces-2025.txt', y: 2025, n: 900}, {name: 'deces-2026-m01.txt', y: 2026, m: 1, n: 200}];
const V1_ROWS = 700 + 1500 + 2000 + 300 + 300;

function setupData(tmp) {
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','MAZAUD','male','deceased',1)");
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env: envFor(tmp, path.join(tmp, 'site'))});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
}
function envFor(tmp, site, more = {}) {
    return {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', GENEALOGY_TEST: '1', LCNDA_TEST_INSEE_DIR: site,
        LCNDA_TEST_INSEE_CHUNK: '150000', LCNDA_TEST_INSEE_LINES: '400', LCNDA_TEST_INSEE_SECONDS: '0.0001', ...more};
}
// un appel PHP = un processus à part (comme une requête ; fermer l'app entre deux ne change rien)
function php(tmp, site, code, more = {}) {
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require 'lib/paths.php'; require 'lib/bootstrap.php'; $pdo = db(); ${code}`], {cwd: root, encoding: 'utf8', env: envFor(tmp, site, more)});
    if (r.status !== 0) throw new Error(r.stderr || r.stdout);
    return JSON.parse(r.stdout.trim().split('\n').pop());
}
const J = 'echo json_encode(';
const JE = ', JSON_UNESCAPED_UNICODE);';
const sql = (tmp, site, q) => php(tmp, site, `${J}$pdo->query("${q}")->fetchAll(PDO::FETCH_NUM)${JE}`);
const runAll = (tmp, site, max = 400) => { let n = 0, r; do { r = php(tmp, site, `${J}insee_maj_step($pdo)${JE}`); n++; } while (!r.finished && r.job?.status === 'running' && n < max); return {r, n}; };

(async () => {
    // ═════ 1. le serveur ═════
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-inseemaj-')), site = path.join(tmp, 'site');
    mkSite(site, V1, V1_EXTRA);
    setupData(tmp);
    await t('liste : une version par période, rien d’autre ; l’année en cours par mois (le trimestre en doublon écarté) ; rien de « nouveau » tant que rien n’est installé', async () => {
        const s = php(tmp, site, `${J}insee_maj_status($pdo, ['check' => 1])${JE}`);
        assert.deepStrictEqual(s.online.years.map(y => [y.year, y.complete, y.months]), [[2022, true, []], [2023, true, []], [2024, true, []], [2025, false, [1, 2]]]);
        assert.strictEqual(s.online.missing, 5);
        assert.deepStrictEqual(s.online.updates, []);
        assert.strictEqual(s.installed.rows, 0);
        assert.ok(s.free_bytes > 0, 'la place libre est donnée');
        assert.ok(!s.online.files.some(f => /opposition|2021/.test(f.name)), 'ni le fichier des oppositions, ni une adresse hors data.gouv.fr');
        const y24 = s.online.years.find(y => y.year === 2024);
        assert.strictEqual(y24.rows, 2000, 'nombre de décès estimé d’après la taille (200 octets la ligne)');
        assert.strictEqual(y24.bytes, 2000 * s.row_bytes, 'place estimée dans la base');
    });
    await t('plan : un trimestre seulement si ses mois manquent ; le fichier de l’année remplace ses mois', async () => {
        const r = php(tmp, site, String.raw`$u = 'https://static.data.gouv.fr/x/';
$c = insee_maj_catalog([['url' => $u.'deces-2026-m07.txt'], ['url' => $u.'deces-2026-m08.txt'], ['url' => $u.'deces-2026-m09.txt'], ['url' => $u.'deces-2026-t3.txt'], ['url' => $u.'deces-2026-t2.txt'], ['url' => $u.'deces-2025.txt'], ['url' => $u.'deces-2025-m11.txt']]);
$inst = [2025 => ['full' => false, 'months' => [11 => true], 'quarters' => []]];
echo json_encode(array_map(fn($f) => $f['key'] . ($f['replaces'] ? '+' : ''), insee_maj_plan($c, $inst, null)));`);
        assert.deepStrictEqual(r, ['2025-a00+', '2026-t02', '2026-m07', '2026-m08', '2026-m09']);
        // l'ancienne liste (insee_remote_files) ne propose plus le trimestre en doublon avec ses mois
        const old = php(tmp, site, String.raw`$u = 'https://static.data.gouv.fr/x/'; $pdo->exec("INSERT INTO insee_deces_imports(filename,row_count,inserted_count) VALUES('deces-2026-m06.txt',1,1)");
$l = insee_remote_files($pdo, [['url' => $u.'deces-2026-m06.txt'], ['url' => $u.'deces-2026-m07.txt'], ['url' => $u.'deces-2026-t3.txt']])['files']; $pdo->exec("DELETE FROM insee_deces_imports");
echo json_encode(array_map(fn($f) => [$f['key'], $f['new'], $f['superseded']], $l));`);
        assert.deepStrictEqual(old, [['2026-t03', false, true], ['2026-m07', true, false], ['2026-m06', false, false]]);
    });
    let steps = 0;
    await t('⤓ Tout installer : dans l’ordre (1970 → aujourd’hui), par petits pas ; pause au milieu d’un fichier, reprise dans un autre processus, sans doublon', async () => {
        const st = php(tmp, site, `${J}insee_maj_start($pdo, ['years' => 'all'])${JE}`);
        assert.deepStrictEqual(st.job.items.map(i => i.label), ['Décès de 2022', 'Décès de 2023', 'Décès de 2024', 'Décès de janvier 2025', 'Décès de février 2025']);
        assert.strictEqual(st.job.total, 5);
        // jusqu'au milieu de 2023 (en train d'être rangé)
        let r;
        for (let i = 0; i < 200; i++) { r = php(tmp, site, `${J}insee_maj_step($pdo)${JE}`); steps++; if (r.job.done === 1 && r.job.current.phase === 'import' && r.job.work_done > r.job.work_total * 0.2) break; }
        assert.strictEqual(r.job.current.label, 'Décès de 2023');
        const mid = sql(tmp, site, "SELECT count(*) FROM insee_deces WHERE source_file='deces-2023.txt'")[0][0];
        assert.ok(mid > 0 && mid < 1500, `à moitié rangé (${mid})`);
        assert.ok(r.job.bytes_done > 0 && r.job.bytes_done <= r.job.bytes_total);
        php(tmp, site, `${J}insee_maj_post($pdo, 'insee_maj_pause', [])${JE}`);
        const paused = php(tmp, site, `${J}insee_maj_step($pdo)${JE}`);
        assert.strictEqual(paused.job.status, 'paused');
        assert.strictEqual(sql(tmp, site, "SELECT count(*) FROM insee_deces WHERE source_file='deces-2023.txt'")[0][0], mid, 'en pause : rien ne bouge');
        // pendant la pause, ce qui est fini compte, ce qui est à moitié fait non
        const s = php(tmp, site, `${J}insee_maj_status($pdo, [])${JE}`);
        assert.deepStrictEqual(s.installed.years.map(y => y.year), [2022]);
        assert.strictEqual(s.job.status, 'paused');
        php(tmp, site, `${J}insee_maj_post($pdo, 'insee_maj_resume', [])${JE}`);
        const fin = runAll(tmp, site); steps += fin.n;
        assert.ok(fin.r.finished, JSON.stringify(fin.r).slice(0, 300));
        assert.strictEqual(fin.r.finished.rows, V1_ROWS);
        assert.ok(steps > 15, `par petits pas (${steps})`);
        assert.strictEqual(sql(tmp, site, 'SELECT count(*) FROM insee_deces')[0][0], V1_ROWS, 'pas une ligne en double');
        assert.deepStrictEqual(sql(tmp, site, "SELECT filename, inserted_count, length(file_hash) FROM insee_deces_imports ORDER BY id"),
            [['deces-2022.zip', 700, 64], ['deces-2023.txt', 1500, 64], ['deces-2024.txt', 2000, 64], ['deces-2025-m01.txt', 300, 64], ['deces-2025-m02.txt', 300, 64]]);
        assert.deepStrictEqual(sql(tmp, site, "SELECT nom, prenom, prenoms, sexe, date_naissance, commune_naissance, date_deces, code_lieu_deces, numero_acte_deces FROM insee_deces WHERE nom='BAISSAIT'"),
            [['BAISSAIT', 'JEAN', 'JEAN', 'M', '19430412', 'HALLUIN', '20230101', '59350', '0']]);
        assert.deepStrictEqual(fs.readdirSync(path.join(tmp, 'insee-maj')).filter(f => !f.startsWith('.')), ['liste.json'], 'les fichiers téléchargés sont effacés');
        const s2 = php(tmp, site, `${J}insee_maj_status($pdo, [])${JE}`);
        assert.strictEqual(s2.job, null); assert.strictEqual(s2.installed.rows, V1_ROWS); assert.strictEqual(s2.online.missing, 0);
        assert.deepStrictEqual(s2.installed.years.find(y => y.year === 2025).months, [1, 2]);
    });
    await t('déjà là : « Tout installer » une 2e fois ne fait rien', async () => {
        assert.strictEqual(php(tmp, site, `${J}insee_maj_start($pdo, ['years' => 'all'])${JE}`).nothing, true);
    });
    await t('mise à jour : le fichier de 2025 sort (les mois retirés, sans doublon) et janvier 2026', async () => {
        mkSite(site, V2, V1_EXTRA);
        const s = php(tmp, site, `${J}insee_maj_status($pdo, ['check' => 1])${JE}`);
        assert.deepStrictEqual(s.online.updates.map(u => [u.label, u.replaces]), [['Décès de 2025', true], ['Décès de janvier 2026', false]]);
        const st = php(tmp, site, `${J}insee_maj_start($pdo, ['years' => 'updates'])${JE}`);
        assert.strictEqual(st.job.total, 2);
        const fin = runAll(tmp, site);
        assert.ok(fin.r.finished); assert.strictEqual(fin.r.finished.kind, 'updates');
        assert.deepStrictEqual(sql(tmp, site, "SELECT filename FROM insee_deces_imports WHERE filename LIKE 'deces-2025%' ORDER BY id"), [['deces-2025.txt']], 'les mois de 2025 retirés du journal');
        assert.strictEqual(sql(tmp, site, "SELECT count(*) FROM insee_deces WHERE annee_deces=2025")[0][0], 900, 'et de l’index : seulement le fichier de l’année');
        assert.strictEqual(sql(tmp, site, 'SELECT count(*) FROM insee_deces')[0][0], V1_ROWS - 600 + 900 + 200);
        assert.deepStrictEqual(php(tmp, site, `${J}insee_maj_status($pdo, [])${JE}`).online.updates, []);
    });
    await t('fichier abîmé (empreinte de data.gouv.fr différente) : retéléchargé, puis arrêt clair ; « Abandonner » nettoie', async () => {
        mkSite(site, [...V2.map(f => ({...f, keep: true})), {name: 'deces-2026-m02.txt', y: 2026, m: 2, n: 100, badSha1: true}], V1_EXTRA);
        php(tmp, site, `insee_maj_status($pdo, ['check' => 1]); ${J}insee_maj_start($pdo, ['years' => 'updates'])${JE}`);
        const fin = runAll(tmp, site);
        assert.strictEqual(fin.r.job.status, 'error'); assert.match(fin.r.job.error, /abîmé/);
        let c; for (let i = 0; i < 20; i++) { c = php(tmp, site, `${J}insee_maj_cancel($pdo)${JE}`); if (c.completed) break; }
        assert.ok(c.completed); assert.strictEqual(php(tmp, site, `${J}insee_maj_status($pdo, [])${JE}`).job, null);
        assert.strictEqual(sql(tmp, site, "SELECT count(*) FROM insee_deces_imports WHERE filename='deces-2026-m02.txt'")[0][0], 0);
    });
    await t('hors ligne : ce qui est installé se lit toujours (la liste gardée) ; le travail attend la connexion', async () => {
        mkSite(site, [...V2.map(f => ({...f, keep: true})), {name: 'deces-2026-m02.txt', y: 2026, m: 2, n: 100}], V1_EXTRA);
        php(tmp, site, `insee_maj_status($pdo, ['check' => 1]); ${J}insee_maj_start($pdo, ['years' => 'updates'])${JE}`);
        const off = {LCNDA_TEST_INSEE_OFFLINE: '1'};
        const s = php(tmp, site, `${J}insee_maj_status($pdo, ['check' => 1])${JE}`, off);
        assert.match(s.online_error, /connexion/); assert.ok(s.online && s.online.years.length === 5, 'la liste gardée'); assert.ok(s.installed.rows > 0);
        const r = php(tmp, site, `${J}insee_maj_step($pdo)${JE}`, off);
        assert.ok(r.wait > 0, 'attendre avant de réessayer'); assert.strictEqual(r.job.status, 'running');
        assert.ok(runAll(tmp, site).r.finished, 'la connexion revient : fini');
    });
    await t('🗑 Retirer une année, par lots ; les mises à jour ne la remettent pas, « Tout installer » si', async () => {
        const before = sql(tmp, site, 'SELECT count(*) FROM insee_deces')[0][0];
        let r, n = 0, del = 0;
        do { r = php(tmp, site, `${J}insee_maj_remove_year($pdo, ['year' => 2023])${JE}`, {LCNDA_TEST_INSEE_SECONDS: '0.0001'}); del += r.deleted_rows; n++; } while (!r.completed && n < 50);
        assert.ok(r.completed); assert.strictEqual(del, 1500);
        assert.strictEqual(sql(tmp, site, 'SELECT count(*) FROM insee_deces')[0][0], before - 1500);
        assert.strictEqual(sql(tmp, site, "SELECT count(*) FROM insee_deces_imports WHERE filename='deces-2023.txt'")[0][0], 0);
        const s = php(tmp, site, `${J}insee_maj_status($pdo, [])${JE}`);
        assert.ok(!s.installed.years.some(y => y.year === 2023)); assert.deepStrictEqual(s.online.updates, []); assert.strictEqual(s.online.missing, 1);
        // refusé pendant une installation
        php(tmp, site, `${J}insee_maj_start($pdo, ['years' => [2023]])${JE}`);
        assert.throws(() => php(tmp, site, `${J}insee_maj_remove_year($pdo, ['year' => 2024])${JE}`), /pause/);
        assert.ok(runAll(tmp, site).r.finished);
        assert.strictEqual(sql(tmp, site, 'SELECT count(*) FROM insee_deces')[0][0], before, 'remise');
    });
    await t('mesure : la place estimée par ligne rangée est raisonnable (pas sous-estimée)', async () => {
        const r = php(tmp, site, String.raw`$pdo->exec('PRAGMA wal_checkpoint(TRUNCATE)'); $n = (int) $pdo->query('SELECT count(*) FROM insee_deces')->fetchColumn();
$b = 0; try { $b = (int) $pdo->query("SELECT sum(pgsize) FROM dbstat WHERE name LIKE '%insee_deces%' AND name NOT LIKE '%imports%'")->fetchColumn(); } catch (Throwable $_) {}
echo json_encode(['n' => $n, 'b' => $b, 'est' => INSEE_MAJ_ROW_BYTES]);`);
        if (r.b) assert.ok(r.b / r.n <= r.est * 1.2, `${Math.round(r.b / r.n)} octets par ligne mesurés pour ${r.est} estimés`);
    });

    // ═════ 2. dans l'app ═════
    const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-inseemaj-ui-')), site2 = path.join(tmp2, 'site');
    mkSite(site2, V1, V1_EXTRA);
    setupData(tmp2);
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env: {...envFor(tmp2, site2, {LCNDA_TEST_INSEE_SECONDS: '0.0001', LCNDA_TEST_INSEE_CHUNK: '30000', LCNDA_TEST_INSEE_LINES: '100'}), PHP_CLI_SERVER_WORKERS: '4'}, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        const ready = async () => { await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_PARTS?.inseeStartup, null, {timeout: 30000}); };
        await p.goto(base); await ready();
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message, status: e.status})), [x, q]);
        const post = (a, b = {}) => p.evaluate(async ([x, y]) => { try { return await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); } catch (e) { return {error: e.message, status: e.status}; } }, [a, b]);
        const toasts = () => p.evaluate(() => [...document.querySelectorAll('.ui-toast')].map(x => x.textContent).join(' | '));
        const openInsee = async () => { await p.evaluate(() => { const A = window.LCNDA_APP; A.state.researchKind = 'insee'; A.setModule('recherche'); }); await p.waitForSelector('[data-im-box] [data-im-check]', {timeout: 20000}); };
        await t('l’écran Décès INSEE : « ⤓ Tout installer (1970 → aujourd’hui) » et « Seulement certaines années… » (la place qu’il faut)', async () => {
            await openInsee();
            await p.click('[data-im-box] [data-im-check]'); // pas encore de liste : « Vérifier maintenant »
            await p.waitForSelector('[data-im-box] [data-im-all]', {timeout: 15000});
            assert.match(await p.textContent('[data-im-box] [data-im-all]'), /Tout installer \(1970 → aujourd’hui\)/);
            assert.match(await p.textContent('[data-im-box]'), /à télécharger, environ .* sur le disque/);
            await p.click('[data-im-box] [data-im-years]');
            await p.waitForSelector('#insee-years-dialog[open] [data-iy-year="2022"]');
            assert.strictEqual(await p.$$eval('#insee-years-dialog [data-iy-year]', b => b.length), 4);
            await p.click('#insee-years-dialog [data-iy-pick="none"]');
            assert.ok(await p.$eval('#insee-years-dialog [data-iy-go]', b => b.disabled), 'rien de coché : bouton grisé');
            await p.check('#insee-years-dialog [data-iy-year="2022"]');
            assert.match(await p.textContent('#insee-years-dialog [data-iy-sum]'), /1 année : .* à télécharger, environ .* sur le disque\. Il reste .* sur le disque/);
            await p.click('#insee-years-dialog [data-iy-go]');
            await p.waitForFunction(() => /installés/.test([...document.querySelectorAll('.ui-toast')].map(x => x.textContent).join(' ')), null, {timeout: 60000});
            const s = await api('insee_maj_status');
            assert.deepStrictEqual(s.installed.years.map(y => y.year), [2022]); assert.strictEqual(s.installed.rows, 700);
        });
        await t('« ⤓ Tout installer » → la barre (fichiers, Mo) → ⏸ Pause → app fermée et rouverte → ▶ Reprendre → installé', async () => {
            await openInsee();
            await p.waitForSelector('[data-im-box] [data-im-all]');
            await p.click('[data-im-box] [data-im-all]');
            await p.click('.confirm-box-dialog [data-cb-ok]');
            await p.waitForSelector('[data-im-box] [data-im-job] progress', {timeout: 15000});
            await p.waitForFunction(() => /Fichier \d sur 4/.test(document.querySelector('[data-im-job]')?.textContent || '') && /Mo sur .* téléchargés/.test(document.querySelector('[data-im-job]').textContent), null, {timeout: 15000});
            await p.waitForFunction(() => Number(document.querySelector('[data-im-job] progress')?.value) > 5, null, {timeout: 30000});
            await p.click('[data-im-box] [data-im-pause]');
            await p.waitForSelector('[data-im-box] [data-im-resume]', {timeout: 20000});
            assert.strictEqual((await api('insee_maj_status')).job.status, 'paused');
            await p.reload(); await ready();
            await p.evaluate(() => window.LCNDA_APP.setModule('personnes'));
            await sleep(9000); // le démarrage de l'app (8 s) : une installation en pause ne repart pas toute seule
            assert.strictEqual((await api('insee_maj_status')).job.status, 'paused');
            assert.ok(await p.$('#im-chip [data-im-resume]'), 'la pastille en bas de l’écran le rappelle');
            await openInsee();
            await p.waitForSelector('[data-im-box] [data-im-resume]');
            assert.match(await p.textContent('[data-im-box]'), /En pause/);
            await p.click('[data-im-box] [data-im-resume]');
            await p.waitForFunction(() => /installés/.test([...document.querySelectorAll('.ui-toast')].map(x => x.textContent).join(' ')), null, {timeout: 90000});
            const s = await api('insee_maj_status');
            assert.strictEqual(s.installed.rows, V1_ROWS); assert.strictEqual(s.job, null);
            await p.waitForFunction(() => /Tout est installé et à jour/.test(document.querySelector('[data-im-box]')?.textContent || ''), null, {timeout: 15000});
        });
        await t('la recherche dans l’index des décès marche toujours', async () => {
            const r = await api('insee_search', {nom: 'BAISSAIT', limit: 10, offset: 0});
            assert.strictEqual(r.total, 1); assert.strictEqual(r.rows[0].prenom, 'JEAN'); assert.strictEqual(r.rows[0].date_deces, '20230101');
        });
        await t('🆕 à l’ouverture (une fois par jour) : « Nouveau fichier des décès » → « ⤓ Mettre à jour » → les mois de 2025 remplacés', async () => {
            mkSite(site2, V2, V1_EXTRA);
            await p.evaluate(() => { localStorage.setItem('lcnda-insee-checked', '2000-01-01'); localStorage.removeItem('lcnda-insee-told'); localStorage.removeItem('genealogie-insee-auto'); });
            await p.reload(); await ready();
            await p.waitForFunction(() => /Nouveaux fichiers des décès : l’année 2025 complète, janvier 2026/.test([...document.querySelectorAll('.ui-toast')].map(x => x.textContent).join(' ')), null, {timeout: 25000});
            assert.strictEqual(await p.evaluate(() => localStorage.getItem('lcnda-insee-checked')), new Date().toISOString().slice(0, 10));
            await p.evaluate(() => [...document.querySelectorAll('.ui-toast')].find(x => /Nouveaux fichiers/.test(x.textContent)).querySelector('.ui-toast-btn').click());
            await p.waitForFunction(() => /Décès INSEE à jour/.test([...document.querySelectorAll('.ui-toast')].map(x => x.textContent).join(' ')), null, {timeout: 60000});
            const s = await api('insee_maj_status');
            const y25 = s.installed.years.find(y => y.year === 2025);
            assert.ok(y25.full); assert.deepStrictEqual(y25.months, []); assert.strictEqual(y25.rows, 900);
            assert.strictEqual(s.installed.rows, V1_ROWS - 600 + 900 + 200);
        });
        await t('« Vérifier chaque jour » éteint : pas de vérification à l’ouverture ; « Mettre à jour tout seul » allumé : installé sans rien demander', async () => {
            mkSite(site2, [...V2.map(f => ({...f, keep: true})), {name: 'deces-2026-m02.txt', y: 2026, m: 2, n: 120}], V1_EXTRA);
            await openInsee();
            await p.click('[data-im-box] [data-im-detail]');
            await p.waitForSelector('#insee-maj-dialog[open] [data-im-set-check]');
            assert.ok(await p.isChecked('[data-im-set-check]'), 'vérifier chaque jour : oui par défaut');
            assert.ok(!(await p.isChecked('[data-im-set-auto]')), 'tout seul : non par défaut');
            await p.uncheck('[data-im-set-check]');
            assert.strictEqual(await p.evaluate(() => localStorage.getItem('genealogie-insee-auto-maj')), '0');
            await p.click('#insee-maj-dialog [data-close-insee-maj]');
            await p.evaluate(() => localStorage.setItem('lcnda-insee-checked', '2000-01-01'));
            await p.reload(); await ready(); await sleep(9500);
            assert.strictEqual(await p.evaluate(() => localStorage.getItem('lcnda-insee-checked')), '2000-01-01', 'pas regardé');
            await p.evaluate(() => { localStorage.setItem('genealogie-insee-auto-maj', '1'); localStorage.setItem('genealogie-insee-auto', '1'); });
            await p.reload(); await ready();
            await p.waitForFunction(() => /Décès INSEE à jour : février 2026/.test([...document.querySelectorAll('.ui-toast')].map(x => x.textContent).join(' ')), null, {timeout: 60000});
            assert.ok((await api('insee_maj_status')).installed.years.find(y => y.year === 2026).months.includes(2));
            await p.evaluate(() => localStorage.setItem('genealogie-insee-auto', '0'));
        });
        await t('une installation coupée (app fermée en plein travail) reprend toute seule à l’ouverture', async () => {
            await post('insee_maj_remove_year', {year: 2024}).then(async r => { while (r && !r.completed) r = await post('insee_maj_remove_year', {year: 2024}); });
            const st = await post('insee_maj_start', {years: [2024]});
            assert.strictEqual(st.job.total, 1);
            await post('insee_maj_step'); // un pas, puis « l'app est fermée »
            await p.reload(); await ready();
            await p.waitForFunction(() => /reprend où elle s’était arrêtée/.test([...document.querySelectorAll('.ui-toast')].map(x => x.textContent).join(' ')), null, {timeout: 25000});
            await p.waitForFunction(() => /installés/.test([...document.querySelectorAll('.ui-toast')].map(x => x.textContent).join(' ')), null, {timeout: 60000});
            assert.strictEqual((await api('insee_maj_status')).installed.years.find(y => y.year === 2024).rows, 2000);
        });
        await t('détail par année : 🗑 Retirer (on demande avant) → « ↶ Annuler » la retélécharge', async () => {
            await openInsee();
            await p.click('[data-im-box] [data-im-detail]');
            await p.waitForSelector('#insee-maj-dialog[open] [data-im-remove="2022"]');
            const txt = await p.textContent('#insee-maj-detail');
            assert.match(txt, /année complète/); assert.match(txt, /janvier → février/); assert.match(txt, /Sur le disque/);
            await p.click('#insee-maj-dialog [data-im-remove="2022"]');
            await p.waitForSelector('.confirm-box-dialog');
            assert.match(await p.textContent('.confirm-box-dialog'), /700 fiches seront retirées/);
            await p.click('.confirm-box-dialog [data-cb-ok]');
            await p.waitForFunction(() => /Décès de 2022 retirés/.test([...document.querySelectorAll('.ui-toast')].map(x => x.textContent).join(' ')), null, {timeout: 20000}).catch(async e => { throw new Error(e.message + ' | ' + await toasts() + ' | ' + JSON.stringify((await api('insee_maj_status')).installed.years.map(y => [y.year, y.rows])) + ' | ' + JSON.stringify((await api('insee_maj_status')).job) + ' | ' + await p.evaluate(() => document.querySelector('[data-im-remove="2022"]')?.outerHTML)); });
            assert.ok(!(await api('insee_maj_status')).installed.years.some(y => y.year === 2022));
            await p.evaluate(() => [...document.querySelectorAll('.ui-toast')].find(x => /2022 retirés/.test(x.textContent)).querySelector('.ui-toast-btn').click());
            for (let i = 0; i < 120 && !(await api('insee_maj_status')).installed.years.some(y => y.year === 2022); i++) await sleep(500); // retéléchargée et installée
            assert.strictEqual((await api('insee_maj_status')).installed.years.find(y => y.year === 2022).rows, 700);
            await p.click('#insee-maj-dialog [data-close-insee-maj]').catch(() => {});
        });
        await t('Réglages → 📦 Données → ⚰️ Décès INSEE : le même cadre ; LCNDA_EXT.dataSources : chercher une personne quand on veut', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'insee_deces'; A.setModule('maintenance'); });
            await p.waitForSelector('#workspace [data-im-box] [data-im-check]', {timeout: 20000});
            await p.waitForSelector('#workspace #insee-maj-detail [data-im-remove="2022"]', {timeout: 20000});
            assert.ok(!(await p.$('#workspace [data-im-detail]')), 'pas de bouton « Détail » : le détail est déjà sur la page');
            const r = await p.evaluate(async () => {
                const src = (window.LCNDA_EXT.dataSources || []).find(d => d.id === 'insee_deces');
                const host = document.createElement('div');
                await src.run({person: {first_name: 'Jean Pierre', last_name: 'Baissait', birth_year: 1943}}, host);
                return {needs: src.needs, group: src.group, installed: await src.installed(), text: host.textContent};
            });
            assert.deepStrictEqual(r.needs, ['person']); assert.strictEqual(r.group, 'La personne'); assert.strictEqual(r.installed, true);
            assert.match(r.text, /1 correspondance dans le fichier des décès/); assert.match(r.text, /BAISSAIT/);
        });
        await t('mode consultation : on voit ce qui est installé, aucun bouton pour installer, rien n’est écrit', async () => {
            assert.ok(!(await post('kiosk_enter', {password: '1234'})).error);
            await p.reload(); await ready();
            await openInsee();
            const box = await p.textContent('[data-im-box]');
            assert.match(box, /Installé : .* personnes/);
            assert.ok(!(await p.$('[data-im-box] [data-im-all], [data-im-box] [data-im-update], #insee-open-remote')), 'pas de bouton pour installer');
            const r = await post('insee_maj_start', {years: 'all'}); assert.strictEqual(r.status, 423);
            assert.strictEqual((await post('insee_maj_remove_year', {year: 2022})).status, 423);
            assert.ok((await api('insee_maj_status')).installed.rows > 0, 'la lecture marche');
            assert.strictEqual((await api('insee_search', {nom: 'BAISSAIT', limit: 10, offset: 0})).total, 1);
        });
        await t('pas d’erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close();
        proc.kill();
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
