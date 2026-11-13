'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🗺️ Cartes en plus, vague 1 (lib/cartes_plus.php, assets/js/heritage-cartes-plus.js, heritage-diagram-cartes-plus.js) :
 *   node tests/test-cartes-plus-1.js     (captures : SHOTS=dossier)
 *  1. calculs (PHP) : l'historique des communes de l'INSEE lu depuis des fichiers d'ESSAI INVENTÉS (tests/fixtures/frontieres,
 *     aucun téléchargement réel : adresses file:// par LCNDA_FRONTIERES_SOURCES) — disparues, fusions en chaîne, commune
 *     nouvelle, rétablie, renommée, positions ; un fichier aux mauvaises colonnes est refusé et rien n'est installé ;
 *  2. l'API : état, tailles annoncées, téléchargement (taille et empreinte sha256 gardées), communes d'un cadre, anciens noms
 *     dans le menu de choix des lieux (« anc. « … » »), retirer / remettre (↶ Annuler), CSRF ; données des cartes de
 *     Graphiques : patronymes, chaleur, ADN, recherches — jamais un vivant ni une fiche confidentielle ;
 *  3. le navigateur (Playwright ; sinon sauté) à 1440 px clair, 390 px sombre : ⇆ Comparer (trait à glisser, souris et clavier,
 *     côte à côte, transparence), 🏛 Frontières (provinces, départements de 1790, communes disparues + bulle), Réglages →
 *     Frontières anciennes (taille, téléchargement), les 4 cartes de Graphiques (dessin, « Depuis l'app », curseur ▶ commun,
 *     clic sur une commune des recherches), SVG valides, pas de défilement de côté, aucune erreur JavaScript.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
if (!phpPath) { console.log('— PHP absent : test sauté'); process.exit(0); }
const SHOTS = process.env.SHOTS || '';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-cartes-plus-'));
const FX = path.join(appRoot, 'tests', 'fixtures', 'frontieres');
const MVT = path.join(FX, 'v_mvt_commune.csv'), COM = path.join(FX, 'v_commune_depuis_1943.csv');
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const dir = path.join(tmp, 'data'), frDir = path.join(tmp, 'frontieres');
const SOURCES = JSON.stringify({ mvt: { url: 'file://' + MVT }, com: { url: 'file://' + COM } });
const envFor = (d, extra = {}) => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1', LCNDA_FRONTIERES_DIR: frDir, LCNDA_FRONTIERES_SOURCES: SOURCES, ...extra });
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db(); dna_ensure($pdo);
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin2_code,admin4_code,feature_code,population) VALUES
 (1,'Naves','Corrèze','France',45.3118,1.7521,'19','19146','PPL',2441),(2,'Tulle','Corrèze','France',45.2694,1.7680,'19','19272','PPLA2',16969),
 (3,'Brive-la-Gaillarde','Corrèze','France',45.1440,1.5123,'19','19031','PPLA3',46000),(4,'Chameyrat','Corrèze','France',45.2471,1.7043,'19','19038','PPL',1603),
 (5,'Puy-d''Essai','Corrèze','France',45.3300,1.7900,'19','19146','PPL',0),(6,'Lectoure','Gers','France',NULL,NULL,'32','32208','PPL',3700)");
$pdo->exec("INSERT INTO commune_contours(insee_code,name,geometry_json,min_lon,min_lat,max_lon,max_lat,centroid_lon,centroid_lat) VALUES
 ('19146','Naves','{}',1.7,45.28,1.8,45.35,1.7521,45.3117),('19038','Chameyrat','{}',1.67,45.22,1.74,45.27,1.7043,45.2471),('19082','Favars','{}',1.64,45.24,1.70,45.29,1.6704,45.2632),('32208','Lectoure','{}',0.6,43.9,0.7,43.99,0.6525,43.9444)");
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start,is_private) VALUES
 (1,'Jean','MARTIN','male','deceased',1,0),(2,'Pierre','MARTIN','male','living',0,0),(3,'Paul','MARTIN','male','deceased',0,1),(4,'Marie','DUPOUY','female','deceased',0,0),
 (5,'Louis','MARTIN','male','deceased',0,0),(8,'Claire','VIDAL','female','living',0,0),(9,'Anne','ROUX','female','deceased',0,0)");
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,5,4),(2,5,9)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,1),(2,8)");
$ev = $pdo->prepare('INSERT INTO events(id,scope,person_id,family_id,event_type_id,date_text,year,place_id) VALUES(?,?,?,?,?,?,?,?)');
foreach ([[1,'person',1,null,'BIRT','1850',1850,1],[2,'person',1,null,'DEAT','1910',1910,2],[3,'person',2,null,'BIRT','1990',1990,1],[4,'person',3,null,'BIRT','1860',1860,3],
  [5,'person',4,null,'BIRT','1825',1825,6],[6,'person',5,null,'BIRT','1820',1820,1],[7,'family',null,1,'MARR','1848',1848,1],[8,'person',5,null,'DEAT','1795',1795,4]] as $r) { $r[4] = $t($r[4]); $ev->execute($r); }
$pdo->exec("INSERT INTO archive_digest_entries(id,place_id,city_name,record_type,status,year_text,archive_reference) VALUES(1,1,'Naves','naissance','done','1840-1860','2 E 146')");
$pdo->exec("INSERT INTO battues(id,title,start_insee_code) VALUES(1,'Autour de Lectoure','32208')");
$pdo->exec("INSERT INTO battue_search_items(battue_id,insee_code,record_type,period,status,title) VALUES(1,'32208','mariage','1800-1820','todo','Mariages')");
$pdo->exec("INSERT INTO dna_groups(id,name,color,side,ancestor,notes,position) VALUES(1,'Côté père','#4e79a7','','','',1)");
$pdo->exec("INSERT INTO dna_kits(id,person_id,label) VALUES(1,1,'Mon test')");
$pdo->exec("INSERT INTO dna_matches(id,kit_id,name,person_id,shared_cm,group_ids) VALUES(1,1,'Claire Vidal (vivante)',8,820,'1'),(2,1,'Inconnu',NULL,40,'')");
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env: envFor(dir) });
if (seed.status !== 0 || !String(seed.stdout).includes('ok')) { console.error(seed.stderr || seed.stdout); process.exit(1); }

const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
async function startServer() {
    const port = Number(process.env.CP_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(dir), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let cookie = '';
    const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
    const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
    const get = async (action, q = {}) => (await fetch(`${base}api.php?action=${action}&${new URLSearchParams(q)}`, { headers: { Cookie: cookie } })).json();
    const post = async (action, body = {}, token = csrf) => { const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: JSON.stringify({ ...body, csrf_token: token }) }); let b = null; try { b = await r.json(); } catch (_) {} return { status: r.status, body: b }; };
    return { proc, base, get, post };
}
const php = code => spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: envFor(dir, { LCNDA_FRONTIERES_DIR: path.join(tmp, 'fr-calc') }) });

(async () => {
    // ── 1. les calculs, sans serveur ──
    await t('historique des communes : disparues, chaîne de fusions, commune nouvelle, rétablie, renommée, positions', async () => {
        const r = php(String.raw`require 'lib/paths.php'; require 'lib/bootstrap.php'; require 'lib/picker.php'; require 'lib/cartes_plus.php'; $pdo = db();
            echo json_encode(cp_front_build($pdo, '${MVT}', '${COM}'), JSON_UNESCAPED_UNICODE);`);
        assert.equal(r.status, 0, r.stderr + r.stdout);
        const d = JSON.parse(r.stdout), by = n => d.records.find(x => x.n === n);
        const puy = by("Puy-d'Essai"); assert.equal(puy.k, 'gone'); assert.equal(puy.d, '1973-01-01'); assert.equal(puy.nc, '19146'); assert.equal(puy.nn, 'Naves'); assert.equal(puy.as, 'associée');
        assert.deepEqual([puy.lat, puy.lon, puy.approx], [45.33, 1.79, 0], 'placée au lieu-dit de même nom');
        const fav = by('Favars'); assert.equal(fav.tc, '19038'); assert.equal(fav.nn, 'Chameyrat-et-Favars'); assert.equal(fav.as, 'déléguée');
        const bois = by('Essai-les-Bois'); assert.equal(bois.tn, 'Favars', 'fusionnée dans Favars en 1960'); assert.equal(bois.nc, '19038', '… aujourd’hui Chameyrat-et-Favars'); assert.equal(bois.approx, 1, 'sans lieu ni contour : centre d’aujourd’hui');
        const bourg = by('Le Bourg-Essai'); assert.equal(bourg.m, 30); assert.equal(bourg.back, '1980-01-01', 'rétablie');
        assert.equal(by('Tulle-d\'Essai').k, 'rename'); assert.equal(by('Tulle-d\'Essai').tn, 'Tulle');
        assert.equal(by('Chameyrat').tn, 'Chameyrat-et-Favars', 'le chef-lieu renommé compte aussi');
        assert.ok(!d.records.some(x => x.n === 'Naves'), 'le chef-lieu qui garde son nom ne disparaît pas');
    });
    await t('un fichier aux mauvaises colonnes est refusé : rien n’est installé', async () => {
        const bad = path.join(tmp, 'bad.csv'); fs.writeFileSync(bad, 'A,B,C\n1,2,3\n');
        const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`require 'lib/paths.php'; require 'lib/bootstrap.php'; require 'lib/picker.php'; require 'lib/cartes_plus.php'; $pdo = db();
            try { cp_front_download($pdo); echo 'INSTALLÉ'; } catch (Throwable $e) { echo 'REFUS:' . $e->getMessage(); }`], { cwd: appRoot, encoding: 'utf8', env: envFor(dir, { LCNDA_FRONTIERES_DIR: path.join(tmp, 'fr-bad'), LCNDA_FRONTIERES_SOURCES: JSON.stringify({ mvt: { url: 'file://' + bad }, com: { url: 'file://' + COM } }) }) });
        assert.match(r.stdout, /^REFUS:.*colonnes attendues/, r.stdout + r.stderr);
        assert.deepEqual(fs.existsSync(path.join(tmp, 'fr-bad')) ? fs.readdirSync(path.join(tmp, 'fr-bad')) : [], [], 'aucun fichier gardé');
        const r2 = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`require 'lib/paths.php'; require 'lib/bootstrap.php'; require 'lib/picker.php'; require 'lib/cartes_plus.php'; $pdo = db();
            try { cp_front_download($pdo); echo 'INSTALLÉ'; } catch (Throwable $e) { echo 'REFUS:' . $e->getMessage(); }`], { cwd: appRoot, encoding: 'utf8', env: envFor(dir, { LCNDA_FRONTIERES_DIR: path.join(tmp, 'fr-bad2'), LCNDA_FRONTIERES_SOURCES: JSON.stringify({ mvt: { url: 'file://' + MVT, size: 99 }, com: { url: 'file://' + COM } }) }) });
        assert.match(r2.stdout, /^REFUS:.*taille différente/, 'taille annoncée différente');
        const r3 = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`require 'lib/paths.php'; require 'lib/bootstrap.php'; require 'lib/picker.php'; require 'lib/cartes_plus.php'; $pdo = db();
            try { cp_front_download($pdo); echo 'INSTALLÉ'; } catch (Throwable $e) { echo 'REFUS:' . $e->getMessage(); }`], { cwd: appRoot, encoding: 'utf8', env: envFor(dir, { LCNDA_FRONTIERES_DIR: path.join(tmp, 'fr-bad3'), LCNDA_FRONTIERES_SOURCES: JSON.stringify({ mvt: { url: 'file://' + MVT, checksum: { type: 'sha256', value: '0'.repeat(64) } }, com: { url: 'file://' + COM } }) }) });
        assert.match(r3.stdout, /^REFUS:.*empreinte différente/, 'empreinte publiée différente');
        const r4 = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`require 'lib/paths.php'; require 'lib/bootstrap.php'; require 'lib/picker.php'; require 'lib/cartes_plus.php'; var_dump(cp_http_get('http://exemple.invalid/x.csv', 100)['ok']);`], { cwd: appRoot, encoding: 'utf8', env: envFor(dir) });
        assert.match(r4.stdout, /bool\(false\)/, 'http:// refusé (https seulement)');
    });

    // ── 2. l'API ──
    const S = await startServer(); const { get, post, base } = S;
    try {
        await t('API : état, tailles annoncées, téléchargement (taille, sha256), communes d’un cadre et d’un code', async () => {
            let st = await get('frontieres_status'); assert.equal(st.installed, false); assert.equal(st.files.length, 2);
            const rem = await get('frontieres_remote'); assert.equal(rem.total, fs.statSync(MVT).size + fs.statSync(COM).size); assert.equal(rem.files[0].from, 'essai');
            const no = await post('frontieres_download', {}, 'mauvais-jeton'); assert.ok(no.status >= 400, 'CSRF');
            const r = await post('frontieres_download'); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.gone, 5); assert.ok(r.body.names >= 3, 'anciens noms ajoutés');
            st = await get('frontieres_status'); assert.equal(st.installed, true); assert.equal(st.renamed, 1);
            const f = st.files.find(x => x.key === 'mvt'); assert.equal(f.size, fs.statSync(MVT).size); assert.equal(f.sha256, crypto.createHash('sha256').update(fs.readFileSync(MVT)).digest('hex'));
            assert.equal(st.apply_needed, false);
            const c = await get('frontieres_communes', { w: 1.5, s: 45.1, e: 2, n: 45.5 }); assert.ok(c.items.some(x => x.n === "Puy-d'Essai")); assert.ok(!c.items.some(x => x.k === 'rename'), 'renommées seulement si demandées');
            assert.ok((await get('frontieres_communes', { w: 1.5, s: 45.1, e: 2, n: 45.5, renames: 1 })).items.some(x => x.k === 'rename'));
            assert.equal((await get('frontieres_communes', { w: -5, s: 48, e: -4, n: 49 })).items.length, 0);
            assert.ok((await get('frontieres_communes', { code: '19038' })).items.length >= 2);
        });
        await t('menu de choix des lieux : l’ancien nom trouve la commune d’aujourd’hui (« anc. « … » »), retiré avec les fichiers puis remis', async () => {
            const find = async q => ((await get('picker_search', { kind: 'place', q, limit: 10 })).groups || []).flatMap(g => g.items || []);
            let it = (await find('Essai-les-Bois')).find(x => x.title.startsWith('Chameyrat')); assert.ok(it, 'trouvée'); assert.match(it.meta, /anc\. « Essai-les-Bois »/);
            assert.ok((await find('Favars')).some(x => x.title.startsWith('Chameyrat')));
            const rm = await post('frontieres_remove'); assert.equal(rm.status, 200);
            assert.equal((await get('frontieres_status')).installed, false);
            assert.ok(!(await find('Essai-les-Bois')).some(x => x.title.startsWith('Chameyrat')), 'retiré');
            const back = await post('frontieres_restore'); assert.equal(back.status, 200, JSON.stringify(back.body));
            assert.equal((await get('frontieres_status')).installed, true);
            assert.ok((await find('Essai-les-Bois')).some(x => x.title.startsWith('Chameyrat')), 'remis');
        });
        await t('cartes de Graphiques : patronymes, chaleur, ADN, recherches — jamais un vivant ni une fiche confidentielle', async () => {
            const names = (await get('cartes_plus', { what: 'surnames' })).surnames; assert.equal(names[0].n, 'MARTIN'); assert.equal(names[0].c, 2, 'Jean et Louis (pas le vivant, pas la fiche confidentielle)');
            const s = await get('cartes_plus', { what: 'surname', name: 'martin' }); assert.equal(s.name, 'MARTIN');
            const pids = new Set(s.events.map(e => e[0])); assert.ok(pids.has(1) && pids.has(5)); assert.ok(!pids.has(2) && !pids.has(3));
            assert.equal(s.places[1][1], '19');
            const h = await get('cartes_plus', { what: 'heat' }); assert.equal(h.places[6]?.[2], 43.9444, 'sans position : le centre de la commune'); assert.ok(h.events.every(e => e[0] !== 2 && e[0] !== 3 && e[2] !== null));
            assert.ok(!JSON.stringify(h.people).includes('Pierre'));
            const d = await get('cartes_plus', { what: 'dna' }); assert.equal(d.matches.length, 1); assert.equal(d.matches[0].name, 'Correspondance n° 1', 'nom de la correspondance caché');
            assert.equal(d.matches[0].anc[0].id, 5); assert.ok(d.anc_places[5].length >= 1); assert.equal(d.groups[1].color, '#4e79a7');
            assert.equal((await get('cartes_plus', { what: 'dna', names: 1 })).matches[0].name, 'Claire Vidal (vivante)');
            const r = await get('cartes_plus', { what: 'research' }), by = n => r.communes.find(c => c.name === n);
            assert.ok(by('Naves').items.some(x => x.state === 'seen' && x.type === 'naissance'));
            assert.ok(by('Lectoure').items.some(x => x.state === 'todo' && x.type === 'mariage'));
            assert.ok(!JSON.stringify(r).includes('Pierre MARTIN'));
            assert.equal((await get('cartes_plus', { what: 'xx' })).error, 'Demande inconnue.');
        });

        // ── 3. le navigateur ──
        let chromium = null; try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (_) { try { ({ chromium } = require('playwright')); } catch (_) {} }
        if (!chromium) { console.log('— Playwright absent : navigateur sauté'); return; }
        const browser = await chromium.launch();
        const shot = async (p, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, name + '.png') }); } };
        const closeAll = p => p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => { d.close(); d.remove(); }));
        try {
            for (const [label, opts] of [['1440 px, clair', { viewport: { width: 1440, height: 900 } }], ['390 px, sombre', { viewport: { width: 390, height: 844 }, colorScheme: 'dark' }]]) {
                const ctx = await browser.newContext(opts), p = await ctx.newPage(), narrow = opts.viewport.width < 500, tag = narrow ? '390-sombre' : '1440';
                const errors = [];
                p.on('pageerror', e => errors.push(e.message));
                p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource|ERR_|net::/.test(m.text())) errors.push(m.text()); });
                await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort()); // aucune tuile d'Internet
                await p.goto(base);
                await p.waitForFunction(() => window.LCNDA_APP?.state?.bootstrap && window.LCNDA_EXT?.mapCompare && window.LCNDA_EXT?.diagramCartesPlus, null, { timeout: 30000 });
                if (narrow) await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
                await p.evaluate(() => { localStorage.removeItem('lcnda-map-compare'); localStorage.removeItem('lcnda-map-frontieres'); });
                const noSide = async () => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'pas de défilement de côté');

                await t(`Carte : ⇆ Comparer — trait à glisser (souris, clavier), côte à côte, transparence (${label})`, async () => {
                    await p.evaluate(() => window.LCNDA_APP.setModule('carte')); await p.waitForSelector('.map-layout [data-cp-cmp]');
                    await p.click('[data-cp-cmp]'); await p.waitForSelector('.cp-cmp-handle');
                    assert.ok(await p.$$eval('.cp-cmp-b img.map-tile', x => x.length) > 0, 'tuiles du 2e fond');
                    await p.$eval('#map-stage', e => e.scrollIntoView({block: 'center'})); await p.waitForTimeout(200);
                    const box = await (await p.$('#map-stage')).boundingBox();
                    const hb = await (await p.$('.cp-cmp-handle')).boundingBox();
                    await p.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await p.mouse.down(); await p.mouse.move(box.x + box.width * .3, hb.y + hb.height / 2, { steps: 5 }); await p.mouse.up();
                    const pos = await p.evaluate(() => JSON.parse(localStorage.getItem('lcnda-map-compare')).pos); assert.ok(Math.abs(pos - .3) < .05, String(pos));
                    assert.match(await p.$eval('.cp-cmp-b', e => e.style.clipPath), /inset\(0px 0px 0px \d+px\)/);
                    await p.focus('.cp-cmp-handle'); await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight');
                    assert.ok(Math.abs(await p.evaluate(() => JSON.parse(localStorage.getItem('lcnda-map-compare')).pos) - (pos + .04)) < .011, 'flèches');
                    await p.$eval('[data-cp-cmp-bg]', e => { e.value = 'etatmajor'; e.dispatchEvent(new Event('change', {bubbles: true})); }); await p.waitForTimeout(100);
                    assert.match(await p.$eval('.cp-cmp-tag.is-b', e => e.textContent), /▶/);
                    await shot(p, `comparer-trait-${tag}`);
                    await p.click('[data-cp-cmp-mode="side"]'); await p.waitForSelector('.cp-cmp-half.is-b');
                    assert.ok(await p.$eval('#map-stage', e => e.classList.contains('is-cmp-side')));
                    await shot(p, `comparer-cote-${tag}`);
                    await p.click('[data-cp-cmp-mode="fade"]'); await p.waitForSelector('[data-cp-cmp-op]');
                    await p.fill('[data-cp-cmp-opn]', '30'); await p.waitForTimeout(50);
                    assert.equal(await p.$eval('.cp-cmp-b', e => e.style.opacity), '0.3');
                    await noSide();
                    await p.click('[data-cp-cmp-off]'); assert.equal(await p.$eval('.cp-cmp', e => e.hidden), true);
                });
                await t(`Carte : 🏛 Frontières — provinces, départements de 1790, communes disparues et leur bulle (${label})`, async () => {
                    await p.click('[data-cp-fr]'); await p.waitForSelector('.cp-fr-menu');
                    await p.check('[data-cp-fr-k="prov"]'); await p.waitForSelector('#cp-fr-svg [data-cp-zone^="prov|"]');
                    const prov = await p.evaluate(() => { const G = window.LCNDA_EXT.cartesPlus.groupsOf('prov').G; return {n: G.size, bret: G.get('Bretagne').deps.map(d => d.code).sort(), savoie: G.get('Savoie').out}; });
                    assert.deepEqual(prov.bret, ['22', '29', '35', '44', '56']); assert.equal(prov.savoie, true); assert.ok(prov.n >= 30 && prov.n <= 40, String(prov.n));
                    await p.check('[data-cp-fr-k="d1790"]'); await p.waitForSelector('#cp-fr-svg [data-cp-zone^="d1790|"]');
                    const d = await p.evaluate(() => { const G = window.LCNDA_EXT.cartesPlus.groupsOf('d1790').G; return {inFr: [...G.values()].filter(g => !g.out).length, rl: G.get('Rhône-et-Loire').deps.map(x => x.code).sort(), corse: G.get('Corse').deps.length}; });
                    assert.equal(d.inFr, 83, 'les 83 départements de 1790'); assert.deepEqual(d.rl, ['42', '69']); assert.equal(d.corse, 2);
                    await p.check('[data-cp-fr-k="gone"]');
                    await p.keyboard.press('Escape');
                    await shot(p, `frontieres-${tag}`);
                    await p.evaluate(() => { const st = window.LCNDA_APP.state; st.mapCenter = {lat: 45.30, lon: 1.75}; st.mapZoom = 11; window.LCNDA_APP.drawMap(); });
                    await p.waitForSelector('#cp-fr-svg [data-cp-gone]', { timeout: 8000 });
                    await p.evaluate(() => document.querySelector('#cp-fr-svg [data-cp-gone]').dispatchEvent(new MouseEvent('click', {bubbles: true, clientX: 200, clientY: 200})));
                    await p.waitForSelector('.cp-pop'); const txt = await p.$eval('.cp-pop', e => e.textContent);
                    assert.match(txt, /Aujourd’hui : (Naves|Chameyrat-et-Favars)/); assert.match(txt, /INSEE/);
                    await shot(p, `communes-disparues-${tag}`);
                    await p.click('.cp-pop-x'); await noSide();
                    await p.evaluate(() => localStorage.removeItem('lcnda-map-frontieres'));
                });
                await t(`Réglages → 🏛 Frontières anciennes : fichiers, tailles, empreintes, retirer avec ↶ Annuler (${label})`, async () => {
                    await p.evaluate(() => { const st = window.LCNDA_APP.state; st.maintenanceTab = 'frontieres'; window.LCNDA_APP.setModule('maintenance'); });
                    await p.waitForSelector('.cp-settings .cp-set-row');
                    const rows = await p.$$eval('.cp-set-row', els => els.map(e => e.textContent));
                    assert.match(rows[0], /octets/); assert.match(rows[0], /sha256/); assert.match(rows[0], /Installé/i);
                    await noSide(); await shot(p, `reglages-frontieres-${tag}`);
                    if (!narrow) {
                        await p.click('[data-cp-rm]'); await p.waitForSelector('[data-cp-dl] [data-cp-size]');
                        await p.waitForFunction(() => /\(\d/.test(document.querySelector('[data-cp-size]')?.textContent || ''), null, { timeout: 5000 });
                        assert.match(await p.$eval('[data-cp-size]', e => e.textContent), /\(2 Ko\)/);
                        await p.click('[data-cp-dl]'); await p.waitForSelector('[data-cp-rm]', { timeout: 10000 });
                    }
                });
                for (const [kind, prep] of [['surnamemap', async () => { await p.waitForFunction(() => /MARTIN/.test(document.querySelector('[data-cp="name"]')?.textContent || '')); await p.selectOption('[data-cp="name"]', 'MARTIN'); }],
                    ['heatdecades', null], ['dnamap', async () => { await p.waitForFunction(() => /Mon test/.test(document.querySelector('[data-cp="kit"]')?.textContent || '')); }], ['researchmap', null]]) {
                    await t(`Graphiques : ${kind} — exemple, « Depuis l’app », curseur ▶ commun (${label})`, async () => {
                        await closeAll(p); await p.evaluate(k => { window.LCNDA_EXT.openDiagramEditor(null, { kind: k }); }, kind);
                        await p.waitForSelector('dialog.h-dg-dlg[open] [data-dg-preview] svg [data-geo-map]', { timeout: 15000 });
                        await p.click('[data-dg-tab="app"]'); await p.waitForSelector('[data-cp-go]');
                        if (prep) await prep();
                        await p.click('[data-cp-go]');
                        await p.waitForFunction(() => !document.querySelector('[data-cp-msg]') || /✓|⚠️/.test(document.querySelector('[data-cp-msg]').textContent), null, { timeout: 10000 });
                        const msg = await p.evaluate(() => document.querySelector('[data-cp-msg]')?.textContent || '✓ onglet Données'); assert.match(msg, /^✓/, msg);
                        const expect = {surnamemap: 'MARTIN', heatdecades: 'événement', dnamap: 'ancêtre', researchmap: 'Naves'}[kind];
                        await p.waitForFunction(w => (document.querySelector('[data-dg-preview]')?.innerHTML || '').includes(w) && document.querySelector('[data-dg-preview] svg [data-geo-map]'), expect, { timeout: 10000 });
                        await p.waitForTimeout(400);
                        const svg = await p.$eval('[data-dg-preview]', e => e.innerHTML);
                        assert.doesNotMatch(svg, /Pierre MARTIN|Paul MARTIN|Claire Vidal/, 'ni vivant, ni confidentielle, ni nom de correspondance');
                        if (kind === 'surnamemap' || kind === 'heatdecades') {
                            await p.waitForSelector('.h-dgp-play', { timeout: 5000 });
                            await p.$eval('.h-dgp-play input[type=range]', e => { e.value = '0'; e.dispatchEvent(new Event('input', {bubbles: true})); });
                            await p.waitForFunction(k => { const h = document.querySelector('[data-dg-preview]')?.innerHTML || ''; return k === 'surnamemap' ? /\d+e siècle</.test(h) : /Carte de chaleur : \d+ événements? \(années \d{4}\)/.test(h); }, kind, { timeout: 5000 });
                        }
                        if (kind === 'surnamemap') assert.match(svg, /Corrèze \(19\) : \d mention/);
                        if (kind === 'researchmap') {
                            assert.match(svg, /Naves/); await p.evaluate(() => document.querySelector('[data-dg-preview] .cpr-c').dispatchEvent(new MouseEvent('click', {bubbles: true})));
                            await p.waitForSelector('dialog[open] .cpr-dialog'); assert.match(await p.$eval('dialog[open] .cpr-dialog', e => e.textContent), /Ce qui a été vu[\s\S]*Ce qui manque/);
                            await shot(p, `recherches-detail-${tag}`); await p.evaluate(() => document.querySelector('dialog[open] .cpr-dialog').closest('dialog').close());
                        }
                        await noSide(); await shot(p, `${kind}-${tag}`); await closeAll(p);
                    });
                }
                await t(`les 4 cartes : SVG valides qui s’ouvrent comme une image (export PNG / SVG) (${label})`, async () => {
                    const bad = await p.evaluate(async () => { const R = window.LCNDA_EXT.diagramRender, out = [];
                        for (const k of ['surnamemap', 'heatdecades', 'dnamap', 'researchmap']) { const sp = {kind: k, ...R.KINDS[k].sample()}; const svg = R.svg(await R.KINDS[k].resolve(sp), 900);
                            if (/data-geo-wait/.test(svg)) out.push(k + ' : fond pas chargé');
                            if (new DOMParser().parseFromString(svg, 'image/svg+xml').querySelector('parsererror')) out.push(k + ' : XML');
                            if (!await new Promise(ok => { const i = new Image(); i.onload = () => ok(true); i.onerror = () => ok(false); i.src = URL.createObjectURL(new Blob([svg], {type: 'image/svg+xml'})); })) out.push(k + ' : image'); }
                        return out; });
                    assert.deepEqual(bad, []);
                });
                await t(`aucune erreur JavaScript (${label})`, async () => { assert.deepEqual(errors, []); });
                await ctx.close();
            }
        } finally { await browser.close(); }
    } finally { S.proc.kill(); }
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(failed ? `✗ ${failed} échec(s)` : '✓ tout est bon');
    process.exit(failed ? 1 : 0);
})();
