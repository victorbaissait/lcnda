#!/usr/bin/env node
/* 🎖️ Soldats et noms (lot 8) : lib/lot8_soldats_noms.php, assets/js/heritage-lot8-soldats-noms.js, assets/css/lot8-soldats-noms.css,
 * assets/data/l8b-*.json(.gz) fabriqués par scripts/lot8-soldats-noms/. Les données livrées sont les VRAIES.
 *  1. données : présentes, tailles mesurées (< 15 Mo en tout), source, licence, nombre de lignes ; chaque citation a son lien ;
 *  2. calcul (Node) : « 63e RI », « 263e régiment d'infanterie », « 12ème R.I.T. »… lus dans un texte ; Pierre MAZAUD, du 63e RI,
 *     mort en 1916 : caserné à Limoges, Verdun ; prénoms du calendrier républicain (né le jour de son prénom) ; TROUVÉ sans
 *     parents → enfant trouvé ; Savoie 1860, Alsace 1871 et 1918, Algérie, naturalisé en 1930 → 1927 et Vichy ; personnages ;
 *  3. serveur : l8b_person (dossier militaire, bloc Poilu, parents, variantes), l8b_tree ;
 *  4. écran : bloc « 🎖️ Régiment, nom, nationalité » (caché quand il n'y a rien), ＋ Ajouter aux variantes (↶), Réglages
 *     (éteindre une partie, ↶), registres (Listes, monographie, dataSources, Où chercher).
 *   node tests/test-lot8-soldats-noms.js */
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
const L8 = require('../assets/js/heritage-lot8-soldats-noms.js');
const SHEET = require('../assets/js/app-tableur-engine.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DATA = path.join(root, 'assets/data');
const FILES = {regiments: 'l8b-regiments.json.gz', romans: 'l8b-personnages.json.gz', variantes: 'l8b-variantes.json.gz', prenoms: 'l8b-prenoms.json', trouves: 'l8b-enfants-trouves.json', nationalite: 'l8b-nationalite.json'};
const raw = k => { const b = fs.readFileSync(path.join(DATA, FILES[k])); return JSON.parse((FILES[k].endsWith('.gz') ? zlib.gunzipSync(b) : b).toString('utf8')); };
const memo = {};
const R = () => (memo.R ||= (() => { const f = raw('regiments'); const rows = L8.table(f); const byKey = new Map(rows.map(r => [`${r.k}:${r.n}`, r])); return {rows, byKey}; })());
const P = () => (memo.P ||= L8.prepPrenoms(raw('prenoms')));
const rep = (y, m, d) => SHEET.gregorianToRepublican(y, m, d);
const life = (p, extra = {}) => ({ok: true, person: {first: 'Pierre', last: 'MAZAUD', gender: 'male', ...p}, events: [], text: '', military: {}, poilu: {units: [], events: []}, parents: 2, variants: [], ...extra});

(async () => {
    await t('données : tailles mesurées (< 15 Mo en tout), source, licence, lignes ; chaque citation a son lien', async () => {
        let size = 0;
        for (const [k, f] of Object.entries(FILES)) {
            const s = fs.statSync(path.join(DATA, f)).size; size += s;
            const d = raw(k);
            assert.ok(d.source && d.licence && d.built && d.count > 0, k);
            console.log(`  ${f} : ${d.count} lignes, ${(s / 1e6).toFixed(2)} Mo — ${d.licence}`);
        }
        assert.ok(size < 15e6, `${size} octets`);
        console.log(`  (taille dans l’app : ${(size / 1e6).toFixed(2)} Mo)`);
        assert.match(raw('regiments').licence, /CC BY-SA 4\.0/); assert.match(raw('romans').licence, /CC0/); assert.match(raw('variantes').licence, /CC0/);
        for (const r of [...raw('nationalite').rows, ...raw('trouves').rules]) { assert.ok(r.src?.url?.startsWith('https://') && r.src.quote.length > 20, r.id); }
        assert.strictEqual(raw('prenoms').days.length, 360);
        assert.match(raw('nationalite').quotes.jorf.quote, /décrets portant naturalisation/);
    });

    await t('🎖️ le régiment lu dans un texte (63e RI, 263e régiment d’infanterie, 12ème R.I.T., 5e BCP, 42e de ligne) ; pas « classe 1912 »', async () => {
        const got = L8.regimentRefs('Incorporé au 63e RI le 10 octobre 1913, passé au 263e régiment d’infanterie le 2 mai 1915, puis 12ème R.I.T. ; 5e BCP ; classe 1912 ; 42e de ligne ; né le 1er janvier 1893');
        assert.deepStrictEqual(got.map(x => `${x.n} ${x.kind}`), ['63 RI', '263 RI', '12 RIT', '5 BCP', '42 RI']);
        assert.deepStrictEqual(L8.regimentRefs('né le 3 mars 1890, 2 enfants'), []);
        assert.strictEqual(L8.unitShort('RI', 63), '63ᵉ RI'); assert.strictEqual(L8.unitShort('RD', 1), '1ᵉʳ RD');
    });

    await t('🎖️ Pierre MAZAUD, 63e RI (bloc Poilu 1914-1916) : caserné à Limoges, Verdun en 1916 ; 🗺️ l’année de sa mort', async () => {
        const row = L8.regimentRow(R(), 'RI', 63);
        assert.ok(row, '63e RI présent'); assert.match(row.garrison + row.case1914, /Limoges/);
        const L = life({birth: 1893, death: 1916, mpf: 'yes'}, {poilu: {units: [{unit_name: '63e régiment d’infanterie', date_from: '1914-08-02', date_to: '1916-05-10'}], events: []},
            events: [{tag: 'DEAT', year: 1916, date: '1916-05-10', place: 'Verdun'}]});
        const refs = L8.regimentsOfLife(L); assert.deepStrictEqual([refs[0].kind, refs[0].n, refs[0].src, refs[0].from, refs[0].to], ['RI', 63, 'poilu', 1914, 1916]);
        const per = L8.servicePeriod(L, refs[0]); assert.deepStrictEqual([per.from, per.to], [1914, 1916]);
        const dur = L8.regimentDuring(row, per);
        assert.ok(dur.years.some(y => y.y === 1916 && /Verdun/.test(y.text)), JSON.stringify(dur.years));
        assert.ok(dur.battles.some(b => /Verdun/.test(b.label)), JSON.stringify(dur.battles));
        assert.ok(!dur.years.some(y => y.y < 1914 || y.y > 1916), 'seulement ses années');
        const f = L8.deathFront(L, R()); assert.ok(f && f.year === 1916 && /Verdun/.test(f.text));
        assert.strictEqual(L8.deathFront(life({birth: 1893, death: 1950}, {poilu: L.poilu}), R()), null, 'mort après la guerre : rien');
        assert.strictEqual(L8.battlePhrase('Bataille de Verdun'), 'à Verdun'); assert.strictEqual(L8.battlePhrase('Bataille de la Marne'), 'à la bataille de la Marne');
        console.log(`  (${R().rows.length} articles de régiments ; 63e RI : ${row.case1914 || row.garrison})`);
    });

    await t('🇫🇷 prénoms : né le jour de son prénom (calendrier républicain), un mois (Floréal), rien pour Pierre', async () => {
        const d1 = P().days.get('raisin')?.[0]; assert.deepStrictEqual([d1.mo, d1.d], [1, 1], '1er vendémiaire = Raisin');
        const g = SHEET.republicanToGregorian(3, 1, 1); // 1er vendémiaire an III
        const iso = `${g.y || g.year}-${String(g.m || g.month).padStart(2, '0')}-${String(g.d || g.day).padStart(2, '0')}`;
        const h = L8.revNames('Raisin', iso, P(), rep); assert.ok(h[0]?.sameDay && h[0].strong, JSON.stringify(h));
        const f = L8.revNames('Jean Floréal', '1796', P(), rep); assert.ok(f.some(x => x.name === 'Floréal' && x.month === 8 && x.strong), JSON.stringify(f));
        assert.deepStrictEqual(L8.revNames('Pierre', '1795', P(), rep), []);
    });

    await t('👶 TROUVÉ sans parents → enfant trouvé ; avec ses deux parents → rien ; nom d’un jour républicain né en l’an IV', async () => {
        const F = raw('trouves');
        const x = L8.foundlingOf(life({last: 'Trouvé', birth: 1840}, {parents: 0}), F, P()); assert.ok(x && x.rules[0].id === 'trouve', JSON.stringify(x));
        assert.strictEqual(L8.foundlingOf(life({last: 'Trouvé', birth: 1840}, {parents: 2}), F, P()), null);
        const day = [...P().days.values()].flat().find(d => /^[A-Z][a-z]+$/.test(d.name) && d.name.length > 5);
        const y = L8.foundlingOf(life({last: day.name, birth: 1796}, {parents: 0}), F, P()); assert.ok(y && y.rules.some(r => r.id === 'calendrier'), day.name);
        assert.ok(L8.foundlingOf(life({last: 'Martin', birth: 1850}, {parents: 0, text: 'enfant trouvé, de père et mère inconnus'}), F, P())?.general);
    });

    await t('🛂 Savoie 1860, Alsace 1871 et 1918, Algérie (Crémieux), naturalisé en 1930 → loi de 1927 et Vichy ; rien à Tulle', async () => {
        const N = raw('nationalite');
        const ids = L => L8.nationalityFor(L, N).map(x => x.rule.id);
        assert.deepStrictEqual(ids(life({birth: 1840, death: 1900}, {events: [{tag: 'BIRT', year: 1840, insee: '73065', place: 'Chambéry'}]})), ['savoie-nice-1860']);
        assert.deepStrictEqual(ids(life({birth: 1850, death: 1925}, {events: [{tag: 'BIRT', year: 1850, insee: '67482', place: 'Strasbourg'}, {tag: 'DEAT', year: 1925, insee: '67482'}]})), ['alsace-1871', 'alsace-1918']);
        assert.ok(ids(life({birth: 1860, death: 1930}, {events: [{tag: 'BIRT', year: 1860, place: 'Oran', country: 'Algérie'}]})).includes('cremieux-1870'));
        assert.deepStrictEqual(ids(life({birth: 1900, death: 1970}, {events: [{tag: 'BIRT', year: 1900, country: 'Italie', place: 'Turin'}, {tag: 'NATU', year: 1930, country: 'France', insee: '69123'}]})), ['naturalisation-1927', 'vichy-1940']);
        assert.deepStrictEqual(ids(life({birth: 1820, death: 1890}, {events: [{tag: 'BIRT', year: 1820, insee: '19272', place: 'Tulle'}]})), []);
        assert.ok(L8.maybeNaturalised(life({birth: 1880, death: 1950}, {events: [{tag: 'BIRT', year: 1880, country: 'Italie', place: 'Turin'}, {tag: 'DEAT', year: 1950, country: 'France', insee: '69123'}]})));
        assert.strictEqual(L8.maybeNaturalised(life({birth: 1880}, {events: [{tag: 'BIRT', year: 1880, country: 'France', insee: '19272'}]})), null);
    });

    await t('📚 personnages et 🔤 variantes (Wikidata)', async () => {
        const Ro = L8.prepRomans(raw('romans'));
        const r = L8.charactersOf(Ro, 'Chabert'); assert.ok(r.some(c => /Balzac/.test(c.a)), JSON.stringify(r.slice(0, 3)));
        console.log(`  (${Ro.n} personnages ; Chabert : ${r.map(c => `${c.ch} — ${c.w} (${c.a})`).slice(0, 1)})`);
        const V = L8.prepVariants(raw('variantes'));
        const k = V.names.findIndex(x => x[2].length >= 1 && /^[A-Z][a-z]+$/.test(x[0]));
        const name = V.names[k][0], got = L8.variantsOf(V, name);
        assert.ok(got.length >= 1 && got.every(v => v.name !== name && /^Q\d+$/.test(v.q)));
        assert.deepStrictEqual(L8.variantsOf(V, name, got.map(v => v.name)), [], 'ceux déjà notés ne reviennent pas');
        console.log(`  (${V.names.length} noms ; ${name} → ${got.map(v => v.name).slice(0, 4).join(', ')})`);
    });

    /* ─────────── serveur et écran ─────────── */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-l8b-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$mil = json_encode(['matricule' => '1234', 'classe_mobilisation' => '1913', 'corps_armee_active' => 'Incorporé au 63e RI le 27 novembre 1913', 'services_mutations' => 'Passé au 263e régiment d’infanterie le 4 mai 1915'], JSON_UNESCAPED_UNICODE);
$ins = $pdo->prepare("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start,military_data,mort_pour_la_france) VALUES(?,?,?,?,?,?,?,?)");
$ins->execute([1,'Pierre','MAZAUD','male','deceased',1,$mil,'yes']);
$ins->execute([2,'Marie','LACOMBE','female','deceased',0,'','unknown']);
$ins->execute([3,'Jean','Trouvé','male','deceased',0,'','unknown']);
$ins->execute([4,'Floréal','DURAND','male','deceased',0,'','unknown']);
$ins->execute([5,'Paul','Chabert','male','deceased',0,'','unknown']);
$ins->execute([6,'Louis','Lacombe','male','deceased',0,'','unknown']);
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code) VALUES(1,'Limoges','Haute-Vienne','France',45.8336,1.2611,'87085'),(2,'Verdun','Meuse','France',49.1598,5.3844,'55545'),(3,'Chambéry','Savoie','France',45.5646,5.9178,'73065'),(4,'Tulle','Corrèze','France',45.2670,1.7680,'19272')");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$ev = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id,address,description) VALUES('person',?,?,?,?,?,?,?,?)");
$ev->execute([1,$t('BIRT'),'1893',1893,'1893-03-02',1,'','']); $ev->execute([1,$t('DEAT'),'10 mai 1916',1916,'1916-05-10',2,'','Mort pour la France']);
$ev->execute([2,$t('BIRT'),'1840',1840,'1840',3,'','']); $ev->execute([2,$t('DEAT'),'1900',1900,'1900',3,'','']);
$ev->execute([3,$t('BIRT'),'1845',1845,'1845',4,'','']); $ev->execute([3,$t('DEAT'),'1900',1900,'1900',4,'','']);
$ev->execute([4,$t('BIRT'),'1796',1796,'1796-05-01',4,'','']);
$ev->execute([5,$t('BIRT'),'1850',1850,'1850',4,'','']);
$pdo->exec("INSERT INTO poilu_units(person_id,unit_name,date_from,date_to,position) VALUES(1,'63e régiment d''infanterie','1914-08-02','1916-05-10',0)");
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,2,NULL)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,1)");
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
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
        // index.php ne charge pas encore heritage-lot8-soldats-noms.js : on l'ajoute (comme le feront les balises)
        if (!(await p.evaluate(() => !!window.LCNDA_EXT?.soldatsNoms))) { await p.addStyleTag({url: base + 'assets/css/lot8-soldats-noms.css'}); await p.addScriptTag({url: base + 'assets/js/heritage-lot8-soldats-noms.js'}); }
        await p.waitForFunction(() => !!window.LCNDA_EXT?.soldatsNoms);
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);

        await t('serveur : l8b_person (dossier militaire, bloc Poilu, parents, variantes) ; l8b_tree', async () => {
            const d = await api('l8b_person', {id: 1});
            assert.strictEqual(d.ok, true, JSON.stringify(d)); assert.strictEqual(d.person.birth, 1893); assert.strictEqual(d.person.mpf, 'yes');
            assert.match(d.military.corps_armee_active, /63e RI/); assert.strictEqual(d.poilu.units[0].unit_name, '63e régiment d\'infanterie'); assert.strictEqual(d.parents, 1);
            assert.strictEqual((await api('l8b_person', {id: 3})).parents, 0);
            const tr = await api('l8b_tree');
            assert.ok(tr.surnames.some(([n, c]) => n === 'MAZAUD' && c === 1)); assert.ok(tr.born_rev.some(r => r[0] === 4 && r[4] === 1796 && r[5] === '1796-05-01'));
            assert.ok(tr.no_parents.some(r => r[0] === 3) && !tr.no_parents.some(r => r[0] === 1));
            assert.match((await api('l8b_person', {id: 999})).error || '', /introuvable/i);
        });

        await t('fiche : Pierre MAZAUD → « Le 63ᵉ RI, caserné à Limoges, a combattu… », l’année de sa mort, le CICR ; Marie LACOMBE à Chambéry : Savoie 1860', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('[data-l8b-person="1"] .l8b-row', {timeout: 30000});
            const txt = await p.textContent('[data-l8b-person="1"]');
            assert.match(txt, /Le 63ᵉ RI, caserné à Limoges/); assert.match(txt, /Wikipédia, CC BY-SA 4\.0/);
            assert.match(txt, /L’année de sa mort \(10 mai 1916\), son régiment, le 63ᵉ RI, combattait là : [^.]*Verdun/);
            assert.match(txt, /CICR/); assert.match(txt, /journal de marche/);
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 2; A.setModule('personnes'); });
            await p.waitForSelector('[data-l8b-person="2"] .l8b-row', {timeout: 30000});
            assert.match(await p.textContent('[data-l8b-person="2"]'), /En 1860, la Savoie et le comté de Nice deviennent français \(Chambéry\)/);
        });

        await t('fiche : Jean Trouvé sans parents → enfant trouvé (prudent) ; Floréal DURAND, né en 1796 → mois républicain ; Chabert → Balzac', async () => {
            const one = async id => p.evaluate(async i => { const h = document.createElement('div'); document.body.appendChild(h); await window.LCNDA_EXT.soldatsNoms.personInto(h, i); const x = h.textContent; h.remove(); return x; }, id);
            const a = await one(3); assert.match(a, /Son nom Trouvé est un de ceux que l’on donnait aux enfants trouvés\./); assert.match(a, /une piste, pas une preuve/);
            assert.match(await one(4), /Son prénom Floréal est un nom de mois du calendrier républicain/);
            assert.match(await one(5), /Un personnage de Honoré de Balzac s’appelle Chabert : Hyacinthe Chabert, dans « Le Colonel Chabert » \(1829\)/);
        });

        await t('🔤 « ＋ Ajouter aux variantes » écrit la variante, « ↶ Annuler » la retire', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 6; A.setModule('personnes'); });
            await p.waitForSelector('[data-l8b-person="6"] [data-l8b-addvar]', {timeout: 30000, state: 'attached'});
            await p.evaluate(() => { document.querySelector('[data-l8b-person="6"] [data-l8b-part="variantes"] details')?.setAttribute('open', ''); document.querySelector('[data-l8b-person="6"] [data-l8b-addvar]').click(); });
            await sleep(1200);
            let v = await api('l8b_person', {id: 6}); assert.strictEqual(v.variants.length, 1, JSON.stringify(v.variants)); assert.match(v.variants[0].source_note, /Wikidata/);
            await p.click('button:has-text("↶ Annuler")', {timeout: 5000}); await sleep(1200);
            v = await api('l8b_person', {id: 6}); assert.strictEqual(v.variants.length, 0);
        });

        await t('registres : Listes, monographie (régiments de Limoges), dataSources, Où chercher ; Réglages : éteindre « régiment » (↶)', async () => {
            const r = await p.evaluate(async () => {
                const E = window.LCNDA_EXT, L = E.dataLists.filter(d => d.id.startsWith('l8b_'));
                const reg = await L.find(d => d.id === 'l8b_regiments').load(), fam = await L.find(d => d.id === 'l8b_prenoms_famille').load();
                const mono = E.monographSections.find(s => s.id === 'l8b_regiments'), mh = document.createElement('div'); document.body.appendChild(mh);
                const ok = await mono.render({id: 1, name: 'Limoges', latitude: 45.83, longitude: 1.26}, mh, {}); const mt = mh.textContent; mh.remove();
                const host = document.createElement('div'); document.body.appendChild(host);
                await E.dataSources.find(d => d.id === 'l8b_regiment').run({person: {id: 1}}, host); const ds = host.textContent; host.remove();
                return {ids: L.map(d => d.id), reg: reg.length, fam: fam.map(x => x.name), mono: [ok, mt], ds, srcs: E.dataSources.filter(s => s.id.startsWith('l8b_')).length};
            });
            ['l8b_regiments', 'l8b_calendrier', 'l8b_prenoms_famille', 'l8b_personnages', 'l8b_noms_romans', 'l8b_nationalite'].forEach(id => assert.ok(r.ids.includes(id), id));
            assert.ok(r.reg > 300, String(r.reg)); assert.ok(r.fam.includes('Floréal'), JSON.stringify(r.fam));
            assert.strictEqual(r.mono[0], true); assert.match(r.mono[1], /63ᵉ RI/); assert.match(r.ds, /63ᵉ RI/); assert.ok(r.srcs >= 12);
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'lot8_soldats_noms'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-l8b-settings] table tbody tr', {timeout: 20000});
            assert.match(await p.textContent('[data-l8b-settings] table'), /CC BY-SA 4\.0/);
            await p.click('[data-l8b-tg="regiment"] input');
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-lot8-soldats-noms')).regiment), false);
            const txt = await p.evaluate(async () => { const h = document.createElement('div'); document.body.appendChild(h); await window.LCNDA_EXT.soldatsNoms.personInto(h, 1); const x = h.textContent; h.remove(); return x; });
            assert.ok(!/caserné à Limoges/.test(txt), 'plus de régiment');
            await p.click('button:has-text("↶ Annuler")', {timeout: 5000}); await sleep(300);
            assert.notStrictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-lot8-soldats-noms')).regiment), false);
        });

        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
