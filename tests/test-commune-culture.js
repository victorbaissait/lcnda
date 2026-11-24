#!/usr/bin/env node
/* 🎬📜🛡️🏷️🍲 Le village dans la culture (lib/commune_culture.php, assets/js/heritage-commune-culture.js, assets/css/commune-culture.css,
 * données assets/data/cc-*.json.gz).
 * Le réseau est remplacé par des réponses VRAIES enregistrées une fois (tests/fixtures/commune-culture/, GENEALOGY_TEST=1 +
 * LCNDA_TEST_CC_DIR, et LCNDA_TEST_CPLUS_DIR pour la commune sur Wikidata, partagée avec « Autour du village ») :
 * Wikidata (CC0), Wikipédia (article de Saint-Léonard-de-Noblat, CC BY-SA 4.0), Wikimedia Commons (auteur et licence d'une image),
 * Base Adresse Nationale (rues « Mazaud », « Lacombe », « Jean Lacombe » à Sète). Un fichier absent = hors ligne.
 *  1. serveur : la commune reconnue sans code INSEE (nom + département) ; armoiries, œuvres, plats lus dans les données livrées ;
 *     origine du nom et histoire (extrait, lien, licence) ; rues (nombre, « commune de sa vie », ancêtre) ; fiche confidentielle :
 *     rien n'est envoyé ; gardé sur l'ordinateur ; hors ligne ; Rietstap ; listes ;
 *  2. écran : fiche d'un village, fiche de personne (« ＋ Ajouter au livre de recettes » et ↶), monographie, Réglages,
 *     LCNDA_EXT.dataSources / dataLists.
 *   node tests/test-commune-culture.js */
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
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FX = path.join(__dirname, 'fixtures/commune-culture');
const fx = n => JSON.parse(fs.readFileSync(path.join(FX, n), 'utf8'));
const data = n => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'assets/data', `cc-${n}.json.gz`))).toString('utf8'));
const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

(async () => {
    /* ═════════ 0. les données livrées : taille, forme, sources ═════════ */
    const OE = data('oeuvres'), AR = data('armoiries'), PL = data('plats'), CO = data('communes');
    const SLN = '87161', SETE = '34301', LIMOGES = '87085';
    await t('données livrées : moins de 15 Mo en tout, chaque fichier dit sa source et sa licence', async () => {
        const files = fs.readdirSync(path.join(root, 'assets/data')).filter(f => /^cc-.*\.json\.gz$/.test(f));
        const total = files.reduce((n, f) => n + fs.statSync(path.join(root, 'assets/data', f)).size, 0);
        console.log(`   ${files.length} fichiers, ${(total / 1e6).toFixed(2)} Mo`);
        assert.ok(total < 15e6, 'moins de 15 Mo');
        for (const d of [OE, AR, PL, CO]) { assert.ok(d.attr && d.licence && d.url && d.built, 'attr, licence, url, built'); }
        assert.strictEqual(CO.c[SLN][0], 'Saint-Léonard-de-Noblat'); assert.strictEqual(CO.c[SETE][0], 'Sète');
        assert.ok(OE.rows.length > 1000 && OE.rows.every(r => /^Q\d+$/.test(r.q) && r.t && CO.c[r.insee] && ['tourne', 'cadre', 'sujet'].includes(r.rel)));
        assert.ok(Object.keys(AR.c).length > 5000 && Object.values(AR.c).every(r => r[0] && (r[1] || r[2])));
        assert.ok(PL.rows.length > 50 && PL.rows.every(r => r.n && /^Q\d+$/.test(r.q) && ['commune', 'dep', 'region', 'province'].includes(r.lvl)));
    });

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-cc-')), net0 = path.join(tmp, 'net');
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true}); fs.cpSync(FX, net0, {recursive: true});
    const calls = () => { try { return fs.readFileSync(path.join(net0, 'calls.log'), 'utf8').trim().split('\n').filter(Boolean); } catch (_) { return []; } };
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1', LCNDA_TEST_CC_DIR: net0, LCNDA_TEST_CPLUS_DIR: net0};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','MAZAUD','male','deceased',1),(2,'Jean Baptiste','LACOMBE','male','deceased',0),(3,'Paul','DURAND','male','living',0)");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code) VALUES(1,'Saint-Léonard-de-Noblat','Haute-Vienne','France',45.8353,1.4892,'87161'),(3,'Limoges','Haute-Vienne','France',NULL,NULL,''),(4,'Sète','Hérault','France',43.4028,3.6928,'')");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)");
$ins->execute([1,$t('BIRT'),'3 mai 1862',1862,'1862-05-03',1]); $ins->execute([1,$t('DEAT'),'2 juin 1911',1911,'1911-06-02',3]);
$ins->execute([2,$t('BIRT'),'1870',1870,'1870',3]); $ins->execute([2,$t('DEAT'),'1931',1931,'1931',4]);
$ins->execute([3,$t('BIRT'),'1980',1980,'1980',1]);
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const db = path.join(tmp, 'genealogy.sqlite');
    const q = sql => JSON.parse(spawnSync(phpPath, ['-r', `$p=new PDO('sqlite:${db}');echo json_encode($p->query(${JSON.stringify(sql)})->fetchAll(PDO::FETCH_ASSOC));`], {encoding: 'utf8'}).stdout || '[]');
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    const PLACE = {name: 'Saint-Léonard-de-Noblat', lat: 45.8353, lon: 1.4892, insee: SLN};
    try {
        const p = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultPersonBlocks, null, {timeout: 30000});
        // index.php ne charge pas encore ces fichiers : on les ajoute (comme le feront les balises)
        for (const [js, css, k] of [['heritage-commune-plus.js', 'commune-plus.css', 'communePlus'], ['heritage-monographie-plus.js', 'monographie-plus.css', 'monographiePlus'], ['app-listes-donnees.js', '', ''], ['heritage-commune-culture.js', 'commune-culture.css', 'communeCulture']]) {
            if (k && await p.evaluate(x => !!window.LCNDA_EXT?.[x], k)) continue;
            if (!k && await p.evaluate(() => !!document.querySelector('script[src*="app-listes-donnees"]'))) continue;
            if (css) await p.addStyleTag({url: base + 'assets/css/' + css});
            await p.addScriptTag({url: base + 'assets/js/' + js});
        }
        await p.waitForFunction(() => window.LCNDA_EXT?.communeCulture, null, {timeout: 10000});
        const api = (x, qq = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, qq]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);
        const toastWith = re => p.waitForFunction(s => new RegExp(s).test([...document.querySelectorAll('.ui-toast, .toast')].map(x => x.textContent).join(' ')), re.source, {timeout: 20000});

        /* ═════════ 1. le serveur ═════════ */
        await t('cc_place : armoiries, œuvres et plats de Saint-Léonard-de-Noblat, tels qu’ils sont dans les données livrées (sans réseau)', async () => {
            const n = calls().length;
            const r = await api('cc_place', PLACE);
            assert.strictEqual(r.ok, true, JSON.stringify(r).slice(0, 300));
            assert.strictEqual(r.commune.insee, SLN); assert.strictEqual(r.commune.dep, '87'); assert.strictEqual(r.commune.dep_name, 'Haute-Vienne');
            const a = AR.c[SLN];
            if (a) { assert.strictEqual(r.arms.commune, a[0]); assert.strictEqual(r.arms.image, a[1]); assert.strictEqual(r.arms.blazon, a[2]); if (a[1]) assert.match(r.arms.thumb, /^https:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\//); }
            else assert.strictEqual(r.arms, null);
            assert.deepStrictEqual(r.works.map(w => w.qid).sort(), OE.rows.filter(x => x.insee === SLN).map(x => x.q).sort());
            const want = PL.rows.filter(x => x.insee === SLN || (x.deps || []).includes('87'));
            assert.strictEqual(r.dishes.length, Math.min(6, want.length));
            assert.ok(r.dishes.every(d => want.some(w => w.q === d.qid)));
            assert.strictEqual(calls().length, n, 'pas de réseau');
        });
        await t('la commune reconnue sans code INSEE : « Limoges, Haute-Vienne » → 87085 ; « Sète, Hérault » → 34301', async () => {
            assert.strictEqual((await api('cc_place', {place_id: 3})).commune.insee, LIMOGES);
            assert.strictEqual((await api('cc_place', {place_id: 4})).commune.insee, SETE);
            assert.strictEqual((await api('cc_place', {name: 'Nulle-Part-sur-Rien'})).ok, false);
        });
        await t('📜 origine du nom et histoire : extraits de l’article Wikipédia (relus dans la réponse), lien, licence CC BY-SA 4.0', async () => {
            const r = await api('cc_wiki', PLACE);
            assert.strictEqual(r.ok, true, JSON.stringify(r).slice(0, 300));
            assert.strictEqual(r.title, fx('wp_sections.json').parse.title);
            assert.ok(r.toponymie && r.toponymie.lead.length, 'toponymie'); assert.ok(r.histoire && r.histoire.lead.length, 'histoire');
            const html = fx('wp_toponymie.json').parse.text;
            const plain = html.replace(/<[^>]+>/g, ' ').replace(/&#160;|&nbsp;/g, ' ').replace(/\s+/g, ' ');
            assert.ok(plain.includes(r.toponymie.lead[0].x.slice(0, 40)), 'le texte vient de l’article');
            assert.ok(r.toponymie.lead.reduce((n, x) => n + x.x.length, 0) <= 760, 'un extrait court');
            assert.match(r.toponymie.url, /^https:\/\/fr\.wikipedia\.org\/wiki\/Saint-L%C3%A9onard-de-Noblat#/);
            assert.strictEqual(r.source.licence, 'CC BY-SA 4.0'); assert.match(r.history_url, /action=history$/);
            assert.ok(!/\[\d+\]/.test(JSON.stringify(r.toponymie.more)), 'sans appels de notes');
        });
        await t('🏷️ rues : celles de la BAN dont le nom contient MAZAUD (mot entier), avec la carte ; mention Licence Ouverte', async () => {
            const r = await api('cc_rues', {id: 1});
            assert.strictEqual(r.ok, true, JSON.stringify(r).slice(0, 300));
            assert.ok(r.items.length >= 1 && r.items.every(x => (' ' + fold(x.name) + ' ').includes(' mazaud ') && /^\d[\dAB]\d{3}$/.test(x.insee) && /openstreetmap\.org/.test(x.map)));
            assert.strictEqual(r.source.licence, 'Licence Ouverte 2.0 (Etalab)');
            assert.deepStrictEqual(r.ancestor, [], 'pas de « Rue Jean Mazaud » dans ses communes');
            assert.ok(calls().some(c => /api-adresse\.data\.gouv\.fr\/search\/\?q=MAZAUD&type=street/.test(c)));
        });
        await t('🏷️ « une rue porte peut-être le nom de ton ancêtre » : Rue Jean Lacombe à Sète, commune de la vie de Jean Baptiste LACOMBE', async () => {
            const r = await api('cc_rues', {id: 2});
            assert.strictEqual(r.ok, true, JSON.stringify(r).slice(0, 300));
            assert.ok(r.ancestor.length >= 1, JSON.stringify(r.ancestor)); assert.strictEqual(r.ancestor[0].insee, SETE); assert.match(r.ancestor[0].name, /Jean Lacombe/i);
            assert.ok(calls().some(c => /q=Jean\+LACOMBE&type=street&limit=50&autocomplete=0&citycode=34301/.test(c)));
        });
        await t('fiche d’une personne vivante (DURAND) : son nom n’est pas envoyé', async () => {
            const n = calls().length;
            const r = await api('cc_rues', {id: 3});
            assert.strictEqual(r.ok, false); assert.strictEqual(r.private, true);
            assert.strictEqual(calls().length, n);
        });
        await t('gardé sur l’ordinateur : la même question ne repart pas sur Internet ; hors ligne : la réponse gardée, sinon un petit message', async () => {
            const n = calls().length;
            assert.strictEqual((await api('cc_wiki', PLACE)).cached, true);
            assert.strictEqual((await api('cc_rues', {id: 1})).cached, true);
            assert.strictEqual(calls().length, n);
            fs.renameSync(net0, net0 + '-off');
            try {
                assert.strictEqual((await api('cc_wiki', PLACE)).ok, true);
                const r = await api('cc_rues', {name: 'TOUTNOUVEAU'});
                assert.strictEqual(r.ok, false); assert.strictEqual(r.offline, true); assert.match(r.message, /connexion/);
            } finally { fs.renameSync(net0 + '-off', net0); }
        });
        await t('🛡️ crédit d’une image d’armoiries : auteur et licence relus sur Commons', async () => {
            const a = (await api('cc_place', PLACE)).arms;
            if (!a?.image) return;
            const r = await api('cc_credit', {files: a.image});
            assert.strictEqual(r.ok, true, JSON.stringify(r).slice(0, 200));
            const c = r.credits[a.image]; assert.ok(c && c.licence, JSON.stringify(r.credits));
        });
        await t('cc_person : armoiries de ses communes, ses villages dans les œuvres, le plat de sa région (Haute-Vienne)', async () => {
            const r = await api('cc_person', {id: 1});
            assert.strictEqual(r.ok, true, JSON.stringify(r).slice(0, 300));
            assert.deepStrictEqual(r.places.map(x => x.insee), [SLN, LIMOGES]);
            const armsWant = [SLN, LIMOGES].filter(i => AR.c[i]);
            assert.deepStrictEqual((r.arms || []).map(a => a.insee), armsWant);
            const worksWant = OE.rows.filter(x => [SLN, LIMOGES].includes(x.insee)).length;
            assert.strictEqual((r.works || []).length, worksWant);
            if (PL.rows.some(x => (x.deps || []).includes('87'))) assert.ok(r.dishes.items.length && r.dishes.dep === '87');
        });
        await t('🛡️ Rietstap : les familles du même nom dans l’Armorial général (tome, page du scan) ; texte montré seulement s’il paraît propre', async () => {
            const about = await api('cc_about');
            if (!about.rietstap) { console.log('   (pas de fichier Rietstap livré)'); return; }
            const r = await api('cc_person', {id: 3});
            const R = r.rietstap || [];
            assert.ok(R.length >= 1, 'DURAND est dans Rietstap');
            assert.ok(R.every(x => /^Durand/i.test(x.name) && [1, 2].includes(x.tome) && /^https:\/\/commons\.wikimedia\.org\/w\/index\.php\?title=File%3AArmorial/.test(x.scan) && /&page=\d+$/.test(x.scan)));
            assert.ok(R.every(x => x.clean ? x.blazon === x.raw : x.blazon === ''));
        });
        await t('listes : œuvres, armoiries, plats (toutes les lignes livrées), rues des noms de la généalogie', async () => {
            assert.strictEqual((await api('cc_list', {kind: 'oeuvres'})).rows.length, OE.rows.length);
            assert.strictEqual((await api('cc_list', {kind: 'armoiries'})).rows.length, Object.keys(AR.c).length);
            assert.strictEqual((await api('cc_list', {kind: 'plats'})).rows.length, PL.rows.length);
            const ru = await api('cc_list', {kind: 'rues'});
            assert.ok(ru.rows.some(x => x.surname === 'MAZAUD') && ru.rows.some(x => x.surname === 'LACOMBE'));
            assert.ok(!ru.rows.some(x => x.surname === 'DURAND'), 'pas les vivants');
        });

        /* ═════════ 2. l'écran ═════════ */
        await t('fiche d’un village : origine du nom, histoire (lire la suite, CC BY-SA), armoiries (crédit Commons), œuvres et plat', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'villages'; A.state.hVillage = '87161'; A.setModule('listes'); });
            await p.waitForSelector('.h-village [data-cc-host] [data-cc-part="toponymie"] .cc-wiki', {timeout: 20000});
            const txt = await p.textContent('[data-cc-host]');
            assert.match(txt, /Origine du nom/); assert.match(txt, /lire la suite sur Wikipédia/); assert.match(txt, /CC BY-SA 4\.0/);
            if (AR.c[SLN]) { assert.ok(await p.$('[data-cc-part="arms"]')); }
            if (OE.rows.some(x => x.insee === SLN)) assert.ok(await p.$('[data-cc-part="works"] .cc-work'));
            if (AR.c[SLN]?.[1]) await p.waitForFunction(() => !/^auteur et licence :$/.test(document.querySelector('[data-cc-credit]')?.textContent.trim() || ''), null, {timeout: 10000});
        });
        await t('fiche de MAZAUD : « 🏷️ Son nom et ses villages » — rues, plat de sa région ; « ＋ Ajouter au livre de recettes » puis ↶', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('[data-cc-person="1"] [data-cc-line="rues"]:not([hidden])', {timeout: 20000});
            const txt = await p.textContent('[data-pblock="commune_culture"]');
            assert.match(txt, /Son nom et ses villages/); assert.match(txt, /MAZAUD/); assert.match(txt, /Même nom ne veut pas dire même famille/);
            const btn = await p.$('[data-cc-person="1"] [data-cc-recipe]');
            if (btn) {
                await btn.click();
                await toastWith(/livre de recettes/);
                assert.strictEqual(q("SELECT COUNT(*) n FROM family_memories WHERE kind='recipe'")[0].n, 1);
                assert.strictEqual(q("SELECT person_id FROM family_memory_people")[0].person_id, 1);
                await p.click('.ui-toast button:has-text("Annuler"), .toast button:has-text("Annuler")');
                await p.waitForFunction(() => !document.querySelector('[data-cc-recipe]')?.disabled, null, {timeout: 10000});
                assert.strictEqual(q("SELECT COUNT(*) n FROM family_memories WHERE kind='recipe'")[0].n, 0);
            }
        });
        await t('fiche de LACOMBE : la ligne « une rue porte peut-être le nom de ton ancêtre » (Sète)', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 2; A.setModule('personnes'); });
            await p.waitForSelector('[data-cc-person="2"] .cc-anc', {timeout: 20000});
            assert.match(await p.textContent('[data-cc-person="2"] .cc-anc'), /Jean Lacombe.*Sète/);
        });
        await t('monographie de commune : les parties « Origine du nom », « Armoiries »… enregistrées et rendues', async () => {
            const ids = await p.evaluate(() => (window.LCNDA_EXT.monographSections || []).filter(s => /^cc_/.test(s.id)).map(s => s.id));
            assert.deepStrictEqual(ids, ['cc_toponymie', 'cc_histoire', 'cc_armoiries', 'cc_oeuvres', 'cc_plat']);
            const out = await p.evaluate(async () => { const h = document.createElement('div'); document.body.appendChild(h); const s = window.LCNDA_EXT.monographSections.find(x => x.id === 'cc_toponymie');
                const ok = await s.render({id: 1, name: 'Saint-Léonard-de-Noblat', latitude: 45.8353, longitude: 1.4892}, h, {village: async () => ({insee: '87161'})}); const t = h.textContent; h.remove(); return {ok, t}; });
            assert.strictEqual(out.ok, true); assert.match(out.t, /Wikipédia/); assert.ok(!/📜 Origine du nom/.test(out.t), 'le titre est celui de la partie');
        });
        await t('LCNDA_EXT.dataSources et dataLists : à la demande pour un lieu ou une personne ; listes avec carte et filtres', async () => {
            const ids = await p.evaluate(() => (window.LCNDA_EXT.dataSources || []).filter(d => /^cc_/.test(d.id)).map(d => d.id));
            assert.deepStrictEqual(ids, ['cc_toponymie', 'cc_histoire', 'cc_armoiries', 'cc_oeuvres', 'cc_plat', 'cc_rues', 'cc_nom_villages']);
            const txt = await p.evaluate(async () => { const h = document.createElement('div'); document.body.appendChild(h); await window.LCNDA_EXT.dataSources.find(d => d.id === 'cc_rues').run({person: {id: 1}}, h); const t = h.textContent; h.remove(); return t; });
            assert.match(txt, /MAZAUD/);
            const L = await p.evaluate(async () => Promise.all((window.LCNDA_EXT.dataLists || []).filter(d => /^cc_(oeuvres|armoiries|plats)$/.test(d.id)).map(async d => { const rows = await d.load(); return {id: d.id, n: rows.length, keys: d.fields.map(f => f.key), geo: rows.filter(r => d.geo(r)).length}; })));
            assert.deepStrictEqual(L.map(x => x.id), ['cc_oeuvres', 'cc_armoiries', 'cc_plats']);
            assert.strictEqual(L[0].n, OE.rows.length); assert.ok(L[0].geo > L[0].n * 0.9, 'presque toutes sur la carte'); assert.ok(L[0].keys.includes('year') && L[0].keys.includes('commune'));
        });
        await t('Réglages → 🎬 Le village dans la culture : éteindre « Origine du nom » le retire de la fiche du village ; À propos des données', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'commune_culture'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-cc-settings] [data-cc-tg="wiki"] input', {timeout: 20000});
            const s = await p.textContent('[data-cc-settings]');
            assert.match(s, /CC0 1\.0/); assert.match(s, /CC BY-SA 4\.0/); assert.match(s, /Licence Ouverte 2\.0/);
            await p.uncheck('[data-cc-tg="wiki"] input');
            assert.strictEqual(JSON.parse(await p.evaluate(() => localStorage.getItem('genealogie-commune-culture'))).wiki, false);
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'villages'; A.state.hVillage = '87161'; A.setModule('listes'); });
            await p.waitForSelector('.h-village [data-cc-host]', {timeout: 20000});
            await sleep(800);
            assert.strictEqual(await p.$('[data-cc-part="toponymie"]'), null);
            await p.evaluate(() => localStorage.removeItem('genealogie-commune-culture'));
        });
        await t('pas d’erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
