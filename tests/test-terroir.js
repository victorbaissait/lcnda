#!/usr/bin/env node
/* 🌾 Son terroir (lib/terroir.php, assets/js/heritage-terroir.js, assets/css/terroir.css, données assets/data/tr-*.json.gz).
 * Le réseau (Wiktionnaire) est remplacé par des réponses VRAIES enregistrées une fois (tests/fixtures/terroir/, GENEALOGY_TEST=1 +
 * LCNDA_TEST_TR_DIR) ; Wikimedia Commons (crédit des images) : hors ligne (dossier vide, LCNDA_TEST_CC_DIR). Un fichier absent = hors ligne.
 *  1. serveur : 🍷 aires AOC de Saint-Émilion, « Vigneron dans l'aire Saint-Emilion (AOC) » ; 🐄 races de Bretagne pour une cultivatrice
 *     de Plozévet ; 👒 coiffe ; 🏫 écoles de Tulle pour un instituteur ; 🔤 sens du prénom (fichier livré, sans réseau) et d'un prénom
 *     rare ou d'un nom (en ligne, gardé, hors ligne) ; fiche d'une personne vivante : rien n'est envoyé ; listes ; effacer ↶ ;
 *  2. écran : fiche de personne « 🌾 Son terroir », fiche d'un village, monographie, LCNDA_EXT.dataSources / dataLists, Réglages.
 *   node tests/test-terroir.js */
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
const FX = path.join(__dirname, 'fixtures/terroir');
const file = n => path.join(root, 'assets/data', `tr-${n}.json.gz`);
const data = n => (fs.existsSync(file(n)) ? JSON.parse(zlib.gunzipSync(fs.readFileSync(file(n))).toString('utf8')) : null);
const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

(async () => {
    /* ═════════ 0. les données livrées : taille, forme, sources ═════════ */
    const AOC = data('aoc'), RA = data('races'), CO = data('coiffes'), EC = data('ecoles'), PR = data('prenoms');
    const STEM = '33394', PLOZ = '29215', TULLE = '19272';
    await t('données livrées : moins de 15 Mo en tout, chaque fichier dit sa source, sa licence et sa date', async () => {
        const files = fs.readdirSync(path.join(root, 'assets/data')).filter(f => /^tr-.*\.json\.gz$/.test(f));
        const total = files.reduce((n, f) => n + fs.statSync(path.join(root, 'assets/data', f)).size, 0);
        console.log(`   ${files.length} fichiers, ${(total / 1e6).toFixed(2)} Mo : ${files.map(f => `${f} ${Math.round(fs.statSync(path.join(root, 'assets/data', f)).size / 1024)} Ko`).join(', ')}`);
        assert.ok(total < 15e6, 'moins de 15 Mo');
        for (const d of [AOC, RA, CO, EC, PR].filter(Boolean)) { assert.ok(d.attr && d.licence && d.url && d.built, 'attr, licence, url, built'); }
        assert.ok(AOC && RA, 'AOC et races livrés');
        assert.ok(AOC.areas.length > 1500 && Object.keys(AOC.c).length > 30000);
        assert.ok(AOC.areas.every(a => Number.isInteger(a[0]) && a[1] && ['AOC', 'IGP', 'IG'].includes(a[2]) && AOC.cats[a[3]]));
        assert.ok(AOC.c[STEM].some(i => AOC.areas[i][1] === 'Saint-Emilion' && AOC.areas[i][3] === 'vin'), 'Saint-Émilion est dans l’aire Saint-Emilion (vin)');
        assert.ok(RA.rows.length > 1000 && RA.rows.every(r => /^Q\d+$/.test(r.q) && r.n && r.sp && r.c.length));
        assert.ok(RA.rows.some(r => r.n === 'Salers' && (r.deps || []).includes('15')), 'la Salers vient du Cantal');
        if (PR) assert.ok(Object.keys(PR.n).length > 1000 && PR.n.Jean && PR.n.Gaspard, 'les prénoms courants');
        if (EC) assert.ok(EC.rows.every(r => /^Q\d+$/.test(r.q) && r.n && /^\d[\dAB]\d{3}$/.test(r.i)));
        if (CO) assert.ok(CO.rows.every(r => r.r && (r.deps || r.lat != null) && r.photos.every(p => p.f && p.l)), 'chaque photo a sa licence');
    });

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-tr-')), net0 = path.join(tmp, 'net'), netcc = path.join(tmp, 'netcc');
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true}); fs.mkdirSync(netcc); fs.cpSync(FX, net0, {recursive: true});
    const calls = () => { try { return fs.readFileSync(path.join(net0, 'calls.log'), 'utf8').trim().split('\n').filter(Boolean); } catch (_) { return []; } };
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1', LCNDA_TEST_TR_DIR: net0, LCNDA_TEST_CC_DIR: netcc, LCNDA_TEST_CPLUS_DIR: netcc};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start,occupation) VALUES(1,'Jean','MAZAUD','male','deceased',1,'vigneron'),(2,'Marie Anne','LACOMBE','female','deceased',0,'cultivatrice'),(3,'Gaspard','DURAND','male','deceased',0,''),(4,'Philomène','MAZAUD','female','deceased',0,''),(5,'Philomène','DURAND','female','living',0,'')");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code) VALUES(1,'Saint-Émilion','Gironde','France',44.894,-0.155,'33394'),(2,'Plozévet','Finistère','France',NULL,NULL,''),(3,'Tulle','Corrèze','France',NULL,NULL,''),(4,'Bruxelles','','Belgique',50.85,4.35,'')");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id,title) VALUES('person',?,?,?,?,?,?,?)");
$ins->execute([1,$t('BIRT'),'3 mai 1862',1862,'1862-05-03',1,'']); $ins->execute([2,$t('BIRT'),'1870',1870,'1870',2,'']);
$ins->execute([3,$t('BIRT'),'1850',1850,'1850',3,'']); $ins->execute([3,$t('OCCU'),'1875',1875,'1875',3,'Instituteur']);
$ins->execute([4,$t('BIRT'),'1880',1880,'1880',4,'']); $ins->execute([5,$t('BIRT'),'1990',1990,'1990',1,'']);
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    const PLACE = {name: 'Saint-Émilion', lat: 44.894, lon: -0.155, insee: STEM};
    try {
        const p = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultPersonBlocks, null, {timeout: 30000});
        // index.php ne charge pas encore ces fichiers : on les ajoute (comme le feront les balises)
        for (const [js, css, k] of [['heritage-commune-plus.js', 'commune-plus.css', 'communePlus'], ['heritage-monographie-plus.js', 'monographie-plus.css', 'monographiePlus'], ['app-listes-donnees.js', '', ''], ['heritage-terroir.js', 'terroir.css', 'terroir']]) {
            if (k && await p.evaluate(x => !!window.LCNDA_EXT?.[x], k)) continue;
            if (!k && await p.evaluate(() => !!document.querySelector('script[src*="app-listes-donnees"]'))) continue;
            if (!fs.existsSync(path.join(root, 'assets/js', js))) continue;
            if (css) await p.addStyleTag({url: base + 'assets/css/' + css});
            await p.addScriptTag({url: base + 'assets/js/' + js});
        }
        await p.waitForFunction(() => window.LCNDA_EXT?.terroir, null, {timeout: 10000});
        const api = (x, qq = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, qq]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);

        /* ═════════ 1. le serveur ═════════ */
        await t('tr_place : les aires AOC/IGP de Saint-Émilion telles qu’elles sont dans le fichier de l’INAO (sans réseau), lien vers l’INAO', async () => {
            const n = calls().length;
            const r = await api('tr_place', PLACE);
            assert.strictEqual(r.ok, true, JSON.stringify(r).slice(0, 300));
            assert.strictEqual(r.commune.insee, STEM); assert.strictEqual(r.commune.dep, '33');
            assert.deepStrictEqual(r.aoc.map(a => a.ida).sort((a, b) => a - b), AOC.c[STEM].map(i => AOC.areas[i][0]).sort((a, b) => a - b));
            assert.ok(r.aoc.every(a => /^https:\/\/www\.inao\.gouv\.fr\/rechercher-un-produit\?search_api_fulltext=/.test(a.url)));
            assert.strictEqual(r.aoc[0].cat, 'vin', 'les vins d’abord');
            assert.strictEqual(calls().length, n, 'pas de réseau');
        });
        await t('tr_place : la commune reconnue sans code INSEE (« Tulle, Corrèze ») ; un lieu de Belgique : les races du pays seulement', async () => {
            const r = await api('tr_place', {place_id: 3});
            assert.strictEqual(r.commune.insee, TULLE);
            const b = await api('tr_place', {place_id: 4});
            assert.strictEqual(b.ok, true); assert.strictEqual(b.commune.country, 'BE'); assert.deepStrictEqual(b.aoc, []);
            assert.ok(b.races.length && b.races.every(x => x.countries.includes('BE')), 'races de Belgique');
        });
        await t('🍷 fiche d’un vigneron né à Saint-Émilion : « Vigneron dans l’aire Saint-Emilion (AOC) »', async () => {
            const r = await api('tr_person', {id: 1});
            assert.strictEqual(r.ok, true, JSON.stringify(r).slice(0, 300));
            assert.strictEqual(r.aoc.job, 'Vigneron'); assert.strictEqual(r.aoc.areas[0].name, 'Saint-Emilion'); assert.strictEqual(r.aoc.areas[0].sign, 'AOC');
            assert.ok(r.aoc.areas.every(a => a.cat === 'vin'), 'seulement les vins pour un vigneron');
            assert.strictEqual(r.races, undefined, 'pas d’animaux pour un vigneron');
        });
        await t('🐄 une cultivatrice de Plozévet (Finistère) : les races de Bretagne d’après Wikidata et Wikipédia, les vaches d’abord', async () => {
            const r = await api('tr_person', {id: 2});
            assert.ok(r.races, JSON.stringify(r).slice(0, 300));
            const want = RA.rows.filter(x => ((x.deps || []).includes('29') || x.lvl === 'province') && x.sp !== 'chien').map(x => x.q);
            assert.ok(r.races.items.length >= Math.min(10, RA.rows.filter(x => (x.deps || []).includes('29') && x.sp !== 'chien').length));
            assert.ok(r.races.items.every(x => want.includes(x.qid)), 'des races de la région (ou d’une province voisine)');
            assert.strictEqual(r.races.dep_name, 'Finistère');
            assert.strictEqual(r.races.items[0].species, 'bovin');
            if (CO && CO.rows.some(c => (c.deps || []).includes('29'))) assert.ok(r.coiffes?.items?.length, '👒 coiffe de Bretagne');
        });
        await t('🏫 un instituteur de Tulle : les écoles de la commune sur Wikidata', async () => {
            const r = await api('tr_person', {id: 3});
            const want = (EC?.rows || []).filter(x => x.i === TULLE);
            if (!want.length) { assert.strictEqual(r.ecoles, undefined); console.log('   (pas d’école de Tulle dans les données)'); return; }
            assert.strictEqual(r.ecoles.job, 'Instituteur');
            assert.deepStrictEqual(r.ecoles.items.map(x => x.qid).sort(), want.slice(0, 12).map(x => x.q).sort());
        });
        await t('🔤 le sens du prénom : « Jean », « Gaspard » viennent du fichier livré (Wiktionnaire), sans réseau', async () => {
            if (!PR) { console.log('   (pas de fichier des prénoms)'); return; }
            const n = calls().length;
            const r = await api('tr_person', {id: 3});
            assert.strictEqual(r.prenom.title, 'Gaspard'); assert.strictEqual(r.prenom.text, PR.n.Gaspard); assert.strictEqual(r.prenom.offline, true);
            assert.match(r.prenom.url, /^https:\/\/fr\.wiktionary\.org\/wiki\/Gaspard#Pr/); assert.match(r.prenom.history_url, /action=history$/); assert.strictEqual(r.prenom.source.licence, 'CC BY-SA 4.0');
            assert.strictEqual((await api('tr_person', {id: 2})).prenom.title, 'Marie', '« Marie Anne » → Marie');
            assert.strictEqual(calls().length, n);
        });
        await t('🔤 en ligne : « Philomène » et le nom MAZAUD sur le Wiktionnaire (réponses enregistrées), puis gardés ; hors ligne : la réponse gardée', async () => {
            const r = await api('tr_nom', {id: 4});
            assert.strictEqual(r.ok, true, JSON.stringify(r).slice(0, 300));
            const rev = fs.readdirSync(FX).filter(f => /^wikt_rev_/.test(f)).map(f => JSON.parse(fs.readFileSync(path.join(FX, f), 'utf8')));
            const pg = rev.flatMap(j => j.query.pages).find(x => x.title === 'Philomène');
            assert.ok(pg, 'fixture Philomène');
            if (r.prenom?.text) {
                const parse = fs.readdirSync(FX).filter(f => /^wikt_parse_/.test(f)).map(f => JSON.parse(fs.readFileSync(path.join(FX, f), 'utf8')).parse.text).join(' ');
                const plain = parse.replace(/<[^>]+>/g, ' ').replace(/&#160;|&nbsp;/g, ' ').replace(/\s+/g, ' ');
                const sq = x => x.replace(/\s+/g, '');
                assert.ok(sq(plain).includes(sq(r.prenom.text.slice(0, 25))), 'le texte vient de la réponse du Wiktionnaire');
                assert.strictEqual(r.prenom.cached, false);
            }
            assert.ok(calls().some(c => /fr\.wiktionary\.org\/w\/api\.php\?action=query&prop=revisions/.test(c)));
            const n = calls().length;
            const again = await api('tr_nom', {id: 4});
            assert.strictEqual(calls().length, n, 'gardé : pas de nouvel appel');
            assert.deepStrictEqual(again.prenom?.text, r.prenom?.text);
            fs.renameSync(net0, net0 + '-off');
            try { const off = await api('tr_nom', {id: 4}); assert.strictEqual(off.ok, true); assert.deepStrictEqual(off.prenom?.text, r.prenom?.text); }
            finally { fs.renameSync(net0 + '-off', net0); }
        });
        await t('fiche d’une personne vivante (Philomène DURAND) : ni son prénom ni son nom ne partent sur Internet', async () => {
            const n = calls().length;
            const r = await api('tr_nom', {id: 5});
            assert.strictEqual(r.private, true);
            assert.strictEqual(calls().length, n);
        });
        await t('🔤 les prénoms de la base : ceux qui ont un sens, les autres à chercher ; jamais les vivants', async () => {
            const r = await api('tr_base_names', {});
            assert.ok(r.total >= 4, JSON.stringify(r).slice(0, 300));
            const names = r.names.map(x => x.name);
            assert.ok(names.includes('Philomène'), 'Philomène (MAZAUD, décédée) est comptée, déjà gardée');
            assert.strictEqual(r.names.find(x => x.name === 'Philomène').people, 1, 'pas la vivante');
            if (PR) assert.ok(names.includes('Jean') && names.includes('Gaspard'));
        });
        await t('listes : produits AOC (toutes les aires), races, coiffes, écoles, prénoms', async () => {
            assert.strictEqual((await api('tr_list', {kind: 'aoc'})).rows.length, AOC.areas.length);
            assert.strictEqual((await api('tr_list', {kind: 'races'})).rows.length, RA.rows.length);
            if (EC) assert.strictEqual((await api('tr_list', {kind: 'ecoles'})).rows.length, EC.rows.length);
            if (CO) assert.ok((await api('tr_list', {kind: 'coiffes'})).rows.length >= CO.rows.length);
            const pr = (await api('tr_list', {kind: 'prenoms'})).rows;
            if (PR) assert.ok(pr.length >= Object.keys(PR.n).length);
            assert.ok(pr.every(x => /^https:\/\/fr\.wiktionary\.org\/wiki\//.test(x.url)));
        });
        await t('Réglages : effacer les réponses gardées, puis ↶ les remettre', async () => {
            const a = await api('tr_about');
            assert.ok(a.cache.count >= 1); assert.ok(a.sources.some(s => /INAO/.test(s.label) && s.licence === 'Licence Ouverte (Etalab)'));
            const c = await post('tr_cache_clear', {});
            assert.strictEqual(c.ok, true); assert.ok(c.removed >= 1);
            assert.strictEqual((await api('tr_about')).cache.count, 0);
            const back = await post('tr_cache_restore', {token: c.token});
            assert.strictEqual(back.restored, c.removed);
        });

        /* ═════════ 2. l'écran ═════════ */
        await t('fiche de Jean MAZAUD : « 🌾 Son terroir » — Vigneron dans l’aire Saint-Emilion (AOC), source INAO, le sens de son prénom', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('[data-trr-person="1"] [data-trr-line="aoc"]', {timeout: 20000});
            const txt = await p.textContent('[data-pblock="terroir"]');
            assert.match(txt, /Son terroir/); assert.match(txt, /Vigneron dans l’aire Saint-Emilion \(AOC\)/); assert.match(txt, /INAO/); assert.match(txt, /Licence Ouverte/);
            if (PR) assert.match(txt, /Jean :/);
            assert.ok(await p.$('[data-trr-person="1"] a[href^="https://www.inao.gouv.fr/"][target="_blank"]'), 'lien vers l’INAO');
            assert.strictEqual(await p.$eval('[data-pblock="terroir"]', el => el.hidden), false);
        });
        await t('fiche de Marie Anne LACOMBE : « La vache de son pays : … (Finistère) »', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 2; A.setModule('personnes'); });
            await p.waitForSelector('[data-trr-person="2"] [data-trr-line="races"]', {timeout: 20000});
            assert.match(await p.textContent('[data-trr-person="2"] [data-trr-line="races"]'), /La vache de son pays : .+\(Finistère\)/);
        });
        await t('fiche d’un village (Saint-Émilion) : « 🍷 Les produits de son terroir » avec la source', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'villages'; A.state.hVillage = '33394'; A.setModule('listes'); });
            const ok = await p.waitForSelector('.h-village [data-trr-host] [data-trr-part="aoc"]', {timeout: 20000}).then(() => true).catch(() => false);
            if (!ok) { console.log('   (pas de fiche de village pour une commune sans famille dans cette version)'); return; }
            const txt = await p.textContent('[data-trr-host]');
            assert.match(txt, /Les produits de son terroir/); assert.match(txt, /Saint-Emilion/); assert.match(txt, /INAO/);
        });
        await t('monographie : les parties « Les produits de son terroir », « Les animaux du pays »… enregistrées et rendues', async () => {
            const ids = await p.evaluate(() => (window.LCNDA_EXT.monographSections || []).filter(s => /^tr_/.test(s.id)).map(s => s.id));
            assert.deepStrictEqual(ids, ['tr_produits', 'tr_races', 'tr_coiffes', 'tr_ecoles']);
            const out = await p.evaluate(async () => { const h = document.createElement('div'); document.body.appendChild(h); const s = window.LCNDA_EXT.monographSections.find(x => x.id === 'tr_produits');
                const ok = await s.render({id: 1, name: 'Saint-Émilion', latitude: 44.894, longitude: -0.155}, h, {village: async () => ({insee: '33394'})}); const t = h.textContent; h.remove(); return {ok, t}; });
            assert.strictEqual(out.ok, true); assert.match(out.t, /Saint-Emilion/); assert.ok(!/🍷 Les produits de son terroir/.test(out.t), 'le titre est celui de la partie');
            const none = await p.evaluate(async () => { const h = document.createElement('div'); const s = window.LCNDA_EXT.monographSections.find(x => x.id === 'tr_produits'); return s.render({id: 0, name: 'Bruxelles', country: 'Belgique', latitude: 50.85, longitude: 4.35}, h, {}); });
            assert.strictEqual(none, false, 'rien pour une commune sans AOC');
        });
        await t('LCNDA_EXT.dataSources et dataLists : à la demande pour un lieu ou une personne ; listes avec source et carte', async () => {
            const ids = await p.evaluate(() => (window.LCNDA_EXT.dataSources || []).filter(d => /^tr_/.test(d.id)).map(d => d.id));
            assert.deepStrictEqual(ids, ['tr_produits', 'tr_races', 'tr_coiffes', 'tr_ecoles', 'tr_prenom', 'tr_terroir']);
            const txt = await p.evaluate(async () => { const h = document.createElement('div'); document.body.appendChild(h); await window.LCNDA_EXT.dataSources.find(d => d.id === 'tr_races').run({place: {name: 'Plozévet', county: 'Finistère', country: 'France'}}, h); const t = h.textContent; h.remove(); return t; });
            assert.match(txt, /Bretonne pie noir|Armoricaine|Froment du Léon/);
            const L = await p.evaluate(async () => Promise.all((window.LCNDA_EXT.dataLists || []).filter(d => /^tr_/.test(d.id)).map(async d => { const rows = await d.load(); return {id: d.id, n: rows.length, keys: d.fields.map(f => f.key), src: !!d.source, urls: d.fields.some(f => f.type === 'url'), geo: d.geo ? rows.filter(r => d.geo(r)).length : 0}; })));
            assert.deepStrictEqual(L.map(x => x.id), ['tr_aoc', 'tr_races', 'tr_coiffes', 'tr_ecoles', 'tr_prenoms']);
            assert.ok(L.every(x => x.src && x.urls), 'une source et un lien par ligne');
            assert.strictEqual(L[0].n, AOC.areas.length);
            if (EC) { assert.strictEqual(L[3].n, EC.rows.length); assert.ok(L[3].geo > L[3].n * 0.9, 'les écoles sur la carte'); assert.ok(L[3].keys.includes('founded')); }
        });
        await t('Réglages → 🌾 Son terroir : éteindre « Les produits de son terroir » le retire de la fiche ; À propos des données ; prénoms de la base', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'terroir'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-trr-settings] [data-trr-tg="aoc"] input', {timeout: 20000});
            await p.waitForFunction(() => /prénoms de ta base ont un sens connu/.test(document.querySelector('[data-trr-base]')?.textContent || ''), null, {timeout: 10000});
            const s = await p.textContent('[data-trr-settings]');
            assert.match(s, /Licence Ouverte/); assert.match(s, /CC0 1\.0/); assert.match(s, /CC BY-SA 4\.0/);
            console.log('   debug', await p.evaluate(() => { const i = document.querySelector('[data-trr-tg="aoc"] input'); const a = i.checked; i.click(); return [a, i.checked, document.querySelectorAll('[data-trr-tg="aoc"]').length, document.querySelectorAll('[data-trr-settings]').length]; }));
            await p.uncheck('[data-trr-tg="aoc"] input');
            assert.strictEqual(JSON.parse(await p.evaluate(() => localStorage.getItem('genealogie-terroir'))).aoc, false);
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('[data-trr-person="1"]', {timeout: 20000});
            await sleep(1200);
            assert.strictEqual(await p.$('[data-trr-person="1"] [data-trr-line="aoc"]'), null);
            await p.evaluate(() => localStorage.removeItem('genealogie-terroir'));
        });
        await t('pas d’erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
