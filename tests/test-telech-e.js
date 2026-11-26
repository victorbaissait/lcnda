#!/usr/bin/env node
/* 🌌 Ciel, climat et mémoire (lot E « téléchargements ») — assets/js/heritage-telech-e.js, assets/css/telech-e.css,
 * scripts/telech-e/*, assets/data/te-*.json.gz, assets/i18n/src/telech-e.tsv.
 *  1. Node : les fichiers livrés (licence, source, date, petits, dans le manifeste) et le calcul (ciel de Paris et d'Allanche,
 *     essaims d'étoiles filantes, pluies d'étoiles, étés secs de 1719 et 1921, hivers de 1709 et 1830, inscriptions de Nîmes,
 *     arbres de la Liberté, guerres de Religion, bases de Farcy, adresses http(s) seulement).
 *  2. Écran (php -S + Playwright, base temporaire, aucun accès à Internet) : fiche d'une personne, d'un village, listes, cartes,
 *     à la demande, Réglages (interrupteur ↶), rien en ligne pour une fiche vivante ou en consultation, 390 px et thème sombre,
 *     pas d'erreur JavaScript ni de « Failed to fetch ».
 *  Fiches (inventées) : Jean MAZAUD (né le 12 août 1890 à Allanche, mort en 1916), Marie LACOMBE (née le 14 novembre 1820 à Paris,
 *  morte en 1890), Paul DURAND (1550-1610, Nîmes), Pierre DURAND (né en 1815 à Paris, marqué vivant : rien pour lui), Luc MAZAUD
 *  (1820-1880, Paris, confidentiel).
 *   node tests/test-telech-e.js */
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
const H = require('../assets/js/heritage-telech-e.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const raw = n => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'assets/data', `${n}.json.gz`))).toString('utf8'));
const rows = n => H.table(raw(n));
const P = {allanche: {id: 1, name: 'Allanche', lat: 45.2294, lon: 2.9337, insee: '15001'}, paris: {id: 2, name: 'Paris', lat: 48.8566, lon: 2.3522, insee: '75056'},
    nimes: {id: 3, name: 'Nîmes', lat: 43.8367, lon: 4.3601, insee: '30189'}, verdun: {id: 4, name: 'Verdun', lat: 49.1598, lon: 5.3844, insee: '55545'}, bayeux: {id: 5, name: 'Bayeux', lat: 49.2757, lon: -0.7029, insee: '14047'}};
const ev = (tag, year, p, date = '') => ({tag, year, date: date || String(year), place_id: p.id, lat: p.lat, lon: p.lon, place: p.name, insee: p.insee, country: 'France'});
const JEAN = {ok: true, person: {id: 1, first: 'Jean', last: 'MAZAUD', gender: 'male', birth: 1890, death: 1916}, places: [P.allanche, P.verdun], events: [ev('BIRT', 1890, P.allanche, '1890-08-12'), ev('DEAT', 1916, P.verdun)]};
const MARIE = {ok: true, person: {id: 2, first: 'Marie', last: 'LACOMBE', gender: 'female', birth: 1820, death: 1890}, places: [P.paris], events: [ev('BIRT', 1820, P.paris, '1820-11-14'), ev('DEAT', 1890, P.paris)]};
const PAUL = {ok: true, person: {id: 3, first: 'Paul', last: 'DURAND', gender: 'male', birth: 1550, death: 1610}, places: [P.nimes], events: [ev('BIRT', 1550, P.nimes), ev('DEAT', 1610, P.nimes)]};

(async () => {
    /* ═════════ 1. les fichiers et le calcul ═════════ */
    await t('fichiers livrés : présents, petits, avec source, adresse, licence et date ; dans le manifeste (scripts/telech-e)', async () => {
        const man = JSON.parse(fs.readFileSync(path.join(root, 'assets/data/manifest.json'), 'utf8'));
        for (const n of ['te-ciel', 'te-secheresses', 'te-hivers', 'te-inscriptions', 'te-religion', 'te-libertes']) {
            const f = path.join(root, 'assets/data', `${n}.json.gz`); assert.ok(fs.existsSync(f), n);
            assert.ok(fs.statSync(f).size < 2e6, n);
            const m = raw(n); assert.ok(m.source && /^https:\/\//.test(m.url) && m.licence && /^https:\/\//.test(m.licence_url) && /^\d{4}-\d\d-\d\d$/.test(m.built), n);
            assert.ok(man.packs[n] && man.packs[n].script === 'scripts/telech-e', `${n} dans le manifeste`);
        }
        assert.match(raw('te-ciel').licence, /CC BY 4\.0/); assert.match(raw('te-inscriptions').licence, /CC BY-SA 4\.0/); assert.match(raw('te-religion').licence, /CC0/);
        assert.match(raw('te-secheresses').quote, /free of charge/); assert.match(raw('te-hivers').quote, /free of charge/);
        assert.ok(!/falchi|gfz/i.test(JSON.stringify(raw('te-ciel').source)), 'pas l’atlas de Falchi (CC BY-NC) : un modèle ouvert');
        assert.ok(rows('te-inscriptions').every(r => /^HD\d+$/.test(r.hd) && !/MAZAUD|LACOMBE|DURAND/.test(r.text)));
        for (const s of ['build_ciel', 'build_secheresses', 'build_hivers', 'build_inscriptions', 'build_fossiles', 'build_libertes', 'build_religion']) assert.ok(fs.existsSync(path.join(root, 'scripts/telech-e', `${s}.py`)), s);
        const wf = fs.readFileSync(path.join(root, '.github/workflows/telech-e.yml'), 'utf8');
        assert.match(wf, /if: github\.event_name != 'push'/); assert.match(wf, /RUNNER_TEMP\/te-cache" >> "\$GITHUB_ENV"/); assert.ok(!/^\s{4}env:[\s\S]*runner\.temp[\s\S]*steps:/m.test(wf.split('steps:')[0]), 'pas de runner.temp dans l’env du travail');
    });
    await t('🌌 calcul : ciel naturel ≈ 3 000 étoiles et la Voie lactée ; Paris aujourd’hui ≈ 70 étoiles sans Voie lactée ; Allanche ≈ ciel naturel', async () => {
        assert.ok(H.NATURAL.stars >= 2500 && H.NATURAL.stars <= 3500 && H.NATURAL.milky, JSON.stringify(H.NATURAL));
        const G = H.skyGrid(raw('te-ciel'));
        const paris = H.skyInfo(H.skyAt(G, P.paris.lat, P.paris.lon)), al = H.skyInfo(H.skyAt(G, P.allanche.lat, P.allanche.lon));
        assert.ok(paris.ratio > 20 && !paris.milky && paris.stars < 200, JSON.stringify(paris));
        assert.ok(al.ratio < 1.5 && al.milky && al.stars > 2000, JSON.stringify(al));
        assert.strictEqual(H.skyAt(G, 10, 10), null, 'hors de la grille : rien');
    });
    await t('☄️ calcul : 12 août 1890 → Perséides à leur maximum ; 3 janvier 1900 → Quadrantides ; 14 décembre 1850 → rien (Géminides connues depuis 1862) ; pluie de 1866 vue par Marie', async () => {
        assert.ok(Math.abs(H.solarLongitude(2000, 8, 12) - 139.6) < 0.2);
        const per = H.showerOn(1890, 8, 12); assert.strictEqual(per.s.id, 'PER'); assert.ok(per.atPeak); assert.deepStrictEqual([per.peak.m, per.peak.d >= 11 && per.peak.d <= 14], [8, true]);
        assert.strictEqual(H.showerOn(1900, 1, 3).s.id, 'QUA'); assert.strictEqual(H.showerOn(1850, 12, 14), null); assert.strictEqual(H.showerOn(1900, 12, 14).s.id, 'GEM');
        assert.strictEqual(H.showerOn(1900, 3, 10), null);
        assert.deepStrictEqual(H.birthDate(JEAN), {y: 1890, m: 8, d: 12});
        const S = H.stormsSeen(MARIE); assert.deepStrictEqual(S.map(s => s.y), [1866, 1872, 1885]); assert.strictEqual(S[0].age, 46);
        assert.ok(!H.STORMS.find(s => s.d.startsWith('1833')).eu, '1833 : vue en Amérique, dit honnêtement');
    });
    await t('🌾 ❄️ calcul : Jean (Allanche) — été le plus sec et le plus humide de sa vie ; Paris : 1709 et 1830 parmi les hivers les plus froids ; 1921 très sec', async () => {
        const D = rows('te-secheresses'), cell = H.cellAt(D, P.allanche.lat, P.allanche.lon); assert.ok(cell && Math.abs(cell.lat - P.allanche.lat) <= 0.5);
        const L = H.droughtLife(cell, JEAN); assert.ok(L.dry.v < 0 && L.wet.v > 0 && L.dry.y >= 1890 && L.dry.y <= 1916, JSON.stringify([L.dry, L.wet]));
        const cp = H.cellAt(D, P.paris.lat, P.paris.lon); assert.ok(H.pdsiAt(cp, 1921) <= -30, String(H.pdsiAt(cp, 1921)));
        const W = rows('te-hivers'), wp = H.cellAt(W, P.paris.lat, P.paris.lon), X = H.seasonExtremes(wp, 10).cold.map(x => x.y);
        assert.ok(X.includes(1709) || X.includes(1830) || X.includes(1963), X.join(','));
        const M = H.seasonsLife(wp, MARIE); assert.ok(M.cold && M.cold.v < -3 && M.cold.rank <= 10, JSON.stringify(M.cold));
        assert.strictEqual(H.seasonsLife(wp, {person: {birth: 2010}, events: []}), null, 'après 2002 : rien');
    });
    await t('🏛 🌳 ⚔️ ⚖️ calcul : inscriptions de Nîmes, arbres de la Liberté de son vivant, Michelade (1567) près de Paul, Farcy seulement à l’âge adulte', async () => {
        const I = H.inscriptionsNear(rows('te-inscriptions'), P.nimes, 10); assert.ok(I.here.length > 20, String(I.here.length));
        const lib = [{id: 'n1', src: 'osm', n: 'Arbre de la Liberté (essai)', lat: 45.23, lon: 2.934, y: 1848, commune: 'Allanche'}, {id: 'n2', src: 'osm', n: 'Arbre (essai)', lat: 45.23, lon: 2.934, y: 1950, commune: 'Allanche'}];
        assert.deepStrictEqual(H.libertyLife(lib, {person: {birth: 1830, death: 1900}, events: [ev('BIRT', 1830, P.allanche)]}).map(x => [x.r.y, x.age]), [[1848, 18]]);
        const R = H.religionLife(rows('te-religion'), PAUL); assert.ok(R.some(x => /michelade/i.test(x.r.n)), JSON.stringify(R.map(x => x.r.n)));
        assert.deepStrictEqual(H.religionLife(rows('te-religion'), JEAN), []);
        assert.deepStrictEqual(H.farcyFor(MARIE), ['1848', '1851']); assert.deepStrictEqual(H.farcyFor(JEAN), []);
        assert.deepStrictEqual(H.farcyFor({person: {birth: 1840, death: 1900}, events: [ev('BIRT', 1840, P.paris)]}), [], 'trop jeune');
        assert.strictEqual(H.safeUrl('javascript:alert(1)'), ''); assert.strictEqual(H.safeUrl('data:text/html,x'), ''); assert.strictEqual(H.safeUrl('https://a.b/c"><x'), '');
        assert.strictEqual(H.safeUrl('https://www.wikidata.org/wiki/Q1'), 'https://www.wikidata.org/wiki/Q1');
        assert.ok(/^https:\/\//.test(H.FARCY[1848].url) && /^https:\/\//.test(H.FARCY[1851].url));
    });
    await t('i18n : telech-e.tsv en 8 langues, chargé dans l’app (index.php : script et style)', async () => {
        const tsv = fs.readFileSync(path.join(root, 'assets/i18n/src/telech-e.tsv'), 'utf8').trim().split('\n');
        assert.strictEqual(tsv[0], 'fr ¦ en ¦ es ¦ de ¦ it ¦ pt ¦ pl ¦ nl'); assert.ok(tsv.slice(1).every(l => l.split(' ¦ ').length === 8));
        const en = JSON.parse(fs.readFileSync(path.join(root, 'assets/i18n/en.json'), 'utf8')); assert.strictEqual(en['🌌 Ciel, climat et mémoire'], '🌌 Sky, climate and memory');
        const idx = fs.readFileSync(path.join(root, 'index.php'), 'utf8'); assert.match(idx, /heritage-telech-e\.js\?v=\d+/); assert.match(idx, /telech-e\.css\?v=\d+/);
    });

    /* ═════════ 2. l'écran ═════════ */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-te-'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_private,is_start) VALUES(1,'Jean','MAZAUD','male','deceased',0,1),(2,'Marie','LACOMBE','female','deceased',0,0),(3,'Paul','DURAND','male','deceased',0,0),(4,'Pierre','DURAND','male','living',0,0),(5,'Luc','MAZAUD','male','deceased',1,0)");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code) VALUES(1,'Allanche','Cantal','France',45.2294,2.9337,'15001'),(2,'Paris','Paris','France',48.8566,2.3522,'75056'),(3,'Nîmes','Gard','France',43.8367,4.3601,'30189'),(4,'Verdun','Meuse','France',49.1598,5.3844,'55545'),(5,'Bayeux','Calvados','France',49.2757,-0.7029,'14047')");
$t = function ($tag) use ($pdo) { $i = (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn(); return $i ?: (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='BIRT' LIMIT 1")->fetchColumn(); };
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)");
foreach ([[1,'BIRT','12/08/1890',1890,'1890-08-12',1],[1,'DEAT','1916',1916,'1916',4],[2,'BIRT','14/11/1820',1820,'1820-11-14',2],[2,'DEAT','1890',1890,'1890',2],[3,'BIRT','1550',1550,'1550',3],[3,'DEAT','1610',1610,'1610',3],
    [4,'BIRT','1815',1815,'1815',2],[5,'BIRT','1820',1820,'1820',2],[5,'DEAT','1880',1880,'1880',2]] as [$p,$g,$d,$y,$s,$pl]) { $ins->execute([$p,$t($g),$d,$y,$s,$pl]); }
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [], outside = [], local = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
        await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => { outside.push(r.request().url()); return r.abort(); }); // pas d'Internet dans l'essai
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        p.on('console', m => { if (m.type() === 'error' && /Failed to fetch|telech-e|te-/i.test(m.text())) errs.push(m.text()); });
        p.on('request', r => { if (r.url().startsWith(base)) local.push(r.url()); });
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultPersonBlocks, null, {timeout: 30000});
        await p.waitForFunction(() => !!window.LCNDA_EXT?.telechE, null, {timeout: 20000});
        const into = (fn, arg, opts = {}) => p.evaluate(async ([f, a, o]) => { const h = document.createElement('div'); document.body.appendChild(h); const n = await window.LCNDA_EXT.telechE[f](h, a, {detached: true, ...o}); const r = [n, h.innerHTML, h.textContent]; h.remove(); return r; }, [fn, arg, opts]);

        await t('fiche de Jean MAZAUD : 🌌 le ciel noir, ☄️ les Perséides, 🌾 les étés, ❄️ les hivers ; ↗ source, Source sous chaque sujet, liens sûrs', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('[data-te-person="1"] .te-row', {timeout: 30000});
            const txt = await p.textContent('[data-te-person="1"]');
            assert.match(txt, /Né à Allanche en 1890, il voyait la nuit un ciel noir/); assert.match(txt, /Voie lactée/);
            assert.match(txt, /La nuit de sa naissance \(12 août\), c’étaient les Perséides/); assert.match(txt, /Les étés de sa vie à Allanche/); assert.match(txt, /L’hiver \d{4}-\d{4} \(.*\) fut le plus froid de sa vie à Allanche/);
            assert.ok(!/Farcy/.test(txt), 'né en 1890 : pas de 1848/1851');
            const a = await p.$$eval('[data-te-person="1"] a', l => l.map(x => [x.getAttribute('href'), x.target, x.rel]));
            assert.ok(a.length && a.every(([h, tg, rel]) => /^https:\/\//.test(h) && tg === '_blank' && /noopener/.test(rel)), JSON.stringify(a.filter(x => !/^https:/.test(x[0]))));
            assert.ok((await p.$$eval('[data-te-person="1"] .te-row', l => l.map(r => !!r.querySelector('.hist-src') && !!r.querySelector('.te-src-link')))).every(Boolean));
            assert.strictEqual(await p.evaluate(() => document.querySelector('[data-te-person="1"]').closest('section.card').hidden), false);
        });
        await t('Marie LACOMBE (Paris) : la Voie lactée a disparu aujourd’hui ; pluie d’étoiles de 1866 ; ⚖️ Farcy : le bouton copie le nom (rien envoyé) ; Paul DURAND : ⚔️ la Michelade', async () => {
            const [n, html, txt] = await into('personInto', 2);
            assert.ok(n >= 3, txt); assert.match(txt, /Voie lactée a disparu/); assert.match(txt, /pluie d’étoiles des Léonides, vue dans toute l’Europe/); assert.match(html, /data-te-farcy="1848"/); assert.match(html, /data-te-farcy="1851"/);
            assert.match(html, /inculpes-juin-1848\.fr/); assert.ok(!/LACOMBE|Marie/.test(html), 'le nom n’est pas écrit dans une adresse');
            await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], {origin: base.replace(/\/$/, '')});
            const pages = [];
            ctx.on('page', pg => pages.push(pg.url()));
            const n0 = outside.length;
            await p.evaluate(async () => { const h = document.createElement('div'); h.id = 'te-farcy-test'; document.body.appendChild(h); await window.LCNDA_EXT.telechE.personInto(h, 2, {detached: true, parts: ['farcy']}); h.querySelector('[data-te-farcy="1851"]').click(); });
            await sleep(800);
            assert.strictEqual(await p.evaluate(() => navigator.clipboard.readText()), 'LACOMBE Marie');
            assert.ok(outside.slice(n0).every(u => !/LACOMBE|Marie/i.test(decodeURIComponent(u))), 'le nom ne part pas');
            await p.evaluate(() => document.getElementById('te-farcy-test')?.remove());
            const [, , paul] = await into('personInto', 3); assert.match(paul, /De son vivant, près de chez lui : .*(Michelade|michelade)/i);
        });
        await t('fiche vivante (Pierre) ou confidentielle (Luc), et mode consultation : pas de ⚖️ Farcy ; rien ne part sur Internet', async () => {
            const n0 = outside.length;
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 4; A.setModule('personnes'); });
            await p.waitForSelector('[data-te-person="4"]', {state: 'attached', timeout: 20000}); await sleep(2000);
            assert.strictEqual(await p.getAttribute('[data-te-person="4"]', 'data-te-priv'), '1');
            assert.ok(!/data-te-farcy/.test(await p.innerHTML('[data-te-person="4"]')));
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 5; A.setModule('personnes'); });
            await p.waitForSelector('[data-te-person="5"]', {state: 'attached', timeout: 20000}); await sleep(2000);
            assert.ok(!/data-te-farcy/.test(await p.innerHTML('[data-te-person="5"]')), 'confidentiel : pas de Farcy');
            const [, privHtml] = await into('personInto', 2, {private: true}); assert.ok(!/data-te-farcy/.test(privHtml));
            await p.evaluate(() => document.body.classList.add('is-kiosk'));
            const [, kHtml, kTxt] = await into('personInto', 2); assert.ok(!/data-te-farcy/.test(kHtml), 'consultation : pas de Farcy'); assert.match(kTxt, /Voie lactée/, 'le reste s’affiche (lu sur l’ordinateur)');
            await p.evaluate(() => document.body.classList.remove('is-kiosk'));
            assert.ok(outside.slice(n0).every(u => !/MAZAUD|LACOMBE|DURAND|Pierre|Luc/i.test(decodeURIComponent(u))), outside.slice(n0).join('\n'));
            const mine = local.filter(u => /telech-e|\/te-[a-z]+\.json/.test(u)); assert.ok(mine.every(u => /\/assets\/(data\/te-[a-z]+\.json\.gz|js\/heritage-telech-e\.js|css\/telech-e\.css)/.test(u)), mine.join('\n'));
        });
        await t('village (Nîmes, Bayeux) : 🌌 🌾 ❄️ 🕳 🏛 ⚔️ 🌳 une phrase chacun, ▸ plus, Source ; un lieu sans position : seulement le lien des puits', async () => {
            const [n, html, txt] = await into('placeInto', {id: 3, name: 'Nîmes', lat: 43.8367, lon: 4.3601, insee: '30189'});
            assert.ok(n >= 6, txt); assert.match(txt, /inscriptions romaines trouvées à Nîmes/); assert.match(html, /lang="la"/); assert.match(txt, /Les étés les plus secs autour de Nîmes depuis 1500/);
            assert.match(txt, /Les hivers les plus froids autour de Nîmes/); assert.match(txt, /Banque du sous-sol du BRGM/); assert.match(txt, /guerres de Religion/); assert.match(html, /edh\.ub\.uni-heidelberg\.de\/edh\/inschrift\/HD\d+/);
            assert.match(html, /<details class="te-more">/); assert.match(html, /<svg class="te-spark"/);
            const [, , bay] = await into('placeInto', {id: 5, name: 'Bayeux', lat: 49.2757, lon: -0.7029, insee: '14047'}); assert.match(bay, /arbre de la Liberté/i);
            const [n0, h0] = await into('placeInto', {id: 9, name: 'Sans position'}); assert.ok(n0 <= 1 && !/te-latin/.test(h0));
        });
        await t('registres : village (Organiser la fiche), monographie, listes, cartes, à la demande, Où chercher, bloc de la fiche, 🗂 Données (manifeste)', async () => {
            const reg = await p.evaluate(() => { const E = window.LCNDA_EXT; return {mono: E.monographSections.filter(s => /^te_/.test(s.id)).length, lists: E.dataLists.filter(s => /^te_/.test(s.id)).map(s => s.id), maps: E.mapLayerSources.filter(s => /^te_/.test(s.id)).length,
                ds: E.dataSources.filter(s => /^(tep_|te_.*_lieu$)/.test(s.id)).length, vil: (E.villageSectionDefs || []).some(d => d.id === 'te_place'), block: (window.LCNDA_APP.defaultPersonBlocks || []).some(b => b[0] === 'telech_e'), tab: (window.LCNDA_APP.defaultMaintenanceTabs || []).some(b => b[0] === 'telech_e')}; });
            assert.deepStrictEqual(reg.lists, ['te_inscriptions', 'te_fossiles', 'te_libertes', 'te_religion', 'te_etoiles']); assert.ok(reg.mono === 8 && reg.maps === 4 && reg.ds === 15 && reg.vil && reg.block && reg.tab, JSON.stringify(reg));
            const L = await p.evaluate(async () => { const d = window.LCNDA_EXT.dataLists.find(x => x.id === 'te_inscriptions'); const r = await d.load(); return [r.length, r[0].src]; });
            assert.ok(L[0] > 1000); assert.match(L[1], /^https:\/\/edh\.ub\.uni-heidelberg\.de\/edh\/inschrift\/HD/);
            const F = await p.evaluate(async () => (await window.LCNDA_EXT.dataLists.find(x => x.id === 'te_fossiles').load()).length); assert.ok(F >= 0, 'fossiles : pas encore fabriqué → liste vide, pas d’erreur');
            const M = await p.evaluate(async () => (await window.LCNDA_EXT.mapLayerSources.find(x => x.id === 'te_religion').run({bbox: [4, 43.5, 4.7, 44.2]})).features.map(f => f.label));
            assert.ok(M.some(x => /Nîmes|michelade|Agau/i.test(x)), M.join(','));
            const ds = await p.evaluate(async () => { const S = window.LCNDA_EXT.dataSources.find(s => s.id === 'tep_etoiles'); const h = document.createElement('div'); document.body.appendChild(h); await S.run({person: {id: 1}}, h); const r = h.textContent; h.remove(); return r; });
            assert.match(ds, /Perséides/);
            const ouc = await p.evaluate(() => (window.LCNDA_OUC_MONDE?.SITES || []).filter(s => /^te_/.test(s.key)).map(s => s.url({last: 'X'})));
            assert.ok(!ouc.length || ouc.every(u => /^https:\/\//.test(u) && !/X$/.test(u)), 'Où chercher : jamais le nom dans l’adresse');
        });
        await t('Réglages → 🌌 : interrupteurs (genealogie-telech-e) avec ↶ Annuler, À propos (licences, dates), liens seulement', async () => {
            await p.evaluate(() => window.LCNDA_EXT.telechE.openSettings());
            await p.waitForSelector('[data-te-settings-page] [data-te-tg]', {timeout: 20000}); await sleep(500);
            const st = await p.textContent('[data-te-settings-page]');
            assert.match(st, /CC BY-SA 4\.0/); assert.match(st, /CC BY 4\.0/); assert.match(st, /Falchi/); assert.match(st, /Farcy/); assert.match(st, /Pas encore fabriqué/);
            await p.click('[data-te-tg="hivers"] input');
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-telech-e')).hivers), false);
            const [, , off] = await into('personInto', 1); assert.ok(!/fut le plus froid/.test(off), 'éteint : plus affiché');
            await p.waitForSelector('.undo-toast button, [data-undo], .toast button', {timeout: 5000}).then(b => b.click()).catch(() => {});
            await sleep(300);
            assert.notStrictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-telech-e') || '{}').hivers), false, '↶ Annuler le rallume');
        });
        await t('390 px et thème sombre : rien ne dépasse, couleurs du thème, lisible', async () => {
            await p.setViewportSize({width: 390, height: 800});
            await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
            const r = await p.evaluate(async () => {
                const h = document.createElement('div'); h.style.width = '358px'; h.style.margin = '0 16px'; document.body.appendChild(h);
                await window.LCNDA_EXT.telechE.placeInto(h, {id: 3, name: 'Nîmes', lat: 43.8367, lon: 4.3601, insee: '30189'}, {detached: true});
                h.querySelectorAll('details').forEach(d => { d.open = true; });
                await new Promise(res => setTimeout(res, 100));
                const over = [...h.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > h.getBoundingClientRect().right + 1).map(e => e.className || e.tagName).slice(0, 5);
                const dry = getComputedStyle(h.querySelector('.te-dry') || h).fill;
                const out = {over, sw: h.scrollWidth, cw: h.clientWidth, dry, body: getComputedStyle(document.body).backgroundColor}; h.remove(); return out;
            });
            assert.deepStrictEqual(r.over, []); assert.ok(r.sw <= r.cw + 1, JSON.stringify(r)); assert.strictEqual(r.dry, 'rgb(224, 168, 90)', JSON.stringify(r));
            await p.evaluate(() => document.documentElement.removeAttribute('data-theme')); await p.setViewportSize({width: 1440, height: 900});
        });
        await t('aucune erreur JavaScript, aucun « Failed to fetch »', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(fails ? `${fails} essai(s) raté(s).` : 'Ciel, climat et mémoire : tout va bien.');
    process.exit(fails ? 1 : 0);
})();
