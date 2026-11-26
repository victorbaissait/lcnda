#!/usr/bin/env node
/* 🔎 Noms de lieux d'autrefois, tous pays — assets/js/noms-lieux-monde.js (maquette validée docs/design/noms-de-lieux-monde.html).
 *  1. Node, sur les paquets livrés (tj-noms, tj-fusions, tj-pleiades, wikidata/oldnames) : « Presbourg » → Bratislava (Pozsony, Pressburg
 *     jusqu'en 1920, Presbourg sans date), « Breslau » → Wrocław (1350 – 1945), « Lutetia » → Paris (≈, Pleiades) avant Lučenec,
 *     « Burdigala » → Bordeaux ; un nom dit par deux sources : une ligne, GOV avant Wikidata ; l'index une fois, la recherche rapide.
 *  2. Serveur et écran (php -S + Playwright, base temporaire) : la vue « 🔎 Un nom → le lieu » de 🗺 Anciens noms de lieux (vue de
 *     départ, la barre du tableau rangée), le lieu, tous ses noms (dates, sorte, langue), la source ↗ de chaque nom, la petite carte
 *     (fond de l'app), 👪 la famille tout près (jamais une fiche confidentielle) → la monographie, ☑ plusieurs noms (barre, Échap), 📋 la
 *     liste réunie autour du lieu, ＋ Ajouter ce nom à mon lieu (dates et source, ↶ Annuler), ↗ OpenHistoricalMap ; consultation et
 *     invité : ni lien de carte, ni « Chercher ailleurs », ni ＋ / 📎 / 🧺 ; 📊 Récap (« Presbourg » posé comme une question) et ⌘K ;
 *     clavier ; 390 px et sombre (rien de collé, rien qui déborde) ; rien ne part sur Internet ; aucune erreur.
 *   node tests/test-noms-lieux-monde.js */
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
const {detect} = require('./test-rien-de-colle.js');
const N = require('../assets/js/noms-lieux-monde.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const raw = n => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'assets/data', `${n}.json.gz`))).toString('utf8'));
const table = f => (f.rows || []).map(r => Object.fromEntries((f.fields || f.cols).map((k, i) => [k, r[i] ?? null])));
const wd = q => `https://www.wikidata.org/wiki/${q}`;

(async () => {
    /* ═════════ 1. le calcul, sur les paquets livrés ═════════ */
    const O = raw('wikidata/oldnames');
    const recs = [
        ...table(raw('tj-noms')).map(r => ({name: r.name, now: r.now, from: r.from, to: r.to, lat: r.lat, lon: r.lon, q: r.q, kind: r.k === 'o' ? 'nom officiel' : 'autre nom', src: 'Wikidata', url: wd(r.q), cc: r.cc, lang: r.langs})),
        ...table(raw('tj-fusions')).map(r => ({name: r.name, now: r.succ, from: r.from, to: r.to, lat: r.lat, lon: r.lon, q: r.sq, kind: 'commune disparue', src: 'Wikidata', url: wd(r.q), cc: r.cc})),
        ...table(raw('tj-pleiades')).map(r => ({name: r.name, now: '', from: r.from, to: r.to, lat: r.lat, lon: r.lon, q: '', kind: 'nom antique', src: 'Pleiades', url: `https://pleiades.stoa.org/places/${r.id}`, cc: '', lang: r.lang})),
        ...Object.values(O.n).flat().map(r => ({name: r[2], now: r[1], from: Number(String(r[4]).slice(0, 4)) || null, to: Number(String(r[5]).slice(0, 4)) || null, lat: r[6], lon: r[7], q: `Q${r[0]}`, kind: 'ancien nom officiel', src: 'Wikidata', url: wd(`Q${r[0]}`), cc: ''}))];
    let I;
    await t('l’index : une fois (moins de 4 s pour plus de 100 000 noms), puis une recherche en moins de 50 ms', async () => {
        const t0 = Date.now(); I = N.buildIndex(recs); const dt = Date.now() - t0;
        assert.ok(recs.length > 100000, String(recs.length)); assert.ok(dt < 4000, `index : ${dt} ms`);
        for (const q of ['Presbourg', 'Lutetia', 'Lu', 'Saint']) { const a = Date.now(); N.search(I, q); assert.ok(Date.now() - a < 50, `${q} : ${Date.now() - a} ms`); }
        assert.deepStrictEqual(N.search(I, 'P'), [], 'une seule lettre : rien');
    });
    await t('« Presbourg » → Bratislava (Slovaquie) : Pozsony et Pressburg jusqu’en 1920, Presbourg sans date (en français), source Wikidata ↗', async () => {
        const g = N.search(I, 'Presbourg')[0];
        assert.strictEqual(g.now, 'Bratislava'); assert.strictEqual(g.cc, 'SK'); assert.ok(!g.guessed);
        const by = n => g.names.find(x => x.name === n);
        assert.strictEqual(by('Pressburg').to, 1920); assert.strictEqual(by('Pozsony').to, 1920);
        assert.ok(by('Presbourg').hit && by('Presbourg').from == null && by('Presbourg').to == null); assert.match(by('Presbourg').lang, /\bfr\b/);
        assert.strictEqual(N.whenTxt(null, null), 'sans date'); assert.strictEqual(N.whenTxt(null, 1920), 'jusqu’en 1920'); assert.strictEqual(N.whenTxt(-330, 640), '330 av. J.-C. – 640');
        assert.ok(g.names.every(n => n.srcs.length && n.srcs.every(s => /^https:\/\/www\.wikidata\.org\/wiki\/Q\d+$/.test(s.url))));
        assert.ok(g.names.findIndex(n => n.to === 1920) < g.names.findIndex(n => n.name === 'Presbourg'), 'les noms datés d’abord, « sans date » ensuite');
    });
    await t('« Breslau » → Wrocław (1350 – 1945) ; « Pressburg », « pressburg » et « Preßburg » : le même lieu', async () => {
        const g = N.search(I, 'Breslau')[0]; assert.strictEqual(g.now, 'Wrocław'); const b = g.names.find(n => n.name === 'Breslau'); assert.strictEqual(N.whenTxt(b.from, b.to), '1350 – 1945');
        for (const q of ['Pressburg', 'pressburg', 'Preßburg']) assert.strictEqual(N.search(I, q)[0]?.now, 'Bratislava', q);
    });
    await t('« Lutetia » → Paris (≈ le lieu d’aujourd’hui à moins de 5 km, Pleiades), avant Lučenec ; « Burdigala » → Bordeaux ; un lieu antique a ses années', async () => {
        const r = N.search(I, 'Lutetia');
        assert.strictEqual(r[0].now, 'Paris'); assert.ok(r[0].guessed); assert.ok(r.some(g => g.now === 'Lučenec'));
        const lu = r[0].names.find(n => n.name === 'Lutetia'); assert.strictEqual(lu.from, -330); assert.strictEqual(lu.srcs[0].src, 'Pleiades'); assert.match(lu.srcs[0].url, /^https:\/\/pleiades\.stoa\.org\/places\/\d+$/);
        assert.strictEqual(N.search(I, 'Burdigala')[0].now, 'Bordeaux');
        assert.ok(!N.search(I, 'Lemberg')[0].names.some(n => /^https?:/.test(n.name)), 'pas d’adresse à la place d’un nom');
    });
    await t('un nom dit par deux sources : une seule ligne, la meilleure source d’abord (GOV avant Wikidata) ; GOV seul : un lieu à part', async () => {
        const gs = N.search(I, 'Pressburg', 5);
        N.mergeGov(I, gs, [{name: 'Preßburg', lang: 'deu', from: 1500, to: 1919, gov: 'object_190', lat: 48.144, lon: 17.11}, {name: 'Pozsony', lang: 'hun', gov: 'object_190', lat: 48.144, lon: 17.11}, {name: 'Xyzdorf', gov: 'XYZDORJO', lat: 50.2, lon: 12.1}], 'Pressburg');
        const g = gs.find(x => x.now === 'Bratislava'), p = g.names.find(n => N.fold(n.name) === 'pressburg');
        assert.deepStrictEqual(p.srcs.map(s => s.src), ['GOV', 'Wikidata']); assert.match(p.srcs[0].url, /^https:\/\/gov\.genealogy\.net\/item\/show\/object_190$/);
        assert.strictEqual(g.names.filter(n => N.fold(n.name) === 'pressburg').length, 1);
        assert.ok(gs.some(x => x.names.some(n => n.name === 'Xyzdorf')), 'un objet GOV loin de tout : son propre lieu');
        assert.deepStrictEqual([N.rankOf('Registre national'), N.rankOf('GOV'), N.rankOf('WHG'), N.rankOf('Pleiades'), N.rankOf('Wikidata (fusions)')], [1, 2, 3, 4, 5]);
    });

    /* ═════════ 2. serveur et écran ═════════ */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-nlm-'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start,is_private) VALUES(1,'Karl','WEBER','male','deceased',1,0),(2,'Marta','GEHEIMNIS','female','deceased',0,1)");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude) VALUES(1,'Bratislava','','Slovaquie',48.1486,17.1077),(2,'Ulm','','Allemagne',48.4011,9.9876)");
$t = function ($tag) use ($pdo) { return (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn(); };
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)");
foreach ([[1,'BIRT','1850',1850,'1850',1],[1,'DEAT','1920',1920,'1920',2],[2,'BIRT','1860',1860,'1860',1]] as [$p,$g,$dt,$y,$sd,$pl]) { $ins->execute([$p,$t($g),$dt,$y,$sd,$pl]); }
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [], outside = [];
    const ready = async p => { await p.goto(base, {timeout: 90000}); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.nomsLieuxMonde && window.LCNDA_EXT?.dataListsEngine?.open && window.LCNDA_EXT.dataLists.some(d => d.id === 'reunie_anciens_noms'), null, {timeout: 60000}); };
    const openView = async (p, q = '') => { await p.evaluate(q2 => window.LCNDA_EXT.nomsLieuxMonde.open(q2), q); await p.waitForSelector('[data-nlm] [data-nlm-q]', {timeout: 30000}); if (q) await p.waitForSelector('.nlm-place, .nlm-none', {timeout: 60000}); };
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
        await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => { outside.push(r.request().url()); return r.abort(); }); // pas d'Internet : tout ce qui sortirait est compté
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        p.on('console', m => { if (m.type() === 'error' && /nlm|noms-lieux|Failed to fetch/i.test(m.text())) errs.push(m.text()); });
        await ready(p);

        await t('🗺 Anciens noms de lieux : « 🔎 Un nom → le lieu · Tableau · 🗺 Carte », la recherche d’abord ; la barre du tableau rangée ; les exemples', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = window.LCNDA_EXT.dataListsEngine.keyOf({id: 'reunie_anciens_noms'}); A.setModule('listes'); });
            await p.waitForSelector('[data-ld-page="reunie_anciens_noms"] [data-nlm]', {timeout: 30000});
            const v = await p.evaluate(() => { const pg = document.querySelector('[data-ld-page="reunie_anciens_noms"]'); return {seg: [...pg.querySelectorAll('.ld-view button')].map(b => [b.textContent.trim(), b.getAttribute('aria-pressed')]), self: pg.classList.contains('ld-self'),
                q: getComputedStyle(pg.querySelector('[data-ld-q]')).display, ex: [...pg.querySelectorAll('[data-nlm-ex]')].map(b => b.textContent), src: pg.querySelector('.nlm-source').textContent}; });
            assert.deepStrictEqual(v.seg.map(s => s[0]), ['🔎 Un nom → le lieu', 'Tableau', '🗺 Carte']); assert.strictEqual(v.seg[0][1], 'true');
            assert.ok(v.self && v.q === 'none', 'la barre du tableau est rangée'); assert.ok(v.ex.includes('Presbourg') && v.ex.includes('Burdigala'));
            assert.match(v.src, /GOV · Wikidata \(CC0\) · Pleiades \(CC BY 3\.0\)/); assert.match(v.src, /sans doublons/);
        });
        await t('« Presbourg » : 📍 Bratislava (Slovaquie), ses noms datés et « sans date », la source ↗ de chaque nom, la petite carte sans tuiles', async () => {
            const n0 = outside.length;
            await p.click('[data-nlm-ex="Presbourg"]');
            await p.waitForSelector('.nlm-place', {timeout: 60000});
            const r = await p.evaluate(() => { const a = document.querySelector('.nlm-place'); return {h: a.querySelector('h3').textContent, cc: a.querySelector('.nlm-ph small')?.textContent, why: a.querySelector('.nlm-why').textContent, txt: a.textContent,
                hit: a.querySelector('li.is-hit .nlm-nm')?.textContent, links: [...a.querySelectorAll('.nlm-srcchip')].map(x => [x.getAttribute('href'), x.getAttribute('target'), x.getAttribute('rel')]),
                svg: !!a.querySelector('.nlm-mini svg'), imgs: a.querySelectorAll('img').length, ohm: a.querySelector('a[href*="openhistoricalmap.org"]')?.getAttribute('href') || ''}; });
            assert.strictEqual(r.h, '📍 Bratislava'); assert.match(r.cc, /Slovaquie/); assert.match(r.why, /« Presbourg » : un nom de ce lieu/); assert.strictEqual(r.hit, 'Presbourg');
            assert.match(r.txt, /Pressburg/); assert.match(r.txt, /jusqu’en 1920/); assert.match(r.txt, /sans date/); assert.match(r.txt, /français/);
            assert.ok(r.links.length >= 5 && r.links.every(([h, tg, rel]) => /^https:\/\/www\.wikidata\.org\/wiki\/Q\d+$/.test(h) && tg === '_blank' && /noopener/.test(rel)), JSON.stringify(r.links.slice(0, 3)));
            assert.ok(r.svg && r.imgs === 0, 'carte : le fond de l’app, aucune tuile'); assert.match(r.ohm, /^https:\/\/www\.openhistoricalmap\.org\/#map=12\/48\.\d{4}\/17\.\d{4}&date=\d{4}-01-01$/);
            await p.waitForFunction(() => document.querySelector('.nlm-mini .nlm-land path'), null, {timeout: 20000}); // les pays (Natural Earth, livré avec l'app)
            assert.deepStrictEqual(outside.slice(n0), [], 'rien ne part sur Internet');
        });
        await t('« Lutetia » : Paris (≈) puis Lučenec ; « Burdigala » : Bordeaux ; « Breslau » : Wrocław 1350 – 1945 ; un nom inconnu : dit honnêtement, liens « Chercher ailleurs »', async () => {
            const typeQ = async q => { await p.fill('[data-nlm-q]', q); await p.press('[data-nlm-q]', 'Enter'); await p.waitForFunction(q2 => { const h = document.querySelector('.nlm-place h3, .nlm-none'); return h && document.querySelector('[data-nlm-q]').value === q2; }, q, {timeout: 30000}); await sleep(150); return p.evaluate(() => [...document.querySelectorAll('.nlm-place:not([hidden]) h3')].map(h => h.textContent)); };
            const lu = await typeQ('Lutetia'); assert.strictEqual(lu[0], '📍 Paris'); assert.ok(lu.includes('📍 Lučenec'), lu.join());
            assert.ok(await p.evaluate(() => !!document.querySelector('.nlm-place .nlm-guess')), '≈ le lieu d’aujourd’hui le plus proche');
            assert.strictEqual((await typeQ('Burdigala'))[0], '📍 Bordeaux');
            assert.strictEqual((await typeQ('Breslau'))[0], '📍 Wrocław'); assert.match(await p.textContent('.nlm-place'), /1350 – 1945/);
            await p.fill('[data-nlm-q]', 'Zzyxwvq'); await p.press('[data-nlm-q]', 'Enter'); await p.waitForSelector('.nlm-none', {timeout: 20000});
            assert.match(await p.textContent('.nlm-none'), /Aucun lieu connu sous ce nom/);
            const el = await p.evaluate(() => [...document.querySelectorAll('.nlm-else a')].map(a => a.href));
            assert.ok(el.some(h => /whgazetteer\.org/.test(h)) && el.some(h => /gov\.genealogy\.net\/search\/name\?name=Zzyxwvq/.test(h)) && el.some(h => /bfs\.admin\.ch/.test(h)), el.join(' '));
        });
        await t('👪 la famille tout près (Karl WEBER, jamais la fiche confidentielle) → la monographie de Bratislava', async () => {
            await p.fill('[data-nlm-q]', 'Pressburg'); await p.press('[data-nlm-q]', 'Enter');
            await p.waitForSelector('.nlm-place [data-nlm-famgo]', {timeout: 30000});
            const f = await p.textContent('.nlm-place .nlm-fam'); assert.match(f, /Bratislava/); assert.match(f, /Karl WEBER/); assert.ok(!/GEHEIMNIS/.test(f), 'fiche confidentielle : jamais');
            await p.click('.nlm-place [data-nlm-famgo]');
            await p.waitForFunction(() => window.LCNDA_APP.state.graphMode === 'place_monograph' && Number(window.LCNDA_APP.state.graphPlaceMonograph?.id) === 1, null, {timeout: 20000});
        });
        await t('☑ plusieurs noms : cases, barre « 2 choisis · 📎 · 🧺 · ⤓ », Échap décoche ; 📋 Tous les noms de ce lieu → la liste réunie autour de Bratislava', async () => {
            await openView(p, 'Presbourg');
            const cks = p.locator('.nlm-place').first().locator('[data-nlm-ck]');
            await cks.nth(0).check(); await cks.nth(1).check();
            assert.match(await p.textContent('[data-nlm-bar]'), /2 choisis/); assert.ok(await p.isVisible('[data-nlm-bar] [data-nlm-sins]'));
            await p.focus('.nlm-place [data-nlm-ck]'); await p.keyboard.press('Escape');
            assert.ok(await p.evaluate(() => document.querySelector('[data-nlm-bar]').hidden), 'Échap : tout décoché');
            await p.click('.nlm-place [data-nlm-table]');
            await p.waitForSelector('[data-ld-page="reunie_anciens_noms"] table.ld-table', {timeout: 60000});
            const st = await p.evaluate(() => ({chips: document.querySelector('[data-ld-chips]').textContent, self: document.querySelector('.ld-page').classList.contains('ld-self'), on: document.querySelector('[data-ld-dview="table"]').getAttribute('aria-pressed')}));
            assert.match(st.chips, /15 km autour de Bratislava/); assert.ok(!st.self && st.on === 'true', JSON.stringify(st));
            await p.click('[data-ld-dview="nom"]'); await p.waitForSelector('.nlm-place', {timeout: 30000});
            assert.strictEqual(await p.inputValue('[data-nlm-q]'), 'Presbourg', 'la recherche est gardée');
        });
        await t('＋ Ajouter ce nom à mon lieu : « Presbourg » sur la fiche de Bratislava (dates et source), ↶ Annuler', async () => {
            await p.click('.nlm-place [data-nlm-add]');
            await p.waitForSelector('.toast:has-text("Presbourg")', {timeout: 20000});
            const got = await p.evaluate(async () => (await window.LCNDA_APP.api('so4_place', {place_id: 1})).names);
            const pr = got.find(n => n.name === 'Presbourg'); assert.ok(pr, JSON.stringify(got)); assert.match(pr.origin, /Wikidata/); assert.match(pr.origin, /sans date/); assert.match(pr.origin, /https:\/\/www\.wikidata\.org\/wiki\/Q\d+/);
            await p.locator('.toast:has-text("Presbourg") button:has-text("Annuler")').last().click({timeout: 5000}); await sleep(600);
            const after = await p.evaluate(async () => (await window.LCNDA_APP.api('so4_place', {place_id: 1})).names);
            assert.ok(!after.some(n => n.name === 'Presbourg'), '↶ Annuler retire le nom');
        });
        await t('📊 Récap : « Presbourg » posé comme une question → la carte « un ancien nom de lieu » ; ⌘K : « 🗺 Presbourg → Bratislava »', async () => {
            await p.evaluate(() => window.LCNDA_EXT.dataHome.ask('Presbourg'));
            await p.waitForSelector('[data-nlm-ans]', {timeout: 60000});
            assert.match(await p.textContent('[data-nlm-ans]'), /Bratislava/);
            const k = await p.evaluate(() => window.LCNDA_EXT.nomsLieuxMonde.provider('Presbourg').map(x => x.label));
            assert.ok(k.some(l => /Presbourg → Bratislava/.test(l)), k.join());
            await p.click('[data-nlm-ans-go]'); await p.waitForSelector('[data-ld-page="reunie_anciens_noms"] .nlm-place', {timeout: 30000});
        });
        await t('clavier : « / » va dans la case, Tab atteint les exemples, les cases, les liens et les boutons', async () => {
            await openView(p, 'Breslau');
            await p.evaluate(() => document.activeElement?.blur()); await p.keyboard.press('/');
            const fq = await p.evaluate(() => ({ok: !!document.activeElement?.matches('[data-nlm-q]'), at: `${document.activeElement?.tagName}.${document.activeElement?.className}`, dlg: [...document.querySelectorAll('dialog[open]')].map(d => d.className)}));
            assert.ok(fq.ok, `« / » : la case (${JSON.stringify(fq)})`);
            const seen = new Set();
            for (let i = 0; i < 40; i++) { await p.keyboard.press('Tab'); const k = await p.evaluate(() => { const a = document.activeElement; return a?.dataset?.nlmEx ? 'ex' : a?.dataset?.nlmCk ? 'ck' : a?.classList?.contains('nlm-srcchip') ? 'src' : a?.dataset?.nlmMap ? 'map' : ''; }); if (k) seen.add(k); }
            assert.deepStrictEqual([...seen].sort(), ['ck', 'ex', 'map', 'src']);
        });
        await t('consultation et invité du réseau local : ni lien de carte, ni « Chercher ailleurs » ; ＋ 📎 🧺 éteints (avec la raison) ; rien sur Internet', async () => {
            const n0 = outside.length;
            await p.evaluate(() => document.body.classList.add('is-kiosk'));
            await openView(p, 'Presbourg'); await p.waitForSelector('.nlm-place', {timeout: 30000});
            const k = await p.evaluate(() => ({ohm: !!document.querySelector('[data-nlm] a[href*="openhistoricalmap"]'), els: document.querySelectorAll('.nlm-else a').length, add: document.querySelector('[data-nlm-add]').disabled, why: document.querySelector('[data-nlm-add]').title,
                ins: document.querySelector('[data-nlm-ins]').disabled, note: document.querySelector('.nlm-kiosk-note').textContent, src: document.querySelectorAll('.nlm-srcchip').length, svg: !!document.querySelector('.nlm-mini svg')}));
            assert.ok(!k.ohm && k.els === 0 && k.add && k.ins && /consultation/.test(k.why), JSON.stringify(k)); assert.ok(k.src > 0 && k.svg, 'la source et la carte (fond de l’app) restent');
            await p.evaluate(() => { document.body.classList.remove('is-kiosk'); window.LCNDA_GUEST = true; });
            await openView(p, 'Presbourg');
            const g = await p.evaluate(() => ({ohm: !!document.querySelector('[data-nlm] a[href*="openhistoricalmap"]'), els: document.querySelectorAll('.nlm-else a').length, add: document.querySelector('[data-nlm-add]').disabled}));
            assert.ok(!g.ohm && g.els === 0 && g.add, JSON.stringify(g));
            await p.evaluate(() => { delete window.LCNDA_GUEST; });
            assert.deepStrictEqual(outside.slice(n0), []);
        });
        await t('390 px et thème sombre : rien ne déborde, rien de collé aux bords, lisible', async () => {
            const m = await browser.newContext({viewport: {width: 390, height: 844}, colorScheme: 'dark'});
            await m.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => { outside.push(r.request().url()); return r.abort(); });
            const q = await m.newPage(); q.on('pageerror', e => errs.push(e.message));
            await ready(q); await q.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
            await openView(q, 'Lutetia'); await q.waitForFunction(() => document.querySelector('.nlm-mini .nlm-land path'), null, {timeout: 20000});
            await q.evaluate(() => { document.querySelector('[data-nlm-ck]').click(); });
            const r = await q.evaluate(() => { const h = document.querySelector('[data-nlm]'); const over = [...h.querySelectorAll('*')].filter(e => !e.parentElement.closest('svg')).filter(e => { const b = e.getBoundingClientRect(); return b.width && (b.right > window.innerWidth + 1 || b.left < -1); }).map(e => String(e.className?.baseVal ?? e.className) || e.tagName).slice(0, 5);
                const card = h.querySelector('.nlm-place').getBoundingClientRect(); return {over, left: card.left, right: window.innerWidth - card.right, docW: document.documentElement.scrollWidth, color: getComputedStyle(h.querySelector('.nlm-nm')).color, bg: getComputedStyle(h.querySelector('.nlm-place')).backgroundColor}; });
            assert.deepStrictEqual(r.over, []); assert.ok(r.left >= 8 && r.right >= 8, JSON.stringify(r)); assert.ok(r.docW <= 391, `largeur ${r.docW}`);
            assert.ok(!/rgb\(0, 0, 0\)/.test(r.color) && !/rgb\(255, 255, 255\)/.test(r.bg), `sombre : ${r.color} sur ${r.bg}`);
            const glued = await q.evaluate(detect, {root: '[data-nlm]', min: 4});
            assert.deepStrictEqual(glued.map(x => `${x.key} (${x.label || ''})`), []);
            await m.close();
        });
        await t('aucune erreur JavaScript ; rien n’est parti sur Internet', async () => { assert.deepStrictEqual(errs, []); assert.deepStrictEqual(outside.filter(u => !/^https:\/\/([a-z]\.)?tile\./.test(u)), []); });
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(fails ? `${fails} essai(s) raté(s).` : 'Noms de lieux d’autrefois : tout va bien.');
    process.exit(fails ? 1 : 0);
})();
