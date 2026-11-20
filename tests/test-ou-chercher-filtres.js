'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🌍 Où chercher ? — filtres par sorte de source (docs/design/ou-chercher-filtres.html) et petits défauts P1–P8 :
 *     node tests/test-ou-chercher-filtres.js        (captures : SHOTS=dossier node tests/test-ou-chercher-filtres.js)
 *  1. le moteur seul (Node) : « en Pologne », articles des départements, « aux États-Unis », règle « soldat » (P4 : un
 *     endroit de lot ne crée un profil que sans profil de règle, un profil ne lève l'exclusion par pays que pour un émigré,
 *     années des monuments aux morts, « officier » pour Polytechnique), « dans » / « croise » les années, Geneteka garde
 *     « Il a vécu en Pologne », un lieu « Pologne » rangé « France » ; les sortes (table + classeur), les filtres (l'un OU
 *     l'autre, pays, français), les écartés rangés par raison, les raccourcis de la fiche ;
 *  2. la vraie app (php -S + Playwright, sinon sauté), fiche fictive de Jean MAZAUD (soldat, prisonnier de guerre, né en 1777
 *     en Pologne, a vécu en Allemagne, mort en 1822 à Bourges, parents inconnus) : les 216 sites ont une sorte, les nombres
 *     (proposés, 🎖), pastilles + Filtrer ▾, compteurs « n sur m », messages quand la liste est vide (⚓, 📰 + Pologne),
 *     Écartés groupés, raccourci de la fiche sans écraser le choix retenu, « acte de décès » pour le Cher, 1440 / 390 / sombre,
 *     nom piégé jamais exécuté, aucune erreur JavaScript.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');
const {findPhp, devBundledPhp, phpRuntimeArgs} = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const C = require('../assets/js/app-ou-chercher-core.js');
const SO = require('../assets/js/app-ou-chercher-sortes.js');
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const XSS = '<img src=x onerror=window.__xss=1>';

(async () => {
    /* ═════ 1. le moteur ═════ */
    const mazaud = C.context({person: {id: 1, name: 'Jean MAZAUD', first: 'Jean', last: 'MAZAUD', gender: 'male', birth_year: 1777, death_year: 1822},
        events: [{tag: 'BIRT', year: 1777, place: 'Pologne', country: ''}, {tag: 'RESI', year: 1800, place: 'Allemagne', country: ''}, {tag: 'DEAT', year: 1822, place: 'Bourges', country: 'France', dept: {code: '18', name: 'Cher'}}],
        profiles: ['soldier', 'pow'], missing: ['parents']});
    await t('P1 : « Né en 1777 en Pologne » (un pays, pas une ville)', () => {
        assert.equal(C.bornText(mazaud), 'Né en 1777 en Pologne');
        const c = C.context({person: {gender: 'female', birth_year: 1880}, events: [{tag: 'BIRT', year: 1880, place: 'Canada'}]});
        assert.equal(C.bornText(c), 'Née en 1880 au Canada');
        const v = C.context({person: {gender: 'male', birth_year: 1880}, events: [{tag: 'BIRT', year: 1880, place: 'Torino', country: 'Italia'}]});
        assert.equal(C.bornText(v), 'Né en 1880 à Torino', 'une ville reste « à »');
    });
    await t('P2 : les articles des départements (« dans le Cher », « du Cher », « dans les Landes »…)', () => {
        const d = (code, name) => ({code, name});
        assert.equal(C.deptIn(d('18', 'Cher')), 'dans le Cher'); assert.equal(C.deptOf(d('18', 'Cher')), 'du Cher');
        assert.equal(C.deptIn(d('40', 'Landes')), 'dans les Landes'); assert.equal(C.deptOf(d('40', 'Landes')), 'des Landes');
        assert.equal(C.deptIn(d('19', 'Corrèze')), 'en Corrèze'); assert.equal(C.deptOf(d('19', 'Corrèze')), 'de la Corrèze');
        assert.equal(C.deptIn(d('01', 'Ain')), 'dans l’Ain'); assert.equal(C.deptOf(d('35', 'Ille-et-Vilaine')), 'd’Ille-et-Vilaine');
        assert.equal(C.deptIn(d('75', 'Paris')), 'à Paris'); assert.equal(C.deptIn(d('41', 'Loir-et-Cher')), 'en Loir-et-Cher');
        const c = C.context({person: {gender: 'male', birth_year: 1890}, events: [{tag: 'BIRT', year: 1890, place: 'Bourges', country: 'France', dept: {code: '18', name: 'Cher'}}]});
        assert.equal(C.bornText(c), 'Né en 1890 dans le Cher');
        const r = C.score({key: 'so7_cercle_dept', label: 'Cercle'}, c);
        assert.match(r.reasons[0], /cercle généalogique du Cher relèvent/);
        assert.doesNotMatch(r.reasons[0], /de Cher|en Cher/);
    });
    await t('P3 : « pas de lieu aux États-Unis » (et « aux Pays-Bas »)', () => {
        const fr = C.context({person: {gender: 'male', birth_year: 1890}, events: [{tag: 'BIRT', year: 1890, place: 'Tulle', country: 'France', dept: {code: '19', name: 'Corrèze'}}]});
        assert.equal(C.score({key: 'chroniclingamerica', label: 'CA'}, fr).out, 'pas de lieu aux États-Unis');
        assert.equal(C.score({key: 'delpher', label: 'Delpher'}, fr).out, 'pas de lieu aux Pays-Bas');
        assert.equal(C.countryIn('us'), 'aux États-Unis'); assert.equal(C.countryIn('it'), 'en Italie'); assert.equal(C.countryIn('ca'), 'au Canada');
    });
    await t('P4 : la règle « soldat » ne contourne plus la règle du site ni le pays', () => {
        const g = C.score({key: 'so5_memorial_gendarmes', label: 'Gendarmes', where: ['fiche', 'militaire']}, mazaud);
        assert.match(g.out, /seulement « gendarme, policier »/, g.out);
        const nara = C.score({key: 'so3_nara', label: 'NARA', where: ['fiche', 'emigration', 'militaire']}, mazaud);
        assert.equal(nara.out, 'pas de lieu aux États-Unis');
        assert.equal(C.score({key: 'so3_bac_lac', label: 'BAC', where: ['fiche', 'emigration', 'militaire']}, mazaud).out, 'pas de lieu au Canada');
        // un émigré sans lieu en Amérique : le profil lève l'exclusion par pays (c'est l'exemple du code)
        const emi = C.context({person: {gender: 'male', birth_year: 1880}, events: [{tag: 'BIRT', year: 1880, place: 'Torino', country: 'Italia'}], profiles: ['emigrant']});
        assert.equal(C.score({key: 'so2_ellis', label: 'Ellis'}, emi).out, '');
        // années des monuments aux morts ; Polytechnique : « officier » ou « savant »
        assert.match(C.score({key: 'so7_monumentsmorts', label: 'MonumentsMorts', where: ['lieu', 'fiche', 'militaire']}, mazaud).out, /n’est pas dans les années du site \(1870–…\)/);
        assert.match(C.score({key: 'so3_polytechnique', label: 'X', where: ['fiche', 'medecin', 'inventeur']}, mazaud).out, /seulement « officier \(armée\) »/);
        const off = C.context({person: {gender: 'male', birth_year: 1800}, events: [{tag: 'BIRT', year: 1800, place: 'Paris', country: 'France', dept: {code: '75', name: 'Paris'}}], profiles: ['soldier', 'officer']});
        assert.equal(C.score({key: 'so3_polytechnique', label: 'X'}, off).out, '');
        assert.equal(C.PROFILES.officer[1], 'officier (armée)');
    });
    await t('P5 : « sont dans » seulement si sa vie est dedans, sinon « croise »', () => {
        const r = C.score({key: 'so5_sainte_helene', label: 'SH', years: [1745, 1810]}, mazaud);
        assert.ok(r.reasons.some(x => x === 'Sa vie (1777–1822) croise les années du site (1745–1810)'), r.reasons.join(' | '));
        const inside = C.context({person: {gender: 'male', birth_year: 1780, death_year: 1805}, events: [{tag: 'BIRT', year: 1780, place: 'Tulle', country: 'France', dept: {code: '19', name: 'Corrèze'}}, {tag: 'DEAT', year: 1805, place: 'Tulle', country: 'France'}], profiles: ['soldier']});
        assert.ok(C.score({key: 'so5_sainte_helene', label: 'SH', years: [1745, 1810]}, inside).reasons.some(x => /sont dans celles du site/.test(x)));
    });
    await t('P6 : Geneteka garde « Il a vécu en Pologne » (pas « hors sujet »)', () => {
        const r = C.score({key: 'so3_geneteka', label: 'Geneteka', where: ['fiche', 'emigration']}, mazaud);
        assert.equal(r.out, ''); assert.equal(r.reasons[0], 'Il a vécu en Pologne');
    });
    await t('P7 : un lieu « Pologne » rangé « France » garde la Pologne (et pas de département)', () => {
        const c = C.context({person: {gender: 'male', birth_year: 1777}, events: [{tag: 'BIRT', year: 1777, place: 'Pologne', country: 'France', dept: {code: '18', name: 'Cher'}}]});
        assert.ok(c.countries.has('pl') && !c.countries.has('fr'), [...c.countries.keys()].join(','));
        assert.equal(c.depts.length, 0); assert.equal(c.birthCountry, 'pl');
        assert.ok(mazaud.countries.has('pl') && mazaud.countries.has('de') && mazaud.countries.has('fr'));
    });
    await t('sortes : table, classeur, plusieurs sortes, « autres » en dernier recours', () => {
        assert.deepEqual(SO.catsOf({key: 'leonore', label: 'Léonore'}), ['militaire', 'metiers']);
        assert.deepEqual(SO.catsOf({key: 'so3_nara', label: 'NARA'}), ['actes', 'emigration', 'militaire']);
        assert.deepEqual(SO.catsOf({key: 'wikipedia', label: 'Wikipédia'}), ['moteurs']);
        assert.deepEqual(SO.catsOf({key: 'so_gallica', label: 'Gallica'}), ['journaux', 'bibliotheques'], 'clé du lot 1 = alias');
        assert.deepEqual(SO.classify({key: 'x', label: 'Journaux anciens de Lyon', group: 'presse'}), ['journaux']);
        assert.ok(SO.classify({key: 'x', label: 'Registres paroissiaux de X'}).includes('actes'));
        assert.deepEqual(SO.catsOf({key: 'mon_site', label: 'Mon site', cats: ['journaux']}), ['journaux'], '« Mes sites » : sa sorte');
        assert.deepEqual(SO.catsOf({key: 'zzz', label: 'Rien de connu'}), ['autres']);
        assert.equal(SO.SORTS.filter(s => s.rare).map(s => s.icon).join(''), '🕯🧭🔎', 'les 3 rares derrière « ＋3 »');
        assert.equal(SO.SORT.emigration.icon, '🚢');
    });
    await t('filtres : plusieurs sortes = l’une ou l’autre ; pays ; en français ; compteurs', () => {
        const rows = ['gallica', 'so8_ddb_zeitungen', 'so8_szukajwarchiwach', 'leonore', 'geneanet', 'familysearch'].map(k => ({site: {key: k, label: k}}));
        assert.deepEqual(SO.applyFilters(rows, {cats: ['journaux', 'actes']}).map(r => r.site.key), ['gallica', 'so8_ddb_zeitungen', 'so8_szukajwarchiwach', 'geneanet', 'familysearch']);
        assert.deepEqual(SO.applyFilters(rows, {cats: ['journaux'], country: 'pl'}), []);
        assert.deepEqual(SO.applyFilters(rows, {country: 'pl'}).map(r => r.site.key), ['so8_szukajwarchiwach']);
        assert.deepEqual(SO.applyFilters(rows, {country: 'monde'}).map(r => r.site.key), ['geneanet', 'familysearch']);
        assert.deepEqual(SO.applyFilters(rows, {fr: true}).map(r => r.site.key), ['gallica', 'leonore', 'geneanet', 'familysearch'], 'Geneanet, FamilySearch (liste) ; pas les sites polonais ni allemands');
        const n = SO.counts(rows, {cats: ['journaux']});
        assert.equal(n.journaux, 2); assert.equal(n.actes, 3, 'chaque pastille compte avec les autres filtres, sans la sorte elle-même');
        assert.deepEqual(SO.sortRows(rows, 'az').map(r => r.site.key)[0], 'familysearch');
    });
    await t('écartés rangés par raison (même dans une autre langue : le moteur donne la sorte de raison)', () => {
        const r = C.rank(['so8_belgicapress', 'so8_eluxemburgensia', 'so2_shd_marins', 'so5_memorial_gendarmes'].map(k => ({key: k, label: k})), mazaud);
        const g = SO.outGroups(r.out);
        assert.deepEqual(g.map(x => x.id), ['country', 'profile']);
        assert.ok(r.out.every(o => o.kind), 'chaque écarté a sa sorte de raison');
        assert.equal(SO.outKind({why: 'peu utile pour cette fiche'}), 'low');
    });
    await t('raccourcis de la fiche : la sorte de son profil d’abord (🎖 pour un soldat), puis les plus fournies', () => {
        const list = ['so5_sainte_helene', 'gallica', 'geneanet', 'familysearch', 'so8_szukajwarchiwach'].map(k => ({site: {key: k, label: k}}));
        const s = SO.shortcuts(mazaud, list);
        assert.equal(s[0].id, 'militaire'); assert.ok(s[0].profile); assert.equal(s[1].id, 'actes'); assert.equal(s[1].n, 3);
        assert.ok(!s.some(x => x.id === 'deportation' || x.id === 'moteurs'), '🕯 jamais mise en avant');
    });

    /* ═════ 2. la vraie app ═════ */
    const phpPath = findPhp([devBundledPhp()]);
    let pw = null; try { pw = require('/opt/node22/lib/node_modules/playwright'); } catch (_) { try { pw = require('playwright'); } catch (__) { pw = null; } }
    if (!phpPath || !pw) { console.log('— PHP ou Playwright absent : partie navigateur sautée'); return done(); }
    const SHOTS = process.env.SHOTS || '';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-ouf-'));
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$x = getenv('XSS');
$pdo->prepare("INSERT INTO persons(id,first_name,last_name,gender,is_start,living_status,occupation) VALUES(1,'Jean','MAZAUD','male',1,'deceased','soldat'),(2,?,'MAZAUD','female',0,'deceased','')")->execute([$x]);
$pdo->prepare("INSERT INTO places(id,name,county,state,country,admin2_code) VALUES(1,'Pologne','','','',''),(2,'Allemagne','','','',''),(3,'Bourges','Cher','Centre-Val de Loire','France','18'),(4,?,'Corrèze','','France','19')")->execute([$x]);
$ev = $pdo->prepare('INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id,description) VALUES(?,?,?,?,?,?,?)');
foreach ([[1,'BIRT','1777',1777,1,''],[1,'RESI','1800',1800,2,'prisonnier de guerre'],[1,'DEAT','1822',1822,3,''],[2,'BIRT','1890',1890,4,'']] as [$pid,$tag,$dt,$y,$pl,$d]) { $ev->execute(['person',$pid,$t($tag),$dt,$y,$pl,$d]); }
echo 'ok';`], {cwd: appRoot, encoding: 'utf8', env: {...env, XSS}});
    if (seed.status !== 0 || !String(seed.stdout).includes('ok')) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], {cwd: appRoot, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    const browser = await pw.chromium.launch();
    const errors = [];
    try {
        const open = async (vp, dark) => {
            const ctx = await browser.newContext({viewport: vp, colorScheme: dark ? 'dark' : 'light'});
            await ctx.addInitScript(() => { try { localStorage.setItem('genealogie-last-route', '#tableau-de-bord'); } catch (_) {} });
            const p = await ctx.newPage();
            p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errors.push(m.text()); });
            await p.goto(base);
            await p.waitForFunction(() => window.LCNDA_APP?.state && window.LCNDA_EXT?.ouChercher && window.LCNDA_OUC_SORTES, null, {timeout: 30000});
            if (dark) await p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
            return {p, ctx};
        };
        const {p, ctx} = await open({width: 1440, height: 1000}, false);
        await t('registre : les 216 sites (et plus) ont tous une sorte connue', async () => {
            const r = await p.evaluate(() => { const S = window.LCNDA_OUC_SORTES; const l = window.LCNDA_EXT.ouChercher.allSites(); const n = {}; l.forEach(s => S.catsOf(s).forEach(c => { n[c] = (n[c] || 0) + 1; })); return {n: l.length, autres: l.filter(s => S.catsOf(s).includes('autres')).map(s => s.key), counts: n, multi: l.filter(s => S.catsOf(s).length > 1).length}; });
            assert.ok(r.n >= 216, String(r.n));
            assert.deepEqual(r.autres, [], 'aucun site sans sorte');
            assert.ok(r.counts.militaire >= 30 && r.counts.actes >= 45 && r.counts.journaux >= 15, JSON.stringify(r.counts));
            assert.ok(r.multi >= 50, `${r.multi} sites dans plusieurs sortes`);
            console.log('   sortes :', JSON.stringify(r.counts), `· ${r.multi} sites dans plusieurs sortes`);
        });
        await t('MAZAUD (soldat 1777–1822) : proposés et 🎖 après P4 ; gendarmes, NARA, BAC, Polytechnique, monuments écartés ; « acte de décès » (Cher)', async () => {
            const r = await p.evaluate(async () => { const O = window.LCNDA_EXT.ouChercher, S = window.LCNDA_OUC_SORTES; const s = O.suggest(await O.loadPerson(1, {fresh: true}), {free: true});
                return {n: s.list.length, mil: s.list.filter(x => S.catsOf(x.site).includes('militaire')).map(x => x.site.key), out: Object.fromEntries(s.out.map(o => [o.site.key, o.why])), ad: s.list.find(x => x.site.key === 'ouc_ad_18')?.reasons[0] || '',
                    sh: s.list.find(x => x.site.key === 'so5_sainte_helene')?.reasons || [], gen: s.list.find(x => x.site.key === 'so3_geneteka')?.reasons[0] || ''}; });
            console.log(`   MAZAUD : ${r.n} proposés, 🎖 ${r.mil.length} (${r.mil.join(', ')}) — la maquette disait 40 et 🎖 5 avec seulement les deux premiers points de P4`);
            assert.deepEqual(r.mil.sort(), ['leonore', 'so2_shd_officiers', 'so5_sainte_helene']);
            assert.ok(r.n >= 36 && r.n <= 42, String(r.n));
            for (const k of ['so5_memorial_gendarmes', 'so3_nara', 'so3_bac_lac', 'so3_polytechnique', 'so7_monumentsmorts']) assert.ok(r.out[k], `${k} écarté`);
            assert.equal(r.out.so3_nara, 'pas de lieu aux États-Unis');
            assert.match(r.ad, /son acte de décès à Bourges \(Cher\)/);
            assert.match(r.sh[0], /Né en 1777 en Pologne/);
            assert.equal(r.gen, 'Il a vécu en Pologne');
        });
        await t('page : pastilles + Filtrer ▾ sur le même état, « n sur m », Pologne dans les pastilles de contexte', async () => {
            await p.evaluate(() => { try { localStorage.removeItem('lcnda-listbar:recherche:ou_chercher'); } catch (_) {} window.LCNDA_EXT.ouChercher.openPerson(1); });
            await p.waitForSelector('.ouc-page .ouc-sorts [data-ouc-sort="militaire"]', {timeout: 20000});
            assert.match(await p.locator('.ouc-facts').innerText(), /Pologne/);
            const total = Number((await p.locator('[data-ouc-tab="todo"] .ouc-tab-long').innerText()).match(/\((\d+)\)/)[1]);
            await p.locator('.ouc-sorts [data-ouc-sort="militaire"]').click();
            await p.waitForSelector('.ouc-sorts [data-ouc-sort="militaire"].is-on');
            assert.match(await p.locator('[data-ouc-tab="todo"] .ouc-tab-long').innerText(), new RegExp(`Proposés \\(3 sur ${total}\\)`));
            assert.equal(await p.locator('.ouc-page .ouc-list .ouc-row').count(), 3);
            assert.match(await p.locator('.ouc-page .ouc-listbar .ui-listbar-active').innerText(), /🎖 Militaire/);
            // retenu pour toutes les personnes (barre H10)
            assert.deepEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('lcnda-listbar:recherche:ou_chercher')).f.cats), ['militaire']);
            // le menu Filtrer ▾ a la même case cochée, avec les nombres
            await p.locator('.ouc-page .ui-listbar-fbtn').click();
            assert.equal(await p.locator('.ui-listbar-menu input[data-lb-f="cats"][value="militaire"]').isChecked(), true);
            assert.ok(await p.locator('.ui-listbar-menu', {hasText: 'En français seulement'}).count());
            await p.locator('.ui-listbar-menu input[data-lb-f="cats"][value="journaux"]').check();
            await p.keyboard.press('Escape');
            await p.waitForFunction(() => document.querySelectorAll('.ouc-page .ouc-list .ouc-row').length === 5, null, {timeout: 10000}); // 3 🎖 + 2 📰 : l'un ou l'autre
            if (SHOTS) await p.screenshot({path: path.join(SHOTS, 'ouf2-page-1440.png')});
        });
        await t('liste vide : ⚓ (tous écartés, avec les raisons) et 📰 + Pologne (aucun dans le registre)', async () => {
            await p.evaluate(() => { const v = [...document.querySelectorAll('.ouc-page')][0]; void v; });
            await p.locator('.ouc-page .ui-listbar-clearall, .ouc-page .ouc-listbar [data-lb-clear]').first().click().catch(() => {});
            await p.evaluate(() => { localStorage.setItem('lcnda-listbar:recherche:ou_chercher', JSON.stringify({q: '', f: {cats: ['marins'], country: 'ses', free: true, fr: false}, sort: 'useful'})); window.LCNDA_EXT.ouChercher.openPerson(1); });
            await p.waitForSelector('.ouc-page .ouc-empty', {timeout: 20000});
            const txt = await p.locator('.ouc-page .ouc-empty').innerText();
            assert.match(txt, /Aucun site ⚓ Marins et colonies pour Jean MAZAUD \(1777–1822\)/);
            assert.match(txt, /sites de cette sorte sont écartés/); assert.match(txt, /seulement « marin »/); assert.match(txt, /Il était marin \? Le dire sur sa fiche/);
            if (SHOTS) await p.screenshot({path: path.join(SHOTS, 'ouf2-vide-marins-1440.png')});
            await p.evaluate(() => { localStorage.setItem('lcnda-listbar:recherche:ou_chercher', JSON.stringify({q: '', f: {cats: ['journaux'], country: 'pl', free: true, fr: false}, sort: 'useful'})); window.LCNDA_EXT.ouChercher.openPerson(1); });
            await p.waitForFunction(() => /pour ce pays/.test(document.querySelector('.ouc-page .ouc-empty')?.innerText || ''), null, {timeout: 20000});
            const t2 = await p.locator('.ouc-page .ouc-empty').innerText();
            assert.match(t2, /Aucun site 📰 Journaux pour ce pays \(Pologne\)/); assert.match(t2, /Pour ses autres pays : \d+ proposés/); assert.match(t2, /Ajouter un site à moi/);
            await p.locator('.ouc-page [data-ouc-country="ses"]').click();
            await p.waitForSelector('.ouc-page .ouc-list .ouc-row', {timeout: 10000});
            // l'onglet Écartés, groupé par raison
            await p.locator('[data-ouc-tab="out"]').click();
            await p.waitForSelector('.ouc-page .ouc-outg h4');
            assert.match(await p.locator('.ouc-page .ouc-outg h4').first().innerText(), /Pas de lieu dans ce pays · \d+/);
            assert.match(await p.locator('.ouc-page .ouc-out').first().innerText(), /pas de lieu aux États-Unis|pas de lieu en Belgique/);
            if (SHOTS) await p.screenshot({path: path.join(SHOTS, 'ouf2-ecartes-1440.png')});
        });
        await t('fiche : raccourcis « 🎖 Tout le militaire » ; le raccourci n’écrase pas le choix retenu', async () => {
            await p.evaluate(() => { localStorage.setItem('lcnda-listbar:recherche:ou_chercher', JSON.stringify({q: '', f: {cats: ['journaux'], country: 'ses', free: true, fr: false}, sort: 'useful'})); window.LCNDA_APP.state.currentPersonId = 1; window.LCNDA_APP.setModule('personnes'); });
            await p.waitForSelector('[data-ouc-block] .ouc-shortcuts [data-ouc-short]', {timeout: 20000});
            const first = p.locator('[data-ouc-block] .ouc-shortcuts [data-ouc-short]').first();
            assert.match(await first.innerText(), /🎖 Tout le militaire\s*3/); assert.equal(await first.getAttribute('data-ouc-short'), 'militaire');
            if (SHOTS) { await p.locator('[data-ouc-block]').scrollIntoViewIfNeeded(); await p.screenshot({path: path.join(SHOTS, 'ouf2-fiche-raccourcis-1440.png')}); }
            await first.click();
            await p.waitForSelector('.ouc-page .ouc-from', {timeout: 20000});
            assert.equal(await p.locator('.ouc-page .ouc-list .ouc-row').count(), 3);
            assert.deepEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('lcnda-listbar:recherche:ou_chercher')).f.cats), ['journaux'], 'le choix retenu reste « 📰 »');
            await p.locator('.ouc-page [data-ouc-from-off]').click();
            await p.waitForSelector('.ouc-sorts [data-ouc-sort="journaux"].is-on');
        });
        await t('nom et lieu piégés : jamais exécutés', async () => {
            await p.evaluate(() => window.LCNDA_EXT.ouChercher.openPerson(2));
            await p.waitForSelector('.ouc-page .ouc-sorts', {timeout: 20000});
            await p.locator('.ouc-sorts [data-ouc-sort="marins"]').click();
            await p.waitForTimeout(300);
            assert.equal(await p.evaluate(() => window.__xss), undefined);
        });
        await ctx.close();
        for (const [name, vp, dark] of [['390', {width: 390, height: 860}, false], ['sombre', {width: 1440, height: 1000}, true]]) {
            await t(`page ${name} : pastilles sur une ligne qui défile (390), pas de défilement horizontal`, async () => {
                const o = await open(vp, dark);
                await o.p.evaluate(() => { localStorage.setItem('lcnda-listbar:recherche:ou_chercher', JSON.stringify({q: '', f: {cats: ['militaire'], country: 'ses', free: true, fr: false}, sort: 'useful'})); window.LCNDA_EXT.ouChercher.openPerson(1); });
                await o.p.waitForSelector('.ouc-page .ouc-list .ouc-row', {timeout: 20000});
                assert.equal(await o.p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false, 'pas de défilement horizontal');
                if (name === '390') { assert.equal(await o.p.locator('.ouc-sorts').evaluate(el => getComputedStyle(el).flexWrap), 'nowrap'); assert.equal(await o.p.locator('[data-ouc-tab="todo"] .ouc-tab-long').isVisible(), false); }
                if (SHOTS) await o.p.screenshot({path: path.join(SHOTS, `ouf2-page-${name}.png`)});
                await o.p.evaluate(() => { window.LCNDA_APP.state.currentPersonId = 1; window.LCNDA_APP.setModule('personnes'); });
                await o.p.waitForSelector('[data-ouc-block] .ouc-shortcuts', {timeout: 20000});
                if (SHOTS) { await o.p.locator('[data-ouc-block]').scrollIntoViewIfNeeded(); await o.p.screenshot({path: path.join(SHOTS, `ouf2-fiche-${name}.png`)}); }
                assert.equal(await o.p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false);
                await o.ctx.close();
            });
        }
        await t('aucune erreur JavaScript', () => assert.deepEqual(errors, []));
    } finally {
        await browser.close();
        proc.kill();
        fs.rmSync(tmp, {recursive: true, force: true});
    }
    done();
})();
function done() {
    if (failed) { console.error(`\n${failed} échec(s)`); process.exit(1); }
    console.log('\nTout est bon.');
}
