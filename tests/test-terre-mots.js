#!/usr/bin/env node
/* 🪨🗣️💬 Terre et mots du village (lib/terre_mots.php, assets/js/heritage-terre-mots.js, assets/css/terre-mots.css, données assets/data/tm-*.json.gz).
 * Le réseau est remplacé par des réponses VRAIES enregistrées une fois (tests/fixtures/terre-mots/, GENEALOGY_TEST=1 + LCNDA_TEST_TM_DIR) :
 * Wikidata (homonymes de « Jean DURAND »), NASA/JPL (un astéroïde). Un fichier absent = hors ligne.
 *  0. Node : les données livrées (taille, forme, sources) ; l'heure d'un cadran solaire ; la phrase d'un village disparu ;
 *  1. serveur : la page d'un lieu (sol, noms, disparus, cadrans, fêtes…) sans réseau ; la fiche d'une personne (sol de son village,
 *     affaires de son époque sans son nom, astéroïde de son village) ; homonymes en ligne (jamais pour une fiche vivante) ; listes ;
 *  2. écran : fiche d'un village (ligne sous le titre, parties), fiche de personne, monographie, dataSources, dataLists,
 *     Convertisseur d'autrefois (« 📏 Mesures de son pays »), Réglages (éteindre une partie, effacer les réponses gardées et ↶).
 *   node tests/test-terre-mots.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const zlib = require('zlib');
const {spawn, spawnSync} = require('child_process');
const root = path.join(__dirname, '..');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FX = path.join(__dirname, 'fixtures/terre-mots');
const data = n => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'assets/data', `tm-${n}.json.gz`))).toString('utf8'));
const rows = n => { const d = data(n); return d.rows.map(r => Object.fromEntries(d.keys.map((k, i) => [k, r[i]]))); };
const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const TM = require('../assets/js/heritage-terre-mots.js');

(async () => {
    /* ═════════ 0. Node ═════════ */
    const CO = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'assets/data/cc-communes.json.gz'))).toString('utf8')).c;
    const SOL = data('sol'), NOMS = data('noms'), CIEL = data('ciel'), MOTS = data('mots'), MES = rows('mesures');
    const DISP = rows('disparus'), CAD = rows('cadrans'), FETES = rows('fetes'), AFF = rows('affaires'), LEG = rows('legendes'), FR = rows('fruits');
    await t('données livrées : moins de 15 Mo en tout, chaque fichier dit sa source, sa licence et sa date', async () => {
        const files = fs.readdirSync(path.join(root, 'assets/data')).filter(f => /^tm-.*\.json\.gz$/.test(f));
        const total = files.reduce((n, f) => n + fs.statSync(path.join(root, 'assets/data', f)).size, 0);
        console.log(`   ${files.length} fichiers, ${(total / 1e6).toFixed(2)} Mo`);
        assert.ok(total < 15e6);
        for (const f of files) { const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'assets/data', f))).toString('utf8')); assert.ok(d.built && (d.attr || d.families) && (d.licence || d.attr?.rock_licence), f); }
        assert.ok(Object.keys(SOL.c).length > 30000, 'la roche et l’altitude de presque toutes les communes');
        assert.ok(Object.values(SOL.c).every(r => (r[0] === null || SOL.families[r[0]]) && (r[2] === null || (r[2] > -50 && r[2] < 4900))));
        assert.ok(Object.keys(NOMS.c).length > 5000 && Object.keys(NOMS.c).every(i => CO[i]));
        for (const [n, R] of [['disparus', DISP], ['cadrans', CAD], ['fetes', FETES], ['affaires', AFF], ['legendes', LEG], ['fruits', FR]]) assert.ok(R.every(r => /^Q\d+$/.test(r.q) && r.n), n);
        assert.ok(AFF.every(r => /^(affaire|proces|crime d)/.test(fold(r.n)) && (r.s || r.e) <= 1990), 'seulement des « affaires » d’avant 1990');
        assert.ok(MES.every(r => r.sentence && r.page && r.value > 0 && ['a', 'l'].includes(r.metric)), 'chaque mesure a sa phrase et sa page');
        assert.ok(MES.every(r => r.sentence.replace(/\s/g, '').includes(String(r.value).replace('.', ',')) || r.sentence.includes(String(r.value)) || r.metric === 'a'), 'la valeur est dans la phrase');
        assert.ok(CIEL.names.length > 20000 && CIEL.places.every(p => p.cit && (p.kind === 'c' ? CO[p.code] : true)));
        assert.ok(MOTS.cats.every(c => c.words.every(w => w[0] && w[2])));
    });
    await t('☀️ l’heure du soleil : à Brest, midi au cadran = 12 h 27 à Paris ; à Strasbourg, 11 h 38', async () => {
        assert.strictEqual(TM.sundialNoon(-4.49).paris, '12 h 27'); assert.strictEqual(TM.sundialNoon(7.75).paris, '11 h 38');
        assert.strictEqual(TM.sundialNoon(2.3372).paris, '12 h 00'); assert.strictEqual(TM.sundialNoon(0).winter, '13 h 00'); assert.strictEqual(TM.sundialNoon(null), null);
    });
    await t('🏚️ la phrase d’un village disparu ne dit que ce que dit Wikidata', async () => {
        assert.strictEqual(TM.vanishedText({n: 'Vieux', k: 'reunie', e: 1973, commune: 'Neuf'}), 'Vieux n’existe plus comme commune : réunie à Neuf en 1973.');
        assert.strictEqual(TM.vanishedText({n: 'Fleury', k: 'abandonne', d: 'village détruit'}), 'Fleury : village abandonné — village détruit.');
    });

    /* les communes de l'essai : prises dans les données (elles restent justes si les données sont refaites) */
    const withNoms = Object.keys(NOMS.c).find(i => NOMS.c[i].n && NOMS.c[i].g && SOL.c[i]?.[0] != null);
    const aff = AFF.filter(r => r.insee && r.s >= 1820 && r.s <= 1900)[0];
    const fete = FETES.find(r => r.insee);
    const lyon = CIEL.places.find(p => p.kind === 'c');
    const reunie = DISP.find(r => r.k === 'reunie' && r.own && !CO[r.own] && r.e);
    assert.ok(withNoms && aff && fete && lyon, 'des communes pour l’essai');
    console.log(`   communes : ${CO[withNoms][0]} (${withNoms}), ${aff.n} à ${CO[aff.insee][0]}, fête « ${fete.n} », astéroïde ${lyon.name}`);

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-tm-')), net0 = path.join(tmp, 'net');
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true}); fs.cpSync(FX, net0, {recursive: true});
    const calls = () => { try { return fs.readFileSync(path.join(net0, 'calls.log'), 'utf8').trim().split('\n').filter(Boolean); } catch (_) { return []; } };
    let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
    const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1', LCNDA_TEST_TM_DIR: net0};
    const P = i => [CO[i][0], CO[i][1], CO[i][2], i];
    const [n1, a1, o1] = P(withNoms), [n2, a2, o2] = P(aff.insee), [n3, a3, o3] = P(lyon.code), [n4, a4, o4] = P(fete.insee);
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','MAZAUD','male','deceased',1),(2,'Jean','DURAND','male','deceased',0),(3,'Paul','LACOMBE','male','living',0)");
$pl = $pdo->prepare("INSERT INTO places(id,name,country,latitude,longitude,admin4_code) VALUES(?,?,'France',?,?,?)");
foreach (json_decode(getenv('TM_PLACES'), true) as $i => $r) { $pl->execute([$i + 1, $r[0], $r[1], $r[2], $r[3]]); }
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id,title) VALUES('person',?,?,?,?,?,?,?)");
$y = (int) getenv('TM_AFF_YEAR');
$ins->execute([1,$t('BIRT'),(string)($y-30),$y-30,(string)($y-30),1,'']); $ins->execute([1,$t('DEAT'),(string)($y+10),$y+10,(string)($y+10),2,'']); $ins->execute([1,$t('OCCU'),'',$y-5,'',1,'jardinier']);
$ins->execute([2,$t('BIRT'),'1850',1850,'1850',3,'']); $ins->execute([2,$t('DEAT'),'1920',1920,'1920',4,'']);
$ins->execute([3,$t('BIRT'),'1980',1980,'1980',1,'']);
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env: {...env, TM_PLACES: JSON.stringify([[n1, a1, o1, withNoms], [n2, a2, o2, aff.insee], [n3, a3, o3, lyon.code], [n4, a4, o4, fete.insee]]), TM_AFF_YEAR: String(aff.s)}});
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
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultPersonBlocks, null, {timeout: 30000});
        // index.php ne charge pas encore ces fichiers : on les ajoute (comme le feront les balises)
        for (const [js, css, k] of [['heritage-commune-plus.js', 'commune-plus.css', 'communePlus'], ['heritage-commune-culture.js', 'commune-culture.css', 'communeCulture'], ['heritage-monographie-plus.js', 'monographie-plus.css', 'monographiePlus'], ['app-listes-donnees.js', '', 'dataListsEngine'], ['heritage-terre-mots.js', 'terre-mots.css', 'terreMots']]) {
            if (await p.evaluate(x => !!window.LCNDA_EXT?.[x], k)) continue;
            if (css) await p.addStyleTag({url: base + 'assets/css/' + css});
            await p.addScriptTag({url: base + 'assets/js/' + js});
        }
        await p.waitForFunction(() => window.LCNDA_EXT?.terreMots, null, {timeout: 10000});
        const api = (x, qq = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, qq]);

        /* ═════════ 1. le serveur ═════════ */
        await t('tm_place : roche, altitude, nom régional et gentilé tels qu’ils sont dans les données livrées (sans réseau)', async () => {
            const n = calls().length;
            const r = await api('tm_place', {place_id: 1});
            assert.strictEqual(r.ok, true, JSON.stringify(r).slice(0, 300));
            assert.strictEqual(r.commune.insee, withNoms);
            assert.strictEqual(r.sol.rock, SOL.families[SOL.c[withNoms][0]]); assert.strictEqual(r.sol.alt, SOL.c[withNoms][2]);
            assert.match(r.sol.source.rock_url, /zenodo/); assert.strictEqual(r.sol.source.rock_licence, 'CC BY 4.0');
            assert.deepStrictEqual(r.noms.regional.map(x => x.name).sort(), Object.values(NOMS.c[withNoms].n).sort());
            assert.deepStrictEqual(r.noms.gentiles.map(x => x.name).sort(), NOMS.c[withNoms].g.map(x => x[0]).sort());
            assert.match(r.noms.url, /^https:\/\/www\.wikidata\.org\/wiki\/Q\d+$/);
            assert.strictEqual(calls().length, n, 'pas de réseau');
        });
        await t('tm_place : les fêtes, cadrans et disparus de la commune ; les mots du coin de son département', async () => {
            const r = await api('tm_place', {place_id: 4});
            assert.ok(r.fetes.some(f => f.q === fete.q && /^https:\/\/www\.wikidata\.org\/wiki\/Q/.test(f.url)));
            const cad = CAD.find(c => c.insee);
            if (cad) { const c = await api('tm_place', {insee: cad.insee}); assert.ok(c.cadrans.some(x => x.q === cad.q)); }
            const d = DISP.find(x => x.insee && x.k !== 'reunie');
            if (d) { const c = await api('tm_place', {insee: d.insee}); assert.ok(c.disparus.some(x => x.q === d.q)); }
            const dep = withNoms.slice(0, 2), cat = MOTS.cats.filter(c => c.where.includes(dep)).sort((a, b) => a.where.length - b.where.length)[0];
            const m = (await api('tm_place', {place_id: 1})).mots;
            if (cat) { assert.strictEqual(m.cat, cat.cat); assert.ok(m.words.every(w => cat.words.some(x => x[0] === w.word) && /^https:\/\/fr\.wiktionary\.org\/wiki\//.test(w.url))); }
            if (reunie) { const v = await api('tm_place', {insee: reunie.insee}); assert.ok(v.disparus.some(x => x.q === reunie.q && x.k === 'reunie')); }
        });
        await t('tm_person (MAZAUD, jardinier) : le sol de son village natal, une affaire de son époque près de chez lui — sans jamais son nom', async () => {
            const r = await api('tm_person', {id: 1});
            assert.strictEqual(r.ok, true, JSON.stringify(r).slice(0, 300));
            assert.strictEqual(r.sol.insee, withNoms);
            assert.ok((r.affaires || []).some(x => x.q === aff.q), JSON.stringify(r.affaires || []).slice(0, 300));
            assert.ok(!JSON.stringify(r.affaires).includes('MAZAUD'), 'l’affaire n’est jamais rattachée à son nom');
            assert.ok(r.noms && r.noms.regional.length);
            assert.strictEqual(r.online_ok, true);
        });
        await t('tm_person (DURAND) : l’astéroïde au nom de son village ; homonymes célèbres en ligne (même prénom et même nom, jamais fusionnés)', async () => {
            const r = await api('tm_person', {id: 2});
            assert.ok(r.ciel?.village?.some(a => a.num === lyon.num), JSON.stringify(r.ciel || {}).slice(0, 200));
            const n = calls().length;
            const h = await api('tm_homonymes', {id: 2});
            assert.strictEqual(h.ok, true, JSON.stringify(h).slice(0, 300));
            assert.ok(h.items.length >= 3 && h.items.every(x => fold(x.label) === 'jean durand' && /^https:\/\/www\.wikidata\.org\/wiki\/Q\d+$/.test(x.url)));
            assert.ok(h.items.some(x => x.birth === 1882 && /cinéaste/.test(x.desc)));
            assert.ok(calls().length === n + 1 && /query\.wikidata\.org\/sparql/.test(calls().at(-1)));
            assert.strictEqual((await api('tm_homonymes', {id: 2})).cached, true); assert.strictEqual(calls().length, n + 1, 'gardé');
            assert.strictEqual(q('SELECT COUNT(*) n FROM persons')[0].n, 3, 'rien n’est ajouté à la base');
        });
        await t('fiche d’une personne vivante (LACOMBE) : rien n’est envoyé sur Internet', async () => {
            const n = calls().length;
            const r = await api('tm_homonymes', {id: 3});
            assert.strictEqual(r.ok, false); assert.strictEqual(r.private, true); assert.strictEqual(calls().length, n);
            assert.strictEqual((await api('tm_person', {id: 3})).online_ok, false);
        });
        await t('🌟 tm_asteroid : la citation livrée (sans réseau) ; un autre numéro en ligne ; hors ligne : un petit message', async () => {
            const n = calls().length;
            const a = await api('tm_asteroid', {num: lyon.num});
            assert.strictEqual(a.citation, lyon.cit); assert.strictEqual(calls().length, n);
            const b = await api('tm_asteroid', {num: '7064'});
            assert.strictEqual(b.ok, true); assert.strictEqual(calls().length, n + 1);
            const c = await api('tm_asteroid', {num: '99999999'});
            assert.strictEqual(c.ok, false); assert.strictEqual(c.offline, true);
        });
        await t('listes : chaque jeu de données en entier, avec son lien vers la source', async () => {
            for (const [k, n] of [['disparus', DISP.length], ['cadrans', CAD.length], ['fruits', FR.length], ['legendes', LEG.length], ['affaires', AFF.length], ['fetes', FETES.length], ['mesures', MES.length], ['asteroides', CIEL.places.length]]) {
                const r = await api('tm_list', {kind: k});
                assert.strictEqual(r.rows.length, n, k); assert.ok(r.rows.every(x => /^https:\/\//.test(x.url)), k);
            }
            assert.ok((await api('tm_list', {kind: 'noms'})).rows.length >= Object.keys(NOMS.c).length);
            assert.strictEqual((await api('tm_list', {kind: 'mots'})).rows.length, MOTS.cats.reduce((n, c) => n + c.words.length, 0));
        });

        /* ═════════ 2. l'écran ═════════ */
        await t('fiche d’un village : la ligne sous le titre (« 🗣️ … · 🏷️ les … · 🪨 … ») et la partie « 🪨 Le sol et le relief » sourcée', async () => {
            await p.evaluate(i => { const A = window.LCNDA_APP; A.state.listType = 'villages'; A.state.hVillage = i; A.setModule('listes'); }, withNoms);
            await p.waitForSelector('.h-village .tm-head', {timeout: 20000});
            const head = await p.textContent('.h-village .tm-head');
            assert.ok(head.includes(Object.values(NOMS.c[withNoms].n)[0]), head); assert.match(head, /🏷️ les /); assert.match(head, /⛰️ \d+ m/);
            await p.waitForSelector('[data-tm-host] [data-tm-part="sol"]', {timeout: 20000});
            const sol = await p.textContent('[data-tm-part="sol"]');
            assert.match(sol, /m d’altitude/); assert.match(sol, /CC BY 4\.0/); assert.match(sol, /↗ source/);
            assert.ok(await p.$$eval('[data-tm-part="sol"] a[target="_blank"][rel*="noopener"]', a => a.length >= 2));
        });
        await t('fiche de MAZAUD : « 🪨 Terre et mots de son pays » — sol, nom régional, affaire de son époque (prudente)', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('[data-tm-person="1"] [data-tm-line="affaires"]', {timeout: 20000});
            const txt = await p.textContent('[data-pblock="terre_mots"]');
            assert.match(txt, /Terre et mots de son pays/); assert.match(txt, /🪨 Sous /); assert.match(txt, /rien ne la relie à ta famille/);
            assert.ok(txt.includes(aff.n));
        });
        await t('fiche de DURAND : « 👥 Ne pas confondre avec… » (lu en ligne puis gardé) et 🌟 l’astéroïde de son village', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 2; A.setModule('personnes'); });
            await p.waitForSelector('[data-tm-person="2"] [data-tm-line="homonymes"]:not([hidden])', {timeout: 20000});
            const txt = await p.textContent('[data-tm-person="2"]');
            assert.match(txt, /Ne pas confondre avec/); assert.match(txt, /rien n’est fusionné/); assert.ok(txt.includes(`(${lyon.num}) ${lyon.name}`));
        });
        await t('monographie de commune : les parties enregistrées (sol, noms, disparus…) et rendues', async () => {
            const ids = await p.evaluate(() => (window.LCNDA_EXT.monographSections || []).filter(s => /^tm_/.test(s.id)).map(s => s.id));
            assert.deepStrictEqual(ids, ['tm_sol', 'tm_noms', 'tm_disparus', 'tm_cadrans', 'tm_fetes', 'tm_legendes', 'tm_affaires', 'tm_fruits', 'tm_mots', 'tm_ciel', 'tm_mesures']);
            const out = await p.evaluate(async i => { const h = document.createElement('div'); document.body.appendChild(h); const s = window.LCNDA_EXT.monographSections.find(x => x.id === 'tm_noms');
                const ok = await s.render({id: 1, name: ''}, h, {village: async () => ({insee: i})}); const t = h.textContent; h.remove(); const none = await window.LCNDA_EXT.monographSections.find(x => x.id === 'tm_cadrans').render({id: 0, name: 'Nulle-Part-sur-Rien'}, document.createElement('div'), {}); return {ok, t, none}; }, withNoms);
            assert.strictEqual(out.ok, true); assert.match(out.t, /Ses habitants s’appellent/); assert.strictEqual(out.none, false);
        });
        await t('LCNDA_EXT.dataSources (aussi « 🔎 Ce qui le concerne ») : une phrase et un lien vers la source, pour un lieu ou une personne', async () => {
            const ids = await p.evaluate(() => (window.LCNDA_EXT.dataSources || []).filter(d => /^tm_/.test(d.id)).map(d => [d.id, d.group, d.needs.join()]));
            assert.ok(ids.length >= 20 && ids.some(x => x[0] === 'tm_p_homonymes' && x[2] === 'person') && ids.some(x => x[0] === 'tm_sol' && x[2] === 'place'));
            const res = await p.evaluate(async i => { const h = document.createElement('div'); document.body.appendChild(h); await window.LCNDA_EXT.dataSources.find(d => d.id === 'tm_sol').run({place: {insee: i}}, h);
                const a = {t: h.textContent, links: h.querySelectorAll('a[target="_blank"]').length}; await window.LCNDA_EXT.dataSources.find(d => d.id === 'tm_p_affaires').run({person: {id: 1}}, h); a.p = h.textContent; h.remove(); return a; }, withNoms);
            assert.match(res.t, /🪨 Sous /); assert.ok(res.links >= 2); assert.match(res.p, /🔍/);
        });
        await t('LCNDA_EXT.dataLists : listes avec carte, période et colonne de source', async () => {
            const L = await p.evaluate(async () => Promise.all((window.LCNDA_EXT.dataLists || []).filter(d => /^tm_/.test(d.id)).map(async d => { const r = await d.load(); return {id: d.id, n: r.length, url: d.fields.some(f => f.type === 'url'), geo: d.geo ? r.filter(x => d.geo(x)).length : -1}; })));
            assert.deepStrictEqual(L.map(x => x.id), ['tm_disparus', 'tm_cadrans', 'tm_fruits', 'tm_legendes', 'tm_affaires', 'tm_fetes', 'tm_noms', 'tm_sol', 'tm_mots', 'tm_mesures', 'tm_asteroides', 'tm_cultivars']);
            assert.ok(L.filter(x => x.id !== 'tm_sol').every(x => x.url), 'une colonne « Source »');
            assert.ok(L.find(x => x.id === 'tm_fetes').geo >= FETES.filter(f => f.lat != null || f.insee).length * 0.9);
        });
        await t('🪙 Convertisseur d’autrefois : l’onglet « 📏 Mesures de son pays » (phrase de la source, ↗, conversion)', async () => {
            const out = await p.evaluate(async () => { const tab = window.LCNDA_EXT.autrefoisTabs.find(x => x.id === 'tm_mesures'); const h = document.createElement('div'); document.body.appendChild(h); await tab.mount(h);
                const i = h.querySelector('[data-tm-conv]'); i.value = '2'; i.dispatchEvent(new Event('input', {bubbles: true})); const o = {t: h.textContent, out: i.parentNode.querySelector('output').textContent, n: h.querySelectorAll('tbody tr').length}; h.remove(); return o; });
            assert.strictEqual(out.n, MES.length); assert.match(out.out, /^≈ /); assert.match(out.t, /CC BY-SA 4\.0/);
        });
        await t('Réglages → 🪨 Terre et mots du village : éteindre « Le sol » retire la ligne du village ; ↶ ; effacer les réponses gardées puis ↶', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'terre_mots'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-tm-settings] [data-tm-tg="sol"] input', {timeout: 20000});
            const s = await p.textContent('[data-tm-settings]');
            assert.match(s, /CC0 1\.0/); assert.match(s, /CC BY 4\.0/); assert.match(s, /Licence Ouverte 2\.0/); assert.match(s, /CC BY-SA 4\.0/);
            await p.uncheck('[data-tm-tg="sol"] input');
            assert.strictEqual(JSON.parse(await p.evaluate(() => localStorage.getItem('genealogie-terre-mots'))).sol, false);
            await p.click('[data-tm-clear]');
            await p.waitForFunction(() => /Réponses gardées effacées/.test([...document.querySelectorAll('.ui-toast, .toast')].map(x => x.textContent).join(' ')), null, {timeout: 10000});
            assert.strictEqual(fs.readdirSync(path.join(tmp, 'cache/terre-mots')).filter(f => f.endsWith('.json')).length, 0);
            await p.click('.ui-toast button:has-text("Annuler"), .toast button:has-text("Annuler")');
            await sleep(800);
            assert.ok(fs.readdirSync(path.join(tmp, 'cache/terre-mots')).filter(f => f.endsWith('.json')).length >= 1, '↶ remet les réponses');
            await p.evaluate(i => { const A = window.LCNDA_APP; A.state.listType = 'villages'; A.state.hVillage = i; A.setModule('listes'); }, withNoms);
            await p.waitForSelector('.h-village [data-tm-host]', {timeout: 20000}); await sleep(800);
            assert.strictEqual(await p.$('[data-tm-part="sol"]'), null);
            assert.ok(!/⛰️/.test(await p.textContent('.h-village .tm-head').catch(() => '')));
            await p.evaluate(() => localStorage.removeItem('genealogie-terre-mots'));
        });
        await t('pas d’erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    function q(sql) { return JSON.parse(spawnSync(phpPath, ['-r', `$p=new PDO('sqlite:${path.join(tmp, 'genealogy.sqlite')}');echo json_encode($p->query(${JSON.stringify(sql)})->fetchAll(PDO::FETCH_ASSOC));`], {encoding: 'utf8'}).stdout || '[]'); }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
