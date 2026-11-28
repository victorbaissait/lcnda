#!/usr/bin/env node
/* ⚖️ Ce que la loi disait · 🎩 Les gens de pouvoir · 🏛️ Sous l'Ancien Régime
 * (assets/js/heritage-droit-pouvoir.js, assets/data/dp-*.json(.gz), lib/droit_pouvoir.php ; scripts/droit-pouvoir/).
 *  1. données : tailles, licences, chaque règle a sa phrase source et un lien ; le calcul (accord des parents, service militaire,
 *     école, chefs de l'État, préfet, évêque, Ancien Régime d'une commune, où chercher) ;
 *  2. écran (base temporaire, php -S router.php) : fiche d'une personne (⚖️ et 🎩), fiche d'un village (🏛️), monographie (registre),
 *     Où chercher (crochet afterRedraw), convertisseur (onglet), Réglages (une partie s'éteint, ↶), registres dataLists / dataSources.
 *   node tests/test-droit-pouvoir.js */
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
const DP = require('../assets/js/heritage-droit-pouvoir.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const D = f => path.join(root, 'assets/data', f);
const gz = f => JSON.parse(zlib.gunzipSync(fs.readFileSync(D(f))));

(async () => {
    const L = JSON.parse(fs.readFileSync(D('dp-lois.json'), 'utf8'));
    const P = gz('dp-pouvoir.json.gz'), AR = gz('dp-ancien-regime.json.gz');
    const MI = fs.existsSync(D('dp-maires-index.json')) ? JSON.parse(fs.readFileSync(D('dp-maires-index.json'), 'utf8')) : null;

    /* ═════════ 1. les données et le calcul ═════════ */
    await t('données : tailles (tout < 15 Mo), licences, sources', async () => {
        const files = fs.readdirSync(D('')).filter(f => /^dp-/.test(f));
        const total = files.reduce((a, f) => a + fs.statSync(D(f)).size, 0);
        assert.ok(total < 15e6, `${total} octets`);
        assert.match(L.licence, /CC BY-SA 4\.0/); assert.strictEqual(P.licence, 'CC0 1.0'); assert.strictEqual(AR.licence, 'CC BY-SA 4.0');
        assert.match(AR.attribution, /Gay, P\. E\. Gobbi et M\. Goñi/); assert.match(AR.url, /github\.com\/t-fressin\/atlas-ancien-regime/);
        if (MI) assert.strictEqual(MI.licence, 'CC0 1.0');
    });
    await t('lois : chaque règle a ses dates, sa phrase exacte et un lien vers la section de Wikipédia', async () => {
        assert.ok(L.rows.length >= 60, String(L.rows.length));
        for (const r of L.rows) {
            assert.ok(r.title && r.rule && r.theme, r.id);
            assert.ok(r.src && r.src.quote.length > 20, r.id); assert.match(r.src.url, /^https:\/\/fr\.wikipedia\.org\/wiki\//, r.id);
            assert.ok(DP.dnum(r.from) !== null || r.from === '', r.id); if (r.to) assert.ok(DP.dnum(r.to) > (DP.dnum(r.from) ?? -1e9), r.id);
        }
        assert.ok(L.rows.some(r => r.src.refs.some(x => /legifrance\.gouv\.fr/.test(x.url))), 'au moins un lien Légifrance');
        const ids = new Set(L.rows.map(r => r.id)); assert.strictEqual(ids.size, L.rows.length, 'identifiants uniques');
        for (const k of ['code-civil-1804-consent', 'consent-1907', 'majorite-1974', 'divorce-1816', 'divorce-1884', 'divorce-1975', 'conscription-1798', 'militaire-1872', 'militaire-1905', 'ferry-1882', 'etat-civil-1792', 'vote-femmes-1944', 'femme-1938', 'femme-1965', 'nationalite-1889', 'naturels-1972', 'nivose-an-ii', 'am-1871']) assert.ok(ids.has(k), k);
        assert.match(L.rows.find(r => r.id === 'code-civil-1804-consent').src.quote, /21 ans pour les filles et 25 ans pour les garçons/);
    });
    await t('calcul : accord des parents, âge minimum, divorce, majorité à une date', async () => {
        const at = (k, y, who) => DP.calcAt(L, k, y * 10000 + 701, who);
        assert.deepStrictEqual([at('consent', 1850, {}).calc.m, at('consent', 1850, {}).calc.f], [25, 21]);
        assert.deepStrictEqual([at('consent', 1910, {}).calc.m, at('consent', 1910, {}).calc.f], [21, 21]);
        assert.strictEqual(at('consent', 1980, {}).calc.m, 18); assert.strictEqual(at('consent', 1700, {}).calc.m, 30);
        assert.strictEqual(at('nubile', 1850, {}).calc.f, 15); assert.strictEqual(at('nubile', 2010, {}).calc.f, 18);
        assert.strictEqual(at('divorce', 1850, {}).calc.allowed, false); assert.strictEqual(at('divorce', 1900, {}).calc.allowed, true);
        assert.strictEqual(at('majority', 1960, {}).calc.age, 21); assert.strictEqual(at('majority', 1980, {}).calc.age, 18);
        assert.strictEqual(at('school', 1890, {}).calc.to, 13); assert.strictEqual(at('school', 1950, {}).calc.to, 14);
        assert.ok(!DP.lawsAt(L, 18800701, {am: false}).some(r => r.region === 'am')); assert.ok(DP.lawsAt(L, 18800701, {am: true}).some(r => r.id === 'am-1871'));
        assert.ok(!DP.lawsAt(L, 17000701, {}).some(r => r.id === 'normandie-1666')); assert.ok(DP.lawsAt(L, 17000701, {province: 'Normandie'}).some(r => r.id === 'normandie-1666'));
        const s = DP.yearSummary(L, 1850, {sex: 'm'}); assert.strictEqual(s.military.id, 'militaire-1832');
    });
    await t('calcul : ce que la loi disait pour Jean MAZAUD (1830-1890) et Marie LACOMBE (1880)', async () => {
        const jean = DP.personLaws(L, {sex: 'm', birth: 18300312, death: 18900101, events: [{kind: 'birth', d: 18300312}, {kind: 'marriage', d: 18520501}]});
        const mar = jean.lines.find(l => l.kind === 'marriage');
        assert.ok(mar && /à 22 ans, il fallait l’accord de ses parents \(jusqu’à 25 ans pour un homme\)/.test(mar.text), mar && mar.text);
        assert.match(mar.text, /le divorce était interdit/);
        const mil = jean.lines.find(l => l.kind === 'military'); assert.ok(mil && /1850/.test(mil.text) && /7 ans/.test(mil.text), mil && mil.text);
        assert.ok(!jean.lines.some(l => l.kind === 'school'), 'pas d’école obligatoire en 1836');
        assert.ok(jean.life.some(r => r.id === 'vote-hommes-1848') && !jean.life.some(r => r.sex === 'f'));
        const marie = DP.personLaws(L, {sex: 'f', birth: 18800401, events: [{kind: 'birth', d: 18800401}, {kind: 'marriage', d: 18970601}]});
        assert.match(marie.lines.find(l => l.kind === 'school').text, /6 à 13 ans/);
        assert.ok(!marie.lines.some(l => l.kind === 'military'));
        assert.match(marie.lines.find(l => l.kind === 'marriage').text, /à 17 ans, il fallait l’accord de ses parents \(jusqu’à 21 ans pour une femme\)/);
        assert.ok(marie.lines.some(l => l.kind === 'vote' && /1944/.test(l.text)));
        const enfant = DP.personLaws(L, {sex: 'f', birth: 18400101, events: [{kind: 'marriage', d: 18520101}]});
        assert.match(enfant.lines.find(l => l.kind === 'marriage').text, /moins que l’âge minimum \(15 ans\)/);
    });
    await t('pouvoir : chefs de l’État, préfet de la Corrèze, évêques, maires (Wikidata)', async () => {
        assert.ok(P.france.length > 60);
        assert.match(DP.headsFranceAt(P, 18350701)[0].n, /Louis-Philippe/);
        assert.match(DP.headsFranceAt(P, 18100701)[0].n, /Napoléon/);
        assert.match(DP.headsFranceAt(P, 17940701)[0].n, /Convention/); assert.ok(DP.headsFranceAt(P, 17940701)[0].regime);
        assert.match(DP.headsFranceAt(P, 19000701)[0].n, /Loubet/);
        assert.ok(!P.france.some(h => h.q === 'Q49765'), 'Louis XVII écarté');
        const pf = DP.prefetAt(P, '19', 18500701); assert.ok(pf && pf.list.length && /Corrèze/.test(pf.pos), JSON.stringify(pf));
        assert.ok(Object.keys(P.prefets).length >= 95);
        const nb = Object.values(P.dioceses).reduce((a, d) => a + d.h.length, 0); assert.ok(nb > 3000, String(nb));
        const b = DP.bishopsAt(P, AR, '19272', '19', 18600701); assert.ok(b.length && /Tulle/.test(b[0].dio.n), JSON.stringify(b.map(x => x.dio.n)));
        const b0 = DP.bishopsAt(P, AR, '19272', '19', 17500701); assert.ok(b0.length && /Tulle/.test(b0[0].dio.n), 'Tulle en 1750 (diocèse de 1789)');
        assert.deepStrictEqual(DP.bishopsAt(P, AR, '19272', '19', 18100701), [], 'pas de diocèse entre 1790 et 1822');
        assert.ok(DP.headsWorldAt(P, 56, 19000701).length, 'Belgique en 1900');
        assert.deepStrictEqual(DP.holdersAt([['A', 'Q1', '1800-01-01', ''], ['B', 'Q2', '1810-05-01', '1820-01-01']], 18050101).map(h => h[0]), ['A'], 'fin = début du suivant');
        assert.deepStrictEqual(DP.holdersAt([['A', 'Q1', '1800-01-01', '']], 19000101), [], 'le dernier sans fin, ancien : non');
        if (MI) { assert.ok(Object.keys(MI.deps).length > 80); const M = gz('dp-maires-19.json.gz'); assert.ok(DP.maireAt(M, '19272', 20100701).length, 'maire de Tulle en 2010'); }
    });
    await t('Ancien Régime : Tulle, Strasbourg ; où chercher (série B, E, C)', async () => {
        const a = DP.arOf(AR, '19272');
        assert.strictEqual(a.commune, 'Tulle'); assert.strictEqual(a.bailliage.n, 'Sénéchaussée de Tulle'); assert.strictEqual(a.generalite.n, 'Limoges');
        assert.strictEqual(a.diocese.n, 'Tulle'); assert.strictEqual(a.province.n, 'Limousin'); assert.strictEqual(a.parlement.n, 'Parlement de Bordeaux');
        assert.ok(Object.keys(AR.c).length > 34000);
        const tips = DP.arTips(AR, L, '19272');
        assert.match(tips.find(x => x.kind === 'b').text, /Sénéchaussée de Tulle.*série B des archives départementales de Corrèze/);
        assert.match(tips.find(x => x.kind === 'e').text, /série E/); assert.ok(tips.every(x => x.archive && /wikipedia/.test(x.archive.src.url)));
        const s = DP.arOf(AR, '67482'); assert.ok(s && s.province.n === 'Alsace', JSON.stringify(s && s.province));
        assert.strictEqual(DP.arOf(AR, '99999'), null);
    });

    /* ═════════ 2. l'écran ═════════ */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-dp-'));
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','MAZAUD','male','deceased',1),(2,'Marie','LACOMBE','female','deceased',0),(3,'Paul','DURAND','male','deceased',0)");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code) VALUES(1,'Tulle','Corrèze','France',45.2658,1.7723,'19272'),(2,'Brive-la-Gaillarde','Corrèze','France',45.1589,1.5321,'')");
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,1,2)");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,family_id,event_type_id,date_text,year,sort_date,place_id) VALUES(?,?,?,?,?,?,?,?)");
$ins->execute(['person',1,null,$t('BIRT'),'12 mars 1830',1830,'1830-03-12',1]); $ins->execute(['person',1,null,$t('DEAT'),'1890',1890,'1890-01-01',1]);
$ins->execute(['person',2,null,$t('BIRT'),'1835',1835,'1835-06-01',2]);
$ins->execute(['family',null,1,$t('MARR'),'1 mai 1852',1852,'1852-05-01',1]);
$ins->execute(['person',3,null,$t('BIRT'),'1760',1760,'1760-02-01',1]); $ins->execute(['person',3,null,$t('DEAT'),'1788',1788,'1788-02-01',2]);
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        await t('serveur : dp_places donne le code INSEE (rangé dans le lieu, ou retrouvé par le nom)', async () => {
            const r = await (await fetch(base + 'api.php?action=dp_places&ids=1,2')).json();
            assert.strictEqual(r.places.find(x => x.id === 1).insee, '19272'); assert.strictEqual(r.places.find(x => x.id === 1).dep, '19');
            const b = r.places.find(x => x.id === 2); assert.strictEqual(b.dep, '19', JSON.stringify(b));
            const n = await (await fetch(base + 'api.php?action=dp_places&name=Tulle&county=Corr%C3%A8ze')).json(); assert.strictEqual(n.places[0].insee, '19272');
        });
        const ctxB = await browser.newContext({viewport: {width: 1440, height: 900}});
        await ctxB.route(/commons\.wikimedia\.org|wikipedia\.org|wikidata\.org|tile|openstreetmap/, r => r.abort()); // pas d'Internet dans l'essai
        const p = await ctxB.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultPersonBlocks, null, {timeout: 30000});
        // index.php ne charge pas encore ce fichier : on l'ajoute (comme le feront les balises)
        for (const f of ['heritage-monde-contexte.js']) if (!(await p.evaluate(n => !!document.querySelector(`script[src*="${n}"]`), f))) await p.addScriptTag({url: base + 'assets/js/' + f});
        if (!(await p.evaluate(() => !!window.LCNDA_EXT?.droitPouvoir))) { await p.addStyleTag({url: base + 'assets/css/droit-pouvoir.css'}); await p.addScriptTag({url: base + 'assets/js/heritage-droit-pouvoir.js'}); }
        await p.evaluate(() => { const B = window.LCNDA_APP.defaultPersonBlocks; if (!B.some(b => b[0] === 'droit_lois')) B.push(['droit_lois', '⚖️'], ['droit_pouvoir', '🎩']); });
        const toastWith = async re => p.waitForFunction(s => [...document.querySelectorAll('.ui-toast, .toast')].some(x => new RegExp(s).test(x.textContent)), re.source, {timeout: 10000});

        await t('registres : dataLists, dataSources, monographSections, autrefoisTabs ; les lignes ont les champs annoncés', async () => {
            const r = await p.evaluate(async () => {
                const E = window.LCNDA_EXT, out = {};
                for (const id of ['dp_lois', 'dp_chefs_etat', 'dp_prefets', 'dp_eveques', 'dp_ancien_regime', 'dp_maires']) {
                    const d = E.dataLists.find(x => x.id === id); const rows = await d.load();
                    out[id] = {n: rows.length, missing: rows.length ? d.fields.map(f => f.key).filter(k => !(k in rows[0])) : [], src: d.source};
                }
                out.ds = E.dataSources.filter(d => /^dp_/.test(d.id)).length; out.ms = E.monographSections.filter(s => /^(ancien_regime|gens_de_pouvoir)$/.test(s.id)).length;
                out.tab = !!E.autrefoisTabs.find(x => x.id === 'loi');
                return out;
            });
            for (const id of ['dp_lois', 'dp_chefs_etat', 'dp_prefets', 'dp_eveques', 'dp_ancien_regime']) { assert.ok(r[id].n > 50, id + ' ' + r[id].n); assert.deepStrictEqual(r[id].missing, [], id); }
            assert.deepStrictEqual(r.dp_maires.missing, []);
            assert.strictEqual(r.ds, 5); assert.strictEqual(r.ms, 2); assert.ok(r.tab);
        });
        await t('fiche de Jean MAZAUD : ⚖️ son mariage (accord des parents) et son service militaire ; 🎩 Louis-Philippe et le préfet de la Corrèze', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('[data-dp-lois="1"] .dp-lines', {timeout: 30000});
            const law = (await p.textContent('[data-dp-lois="1"]')).replace(/\s+/g, ' ');
            assert.match(law, /Son mariage \(1852\) : à 22 ans, il fallait l’accord de ses parents/); assert.match(law, /À 20 ans \(1850\)/);
            assert.ok(await p.$eval('[data-dp-lois="1"] a.dp-src-link', a => /^https:\/\/fr\.wikipedia\.org\/wiki\//.test(a.href) && a.target === '_blank' && /noopener/.test(a.rel)));
            await p.waitForSelector('[data-dp-pouvoir="1"] .dp-lines', {timeout: 30000});
            const pw = (await p.textContent('[data-dp-pouvoir="1"]')).replace(/\s+/g, ' ');
            assert.match(pw, /À sa naissance \(1830\)/); assert.match(pw, /préfet de la Corrèze/); assert.match(pw, /Louis-Philippe/); assert.match(pw, /Wikidata \(CC0\)/);
            assert.ok(await p.$eval('[data-dp-pouvoir="1"] a.dp-src-link', a => /wikidata\.org\/wiki\/Q\d+/.test(a.href)));
        });
        await t('fiche de Paul DURAND (1760-1788) : les gens de pouvoir sous l’Ancien Régime (roi, évêque de 1789)', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 3; A.setModule('personnes'); });
            await p.waitForSelector('[data-dp-pouvoir="3"] .dp-lines', {timeout: 30000});
            const pw = (await p.textContent('[data-dp-pouvoir="3"]')).replace(/\s+/g, ' ');
            assert.match(pw, /Louis XV/); assert.match(pw, /évêque \(diocèse de Tulle\)/);
        });
        await t('fiche d’un village (Tulle) : 🏛️ Sous l’Ancien Régime, le détail et où chercher', async () => {
            const key = await p.evaluate(async () => (await window.LCNDA_APP.api('villages', {q: 'Tulle'})).villages[0].key);
            await p.evaluate(k => { const A = window.LCNDA_APP; A.state.listType = 'villages'; A.state.hVillage = k; A.setModule('listes'); }, key);
            await p.waitForSelector('.h-village [data-dp-part="ar"] .dp-more', {timeout: 30000});
            const txt = (await p.textContent('[data-dp-part="ar"]')).replace(/\s+/g, ' ');
            assert.match(txt, /En 1789, Tulle relevait de/); assert.match(txt, /Sénéchaussée de Tulle/); assert.match(txt, /Parlement de Bordeaux/);
            assert.match(txt, /série B/); assert.match(txt, /CC BY-SA 4\.0/); assert.match(txt, /élection, la coutume/);
        });
        await t('monographie (registre) et Où chercher (crochet afterRedraw) et données à la demande', async () => {
            const r = await p.evaluate(async () => {
                const E = window.LCNDA_EXT, A = window.LCNDA_APP;
                const h1 = document.createElement('div'), h2 = document.createElement('div'), h3 = document.createElement('div'), body = document.createElement('div'), h4 = document.createElement('div');
                document.body.append(h1, h2, h3, body, h4);
                const place = {id: 1, name: 'Tulle', county: 'Corrèze', latitude: 45.2658, longitude: 1.7723};
                const ok1 = await E.monographSections.find(s => s.id === 'ancien_regime').render(place, h1, {village: async () => null, years: async () => null});
                const ok2 = await E.monographSections.find(s => s.id === 'gens_de_pouvoir').render(place, h2, {village: async () => null, years: async () => ({from: 1830, to: 1890})});
                const detail = await A.api('person', {id: 3});
                E.ouChercher.afterRedraw.forEach(fn => fn({data: {detail}}, body));
                for (let i = 0; i < 100 && !body.querySelector('[data-dp-ouc]'); i++) await new Promise(r => setTimeout(r, 100));
                await E.dataSources.find(d => d.id === 'dp_lois_personne').run({person: {id: 2}}, h3);
                E.autrefoisTabs.find(x => x.id === 'loi').mount(h4, {year: 1850});
                for (let i = 0; i < 50 && !h4.querySelector('.dp-laws'); i++) await new Promise(r => setTimeout(r, 100));
                return {ok1, ok2, t1: h1.textContent, t2: h2.textContent, ouc: body.textContent, t3: h3.textContent, t4: h4.textContent};
            });
            assert.ok(r.ok1 && /Sénéchaussée de Tulle/.test(r.t1)); assert.ok(r.ok2 && /préfet|Préfet/.test(r.t2), r.t2.slice(0, 200));
            assert.match(r.ouc, /Archives d’Ancien Régime/); assert.match(r.ouc, /série B des archives départementales de Corrèze/);
            assert.match(r.t3, /Son mariage \(1852\)/); assert.match(r.t3, /jusqu’à 21 ans pour une femme/);
            assert.match(r.t4, /Accord des parents pour se marier : jusqu’à 25 ans \(hommes\), 21 ans \(femmes\)/);
        });
        await t('Réglages : « ⚖️ Droit et pouvoir » ; éteindre la fiche « Ce que la loi disait », ↶ Annuler', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'droit_pouvoir'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-dp-settings] [data-dp-tg="person_lois"] input', {timeout: 30000});
            const txt = await p.textContent('[data-dp-settings]'); assert.match(txt, /CC0 1\.0/); assert.match(txt, /CC BY-SA 4\.0/); assert.match(txt, /Ce qui manque/);
            await p.uncheck('[data-dp-tg="person_lois"] input');
            assert.strictEqual(JSON.parse(await p.evaluate(() => localStorage.getItem('genealogie-droit-pouvoir'))).person_lois, false);
            await toastWith(/Partie masquée/);
            await p.click('.ui-toast button:has-text("Annuler"), .toast button:has-text("Annuler")');
            await p.waitForFunction(() => JSON.parse(localStorage.getItem('genealogie-droit-pouvoir')).person_lois === true, null, {timeout: 10000});
        });
        assert.deepStrictEqual(errs.filter(e => !/net::|Failed to fetch|NetworkError/.test(e)), []);
    } catch (e) { fails++; console.log('✗ ' + (e.stack || e)); } finally { await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    console.log(fails ? `${fails} essai(s) raté(s)` : 'Tout est bon.');
    process.exit(fails ? 1 : 0);
})();
