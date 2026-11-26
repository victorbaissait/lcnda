#!/usr/bin/env node
/* 🏛 Archives et mémoire (lot N « téléchargements ») — scripts/telech-n/build_archives.py, lib/sources_n1.php, assets/js/app-lot-n-archives.js,
 *  .github/workflows/telech-n.yml.
 *  1. fabrication (vrai programme, sources d'essai tests/fixtures/lot-n-archives/ : mêmes colonnes que les vrais fichiers, noms inventés) :
 *     registres commune par commune (INSEE retrouvé par le nom, acte, années, en ligne ou non), inventaires, lieux (France seulement),
 *     autorités (familles, institutions ; une personne seulement si l'année de sa mort est connue), morts pour la France (sans date : écarté),
 *     monuments (cp1252, liens seulement), plaques ; une source absente n'arrête pas les autres ; le sommaire (taille, empreinte).
 *  2. calcul (Node) : l'acte de telle année est-il en ligne ? ; homonymes des morts pour la France, des plaques, des familles ; liens sûrs.
 *  3. serveur et écran (php -S + Playwright, « GitHub » = un dossier local) : rien d'installé → seulement des liens et une offre discrète ;
 *     ⤓ tout installer (↶), empreinte fausse refusée, 🗑 retirer (↶) ; fiche d'une personne décédée (🎖, 🏛 registres, 🕯 plaque, 👪 famille),
 *     rien pour une fiche vivante ou confidentielle ; village ; listes, cartes, monographie, 🗂 Données, Réglages (⚙️ Personnaliser, ↶) ;
 *     rien ne part sur Internet ; aucune erreur JavaScript.
 *  Fiches (noms inventés) : Jean Baptiste MAZAUD (12 avril 1890 Nantes – 1915), Marie DURAND (1795 Lamballe – 1860 Digne-les-Bains),
 *  Jean MAZAUD (1910 – 1944 Paris), Luc MAZAUD (vivant, 1990 Nantes).
 *   node tests/test-lot-n-archives.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const zlib = require('zlib');
const crypto = require('crypto');
const {spawn, spawnSync} = require('child_process');
let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
const root = path.join(__dirname, '..');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
const N = require('../assets/js/app-lot-n-archives.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-tn-')), site = path.join(tmp, 'site');
    fs.mkdirSync(site, {recursive: true});
    const mk = spawnSync('python3', ['-I', path.join(root, 'scripts/telech-n/build_archives.py'), site, 'tout'], {encoding: 'utf8', env: {...process.env, TN_FIXTURES: path.join(root, 'tests/fixtures/lot-n-archives')}});
    if (mk.status !== 0) { console.error(mk.stderr || mk.stdout); process.exit(1); }
    const raw = k => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(site, `tn-${k}.json.gz`))).toString('utf8'));
    const rows = k => N.table(raw(k));

    /* ═════════ 1. la fabrication ═════════ */
    await t('fabrication : 8 packs, chacun avec sa source data.gouv.fr et sa licence ; le sommaire (taille, empreinte) ; une source absente n’arrête pas les autres', async () => {
        const man = JSON.parse(fs.readFileSync(path.join(site, 'telech-n-manifest.json'), 'utf8'));
        assert.deepStrictEqual(Object.keys(man.packs).sort(), ['autorites', 'inv-communes', 'inv-dep', 'lieux', 'monuments', 'mpf', 'plaques', 'registres']);
        for (const [k, p] of Object.entries(man.packs)) {
            const b = fs.readFileSync(path.join(site, p.name));
            assert.strictEqual(p.size, b.length, k); assert.strictEqual(p.sha256, crypto.createHash('sha256').update(b).digest('hex'), k);
            const d = raw(k); assert.strictEqual(d.kind, `tn-${k}`); assert.ok(d.rows.length > 0 && /^\d{4}-\d\d-\d\d$/.test(d.built), k);
            assert.ok(d.sources.length && d.sources.every(s => /^https:\/\/www\.data\.gouv\.fr\/datasets\//.test(s.url) && /^https:\/\//.test(s.licence_url) && s.licence), k);
        }
        assert.match(raw('plaques').licence, /ODbL/); assert.match(raw('monuments').licence, /CC BY-SA/); assert.match(raw('inv-dep').licence, /Licence Ouverte 2\.0/);
        assert.match(raw('mpf').report['mpf-nancy'], /injoignable/, 'source absente : dite, sans tout arrêter');
        assert.ok(!fs.readdirSync(site).some(f => /hackathon|minutier|naturalis/i.test(f)), 'notaires de Paris et naturalisations : pas de pack (licence non spécifiée)');
    });
    await t('fabrication : registres commune par commune (INSEE retrouvé par le nom, acte, années, en ligne ou non), départements couverts', async () => {
        const R = rows('registres');
        assert.deepStrictEqual(raw('registres').deps, ['04', '22', '65']);
        const f = (ins, a) => R.filter(r => r.insee === ins && r.acte === a).map(r => [r.from, r.to, r.online]);
        assert.deepStrictEqual(f('04070', 'N'), [[1793, 1802, 1]]); assert.deepStrictEqual(f('04070', 'D'), [[1903, 1912, 0]], '« Non » et 0 vue → pas en ligne');
        assert.deepStrictEqual(f('04112', 'BMS'), [[1668, 1792, 1]], 'Manosque : INSEE retrouvé par le nom');
        assert.deepStrictEqual(f('22093', 'BMS'), [[1620, 1792, 1]], 'dates extrêmes « 1620-1792 »'); assert.deepStrictEqual(f('22093', 'TD'), [[1793, 1902, 1]]);
        assert.deepStrictEqual(f('65440', 'EC'), [[1893, 1922, 1]]); assert.deepStrictEqual(f('65286', 'EC'), [[1893, 1922, 0]], 'Lourdes « À venir »');
    });
    await t('fabrication : inventaires (série tirée de la cote), lieux (France seulement, INSEE), autorités (pas de personne sans année de mort), morts pour la France, monuments (cp1252), plaques', async () => {
        assert.deepStrictEqual(rows('inv-communes').map(r => r.insee), ['04070', '22093', '65440']);
        assert.deepStrictEqual(rows('inv-dep').map(r => [r.dep, r.serie]), [['04', '1 Q'], ['04', '2 E'], ['22', '1 R']]);
        assert.deepStrictEqual(rows('lieux').map(r => [r.insee, r.id]), [['04070', 12345678], ['22093', 22334455]], 'Rome et un lieu inconnu écartés');
        const A = rows('autorites'); assert.deepStrictEqual(A.map(r => [r.t, r.mort]), [['f', null], ['i', null], ['p', 1771]], 'Paul DURAND (sans date) et Marie DURAND (née en 1990) écartés');
        const M = rows('mpf'); assert.deepStrictEqual(M.map(r => [r.nom, r.prenoms, r.naissance, r.conflit]), [['DURAND', 'Pierre Marie', '1894', '1914-1918'], ['MAZAUD', 'Henri', '1920-05-12', '1939-1945'], ['MAZAUD', 'Jean Baptiste', '1890-04-12', '1914-1918']]);
        assert.ok(!M.some(r => r.nom === 'LACOMBE'), 'sans aucune date : écarté');
        assert.deepStrictEqual(rows('monuments').map(r => [r.dep, r.insee, r.id]), [['04', '04070', 8716], ['22', '22093', 1234]], 'la Belgique écartée');
        assert.ok(!JSON.stringify(raw('monuments')).match(/MAZAUD|soldat/i), 'aucun nom de soldat copié');
        assert.deepStrictEqual(rows('plaques').map(r => [r.arr, r.lat]), [[11, 48.8541], [6, 48.8532]]);
    });

    /* ═════════ 2. le calcul ═════════ */
    const ev = (tag, year, place, insee, date = '') => ({tag, year, date, place, insee});
    const JB = {ok: true, person: {first: 'Jean Baptiste', last: 'MAZAUD', birth: 1890, death: 1915}, events: [ev('BIRT', 1890, 'Nantes', '44109', '1890-04-12'), ev('DEAT', 1915, 'Souain', '')]};
    const MARIE = {ok: true, person: {first: 'Marie', last: 'DURAND', birth: 1795, death: 1860}, events: [ev('BIRT', 1795, 'Lamballe', '22093'), ev('DEAT', 1860, 'Digne-les-Bains', '04070')]};
    const JEAN = {ok: true, person: {first: 'Jean', last: 'MAZAUD', birth: 1910, death: 1944}, events: [ev('BIRT', 1910, 'Nantes', '44109'), ev('DEAT', 1944, 'Paris', '75056')]};
    const LUC = {ok: true, person: {first: 'Luc', last: 'MAZAUD', birth: 1990, death: null}, events: [ev('BIRT', 1990, 'Nantes', '44109')]};
    await t('calcul : l’acte de telle année est-il en ligne ? (Lamballe 1795 🟢 ; Digne 1860 hors liste ; 1910 décès pas en ligne ; département non couvert : rien)', async () => {
        const R = rows('registres'), deps = raw('registres').deps;
        assert.strictEqual(N.actOf('BIRT', 1780), 'BMS'); assert.strictEqual(N.actOf('BAPM', 1800), 'N'); assert.strictEqual(N.actOf('RESI', 1800), '');
        assert.strictEqual(N.coverage(R, deps, {insee: '22093'}, 'N', 1795).state, 'online');
        assert.strictEqual(N.coverage(R, deps, {insee: '22093'}, 'BMS', 1700).state, 'online');
        assert.strictEqual(N.coverage(R, deps, {insee: '04070'}, 'D', 1860).state, 'out');
        assert.strictEqual(N.coverage(R, deps, {insee: '04070'}, 'D', 1910).state, 'offline');
        assert.strictEqual(N.coverage(R, deps, {insee: '65440'}, 'D', 1900).state, 'online', 'AD 65 : état civil (toutes sortes) 1893-1922');
        assert.strictEqual(N.coverage(R, deps, {name: 'Manosque', dep: '04'}, 'BMS', 1700).state, 'online', 'par le nom');
        assert.strictEqual(N.coverage(R, deps, {insee: '04001'}, 'N', 1800).state, 'absent');
        assert.strictEqual(N.coverage(R, deps, {insee: '44109'}, 'N', 1890), null, 'Loire-Atlantique : pas de liste → rien');
    });
    await t('calcul : 🎖 morts pour la France (même naissance = probable ; autre génération écartée), 🕯 plaques (Paris ou mort en 1939-1946), 👪 familles ; liens sûrs', async () => {
        const M = rows('mpf');
        const h = N.mpfFor(M, JB); assert.strictEqual(h.length, 1); assert.ok(h[0].probable); assert.strictEqual(h[0].r.prenoms, 'Jean Baptiste');
        assert.deepStrictEqual(N.mpfFor(M, LUC), []); assert.deepStrictEqual(N.mpfFor(M, {...JB, person: {...JB.person, birth: 1850, death: 1900}}), [], 'autre génération');
        const P = rows('plaques'); assert.strictEqual(N.plaquesFor(P, JEAN).length, 1); assert.deepStrictEqual(N.plaquesFor(P, {...JEAN, person: {...JEAN.person, death: 1980}, events: [ev('BIRT', 1910, 'Nantes', '44109')]}), []);
        const A = rows('autorites'); const a = N.autoritesFor(A, JEAN); assert.deepStrictEqual(a.fam.map(r => r.label), ['Mazaud (famille)']);
        assert.ok(N.past(MARIE) && !N.past(LUC));
        assert.strictEqual(N.safeUrl('javascript:alert(1)'), ''); assert.strictEqual(N.faLocation('1 2'), ''); assert.strictEqual(N.mgwUrl('8716'), 'https://www.memorialgenweb.org/memorial3/html/fr/resultcommune.php?idsource=8716');
        assert.match(N.faSearch('Archives & "x"'), /^https:\/\/francearchives\.gouv\.fr\/fr\/search\?q=Archives%20%26%20%22x%22$/);
    });

    /* ═════════ 3. serveur et écran ═════════ */
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1', LCNDA_TEST_TN_DIR: site};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean Baptiste','MAZAUD','male','deceased',1),(2,'Marie','DURAND','female','deceased',0),(3,'Jean','MAZAUD','male','deceased',0),(4,'Luc','MAZAUD','male','living',0)");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code) VALUES(1,'Nantes','Loire-Atlantique','France',47.2379,-1.5603,'44109'),(2,'Lamballe','Côtes-d''Armor','France',48.4623,-2.509,'22093'),(3,'Digne-les-Bains','Alpes-de-Haute-Provence','France',44.104,6.2493,'04070'),(4,'Paris','Paris','France',48.8588,2.3457,'75056')");
$t = function ($tag) use ($pdo) { $i = (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn(); return $i ?: (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='BIRT' LIMIT 1")->fetchColumn(); };
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)");
foreach ([[1,'BIRT','12 avril 1890',1890,'1890-04-12',1],[1,'DEAT','1915',1915,'1915',null],[2,'BIRT','1795',1795,'1795',2],[2,'DEAT','1860',1860,'1860',3],
          [3,'BIRT','1910',1910,'1910',1],[3,'DEAT','1944',1944,'1944',4],[4,'BIRT','1990',1990,'1990',1]] as [$p,$g,$dt,$y,$sd,$pl]) { $ins->execute([$p,$t($g),$dt,$y,$sd,$pl]); }
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [], outside = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
        await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => { outside.push(r.request().url()); return r.abort(); });
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        p.on('console', m => { if (m.type() === 'error' && /Failed to fetch|tn-|tn_|lot-n/i.test(m.text())) errs.push(m.text()); });
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultPersonBlocks && window.LCNDA_EXT?.lotN, null, {timeout: 30000});
        const into = (fn, arg, opts = {}) => p.evaluate(async ([f, a, o]) => { const h = document.createElement('div'); document.body.appendChild(h); const n = await window.LCNDA_EXT.lotN[f](h, a, {detached: true, ...o}); const r = [n, h.innerHTML, h.textContent]; h.remove(); return r; }, [fn, arg, opts]);
        const api = (a, q = {}) => p.evaluate(([x, y]) => window.LCNDA_APP.api(x, y).catch(e => ({error: e.message})), [a, q]);
        const post = (a, b = {}) => p.evaluate(([x, y]) => window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}).catch(e => ({error: e.message})), [a, b]);
        const LAMBALLE = {id: 2, name: 'Lamballe', insee: '22093', lat: 48.4623, lon: -2.509};

        await t('rien d’installé : la fiche d’une personne est vide ; le village n’a que des liens (FranceArchives, MémorialGenWeb) et une offre discrète ⤓', async () => {
            const info = await api('tn_dl_info'); assert.strictEqual(Object.keys(info.packs).length, 8, JSON.stringify(info));
            assert.deepStrictEqual(Object.keys((await api('tn_status')).packs), []);
            const [n] = await into('personInto', 1); assert.strictEqual(n, 0);
            const [nv, html, txt] = await into('placeInto', LAMBALLE);
            assert.strictEqual(nv, 2, txt); assert.match(html, /francearchives\.gouv\.fr\/fr\/search\?q=Lamballe/); assert.match(html, /memorialgenweb\.org/);
            assert.match(html, /data-tn-install="[a-z,-]*registres/); assert.match(txt, /Installer \(/);
            assert.strictEqual((await api('tn_file', {key: 'plaques'})).error ? 1 : 0, 1, 'tn_file : pas installé → erreur');
        });
        await t('⤓ une empreinte fausse est refusée (rien d’installé) ; ⤓ tout installer, ↶ défait, 🗂 Données connaît la famille « tn »', async () => {
            const mf = path.join(site, 'telech-n-manifest.json'), good = fs.readFileSync(mf, 'utf8'), bad = JSON.parse(good);
            bad.packs.plaques.sha256 = '0'.repeat(64); fs.writeFileSync(mf, JSON.stringify(bad));
            const s = await post('tn_dl_start', {key: 'plaques'}); let r; do { r = await post('tn_dl_step', {id: s.id}); } while (!r.done && !r.error);
            const f = await post('tn_dl_finish', {id: s.id}); assert.match(f.error || '', /empreinte/); fs.writeFileSync(mf, good);
            assert.deepStrictEqual(Object.keys((await api('tn_status')).packs), []);
            assert.match((await post('tn_dl_start', {key: '../x'})).error || '', /Pack inconnu/);
            const ok = await p.evaluate(() => window.LCNDA_EXT.lotN.install(Object.keys(window.LCNDA_EXT.lotN.PACKS)));
            assert.strictEqual(ok, true);
            const st = await api('tn_status'); assert.strictEqual(Object.keys(st.packs).length, 8); assert.strictEqual(st.packs.registres.rows, 10);
            assert.ok(await p.evaluate(() => window.LCNDA_EXT.listesMaj.families.some(f => f.id === 'tn' && f.items.length === 8)), '🗂 Données : la famille tn');
            assert.strictEqual((await post('tn_pack_undo', {key: 'plaques'})).removed, true);
            assert.ok(!(await api('tn_status')).packs.plaques);
            await p.evaluate(() => window.LCNDA_EXT.lotN.install(['plaques'], {quiet: true}));
            assert.ok((await api('tn_status')).packs.plaques);
        });
        await t('fiche de Jean Baptiste MAZAUD : 🎖 mort pour la France (même naissance, Loire-Atlantique) ; ↗ source ; liens sûrs', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('[data-tn-person="1"] .tn-row', {timeout: 30000});
            const txt = await p.textContent('[data-tn-person="1"]'), html = await p.innerHTML('[data-tn-person="1"]');
            assert.match(txt, /Mort pour la France/); assert.match(txt, /même naissance/); assert.match(txt, /Département de Loire-Atlantique/); assert.match(txt, /65e régiment/);
            assert.match(html, /target="_blank" rel="noopener noreferrer"/); assert.ok(!/href="(?!https?:)/.test(html), 'seulement des liens http(s)');
            assert.ok(!(await p.$eval('[data-tn-person="1"]', h => h.closest('section.card').hidden)));
        });
        await t('Marie DURAND : 🏛 sa naissance de 1795 à Lamballe est en ligne, son décès de 1860 à Digne pas dans la liste ; Jean MAZAUD : 🕯 plaque, 👪 famille', async () => {
            const [n, , txt] = await into('personInto', 2); assert.ok(n >= 1, txt);
            assert.match(txt, /Naissance 1795.*registre en ligne aux Archives départementales \(1793–1902\)/); assert.match(txt, /Décès 1860.*n’est pas dans la liste/);
            assert.match(txt, /archives communales de Lamballe/);
            const [, , j] = await into('personInto', 3); assert.match(j, /Ici vivait Jean MAZAUD/); assert.match(j, /Mazaud \(famille\)/); assert.ok(!/Henri/.test(j), 'Henri MAZAUD n’est pas lui');
        });
        await t('Luc MAZAUD (vivant), une fiche confidentielle : rien ; « Où chercher » reçoit ses lignes', async () => {
            const [nl, , luc] = await into('personInto', 4); assert.strictEqual(nl, 0, luc);
            const [np] = await into('personInto', 1, {private: true}); assert.strictEqual(np, 0);
            const body = await p.evaluate(async () => { const b = document.createElement('div'); document.body.appendChild(b); window.LCNDA_EXT.ouChercher.afterRedraw.forEach(fn => { try { fn({pid: 1}, b); } catch (_) {} }); for (let i = 0; i < 50 && !b.querySelector('.tn-ouc'); i++) await new Promise(r => setTimeout(r, 100)); const t = b.querySelector('.tn-ouc')?.textContent || ''; b.remove(); return t; });
            assert.match(body, /Archives et mémoire/); assert.match(body, /Mort pour la France/);
        });
        await t('village de Lamballe : la page FranceArchives exacte, registres paroissiaux en ligne, inventaire communal, monument MémorialGenWeb ; Digne : séries des AD', async () => {
            const [n, html, txt] = await into('placeInto', LAMBALLE);
            assert.ok(n >= 4, txt); assert.match(html, /francearchives\.gouv\.fr\/fr\/location\/22334455/); assert.match(txt, /registres paroissiaux · 🟢 en ligne : 1620–1792/);
            assert.match(txt, /Archives anciennes de Lamballe/); assert.match(html, /idsource=1234/); assert.ok(!/data-tn-install/.test(html), 'tout est installé : plus d’offre');
            const [, , d] = await into('placeInto', {id: 3, name: 'Digne-les-Bains', insee: '04070'}); assert.match(d, /Biens nationaux du district de Digne/); assert.match(d, /1 Q/); assert.match(d, /décès · ⏳ pas en ligne : 1903–1912/);
            const mono = await p.evaluate(async () => { const s = window.LCNDA_EXT.monographSections.find(x => x.id === 'tn_monument'); const h = document.createElement('div'); const ok = await s.render({name: 'Lamballe', insee: '22093'}, h); return [ok, h.innerHTML]; });
            assert.ok(mono[0]); assert.match(mono[1], /idsource=1234/);
        });
        await t('listes (thèmes 🔎 personnes, ⚔️ guerres), carte des plaques, Réglages (⚙️ Personnaliser : un sujet caché, ↶) ; 🗑 retirer (↶)', async () => {
            const reg = await p.evaluate(async () => { const E = window.LCNDA_EXT; const L = E.dataLists.filter(d => /^tn_/.test(d.id));
                const mpf = await L.find(d => d.id === 'tn_mpf').load(); const lay = await E.mapLayerSources.find(s => s.id === 'tn_plaques').run({});
                return {ids: L.map(d => [d.id, d.theme]), mpf: mpf.map(r => r.name), feats: lay.features.length, block: window.LCNDA_APP.defaultPersonBlocks.some(b => b[0] === 'lot_n'), tab: window.LCNDA_APP.defaultMaintenanceTabs.some(t => t[0] === 'lot_n')}; });
            assert.deepStrictEqual(reg.ids, [['tn_registres', 'personnes'], ['tn_inv_communes', 'personnes'], ['tn_inv_dep', 'personnes'], ['tn_lieux', 'personnes'], ['tn_autorites', 'personnes'], ['tn_mpf', 'guerres'], ['tn_monuments', 'guerres'], ['tn_plaques', 'guerres']]);
            assert.strictEqual(reg.mpf.length, 3); assert.strictEqual(reg.feats, 2); assert.ok(reg.block && reg.tab);
            await p.evaluate(() => window.LCNDA_EXT.lotN.openSettings());
            await p.waitForSelector('[data-tn-settings-page]', {timeout: 20000});
            const page = await p.textContent('[data-tn-settings-page]'); assert.match(page, /Minutier central/); assert.match(page, /non spécifiée/); assert.match(page, /installé/);
            assert.ok(await p.$eval('[data-tn-settings-page] details.tn-perso', d => !d.open), '⚙️ Personnaliser : replié');
            await p.click('[data-tn-settings-page] details.tn-perso summary');
            await p.click('[data-tn-tg="mpf"] input');
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-lot-n')).mpf), false);
            const [, , off] = await into('personInto', 1); assert.ok(!/Mort pour la France/.test(off));
            await p.click('.toast button, [data-undo]').catch(() => {});
            await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('genealogie-lot-n')); s.mpf = true; localStorage.setItem('genealogie-lot-n', JSON.stringify(s)); });
            await p.evaluate(() => window.LCNDA_EXT.lotN.remove('monuments'));
            assert.ok(!(await api('tn_status')).packs.monuments); assert.deepStrictEqual((await api('tn_status')).removed, ['monuments']);
            assert.ok((await post('tn_pack_restore', {key: 'monuments'})).ok); assert.ok((await api('tn_status')).packs.monuments);
            const set = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8'); assert.match(set, /'genealogie-lot-n'/, 'SITE_DEFAULT_KEYS');
        });
        await t('390 px et thème sombre : le bloc tient dans l’écran ; rien n’est parti sur Internet ; aucune erreur JavaScript', async () => {
            await p.setViewportSize({width: 390, height: 800}); await p.emulateMedia({colorScheme: 'dark'});
            await p.evaluate(() => window.LCNDA_APP.openPersonById(2));
            await p.waitForSelector('[data-tn-person="2"] .tn-row', {timeout: 30000, state: 'attached'});
            assert.ok(!(await p.$eval('[data-tn-person="2"]', h => h.closest('section.card').hidden)), 'le bloc est montré');
            const w = await p.evaluate(() => document.documentElement.scrollWidth); assert.ok(w <= 392, `largeur ${w}`);
            assert.deepStrictEqual(outside.filter(u => /francearchives|memorialgenweb|data\.gouv|github|opendata|MAZAUD|DURAND|Lamballe|Digne|Nantes/i.test(decodeURIComponent(u))), [], 'ni nom ni lieu, ni les sites des archives (les images et fonds de carte des autres blocs ne sont pas d’ici)'); assert.deepStrictEqual(errs, []);
        });
    } finally {
        await browser.close(); proc.kill();
        fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `\n${fails} essai(s) raté(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
