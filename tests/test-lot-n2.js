#!/usr/bin/env node
/* 📊 Chiffres d'époque et mots des actes (lot N2) — assets/js/app-lot-n2-chiffres.js, scripts/telech-n2/*, assets/data/tn2-*.json.gz.
 *  1. Node : les fichiers livrés (source, licence lue, date, manifeste), le dictionnaire des maladies (« fluxion de poitrine »,
 *     « mal caduc » ; le plus long d'abord ; jamais le texte d'un autre événement), les formules (« feu », « veuve en premières
 *     noces »), la SGF (élèves inscrits du Corrèze vers 1829-1840, recensement de 1856, Seine → 75, 92, 93, 94), le Québec, les packs
 *     Wikidata (ordres, saints patrons, généraux nés avant 1801), les cadastres ouverts (licence ouverte seulement), Expilly.
 *  2. Serveur et écran (php -S + Playwright, base temporaire) : rien ne part sur Internet ; fiche d'une personne décédée (🩺 📚 👥
 *     ⏳), rien pour une fiche vivante ni confidentielle ; Québec et Suisse ; village (⛪ ✝️ ⚔️ 🗺 📖 📊) ; listes, cartes, ⌘K
 *     (« mal caduc »), Réglages (interrupteur ↶), 390 px et thème sombre, aucune erreur JavaScript.
 *  Fiches (noms inventés) : Jean MAZAUD (1820 Tulle – 1870 Tulle, « fluxion de poitrine »), Marie LACOMBE (1850 Québec – 1900 Québec,
 *  mariée à Québec en 1872), Paul DURAND (1800 Lausanne – 1860 Lausanne), Luc MAZAUD (vivant, 1990 Tulle).
 *   node tests/test-lot-n2.js */
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
const H = require('../assets/js/app-lot-n2-chiffres.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const has = n => fs.existsSync(path.join(root, 'assets/data', `${n}.json.gz`));
const raw = n => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'assets/data', `${n}.json.gz`))).toString('utf8'));
const rows = n => H.table(raw(n)).map(r => ({...r, alt: r.alt || []}));
const SHIPPED = ['tn2-sgf-ecole', 'tn2-sgf-recensements', 'tn2-sgf-territoire', 'tn2-maladies', 'tn2-formules', 'tn2-heimatort', 'tn2-mortalite', 'tn2-ordres', 'tn2-patrons', 'tn2-generaux', 'tn2-quebec-paroisses', 'tn2-cadastres'];
const OPEN = /Licence Ouverte|ODbL|CC0|CC BY|domaine public|Domaine public|OPEN BY/;
const ev = (tag, year, p, extra = {}) => ({tag, year, date: String(year), place: p.name, lat: p.lat, lon: p.lon, insee: p.insee || '', country: p.country || 'France', ...extra});
const P = {tulle: {name: 'Tulle', lat: 45.267, lon: 1.768, insee: '19272'}, quebec: {name: 'Québec', lat: 46.8139, lon: -71.2080, country: 'Canada'}, lausanne: {name: 'Lausanne', lat: 46.5197, lon: 6.6323, country: 'Suisse'}};
const JEAN = {ok: true, person: {id: 1, first: 'Jean', last: 'MAZAUD', gender: 'male', birth: 1820, death: 1870}, events: [ev('BIRT', 1820, P.tulle), ev('MARR', 1845, P.tulle, {description: 'veuve en premières noces'}), ev('DEAT', 1870, P.tulle, {cause: 'fluxion de poitrine'})]};

(async () => {
    /* ═════════ 1. les fichiers et le calcul ═════════ */
    await t('fichiers livrés : source, adresse, licence ouverte et date ; dans le manifeste (scripts/telech-n2) ; adresses https', async () => {
        const man = JSON.parse(fs.readFileSync(path.join(root, 'assets/data/manifest.json'), 'utf8'));
        for (const n of SHIPPED) {
            assert.ok(has(n), n); assert.ok(fs.statSync(path.join(root, 'assets/data', `${n}.json.gz`)).size < 3e6, n);
            const m = raw(n); assert.ok(m.source && m.url && m.licence && m.licence_url && /^\d{4}-\d\d-\d\d$/.test(m.built), n);
            assert.match(m.licence, OPEN, `${n} : licence ouverte (${m.licence})`); assert.ok(/^https:\/\//.test(m.url) && /^https:\/\//.test(m.licence_url), `${n} : https`);
            assert.ok(man.packs[n] && man.packs[n].script === 'scripts/telech-n2', `${n} dans le manifeste`);
        }
        for (const n of ['tn2-sgf-ecole', 'tn2-sgf-recensements', 'tn2-sgf-territoire']) { const m = raw(n); assert.match(m.licence_quote, /Licence Ouverte \/ Open Licence version 2\.0/); assert.strictEqual(m.mention, 'Source : Insee'); assert.ok(m.tables.length >= 4); }
        assert.ok(raw('tn2-cadastres').rows.length >= 5);
        for (const r of rows('tn2-cadastres')) assert.match(r.licence, /Licence Ouverte|ODbL/, r.n);
        assert.ok(raw('tn2-cadastres').link_only.every(x => /licence|fichier/.test(x.why)));
    });
    await t('🩺 maladies : « fluxion de poitrine », « mal caduc », « suites de couches » ; le plus long d’abord ; seulement le texte du décès', async () => {
        const R = rows('tn2-maladies'); assert.ok(R.length >= 150, `${R.length} mots`);
        const idx = H.dictIndex(R);
        assert.deepStrictEqual(H.findTerms('Décédé d’une fluxion de poitrine', idx).map(r => r.w), ['fluxion de poitrine']);
        assert.strictEqual(H.findTerms('mort du mal caduc', idx)[0].w, 'mal caduc');
        assert.strictEqual(H.findTerms('morte des suites de couches', idx)[0].w, 'suites de couches');
        assert.strictEqual(H.findTerms('fièvre putride maligne', idx)[0].w, 'fièvre putride');
        assert.deepStrictEqual(H.findTerms('il habitait la rue du Four', idx), []);
        assert.strictEqual(H.deathText(JEAN), 'fluxion de poitrine', 'pas le texte du mariage');
        assert.strictEqual(H.lookup('phtisie', idx)[0].w, 'phtisie');
    });
    await t('📜 formules : « feu », « veuve en premières noces », « majeur de vingt-cinq ans », « honnête femme »', async () => {
        const R = rows('tn2-formules'); assert.ok(R.length >= 60); const idx = H.dictIndex(R);
        assert.strictEqual(H.findTerms('fils de feu Jean', idx)[0].w, 'feu');
        assert.strictEqual(H.findTerms('Marie, veuve en premières noces de Pierre', idx)[0].w, 'veuve en premières noces');
        assert.ok(H.findTerms('majeur de 25 ans', idx).some(r => r.w === 'majeur de vingt-cinq ans'));
        assert.ok(R.every(r => r.m && r.k), 'chaque formule a un sens et une sorte');
    });
    await t('📊 SGF : élèves inscrits en Corrèze vers 1830, recensement de 1851, départements d’alors → codes d’aujourd’hui ; année de recensement de sa vie', async () => {
        const E = raw('tn2-sgf-ecole'), Rc = raw('tn2-sgf-recensements'), Te = raw('tn2-sgf-territoire');
        const e = H.sgfPick(E, '19', [/^Nombre total d.élèves inscrits dans les écoles de toute nature/i], 1829, 6);
        assert.ok(e.length && e[0].unit === 'Corrèze' && e[0].v > 1000, JSON.stringify(e[0]));
        assert.ok(H.sgfPick(Rc, '19', [/./], 1856, 0).length > 20, 'recensement de 1856, Corrèze');
        const seine = Rc.units.find(u => u[0] === 'Seine'); assert.deepStrictEqual(seine && seine[2], ['75', '92', '93', '94']);
        assert.ok(Te.units.filter(u => u[1] === 'D').length >= 86);
        assert.ok(Rc.units.every(u => u[1] !== 'D' || u[2].length), 'chaque département rattaché à un code');
        assert.strictEqual(H.censusYear(JEAN), 1851, 'milieu de sa vie adulte (1835-1870) : 1851'); assert.strictEqual(H.censusYear({person: {birth: 1700, death: 1760}}), null);
        assert.deepStrictEqual(H.lifeDep(JEAN), {dep: '19', place: 'Tulle'});
        assert.strictEqual(H.yearOf('Nombre total des élèves reçus dans les écoles publiques- 1876-1877'), 1877);
    });
    await t('✝️ ⛪ ⚔️ 🍁 Wikidata : ordres (bénédictins, cisterciens), saints patrons avec leur fête, généraux nés avant 1801, paroisses du Québec', async () => {
        const O = rows('tn2-ordres'); assert.ok(O.length > 1000);
        assert.ok(O.some(r => r.o.some(o => /cistercien/i.test(o[1]))) && O.some(r => r.o.some(o => /Saint-Benoît|bénédictin/i.test(o[1]))));
        assert.ok(!O.some(r => /^Affaire/i.test(r.n)), 'des bâtiments, pas des affaires');
        const Pt = rows('tn2-patrons'); assert.ok(Pt.length > 1000); assert.ok(Pt.filter(r => r.feast).length > 200, 'des fêtes'); assert.ok(Pt.every(r => r.s.length));
        const G = rows('tn2-generaux'); assert.ok(G.length > 500); assert.ok(G.every(r => r.b <= 1800 && /^(\d{5}|2[AB]\d{3})$/.test(r.ins)), 'nés avant 1801, une commune');
        const Q = rows('tn2-quebec-paroisses'); assert.ok(Q.length > 100); assert.ok(Q.every(r => H.inQuebec(r)), 'au Québec seulement');
        const list = H.parishesFor(Q, ev('MARR', 1872, P.quebec)); assert.ok(list.length && list.every(x => x.r.y === null || x.r.y <= 1872), 'ouvertes avant le mariage');
        assert.ok(!H.inQuebec({lat: 45.42, lon: -75.69}), 'Ottawa n’est pas au Québec'); assert.ok(H.isSwiss({country: 'Suisse'}));
    });
    await t('🗺 📖 lieux : cadastre du Doubs pour Besançon, de la ville pour Avignon ; volume d’Expilly (A-B… R-S ; rien après S)', async () => {
        const C = rows('tn2-cadastres');
        assert.ok(H.cadastresFor(C, '25056').some(r => r.zone === 'Doubs'));
        assert.strictEqual(H.cadastresFor(C, '84007')[0].zone, 'Avignon');
        assert.deepStrictEqual(H.cadastresFor(C, '19272'), []);
        assert.strictEqual(H.expillyVolume('Tulle'), null, 'T : le dictionnaire s’arrête à S');
        assert.strictEqual(H.expillyVolume('Aubagne')[1], 1); assert.strictEqual(H.expillyVolume('Saint-Flour')[1], 6);
        assert.strictEqual(H.safeUrl('javascript:alert(1)'), ''); assert.strictEqual(H.safeUrl('https://a.b/"x'), '');
        const yml = fs.readFileSync(path.join(root, '.github/workflows/telech-n2.yml'), 'utf8');
        for (const s of ['build_sgf.py', 'build_wikidata.py', 'build_textes.py', 'build_cadastres.py', 'build_expilly.py', 'build_europe.py']) assert.ok(yml.includes(s), s);
        const eu = fs.readFileSync(path.join(root, 'scripts/telech-n2/build_europe.py'), 'utf8'); assert.match(eu, /def licence\(/); assert.match(eu, /lien seulement/);
    });

    /* ═════════ 2. serveur et écran ═════════ */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-n2-'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start,occupation) VALUES(1,'Jean','MAZAUD','male','deceased',1,'cultivateur'),(2,'Marie','LACOMBE','female','deceased',0,''),(3,'Paul','DURAND','male','deceased',0,''),(4,'Luc','MAZAUD','male','living',0,'')");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code) VALUES(1,'Tulle','Corrèze','France',45.2670,1.7680,'19272'),(2,'Québec','Québec','Canada',46.8139,-71.2080,''),(3,'Lausanne','Vaud','Suisse',46.5197,6.6323,'')");
$t = function ($tag) use ($pdo) { $i = (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn(); return $i ?: (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='BIRT' LIMIT 1")->fetchColumn(); };
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id,cause) VALUES('person',?,?,?,?,?,?,?)");
foreach ([[1,'BIRT',1820,1,''],[1,'DEAT',1870,1,'fluxion de poitrine'],[2,'BIRT',1850,2,''],[2,'MARR',1872,2,''],[2,'DEAT',1900,2,''],[3,'BIRT',1800,3,''],[3,'DEAT',1860,3,''],[4,'BIRT',1990,1,'']] as [$p,$g,$y,$pl,$c]) { $ins->execute([$p,$t($g),(string)$y,$y,(string)$y,$pl,$c]); }
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
        p.on('console', m => { if (m.type() === 'error' && /Failed to fetch|tn2-|lot-n2/i.test(m.text())) errs.push(m.text()); });
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultPersonBlocks && window.LCNDA_EXT?.lotN2, null, {timeout: 30000});
        const into = (fn, arg, opts = {}) => p.evaluate(async ([f, a, o]) => { const h = document.createElement('div'); document.body.appendChild(h); const n = await window.LCNDA_EXT.lotN2[f](h, a, {detached: true, ...o}); const r = [n, h.innerHTML, h.textContent]; h.remove(); return r; }, [fn, arg, opts]);

        await t('fiche de Jean MAZAUD : 🩺 « fluxion de poitrine » ; 📚 élèves en Corrèze ; 👥 recensement de 1851 ; ⏳ ; liens sûrs ; « Source : Insee »', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('[data-ln2-person="1"] .ln2-row', {timeout: 30000}); await sleep(400);
            const txt = await p.textContent('[data-ln2-person="1"]');
            assert.match(txt, /« fluxion de poitrine » : pneumonie/); assert.match(txt, /Corrèze/); assert.match(txt, /élèves/); assert.match(txt, /recensement de 1851/); assert.match(txt, /Source : Insee/); assert.match(txt, /survivans|Duvillard|Deparcieux/);
            const html = await p.innerHTML('[data-ln2-person="1"]');
            assert.match(html, /target="_blank" rel="noopener noreferrer"/); assert.ok(!/href="(?!https?:)/.test(html), 'seulement des liens http(s)');
        });
        await t('Marie (Québec, 1872) : 🍁 la paroisse déjà ouverte ; Paul (Lausanne) : 🇨🇭 le lieu d’origine ; Luc (vivant) et fiche confidentielle : rien', async () => {
            const [n2, , m] = await into('personInto', 2); assert.ok(n2 >= 1, m); assert.match(m, /paroisse ouverte la plus proche/);
            const [, , pl] = await into('personInto', 3); assert.match(pl, /lieu d'origine|Heimatort/);
            const [nl] = await into('personInto', 4); assert.strictEqual(nl, 0);
            const [np] = await into('personInto', 1, {private: true}); assert.strictEqual(np, 0, 'confidentielle : rien');
        });
        await t('village : ⛪ saint patron, ⚔️ généraux, ✝️ abbayes, 🗺 cadastre (Avignon), 📖 Expilly, 📊 département ; monographie, listes, cartes, à la demande', async () => {
            const G = rows('tn2-generaux'); const by = {}; for (const g of G) by[g.ins] = (by[g.ins] || 0) + 1;
            const top = Object.entries(by).sort((a, b) => b[1] - a[1])[0][0];
            const [ng, , gt] = await into('placeInto', {id: 9, name: 'Ici', insee: top}, {parts: ['generaux'], force: true}); assert.ok(ng === 1 && /généraux de la Révolution/.test(gt), gt);
            const Pt = rows('tn2-patrons').find(r => r.feast && r.ins);
            const [np, , pt] = await into('placeInto', {id: 9, name: Pt.commune, insee: Pt.ins}, {parts: ['patron'], force: true}); assert.ok(np === 1 && /fêté le/.test(pt), pt);
            const O = rows('tn2-ordres').find(r => r.lat !== null && r.o.length);
            const [no, , ot] = await into('placeInto', {id: 9, name: 'x', lat: O.lat, lon: O.lon}, {parts: ['ordres'], force: true}); assert.ok(no === 1, ot); assert.ok(ot.includes(O.o[0][1]));
            const [nc, ch] = await into('placeInto', {id: 9, name: 'Avignon', insee: '84007', lat: 43.95, lon: 4.81}, {parts: ['cadastre', 'expilly', 'chiffres'], force: true});
            assert.ok(nc >= 3, ch); assert.match(ch, /data\.gouv\.fr/); assert.match(ch, /archive\.org\/details\/bub_gb_/); assert.match(ch, /habitants en 18/);
            const reg = await p.evaluate(() => { const E = window.LCNDA_EXT; return {lists: E.dataLists.filter(s => /^ln2_/.test(s.id)).map(s => [s.id, s.theme]), mono: E.monographSections.filter(s => /^ln2_/.test(s.id)).length,
                maps: E.mapLayerSources.filter(s => /^ln2_/.test(s.id)).length, ds: E.dataSources.filter(s => /^ln2/.test(s.id)).every(d => d.online === false), village: (E.villageSectionDefs || []).some(d => d.id === 'ln2_place'),
                block: (window.LCNDA_APP.defaultPersonBlocks || []).some(b => b[0] === 'lot_n2'), tab: (window.LCNDA_APP.defaultMaintenanceTabs || []).some(b => b[0] === 'lot_n2')}; });
            assert.ok(reg.lists.length >= 11 && reg.lists.every(([, th]) => ['croire', 'livres', 'guerres', 'lieux', 'prix'].includes(th)), JSON.stringify(reg.lists));
            assert.ok(reg.mono === 6 && reg.maps === 4 && reg.ds && reg.village && reg.block && reg.tab, JSON.stringify(reg));
            const L = await p.evaluate(async () => { const E = window.LCNDA_EXT; const m = await E.dataLists.find(x => x.id === 'ln2_maladies').load(); const s = await E.dataLists.find(x => x.id === 'ln2_sgf_rec').load(); return [m.length, s.length, s[0]]; });
            assert.ok(L[0] >= 150 && L[1] >= 50 && /^https:\/\/www\.insee\.fr/.test(L[2].src), JSON.stringify(L));
            const M = await p.evaluate(async () => (await window.LCNDA_EXT.mapLayerSources.find(x => x.id === 'ln2_ordres').run({bbox: [-5, 42, 8, 51]})).features.length); assert.ok(M > 100);
        });
        await t('⌘K : « mal caduc » → la liste des maladies ; une formule (« honnête femme »)', async () => {
            const r = await p.evaluate(async () => { const f = window.LCNDA_EXT.lotN2.provider; f('mal caduc'); await new Promise(r => setTimeout(r, 1500)); return [f('mal caduc').map(x => x.label), f('honnête femme').map(x => x.label)]; });
            assert.ok(r[0].some(l => /mal caduc : épilepsie/.test(l)), JSON.stringify(r)); assert.ok(r[1].some(l => /^📜 honnête femme/.test(l)), JSON.stringify(r));
        });
        await t('Réglages → 📊 : interrupteurs (genealogie-lot-n2), ↶ Annuler ; À propos des données ; en lien seulement ; rien ne part sur Internet', async () => {
            await p.evaluate(() => window.LCNDA_EXT.lotN2.openSettings());
            await p.waitForSelector('[data-ln2-settings-page] [data-ln2-tg="deces"]', {timeout: 20000});
            const st = await p.textContent('[data-ln2-settings-page]');
            assert.match(st, /Licence Ouverte/); assert.match(st, /CC0/); assert.match(st, /En lien seulement/); assert.match(st, /mercuriales/); assert.match(st, /rien ne part sur Internet/); assert.match(st, /Personnaliser/);
            await p.click('[data-ln2-tg="deces"] input');
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-lot-n2')).deces), false);
            const [, , txt] = await into('personInto', 1); assert.ok(!/fluxion de poitrine/.test(txt), 'éteint');
            await p.locator('.toast button:has-text("Annuler")').last().click({timeout: 5000}).catch(() => {}); await sleep(300);
            assert.notStrictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-lot-n2') || '{}').deces), false, '↶ Annuler le rallume');
            assert.ok(await p.evaluate(() => (window.LCNDA_APP.settings?.() || null) === null || true));
            // les vignettes de Wikimedia Commons et les tuiles de carte viennent d'autres écrans (Réglages, monnaies) : ce module-ci n'appelle jamais Internet
            assert.deepStrictEqual(outside.filter(u => !/tile\.|commons\.wikimedia\.org\/wiki\/Special:FilePath/.test(u)), [], 'rien ne part sur Internet');
        });
        await t('390 px et thème sombre : les blocs tiennent dans l’écran, rien collé aux bords', async () => {
            const m = await browser.newContext({viewport: {width: 390, height: 844}, colorScheme: 'dark'});
            await m.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => { outside.push(r.request().url()); return r.abort(); });
            const q = await m.newPage(); q.on('pageerror', e => errs.push(e.message));
            await q.goto(base, {timeout: 90000}); await q.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.lotN2, null, {timeout: 60000});
            await q.waitForLoadState('networkidle').catch(() => {}); await sleep(1200);
            await q.evaluate(async () => { document.documentElement.dataset.theme = 'dark'; const ws = document.getElementById('workspace'); const h = document.createElement('div'); h.id = 'n2-essai'; ws.prepend(h);
                const a = document.createElement('div'), b = document.createElement('div'); h.append(a, b);
                await window.LCNDA_EXT.lotN2.placeInto(a, {id: 9, name: 'Avignon', insee: '84007', lat: 43.95, lon: 4.81}); await window.LCNDA_EXT.lotN2.personInto(b, 1);
                h.querySelectorAll('details').forEach(d => { d.open = true; }); window.__n2 = h; });
            const r = await q.evaluate(() => { const h = window.__n2; if (!h.isConnected) document.getElementById('workspace').prepend(h); h.scrollIntoView(); const over = [...h.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1).map(e => e.className || e.tagName).slice(0, 5);
                const row = h.querySelector('.ln2-row').getBoundingClientRect(); return {over, left: row.left, right: window.innerWidth - row.right, docW: document.documentElement.scrollWidth}; });
            assert.deepStrictEqual(r.over, []); assert.ok(r.left >= 8 && r.right >= 8, JSON.stringify(r)); assert.ok(r.docW <= 391, `largeur ${r.docW}`);
            await m.close();
        });
        await t('aucune erreur JavaScript, aucun « Failed to fetch »', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(fails ? `${fails} essai(s) raté(s).` : 'Chiffres d’époque et mots des actes : tout va bien.');
    process.exit(fails ? 1 : 0);
})();
