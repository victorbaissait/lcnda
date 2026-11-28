#!/usr/bin/env node
/* 🔎 Audit des lots E, F, G « téléchargements » (heritage-telech-e/f/g.js) — les bugs trouvés et corrigés, un essai chacun :
 *  1. Node :
 *     - F, G : Wikidata + OpenStreetMap fusionnés par une grille (pas n × m sur des milliers de lignes), et une seule fois par fichier ;
 *     - G : « Georges Prost (résistant) » → la parenthèse n'est pas un nom de famille ;
 *     - E : « près de chez lui » = un lieu de sa vie à cette époque (±25 ans), pas le lieu où il n'arrive que 60 ans plus tard ;
 *     - F : « il vivait non loin » du ballon de 1870 = un lieu de sa vie de 1850 à 1890 (pas seulement sa tombe de 1925) ;
 *     - E, F, G : des clés JSON « __proto__ » dans un fichier ne polluent rien ;
 *     - les images de Wikimedia Commons ne se chargent jamais en consultation (kiosque) ni pour un invité du réseau local.
 *  2. Serveur et écran (php -S + Playwright, base temporaire, toute requête hors 127.0.0.1 coupée et comptée) :
 *     - fichiers piégés (balises dans les noms, textes latins, années, adresses javascript:) : rien ne s'exécute, liens http(s) seulement ;
 *     - E : années avant notre ère écrites « 50 av. J.-C. » ;
 *     - 🪙 la pièce dans sa poche (heritage-terre-quotidien.js) : aucune image en ligne en consultation ni pour un invité (piste du
 *       test-telech-f : les vignettes ?width=96 de commons.wikimedia.org étaient demandées en mode consultation) ;
 *     - G : pas de comparaison de noms pour une fiche vivante (même sans le drapeau de la carte) ; Listes : une liste d'autrefois
 *       (Compagnons…) ne propose jamais une fiche vivante (app-listes-personnes.js, personMatch.historic).
 *   node tests/test-audit-lots-efg.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const {spawn, spawnSync} = require('child_process');
let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
const root = path.join(__dirname, '..');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
const E = require('../assets/js/heritage-telech-e.js');
const F = require('../assets/js/heritage-telech-f.js');
const G = require('../assets/js/heritage-telech-g.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const src = f => fs.readFileSync(path.join(root, f), 'utf8');

(async () => {
    /* ═════════ 1. Node ═════════ */
    await t('F, G : fusion Wikidata + OpenStreetMap par une grille (même point à < 80 m / 150 m) ; 20 000 × 20 000 lignes en un instant', async () => {
        for (const [H, d] of [[F, 0.08], [G, 0.15]]) {
            const wd = [{q: 'Q1', n: 'A', lat: 48.0, lon: 2.0}, {q: 'Q2', n: 'B', lat: 45.0, lon: 5.0}];
            const osm = [{osm: 'n1', n: 'A bis', lat: 48.0003, lon: 2.0003}, {osm: 'n2', n: 'loin', lat: 48.01, lon: 2.01}, {osm: 'n3', n: 'sans position', lat: null, lon: null}, {osm: 'n4', n: 'au bord du carreau', lat: 44.99995, lon: 4.99995}];
            const m = H.mergeRows(wd, osm, d);
            assert.deepStrictEqual(m.map(r => `${r.via}:${r.n}`), ['wd:A', 'wd:B', 'osm:loin', 'osm:sans position'], 'le même point (à quelques mètres) n’est gardé qu’une fois, même de part et d’autre d’un carreau');
            assert.ok(m.every(r => r.via === 'wd' || (r.q === '' && r.to === null)));
            let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
            const big = n => Array.from({length: n}, (_, i) => ({q: `Q${i}`, osm: `n${i}`, lat: 42 + rnd() * 9, lon: -4 + rnd() * 12}));
            const W = big(20000), O = big(20000), t0 = Date.now(); const M = H.mergeRows(W, O, d); const ms = Date.now() - t0;
            assert.ok(ms < 2500, `${ms} ms (avant : 400 millions de comparaisons à chaque fiche ouverte)`); assert.ok(M.length > 30000);
        }
        for (const lot of ['f', 'g']) assert.match(src(`assets/js/heritage-telech-${lot}.js`), /mergedMemo\[kind\]; if \(m && m\.w === W\.rows && m\.o === O\.rows\) return m\.out/, `lot ${lot} : la fusion est gardée (une fois par fichier)`);
    });
    await t('G : « Georges Prost (résistant) » → pas de nom de famille « résistant » ; « Richard, dit Lafleur » toujours avant la virgule', async () => {
        const S = G.rowSurnames({n: 'Georges Prost (résistant)', fam: ''});
        assert.ok(S.has('prost') && !S.has('resistant') && ![...S].some(x => /resistant/.test(x)), JSON.stringify([...S]));
        assert.ok(!G.rowSurnames({n: 'François Martin (1729-1814)'}).has('martin1729'));
        const life = {person: {first: 'Jean', last: 'RÉSISTANT', birth: 1915}, events: []};
        assert.deepStrictEqual(G.nameMatches([{q: 'Q1', n: 'Jean Prost (résistant)', b: 1915, d: 1945}], life, {window: [1940, 1946], ageMin: 14, ageMax: 80}), []);
        assert.ok(G.rowSurnames({n: 'Guillaume Richard, dit Lafleur'}).has('richard') && !G.rowSurnames({n: 'Guillaume Richard, dit Lafleur'}).has('lafleur'));
    });
    await t('E : 🌳 ⚔️ « près de chez lui » = un lieu de sa vie à cette époque (±25 ans) ; un lieu sans date compte toujours', async () => {
        const nimes = {lat: 43.8367, lon: 4.3601}, far = {lat: 48.85, lon: 2.35};
        const ev = (tag, year, p) => ({tag, year, lat: p.lat, lon: p.lon, place: 'x'});
        const tree = [{id: 'Q1', n: 'Arbre', lat: nimes.lat, lon: nimes.lon, y: 1792, commune: 'Nîmes'}];
        const moved = {person: {birth: 1770, death: 1860}, events: [ev('BIRT', 1770, far), ev('DEAT', 1860, nimes)]}; // n'arrive à Nîmes que vers la fin de sa vie
        assert.deepStrictEqual(E.libertyLife(tree, moved), [], 'mort à Nîmes en 1860 : pas « près de chez lui » en 1792');
        assert.strictEqual(E.libertyLife(tree, {person: {birth: 1770, death: 1860}, events: [ev('BIRT', 1770, far), ev('RESI', 1800, nimes)]}).length, 1, 'à Nîmes en 1800 : oui');
        assert.strictEqual(E.libertyLife(tree, {person: {birth: 1770, death: 1860}, events: [ev('BIRT', 1770, far), {...ev('RESI', null, nimes)}]}).length, 1, 'lieu sans date : oui');
        const rel = [{q: 'Q2', n: 'Michelade', lat: nimes.lat, lon: nimes.lon, y: 1567, k: 'guerres'}];
        assert.deepStrictEqual(E.religionLife(rel, {person: {birth: 1550, death: 1610}, events: [ev('BIRT', 1550, far), ev('DEAT', 1610, nimes)]}), []);
        assert.strictEqual(E.religionLife(rel, {person: {birth: 1550, death: 1610}, events: [ev('BIRT', 1550, nimes)]}).length, 1);
    });
    await t('F : 🎈 « il vivait non loin » : un lieu de sa vie entre 1850 et 1890 (pas seulement son décès en 1925)', async () => {
        const evreux = {lat: 49.024, lon: 1.151}, nice = {lat: 43.7, lon: 7.27};
        const B = [{q: 'Q1', n: 'Le Neptune', lat: 49.00639, lon: 1.21944, date: '1870-09-23', to: 'Cracouville'}];
        const ev = (tag, year, p) => ({tag, year, lat: p.lat, lon: p.lon, place: 'x'});
        assert.deepStrictEqual(F.balloonsFor(B, {person: {birth: 1850, death: 1925}, events: [ev('BIRT', 1850, nice), ev('DEAT', 1925, evreux)]}), []);
        assert.strictEqual(F.balloonsFor(B, {person: {birth: 1850, death: 1925}, events: [ev('BIRT', 1850, nice), ev('RESI', 1872, evreux)]}).length, 1);
    });
    await t('E, F, G : une clé « __proto__ » dans un fichier ne pollue pas les objets', async () => {
        for (const H of [E, F, G]) {
            const r = H.table({fields: ['__proto__', 'n', 'constructor'], rows: [[{polluted: 1}, 'x', {prototype: {polluted2: 1}}]]});
            assert.strictEqual(({}).polluted, undefined); assert.strictEqual(({}).polluted2, undefined); assert.strictEqual(r[0].n, 'x');
        }
    });
    await t('images de Wikimedia Commons : jamais chargées en consultation ni pour un invité (offline() devant chaque <img> en ligne)', async () => {
        const files = ['heritage-terre-quotidien', 'heritage-fiche-edifice', 'heritage-lot8-monde-village', 'heritage-pays-memoire', 'heritage-chateaux-territoires'];
        for (const f of files) {
            const s = src(`assets/js/${f}.js`);
            assert.match(s, /const offline = \(\) => !!\(root\.document\?\.body\?\.classList\.contains\('is-kiosk'\) \|\| root\.LCNDA_GUEST\)/, f);
            const lines = s.split('\n').filter(l => /<(img|audio|video)\b[^>]*src="\$\{esc\((commonsThumb|imgUrl|FILEPATH)\(/.test(l));
            assert.ok(lines.length, `${f} : des images`);
            for (const l of lines) assert.match(l, /offline\(\)/, `${f} : ${l.trim().slice(0, 140)}`);
        }
        for (const lot of ['e', 'f', 'g']) assert.ok(!/<img\b/.test(src(`assets/js/heritage-telech-${lot}.js`)), `lot ${lot} : aucune image en ligne`);
    });

    /* ═════════ 2. serveur et écran ═════════ */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-audit-efg-'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Bernard','DEMOLINS','male','living',1),(2,'Gaston','TAVIAN','male','deceased',0)");
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [], outside = [];
    const X = '<img src=x onerror="window.__xss=(window.__xss||0)+1">';
    const pack = (fields, rows, meta = {}) => JSON.stringify({source: `S${X}`, url: 'javascript:alert(1)', licence: `L${X}`, licence_url: 'javascript:alert(2)', built: '2026-01-01', what: X, fields, rows, ...meta});
    const N = {lat: 43.8367, lon: 4.3601}; // Nîmes
    const TRAPS = {
        'te-inscriptions': pack(['hd', 'lat', 'lon', 'insee', 'spot', 'anc', 'prov', 'kind', 'from', 'to', 'text', 'approx'], [[`HD1"${X}`, N.lat, N.lon, '30189', `Nîmes${X}`, X, X, X, -50, 10, `D(is) M(anibus) ${X}`, 0]]),
        'te-religion': pack(['q', 'n', 'k', 'lat', 'lon', 'place', 'y', 'date', 'kind', 'frwiki'], [[`Q1${X}`, `Michelade${X}`, `x${X}`, N.lat, N.lon, X, 1567, '1567-09-29', X, `javascript:alert(3)`]]),
        'te-libertes': pack(['id', 'src', 'n', 'lat', 'lon', 'y', 'insee', 'commune', 'frwiki'], [[`w1${X}`, 'osm', `Arbre${X}`, N.lat, N.lon, 1848, '', X, '']]),
        'tf-ponts': pack(['q', 'n', 'lat', 'lon', 'from', 'to', 'river', 'commune', 'replaces', 'frwiki'], [[`Q9${X}`, `Pont${X}`, N.lat, N.lon, X, null, X, X, '', '']]),
        'tf-ballons': pack(['num', 'date', 'n', 'from', 'to', 'to_wp', 'q', 'lat', 'lon', 'fret'], [[1, `1870-09-23${X}`, `Ballon${X}`, X, `Arrivée${X}`, X, X, N.lat, N.lon, X]]),
        'tf-rosieres': pack(['wp', 'q', 'insee', 'lat', 'lon', 'since', 'now', 'quote', 'old'], [[`Nîmes${X}`, 'Q1', '30189', N.lat, N.lon, X, true, X, X]]),
        'tg-forts': pack(['q', 'n', 'k', 'lat', 'lon', 'from', 'to', 'commune', 'frwiki'], [[`Q5${X}`, `Fort${X}`, `sdr${X}`, N.lat, N.lon, X, null, X, '']]),
        'tg-deputes': pack(['q', 'n', 'fam', 'giv', 'g', 'b', 'd', 'bp', 'insee', 'lat', 'lon', 'frwiki', 'role', 'extra'], [[`Q7${X}`, `Jean Député${X}`, '', 'Jean', 'm', 1750, 1820, X, '30189', N.lat, N.lon, `javascript:alert(4)`, X, X]]),
        'tg-compagnons': pack(['q', 'n', 'fam', 'giv', 'g', 'b', 'd', 'bp', 'insee', 'lat', 'lon', 'frwiki', 'role', 'extra'], [['Q24718602', 'Bernard Demolins', 'Demolins', 'Bernard', 'm', 1918, 2012, 'Saint-Pavace', '72310', 48.03833, 0.18778, 'Bernard Demolins', '', ''],
            ['Q50322267', 'Gaston Tavian', '', 'Gaston', 'm', 1908, 1987, 'Échalot', '21237', 47.61194, 4.83778, 'Gaston Tavian', '', '']]),
    };
    try {
        const ctx = await browser.newContext({viewport: {width: 1280, height: 900}});
        await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => { outside.push(r.request().url()); return r.abort(); });
        await ctx.route(/\/assets\/data\/(te|tf|tg)-[a-z-]+\.json\.gz/, r => { const n = /\/((?:te|tf|tg)-[a-z-]+)\.json\.gz/.exec(r.request().url())[1]; return TRAPS[n] ? r.fulfill({status: 200, contentType: 'application/json', body: TRAPS[n]}) : r.continue(); });
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        p.on('console', m => { if (m.type() === 'error' && /Failed to fetch|telech-[efg]|tq-/i.test(m.text())) errs.push(m.text()); });
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.telechE && window.LCNDA_EXT?.telechF && window.LCNDA_EXT?.telechG && window.LCNDA_EXT?.terreQuotidien, null, {timeout: 30000});
        await p.waitForLoadState('networkidle').catch(() => {}); await sleep(500);

        await t('fichiers piégés (balises, javascript:) : village, monographie, fiche — rien ne s’exécute, seulement des liens http(s) ; années av. J.-C.', async () => {
            const r = await p.evaluate(async () => {
                const out = [], N = {id: 0, name: 'Nîmes', lat: 43.8367, lon: 4.3601, insee: '30189'};
                for (const k of ['telechE', 'telechF', 'telechG']) { const h = document.createElement('div'); document.body.appendChild(h); const n = await window.LCNDA_EXT[k].placeInto(h, N, {force: true, detached: true}); h.querySelectorAll('details').forEach(d => { d.open = true; }); out.push([k, n, h.innerHTML, h.textContent]); }
                const life = {ok: true, person: {id: 9, first: 'Jean', last: 'DÉPUTÉ', gender: 'male', birth: 1750, death: 1820}, jobs: [{text: 'militaire'}], events: [{tag: 'BIRT', year: 1750, lat: 43.8367, lon: 4.3601, place: 'Nîmes'}, {tag: 'RESI', year: 1792, lat: 43.8367, lon: 4.3601, place: 'Nîmes'}]};
                for (const k of ['telechE', 'telechF', 'telechG']) { const h = document.createElement('div'); document.body.appendChild(h); const n = await window.LCNDA_EXT[k].personInto(h, 9, {life, force: true, detached: true}); out.push([k + '-p', n, h.innerHTML, h.textContent]); }
                await new Promise(r => setTimeout(r, 300));
                return {out, xss: window.__xss || 0, imgs: document.querySelectorAll('img[src="x"]').length};
            });
            assert.strictEqual(r.xss, 0, 'aucun code des fichiers exécuté'); assert.strictEqual(r.imgs, 0);
            for (const [k, n, html] of r.out) {
                assert.ok(!/<img\b/i.test(html), `${k} : pas de balise venue du fichier`);
                assert.ok(!/href="(?!https?:)/i.test(html), `${k} : seulement des liens http(s)`);
            }
            const txt = Object.fromEntries(r.out.map(x => [x[0], x[3]]));
            assert.ok(r.out.find(x => x[0] === 'telechE')[1] >= 2, txt.telechE); assert.match(txt.telechE, /50 av\. J\.-C\.–10/); assert.ok(!/-50–10/.test(txt.telechE));
            assert.ok(r.out.find(x => x[0] === 'telechF')[1] >= 2, txt.telechF); assert.ok(r.out.find(x => x[0] === 'telechG')[1] >= 2, txt.telechG);
            assert.match(txt['telechG-p'], /Député/, 'la comparaison des noms marche (fiche décédée)');
            // ⚙️ Réglages : la source et la licence du fichier piégé (adresse javascript:) → du texte, pas un lien
            await p.evaluate(() => window.LCNDA_EXT.telechG.openSettings());
            await p.waitForSelector('[data-tg-settings-page]', {timeout: 20000});
            const st = await p.evaluate(() => ({bad: document.querySelectorAll('[data-tg-settings-page] a[href^="javascript"], [data-tg-settings-page] img').length, xss: window.__xss || 0}));
            assert.deepStrictEqual(st, {bad: 0, xss: 0});
        });
        await t('🪙 la pièce dans sa poche (terre-quotidien) : une image en temps normal, aucune en consultation ni pour un invité du réseau local', async () => {
            const detail = {person: {id: 5, gender: 'male'}, events: [{gedcom_tag: 'BIRT', year: 1880, sort_date: '1880-01-01'}, {gedcom_tag: 'DEAT', year: 1950, sort_date: '1950-01-01'}]};
            const html = mode => p.evaluate(async ([d, m]) => {
                document.body.classList.toggle('is-kiosk', m === 'kiosk'); window.LCNDA_GUEST = m === 'guest' ? {name: 'tablette'} : null;
                const h = await window.LCNDA_EXT.terreQuotidien.personHtml(d, {only: ['poche']});
                const box = document.createElement('div'); box.innerHTML = h; document.body.appendChild(box); await new Promise(r => setTimeout(r, 300)); box.remove();
                document.body.classList.remove('is-kiosk'); window.LCNDA_GUEST = null; return h;
            }, [detail, mode]);
            const normal = await html('normal'); assert.match(normal, /<img [^>]*commons\.wikimedia\.org/, 'en temps normal, la vignette de la pièce');
            const n0 = outside.length;
            const kiosk = await html('kiosk'), guest = await html('guest');
            for (const h of [kiosk, guest]) { assert.ok(!/<img\b/.test(h), h.slice(0, 300)); assert.match(h, /tq-coin-off/); assert.match(h, /href="https:\/\/commons\.wikimedia\.org\/wiki\/File:/, 'le lien vers l’image reste (un clic)'); }
            assert.deepStrictEqual(outside.slice(n0).filter(u => /wikimedia/.test(u)), [], 'aucune vignette demandée');
        });
        await t('G : fiche vivante (sans le drapeau de la carte) → aucune comparaison de noms ni « Chercher ce nom » ; Listes : une liste d’autrefois ne propose jamais une fiche vivante', async () => {
            const r = await p.evaluate(async () => {
                const ev = [{tag: 'BIRT', year: 1918, lat: 48.03833, lon: 0.18778, place: 'Saint-Pavace'}];
                const run = async life => { const h = document.createElement('div'); const n = await window.LCNDA_EXT.telechG.personInto(h, 1, {life, parts: ['compagnons', 'poilus'], force: true, detached: true}); return [n, h.textContent, h.querySelectorAll('[data-tg-copy]').length]; };
                const dead = await run({ok: true, person: {id: 1, first: 'Bernard', last: 'DEMOLINS', gender: 'male', birth: 1918, death: 2012}, events: ev});
                const alive = await run({ok: true, person: {id: 1, first: 'Bernard', last: 'DEMOLINS', gender: 'male', birth: 1918, death: null, living_status: 'living'}, events: ev});
                const conf = await run({ok: true, person: {id: 1, first: 'Bernard', last: 'DEMOLINS', gender: 'male', birth: 1890, death: 1960, is_private: 1}, events: ev});
                const LP = window.LCNDA_EXT.listesPersonnes; await LP.loadIndex(true);
                const d = window.LCNDA_EXT.dataLists.find(x => x.id === 'tg_compagnons'); const rows = await d.load();
                const ids = n => { const row = rows.find(x => x.name === n); const m = LP.matchRow(d, row); return Object.values(m?.cells || {}).flatMap(c => c.cands.map(x => x.p.id)); };
                return {dead, alive, conf, bernard: ids('Bernard Demolins'), gaston: ids('Gaston Tavian')};
            });
            assert.ok(r.dead[0] >= 1 && /Demolins/.test(r.dead[1]), 'décédé : comparé (sur l’ordinateur)');
            assert.deepStrictEqual(r.alive, [0, '', 0], 'vivant : rien'); assert.strictEqual(r.conf[2], 0, 'confidentiel : pas de « Chercher ce nom »'); assert.ok(!/Demolins/.test(r.conf[1]));
            assert.deepStrictEqual(r.bernard, [], 'Listes : Bernard DEMOLINS (vivant dans la base) n’est pas proposé');
            assert.deepStrictEqual(r.gaston, [2], 'Listes : Gaston TAVIAN (décédé) est proposé');
        });
        await t('aucune erreur JavaScript, aucun « Failed to fetch »', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(fails ? `${fails} essai(s) raté(s).` : 'Audit des lots E, F, G : tout va bien.');
    process.exit(fails ? 1 : 0);
})();
