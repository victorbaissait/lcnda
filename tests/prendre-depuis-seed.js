/* 📥 « Prendre depuis… » : une base d'essai réaliste pour tests/test-prendre-depuis.js et tests/test-prendre-depuis-usage.js.
 * Noms inventés (MAZAUD, LACOMBE, DURAND) ; communes réelles pour l'exemple. Quelques centaines de fiches et d'événements (dont ~25 naissances
 * à Treignac entre 1780 et 1800), des actes (dont 2 « à décrire »), des médias avec vignette (dont 2 pas décrits), des sources reliées,
 * l'enquête « testenquête » ; en option (big) 5 000 événements de plus (performance). La météo vient du jeu FABRIQUÉ de tests/test-meteo.js (Gers) ;
 * le pack « Histoire du lieu » (gares, séismes, crues) si /tmp/histoire-pack/histoire-locale.sqlite existe (sinon ces étapes sont sautées).
 *   const B = await require('./prendre-depuis-seed.js').start({big: true}); … B.page, B.api(), B.go(), B.stop() */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const zlib = require('zlib');
const {spawn, spawnSync} = require('child_process');
const root = path.join(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
// une petite vignette (PNG 8×6) pour les médias et les actes
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAAEUlEQVR4nGM4saoCK2IYSAkA+7xb4bzwD28AAAAASUVORK5CYII=', 'base64');
const HIST = process.env.LCNDA_HIST_DB || '/tmp/histoire-pack/histoire-locale.sqlite';

async function start({big = false, empty = false, viewport = {width: 1440, height: 900}} = {}) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-pd-')), fx = path.join(tmp, 'meteo'), netdir = path.join(tmp, 'net');
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true}); fs.mkdirSync(netdir);
    for (let i = 1; i <= 40; i++) fs.writeFileSync(path.join(tmp, 'media', `img${String(i).padStart(3, '0')}.png`), PNG);
    fs.writeFileSync(path.join(netdir, 'deces.csv'), 'nom;date;commune\nMAZAUD Jean;1859-06-03;Tulle\nDURAND Pierre;1859-07-10;Tulle\n');
    const mk = spawnSync('python3', [path.join(root, 'scripts', 'meteo', 'make-fixture.py'), fx], {encoding: 'utf8'});
    if (mk.status !== 0) throw new Error(mk.stderr || mk.stdout);
    const hasPack = fs.existsSync(HIST);
    if (hasPack) { fs.mkdirSync(path.join(tmp, 'histoire')); fs.copyFileSync(HIST, path.join(tmp, 'histoire', 'histoire-locale.sqlite')); }
    let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
    const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1',
        LCNDA_METEO_DIR: fx, LCNDA_TEST_CX_DIR: netdir, PD_BIG: big ? '1' : '0', PD_EMPTY: empty ? '1' : '0'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; require_once 'lib/transcriptions.php'; $pdo = db(); act_transcriptions_ensure($pdo);
if (getenv('PD_EMPTY') === '1') { echo json_encode(['ok' => 1]); return; }
mt_srand(42);
$pdo->beginTransaction();
$pl = $pdo->prepare("INSERT INTO places(id,name,county,country,latitude,longitude) VALUES(?,?,?,'France',?,?)");
$places = [[1,'Treignac','Corrèze',45.5367,1.7958],[2,'Chamberet','Corrèze',45.5847,1.7183],[3,'Eymoutiers','Haute-Vienne',45.7381,1.7417],[4,'Saint-Amand-Montrond','Cher',46.7228,2.5050],[5,'Tulle','Corrèze',45.2675,1.7711],[6,'Auch','Gers',43.646,0.586]];
foreach ($places as $p) { $pl->execute($p); }
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$B = $t('BIRT'); $M = $t('MARR'); $D = $t('DEAT');
$first = ['Jean','Pierre','Marie','Antoinette','Léonard','Catherine','François','Anne','Jacques','Marguerite','Martial','Jeanne'];
$last = ['MAZAUD','LACOMBE','DURAND'];
$per = $pdo->prepare("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(?,?,?,?,'deceased',?)");
$ev = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)");
$mois = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
$dt = function (int $y, int $m, int $d) use ($mois) { return [$d . ' ' . $mois[$m - 1] . ' ' . $y, sprintf('%04d-%02d-%02d', $y, $m, $d)]; };
$treignac = 0;
for ($i = 1; $i <= 320; $i++) {
    $fn = $first[$i % count($first)]; $ln = $last[$i % 3]; $g = in_array($fn, ['Marie','Antoinette','Catherine','Anne','Marguerite','Jeanne'], true) ? 'female' : 'male';
    $per->execute([$i, $fn, $ln, $g, $i === 1 ? 1 : 0]);
    $y = 1740 + ($i * 7) % 140; $place = ($i % 4) + 1;
    if ($i % 12 === 0 && $treignac < 25) { $y = 1780 + ($treignac % 21); $place = 1; $treignac++; }
    elseif ($place === 1 && $y >= 1780 && $y <= 1800) { $place = 2; }
    [$txt, $sd] = $dt($y, 1 + $i % 12, 1 + $i % 27); $ev->execute([$i, $B, $txt, $y, $sd, $place]);
    if ($i % 3 === 0) { [$txt, $sd] = $dt($y + 25, 1 + ($i + 3) % 12, 1 + $i % 25); $ev->execute([$i, $M, $txt, $y + 25, $sd, ($i % 5) + 1]); }
    if ($i % 2 === 0) { [$txt, $sd] = $dt($y + 60, 1 + ($i + 5) % 12, 1 + $i % 26); $ev->execute([$i, $D, $txt, $y + 60, $sd, ($i % 4) + 1]); }
}
// le mariage de Jean MAZAUD à Auch, le 3 février 1978 (la météo du jour existe dans le jeu fabriqué)
$ev->execute([1, $M, '3 février 1978', 1978, '1978-02-03', 6]); $wedding = (int) $pdo->lastInsertId();
if (getenv('PD_BIG') === '1') { for ($k = 0; $k < 5000; $k++) { $y = 1600 + $k % 300; $ev->execute([2 + $k % 300, $B, "$y", $y, "$y-01-01", 5]); } }
// sources (et leurs citations sur quelques événements)
$src = $pdo->prepare("INSERT INTO sources(id,title,author,agency,publication) VALUES(?,?,?,?,?)");
$src->execute([1,'Registres paroissiaux de Treignac (1770–1800)','','AD Corrèze','3 E 271/2']); $src->execute([2,'Registres paroissiaux de Chamberet (1575–1610)','','AD Corrèze','3 E 48/1']);
$src->execute([3,'Recensement d’Eymoutiers, 1836','','AD Haute-Vienne','6 M 412']); $src->execute([4,'« Familles du plateau » (livre, 2004)','DURAND','','']);
$sl = $pdo->prepare("INSERT INTO source_links(source_record_id,entity_type,entity_id,page) VALUES(?,?,?,'')");
foreach ($pdo->query("SELECT id FROM events WHERE id % 3 = 0 LIMIT 200")->fetchAll(PDO::FETCH_COLUMN) as $eid) { $sl->execute([1 + $eid % 3, 'event', $eid]); }
// médias (avec vignette) ; 2 pas décrits (un nom de fichier, rien d'autre)
$md = $pdo->prepare("INSERT INTO media(id,title,media_type,filename,thumbnail,date_text,document_reference) VALUES(?,?,?,?,?,?,?)");
$ml = $pdo->prepare("INSERT INTO media_links(media_id,entity_type,entity_id) VALUES(?,?,?)");
for ($m = 1; $m <= 30; $m++) {
    $f = sprintf('img%03d.png', $m);
    if ($m <= 2) { $md->execute([$m, '', 'image', $f, $f, '', '']); continue; }
    $md->execute([$m, $m === 3 ? 'Registre de Treignac, vue 14' : ($m === 4 ? 'Treignac, la place de l’église' : "Photo de famille n° $m"), $m === 3 ? 'document' : 'image', $f, $f, $m === 4 ? '1912' : 'vers ' . (1880 + $m), $m === 3 ? '3 E 271/2' : '']);
    $ml->execute([$m, 'person', 1 + $m % 40]);
}
// actes (transcriptions) : le baptême de Jean MAZAUD (avec son image), d'autres, et 2 « à décrire »
$ac = $pdo->prepare("INSERT INTO act_transcriptions(id,title,kind,media_id,date_text,place,source,body,data_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)");
$ac->execute([1,'Acte de baptême · Jean MAZAUD','bapteme',3,'12 mars 1785','Treignac (19)','AD Corrèze 3 E 271/2, vue 14','Le douze mars mil sept cent quatre vingt cinq…','{"status":"checked","people":[{"name":"Jean MAZAUD"},{"name":"Pierre MAZAUD"}]}','2026-01-10 10:00:00']);
$ac->execute([2,'Acte de mariage · Jean MAZAUD et Marie LACOMBE','mariage',5,'8 février 1810','Chamberet (19)','AD Corrèze 3 E 48/1, vue 52','Le huit février…','{"people":[{"name":"Jean MAZAUD"}]}','2026-01-11 10:00:00']);
for ($a = 3; $a <= 14; $a++) { $ac->execute([$a, "Acte de décès · Personne $a DURAND", 'deces', null, (1800 + $a) . '', 'Eymoutiers (87)', "AD Haute-Vienne 4 E $a", '', '{}', '2026-01-12 10:00:00']); }
$ac->execute([15,'','apreciser',1,'','','','','{}','2026-10-04 09:00:00']);
$ac->execute([16,'Capture d’écran 2026-03-02 à 14.12.png','apreciser',2,'','','','','{}','2026-03-02 14:12:00']);
// notes
$nt = $pdo->prepare("INSERT INTO notes(entity_type,entity_id,title,body,created_at) VALUES('person',?,?,?,datetime('now'))");
$nt->execute([1,'Souvenir de la grand-mère','Jean MAZAUD tenait le moulin de Treignac.']); $nt->execute([2,'Piste notaire','Voir les minutes de Me LACOMBE à Treignac.']);
// l'enquête
$pdo->exec("INSERT INTO investigations(id,person_id,title,status) VALUES(1,1,'testenquête','open')");
$pdo->exec("INSERT INTO investigation_items(id,investigation_id,kind,title,status) VALUES(1,1,'lead','Les baptêmes de Treignac','to_explore')");
$pdo->commit();
echo json_encode(['ok' => 1, 'treignac' => $treignac, 'wedding' => $wedding]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) throw new Error(seed.stderr || seed.stdout);
    const info = JSON.parse(seed.stdout.trim().split('\n').pop());
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 150; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    const ctx = await browser.newContext({viewport});
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(e.message));
    // 🪦 cimetières : pas de réseau ici → une réponse d'OpenStreetMap FABRIQUÉE (2 cimetières près du lieu demandé)
    await ctx.route(/api\.php\?action=cplus_cemeteries/, r => r.fulfill({contentType: 'application/json', body: JSON.stringify({ok: true, radius: 5000, place: {lat: 45.5367, lon: 1.7958},
        items: [{name: 'Cimetière de Treignac', kind: 'cemetery', km: 0.4, religion_label: 'chrétien', lat: 45.537, lon: 1.797, url: 'https://www.openstreetmap.org/way/1', route: 'https://www.openstreetmap.org/directions?to=45.537,1.797'},
            {name: 'Cimetière du Mas-Vieux', kind: 'churchyard', km: 2.1, religion_label: '', lat: 45.55, lon: 1.80, url: 'https://www.openstreetmap.org/way/2', route: 'https://www.openstreetmap.org/directions?to=45.55,1.80'}],
        source: '© OpenStreetMap contributors (ODbL 1.0)', source_url: 'https://www.openstreetmap.org/copyright'})}));
    await page.goto(base);
    if (process.env.PD_DBG) setTimeout(async () => { console.log(await page.evaluate(() => JSON.stringify({csrf: !!window.LCNDA_APP?.state?.csrf, cx: !!window.LCNDA_EXT?.connexions, ld: !!window.LCNDA_EXT?.dataListsEngine, h: document.body.innerText.slice(0, 300)}))); }, 20000);
    await page.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.connexions && window.LCNDA_EXT?.dataListsEngine, null, {timeout: 60000});
    const api = (a, q) => page.evaluate(([x, y]) => window.LCNDA_APP.api(x, y), [a, q || {}]);
    const go = async (module, extra = {}) => { await page.evaluate(([m, e]) => { const st = window.LCNDA_APP.state; Object.assign(st, e); window.LCNDA_APP.setModule(m); }, [module, extra]); await sleep(500); };
    const openInv = async (id = 1) => { await go('enquetes', {enquetesTab: 'enquetes', currentInvestigationId: id, investigationFolderId: 0}); await page.waitForSelector('#workspace .investigation-detail', {timeout: 20000}); };
    const stop = async () => { await browser.close(); proc.kill(); try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {} };
    return {page, ctx, browser, base, api, go, openInv, stop, errs, info, hasPack, tmp};
}
module.exports = {start, sleep};
