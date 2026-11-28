'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 📍 Lieux en double probables (lib/lieux_doublons.php, assets/js/app-lieux-doublons.js) :   node tests/test-lieux-doublons.js
 *  1. détection : « Pernay » (Indre-et-Loire, des événements) et « Pernay, Indre-et-Loire, Centre-Val de Loire, France »
 *     (le nom complet d'un import, sans département) = doublon sûr ; même code INSEE, même endroit (< 1 km) ; jamais
 *     Saint-Amand (Cher) avec Saint-Amand (Nord) ; un Saint-Amand sans département = « à vérifier », jamais fusionné tout seul ;
 *  2. fusion : toutes les tables qui désignent un lieu (événements, recensements, populations, anciens noms, étiquettes,
 *     liens cx, alertes écartées) passent au lieu gardé, qui prend ce qui lui manque ; une ligne qui ferait doublon
 *     (même année de population, même étiquette) est mise de côté au lieu de « UNIQUE constraint failed » ; ↶ remet
 *     EXACTEMENT toutes les tables ; « Tout fusionner (sûrs seulement) » et son ↶ ;
 *  3. l'ancien « Remplacer un lieu par un autre » ne tombe plus sur « UNIQUE constraint failed » ; message clair en français ;
 *  4. entrées refusées, CSRF, mode consultation (rien ne se fusionne, pas d'indice dans le menu) ; alerte du ✅ Contrôle ;
 *  5. le navigateur (Playwright ; sinon sauté) à 390 px et en sombre : l'indice « ≈ même lieu que Pernay (Indre-et-Loire) ? »
 *     du menu de choix, la fenêtre (gardé à gauche, doublon à droite, ce qui passe), Fusionner puis ↶ Annuler ; doublon vide
 *     retiré d'un clic ; la liste des Réglages ; pas d'erreur JavaScript, pas de défilement horizontal.
 * Données fictives (MAZAUD, LACOMBE, DURAND). Captures : SHOTS=dossier node tests/test-lieux-doublons.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
if (!phpPath) { console.log('— PHP absent : test sauté'); process.exit(0); }
const SHOTS = process.env.SHOTS || '';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-lieux-doublons-'));
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4' });
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const php = (dir, code) => {
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: envFor(dir), maxBuffer: 1 << 26 });
    if (r.status !== 0) { throw new Error(r.stderr || r.stdout); }
    return r.stdout;
};
const seed = (dir, body) => {
    fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    const out = php(dir, String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; require_once 'lib/sources_ouvertes_4.php'; $pdo = db(); so4_schema($pdo);
$pdo->exec("CREATE TABLE IF NOT EXISTS cx_links (id INTEGER PRIMARY KEY AUTOINCREMENT, a_type TEXT NOT NULL, a_id INTEGER NOT NULL, b_type TEXT NOT NULL, b_id INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(a_type, a_id, b_type, b_id))");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
` + body + "\necho 'ok';");
    assert.ok(out.includes('ok'), out);
};
const TABLES = ['places', 'events', 'census_records', 'place_populations', 'place_former_names', 'label_links', 'cx_links', 'dismissed_issues'];
/** toutes les lignes des tables touchées (rowid compris) : pour vérifier que ↶ remet exactement */
const dump = dir => JSON.parse(php(dir, String.raw`
$pdo = new PDO('sqlite:' . getenv('GENEALOGY_DATA_DIR') . '/genealogy.sqlite'); $out = [];
foreach (${JSON.stringify(TABLES).replace(/"/g, "'")} as $t) { $out[$t] = $pdo->query("SELECT rowid AS _r, * FROM $t ORDER BY rowid")->fetchAll(PDO::FETCH_ASSOC); }
echo json_encode($out);`));

const dirA = path.join(tmp, 'a');
seed(dirA, String.raw`
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender) VALUES(1,'Jean','MAZAUD','male'),(2,'Marie','LACOMBE','female'),(3,'Pierre','DURAND','male'),(4,'Louise','MAZAUD','female')");
$pdo->exec("INSERT INTO places(id,name,county,state,country,latitude,longitude,admin2_code,admin4_code,alternate_names) VALUES
 (1,'Pernay','Indre-et-Loire',NULL,'France',47.4436,0.4936,'37','37179',NULL),
 (2,'Pernay, Indre-et-Loire, Centre-Val de Loire, France',NULL,NULL,'France',NULL,NULL,NULL,NULL,NULL),
 (3,'Saint-Amand','Cher',NULL,'France',46.7225,2.5047,'18',NULL,NULL),
 (4,'Saint-Amand','Nord',NULL,'France',50.4469,3.4297,'59',NULL,NULL),
 (5,'Saint-Amand',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
 (6,'Tours','Indre-et-Loire',NULL,'France',NULL,NULL,'37','37261',NULL),
 (7,'Tours',NULL,NULL,NULL,NULL,NULL,NULL,'37261',NULL),
 (8,'Chinon','Indre-et-Loire',NULL,'France',47.1675,0.2425,'37',NULL,NULL),
 (9,'Chinon',NULL,NULL,NULL,47.1690,0.2430,NULL,NULL,NULL),
 (10,'Lerné','Indre-et-Loire',NULL,'France',47.1394,0.1236,'37','37127',NULL),
 (11,'Lerné, Indre-et-Loire, France',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)");
$ev = $pdo->prepare('INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES(?,?,?,?,?,?)');
foreach ([[1,'BIRT','2 mars 1850',1850,1],[2,'BIRT','5 mai 1852',1852,1],[3,'BIRT','7 juin 1860',1860,1],[1,'DEAT','9 avril 1910',1910,2],[2,'DEAT','1 août 1920',1920,2],
    [3,'DEAT','3 mai 1930',1930,3],[4,'BIRT','4 avril 1880',1880,4],[4,'DEAT','4 avril 1950',1950,5],[1,'RESI','1900',1900,6],[2,'RESI','1901',1901,7],[3,'RESI','1902',1902,8],[4,'RESI','1903',1903,9],[1,'CHR','3 mars 1850',1850,10]] as [$pid,$tag,$d,$y,$pl]) { $ev->execute(['person',$pid,$t($tag),$d,$y,$pl]); }
$pdo->exec("INSERT INTO census_records(year,place_id) VALUES(1906,2),(1911,1)");
$pdo->exec("INSERT INTO place_populations(place_id,year,population) VALUES(1,1851,512),(2,1851,515),(2,1861,498)");
$pdo->exec("INSERT INTO place_former_names(place_id,name,year) VALUES(2,'Parnay',1793)");
$pdo->exec("INSERT INTO labels(id,name) VALUES(1,'Village des MAZAUD')");
$pdo->exec("INSERT INTO label_links(label_id,entity_type,entity_id) VALUES(1,'place',1),(1,'place',2),(1,'person',2)");
$pdo->exec("INSERT INTO cx_links(a_type,a_id,b_type,b_id) VALUES('place',2,'person',1),('person',3,'place',2)");
$pdo->exec("INSERT INTO dismissed_issues(issue_key,reason,place_id) VALUES('place:2','Le lieu est juste',2)");
`);

let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

const startServer = async dir => {
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(dir), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 150; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let cookie = '';
    const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
    const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
    const get = async (action, q = {}) => { const r = await fetch(`${base}api.php?action=${action}&${new URLSearchParams(q)}`, { headers: { Cookie: cookie } }); return r.json(); };
    const post = async (action, body, token = csrf) => { const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: JSON.stringify({ ...body, csrf: token }) }); const j = await r.json().catch(() => ({})); return { status: r.status, body: j, result: j.result }; };
    return { proc, base, get, post };
};

(async () => {
    const A = await startServer(dirA);
    const { get, post } = A;
    let before;
    const dupOf = (d, id) => d.groups.flatMap(g => g.duplicates.map(x => ({ ...x, survivor: g.survivor }))).find(x => x.place.id === id);
    try {
        await t('détection : « Pernay, Indre-et-Loire, Centre-Val de Loire, France » ≈ « Pernay » (sûr), INSEE, < 1 km, doublon vide', async () => {
            const d = await get('ld_groups');
            assert.ok(!d.error, d.error);
            const p = dupOf(d, 2);
            assert.ok(p, JSON.stringify(d.groups));
            assert.equal(p.survivor.id, 1, 'on garde « Pernay » (nom propre, le plus de liens)');
            assert.equal(p.confidence, 'sure'); assert.equal(p.reason, 'full_name');
            assert.equal(p.place.seen_county, 'Indre-et-Loire', 'département lu dans le nom complet');
            assert.equal(p.place.links, 10, '2 événements, 1 recensement, 2 populations, 1 ancien nom, 1 étiquette, 2 liens cx, 1 alerte écartée');
            assert.equal(dupOf(d, 7).reason, 'insee'); assert.equal(dupOf(d, 7).survivor.id, 6);
            assert.equal(dupOf(d, 9).reason, 'coords'); assert.equal(dupOf(d, 9).survivor.id, 8);
            assert.equal(dupOf(d, 11).empty, true, 'Lerné : doublon sans aucun lien'); assert.equal(dupOf(d, 11).confidence, 'sure');
        });
        await t('jamais Saint-Amand (Cher) avec Saint-Amand (Nord) ; celui sans département : « à vérifier », hors « sûrs »', async () => {
            const d = await get('ld_groups');
            const sa = d.groups.filter(g => g.key === 'saint amand');
            for (const g of sa) {
                const ids = [g.survivor.id, ...g.duplicates.map(x => x.place.id)];
                assert.ok(!(ids.includes(3) && ids.includes(4) && g.duplicates.some(x => [3, 4].includes(x.place.id) && x.confidence !== 'low')), JSON.stringify(g));
                assert.ok(!g.duplicates.some(x => x.place.id === 3 || x.place.id === 4), 'Cher et Nord ne sont jamais le doublon l’un de l’autre');
            }
            const loose = dupOf(d, 5);
            assert.ok(loose && loose.confidence === 'low' && loose.reason === 'ambiguous', JSON.stringify(loose));
            assert.equal(d.safe, 4, 'Pernay, Tours, Chinon, Lerné');
        });
        await t('menu de choix : l’indice sur la ligne la plus faible seulement, rien pour Saint-Amand', async () => {
            const r = await get('picker_search', { kind: 'place', q: 'pernay' });
            const base = (r.groups || []).find(g => g.key === 'base');
            assert.equal(base.items.length, 2, JSON.stringify(base));
            const weak = base.items.find(i => i.id === 2), strong = base.items.find(i => i.id === 1);
            assert.ok(weak.dup_of && weak.dup_of.id === 1 && weak.dup_of.county === 'Indre-et-Loire', JSON.stringify(weak));
            assert.ok(!strong.dup_of);
            const sa = await get('picker_search', { kind: 'place', q: 'saint-amand' });
            assert.ok(!(sa.groups || []).flatMap(g => g.items).some(i => i.dup_of), 'pas d’indice pour des homonymes de départements différents');
        });
        await t('✅ Contrôle de la base : alerte « Lieu en double probable »', async () => {
            const d = await get('controle');
            const a = d.alerts.find(x => x.key === 'place-dup:2:1');
            assert.ok(a, d.alerts.map(x => x.key).join(', '));
            assert.equal(a.sort, 'lieux'); assert.equal(a.sub, 'dup'); assert.deepEqual(a.dup, { from: 2, to: 1 });
            assert.ok(!d.alerts.some(x => /^place-dup:5:/.test(x.key)), 'le Saint-Amand ambigu n’est pas une alerte');
        });
        await t('aperçu : ce qui passe, ce que le lieu gardé reçoit', async () => {
            const p = await get('ld_preview', { from: 2, to: 1 });
            assert.ok(!p.error, p.error);
            assert.equal(p.events, 2); assert.equal(p.moves.census_records, 1); assert.equal(p.moves.place_populations, 2); assert.equal(p.moves.cx_links, 2);
            assert.equal(p.gets.state, 'Centre-Val de Loire');
            assert.equal(p.confidence, 'sure'); assert.equal(p.warning, '');
            const bad = await get('ld_preview', { from: 3, to: 4 });
            assert.match(bad.warning, /ne semblent pas/);
        });
        await t('fusion : toutes les tables repointées, collisions UNIQUE mises de côté ; ↶ remet exactement', async () => {
            before = dump(dirA);
            const r = await post('ld_merge', { from: 2, to: 1 });
            assert.equal(r.status, 200, JSON.stringify(r.body));
            assert.equal(r.result.set_aside, 2, 'population de 1851 et étiquette déjà portées par Pernay');
            const now = dump(dirA);
            assert.ok(!now.places.some(x => x.id === 2), 'le doublon est retiré');
            const kept = now.places.find(x => x.id === 1);
            assert.equal(kept.state, 'Centre-Val de Loire'); assert.equal(kept.admin4_code, '37179'); assert.equal(kept.county, 'Indre-et-Loire');
            assert.equal(now.events.filter(e => e.place_id === 1).length, 5);
            assert.ok(now.census_records.every(c => c.place_id === 1));
            assert.deepEqual(now.place_populations.map(x => [x.place_id, x.year, x.population]), [[1, 1851, 512], [1, 1861, 498]]);
            assert.equal(now.place_former_names[0].place_id, 1);
            assert.deepEqual(now.label_links.map(x => [x.entity_type, x.entity_id]), [['place', 1], ['person', 2]]);
            assert.deepEqual(now.cx_links.map(x => [x.a_type, x.a_id, x.b_type, x.b_id]), [['place', 1, 'person', 1], ['person', 3, 'place', 1]]);
            assert.equal(now.dismissed_issues[0].place_id, 1);
            for (const tb of TABLES) { assert.ok(!JSON.stringify(now[tb]).includes('"place_id":2,'), `${tb} : plus rien vers le n° 2`); }
            const log = php(dirA, String.raw`$pdo = new PDO('sqlite:' . getenv('GENEALOGY_DATA_DIR') . '/genealogy.sqlite'); echo $pdo->query("SELECT summary FROM change_log WHERE entity_type='place' AND action='merge' ORDER BY id DESC LIMIT 1")->fetchColumn();`);
            assert.match(log, /fusionné dans « Pernay »/, 'journal des modifications');
            const u = await post('ld_undo', { id: r.result.undo_id });
            assert.equal(u.status, 200, JSON.stringify(u.body));
            assert.deepEqual(dump(dirA), before, '↶ : toutes les tables comme avant');
            const again = await post('ld_undo', { id: r.result.undo_id });
            assert.equal(again.result.already, true, 'un deuxième ↶ : « déjà »');
        });
        await t('« Tout fusionner (sûrs seulement) » : Pernay, Tours, Chinon, Lerné ; jamais Saint-Amand ; ↶', async () => {
            const r = await post('ld_merge_safe', {});
            assert.equal(r.status, 200, JSON.stringify(r.body));
            assert.equal(r.result.merged, 4);
            const now = dump(dirA);
            assert.deepEqual(now.places.map(x => x.id), [1, 3, 4, 5, 6, 8, 10]);
            assert.equal(now.places.find(x => x.id === 8).alternate_names, null, 'même nom : pas d’autre nom ajouté');
            assert.equal((await get('ld_groups')).safe, 0);
            const u = await post('ld_undo', { id: r.result.undo_id });
            assert.equal(u.status, 200, JSON.stringify(u.body));
            assert.deepEqual(dump(dirA), before);
        });
        await t('ancienne action merge_duplicate_places : la même détection, sûre seulement', async () => {
            assert.notEqual((await post('merge_duplicate_places', {})).status, 200, 'confirmation requise');
            const r = await post('merge_duplicate_places', { confirm: 'yes' });
            assert.equal(r.status, 200, JSON.stringify(r.body));
            assert.equal(r.result.merged_groups, 4);
            assert.ok(dump(dirA).places.some(x => x.id === 3) && dump(dirA).places.some(x => x.id === 4) && dump(dirA).places.some(x => x.id === 5), 'les Saint-Amand restent');
            assert.equal((await post('ld_undo', { id: r.result.undo_id })).status, 200);
            assert.deepEqual(dump(dirA), before);
        });
        await t('« UNIQUE constraint failed » : « Remplacer un lieu » passe, et le message brut est traduit', async () => {
            // avant : UPDATE place_populations … → « UNIQUE constraint failed: place_populations.place_id, place_populations.year »
            const r = await post('ro_place_replace_apply', { from: 2, to: 1 });
            assert.equal(r.status, 200, JSON.stringify(r.body));
            assert.equal((await post('ro_undo', { id: r.result.undo_id })).status, 200);
            const noStamp = d => JSON.parse(JSON.stringify(d, (k, v) => (k === 'updated_at' ? undefined : v))); // ↶ de cet outil date les événements remis
            assert.deepEqual(noStamp(dump(dirA)), noStamp(before));
            before = dump(dirA);
            const fn = fs.readFileSync(path.join(appRoot, 'api.php'), 'utf8').match(/function readable_error_message\(Throwable \$e\): string\n\{[\s\S]*?\n\}\n/)[0];
            const out = php(dirA, fn + String.raw`
echo readable_error_message(new PDOException('SQLSTATE[23000]: Integrity constraint violation: 19 UNIQUE constraint failed: places.geoname_id')), "\n";
echo readable_error_message(new PDOException('SQLSTATE[23000]: Integrity constraint violation: 19 UNIQUE constraint failed: labels.name'));`).split('\n');
            assert.match(out[0], /^Ce lieu existe déjà : veux-tu les fusionner \?/);
            assert.ok(!/UNIQUE|SQLSTATE/.test(out.join(' ')), out.join(' | '));
            assert.match(out[1], /Rien n’a été modifié/);
        });
        await t('entrées refusées, CSRF', async () => {
            for (const body of [{ from: 1, to: 1 }, { from: 'x', to: 1 }, { from: 999, to: 1 }, { from: -2, to: 1 }, {}]) {
                const r = await post('ld_merge', body);
                assert.equal(r.status, 422, JSON.stringify([body, r.body])); assert.ok(r.body.error && !/SQLSTATE/.test(r.body.error));
            }
            assert.notEqual((await post('ld_merge', { from: 2, to: 1 }, 'mauvais')).status, 200);
            assert.equal((await post('ld_undo', { id: 99999 })).status, 422);
            assert.deepEqual(dump(dirA), before);
        });
    } catch (e) { failed++; console.error(e); }

    /* ─── le navigateur ─── */
    let pw = null;
    for (const m of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(m); break; } catch (_) {} }
    if (!pw) { console.log('— navigateur : Playwright absent, partie sautée'); }
    else {
        const browser = await pw.chromium.launch();
        const errors = [];
        const watch = (p, name) => {
            p.on('pageerror', e => errors.push(`${name} : ${e.message}`));
            p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(`${name} : ${m.text()}`); });
            p.on('dialog', d => { errors.push(`${name} : dialogue natif ${d.message()}`); d.dismiss(); });
        };
        const shot = async (p, name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, name), fullPage: false }); };
        const noScroll = async p => { const sw = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert.ok(sw <= 0, `défilement horizontal : ${sw}`); };
        const undoLast = async (p, re) => {
            await p.waitForFunction(src => [...document.querySelectorAll('.ui-toast')].some(x => new RegExp(src).test(x.textContent)), re, { timeout: 8000 });
            const ok = await p.evaluate(src => { const tt = [...document.querySelectorAll('.ui-toast')].filter(x => new RegExp(src).test(x.textContent)).at(-1); const b = tt && [...tt.querySelectorAll('button')].find(x => /Annuler/.test(x.textContent)); if (b) b.click(); return !!b; }, re);
            assert.ok(ok, 'pas de ↶ Annuler pour ' + re);
            await p.waitForFunction(() => [...document.querySelectorAll('.ui-toast')].some(x => /↶ Annulé|Impossible d’annuler/.test(x.textContent)), null, { timeout: 10000 });
            const msg = await p.evaluate(() => [...document.querySelectorAll('.ui-toast')].map(x => x.textContent).filter(x => /↶ Annulé|Impossible d’annuler/.test(x)).at(-1));
            assert.ok(!/Impossible/.test(msg), msg);
            await p.evaluate(() => document.querySelectorAll('.ui-toast').forEach(x => x.remove())); // le prochain « ↶ Annulé » sera le sien
        };
        const typePernay = async p => {
            await p.evaluate(() => { window.__pk = window.LCNDA_PICKER.openPicker({ kind: 'place' }); });
            await p.waitForSelector('.pk-dialog .pk-input');
            await p.fill('.pk-dialog .pk-input', 'pernay');
            await p.waitForSelector('.pk-dialog .pk-dup', { timeout: 10000 });
        };
        try {
            for (const [name, vp, dark] of [['390', { width: 390, height: 844 }, false], ['sombre', { width: 1280, height: 860 }, true]]) {
                const ctx = await browser.newContext({ viewport: vp, colorScheme: dark ? 'dark' : 'light' });
                const p = await ctx.newPage(); watch(p, name);
                await p.goto(A.base);
                await p.waitForFunction(() => window.LCNDA_APP?.state && window.LCNDA_PICKER && window.LCNDA_EXT?.placeDup, null, { timeout: 20000 });
                if (dark) { await p.evaluate(() => { const A = window.LCNDA_APP; localStorage.setItem('genealogie-design', JSON.stringify({ ...A.readDesignSettings(), preset: 'dark' })); A.applyDesign(); }); assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), 'dark'); }
                await t(`${name} : menu de choix « ≈ même lieu que Pernay (Indre-et-Loire) ? » → fenêtre → Fusionner → ↶ Annuler`, async () => {
                    await typePernay(p);
                    const hints = await p.$$eval('.pk-dialog .pk-dup', h => h.map(x => x.textContent));
                    assert.equal(hints.length, 1, hints.join(' | '));
                    assert.match(hints[0], /≈ même lieu que Pernay \(Indre-et-Loire\) \?/);
                    const row = await p.$eval('.pk-dialog .pk-dup', h => h.closest('.pk-row').querySelector('.pk-name').textContent);
                    assert.match(row, /Centre-Val de Loire/, 'l’indice est sur la ligne du doublon');
                    if (dark) { const bg = await p.$eval('.pk-dup-btn', b => getComputedStyle(b).backgroundColor); assert.notEqual(bg, 'rgb(255, 251, 234)', 'bouton sombre'); }
                    await shot(p, `ld-picker-${name}.png`);
                    await p.click('.pk-dialog [data-pldup-merge]');
                    await p.waitForSelector('.ld-dialog .ld-side.is-keep h3', { timeout: 10000 });
                    const sides = await p.$$eval('.ld-dialog .ld-side h3', h => h.map(x => x.textContent));
                    assert.deepEqual(sides, ['Pernay', 'Pernay, Indre-et-Loire, Centre-Val de Loire, France'], 'gardé à gauche, doublon à droite');
                    const moves = await p.$eval('.ld-dialog .ld-moves', u => u.textContent);
                    assert.match(moves, /événements : 2/); assert.match(moves, /recensements : 1/);
                    assert.match(await p.$eval('.ld-dialog', d => d.textContent), /région/);
                    if (vp.width < 500) { const cols = await p.$eval('.ld-sides', s => getComputedStyle(s).gridTemplateColumns.split(' ').length); assert.equal(cols, 1, 'une colonne à 390 px'); }
                    await noScroll(p);
                    await shot(p, `ld-dialog-${name}.png`);
                    // changer d'avis : garder l'autre, puis revenir
                    await p.click('.ld-dialog [name="ld_keep"]:not(:checked)'); await p.waitForTimeout(600);
                    assert.equal(await p.$eval('.ld-dialog .ld-side.is-keep h3', h => h.textContent), 'Pernay, Indre-et-Loire, Centre-Val de Loire, France');
                    await p.click('.ld-dialog [name="ld_keep"]:not(:checked)'); await p.waitForTimeout(600);
                    assert.equal(await p.$eval('.ld-dialog .ld-side.is-keep h3', h => h.textContent), 'Pernay');
                    await p.click('.ld-dialog [data-ld-go]');
                    await p.waitForSelector('.ld-dialog', { state: 'detached', timeout: 10000 });
                    assert.ok(!dump(dirA).places.some(x => x.id === 2), 'fusionné');
                    await p.waitForFunction(() => document.querySelectorAll('.pk-dialog .pk-row[data-row]').length >= 1 && !document.querySelector('.pk-dialog .pk-dup'), null, { timeout: 10000 });
                    await undoLast(p, 'Lieux fusionnés');
                    assert.deepEqual(dump(dirA), before, '↶ Annuler depuis l’écran');
                    await p.evaluate(() => document.querySelector('.pk-dialog')?.close());
                });
                await t(`${name} : doublon vide retiré d’un clic (Lerné), ↶`, async () => {
                    await p.evaluate(() => { window.LCNDA_PICKER.openPicker({ kind: 'place' }); });
                    await p.waitForSelector('.pk-dialog .pk-input');
                    await p.fill('.pk-dialog .pk-input', 'lerne');
                    await p.waitForSelector('.pk-dialog [data-pldup-empty]', { timeout: 10000 });
                    assert.match(await p.$eval('.pk-dialog [data-pldup-empty]', b => b.textContent), /Supprimer ce lieu vide \(doublon\)/);
                    await p.click('.pk-dialog [data-pldup-empty]');
                    await p.waitForFunction(() => !document.querySelector('.pk-dialog [data-pldup-empty]'), null, { timeout: 10000 });
                    assert.ok(!dump(dirA).places.some(x => x.id === 11));
                    await undoLast(p, 'Lieu vide retiré');
                    assert.deepEqual(dump(dirA), before);
                    await p.evaluate(() => document.querySelector('.pk-dialog')?.close());
                });
                await t(`${name} : Réglages → Modifications groupées : la liste et « Tout fusionner (sûrs seulement) »`, async () => {
                    await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'bulk'; A.setModule('maintenance'); });
                    await p.waitForSelector('[data-ld-panel] .ld-group', { timeout: 15000 });
                    const txt = await p.$eval('[data-ld-panel]', s => s.textContent);
                    assert.match(txt, /Lieux en double probables/); assert.match(txt, /Pernay, Indre-et-Loire, Centre-Val de Loire, France/); assert.match(txt, /à vérifier/);
                    assert.match(await p.$eval('[data-ld-all]', b => b.textContent), /Tout fusionner \(sûrs seulement\) : 4/);
                    await noScroll(p);
                    await shot(p, `ld-reglages-${name}.png`);
                    await p.click('[data-ld-panel] [data-ld-merge="2"]');
                    await p.waitForSelector('.ld-dialog .ld-side.is-keep h3');
                    await p.click('.ld-dialog [data-ld-close]');
                    await p.click('[data-ld-all]');
                    await p.waitForFunction(() => !document.querySelector('[data-ld-all]') && document.querySelector('[data-ld-panel]'), null, { timeout: 10000 });
                    assert.equal(dump(dirA).places.length, 7);
                    await undoLast(p, 'Lieux en double fusionnés');
                    assert.deepEqual(dump(dirA), before);
                });
                await ctx.close();
            }
            assert.deepEqual(errors, [], errors.join('\n'));
        } catch (e) { failed++; console.error(e); }
        finally { await browser.close(); }
    }

    /* ─── mode consultation : rien ne se fusionne, pas d'indice ─── */
    try {
        await t('mode consultation : fusion refusée, pas d’indice dans le menu de choix', async () => {
            assert.equal((await post('kiosk_enter', { password: 'secret-1234' })).status, 200);
            const r = await post('ld_merge', { from: 2, to: 1 });
            assert.equal(r.status, 423, JSON.stringify(r.body)); assert.ok(r.body.kiosk);
            assert.equal((await post('ld_merge_safe', {})).status, 423);
            assert.equal((await post('merge_duplicate_places', { confirm: 'yes' })).status, 423);
            const pk = await get('picker_search', { kind: 'place', q: 'pernay' });
            assert.ok(!(pk.groups || []).flatMap(g => g.items).some(i => i.dup_of), 'pas d’indice en consultation');
            assert.deepEqual(dump(dirA), before);
            assert.equal((await post('kiosk_exit', { password: 'secret-1234' })).status, 200);
        });
    } finally {
        A.proc.kill();
        fs.rmSync(tmp, { recursive: true, force: true });
    }
    console.log(failed ? `✗ ${failed} échec(s)` : '✓ tout est bon');
    process.exit(failed ? 1 : 0);
})();
