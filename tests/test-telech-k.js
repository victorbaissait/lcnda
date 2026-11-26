#!/usr/bin/env node
/* 🌍 Le monde à côté (lot K « téléchargements ») — assets/js/heritage-telech-k.js, scripts/telech-k/*, assets/data/tk-*.json.gz ;
 *  et ce qu'il ajoute au lot E (heritage-telech-e.js : le ciel du monde tk-ciel, les sécheresses d'Amérique du Nord et d'Asie tk-secheresses).
 *  1. Node : les fichiers livrés (licence, source, date, dans le manifeste, liens http(s) seulement), le calcul (patrimoine près de ses
 *     lieux, clés de réunion Mérimée / RPCQ / Wikidata, fiche officielle sûre, œuvres de son métier et de son lieu, langues, cerisiers de
 *     Kyoto, prénoms garçon ici et fille ailleurs), le lot E prolongé (New York : ciel du monde, carreau de l'atlas d'Amérique du Nord).
 *  2. Serveur et écran (php -S + Playwright, base temporaire) : rien ne part sur Internet (toute requête hors 127.0.0.1 est comptée et
 *     coupée), ni pour une fiche vivante ni en consultation (pas de liens « chercher dans les collections ») ; fiche, village, listes
 *     (thèmes monuments / images / livres / ciel / noms, liste réunie « patrimoine_monde » avec Mérimée et le Québec), cartes, à la demande,
 *     Réglages (interrupteurs ↶, rayon ↶), 390 px et thème sombre, aucune erreur JavaScript.
 *  Fiches (noms inventés) : Jean LE GOFF (1850 Le Mont-Saint-Michel – 1920 Paris, forgeron), Andrea ROSSI (1880 Milan – 1950 New York),
 *  Mary SMITH (1870 New York – 1940 New York), Luc LE GOFF (vivant, 1990 Le Mont-Saint-Michel).
 *   node tests/test-telech-k.js */
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
const K = require('../assets/js/heritage-telech-k.js');
const E = require('../assets/js/heritage-telech-e.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const raw = n => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'assets/data', `${n}.json.gz`))).toString('utf8'));
const P = {msm: {id: 1, name: 'Le Mont-Saint-Michel', lat: 48.6361, lon: -1.5115, country: 'France'}, paris: {id: 2, name: 'Paris', lat: 48.8566, lon: 2.3522, country: 'France'},
    milan: {id: 3, name: 'Milan', lat: 45.4642, lon: 9.19, country: 'Italie'}, ny: {id: 4, name: 'New York', lat: 40.7128, lon: -74.006, country: 'États-Unis'}};
const ev = (tag, year, p) => ({tag, year, date: String(year), place_id: p.id, lat: p.lat, lon: p.lon, place: p.name, country: p.country});
const JEAN = {ok: true, person: {id: 1, first: 'Jean', gender: 'male', birth: 1850, death: 1920}, jobs: [{text: 'forgeron'}], events: [ev('BIRT', 1850, P.msm), ev('DEAT', 1920, P.paris)]};
const ANDREA = {ok: true, person: {id: 2, first: 'Andrea', gender: 'male', birth: 1880, death: 1950}, jobs: [], events: [ev('BIRT', 1880, P.milan), ev('DEAT', 1950, P.ny)]};
const LUC = {ok: true, person: {id: 4, first: 'Luc', gender: 'male', birth: 1990, death: null}, jobs: [], events: [ev('BIRT', 1990, P.msm)]};
const PACKS = ['tk-patrimoine_monde', 'tk-collections', 'tk-langues', 'tk-cerisiers', 'tk-prenoms', 'tk-ciel', 'tk-secheresses'];
const shipped = () => fs.readdirSync(path.join(root, 'assets/data')).filter(f => /^tk-.*\.json\.gz$/.test(f)).map(f => f.replace('.json.gz', ''));

(async () => {
    /* ═════════ 1. les fichiers et le calcul ═════════ */
    await t('fichiers livrés : présents, source, adresse, licence et date ; dans le manifeste (scripts/telech-k) ; liens http(s) seulement ; tailles sages', async () => {
        const man = JSON.parse(fs.readFileSync(path.join(root, 'assets/data/manifest.json'), 'utf8'));
        for (const n of [...new Set([...PACKS, ...shipped()])]) {
            const f = path.join(root, 'assets/data', `${n}.json.gz`); assert.ok(fs.existsSync(f), n); assert.ok(fs.statSync(f).size < 3e6, `${n} : ${fs.statSync(f).size} octets`);
            const m = raw(n); assert.ok(m.source && m.url && m.licence && m.licence_url && /^\d{4}-\d\d-\d\d$/.test(m.built), n);
            assert.ok(Array.isArray(m.rows) && (m.rows.length > 0 || n === 'tk-ciel'), n);
            assert.ok(man.packs[n] && man.packs[n].rows === m.rows.length && man.packs[n].script === 'scripts/telech-k', `${n} dans le manifeste`);
            assert.ok(/^https:\/\//.test(m.url) && /^https:\/\//.test(m.licence_url), `${n} : adresses https`);
        }
        assert.match(raw('tk-patrimoine_monde').licence, /CC0/); assert.match(raw('tk-collections').licence, /CC0/); assert.match(raw('tk-langues').licence, /CC BY 4\.0/);
        assert.match(raw('tk-prenoms').licence, /CC0/); assert.match(raw('tk-ciel').licence, /CC BY 4\.0/); assert.match(raw('tk-cerisiers').quote, /free of charge/);
        for (const n of shipped().filter(x => /^tk-patrimoine_/.test(x))) { const m = raw(n); for (const [p, [, f]] of Object.entries(m.registers)) { assert.match(p, /^P\d+$/); assert.match(f, /^https:\/\/[^\s"<>]+\$1/, `${n} ${p}`); } }
        assert.ok(raw('tk-collections').rows.every(r => Number.isInteger(r[0]) && r[0] > 0), 'identifiants du Met entiers');
    });
    await t('🏛 patrimoine : clés de réunion (registre > Q), fiche officielle sûre, Mont-Saint-Michel (patrimoine mondial) près de Jean LE GOFF', async () => {
        const M = raw('tk-patrimoine_monde'), rows = K.patRows(M);
        assert.ok(rows.length > 1000, `${rows.length} sites`);
        assert.strictEqual(K.patKey({reg: 'P1216:1234567', q: 'Q1'}), 'P1216:1234567'); assert.strictEqual(K.patKey({reg: 'x"<', q: 'Q5'}), 'Q5'); assert.strictEqual(K.patKey({q: 'javascript:'}), '');
        assert.strictEqual(K.merimeeKey('PA00110386'), 'P380:PA00110386'); assert.strictEqual(K.merimeeKey('bad'), '');
        assert.strictEqual(K.rpcqKey('https://www.patrimoine-culturel.gouv.qc.ca/rpcq/detail.do?methode=consulter&id=92629&type=bien'), 'P633:92629');
        const regs = {P1216: ['NHLE', 'https://historicengland.org.uk/listing/the-list/list-entry/$1'], P9: ['x', 'javascript:alert($1)']};
        assert.strictEqual(K.regUrl('P1216:1001', regs), 'https://historicengland.org.uk/listing/the-list/list-entry/1001');
        assert.strictEqual(K.regUrl('P9:1', regs), ''); assert.strictEqual(K.regUrl('P1216:a b"', regs), 'https://historicengland.org.uk/listing/the-list/list-entry/a%20b%22');
        const near = K.heritageNear(rows, JEAN, 5); assert.ok(near.some(x => /Mont-Saint-Michel/i.test(x.r.n)), JSON.stringify(near.slice(0, 3).map(x => x.r.n)));
        const msm = rows.find(r => /Mont-Saint-Michel/i.test(r.n) && r.reg); assert.ok(msm && /^P(380|757):/.test(msm.reg), JSON.stringify(msm));
        assert.ok(rows.filter(r => /^P380:/.test(r.reg)).length > 20, 'des sites de France gardent leur identifiant Mérimée (réunis avec Mérimée)');
        assert.deepStrictEqual(K.heritageNear(rows, LUC, 5).length > 0, true, 'le calcul ne juge pas : c’est l’écran qui refuse une fiche vivante');
    });
    await t('🎨 œuvres : son métier (forgeron → blacksmith) et son lieu (Paris) dans l’index du Met ; adresse de la fiche sûre', async () => {
        const C = raw('tk-collections'), rows = K.workRows(C);
        assert.ok(rows.length > 10000);
        const tr = K.worksForTrade(rows, JEAN); assert.ok(tr.length > 0 && tr.every(r => /smith|forge|farrier/i.test(r.t)), JSON.stringify(tr.slice(0, 3).map(r => r.t)));
        assert.ok(K.worksForPlace(rows, 'Paris').length > 20); assert.deepStrictEqual(K.worksForPlace(rows, 'Ré'), [], 'un nom trop court ne cherche rien');
        assert.strictEqual(K.workUrl({id: 436535}, C), 'https://www.metmuseum.org/art/collection/search/436535'); assert.strictEqual(K.workUrl({id: '1"x'}, C), '');
        assert.deepStrictEqual(K.tradeWords({jobs: [{text: 'rentier'}]}), []);
    });
    await t('🗣 🌸 👶 langues autour de Quimper (breton), cerisiers de Kyoto (1850), Andrea : homme en Italie, femme en France', async () => {
        const L = K.langRows(raw('tk-langues')); assert.ok(L.length > 7000);
        const q = K.near(L, 47.996, -4.102, 150, 5); assert.ok(q.some(x => /Breton/i.test(x.r.n)), JSON.stringify(q.map(x => x.r.n)));
        assert.strictEqual(K.glottoUrl('bret1244'), 'https://glottolog.org/resource/languoid/id/bret1244'); assert.strictEqual(K.glottoUrl('../x'), '');
        const KY = K.table(raw('tk-cerisiers')); assert.ok(KY[0].y === 812 && KY.length > 700);
        const c = K.cherry(KY, 1850); assert.ok(c && c.m >= 3 && c.m <= 5 && Number.isFinite(c.diff), JSON.stringify(c));
        const g = K.nameGender(K.table(raw('tk-prenoms')), 'Andrea Maria'); assert.ok(g.m.includes('IT') && g.f.includes('FR'), JSON.stringify(g));
        assert.strictEqual(K.nameGender(K.table(raw('tk-prenoms')), 'Jean-Pierre')?.n ?? 'jean', 'jean');
    });
    await t('🌌 🌾 le lot E prolongé : New York a un ciel (tk-ciel, le monde) et un carreau d’Amérique du Nord (tk-secheresses, NADA) ; Paris reste à l’Europe', async () => {
        const G = E.skyGrid(raw('te-ciel')); G.world = E.skyGrid(raw('tk-ciel'));
        assert.ok(E.skyAt(G, 40.7128, -74.006) > 1000, 'New York : ciel très clair'); assert.ok(E.skyAt(G, 48.8566, 2.3522) > 1000, 'Paris : grille d’Europe');
        assert.strictEqual(E.skyAt({...G, world: null}, 40.7128, -74.006), null, 'sans tk-ciel : rien hors d’Europe (comme avant)');
        const rows = [...E.table(raw('te-secheresses')), ...E.table(raw('tk-secheresses'))];
        const ny = E.cellAt(rows, 40.7128, -74.006); assert.ok(ny && ny.a === 'nada' && ny.s === 2.5, JSON.stringify(ny && {a: ny.a, lat: ny.lat, lon: ny.lon}));
        const pa = E.cellAt(rows, 48.8566, 2.3522); assert.ok(pa && !pa.a, 'Paris : Old World Drought Atlas');
        const MARY = {person: {birth: 1870, death: 1940}, events: []}; const L = E.droughtLife(ny, MARY); assert.ok(L && L.years.length > 50, 'les étés de sa vie à New York');
        const hk = E.cellAt(rows, 22.3, 114.17); assert.ok(hk && hk.a === 'mada', 'Hong Kong : atlas des moussons');
    });

    /* ═════════ 2. serveur et écran ═════════ */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-tk-'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start,occupation) VALUES(1,'Jean','LE GOFF','male','deceased',1,'forgeron'),(2,'Andrea','ROSSI','male','deceased',0,''),(3,'Mary','SMITH','female','deceased',0,''),(4,'Luc','LE GOFF','male','living',0,'')");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code) VALUES(1,'Le Mont-Saint-Michel','Manche','France',48.6361,-1.5115,'50353'),(2,'Paris','Paris','France',48.8566,2.3522,'75056'),(3,'Milan','Lombardie','Italie',45.4642,9.19,''),(4,'New York','New York','États-Unis',40.7128,-74.006,'')");
$t = function ($tag) use ($pdo) { $i = (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn(); return $i ?: (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='BIRT' LIMIT 1")->fetchColumn(); };
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)");
foreach ([[1,'BIRT','1850',1850,'1850',1],[1,'DEAT','1920',1920,'1920',2],[2,'BIRT','1880',1880,'1880',3],[2,'DEAT','1950',1950,'1950',4],[3,'BIRT','1870',1870,'1870',4],[3,'DEAT','1940',1940,'1940',4],[4,'BIRT','1990',1990,'1990',1]] as [$p,$g,$dt,$y,$sd,$pl]) { $ins->execute([$p,$t($g),$dt,$y,$sd,$pl]); }
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
        await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => { outside.push(r.request().url()); return r.abort(); }); // pas d'Internet : tout ce qui sortirait est compté
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        p.on('console', m => { if (m.type() === 'error' && /Failed to fetch|tk-|telech-k/i.test(m.text())) errs.push(m.text()); });
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultPersonBlocks && window.LCNDA_EXT?.telechK && window.LCNDA_EXT?.telechE, null, {timeout: 30000});
        const into = (mod, fn, arg, opts = {}) => p.evaluate(async ([m, f, a, o]) => { const h = document.createElement('div'); document.body.appendChild(h); const n = await window.LCNDA_EXT[m][f](h, a, {detached: true, ...o}); const r = [n, h.innerHTML, h.textContent]; h.remove(); return r; }, [mod, fn, arg, opts]);

        await t('fiche de Jean LE GOFF : 🏛 le Mont-Saint-Michel (patrimoine mondial), 🎨 des forgerons au Met, 🌸 Kyoto 1850 ; ↗ source ; liens sûrs ; aucune image', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('[data-tkx-person="1"] .tkx-row', {timeout: 30000});
            await sleep(500);
            const txt = await p.textContent('[data-tkx-person="1"]');
            assert.match(txt, /Mont-Saint-Michel/); assert.match(txt, /patrimoine mondial/); assert.match(txt, /forgeron/); assert.match(txt, /cerisiers de Kyoto/); assert.match(txt, /↗ source/);
            const html = await p.innerHTML('[data-tkx-person="1"]');
            assert.match(html, /target="_blank" rel="noopener noreferrer"/); assert.ok(!/href="(?!https?:)/.test(html), 'seulement des liens http(s)'); assert.ok(!/<img/.test(html), 'aucune image');
        });
        await t('Andrea ROSSI (Milan → New York) : son prénom (homme en Italie, femme en France), langues autour de Milan ; lot E : le ciel et les étés de New York (Mary SMITH)', async () => {
            const [n, , a] = await into('telechK', 'personInto', 2); assert.ok(n >= 2, a); assert.match(a, /prénom d’homme en .*Italie/); assert.match(a, /Autour de Milan/);
            const [ne, , m] = await into('telechE', 'personInto', 3, {parts: ['ciel', 'secheresses'], force: true}); assert.ok(ne >= 2, m);
            assert.match(m, /New York/); assert.match(m, /étoiles/); assert.match(m, /cernes des arbres/); assert.match(m, /250 km/);
            const [, h] = await into('telechE', 'personInto', 3, {parts: ['secheresses'], force: true}); assert.match(h, /paleo-search\/study\/6319/, 'source : North American Drought Atlas');
        });
        await t('Luc LE GOFF (vivant), confidentiel et mode consultation : rien, aucun lien « chercher dans les collections » ; rien ne part sur Internet', async () => {
            const k = await ctx.newPage(); k.on('pageerror', e => errs.push(e.message));
            await k.goto(base); await k.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.telechK, null, {timeout: 30000});
            await k.waitForLoadState('networkidle').catch(() => {}); await sleep(800);
            const n0 = outside.length;
            const run = (fn, a, o = {}) => k.evaluate(async ([f, x, oo]) => { const h = document.createElement('div'); document.body.appendChild(h); const n = await window.LCNDA_EXT.telechK[f](h, x, {detached: true, ...oo}); const t = h.innerHTML; h.remove(); return [n, t]; }, [fn, a, o]);
            const [nl, luc] = await run('personInto', 4); assert.strictEqual(nl, 0, luc);
            const [np] = await run('personInto', 1, {private: true}); assert.strictEqual(np, 0, 'fiche confidentielle : rien');
            const [, open] = await run('placeInto', {id: 3, name: 'Milan', lat: 45.4642, lon: 9.19, foreign: true}); assert.match(open, /collections ouvertes \(en ligne\)/, 'hors consultation : les liens existent (sur un clic)');
            await k.evaluate(() => document.body.classList.add('is-kiosk'));
            const [, kh] = await run('placeInto', {id: 3, name: 'Milan', lat: 45.4642, lon: 9.19, foreign: true}); assert.ok(!/en ligne\)/.test(kh), 'consultation : pas de liens vers les collections en ligne');
            const [, kp] = await run('personInto', 1); assert.ok(!/collections ouvertes/.test(kp));
            assert.deepStrictEqual(outside.slice(n0).filter(u => !/^https:\/\/[a-z]\.?tile\.|^https:\/\/tile\./.test(u)), [], 'rien sur Internet');
            assert.ok(await k.evaluate(() => window.LCNDA_EXT.dataSources.filter(d => /^tkx/.test(d.id)).every(d => d.online === false)), 'à la demande : rien en ligne');
            await k.close();
        });
        await t('village, monographie, listes (thèmes ; liste réunie « Patrimoine du monde » : Mérimée, Québec, Wikidata), cartes, à la demande', async () => {
            const [n, , txt] = await into('telechK', 'placeInto', {id: 1, name: 'Le Mont-Saint-Michel', lat: 48.6361, lon: -1.5115});
            assert.ok(n >= 1, txt); assert.match(txt, /biens? protégés?/);
            const reg = await p.evaluate(() => { const E = window.LCNDA_EXT; const M = (E.dataListMerges || []).find(m => m.id === 'patrimoine_monde');
                return {lists: E.dataLists.filter(s => /^tk_/.test(s.id)).map(s => [s.id, s.theme]), merge: M ? {theme: M.theme, by: M.same.by, src: M.sources.map(s => [s.list, s.rank])} : null,
                    into: E.dataLists.filter(s => s.merge?.into === 'patrimoine_monde').map(s => [s.id, s.merge.rank]),
                    mono: E.monographSections.filter(s => /^tkx_/.test(s.id)).length, maps: E.mapLayerSources.filter(s => /^tkx_/.test(s.id)).length, ds: E.dataSources.filter(s => /^tkx/.test(s.id)).length,
                    village: (E.villageSectionDefs || []).some(d => d.id === 'tkx_place'), block: (window.LCNDA_APP.defaultPersonBlocks || []).some(b => b[0] === 'telech_k'),
                    themes: (E.dataListThemes || []).map(x => x.id)}; });
            assert.deepStrictEqual(reg.lists, [['tk_patrimoine', 'monuments'], ['tk_musees', 'images'], ['tk_langues', 'livres'], ['tk_cerisiers', 'ciel'], ['tk_prenoms', 'noms']]);
            for (const [, th] of reg.lists) assert.ok(!reg.themes.length || reg.themes.includes(th), `thème ${th} connu`);
            assert.deepStrictEqual(reg.merge, {theme: 'monuments', by: 'key', src: [['lp_merimee', 1], ['l10t_quebec', 1]]}); assert.deepStrictEqual(reg.into, [['tk_patrimoine', 2]]);
            assert.ok(reg.mono === 3 && reg.maps === 3 && reg.ds >= 7 && reg.village && reg.block, JSON.stringify(reg));
            const L = await p.evaluate(async () => { const d = window.LCNDA_EXT.dataLists.find(x => x.id === 'tk_patrimoine'); const r = await d.load(); const m = r.find(x => /Mont-Saint-Michel/i.test(x.name) && x.official); return [r.length, m, d.merge.row(m)]; });
            assert.ok(L[0] > 1000); assert.match(L[1].official, /^https:\/\/(www\.)?(pop\.culture\.gouv\.fr|whc\.unesco\.org)\//); assert.match(L[2].key, /^P(380|757):/);
            const Me = await p.evaluate(() => { const M = window.LCNDA_EXT.dataListMerges.find(m => m.id === 'patrimoine_monde'); return [M.sources[0].row({ref: 'PA00110386', name: 'Abbaye', commune: 'Le Mont-Saint-Michel', protection: 'classement par liste de 1862', lat: 48.63, lon: -1.51, url: 'https://pop.culture.gouv.fr/notice/merimee/PA00110386'}),
                M.sources[1].row({rpcq: 'https://www.patrimoine-culturel.gouv.qc.ca/rpcq/detail.do?methode=consulter&id=92629&type=bien', name: 'Maison', year: 1750, url: 'https://www.wikidata.org/wiki/Q1'})]; });
            assert.strictEqual(Me[0].key, 'P380:PA00110386'); assert.match(Me[0].kind, /classé/); assert.strictEqual(Me[1].key, 'P633:92629');
            const W = await p.evaluate(async () => { const d = window.LCNDA_EXT.dataLists.find(x => x.id === 'tk_musees'); const v = d.views.find(x => x.id === 'oeuvres'); const r = await v.load(); return [d.views.map(x => x.id), r.length, r[0]]; });
            assert.deepStrictEqual(W[0], ['musees', 'oeuvres']); assert.ok(W[1] > 10000); assert.match(W[2].src, /^https:\/\/www\.metmuseum\.org\//);
            const Mp = await p.evaluate(async () => (await window.LCNDA_EXT.mapLayerSources.find(x => x.id === 'tkx_patrimoine').run({bbox: [-1.6, 48.6, -1.4, 48.7]})).features.map(f => f.label));
            assert.ok(Mp.some(x => /Mont-Saint-Michel/i.test(x)), JSON.stringify(Mp));
            const y = await p.evaluate(async () => { const s = window.LCNDA_EXT.dataSources.find(d => d.id === 'tkxp_monde'); const h = document.createElement('div'); await s.run({person: {id: 2}}, h); return h.textContent; });
            assert.match(y, /Andrea/);
        });
        await t('Réglages → 🌍 : chaque sujet s’éteint (genealogie-telech-k), ↶ Annuler ; le rayon du patrimoine (5 → 2 km) ↶ ; À propos des données ; en lien seulement', async () => {
            await p.evaluate(() => window.LCNDA_EXT.telechK.openSettings());
            await p.waitForSelector('[data-tkx-settings-page] [data-tkx-tg="cerisiers"]', {timeout: 20000});
            const st = await p.textContent('[data-tkx-settings-page]');
            assert.match(st, /CC0/); assert.match(st, /CC BY 4\.0/); assert.match(st, /En lien seulement/); assert.match(st, /Racinet/); assert.match(st, /rien ne part sur Internet/); assert.match(st, /Pays pas encore fabriqués/);
            await p.click('[data-tkx-tg="cerisiers"] input');
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-telech-k')).cerisiers), false);
            const [, , txt] = await into('telechK', 'personInto', 1); assert.ok(!/cerisiers de Kyoto/.test(txt), 'éteint : plus les cerisiers');
            await p.locator('.toast button:has-text("Annuler")').last().click({timeout: 5000}).catch(() => {});
            await sleep(300);
            assert.notStrictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-telech-k') || '{}').cerisiers), false, '↶ Annuler le rallume');
            await p.waitForSelector('[data-tkx-km="km"]'); await p.fill('[data-tkx-km="km"]', '2'); await p.dispatchEvent('[data-tkx-km="km"]', 'change');
            assert.strictEqual(await p.evaluate(() => window.LCNDA_EXT.telechK.radius()), 2);
            await p.locator('.toast:has-text("2 km") button:has-text("Annuler")').last().click({timeout: 5000});
            await sleep(300);
            assert.strictEqual(await p.evaluate(() => window.LCNDA_EXT.telechK.radius()), 5, '↶ remet 5 km');
        });
        await t('390 px et thème sombre : les blocs tiennent dans l’écran, rien collé aux bords, lisible', async () => {
            const m = await browser.newContext({viewport: {width: 390, height: 844}, colorScheme: 'dark'});
            await m.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => { outside.push(r.request().url()); return r.abort(); });
            const q = await m.newPage(); q.on('pageerror', e => errs.push(e.message));
            await q.goto(base, {timeout: 90000}); await q.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.telechK, null, {timeout: 60000});
            await q.waitForLoadState('networkidle').catch(() => {}); await sleep(1500);
            await q.evaluate(async () => { document.documentElement.dataset.theme = 'dark'; const ws = document.getElementById('workspace'); const h = document.createElement('div'); h.id = 'tk-essai'; ws.prepend(h);
                const a = document.createElement('div'), b = document.createElement('div'); h.append(a, b);
                await window.LCNDA_EXT.telechK.placeInto(a, {id: 3, name: 'Milan', lat: 45.4642, lon: 9.19, foreign: true}); await window.LCNDA_EXT.telechK.personInto(b, 1);
                h.querySelectorAll('details').forEach(d => { d.open = true; }); h.scrollIntoView(); window.__tkEssai = h; });
            const r = await q.evaluate(() => { const h = window.__tkEssai; if (!h.isConnected) document.getElementById('workspace').prepend(h); const over = [...h.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1).map(e => e.className || e.tagName).slice(0, 5);
                const row = h.querySelector('.tkx-row').getBoundingClientRect(); const cs = getComputedStyle(h.querySelector('.hist-t p')); return {over, left: row.left, right: window.innerWidth - row.right, color: cs.color, docW: document.documentElement.scrollWidth}; });
            assert.deepStrictEqual(r.over, []); assert.ok(r.left >= 8 && r.right >= 8, JSON.stringify(r)); assert.ok(r.docW <= 391, `largeur ${r.docW}`);
            assert.ok(!/rgb\(0, 0, 0\)/.test(r.color), `texte lisible en sombre : ${r.color}`);
            await m.close();
        });
        await t('aucune erreur JavaScript, aucun « Failed to fetch » ; rien n’est parti sur Internet', async () => { assert.deepStrictEqual(errs, []);
            // les images des pièces (« La pièce dans sa poche », un autre module) mises à part : rien de ce lot n'est demandé en ligne
            assert.deepStrictEqual(outside.filter(u => /metmuseum|wikidata|glottolog|unesco|si\.edu|artic\.edu|clevelandart|nga\.gov|rijksmuseum|smk\.dk|europeana|tepapa|wellcome|parismusees|noaa\.gov|zenodo|dataverse|toolforge/.test(u)), []); });
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(fails ? `${fails} essai(s) raté(s).` : 'Le monde à côté : tout va bien.');
    process.exit(fails ? 1 : 0);
})();
