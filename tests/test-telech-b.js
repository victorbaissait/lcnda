#!/usr/bin/env node
/* 🐑 La vie du village et la nature (téléchargements, lot B) — assets/js/heritage-telech-b-village.js, assets/css/telech-b.css,
 * assets/data/tb-*.json.gz (scripts/telech-b/build.py, .github/workflows/telech-b.yml).
 *  1. Node : les fichiers livrés (licences, sources, tailles) et le calcul (Wikidata + OpenStreetMap sans doublon, ce qui existait
 *     l'année de sa naissance, la série de vendanges la plus proche dans les lignes de « hist_vendanges »).
 *  2. Serveur et écran (php -S + Playwright, base temporaire, pas d'Internet) : Jean PERRIN né à Confracourt (Haute-Saône) en 1801,
 *     marié en 1825 ; Luc PERRIN vivant. Le lavoir et le calvaire de Confracourt (vraies données Wikidata), les vendanges lues
 *     dans la liste « hist_vendanges » du pack Histoire du lieu (remplacée ici par deux lignes d'essai) ; Réglages (un sujet s'éteint, ↶) ; registres (Listes, monographie, cartes, à la demande).
 *   node tests/test-telech-b.js */
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
const H = require('../assets/js/heritage-telech-b-village.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const raw = n => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'assets/data', `tb-${n}.json.gz`))).toString('utf8'));
const THEMES = ['croix', 'eau', 'village', 'bornes', 'berger', 'cultes'];
const CONFRACOURT = {lat: 47.6671, lon: 5.8771};

(async () => {
    /* ═════════ 1. les fichiers et le calcul ═════════ */
    await t('fichiers livrés : présents, petits (< 15 Mo chacun, < 1 Mo en tout), chacun avec source, adresse, licence et date', async () => {
        let tot = 0;
        for (const n of [...THEMES.map(x => `wd-${x}`), 'cepages']) {
            const f = path.join(root, 'assets/data', `tb-${n}.json.gz`), st = fs.statSync(f); tot += st.size; assert.ok(st.size < 15e6, n);
            const d = raw(n); assert.ok(d.source && /^https:\/\//.test(d.url) && d.licence && /^https:\/\//.test(d.licence_url) && /^\d{4}-\d\d-\d\d$/.test(d.built), n);
            assert.ok(!d.fixture, `${n} : pas un fichier d’essai`);
            if (n.startsWith('wd-') || n === 'cepages') { assert.strictEqual(d.licence, 'CC0 1.0', n); assert.ok(d.rows.length > 50, n); }
        }
        assert.ok(tot < 1e6, `${tot} octets`); console.log(`  (en tout ${Math.round(tot / 1024)} Ko)`);
        const m = JSON.parse(fs.readFileSync(path.join(root, 'assets/data/manifest.json'), 'utf8'));
        assert.ok(!m.packs['tb-vendanges'] && !fs.existsSync(path.join(root, 'assets/data/tb-vendanges.json.gz')), 'pas de 2e copie des vendanges (pack « Histoire du lieu »)');
        for (const n of ['tb-wd-croix', 'tb-cepages']) assert.strictEqual(m.packs[n]?.script, 'scripts/telech-b/build.py', `${n} dans Réglages → 🗂 Données`);
    });
    await t('Wikidata : chaque point a son élément (Q…), une position en France ou un pays voisin, une sorte connue', async () => {
        const kinds = {croix: ['croix', 'calvaire'], eau: ['lavoir', 'puits', 'fontaine'], village: ['four', 'pigeonnier'], bornes: ['borne', 'octroi', 'douane'], berger: ['draille', 'buron', 'cabane'], cultes: ['temple', 'synagogue']};
        for (const th of THEMES) {
            const R = H.table(raw(`wd-${th}`));
            assert.ok(R.every(r => /^Q\d+$/.test(r.src) && Math.abs(r.lat) <= 90 && Math.abs(r.lon) <= 180 && ['France', 'Belgique', 'Suisse', 'Luxembourg', 'Monaco', 'Andorre'].includes(r.country) && kinds[th].includes(r.k)), th);
            assert.ok(R.filter(r => r.lat > 41 && r.lat < 51.5 && r.lon > -5.5 && r.lon < 10).length / R.length > 0.98, `${th} : surtout l’Europe (l’outre-mer aussi)`);
        }
        const cu = H.table(raw('wd-cultes')); assert.ok(cu.some(r => r.n === 'synagogue de Nîmes' && r.from === 1796));
    });
    await t('Wikidata + OpenStreetMap : un point OSM à moins de 40 m d’un point Wikidata de même sorte n’est pas compté deux fois', async () => {
        const wd = [{k: 'lavoir', n: 'Lavoir (wd)', lat: 47.0, lon: 5.0, src: 'Q1'}];
        const osm = [{k: 'lavoir', n: 'Lavoir (osm)', lat: 47.0002, lon: 5.0001, osm: 'n1'}, {k: 'puits', n: 'Puits', lat: 47.0002, lon: 5.0001, osm: 'w2'}, {k: 'lavoir', n: 'Autre lavoir', lat: 47.01, lon: 5.0, osm: 'n3'}];
        const M = H.merge(wd, osm);
        assert.deepStrictEqual(M.map(r => r.n), ['Lavoir (wd)', 'Puits', 'Autre lavoir']);
        assert.strictEqual(M[0].url, 'https://www.wikidata.org/wiki/Q1'); assert.strictEqual(M[1].url, 'https://www.openstreetmap.org/way/2');
    });
    await t('autour d’un lieu : le plus proche d’abord ; « de son vivant » écarte ce qui est construit après ou détruit avant', async () => {
        const rows = [{k: 'four', n: 'A', lat: 47.0, lon: 5.0, from: 1850, to: null}, {k: 'four', n: 'B', lat: 47.001, lon: 5.0, from: null, to: 1700}, {k: 'four', n: 'C', lat: 47.005, lon: 5.0, from: 1600, to: null}];
        assert.deepStrictEqual(H.near(rows, {lat: 47, lon: 5}, 1).map(x => x.r.n), ['A', 'B', 'C']);
        assert.deepStrictEqual(H.near(rows, {lat: 47, lon: 5}, 1, 1801).map(x => x.r.n), ['C']);
        assert.deepStrictEqual(H.near(rows, {lat: 0, lon: 0}, 1), [], 'lieu sans position : rien');
        const eau = H.merge(H.table(raw('wd-eau')), null), croix = H.merge(H.table(raw('wd-croix')), null);
        assert.ok(H.near(eau, CONFRACOURT, 1.5).some(x => x.r.n === 'lavoir de Confracourt'));
        assert.ok(H.near(croix, CONFRACOURT, 1.5).some(x => x.r.n === 'calvaire de Confracourt'));
    });
    await t('🍇 vendanges (lignes de « hist_vendanges », pack Histoire du lieu) : la série la plus proche, sa moyenne ; trop loin : rien', async () => {
        const rows = [{code: 'SLo', region: 'Lorraine du Sud', year: 1801, days: 30, diff: -6, lat: 47.98, lon: 5.88}, {code: 'SLo', region: 'Lorraine du Sud', year: 1800, days: 40, diff: 4, lat: 47.98, lon: 5.88},
            {code: 'Bur', region: 'Bourgogne', year: 1801, days: 20, diff: -5, lat: 47.32, lon: 5.04}];
        const S = H.harvestSeries(rows, CONFRACOURT);
        assert.strictEqual(S.code, 'SLo'); assert.deepStrictEqual(S.rows.map(r => r.year), [1800, 1801]); assert.strictEqual(S.mean, 36); assert.deepStrictEqual([S.first, S.last], [1800, 1801]);
        assert.strictEqual(H.harvestSeries(rows, {lat: 48.4, lon: -4.5}), null, 'Brest : pas de vigne à moins de 150 km');
        assert.deepStrictEqual(H.ghdDay(15.3), {m: 9, d: 15}); assert.deepStrictEqual(H.ghdDay(0), {m: 8, d: 31}); assert.deepStrictEqual(H.ghdDay(31), {m: 10, d: 1});
    });
    await t('docs et fabrication : licences citées, workflow GitHub au bon modèle (lancé à la main, rien sur un simple push)', async () => {
        const doc = fs.readFileSync(path.join(root, 'docs/telechargements-lot-b.md'), 'utf8');
        ['CC0', 'ODbL', 'CC BY-SA 4.0', 'free of charge', 'PEP725', 'Atlas linguistique', 'Blason populaire', 'Lien seulement'].forEach(w => assert.ok(doc.includes(w), w));
        const wf = fs.readFileSync(path.join(root, '.github/workflows/telech-b.yml'), 'utf8');
        assert.match(wf, /workflow_dispatch/); assert.match(wf, /paths: \['\.github\/workflows\/telech-b\.yml'\]/); assert.match(wf, /if: github\.event_name != 'push'/); assert.match(wf, /pull --rebase/);
        assert.ok(fs.readFileSync(path.join(root, 'index.php'), 'utf8').includes('assets/js/heritage-telech-b-village.js'));
    });

    /* ═════════ 2. serveur et écran ═════════ */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-tb-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','PERRIN','male','deceased',1),(2,'Anne','GIRARD','female','deceased',0),(3,'Paul','DURAND','male','deceased',0),(4,'Luc','PERRIN','male','living',0)");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude) VALUES(1,'Confracourt','Haute-Saône','France',47.6671,5.8771),(2,'Ailleurs','','France',NULL,NULL)");
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,1,2)");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,family_id,event_type_id,date_text,year,sort_date,place_id) VALUES(?,?,?,?,?,?,?,?)");
$ins->execute(['person',1,null,$t('BIRT'),'1801',1801,'1801',1]); $ins->execute(['family',null,1,$t('MARR'),'1825',1825,'1825',1]);
$ins->execute(['person',3,null,$t('BIRT'),'1850',1850,'1850',2]); $ins->execute(['person',4,null,$t('BIRT'),'1990',1990,'1990',1]);
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
        await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => { outside.push(r.request().url()); return r.abort(); }); // pas d'Internet dans l'essai
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultPersonBlocks, null, {timeout: 30000});
        await p.waitForFunction(() => !!window.LCNDA_EXT?.telechB, null, {timeout: 20000});
        const into = (fn, arg, opts = {}) => p.evaluate(async ([f, a, o]) => { const h = document.createElement('div'); document.body.appendChild(h); const n = await window.LCNDA_EXT.telechB[f](h, a, {detached: true, ...o}); const r = [n, h.innerHTML, h.textContent]; h.remove(); return r; }, [fn, arg, opts]);

        await t('fiche de Jean PERRIN : ⛲ le lavoir et le calvaire de Confracourt ; pas de 2e ligne des vendanges (déjà dans « Le lieu à son époque ») ; ↗ source partout', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('[data-tb-person="1"] .tb-row', {timeout: 30000});
            const txt = await p.textContent('[data-tb-person="1"]');
            assert.match(txt, /Près de Confracourt, là où il est né\(e\)/); assert.match(txt, /lavoir de Confracourt/); assert.match(txt, /calvaire de Confracourt/);
            assert.ok(!/vendang/i.test(txt), 'les vendanges de sa vie sont dans « Le lieu à son époque »');
            const a = await p.$$eval('[data-tb-person="1"] a', l => l.map(x => [x.href, x.target, x.rel]));
            assert.ok(a.length && a.every(([h, tg, rel]) => /^https?:\/\//.test(h) && tg === '_blank' && /noopener/.test(rel)));
            assert.ok((await p.$$eval('[data-tb-person="1"] .tb-row', l => l.map(r => !!r.querySelector('.hist-src')))).every(Boolean), 'une ligne Source sous chaque sujet');
            assert.strictEqual(await p.evaluate(() => document.querySelector('[data-tb-person="1"]').closest('section.card').hidden), false);
        });
        await t('Paul DURAND (lieu de naissance sans position) : rien à dire → le bloc est caché ; Luc PERRIN (vivant) : rien ne part sur Internet', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 3; A.setModule('personnes'); });
            await p.waitForSelector('[data-tb-person="3"]', {state: 'attached', timeout: 20000}); await sleep(2500);
            assert.strictEqual(await p.evaluate(() => document.querySelector('[data-tb-person="3"]').closest('section.card').hidden), true);
            const n0 = outside.length;
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 4; A.setModule('personnes'); });
            await p.waitForSelector('[data-tb-person="4"]', {state: 'attached', timeout: 20000}); await sleep(2500);
            assert.ok(!outside.slice(n0).some(u => /PERRIN|Confracourt/i.test(decodeURIComponent(u))), outside.slice(n0).join('\n'));
            assert.ok(!outside.some(u => /PERRIN|GIRARD/i.test(decodeURIComponent(u))), 'aucun nom de personne ne part sur Internet');
        });
        await t('lieu (fiche d’un village) : ✝️ ⛲ une phrase chacun, la liste sous « ▸ plus », Source + licence ; 🍇 ; un lieu sans position : rien', async () => {
            // le pack « Histoire du lieu » n'est pas installé dans l'essai : sa liste hist_vendanges répond avec deux lignes d'essai
            const stub = await p.evaluate(() => { const d = (window.LCNDA_EXT.dataListsEngine?.list?.() || window.LCNDA_EXT.dataLists).find(x => x.id === 'hist_vendanges'); if (!d) return false;
                window.__tbQ = []; d.installed = () => true; d.query = async q => { window.__tbQ.push(q); return {rows: [{code: 'SLo', region: 'Lorraine du Sud', year: 1801, days: 30, diff: -6, lat: 47.98, lon: 5.88, kind: 'normales'}, {code: 'SLo', region: 'Lorraine du Sud', year: 1802, days: 42, diff: 6, lat: 47.98, lon: 5.88, kind: 'normales'}], total: 2}; }; return true; });
            assert.ok(stub, 'la liste hist_vendanges existe (app-listes-donnees.js)');
            const [n, html, txt] = await into('placeInto', {id: 1, name: 'Confracourt', ...CONFRACOURT});
            assert.ok(n >= 3, txt); assert.deepStrictEqual(await p.evaluate(() => window.__tbQ[0].near), {...CONFRACOURT, km: 150}); assert.match(txt, /Calvaires et croix de chemin à moins de 3 km/); assert.match(txt, /Lavoirs, puits et fontaines à moins de 3 km/);
            assert.match(txt, /Les vendanges \(Lorraine du Sud, série à 35 km\) : d’habitude vers le 6 octobre ; dates connues de 1801 à 1802/); assert.match(txt, /pack « Histoire du lieu »/); assert.match(html, /▸ plus/); assert.match(txt, /Wikidata \(CC0\)/); assert.match(html, /tb-links/);
            assert.match(html, /https:\/\/www\.wikidata\.org\/wiki\/Q\d+/); assert.match(txt, /arriveront avec la mise à jour des données/);
            const none = await into('placeInto', {id: 0, name: '', lat: null, lon: null});
            assert.deepStrictEqual(none.slice(0, 2), [0, '']);
        });
        await t('Réglages → 🐑 Village et nature : un sujet s’éteint (↶), À propos des données (licences), liens seulement', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'telech_b'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-tb-settings-page] table tbody tr', {timeout: 20000});
            const txt = await p.textContent('[data-tb-settings-page]');
            assert.match(txt, /CC0 1\.0/); assert.match(txt, /Daux/); assert.match(txt, /Pas de copie ici/); assert.match(txt, /Pas encore fabriqué \(sur GitHub\)/); assert.match(txt, /PEP725/); assert.match(txt, /Atlas linguistique de la France/);
            await p.click('[data-tb-tg="croix"] input');
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-telech-b')).croix), false);
            const off = await into('placeInto', {id: 1, name: 'Confracourt', ...CONFRACOURT}); assert.ok(!/Calvaires et croix/.test(off[2]), 'sujet éteint : plus affiché');
            await sleep(300); await p.locator('button:has-text("↶ Annuler")').last().click({timeout: 5000}); await sleep(300);
            assert.notStrictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-telech-b')).croix), false);
        });
        await t('registres : listes (colonne Source), monographie, cartes, à la demande, bloc de fiche, onglet Réglages', async () => {
            const r = await p.evaluate(async x => {
                const E = window.LCNDA_EXT, L = E.dataLists.filter(d => d.id.startsWith('tb_'));
                const out = {ids: L.map(d => d.id), src: true, rows: {}};
                for (const d of L) { const rows = await d.load(); out.rows[d.id] = rows.length; if (!d.fields.some(f => f.key === 'src' && f.type === 'url') || !d.source) out.src = false; if (rows[0] && !/^https:\/\//.test(rows[0].src)) out.src = false; }
                const mono = E.monographSections.find(s => s.id === 'tb_eau'), mh = document.createElement('div'); document.body.appendChild(mh);
                out.mono = [await mono.render({id: 1, name: 'Confracourt', latitude: x.lat, longitude: x.lon}, mh, {}), mh.textContent]; mh.remove();
                out.secs = E.monographSections.filter(s => s.id.startsWith('tb_')).map(s => s.id);
                const lay = E.mapLayerSources.find(s => s.id === 'tb_cultes'); out.map = (await lay.run({bbox: [3.5, 43.5, 4.5, 44.2]})).features.length;
                const host = document.createElement('div'); document.body.appendChild(host);
                await E.dataSources.find(d => d.id === 'tb_personne').run({person: {id: 1}}, host); out.ds = host.textContent; host.remove();
                out.srcs = E.dataSources.filter(s => /^tb_/.test(s.id)).map(s => [s.id, s.online]);
                out.block = (window.LCNDA_APP.defaultPersonBlocks || []).some(b => b[0] === 'telech_b_village');
                out.tab = (window.LCNDA_APP.defaultMaintenanceTabs || []).some(b => b[0] === 'telech_b');
                return out;
            }, CONFRACOURT);
            assert.ok(!r.ids.includes('tb_vendanges'), 'une seule liste des vendanges (hist_vendanges)');
            ['tb_croix', 'tb_eau', 'tb_cultes', 'tb_cepages'].forEach(id => assert.ok(r.ids.includes(id) && r.rows[id] > 50, id));
            assert.ok(r.src, 'colonne Source partout'); assert.strictEqual(r.mono[0], true); assert.match(r.mono[1], /lavoir de Confracourt/);
            assert.deepStrictEqual(r.secs, ['tb_croix', 'tb_eau', 'tb_village', 'tb_bornes', 'tb_berger', 'tb_cultes', 'tb_vendanges']);
            assert.ok(r.map > 20, String(r.map)); assert.match(r.ds, /Confracourt/); assert.ok(r.srcs.length >= 8 && r.srcs.every(([, o]) => o === false), 'rien en ligne');
            assert.ok(r.block && r.tab);
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
