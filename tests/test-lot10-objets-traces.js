#!/usr/bin/env node
/* 🔔 Objets et traces (lot 10) — assets/js/heritage-lot10-objets-traces.js, lib/lot10_objets_traces.php, assets/css/lot10-objets-traces.css,
 * assets/data/l10o-*.json.gz (scripts/lot10-objets-traces/*.py).
 *  1. Node : les fichiers livrés (licences, sources, tailles) et le calcul (contes près de chez elle, conteur du même nom, pèlerinages
 *     de sa région sans sanctuaire fondé après sa mort, couvents à ses 20 ans, hospices l'année de sa mort, plantes de son vivant).
 *  2. Serveur et écran (php -S + Playwright, base temporaire) : rien ne part sur Internet (GENEALOGY_TEST=1 + LCNDA_TEST_L10O_DIR).
 *     Réponses VRAIES enregistrées le 2026-11-25 (tests/fixtures/lot10-objets-traces) : POP notice Palissy PM33000520 (cloche de
 *     Générac), POP Joconde « Laguiole », GBIF (herbiers, Allanche 1850–1900, réduites aux champs lus). Écrites ICI au format de
 *     l'API, marquées « essai » : deux notices de cloches d'Allanche avec des noms, trois objets Joconde d'Allanche, la réponse
 *     Overpass (overpass-api.de n'était pas joignable pendant la fabrication). Les packs « Patrimoine » 15 et 33 : petits, d'essai.
 *  Fiches : Jean MAZAUD (1850 Allanche – 1910 Tulle), Marie LACOMBE (1840 Plouaret – 1900 Lannion), Paul DURAND (sans dates),
 *  Luc MAZAUD (vivant, Allanche : rien ne part sur Internet pour lui).
 *   node tests/test-lot10-objets-traces.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const zlib = require('zlib');
const {spawn, spawnSync} = require('child_process');
let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
const root = path.join(__dirname, '..');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
const H = require('../assets/js/heritage-lot10-objets-traces.js');
const FIX = path.join(__dirname, 'fixtures', 'lot10-objets-traces');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const raw = n => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'assets/data', `${n}.json.gz`))).toString('utf8'));
const inst = () => H.table(raw('ha-institutions')).map(r => ({...r, kinds: String(r.kinds || '').split(',').filter(Boolean)}));
const PLOUARET = {id: 2, name: 'Plouaret', lat: 48.615, lon: -3.483}, LANNION = {id: 3, name: 'Lannion', lat: 48.7326, lon: -3.4566};
const ALLANCHE = {id: 1, name: 'Allanche', lat: 45.2294, lon: 2.9337}, TULLE = {id: 4, name: 'Tulle', lat: 45.267, lon: 1.77};
const ev = (tag, year, p) => ({tag, year, place_id: p.id, lat: p.lat, lon: p.lon, place: p.name});
const MARIE = {ok: true, person: {id: 2, first: 'Marie', last: 'LACOMBE', gender: 'female', birth: 1840, death: 1900}, places: [PLOUARET, LANNION], events: [ev('BIRT', 1840, PLOUARET), ev('DEAT', 1900, LANNION)], jobs: []};
const JEAN = {ok: true, person: {id: 1, first: 'Jean', last: 'MAZAUD', gender: 'male', birth: 1850, death: 1910}, places: [ALLANCHE, TULLE], events: [ev('BIRT', 1850, ALLANCHE), ev('DEAT', 1910, TULLE)], jobs: []};

(async () => {
    /* ═════════ 1. les fichiers et le calcul ═════════ */
    await t('fichiers livrés : présents, petits (< 15 Mo), chacun avec source, adresse, licence et date', async () => {
        let tot = 0;
        for (const n of ['l10o-folklore', 'l10o-pelerinages']) { const st = fs.statSync(path.join(root, 'assets/data', `${n}.json.gz`)); tot += st.size; const d = raw(n); assert.ok(d.source && /^https:\/\//.test(d.url) && d.licence && d.built && /^https:\/\//.test(d.licence_url), n); }
        assert.ok(tot < 200e3, `${tot} octets`); console.log(`  (en tout ${Math.round(tot / 1024)} Ko)`);
    });
    await t('🎻 contes : chaque texte a son lien Wikisource ; un lieu seulement avec la phrase du texte qui le dit ; folkloristes morts avant 1931', async () => {
        const F = raw('l10o-folklore'), R = H.table(F);
        assert.ok(R.length > 300 && R.every(r => /^https:\/\/fr\.wikisource\.org\/wiki\//.test(r.url)));
        const placed = R.filter(r => r.insee); assert.ok(placed.length > 100);
        assert.ok(placed.every(r => r.q && /^(Cont|Dit|Dict|Chant|Recueilli|Narr|Racont|Entendu|Communiqu)/.test(r.q) && r.lat !== null), 'la phrase « Conté par …, de … »');
        assert.ok(F.works.every(w => w.died <= 1930 && /^https:\/\/fr\.wikisource\.org\/wiki\//.test(w.url) && w.deps.length));
        const ws = F.works.map(w => w.who); ['François-Marie Luzel', 'Paul Sébillot', 'Jean-François Bladé'].forEach(w => assert.ok(ws.includes(w), w));
    });
    await t('🎻 Marie LACOMBE (née à Plouaret en 1840) : contes recueillis à Plouaret de son vivant ; un conteur Guézennec tout près', async () => {
        const R = H.table(raw('l10o-folklore'));
        const near = H.talesNear(R, H.homePlaces(MARIE), H.lifeSpan(MARIE), 15);
        assert.ok(near.length >= 5 && near[0].r.p === 'Plouaret' && near[0].r.y >= 1840 && near[0].r.y <= 1900, JSON.stringify(near[0]));
        assert.ok(H.tellersNamed(R, 'Guézennec', H.homePlaces(MARIE)).some(x => /Guézennec, de Plouaret/.test(x.r.q)));
        assert.deepStrictEqual(H.tellersNamed(R, 'Zz', H.homePlaces(MARIE)), [], 'nom trop court : rien');
        assert.deepStrictEqual(H.talesNear(R, [ALLANCHE], H.lifeSpan(JEAN), 15), [], 'Cantal : aucun conte placé');
    });
    await t('🕯️ pèlerinages : Wikidata (Q…), pas de sanctuaire de l’Antiquité ; Lourdes (1858) écarté pour une femme morte en 1850', async () => {
        const P = H.table(raw('l10o-pelerinages'));
        assert.ok(P.length > 150 && P.every(r => /^Q\d+$/.test(r.q) && r.lat && r.lon && ['pelerinage', 'pardon', 'marial', 'sanctuaire', 'basilique'].includes(r.kind)));
        assert.ok(!P.some(r => /gallo-romain/i.test(r.n)));
        const lourdes = P.find(r => /^sanctuaire de Lourdes/.test(r.n)); assert.ok(lourdes && lourdes.from === 1858);
        const near = {lat: 43.1, lon: -0.05};
        assert.ok(!H.pilgrimagesNear(P, [near], {from: 1790, to: 1850}, 10).some(x => x.r === lourdes));
        assert.ok(H.pilgrimagesNear(P, [near], {from: 1850, to: 1920}, 10).some(x => x.r === lourdes));
        const m = H.pilgrimagesNear(P, H.homePlaces(MARIE), H.lifeSpan(MARIE), 50); assert.ok(m.length && m[0].km <= 50 && ['pelerinage', 'pardon', 'marial'].includes(m[0].r.kind));
    });
    await t('⛪ couvents (ha-institutions de « Histoire autour ») : pour Marie à ses 20 ans ; pas pour un homme sans vie religieuse', async () => {
        const I = inst();
        const c = H.conventsFor(I, MARIE); assert.ok(c && c.year === 1860 && c.list.length && c.list.every(x => x.km <= 15 && x.i.kinds.includes('couvent')));
        assert.strictEqual(H.conventsFor(I, JEAN), null);
        assert.ok(H.conventsFor(I, {...JEAN, jobs: [{text: 'frère des écoles chrétiennes'}], places: [LANNION], events: [ev('BIRT', 1850, LANNION)]}), 'un frère : oui');
    });
    await t('🏥 hospices : Jean MAZAUD mort à Tulle en 1910 → l’hôpital de Tulle (fondé en 1674) ; un établissement moderne sans date écarté', async () => {
        const I = inst();
        const h = H.hospicesFor(I, JEAN); assert.ok(h && h.list[0].i.from <= 1910 && h.list[0].i.commune === 'Tulle', JSON.stringify(h?.list?.[0]));
        assert.strictEqual(H.hospicesFor(I, {...JEAN, events: [ev('BIRT', 1850, ALLANCHE)]}), null, 'sans décès : rien');
        const fake = [{q: 'Q1', n: 'Centre hospitalier de Nulle-Part', kinds: ['hopital'], from: null, to: null, lat: 45.267, lon: 1.77}];
        assert.strictEqual(H.hospicesFor(fake, JEAN), null);
    });
    await t('🌿 herbiers : seulement les spécimens de son vivant', async () => {
        const it = [{year: 1845}, {year: 1862}, {year: 1915}, {year: null}];
        assert.deepStrictEqual(H.herbsInLife(it, H.lifeSpan(JEAN)).map(x => x.year), [1862]);
        assert.deepStrictEqual(H.herbsInLife(it, {from: null}), []);
    });

    /* ═════════ 2. serveur et écran ═════════ */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-l10o-')), net0 = path.join(tmp, 'net');
    fs.mkdirSync(path.join(tmp, 'media')); fs.mkdirSync(net0);
    const calls = () => { try { return fs.readFileSync(path.join(net0, 'calls.log'), 'utf8').trim().split('\n').filter(Boolean); } catch (_) { return []; } };
    for (const f of ['pop-PM33000520.json', 'gbif-q.json', 'gbif-geo.json']) fs.copyFileSync(path.join(FIX, f), path.join(net0, f));
    // POP : deux cloches d'Allanche (notices d'essai, au format de api.pop.culture.gouv.fr/notices/palissy/<REF>)
    const bell = (REF, PINS, DATE) => ({REF, TICO: 'cloche', DENO: ['cloche'], COM: ['Allanche'], INSEE: ['15001'], EDIF: 'église Saint-Jean-Baptiste', INSC: ['inscription', 'date'], PINS, HIST: '', PERS: [], DATE: [DATE], SCLE: ['19e siècle'], DPRO: 'essai', AUTR: []});
    fs.writeFileSync(path.join(net0, 'pop-PM15999001.json'), JSON.stringify(bell('PM15999001', 'Essai. Parrain : Jean MAZAUD, maire d’Allanche ; marraine : Anne BRUN. 1880.', '1880')));
    fs.writeFileSync(path.join(net0, 'pop-PM15999002.json'), JSON.stringify(bell('PM15999002', 'Essai. Fondue en 1702 sous le curé Pierre DURAND.', '1702')));
    // Joconde : la vraie réponse « Laguiole » (cartes postales : écartées) + trois objets d'essai d'Allanche
    const jo = JSON.parse(fs.readFileSync(path.join(FIX, 'joconde-laguiole.json'), 'utf8'));
    jo.hits.push({_source: {REF: 'ESSAI00001', DOMN: ['ethnologie', 'agriculture - élevage'], DENO: ['faux'], TICO: 'faux à foin (essai)', LIEUX: ['Cantal', "Allanche (lieu d'utilisation)"], MILL: ['1880'], LOCA: 'Aurillac ; musée d’essai', COPY: '© musée d’essai, tous droits réservés', IMG: 'essai/a.jpg'}},
        {_source: {REF: 'ESSAI00002', DOMN: ['ethnologie', 'costume - accessoires du costume'], DENO: ['coiffe'], TICO: 'coiffe (essai)', LIEUX: ["Allanche (lieu de collecte)"], LOCA: 'Marseille ; musée d’essai', COPY: 'Licence Ouverte (essai)', IMG: 'essai/b.jpg'}},
        {_source: {REF: 'ESSAI00003', DOMN: ['photographie', 'ethnologie'], DENO: ['carte postale'], TICO: 'ALLANCHE - LA PLACE (essai)', LIEUX: ['Allanche'], COPY: '©'}},
        {_source: {REF: 'ESSAI00004', DOMN: ['ethnologie'], DENO: ['sabot'], TICO: 'sabot (essai)', LIEUX: ['Aurillac'], LOCA: 'Allanche ; maison d’essai', COPY: '©'}});
    fs.writeFileSync(path.join(net0, 'joconde.json'), JSON.stringify(jo));
    // Overpass (format de l'API, éléments d'essai)
    fs.writeFileSync(path.join(net0, 'overpass.json'), JSON.stringify({version: 0.6, elements: [
        {type: 'node', id: 9000000001, lat: 45.2291, lon: 2.9331, tags: {historic: 'memorial', memorial: 'plaque', name: 'Plaque Jean Mazaud (essai)', inscription: 'Ici est né Jean MAZAUD, maire de 1870 à 1890 (essai)', start_date: '1925'}},
        {type: 'node', id: 9000000002, lat: 45.2299, lon: 2.9340, tags: {historic: 'memorial', memorial: 'stele', name: 'Stèle des résistants (essai)', inscription: 'À la mémoire de … (essai)'}},
        {type: 'way', id: 9000000003, center: {lat: 45.23, lon: 2.934}, tags: {historic: 'memorial', memorial: 'war_memorial', name: 'Monument aux morts (essai)'}}]}));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1', LCNDA_TEST_L10O_DIR: net0};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','MAZAUD','male','deceased',1),(2,'Marie','LACOMBE','female','deceased',0),(3,'Paul','DURAND','male','deceased',0),(4,'Luc','MAZAUD','male','living',0)");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code) VALUES(1,'Allanche','Cantal','France',45.2294,2.9337,'15001'),(2,'Plouaret','Côtes-d''Armor','France',48.615,-3.483,'22207'),(3,'Lannion','Côtes-d''Armor','France',48.7326,-3.4566,'22113'),(4,'Tulle','Corrèze','France',45.267,1.77,'19272'),(5,'Générac','Gironde','France',45.18,-0.55,'33184')");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)");
$ins->execute([1,$t('BIRT'),'1850',1850,'1850',1]); $ins->execute([1,$t('DEAT'),'1910',1910,'1910',4]);
$ins->execute([2,$t('BIRT'),'1840',1840,'1840',2]); $ins->execute([2,$t('DEAT'),'1900',1900,'1900',3]);
$ins->execute([4,$t('BIRT'),'1990',1990,'1990',1]);
@mkdir(SHARED_DATA_DIR.'/lieux-patrimoine', 0775, true);
foreach (['15' => [['PM15999001','15001','Allanche','1880'],['PM15999002','15001','Allanche','1702'],['PM15000037','15001','Allanche','17e s.']], '33' => [['PM33000520','33184','Générac','1519']]] as $dep => $rows) {
  $k = new PDO('sqlite:'.SHARED_DATA_DIR."/lieux-patrimoine/patrimoine-$dep.sqlite");
  $k->exec("CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT); CREATE TABLE objets(ref TEXT PRIMARY KEY, base TEXT, nom TEXT, cle TEXT, deno TEXT, insee TEXT, commune TEXT, siecle TEXT, dates TEXT, protection TEXT, resume TEXT, edifice TEXT, vocable TEXT, lat REAL, lon REAL); INSERT INTO meta VALUES('fixture','1'),('count','3');");
  foreach ($rows as [$ref, $insee, $com, $d]) { $deno = $ref === 'PM15000037' ? 'autel, retable' : 'cloche'; $k->prepare("INSERT INTO objets VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL)")->execute([$ref,'palissy',$deno,$deno,$deno,$insee,$com,'',$d,'essai','','église','']); }
}
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
        await ctx.route(/^https:\/\//, r => r.abort()); // pas d'Internet dans l'essai
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultPersonBlocks, null, {timeout: 30000});
        // index.php ne charge pas encore heritage-lot10-objets-traces.js : on l'ajoute (comme le feront les balises)
        if (!(await p.evaluate(() => !!window.LCNDA_EXT?.objetsTraces))) { await p.addStyleTag({url: base + 'assets/css/lot10-objets-traces.css'}); await p.addScriptTag({url: base + 'assets/js/heritage-lot10-objets-traces.js'}); }
        await p.waitForFunction(() => !!window.LCNDA_EXT?.objetsTraces);
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const into = (fn, arg, opts = {}) => p.evaluate(async ([f, a, o]) => { const h = document.createElement('div'); document.body.appendChild(h); const n = await window.LCNDA_EXT.objetsTraces[f](h, a, {detached: true, ...o}); const r = [n, h.innerHTML, h.textContent]; h.remove(); return r; }, [fn, arg, opts]);

        await t('serveur 🔔 : cloches du pack + inscriptions relues sur POP (vraie notice de Générac) ; les noms de la base trouvés ici', async () => {
            const g = await api('l10o_cloches', {id: 5});
            assert.strictEqual(g.ok, true, JSON.stringify(g)); assert.strictEqual(g.installed, true);
            assert.strictEqual(g.bells.length, 1); assert.strictEqual(g.bells[0].pins, 'Date : 1519.'); assert.match(g.bells[0].url, /^https:\/\/pop\.culture\.gouv\.fr\/notice\/palissy\/PM33000520$/);
            assert.match(calls().at(-1), /api\.pop\.culture\.gouv\.fr\/notices\/palissy\/PM33000520/);
            const a = await api('l10o_cloches', {id: 1});
            assert.strictEqual(a.bells.length, 2, 'l’autel n’est pas une cloche');
            const b1 = a.bells.find(b => b.ref === 'PM15999001');
            assert.deepStrictEqual(b1.names.map(n => [n.last, n.first, n.full, n.era]), [['MAZAUD', 'Jean', true, true], ['MAZAUD', 'Luc', false, false]]);
            assert.ok(!calls().some(c => /MAZAUD|LACOMBE|DURAND/i.test(c)), 'aucun nom de personne ne part sur Internet');
            const n0 = calls().length; const again = await api('l10o_cloches', {id: 1}); assert.strictEqual(calls().length, n0, 'gardé'); assert.strictEqual(again.bells.length, 2);
        });
        await t('serveur 🧺 : objets de Joconde nommés comme « lieu d’utilisation / de collecte » ; pas les cartes postales ni un musée de la commune', async () => {
            const r = await api('l10o_musee', {id: 1});
            assert.strictEqual(r.ok, true, JSON.stringify(r)); assert.deepStrictEqual(r.items.map(x => x.ref), ['ESSAI00001', 'ESSAI00002']);
            const [faux, coiffe] = r.items;
            assert.strictEqual(faux.free, false); assert.strictEqual(faux.thumb, '', 'tous droits réservés : pas d’image'); assert.strictEqual(faux.role, "lieu d'utilisation");
            assert.strictEqual(coiffe.free, true); assert.match(coiffe.thumb, /^https:\/\/iiif\.prd\.cloud\.culture\.fr\//);
            assert.ok(r.items.every(x => /^https:\/\/pop\.culture\.gouv\.fr\/notice\/joconde\//.test(x.url)));
            assert.match(calls().at(-1), /search\/simple\?bases%5B%5D=joconde&text=%22Allanche%22/);
        });
        await t('serveur 🌿 : GBIF (vraie réponse) → spécimens CC0 / CC BY, la licence de chaque jeu ; 🪧 Overpass → plaques et stèles, pas le monument aux morts', async () => {
            const h = await api('l10o_herbier', {id: 1, from: 1850, to: 1900});
            assert.strictEqual(h.ok, true, JSON.stringify(h)); assert.ok(h.items.length >= 3);
            assert.ok(h.items.every(x => ['CC0 1.0', 'CC BY 4.0'].includes(x.lic) && /^https:\/\/www\.gbif\.org\/occurrence\/\d+$/.test(x.url)));
            assert.ok(h.items.some(x => /Allanche/.test(x.where)));
            assert.ok(calls().filter(c => /api\.gbif\.org/.test(c)).every(c => /license=CC0_1_0&license=CC_BY_4_0/.test(c) && /basisOfRecord=PRESERVED_SPECIMEN/.test(c)));
            const o = await api('l10o_plaques', {id: 1});
            assert.strictEqual(o.ok, true, JSON.stringify(o)); assert.deepStrictEqual(o.items.map(x => x.kind), ['plaque', 'stele']);
            assert.match(o.items[0].url, /^https:\/\/www\.openstreetmap\.org\/node\/9000000001$/); assert.ok(o.items[0].names.some(n => n.id === 1 && n.full));
            assert.match(decodeURIComponent(calls().at(-1)), /ref:INSEE"="15001"/);
        });
        await t('serveur : fiche vivante → rien ne part ; hors ligne sans réponse gardée → un message, pas d’erreur', async () => {
            const n0 = calls().length;
            const r = await api('l10o_plaques', {id: 1, pid: 4}); assert.strictEqual(r.ok, false); assert.strictEqual(r.private, true); assert.strictEqual(calls().length, n0);
            const off = await api('l10o_musee', {id: 3}); // Lannion : la réponse de l'essai ne la nomme pas → liste vide, pas d'erreur
            assert.strictEqual(off.ok, true); assert.deepStrictEqual(off.items, []);
            fs.renameSync(path.join(net0, 'overpass.json'), path.join(net0, 'overpass.off'));
            const r2 = await api('l10o_plaques', {id: 4}); fs.renameSync(path.join(net0, 'overpass.off'), path.join(net0, 'overpass.json'));
            assert.strictEqual(r2.ok, false); assert.strictEqual(r2.offline, true); assert.match(r2.message, /connexion/);
        });

        await t('fiche de Jean MAZAUD : 🔔 son nom sur la cloche de 1880, 🪧 la plaque, 🌿 un botaniste de son vivant, 🏥 Tulle ; ↗ source partout', async () => {
            await p.evaluate(() => { window.LCNDA_SHEET_LAZY_OFF = true; /* ce bloc essayé en entier (le chargement à mesure : test-fiche-lazy.js) */ const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('[data-l10o-person="1"] .l10o-row', {timeout: 30000});
            await p.waitForFunction(() => /botaniste/.test(document.querySelector('[data-l10o-person="1"]')?.textContent || ''), null, {timeout: 20000});
            const txt = await p.textContent('[data-l10o-person="1"]');
            assert.match(txt, /Son nom est peut-être gravé sur la cloche de 1880 de église Saint-Jean-Baptiste|Son nom est peut-être gravé sur la cloche de 1880/);
            assert.match(txt, /Son nom est peut-être sur une plaque à Allanche/);
            assert.match(txt, /Un botaniste est passé à Allanche en 18\d\d/);
            assert.match(txt, /En 1910, près de Tulle, il y avait/); assert.match(txt, /▸ plus/);
            assert.ok(!/Un conte recueilli/.test(txt), 'Cantal : pas de conte placé');
            const a = await p.$$eval('[data-l10o-person="1"] a', l => l.map(x => [x.href, x.target, x.rel]));
            assert.ok(a.length && a.every(([h, tg, rel]) => /^https:\/\//.test(h) && tg === '_blank' && /noopener/.test(rel)));
            assert.ok((await p.$$eval('[data-l10o-person="1"] .l10o-row', l => l.map(r => !!r.querySelector('.hist-src')))).every(Boolean), 'une ligne Source sous chaque sujet');
            assert.strictEqual(await p.evaluate(() => document.querySelector('[data-l10o-person="1"]').closest('section.card').hidden), false);
        });
        await t('Marie LACOMBE : 🎻 conte de Plouaret, ⛪ couvents de Lannion à ses 20 ans, 🕯️ pèlerinages ; Paul DURAND : bloc caché', async () => {
            const [n, , txt] = await into('personInto', 2);
            assert.ok(n >= 3, txt); assert.match(txt, /Un conte recueilli à Plouaret/); assert.match(txt, /quand elle avait 20 ans \(1860\)/); assert.match(txt, /Les pèlerinages de sa région/);
            assert.ok(!/cloche|plaque/.test(txt));
            await p.evaluate(() => { window.LCNDA_SHEET_LAZY_OFF = true; /* ce bloc essayé en entier (le chargement à mesure : test-fiche-lazy.js) */ const A = window.LCNDA_APP; A.state.currentPersonId = 3; A.setModule('personnes'); });
            await p.waitForSelector('[data-l10o-person="3"]', {state: 'attached', timeout: 20000}); await sleep(2500);
            assert.strictEqual(await p.evaluate(() => document.querySelector('[data-l10o-person="3"]').closest('section.card').hidden), true);
        });
        await t('Luc MAZAUD (vivant) : rien ne part sur Internet depuis sa fiche', async () => {
            const n0 = calls().length;
            await p.evaluate(() => { window.LCNDA_SHEET_LAZY_OFF = true; /* ce bloc essayé en entier (le chargement à mesure : test-fiche-lazy.js) */ const A = window.LCNDA_APP; A.state.currentPersonId = 4; A.setModule('personnes'); });
            await p.waitForSelector('[data-l10o-person="4"]', {state: 'attached', timeout: 20000}); await sleep(2500);
            assert.strictEqual(await p.getAttribute('[data-l10o-person="4"]', 'data-l10o-priv'), '1');
            assert.strictEqual(calls().length, n0);
        });
        await t('lieu (fiche d’un village) : 🔔 cloches avec les noms de la base, 🧺 objets, 🌿 herbier, 🪧 plaques, 🕯️ ; un lieu inconnu : rien', async () => {
            const [n, html, txt] = await into('placeInto', {...ALLANCHE, insee: '15001'});
            const tail = txt.replace(/\s+/g, ' ').slice(-900); assert.ok(n >= 4, `${n} : ${tail}`); assert.match(txt, /cloche\(s\) de Allanche portent un nom de ta base/); assert.match(txt, /objet\(s\) de Allanche dans les musées/);
            assert.match(txt, /plante\(s\) cueillie\(s\) à Allanche/); assert.match(txt, /plaque\(s\) ou stèle\(s\) à Allanche/);
            assert.match(html, /seulement la notice ici/); assert.match(html, /l10o-full/);
            const none = await into('placeInto', {id: 0, name: '', lat: null, lon: null});
            assert.deepStrictEqual(none.slice(0, 2), [0, '']);
        });
        await t('Réglages → 🔔 Objets et traces : un sujet s’éteint (↶), À propos des données (licences, dates de lecture), le cache (↶)', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'lot10_objets_traces'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-l10o-settings-page] table tbody tr', {timeout: 20000});
            const txt = await p.textContent('[data-l10o-settings-page]');
            assert.match(txt, /Wikisource/); assert.match(txt, /Licence Ouverte Etalab 2\.0/); assert.match(txt, /ODbL/); assert.match(txt, /CC0 1\.0 ou CC BY 4\.0/); assert.match(txt, /licence lue le 2026-11-25/); assert.match(txt, /MuCEM/);
            await p.click('[data-l10o-tg="herbier"] input');
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-lot10-objets-traces')).herbier), false);
            await sleep(300); await p.locator('button:has-text("↶ Annuler")').last().click({timeout: 5000}); await sleep(300);
            assert.notStrictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-lot10-objets-traces')).herbier), false);
            let before = -1; for (let i = 0; i < 20; i++) { const c = (await api('l10o_about')).cache.count; if (c === before) break; before = c; await sleep(500); } assert.ok(before > 0); // les recherches en cours sont finies
            await p.click('[data-l10o-cache-clear]'); await sleep(800);
            const mid = (await api('l10o_about')).cache.count;
            await p.locator('button:has-text("↶ Annuler")').last().click({timeout: 5000}); await sleep(800);
            const after = (await api('l10o_about')).cache.count;
            assert.deepStrictEqual([mid, after], [0, before]);
        });
        await t('registres : listes (colonne Source), monographie, cartes, dataSources, Ce qui le concerne, Où chercher', async () => {
            const r = await p.evaluate(async x => {
                const E = window.LCNDA_EXT, L = E.dataLists.filter(d => d.id.startsWith('l10o_'));
                const out = {ids: L.map(d => d.id), src: true, rows: {}};
                for (const d of L) { const rows = await d.load(); out.rows[d.id] = rows.length; if (!d.fields.some(f => f.key === 'src' && f.type === 'url') || !d.source) out.src = false; if (rows[0] && !/^https:\/\//.test(rows[0].src)) out.src = false; }
                const mono = E.monographSections.find(s => s.id === 'l10o_cloches'), mh = document.createElement('div'); document.body.appendChild(mh);
                out.mono = [await mono.render({id: 1, name: x.name, latitude: x.lat, longitude: x.lon}, mh, {}), mh.textContent]; mh.remove();
                out.secs = E.monographSections.filter(s => s.id.startsWith('l10o_')).map(s => s.id);
                const lay = E.mapLayerSources.find(s => s.id === 'l10o_contes'); out.map = (await lay.run({bbox: [-4, 48, -3, 49]})).features.length;
                const host = document.createElement('div'); document.body.appendChild(host);
                await E.dataSources.find(d => d.id === 'l10op_contes').run({person: {id: 2}}, host); out.ds = host.textContent; host.remove();
                out.srcs = E.dataSources.filter(s => /^l10o/.test(s.id)).length;
                out.ouc = (window.LCNDA_OUC_MONDE?.SITES || []).filter(s => s.key.startsWith('l10o_')).map(s => [s.key, s.url({last: 'GUÉZENNEC'})]);
                out.block = (window.LCNDA_APP.defaultPersonBlocks || []).some(b => b[0] === 'lot10_objets_traces');
                return out;
            }, ALLANCHE);
            ['l10o_pelerinages', 'l10o_contes'].forEach(id => assert.ok(r.ids.includes(id) && r.rows[id] > 100, id));
            assert.ok(r.src, 'colonne Source partout'); assert.strictEqual(r.mono[0], true); assert.match(r.mono[1], /MAZAUD/);
            assert.deepStrictEqual(r.secs, ['l10o_cloches', 'l10o_musee', 'l10o_herbier', 'l10o_plaques', 'l10o_contes', 'l10o_pelerinages']);
            assert.ok(r.map > 20); assert.match(r.ds, /Plouaret/); assert.ok(r.srcs >= 13); assert.ok(r.block);
            if (r.ouc.length) assert.ok(r.ouc.every(([, u]) => /^https:\/\/fr\.wikisource\.org\//.test(u)));
            const ts = fs.readFileSync(path.join(root, 'assets/js/heritage-tout-sur.js'), 'utf8'); assert.match(ts, /\[\/\^l10op_\/, 'lot10_objets_traces'\]/);
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
