#!/usr/bin/env node
/* 🏆 Sport et Expositions (lot M « téléchargements ») — assets/js/heritage-telech-m.js, scripts/telech-m/*, assets/data/ts-*.json.gz, tx-*.json.gz ;
 *  et ce qu'il change dans « 🎡 Le monde de son village » (heritage-lot8-monde-village.js : rayon du Tour réglable, 15 km ; vainqueurs).
 *  1. Node : les fichiers livrés (licence, source, date, dans le manifeste), le Tour (1976 = « 22 étapes + prologue », 27 tronçons ;
 *     Van Impe ; 1999-2005 « titre retiré » ; vainqueur d'étape), les Expositions (les 22 lignes choisies à la main gardées, les
 *     Expositions des produits de l'industrie 1798-1849, les expositions coloniales dites franchement), le calcul (ce jour-là, les Jeux de
 *     sa vie, le sport près de chez lui, les sportifs de son village, un homonyme champion seulement pour une personne décédée).
 *  2. Serveur et écran (php -S + Playwright, base temporaire) : rien ne part sur Internet (toute requête hors 127.0.0.1 est comptée et
 *     coupée), ni pour une fiche vivante ni en mode consultation ; fiche, village (Tulle à 15 km, réglable), listes (thème sport / fetes,
 *     liste réunie « competitions »), cartes, à la demande, Réglages (interrupteurs ↶, rayon ↶), 390 px et thème sombre, aucune erreur
 *     JavaScript, aucun « Failed to fetch ».
 *  Fiches (noms inventés, sauf l'homonyme) : Jean MAZAUD (1912 Tulle – 1990 Gimel-les-Cascades, marié à Tulle le 15 juillet 1976),
 *  Marie LACOMBE (1890 Colombes – 1960 Paris), Paul DURAND (1885 Roubaix – 1960 Roubaix, tisserand), Maurice GARIN (1871 – 1957 Lens :
 *  homonyme du vainqueur du Tour 1903), Luc MAZAUD (vivant, 1990 Tulle).
 *   node tests/test-telech-m.js */
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
const H = require('../assets/js/heritage-telech-m.js');
const L8 = require('../assets/js/heritage-lot8-monde-village.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const raw = n => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'assets/data', `${n}.json.gz`))).toString('utf8'));
const rows = n => H.table(raw(n));
const comps = () => rows('ts-competitions').map(r => ({...r, w: r.w || []}));
const matches = () => { const f = raw('ts-matchs'); return f.rows.map(r => ({d: r[0], h: f.teams[r[1]], a: f.teams[r[2]], hs: r[3], as: r[4], t: f.tournaments[r[5]], city: r[6], cty: f.countries[r[7]], so: r[9] >= 0 ? f.teams[r[9]] : '', lat: r[10], lon: r[11], ins: r[12]})); };
const P = {tulle: {id: 1, name: 'Tulle', lat: 45.2670, lon: 1.7680, insee: '19272'}, gimel: {id: 2, name: 'Gimel-les-Cascades', lat: 45.2989, lon: 1.8536, insee: '19085'},
    colombes: {id: 3, name: 'Colombes', lat: 48.9226, lon: 2.2522, insee: '92025'}, paris: {id: 4, name: 'Paris', lat: 48.8566, lon: 2.3522, insee: '75056'},
    roubaix: {id: 5, name: 'Roubaix', lat: 50.6942, lon: 3.1746, insee: '59512'}, lens: {id: 6, name: 'Lens', lat: 50.4320, lon: 2.8333, insee: '62498'}, lemans: {id: 7, name: 'Le Mans', lat: 48.0061, lon: 0.1996, insee: '72181'}};
const ev = (tag, year, p, date = '') => ({tag, year, date, place_id: p.id, lat: p.lat, lon: p.lon, place: p.name, insee: p.insee, country: 'France'});
const JEAN = {ok: true, person: {id: 1, first: 'Jean', last: 'MAZAUD', gender: 'male', birth: 1912, death: 1990}, jobs: [{text: 'cultivateur'}], events: [ev('BIRT', 1912, P.tulle), ev('MARR', 1976, P.tulle, '1976-07-15'), ev('RESI', 1960, P.gimel), ev('DEAT', 1990, P.gimel)]};
const MARIE = {ok: true, person: {id: 2, first: 'Marie', last: 'LACOMBE', gender: 'female', birth: 1890, death: 1960}, jobs: [], events: [ev('BIRT', 1890, P.colombes), ev('RESI', 1938, P.colombes), ev('DEAT', 1960, P.paris)]};
const PAUL = {ok: true, person: {id: 3, first: 'Paul', last: 'DURAND', gender: 'male', birth: 1885, death: 1960}, jobs: [{text: 'tisserand'}], events: [ev('BIRT', 1885, P.roubaix), ev('DEAT', 1960, P.roubaix)]};
const GARIN = {ok: true, person: {id: 4, first: 'Maurice', last: 'GARIN', gender: 'male', birth: 1871, death: 1957}, jobs: [], events: [ev('RESI', 1900, P.lens), ev('DEAT', 1957, P.lens)]};
const LUC = {ok: true, person: {id: 5, first: 'Luc', last: 'MAZAUD', gender: 'male', birth: 1990, death: null}, jobs: [], events: [ev('BIRT', 1990, P.tulle)]};
const PACKS = ['ts-competitions', 'ts-etapes', 'ts-matchs', 'ts-jo', 'ts-athletes', 'tx-expos'];

(async () => {
    /* ═════════ 1. les fichiers et le calcul ═════════ */
    await t('fichiers livrés : présents, source, adresse, licence et date ; dans le manifeste (scripts/telech-m) ; liens http(s) seulement', async () => {
        const man = JSON.parse(fs.readFileSync(path.join(root, 'assets/data/manifest.json'), 'utf8'));
        for (const n of PACKS) {
            const f = path.join(root, 'assets/data', `${n}.json.gz`); assert.ok(fs.existsSync(f), n); assert.ok(fs.statSync(f).size < 2e6, n);
            const m = raw(n); assert.ok(m.source && m.url && m.licence && m.licence_url && /^\d{4}-\d\d-\d\d$/.test(m.built), n); assert.ok(m.rows.length > 0, n);
            assert.ok(man.packs[n] && man.packs[n].rows === m.rows.length && man.packs[n].script === 'scripts/telech-m', `${n} dans le manifeste`);
            assert.ok(/^https:\/\//.test(m.url) && /^https:\/\//.test(m.licence_url), `${n} : adresses https`);
        }
        assert.match(raw('ts-matchs').licence, /CC0/); assert.match(raw('ts-competitions').licence, /CC0/); assert.match(raw('ts-competitions').licence, /CC BY-SA 4\.0/);
        const C = raw('ts-competitions');
        assert.ok(C.comps.length >= 25, `${C.comps.length} compétitions`);
        assert.ok(C.link_only.some(x => x.id === 'tennis_matchs' && /NC/.test(x.why)) && C.link_only.some(x => x.id === 'f1' && /NC/.test(x.why)), 'Sackmann et jolpica : liens seulement');
        for (const r of rows('tx-expos')) for (const c of r.cat || []) assert.match(c[0], /^[A-Za-z0-9._-]+$/, 'identifiant Internet Archive sûr');
        assert.ok(rows('ts-athletes').every(a => /^Q\d+$/.test(a.q) && /^(\d{5}|2[AB]\d{3})$/.test(a.ins)));
    });
    await t('🚲 le Tour : 1976 = 22 étapes + prologue (27 tronçons, 5a/5b, 18a/18b/18c), Van Impe ; 1903 Garin ; 1999-2005 « titre retiré » ; vainqueurs d’étape', async () => {
        const E = H.tourEditions(L8.table(raw('l8c-tour')), comps());
        const e76 = E.find(e => e.y === 1976); assert.strictEqual(e76.n, 22); assert.strictEqual(e76.prologue, true); assert.strictEqual(e76.parts, 27);
        assert.deepStrictEqual(e76.stages.map(s => s.label).filter(l => /[a-c]$/.test(l)), ['5a', '5b', '18a', '18b', '18c', '22a', '22b']);
        assert.match(e76.winners[0][0], /Van Impe/); assert.match(E.find(e => e.y === 1903).winners[0][0], /Garin/); assert.strictEqual(E.find(e => e.y === 1924).n, 15);
        for (let y = 1999; y <= 2005; y++) { const e = E.find(x => x.y === y); assert.ok(e.retired && !e.winners.length, `${y} : titre retiré`); }
        const S = rows('ts-etapes'); assert.ok(S.length > 1500, `${S.length} étapes`);
        const tour = new Set(L8.table(raw('l8c-tour')).map(s => s.q)); assert.ok(S.filter(s => tour.has(s.s)).length > 1500, 'mêmes étapes que l8c-tour (pas recopiées)');
        assert.ok(!fs.readFileSync(path.join(root, 'assets/js/heritage-telech-m.js'), 'utf8').includes('passé devant'), 'jamais « passé devant chez lui »');
    });
    await t('🏆 les compétitions : JO (Paris 1924), Coupe du monde (finale), Roland-Garros, Mans, Arc, Six Nations… ; pays ≠ lieu (pas de position)', async () => {
        const C = comps(), by = c => C.filter(r => r.c === c);
        assert.ok(by('jo').some(r => r.y === 1924 && /Paris/.test(r.place) && r.lat), 'JO 1924 Paris');
        assert.ok(by('wc').find(r => r.y === 1998).w[0][0].match(/France/), 'Coupe du monde 1998');
        assert.ok(by('rg').length > 100 && by('rg').find(r => r.y === 1983).w.some(w => /Noah/.test(w[0])), 'Roland-Garros 1983 : Noah');
        assert.ok(by('lemans').length > 80 && by('arc').some(r => r.y === 1920), 'Le Mans, l’Arc depuis 1920');
        assert.ok(by('6n').length > 100 && by('6n').every(r => r.lat === null), 'Six Nations : un pays n’est pas un lieu');
        assert.ok(by('top14').every(r => r.lat === null) && by('tdf').every(r => r.lat === null));
        assert.ok(C.every(r => r.y >= 1850 && r.y <= 2026));
    });
    await t('🎪 Expositions : les 22 de l8c-expos marquées (pas recopiées), produits de l’industrie 1798-1849, coloniales dites franchement, régionales', async () => {
        const X = rows('tx-expos'), hand = L8.table(raw('l8c-expos'));
        assert.ok(X.length > 150, `${X.length} expositions`);
        assert.ok(hand.filter(e => e.q).every(e => X.some(r => r.q === e.q && r.hand === 1) || !X.some(r => r.q === e.q)), 'les lignes choisies à la main sont marquées');
        const prod = X.filter(r => r.k === 'produits'); assert.ok(prod.length >= 10 && prod[0].y === 1798 && prod.at(-1).y === 1849, JSON.stringify(prod.map(r => r.y)));
        assert.ok(prod.every(r => /exposants/.test(r.line)), 'la ligne de Wikipédia recopiée');
        const col = X.filter(r => r.k === 'coloniale'); assert.ok(col.length >= 10, `${col.length} coloniales`);
        assert.ok(col.some(r => /Marseille/.test(r.city || r.n)), 'Marseille');
        assert.ok(raw('tx-expos').zoo.refs.length >= 2 && /Zoo_humain/.test(raw('tx-expos').zoo.url), 'source sérieuse citée');
        assert.ok(X.some(r => r.y === 1894 && /Lyon/.test(r.city || r.n)), 'Lyon 1894');
    });
    await t('📅 🏅 📍 calcul : Jean marié le 15 juillet 1976 → le Tour arrive à Tulle ; Marie → Colombes (JO 1924, matchs) ; Paul → Paris-Roubaix ; Luc (vivant) : rien', async () => {
        const S = L8.table(raw('l8c-tour')), Mt = matches(), C = comps();
        const day = H.sameDay(JEAN, {stages: S, matches: Mt, comps: C}); assert.ok(day.some(x => x.kind === 'mariage' && x.items.some(i => i.k === 'stage' && /Tulle/.test(i.s.b))), JSON.stringify(day).slice(0, 300));
        const J = H.gamesOfLife(C, MARIE); assert.ok(J.some(x => x.c.y === 1924 && x.c.c === 'jo' && x.age === 34), JSON.stringify(J.slice(0, 2).map(x => [x.c.n, x.age])));
        const M = H.matchesNear(Mt, MARIE, 15); assert.ok(M.some(x => /Colombes/.test(x.r.city) && x.r.d.startsWith('1938')), 'Coupe du monde 1938 à Colombes');
        const R = H.compsNear(C, PAUL, 15); assert.ok(R.some(g => g.c === 'roubaix' && g.eds.length > 40), JSON.stringify(R.map(g => [g.c, g.eds.length])));
        const tn = H.tourNear(S, JEAN, 15); assert.ok(tn.some(x => x.s.y === 1976 && /Tulle/.test(x.town)), 'étape de 1976 à Tulle');
        assert.ok(H.tourNear(S, JEAN, 15).every(x => x.km <= 15));
        assert.strictEqual(H.past(LUC), false); assert.strictEqual(H.past(JEAN), true);
    });
    await t('🏃 🔎 calcul : sportifs nés à Roubaix ; homonyme « Maurice Garin » (décédé) trouvé, jamais pour une fiche vivante', async () => {
        const A = rows('ts-athletes'); const list = H.athletesOf(A, H.birthPlace(PAUL)); assert.ok(list.length > 5 && list.every(a => a.ins === '59512'), `${list.length}`);
        const C = comps(); const cands = C.flatMap(c => c.w.map(w => ({n: w[0], b: null, q: w[1], why: `${c.c} ${c.y}`})));
        const h = H.homonyms(H.nameIndex(cands), GARIN); assert.ok(h.some(x => /tdf 1903/.test(x.why)), JSON.stringify(h));
        assert.deepStrictEqual(H.homonyms(H.nameIndex(cands), {...GARIN, person: {...GARIN.person, last: 'GARINE'}}), []);
        assert.ok(H.isArtisan(PAUL) && !H.isArtisan(JEAN));
        assert.strictEqual(H.safeUrl('javascript:alert(1)'), ''); assert.strictEqual(H.safeUrl('https://a.b/"onx'), '');
    });

    /* ═════════ 2. serveur et écran ═════════ */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-tm-'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start,occupation) VALUES(1,'Jean','MAZAUD','male','deceased',1,'cultivateur'),(2,'Marie','LACOMBE','female','deceased',0,''),(3,'Paul','DURAND','male','deceased',0,'tisserand'),(4,'Maurice','GARIN','male','deceased',0,''),(5,'Luc','MAZAUD','male','living',0,'')");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code) VALUES(1,'Tulle','Corrèze','France',45.2670,1.7680,'19272'),(2,'Gimel-les-Cascades','Corrèze','France',45.2989,1.8536,'19085'),(3,'Colombes','Hauts-de-Seine','France',48.9226,2.2522,'92025'),(4,'Paris','Paris','France',48.8566,2.3522,'75056'),(5,'Roubaix','Nord','France',50.6942,3.1746,'59512'),(6,'Lens','Pas-de-Calais','France',50.4320,2.8333,'62498'),(7,'Le Mans','Sarthe','France',48.0061,0.1996,'72181')");
$t = function ($tag) use ($pdo) { $i = (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn(); return $i ?: (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='BIRT' LIMIT 1")->fetchColumn(); };
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)");
foreach ([[1,'BIRT','1912',1912,'1912',1],[1,'MARR','15 juillet 1976',1976,'1976-07-15',1],[1,'RESI','1960',1960,'1960',2],[1,'DEAT','1990',1990,'1990',2],[2,'BIRT','1890',1890,'1890',3],[2,'RESI','1938',1938,'1938',3],[2,'DEAT','1960',1960,'1960',4],
          [3,'BIRT','1885',1885,'1885',5],[3,'DEAT','1960',1960,'1960',5],[4,'RESI','1900',1900,'1900',6],[4,'DEAT','1957',1957,'1957',6],[5,'BIRT','1990',1990,'1990',1]] as [$p,$g,$dt,$y,$sd,$pl]) { $ins->execute([$p,$t($g),$dt,$y,$sd,$pl]); }
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
        p.on('console', m => { if (m.type() === 'error' && /Failed to fetch|ts-|tx-|telech-m|l8c/i.test(m.text())) errs.push(m.text()); });
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultPersonBlocks && window.LCNDA_EXT?.telechM && window.LCNDA_EXT?.lot8MondeVillage, null, {timeout: 30000});
        const into = (mod, fn, arg, opts = {}) => p.evaluate(async ([m, f, a, o]) => { const h = document.createElement('div'); document.body.appendChild(h); const n = await window.LCNDA_EXT[m][f](h, a, {detached: true, ...o}); const r = [n, h.innerHTML, h.textContent]; h.remove(); return r; }, [mod, fn, arg, opts]);

        await t('fiche de Jean MAZAUD : 📅 le jour de son mariage, le Tour arrive à Tulle ; 🏅 les Jeux de sa vie ; ↗ source ; ▸ plus ; liens sûrs', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('[data-tsx-person="1"] .tsx-row', {timeout: 30000});
            await sleep(500);
            const txt = await p.textContent('[data-tsx-person="1"]');
            assert.match(txt, /Le jour de son mariage \(15 juillet 1976\)/); assert.match(txt, /Tulle/); assert.match(txt, /Jeux olympiques/); assert.match(txt, /↗ source/);
            const html = await p.innerHTML('[data-tsx-person="1"]');
            assert.match(html, /target="_blank" rel="noopener noreferrer"/); assert.ok(!/href="(?!https?:)/.test(html), 'seulement des liens http(s)');
            assert.ok(!/passé devant/.test(txt));
        });
        await t('🎡 Le monde de son village (l8c) : à 15 km le Tour arrive à Tulle « à N km de Gimel » ; maillot jaune de sa naissance ; jamais « devant chez lui »', async () => {
            const [n, , txt] = await into('lot8MondeVillage', 'personInto', 1, {parts: ['tour'], force: true});
            assert.ok(n >= 1, txt); assert.match(txt, /Tour de France/); assert.ok(!/devant/.test(txt));
            assert.match(txt, /L’année de sa naissance \(1912\), .+ gagnait le Tour de France\./);
        });
        await t('Marie (Colombes) : matchs et Jeux à Colombes ; Paul (Roubaix, tisserand) : Paris-Roubaix, sportifs nés à Roubaix, catalogues d’exposants ; Maurice GARIN : homonyme', async () => {
            const [n, , txt] = await into('telechM', 'personInto', 2); assert.ok(n >= 2, txt); assert.match(txt, /Colombes/); assert.match(txt, /Jeux olympiques/);
            const [, html, paul] = await into('telechM', 'personInto', 3); assert.match(paul, /Paris-Roubaix/); assert.match(paul, /Né aussi à Roubaix|sportifs/); assert.match(html, /archive\.org\/details\//);
            const [, , g] = await into('telechM', 'personInto', 4); assert.match(g, /homonyme champion|Même nom/); assert.match(g, /Garin/);
        });
        await t('Luc MAZAUD (vivant) et mode consultation : rien (ni homonyme, ni lieu) ; rien ne part sur Internet', async () => {
            const k = await ctx.newPage(); k.on('pageerror', e => errs.push(e.message));
            await k.goto(base); await k.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.telechM, null, {timeout: 30000});
            await k.waitForLoadState('networkidle').catch(() => {}); await sleep(800);
            const n0 = outside.length;
            const run = (fn, a, o = {}) => k.evaluate(async ([f, x, oo]) => { const h = document.createElement('div'); document.body.appendChild(h); const n = await window.LCNDA_EXT.telechM[f](h, x, {detached: true, ...oo}); const t = h.textContent; h.remove(); return [n, t]; }, [fn, a, o]);
            const [nl, luc] = await run('personInto', 5); assert.strictEqual(nl, 0, luc);
            const [np] = await run('personInto', 4, {private: true}); assert.strictEqual(np, 0, 'fiche confidentielle : rien');
            const r = await k.evaluate(() => window.LCNDA_APP.api('kiosk_enter', {}, {method: 'POST', body: {password: 'essai-1234'}}).then(() => 'ok').catch(e => e.message));
            await k.evaluate(() => document.body.classList.add('is-kiosk'));
            const [, gk] = await run('personInto', 4); assert.ok(!/homonyme|Même nom/.test(gk), 'consultation : pas de comparaison de noms');
            await run('placeInto', {id: 5, name: 'Roubaix', lat: 50.6942, lon: 3.1746, insee: '59512'});
            await k.evaluate(() => window.LCNDA_APP.api('kiosk_exit', {}, {method: 'POST', body: {password: 'essai-1234'}}).catch(() => {}));
            assert.deepStrictEqual(outside.slice(n0).filter(u => !/^https:\/\/[a-z]\.?tile\.|^https:\/\/tile\./.test(u)), [], `kiosque : ${r}`);
            assert.ok(await k.evaluate(() => window.LCNDA_EXT.dataSources.filter(d => /^tsx/.test(d.id)).every(d => d.online === false)), 'à la demande : rien en ligne');
            await k.close();
        });
        await t('village : Le Mans (24 Heures, sportifs), Tulle (le Tour à 15 km, puis 3 km dans les Réglages) ; monographie, listes (thèmes, liste réunie), cartes, à la demande', async () => {
            const [n, , txt] = await into('telechM', 'placeInto', {id: 7, name: 'Le Mans', lat: 48.0061, lon: 0.1996, insee: '72181'});
            assert.ok(n >= 2, txt); assert.match(txt, /24 Heures du Mans/); assert.match(txt, /sportifs connus sont nés ici/);
            const [, , tu] = await into('lot8MondeVillage', 'placeInto', {id: 1, name: 'Tulle', lat: 45.267, lon: 1.768, insee: '19272'}, {parts: ['tour'], force: true}).catch(() => [0, '', '']);
            const tourTxt = tu || (await p.evaluate(async () => { const s = window.LCNDA_EXT.monographSections.find(x => x.id === 'l8c_tour'); const h = document.createElement('div'); await s.render({name: 'Tulle', latitude: 45.267, longitude: 1.768, insee: '19272'}, h); return h.textContent; }));
            assert.match(tourTxt, /Le Tour de France est passé ici/); assert.match(tourTxt, /Maillot jaune en \d{4}/); assert.ok(!/devant/.test(tourTxt));
            const reg = await p.evaluate(() => { const E = window.LCNDA_EXT; return {lists: E.dataLists.filter(s => /^t[sx]_/.test(s.id)).map(s => [s.id, s.theme]), merge: (E.dataListMerges || []).filter(m => m.id === 'competitions').length,
                into: E.dataLists.filter(s => s.merge?.into === 'competitions').map(s => s.id), l8: E.dataLists.filter(s => /^l8c_(tour|clubs|expos)$/.test(s.id)).map(s => [s.id, s.theme]),
                mono: E.monographSections.filter(s => /^tsx_/.test(s.id)).length, maps: E.mapLayerSources.filter(s => /^tsx_/.test(s.id)).length, ds: E.dataSources.filter(s => /^tsx/.test(s.id)).length,
                village: (E.villageSectionDefs || []).some(d => d.id === 'tsx_place'), block: (window.LCNDA_APP.defaultPersonBlocks || []).some(b => b[0] === 'telech_m')}; });
            assert.deepStrictEqual(reg.lists, [['ts_competitions', 'sport'], ['ts_matchs', 'sport'], ['ts_jo', 'sport'], ['ts_athletes', 'sport'], ['tx_expos', 'fetes']]);
            assert.deepStrictEqual(reg.l8, [['l8c_clubs', 'sport'], ['l8c_tour', 'sport'], ['l8c_expos', 'fetes']]);
            assert.strictEqual(reg.merge, 1); assert.deepStrictEqual(reg.into, ['ts_competitions', 'ts_matchs']);
            assert.ok(reg.mono === 4 && reg.maps === 4 && reg.ds >= 10 && reg.village && reg.block, JSON.stringify(reg));
            const L = await p.evaluate(async () => { const d = window.LCNDA_EXT.dataLists.find(x => x.id === 'ts_competitions'); const r = await d.load(); const t76 = r.find(x => x.compId === 'tdf' && x.year === 1976); const t04 = r.find(x => x.compId === 'tdf' && x.year === 2004); return [r.length, t76, t04, d.merge.row(t76)]; });
            assert.ok(L[0] > 2000); assert.match(L[1].stages, /22 étapes \+ prologue/); assert.match(L[1].winner, /Van Impe/); assert.match(L[1].place, /Saint-Jean-de-Monts → Paris/); assert.match(L[2].winner, /titre retiré/);
            assert.strictEqual(L[3].chip, 'tdf'); assert.match(L[3].url, /^https:\/\//);
            const T8 = await p.evaluate(async () => { const r = await window.LCNDA_EXT.dataLists.find(x => x.id === 'l8c_tour').load(); return r.filter(s => s.year === 1976).map(s => [s.stage, s.winner]); });
            assert.ok(T8.some(s => s[0] === '5a') && T8.some(s => s[0] === 'prologue') && T8.filter(s => s[1]).length > 15, JSON.stringify(T8.slice(0, 6)));
            const X = await p.evaluate(async () => { const r = await window.LCNDA_EXT.dataLists.find(x => x.id === 'tx_expos').load(); return [r.length, r.filter(x => x.hand).length, r.find(x => x.year === 1900 && x.hand)?.note || '']; });
            assert.ok(X[0] > 150 && X[1] === 22, JSON.stringify(X.slice(0, 2))); assert.match(X[2], /visiteurs|entrées/, 'les phrases choisies à la main gardées');
            const M = await p.evaluate(async () => (await window.LCNDA_EXT.mapLayerSources.find(x => x.id === 'tsx_competitions').run({bbox: [0, 47.8, 0.4, 48.2]})).features.map(f => f.label));
            assert.ok(M.some(x => /24 Heures du Mans/.test(x)));
            const y = await p.evaluate(async () => { const s = window.LCNDA_EXT.dataSources.find(d => d.id === 'tsx_annee'); const h = document.createElement('div'); await s.run({year: 1998}, h); return h.textContent; });
            assert.match(y, /Coupe du monde de football/);
        });
        await t('Réglages → 🏆 : chaque sujet s’éteint (genealogie-telech-m), ↶ Annuler ; le rayon (15 → 3 km) change le Tour du village, ↶ le remet ; À propos des données', async () => {
            await p.evaluate(() => window.LCNDA_EXT.telechM.openSettings());
            await p.waitForSelector('[data-tsx-settings-page] [data-tsx-tg="expos"]', {timeout: 20000});
            const st = await p.textContent('[data-tsx-settings-page]');
            assert.match(st, /CC0/); assert.match(st, /CC BY-SA 4\.0/); assert.match(st, /En lien seulement/); assert.match(st, /BoxRec/); assert.match(st, /rien ne part sur Internet/);
            await p.click('[data-tsx-tg="jeux"] input');
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-telech-m')).jeux), false);
            const [, , txt] = await into('telechM', 'personInto', 2); assert.ok(!/ans aux Jeux olympiques/.test(txt), 'éteint : plus les Jeux de sa vie');
            await p.waitForSelector('.undo-toast button, [data-undo], .toast button', {timeout: 5000}).then(b => b.click()).catch(() => {});
            await sleep(300);
            assert.notStrictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-telech-m') || '{}').jeux), false, '↶ Annuler le rallume');
            await p.waitForSelector('[data-tsx-km]'); await p.fill('[data-tsx-km]', '3'); await p.dispatchEvent('[data-tsx-km]', 'change');
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-telech-m')).km), 3);
            const kms = await p.evaluate(() => window.LCNDA_EXT.telechM.radius()); assert.strictEqual(kms, 3);
            const gimel = {id: 2, name: 'Gimel-les-Cascades', lat: 45.2989, lon: 1.8536, insee: '19085'};
            const [n3] = await into('lot8MondeVillage', 'placeInto', gimel, {parts: ['tour'], force: true}); assert.strictEqual(n3, 0, 'à 3 km : Tulle (7 km) ne compte plus');
            await p.locator('.undo-toast button, [data-undo], .toast button').last().click({timeout: 5000});
            await sleep(300);
            const [n15, , g15] = await into('lot8MondeVillage', 'placeInto', gimel, {parts: ['tour'], force: true}); assert.ok(n15 >= 1 && /moins de 15 km/.test(g15), g15);
            assert.strictEqual(await p.evaluate(() => window.LCNDA_EXT.telechM.radius()), 15, '↶ remet 15 km');
        });
        await t('390 px et thème sombre : les blocs tiennent dans l’écran, rien collé aux bords, lisible', async () => {
            const m = await browser.newContext({viewport: {width: 390, height: 844}, colorScheme: 'dark'});
            await m.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => { outside.push(r.request().url()); return r.abort(); });
            const q = await m.newPage(); q.on('pageerror', e => errs.push(e.message));
            await q.goto(base, {timeout: 90000}); await q.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.telechM, null, {timeout: 60000});
            await q.waitForLoadState('networkidle').catch(() => {}); await sleep(1500);
            await q.evaluate(async () => { document.documentElement.dataset.theme = 'dark'; const ws = document.getElementById('workspace'); const h = document.createElement('div'); h.id = 'tm-essai'; ws.prepend(h);
                const a = document.createElement('div'), b = document.createElement('div'); h.append(a, b);
                await window.LCNDA_EXT.telechM.placeInto(a, {id: 7, name: 'Le Mans', lat: 48.0061, lon: 0.1996, insee: '72181'}); await window.LCNDA_EXT.telechM.personInto(b, 3);
                h.querySelectorAll('details').forEach(d => { d.open = true; }); h.scrollIntoView(); window.__tmEssai = h; });
            const r = await q.evaluate(() => { const h = window.__tmEssai; if (!h.isConnected) document.getElementById('workspace').prepend(h); const over = [...h.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1).map(e => e.className || e.tagName).slice(0, 5);
                const row = h.querySelector('.tsx-row').getBoundingClientRect(); const cs = getComputedStyle(h.querySelector('.hist-t p')); return {over, left: row.left, right: window.innerWidth - row.right, color: cs.color, docW: document.documentElement.scrollWidth}; });
            assert.deepStrictEqual(r.over, []); assert.ok(r.left >= 8 && r.right >= 8, JSON.stringify(r)); assert.ok(r.docW <= 391, `largeur ${r.docW}`);
            assert.ok(!/rgb\(0, 0, 0\)/.test(r.color), `texte lisible en sombre : ${r.color}`);
            await m.close();
        });
        await t('aucune erreur JavaScript, aucun « Failed to fetch »', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(fails ? `${fails} essai(s) raté(s).` : 'Sport et Expositions : tout va bien.');
    process.exit(fails ? 1 : 0);
})();
