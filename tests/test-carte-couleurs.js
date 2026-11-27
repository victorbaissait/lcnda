#!/usr/bin/env node
/* 🎨 Couleurs de la carte (assets/js/app-carte-couleurs.js) — Réglages → Cartes et fonds de carte → « Couleurs de la carte » :
 *  les couleurs de départ ne changent pas ; une couleur changée suit partout (points, regroupements, légende, carte d'une fiche,
 *  export) et reste après rechargement ; palette « Pour daltoniens » ; formes par sorte ; ↺ et ↶ Annuler ; le chiffre des
 *  regroupements lisible (blanc ou noir) ; la légende ne cache pas la mention « © OpenStreetMap… » (1440 / 390, clair / sombre).
 *   node tests/test-carte-couleurs.js */
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
const KC = require('../assets/js/app-carte-couleurs.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BEFORE = {births: '#2b8a3e', marriages: '#c2255c', deaths: '#495057', burials: '#7048e8', residences: '#1971c2', census: '#0b7285', events: '#e8590c'};
const rgb = h => `rgb(${[1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(', ')})`;

(async () => {
    await t('calculs : couleurs de départ exactes, contraste, palettes complètes, sorte la plus fréquente', async () => {
        assert.deepStrictEqual(KC.DEFAULT, BEFORE);
        assert.deepStrictEqual(KC.read().colors, BEFORE);
        assert.strictEqual(KC.textOn('#2b8a3e'), '#ffffff'); assert.strictEqual(KC.textOn('#495057'), '#ffffff');
        assert.strictEqual(KC.textOn('#f0e442'), '#111111'); assert.strictEqual(KC.textOn('#ffc078'), '#111111'); assert.strictEqual(KC.textOn('#ffffff'), '#111111');
        for (const [id, , cols] of KC.PRESETS) { assert.deepStrictEqual(Object.keys(cols).sort(), KC.KEYS.slice().sort(), id); assert.strictEqual(new Set(Object.values(cols)).size >= (id === 'nb' ? 4 : 7), true, id); }
        const okabe = KC.PRESETS.find(p => p[0] === 'daltonien')[2];
        Object.values(okabe).forEach(c => assert.ok(KC.NAMES[c], 'nom de couleur ' + c));
        assert.strictEqual(KC.groupKind([{gedcom_tag: 'DEAT'}, {gedcom_tag: 'BIRT'}, {gedcom_tag: 'DEAT'}]), 'deaths');
        assert.strictEqual(KC.kindOf({is_cemetery: 1}), 'burials'); assert.strictEqual(KC.kindOf({gedcom_tag: 'OCCU'}), 'events');
        assert.deepStrictEqual(KC.clean({colors: {births: 'red', deaths: '#ABCDEF'}}).colors, {...BEFORE, deaths: '#abcdef'});
        // aucune autre copie des couleurs dans app-carte.js : elles viennent du réglage
        const src = fs.readFileSync(path.join(root, 'assets/js/app-carte.js'), 'utf8');
        Object.values(BEFORE).forEach(c => assert.ok(!src.toLowerCase().includes(c), 'couleur en dur dans app-carte.js : ' + c));
    });

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-carte-couleurs-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$tag = function ($t) use ($pdo) { $s = $pdo->prepare('SELECT id FROM event_types WHERE gedcom_tag=? ORDER BY id LIMIT 1'); $s->execute([$t]); return (int) $s->fetchColumn(); };
$pl = function ($name, $lat, $lon) use ($pdo) { $pdo->prepare('INSERT INTO places(name, county, country, latitude, longitude) VALUES(?,?,?,?,?)')->execute([$name, 'Corrèze', 'France', $lat, $lon]); return (int) $pdo->lastInsertId(); };
$tulle = $pl('Tulle', 45.27, 1.77); $malv = $pl('Malvialle', 45.1, 2.6); $aur = $pl('Aurillac', 44.93, 2.44); $brive = $pl('Brive', 45.16, 1.53); $paris = $pl('Paris', 48.85, 2.35); $lyon = $pl('Lyon', 45.76, 4.84); $ussel = $pl('Ussel', 45.55, 2.31);
$per = function ($f, $l, $g, $evs, $start = 0) use ($pdo, $tag) { $pdo->prepare("INSERT INTO persons(first_name,last_name,gender,living_status,is_start) VALUES(?,?,?,'deceased',?)")->execute([$f, $l, $g, $start]); $id = (int) $pdo->lastInsertId();
    foreach ($evs as [$t, $y, $p]) { if (!$tag($t)) continue; $pdo->prepare('INSERT INTO events(scope, person_id, event_type_id, year, date_text, place_id) VALUES(\'person\',?,?,?,?,?)')->execute([$id, $tag($t), $y, (string) $y, $p]); } return $id; };
$ids = [
  'jean' => $per('Jean', 'MAZAUD', 'male', [['BIRT', 1900, $tulle], ['DEAT', 1970, $tulle], ['BURI', 1970, $brive], ['RESI', 1930, $ussel], ['OCCU', 1925, $lyon]], 1),
  'marie' => $per('Marie', 'LACOMBE', 'female', [['BIRT', 1875, $malv], ['MARR', 1898, $aur], ['CENS', 1906, $paris], ['BIRT', 1876, $aur]]),
  'paul' => $per('Paul', 'DURAND', 'male', [['BIRT', 1880, $brive], ['DEAT', 1950, $paris], ['BIRT', 1881, $tulle]]),
];
$ids['tags'] = array_values(array_filter(['BIRT', 'MARR', 'DEAT', 'BURI', 'RESI', 'CENS', 'OCCU'], $tag));
echo json_encode($ids);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/jean/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const ID = JSON.parse(seed.stdout.trim().split('\n').pop());
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    const open = async (width, dark = false) => {
        const ctx = await browser.newContext({viewport: {width, height: width < 500 ? 844 : 900}, colorScheme: dark ? 'dark' : 'light'});
        await ctx.route(/tile\.openstreetmap|arcgisonline|wmts|tile\./, r => r.abort()); // pas de tuiles pendant l'essai
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_PARTS?.renderMap && window.LCNDA_APP?.state?.csrf && window.LCNDA_CARTE_COULEURS, null, {timeout: 30000});
        if (dark) await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
        return p;
    };
    const waitRender = async p => { await sleep(150); await p.waitForFunction(() => document.querySelector('#map-stage') && !document.querySelector('#map-stage.is-loading'), null, {timeout: 15000}); await sleep(250); };
    /** la Carte, tous les événements ; cluster: false = chaque lieu à part (pour compter les points) */
    const toMap = async (p, zoom = 7, {cluster = true} = {}) => {
        await p.evaluate(cl => { const A = window.LCNDA_APP; A.state.mapMode = 'standard'; A.state.mapTag = 'all'; A.state.mapDisplay = 'markers'; localStorage.removeItem('genealogie-map-lineage'); if (cl) localStorage.removeItem('genealogie-map-options'); else localStorage.setItem('genealogie-map-options', JSON.stringify({cluster: false})); A.setModule('carte'); }, cluster);
        await p.waitForSelector('#map-stage'); await waitRender(p);
        await p.evaluate(z => { const A = window.LCNDA_APP; A.state.mapCenter = {lat: 45.6, lon: 2.6}; A.state.mapZoom = z; window.LCNDA_PARTS.drawMap(); }, zoom); await sleep(150);
    };
    const clusterOn = (p, on) => p.evaluate(on => { localStorage.setItem('genealogie-map-options', JSON.stringify({cluster: on})); window.LCNDA_PARTS.drawMap(); }, on);
    const kindColors = p => p.$$eval('#map-overlay [data-kc]', els => els.map(e => [e.className.includes('map-cluster') ? 'cluster' : 'marker', e.dataset.kc, e.style.getPropertyValue('--kind-color').trim()]));
    const legendColors = p => p.$$eval('#map-legend i[data-kc]', els => Object.fromEntries(els.map(e => [e.dataset.kc, getComputedStyle(e).backgroundColor])));
    try {
        const p = await open(1440);
        await toMap(p, 8, {cluster: false});

        await t('départ : les points et la légende ont exactement les couleurs d’avant', async () => {
            const kc = await kindColors(p); assert.ok(kc.length >= 4, 'points de sortes');
            kc.forEach(([, k, c]) => assert.strictEqual(c, BEFORE[k], k));
            const lg = await legendColors(p); assert.ok(Object.keys(lg).length >= 5, 'légende');
            Object.entries(lg).forEach(([k, c]) => assert.strictEqual(c, rgb(BEFORE[k]), k));
            assert.strictEqual(await p.$$eval('#map-overlay .map-marker.is-shape', x => x.length), 0, 'losanges au départ');
        });

        await t('légende : une pastille ouvre la fenêtre de couleur ; la couleur suit points, regroupements, légende et reste après rechargement', async () => {
            await p.click('#map-legend [data-kc-pick="births"]');
            await p.waitForSelector('.ui-colorbox');
            const sw = await p.$$eval('.ui-colorbox .ui-sw-btn[data-c]', b => b.map(x => x.dataset.c).filter(c => c && c !== '#2b8a3e'));
            const pick = sw[0]; assert.ok(pick, 'une couleur de l’app');
            await p.click(`.ui-colorbox .ui-sw-btn[data-c="${pick}"]`);
            if (await p.$('.ui-colorbox [data-ui-ok]')) await p.click('.ui-colorbox [data-ui-ok]');
            await sleep(300);
            assert.strictEqual(await p.evaluate(() => window.LCNDA_CARTE_COULEURS.color('births')), pick.toLowerCase());
            (await kindColors(p)).filter(x => x[1] === 'births').forEach(([, , c]) => assert.strictEqual(c, pick.toLowerCase()));
            assert.strictEqual((await legendColors(p)).births, rgb(pick.toLowerCase()));
            // regroupement : au zoom faible, la pastille a la couleur de sa sorte la plus fréquente
            await p.evaluate(() => { window.LCNDA_CARTE_COULEURS.setColor('births', '#123456'); });
            await clusterOn(p, true);
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.mapZoom = 5; window.LCNDA_PARTS.drawMap(); }); await sleep(150);
            const cl = (await kindColors(p)).filter(x => x[0] === 'cluster'); assert.ok(cl.length >= 1, 'regroupement');
            cl.forEach(([, k, c]) => assert.strictEqual(c, k === 'births' ? '#123456' : BEFORE[k]));
            assert.ok(cl.some(x => x[1] === 'births'), 'un regroupement de naissances');
            await p.reload(); await p.waitForFunction(() => window.LCNDA_PARTS?.renderMap && window.LCNDA_APP?.state?.csrf && window.LCNDA_CARTE_COULEURS, null, {timeout: 30000});
            await toMap(p, 8, {cluster: false});
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-carte-couleurs')).colors.births), '#123456');
            (await kindColors(p)).filter(x => x[1] === 'births').forEach(([, , c]) => assert.strictEqual(c, '#123456'));
            assert.strictEqual((await legendColors(p)).births, rgb('#123456'));
        });

        await t('chiffre des regroupements : blanc sur foncé, noir sur clair (contraste ≥ 4,5)', async () => {
            await clusterOn(p, true);
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.mapZoom = 5; window.LCNDA_PARTS.drawMap(); }); await sleep(150);
            const read = () => p.$$eval('#map-overlay .map-cluster', els => els.map(e => [e.dataset.kc, getComputedStyle(e).backgroundColor, getComputedStyle(e.querySelector('span')).color]));
            for (const c of ['#123456', '#fff3bf']) {
                await p.evaluate(c => { const K = window.LCNDA_CARTE_COULEURS; K.KEYS.forEach(k => K.setColor(k, c, {live: true})); }, c); await sleep(150);
                const rows = await read(); assert.ok(rows.length, 'regroupements');
                rows.forEach(([, bg, fg]) => { assert.strictEqual(bg, rgb(c)); assert.strictEqual(fg, c === '#123456' ? 'rgb(255, 255, 255)' : 'rgb(17, 17, 17)'); });
                const toHex = s => '#' + s.match(/\d+/g).slice(0, 3).map(n => Number(n).toString(16).padStart(2, '0')).join('');
                rows.forEach(([, bg, fg]) => assert.ok(KC.contrast(toHex(bg), toHex(fg)) >= 4.5, `contraste ${bg} / ${fg}`));
            }
            // points seuls avec un nombre : pareil
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.mapZoom = 13; A.state.mapCenter = {lat: 45.27, lon: 1.77}; window.LCNDA_PARTS.drawMap(); }); await sleep(150);
            const m = await p.$$eval('#map-overlay .map-marker.has-count span', s => s.map(x => getComputedStyle(x).color));
            assert.ok(m.length, 'point avec un nombre'); m.forEach(c => assert.strictEqual(c, 'rgb(17, 17, 17)'));
        });

        await t('↺ Remettre comme au départ (les couleurs), puis ↶ Annuler (Réglages → Cartes et fonds de carte)', async () => {
            await p.evaluate(() => window.LCNDA_CARTE_COULEURS.write({...window.LCNDA_CARTE_COULEURS.read(), colors: {...window.LCNDA_CARTE_COULEURS.read().colors, births: '#123456'}}));
            await p.click('#map-legend [data-kc-settings]');
            await p.waitForFunction(() => { const el = document.querySelector('[data-kc-panel]'); return el && el.offsetParent && el.querySelector('[data-kc-row]'); }, null, {timeout: 20000});
            assert.strictEqual(await p.evaluate(() => window.LCNDA_APP.state.maintenanceTab), 'design_maps');
            const txt = await p.textContent('[data-kc-panel]');
            assert.match(txt, /Couleurs de la carte/); assert.ok(txt.includes(KC.HELP), 'explication losange / rond');
            for (const n of ['Par défaut', 'Pour daltoniens', 'Pastel', 'Contrasté (impression)', 'Noir et blanc + formes', 'Formes différentes par sorte', 'Remettre comme au départ']) assert.ok(txt.includes(n), n);
            assert.strictEqual(await p.getAttribute('[data-kc-reset]', 'title'), 'Remettre les couleurs de départ', 'K3 : la bulle dit ce qui est remis');
            assert.strictEqual(await p.$$eval('[data-kc-panel] .ui-color', x => x.length), 7, 'une couleur par sorte (sélecteur de l’app)');
            await p.click('[data-kc-reset]'); await sleep(200);
            assert.deepStrictEqual(await p.evaluate(() => window.LCNDA_CARTE_COULEURS.read().colors), BEFORE);
            assert.strictEqual(await p.evaluate(() => localStorage.getItem('genealogie-carte-couleurs')), null, 'rien de gardé au départ');
            await p.getByRole('button', {name: /↶ Annuler/}).last().click(); await sleep(250);
            assert.strictEqual(await p.evaluate(() => window.LCNDA_CARTE_COULEURS.read().colors.births), '#123456', '↶ Annuler');
            // une couleur changée dans le réglage
            await p.evaluate(() => { const inp = document.querySelector('[data-kc-color="deaths"] input[type=hidden]'); inp.value = '#000000'; inp.dispatchEvent(new Event('input', {bubbles: true})); inp.dispatchEvent(new Event('change', {bubbles: true})); });
            await sleep(150);
            assert.strictEqual(await p.evaluate(() => window.LCNDA_CARTE_COULEURS.read().colors.deaths), '#000000');
            assert.match(await p.textContent('[data-kc-row="deaths"] .kc-hex'), /#000000/);
        });

        await t('palette « Pour daltoniens » (Okabe-Ito) : couleurs nommées, appliquées à la carte', async () => {
            await p.click('[data-kc-preset="daltonien"]'); await sleep(200);
            const ok = KC.PRESETS.find(x => x[0] === 'daltonien')[2];
            assert.deepStrictEqual(await p.evaluate(() => window.LCNDA_CARTE_COULEURS.read().colors), ok);
            assert.ok(await p.$('[data-kc-preset="daltonien"].is-on'));
            assert.match(await p.textContent('[data-kc-row="births"]'), /vert bleuté/);
            await toMap(p, 8, {cluster: false});
            (await kindColors(p)).forEach(([, k, c]) => assert.strictEqual(c, ok[k], k));
            Object.entries(await legendColors(p)).forEach(([k, c]) => assert.strictEqual(c, rgb(ok[k]), k));
        });

        await t('superposition et animation : mêmes couleurs de sortes (et légende)', async () => {
            const ok = KC.PRESETS.find(x => x[0] === 'daltonien')[2];
            for (const mode of ['overlay', 'timeline']) {
                await p.evaluate(m => { const A = window.LCNDA_APP; A.state.mapMode = m; A.setModule('carte'); }, mode);
                await p.waitForSelector('#map-stage'); await waitRender(p);
                await p.evaluate(() => { const A = window.LCNDA_APP; A.state.mapCenter = {lat: 45.6, lon: 2.6}; A.state.mapZoom = 8; window.LCNDA_PARTS.drawMap(); }); await sleep(200);
                const kc = await kindColors(p); assert.ok(kc.length >= 1, mode + ' : points');
                kc.forEach(([, k, c]) => assert.strictEqual(c, ok[k], mode + ' ' + k));
                Object.entries(await legendColors(p)).forEach(([k, c]) => assert.strictEqual(c, rgb(ok[k]), mode + ' légende ' + k));
                if (mode === 'timeline') {
                    const cur = await p.$$eval('#map-overlay .map-marker.is-current[data-kc]', e => e.map(x => [x.dataset.kc, getComputedStyle(x).backgroundColor]));
                    cur.forEach(([k, bg]) => assert.strictEqual(bg, rgb(ok[k]), 'animation, lieu du moment ' + k));
                }
            }
            await toMap(p, 8, {cluster: false});
        });

        await t('formes différentes par sorte : points, légende, carte d’une fiche et export', async () => {
            await p.evaluate(() => window.LCNDA_CARTE_COULEURS.setShapes(true)); await sleep(200);
            const shp = await p.$$eval('#map-overlay .map-marker.is-shape', els => els.map(e => [e.dataset.kc, e.querySelector('svg.kc-shape path')?.getAttribute('d')]));
            assert.ok(shp.length >= 4, 'formes');
            shp.forEach(([k, d]) => assert.strictEqual(d, KC.PATHS[KC.DEFAULT_SHAPE[k]], k));
            assert.ok(new Set(shp.map(x => x[1])).size >= 3, 'plusieurs formes ' + JSON.stringify(shp.map(x => x[0])));
            assert.ok((await p.$$eval('#map-legend i.is-shape svg', x => x.length)) >= 5, 'légende en formes');
            // les regroupements restent des ronds avec un nombre
            await clusterOn(p, true);
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.mapZoom = 5; window.LCNDA_PARTS.drawMap(); }); await sleep(150);
            assert.ok(await p.$$eval('#map-overlay .map-cluster', x => x.length && x.every(e => getComputedStyle(e).borderRadius !== '0px')));
            // export (image / impression) : la couleur de la sorte au centre du point
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.mapZoom = 13; A.state.mapCenter = {lat: 45.27, lon: 1.77}; window.LCNDA_PARTS.drawMap(); }); await sleep(200);
            const px = await p.evaluate(async () => {
                const c = await window.LCNDA_PARTS.mapCanvas(1), st = document.querySelector('#map-stage').getBoundingClientRect(), el = document.querySelector('#map-overlay [data-kc]'), r = el.getBoundingClientRect();
                const ctx = c.getContext('2d'), x = Math.round(r.left - st.left + r.width / 2), y = Math.round(r.top - st.top + r.height / 2) + 6, d = ctx.getImageData(x, y, 1, 1).data;
                return {kc: el.dataset.kc, rgb: `rgb(${d[0]}, ${d[1]}, ${d[2]})`, want: window.LCNDA_CARTE_COULEURS.color(el.dataset.kc)};
            });
            assert.strictEqual(px.rgb, rgb(px.want), 'export ' + px.kc);
            // carte d'une fiche
            await p.evaluate(async id => { const A = window.LCNDA_APP; A.state.currentPersonId = id; await A.setModule('personnes'); await A.selectPerson(id); }, ID.jean);
            const got = await p.waitForSelector('.person-map-point[data-kc]', {timeout: 15000}).then(() => true, () => false);
            assert.ok(got, 'la carte de la fiche de Jean MAZAUD');
            {
                const pts = await p.$$eval('.person-map-point[data-kc]', g => g.map(x => [x.dataset.kc, x.style.getPropertyValue('--event-color').trim(), !!x.querySelector('.kc-pm-shape')]));
                pts.forEach(([k, c, s]) => { assert.strictEqual(c, KC.PRESETS.find(x => x[0] === 'daltonien')[2][k], k); assert.ok(s, 'forme'); });
                await p.evaluate(() => window.LCNDA_CARTE_COULEURS.setShapes(false)); await sleep(100);
                assert.ok(await p.$$eval('.person-map-point[data-kc]', g => g.every(x => x.querySelector('rect') && !x.querySelector('.kc-pm-shape'))), 'losanges de nouveau');
            }
            await p.evaluate(() => window.LCNDA_CARTE_COULEURS.setShapes(false));
        });

        await t('palette « Noir et blanc + formes » coche les formes ; « Par défaut » revient aux couleurs de départ', async () => {
            await p.evaluate(() => window.LCNDA_CARTE_COULEURS.applyPreset('nb'));
            assert.strictEqual(await p.evaluate(() => window.LCNDA_CARTE_COULEURS.shapesOn()), true);
            await p.evaluate(() => window.LCNDA_CARTE_COULEURS.applyPreset('default'));
            assert.deepStrictEqual(await p.evaluate(() => window.LCNDA_CARTE_COULEURS.read()), {...KC.clean({}), preset: 'default'});
            await p.evaluate(() => window.LCNDA_CARTE_COULEURS.reset());
        });
        await p.context().close();

        for (const [w, dark] of [[1440, false], [390, false], [1440, true], [390, true]]) {
            await t(`la légende (7 sortes) ne cache pas la mention « © OpenStreetMap… » — ${w} px, ${dark ? 'sombre' : 'clair'}`, async () => {
                const q = await open(w, dark);
                await toMap(q, 6);
                await q.evaluate(() => { const A = window.LCNDA_APP; A.state.mapZoom = 9; A.state.mapCenter = {lat: 45.3, lon: 2.1}; window.LCNDA_PARTS.drawMap(); }); await sleep(300);
                const box = await q.evaluate(() => { const r = s => { const e = document.querySelector(s); if (!e || e.hidden) return null; const b = e.getBoundingClientRect(); return {l: b.left, r: b.right, t: b.top, b: b.bottom}; };
                    return {lg: r('#map-legend'), cap: r('#map-stage > .map-caption'), st: r('#map-stage'), lines: document.querySelectorAll('#map-legend > *').length, rows: document.querySelectorAll('#map-legend .map-legend-row').length}; });
                assert.ok(box.lg && box.cap, 'légende et mention visibles');
                assert.ok(box.lines >= 6, 'légende de ' + box.lines + ' lignes');
                const overlap = !(box.lg.b <= box.cap.t || box.cap.b <= box.lg.t || box.lg.r <= box.cap.l || box.cap.r <= box.lg.l);
                assert.ok(!overlap, `chevauchement ${JSON.stringify(box)}`);
                assert.ok(box.lg.t >= box.st.t, 'la légende reste dans la carte');
                // la mention sur trois lignes (autres fonds cités) : la légende remonte encore
                await q.evaluate(() => { const c = document.querySelector('#map-stage > .map-caption'); c.style.maxWidth = '160px'; c.innerHTML += ' · IGN · Etalab · © autres fournisseurs de fonds'; });
                await sleep(250);
                const b2 = await q.evaluate(() => { const g = document.querySelector('#map-legend').getBoundingClientRect(), c = document.querySelector('#map-stage > .map-caption').getBoundingClientRect(); return {gb: g.bottom, ct: c.top, ch: c.height}; });
                assert.ok(b2.ch > 40 && b2.gb <= b2.ct, `mention haute ${JSON.stringify(b2)}`);
                if (dark) {
                    const bg = await q.$eval('#map-legend', e => getComputedStyle(e).backgroundColor); assert.strictEqual(bg, 'rgb(34, 34, 34)');
                    const col = await q.$eval('#map-legend .map-legend-cfg', e => getComputedStyle(e).color); assert.notStrictEqual(col, 'rgb(34, 34, 34)');
                }
                assert.ok(await q.$('#map-legend [data-kc-pick]'), 'pastilles cliquables');
                await q.context().close();
            });
        }

        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close();
        proc.kill();
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
