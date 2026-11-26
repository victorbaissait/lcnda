#!/usr/bin/env node
/* 📊 Diagrammes « Partir des données » (assets/js/heritage-diagram-donnees.js ; maquette validée docs/design/diagrammes-donnees.html) :
 *  1. sans navigateur : les dessins conseillés selon la source et leur NOMBRE (réglage genealogie-diagrammes-conseilles : 5, 3 à 12,
 *     « Tous »), les champs proposés, le format 16:9 / A4 / carré, un ⭐ modèle sans chiffres ni noms ;
 *  2. navigateur (base tests/prendre-depuis-seed.js, listes FABRIQUÉES) : l'onglet renommé « 📊 Partir des données », la tuile de la
 *     galerie, 🌳 Mon arbre comme avant, 🧰 une liste (choix commun, pastilles période / près de la famille ± km par liste / « quand la
 *     famille y vivait » / colonne, X Y couleur ✨), 💬 une question (« J'ai compris »), les dessins conseillés, les cinq exemples de la
 *     maquette, deux séries = deux panneaux, tenu à jour dans l'app / figé quand ça sort, les vivants jamais dans ce qui sort,
 *     plus de 50 000 lignes par morceaux, « 📊 Faire un diagramme » d'une liste, le réglage dans Réglages, la consultation (lecture seule),
 *     390 px en sombre, aucune erreur.
 *   node tests/test-diagrammes-donnees.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {spawnSync} = require('child_process');
const root = path.join(__dirname, '..');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };
const J = v => JSON.parse(JSON.stringify(v));

/* ═════════ 1. Bac à sable ═════════ */
function sandbox(ls = {}) {
    const store = {...ls};
    const sb = {window: {}, console, setTimeout, clearTimeout, Intl, performance, MutationObserver: class { observe() {} }, CSS: {escape: v => v}, document: {documentElement: {}, querySelectorAll: () => [], addEventListener() {}, createElement: () => ({})}, localStorage: {getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }}};
    sb.window.localStorage = sb.localStorage; sb.window.LCNDA_APP = {state: {}};
    vm.createContext(sb);
    for (const f of ['heritage-diagrams-render.js', 'heritage-diagram-genea.js', 'heritage-diagram-chiffres.js', 'heritage-diagram-perso.js', 'heritage-diagram-donnees.js'])
        vm.runInContext(fs.readFileSync(path.join(root, 'assets/js', f), 'utf8'), sb, {filename: f});
    return {sb, ext: sb.window.LCNDA_EXT, store};
}

(async () => {
    await t('les dessins conseillés suivent la source, et leur nombre suit le réglage (5 au départ, 3 à 12, « Tous »)', () => {
        const {ext} = sandbox(), D = ext.diagramData;
        assert.strictEqual(D.suggestN(), 5);
        const time = {time: true, geo: true, month: true, cat: true, cat2: true, num: true, numtime: true}, dates = {time: true, cat: true, numtime: true}, places = {geo: true, cat: true, cat2: true};
        assert.deepStrictEqual(J(D.suggestKinds(time)), ['bars', 'map', 'lines', 'frise', 'multi']);
        assert.ok(D.suggestKinds(places).includes('map') && D.suggestKinds(places)[0] === 'map', 'des lieux → la carte d’abord');
        assert.ok(!D.suggestKinds(dates).includes('map'), 'pas de carte sans positions');
        assert.ok(D.suggestKinds(dates).includes('lines') && D.suggestKinds(dates).includes('frise'));
        assert.strictEqual(D.GALLERY.length, 14);
        for (const [v, n] of [['3', 3], ['7', 7], ['12', 12], ['2', 5], ['13', 5], ['x', 5]]) { const s = sandbox({'genealogie-diagrammes-conseilles': v}).ext.diagramData; assert.strictEqual(s.suggestN(), n, v); assert.ok(s.suggestKinds(time).length <= n); }
        const all = sandbox({'genealogie-diagrammes-conseilles': 'all'}).ext.diagramData; assert.strictEqual(all.suggestN(), 'all');
        assert.ok(all.suggestKinds(time).length > 5);
        assert.match(D.settingHtml(), /Diagrammes : nombre de types conseillés/); assert.match(D.settingHtml(), /<option value="all">Tous<\/option>/);
        assert.strictEqual((D.settingHtml().match(/<option/g) || []).length, 11, '3 à 12, plus « Tous »');
    });
    await t('chaque dessin de la galerie est un type qui existe déjà dans le catalogue (aucun doublon)', () => {
        const {ext} = sandbox(), D = ext.diagramData, K = ext.diagramRender.KINDS;
        for (const g of D.GALLERY) { const k = D.kindOf(g.id, {}); assert.ok(K[k] || ['dotmap', 'network'].includes(k), g.id + ' → ' + k); }
        assert.strictEqual(D.kindOf('bars', {color: 'x'}), 'stacked'); assert.strictEqual(D.kindOf('bars', {}), 'columns');
    });
    await t('les champs proposés : X = la date, Y = le nombre, couleur = le lieu de la famille (ou une colonne à peu de valeurs)', () => {
        const {ext} = sandbox(), D = ext.diagramData;
        const d = {id: 's', label: 'S', period: r => [r.y, r.y], geo: r => [r.lat, r.lon], fields: [{key: 'name', label: 'Nom', type: 'text'}, {key: 'int', label: 'Intensité', type: 'enum'}, {key: 'mag', label: 'Magnitude', type: 'number'}]};
        const rows = [{int: 'IV'}, {int: 'V'}, {int: 'VI'}];
        assert.deepStrictEqual([D.suggestFields(d, {fam: true}, rows).x, D.suggestFields(d, {fam: true}, rows).y, D.suggestFields(d, {fam: true}, rows).color], ['_time', '_count', '_fam']);
        assert.strictEqual(D.suggestFields(d, {fam: false}, rows).color, 'int');
        assert.strictEqual(D.suggestFields(d, {}, rows).size, 'mag'); assert.strictEqual(D.suggestFields(d, {}, rows).label, 'name');
        const p = D.profileOf(d, {fam: true}); assert.ok(p.time && p.geo && p.num && p.cat);
    });
    await t('🖼 format : 16:9, A4, carré (le dessin centré, le fond suit) ; écran = inchangé', () => {
        const {ext} = sandbox(), R = ext.diagramRender, s = {...R.KINDS.columns.sample(), kind: 'columns'};
        const vb = svg => svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/).slice(1).map(Number);
        const [w0, h0] = vb(R.svg(s, 900));
        for (const [f, r] of [['169', 16 / 9], ['a4', 297 / 210], ['carre', 1]]) { const out = R.svg({...s, o: {...s.o, format: f}}, 900), [w, h] = vb(out); assert.ok(Math.abs(w / h - r) < 0.02, `${f} : ${w}×${h}`); assert.match(out, /class="dgd-frame"/); assert.match(out, /<g class="dgd-fmt" transform="translate\(/); assert.ok(w >= w0 && h >= h0); }
        assert.deepStrictEqual(vb(R.svg(s, 900)), [w0, h0]);
    });
    await t('⭐ un modèle : la mise en forme et la recette, jamais un chiffre, un lieu, un nom ni la question', () => {
        const {ext} = sandbox(), D = ext.diagramData;
        const spec = {kind: 'stacked', o: {title: 'Séismes autour de Jean MAZAUD', subtitle: 'Tulle', source: 'Sources : SisFrance', palette: 'terre', colors: ['#0072B2', 'javascript:alert(1)'], format: '169', notes: [{t: 'text', text: 'Jean MAZAUD'}], legend: 'bottom', font: 'Georgia'},
            rows: [{label: '1880', s0: 9, s1: 3}], series: [{name: 'Autour de Tulle'}], places: {tulle: {lat: 45.2, lon: 1.7, n: 'Tulle'}},
            live: {data: {src: 'ask', ask: 'les séismes près de Tulle', list: 'reunie_seismes', from: '1800', to: '1919', fam: true, km: 150, x: '_time', y: '_count', color: '_fam', gal: 'bars', near: {lat: 45.2, lon: 1.7, title: 'Tulle'}, live: true}}};
        const m = D.modelOf(spec, 'Mes séismes'), txt = JSON.stringify(m);
        for (const bad of ['MAZAUD', 'Tulle', 'SisFrance', '"s0"', ':9', ':3,', 'javascript', 'rows', 'series', 'places', 'notes', 'ask']) assert.ok(!txt.includes(bad), `le modèle contient « ${bad} » : ${txt}`);
        assert.deepStrictEqual(J(m.o), {palette: 'terre', colors: ['#0072B2'], font: 'Georgia', legend: 'bottom', format: '169'});
        assert.deepStrictEqual([m.data.src, m.data.list, m.data.km, m.data.color, m.data.from], ['list', 'reunie_seismes', 150, '_fam', '1800']);
        const back = D.applyModel(J(m)); assert.strictEqual(back.kind, 'stacked'); assert.deepStrictEqual(J(back.rows), []); assert.strictEqual(back.live.data.list, 'reunie_seismes');
        assert.throws(() => D.applyModel({kind: 'pie'}), /modèle/);
    });

    /* ═════════ 2. Navigateur ═════════ */
    let start, sleep; try { ({start, sleep} = require('./prendre-depuis-seed.js')); } catch (_) {}
    let B = null;
    if (start) { try { B = await start(); } catch (e) { console.log('— navigateur : ' + String(e.message || e).split('\n')[0] + ' ; partie sautée'); } }
    if (!B) { console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon (sans navigateur).'); process.exit(fails ? 1 : 0); }
    const p = B.page;
    /* des listes FABRIQUÉES, enregistrées avant le chargement de l'app */
    const FAKE = () => {
        const E = window.LCNDA_EXT = window.LCNDA_EXT || {}, L = E.dataLists = E.dataLists || [];
        window.__loads = {}; const ld = (id, rows) => async () => { window.__loads[id] = (window.__loads[id] || 0) + 1; return rows; };
        // 🌋 près de Tulle / Treignac (lieux de la base) et très loin (Nice, Lisbonne)
        const seis = window.__seis = [];
        [[1887, 2, 23, 45.30, 1.80, 'V', 4.1, 'Secousse de Tulle'], [1887, 6, 1, 45.55, 1.80, 'IV', 3.2, 'Treignac'], [1909, 6, 11, 45.40, 1.60, 'VI', 4.9, 'Lambesc ressenti'], [1820, 3, 5, 45.60, 1.70, 'IV', 3.0, 'Chamberet'],
            [1755, 11, 1, 38.7, -9.1, 'X', 8.5, 'Lisbonne'], [1887, 2, 23, 43.7, 7.27, 'IX', 6.3, 'Ligurie']].forEach(([y, m, d, lat, lon, i, mag, name]) => seis.push({name, date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, y, lat, lon, int: i, mag}));
        L.push({id: 'test_seismes', icon: '🌋', label: 'Séismes d’essai', group: 'Le monde', theme: 'seismes', source: 'Jeu d’essai séismes (CC0)', sourceUrl: 'https://example.org/s',
            load: ld('test_seismes', seis), fields: [{key: 'name', label: 'Séisme', type: 'text'}, {key: 'date', label: 'Date', type: 'date'}, {key: 'int', label: 'Intensité', type: 'enum'}, {key: 'mag', label: 'Magnitude', type: 'number'}],
            period: r => [r.y, r.y], geo: r => [r.lat, r.lon]});
        L.push({id: 'test_batailles', icon: '⚔️', label: 'Batailles d’essai', group: 'Le monde', theme: 'guerres', source: 'Jeu d’essai batailles (CC0)',
            load: ld('test_batailles', [[1792, 'Valmy'], [1805, 'Austerlitz'], [1815, 'Waterloo'], [1859, 'Solférino'], [1870, 'Sedan'], [1916, 'Verdun']].map(([y, name]) => ({name, y}))),
            fields: [{key: 'name', label: 'Bataille', type: 'text'}, {key: 'y', label: 'Année', type: 'year'}], period: r => [r.y, r.y]});
        L.push({id: 'test_metiers', icon: '🛠', label: 'Métiers d’essai', group: 'La personne', theme: 'metiers', source: 'Jeu d’essai métiers (CC0)',
            load: ld('test_metiers', [['Cultivateur', 'Tulle'], ['Cultivateur', 'Tulle'], ['Cultivateur', 'Treignac'], ['Tisserand', 'Tulle'], ['Cordonnier', 'Chamberet'], ['Cordonnier', 'Chamberet']].map(([job, town]) => ({job, town}))),
            fields: [{key: 'job', label: 'Métier', type: 'enum'}, {key: 'town', label: 'Commune', type: 'enum'}]});
        L.push({id: 'test_tdf', icon: '🚲', label: 'Étapes du Tour de France (essai)', group: 'Le monde', theme: 'sport', source: 'Jeu d’essai Tour (CC0)',
            load: ld('test_tdf', [[1964, 45.27, 1.77, 'Tulle'], [1983, 45.30, 1.70, 'Tulle'], [2009, 45.55, 1.79, 'Treignac'], [2020, 43.7, 7.27, 'Nice']].map(([y, lat, lon, city]) => ({city, y, lat, lon}))),
            fields: [{key: 'city', label: 'Ville', type: 'place'}, {key: 'y', label: 'Année', type: 'year'}], period: r => [r.y, r.y], geo: r => [r.lat, r.lon]});
        L.push({id: 'test_pain', icon: '🥖', label: 'Prix du pain (essai)', group: 'Le monde', theme: 'prix', source: 'Jeu d’essai pain (CC0)',
            load: ld('test_pain', Array.from({length: 120}, (_, i) => ({y: 1760 + i, price: 2 + Math.sin(i / 7) + (i === 29 ? 3 : 0)}))),
            fields: [{key: 'y', label: 'Année', type: 'year'}, {key: 'price', label: 'Prix du pain', type: 'number', unit: 'sous'}], period: r => [r.y, r.y]});
        L.push({id: 'test_gros', icon: '🧮', label: 'Grosse liste (essai)', group: 'Le monde', theme: 'evenements', source: 'Jeu d’essai gros (CC0)',
            load: ld('test_gros', Array.from({length: 60000}, (_, i) => ({n: 'L' + i, y: 1700 + (i % 200), k: ['a', 'b', 'c'][i % 3], lat: 45 + (i % 50) / 100, lon: 1.5 + (i % 30) / 100}))),
            fields: [{key: 'n', label: 'Nom', type: 'text'}, {key: 'k', label: 'Sorte', type: 'enum'}], period: r => [r.y, r.y], geo: r => [r.lat, r.lon]});
    };
    const E = (fn, a) => p.evaluate(fn, a);
    const D = 'dialog[open].h-dg-dlg';
    const closeAll = () => E(() => document.querySelectorAll('dialog[open]').forEach(d => { d.dataset.ownClose = ''; try { d.close(); } catch (_) {} d.remove?.(); }));
    const openData = async (start = {src: 'list', list: 'test_seismes'}, kind = 'stacked') => {
        await closeAll(); await E(([s, k]) => { window.LCNDA_EXT.openDiagramEditor(null, {kind: k, data: s}); }, [start, kind]);
        await p.waitForSelector(`${D} [data-dgd]`, {timeout: 20000});
    };
    const waitSpec = (pred, a) => p.waitForFunction(([src, a]) => { const f = new Function('s', 'a', 'return (' + src + ')(s, a)'); const pv = document.querySelector('dialog[open].h-dg-dlg [data-dg-preview] svg'); return pv && f(window.__lastSpec, a); }, [String(pred), a], {timeout: 20000});
    try {
        await B.ctx.addInitScript(FAKE);
        await p.reload(); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.diagramData && window.LCNDA_EXT?.dataListsEngine && window.LCNDA_EXT?.openDiagramEditor && window.LCNDA_EXT?.dataListPicker, null, {timeout: 60000});
        // le dernier diagramme donné à l'éditeur (pour lire ses chiffres)
        await E(() => { const D0 = window.LCNDA_EXT.diagramData; const m = D0.mount; D0.mount = (pane, api) => { const set = api.setSpec; api.setSpec = s => { window.__lastSpec = JSON.parse(JSON.stringify(s)); set(s); }; return m(pane, api); }; });

        await t('rien n’est lu au démarrage (les données ne se chargent que quand on les choisit)', async () => {
            assert.deepStrictEqual(await E(() => window.__loads), {});
        });
        await t('l’onglet s’appelle « 📊 Partir des données » ; la galerie « Nouveau » a la tuile qui ouvre le même écran', async () => {
            await closeAll(); await E(() => { window.LCNDA_EXT.openDiagramEditor(null); });
            await p.waitForSelector('dialog[open].h-dg-gallery [data-dg-fromdata]', {timeout: 40000});
            assert.match(await p.textContent('dialog[open].h-dg-gallery [data-dg-fromdata]'), /Partir des données/);
            await p.click('dialog[open].h-dg-gallery [data-dg-fromdata]');
            await p.waitForSelector(`${D} [data-dgd]`);
            assert.match(await p.textContent(`${D} [data-dg-tab="app"]`), /📊 Partir des données/);
            assert.ok(await p.$eval(`${D} [data-dg-tab="app"]`, b => b.classList.contains('is-active')), 'l’écran s’ouvre sur cet onglet');
            assert.strictEqual(await p.$eval(`${D} [data-dgd-src="list"]`, b => b.getAttribute('aria-pressed')), 'true');
            assert.ok(await p.$(`${D} [data-dgd-picker] [data-ld-ov-q]`), 'le choix commun des listes');
            assert.strictEqual(await E(() => window.__loads.test_seismes || 0), 0, 'pas encore lue');
            await p.fill(`${D} [data-dgd-picker] [data-ld-ov-q]`, 'seismes d essai'); await sleep(250);
            await p.click(`${D} [data-dgd-picker] [data-ld-pick="test_seismes"]`);
            await waitSpec(s => s && s.rows && s.rows.length > 0);
            assert.ok(await E(() => window.__loads.test_seismes) >= 1);
        });
        await t('🌳 Mon arbre : exactement ce qu’il y avait (Graphique, 🧮 Compter dans ma base, Tenir à jour)', async () => {
            await closeAll(); await E(() => { window.LCNDA_EXT.openDiagramEditor(null, {kind: 'stacked'}); }); await p.waitForSelector(`${D} [data-dg-tab="app"]`);
            await p.click(`${D} [data-dg-tab="app"]`); await p.waitForSelector(`${D} [data-dgd]`);
            assert.strictEqual(await p.$eval(`${D} [data-dgd-src="tree"]`, b => b.getAttribute('aria-pressed')), 'true', '🌳 au départ');
            assert.ok(await p.$eval(`${D} [data-dgd-tree]`, x => !x.hidden));
            await p.waitForSelector(`${D} [data-dgd-tree] [data-dg-src]`);
            await p.waitForFunction(() => [...document.querySelectorAll('dialog[open] [data-dgd-tree] [data-dg-src] option')].some(o => /^q:/.test(o.value)), null, {timeout: 15000});
            assert.ok(await p.$(`${D} [data-dgd-tree] [data-dg-srcgo]`), '« Prendre ces chiffres »');
            await p.click(`${D} [data-dgd-src="list"]`); assert.ok(await p.$eval(`${D} [data-dgd-tree]`, x => x.hidden));
            await p.click(`${D} [data-dgd-src="tree"]`); assert.ok(await p.$eval(`${D} [data-dgd-tree]`, x => !x.hidden));
        });
        await t('🧰 une liste : pastilles (période, près de la famille 150 km pour des séismes, « quand la famille y vivait », une colonne) ; X Y couleur ✨', async () => {
            await openData();
            await waitSpec(s => s && s.rows && s.rows.length);
            const chips = await p.$$eval(`${D} [data-dgd-chips] .ui-listbar-chip`, a => a.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
            assert.ok(chips.some(c => /Près de la famille · −\s?150 km/.test(c)), chips.join(' | '));
            assert.deepStrictEqual(await p.$$eval(`${D} [data-dgd-map]`, a => a.slice(0, 3).map(s => s.value)), ['_time', '_count', '_fam']);
            assert.ok((await p.$$eval(`${D} .dgd-sug`, a => a.length)) >= 3, '✨ proposé');
            const tot = s => s.rows.reduce((a, r) => a + Object.keys(r).filter(k => /^s\d+$/.test(k)).reduce((b, k) => b + r[k], 0), 0);
            let spec = await E(() => window.__lastSpec); assert.strictEqual(tot(spec), 4, 'les 4 séismes près des lieux de la famille (pas Lisbonne ni la Ligurie)');
            assert.ok(spec.series.some(x => /Autour de (Tulle|Treignac|Chamberet)/.test(x.name)), JSON.stringify(spec.series));
            assert.strictEqual(spec.kind, 'stacked'); assert.ok(spec.live?.data?.list === 'test_seismes', 'tenu à jour');
            assert.match(spec.o.source, /Jeu d’essai séismes \(CC0\).*Ta généalogie \(privée\)/);
            assert.match(await p.textContent(`${D} [data-dgd-srcline]`), /Jeu d’essai séismes/); assert.ok(await p.$(`${D} [data-dgd-srcline] [data-dgd-openlist="test_seismes"]`), '↗ la liste d’origine');
            // période
            await p.fill(`${D} [data-dgd-f="from"]`, '1880'); await p.dispatchEvent(`${D} [data-dgd-f="from"]`, 'change');
            await waitSpec(s => s.live.data.from === '1880'); spec = await E(() => window.__lastSpec); assert.strictEqual(tot(spec), 3);
            // le rayon : − → 100 km, retenu pour cette liste
            await p.click(`${D} [data-dgd-kmfor="fam"] [data-dgd-km="-1"]`); await waitSpec(s => s.live.data.km === 100);
            assert.strictEqual(await E(() => JSON.parse(localStorage.getItem('genealogie-diagrammes-km')).test_seismes), 100);
            await p.click(`${D} [data-dgd-kmfor="fam"] [data-dgd-km="1"]`); await waitSpec(s => s.live.data.km === 150);
            // sans « près de la famille » : tous (depuis 1880 : 4 avec la Ligurie)
            await p.click(`${D} [data-dgd-x="fam"]`); await waitSpec(s => !s.live.data.fam); spec = await E(() => window.__lastSpec); assert.strictEqual(tot(spec), 4);
            await p.click(`${D} [data-dgd-on="fam"]`); await waitSpec(s => s.live.data.fam);
            // une colonne : Intensité = V
            await p.click(`${D} [data-dgd-addfilter]`); await p.waitForSelector(`${D} [data-dgd-fval] option`, {state: 'attached'});
            await p.selectOption(`${D} [data-dgd-fkey]`, 'int'); await sleep(300); await p.selectOption(`${D} [data-dgd-fval]`, 'V'); await p.click(`${D} [data-dgd-addok]`);
            await waitSpec(s => (s.live.data.filt || []).length === 1); spec = await E(() => window.__lastSpec); assert.strictEqual(tot(spec), 1);
            await p.click(`${D} [data-dgd-x="f:int"]`); await waitSpec(s => !(s.live.data.filt || []).length);
            // « quand la famille y vivait »
            await p.click(`${D} [data-dgd-on="famOnly"]`); await waitSpec(s => s.live.data.famOnly);
            // la couleur : Intensité
            await p.selectOption(`${D} [data-dgd-map="color"]`, 'int'); await waitSpec(s => s.live.data.color === 'int');
            spec = await E(() => window.__lastSpec); assert.ok(spec.series.every(x => /^(IV|V|VI)$/.test(x.name)), JSON.stringify(spec.series));
        });
        await t('le rayon par défaut dépend de la liste : 150 km (séismes), 15 km (Tour de France)', async () => {
            assert.deepStrictEqual(await E(() => { localStorage.removeItem('genealogie-diagrammes-km'); const D0 = window.LCNDA_EXT.diagramData, L = window.LCNDA_EXT.dataListsEngine.list(); return ['test_seismes', 'test_tdf', 'test_batailles'].map(id => D0.kmFor(L.find(d => d.id === id))); }), [150, 15, 150]);
        });
        await t('« Le bon dessin » : 5 conseillés au départ, « Tous » à un clic ; le réglage change le nombre (3, « Tous »)', async () => {
            await E(() => localStorage.removeItem('genealogie-diagrammes-conseilles'));
            await openData(); await waitSpec(s => s && s.rows);
            assert.strictEqual(await p.$$eval(`${D} [data-dgd-gal] .dgd-gt`, a => a.length), 5);
            await p.click(`${D} [data-dgd-galall="1"]`); assert.strictEqual(await p.$$eval(`${D} [data-dgd-gal] .dgd-gt`, a => a.length), 14);
            await E(() => localStorage.setItem('genealogie-diagrammes-conseilles', '3')); await openData(); await waitSpec(s => s && s.rows);
            assert.strictEqual(await p.$$eval(`${D} [data-dgd-gal] .dgd-gt`, a => a.length), 3);
            await E(() => localStorage.setItem('genealogie-diagrammes-conseilles', 'all')); await openData(); await waitSpec(s => s && s.rows);
            assert.strictEqual(await p.$$eval(`${D} [data-dgd-gal] .dgd-gt`, a => a.length), 14); assert.ok(!(await p.$(`${D} [data-dgd-galall]`)), 'pas d’étape « conseillés »');
            await E(() => localStorage.removeItem('genealogie-diagrammes-conseilles'));
            // un clic : le dessin change, les champs suivent
            await openData(); await waitSpec(s => s && s.rows);
            await p.click(`${D} [data-dgd-gal="lines"]`); await waitSpec(s => s.kind === 'line');
            await p.click(`${D} [data-dgd-gal="frise"]`); await waitSpec(s => s.kind === 'chrono' && s.rows.length === 4);
        });
        await t('le réglage est dans Réglages, près des autres réglages des diagrammes', async () => {
            await closeAll(); let found = false;
            assert.ok(await E(() => typeof window.LCNDA_EXT.maintenance?.diagram_kinds === 'function'), 'Réglages → les types de diagrammes');
            await B.go('graphiques'); await E(() => window.LCNDA_EXT.openDiagramKindsEditor()); // ce que fait Réglages → « Types de diagrammes »
            try { await p.waitForSelector('dialog[open] [data-dgd-conseilles]', {timeout: 10000}); found = true; } catch (_) {}
            assert.ok(found, 'le réglage n’est pas trouvé');
            assert.match(await p.$eval('[data-dgd-conseilles]', s => s.closest('label').textContent), /Diagrammes : nombre de types conseillés/);
            assert.match(await p.$eval('[data-dgd-conseilles]', s => (s.closest('dialog, section').querySelector('h2, h3')?.textContent || '')), /types|Diagrammes/, 'avec le rangement des types de diagrammes');
            await p.selectOption('[data-dgd-conseilles]', '7'); await sleep(200);
            assert.strictEqual(await E(() => localStorage.getItem('genealogie-diagrammes-conseilles')), '7');
            assert.strictEqual(await E(() => window.LCNDA_EXT.diagramData.suggestN()), 7);
            await p.selectOption('[data-dgd-conseilles]', 'all'); await sleep(100); assert.strictEqual(await E(() => window.LCNDA_EXT.diagramData.suggestN()), 'all');
            await E(() => localStorage.removeItem('genealogie-diagrammes-conseilles')); await closeAll();
        });
        await t('💬 une question → « J’ai compris » (quoi, où, quand) → la liste, ses filtres, le dessin', async () => {
            await E(() => { const E0 = window.LCNDA_EXT; window.__ask = E0.dataAsk; E0.dataAsk = async q => ({u: {years: [1700, 1899], where: 'family', km: 150, themes: [{id: 'seismes'}]}, d: E0.dataListsEngine.list().find(d => d.id === 'test_seismes'), q}); });
            await openData({src: 'ask'});
            await p.fill(`${D} [data-dgd-ask]`, 'les séismes près de chez nous 1700–1899'); await p.click(`${D} [data-dgd-askgo]`);
            await p.waitForSelector(`${D} .dgd-understood`);
            const chips = await p.$$eval(`${D} .dgd-understood .ui-listbar-chip`, a => a.map(x => x.textContent));
            assert.ok(chips.length === 3 && /Quoi/.test(chips[0]) && /Séismes d’essai/.test(chips[0]) && /150 km/.test(chips[1]) && /1700–1899/.test(chips[2]), chips.join(' | '));
            await waitSpec(s => s.live?.data?.list === 'test_seismes' && s.live.data.to === '1899');
            await E(() => { window.LCNDA_EXT.dataAsk = window.__ask; });
        });
        await t('les cinq exemples de la maquette se dessinent (séismes, batailles, métiers → communes, Tour de France, pain et naissances)', async () => {
            const r = await E(async () => {
                const D0 = window.LCNDA_EXT.diagramData, R = window.LCNDA_EXT.diagramRender, out = {};
                const run = async (cfg, o = {}) => { const res = await D0.compute({src: 'list', live: true, ...cfg}, {o}); const svg = R.svg(res.spec, 900); return {kind: res.spec.kind, n: res.n, rows: (res.spec.rows || []).length, ev: (res.spec.events || []).length, places: Object.keys(res.spec.places || {}).length, series: (res.spec.series || []).map(s => s.name), o: res.spec.o, bad: /Dessin impossible|NaN|Infinity/.test(svg) && !/dotmap/.test(res.spec.kind), svgLen: svg.length}; };
                out.seis = await run({list: 'test_seismes', fam: true, km: 150, from: '1800', to: '1919', gal: 'bars'}, {notes: [{t: 'text', text: '1887 · Ligurie', x: .5, y: .2}]});
                out.bat = await run({list: 'test_batailles', gal: 'life'});
                out.met = await run({list: 'test_metiers', gal: 'sankey', x: 'job', color: 'town'});
                out.tdfMap = await run({list: 'test_tdf', fam: true, km: 15, gal: 'map'});
                out.tdfFrise = await run({list: 'test_tdf', fam: true, km: 15, gal: 'frise'});
                out.pain = await run({list: 'test_pain', x: '_time', y: 'avg:price', gal: 'lines', two: {src: 'births'}, bin: 10});
                return out;
            });
            assert.ok(Object.values(r).every(x => !x.bad && x.svgLen > 300), JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.bad]))));
            assert.strictEqual(r.seis.kind, 'stacked'); assert.strictEqual(r.seis.n, 4);
            assert.strictEqual(r.bat.kind, 'timeline'); assert.ok(r.bat.rows >= 1 && r.bat.ev >= 1, JSON.stringify(r.bat));
            assert.strictEqual(r.met.kind, 'sankey'); assert.ok(r.met.rows >= 3);
            assert.strictEqual(r.tdfMap.kind, 'dotmap'); assert.strictEqual(r.tdfMap.places, 3, 'Nice est à plus de 15 km'); assert.strictEqual(r.tdfFrise.kind, 'chrono'); assert.strictEqual(r.tdfFrise.rows, 3);
            assert.strictEqual(r.pain.kind, 'smallmult', 'deux séries : deux panneaux');
            assert.strictEqual(r.pain.o.sameScale, false); assert.strictEqual(r.pain.o.cols, 1); assert.strictEqual(r.pain.series.length, 2); assert.match(r.pain.series[1], /Naissances/);
        });
        await t('deux séries : deux panneaux par défaut ; le deuxième axe à droite dans ⚙️ Personnaliser', async () => {
            await openData({src: 'list', list: 'test_pain'}); await waitSpec(s => s && s.rows && s.rows.length);
            await p.selectOption(`${D} [data-dgd-two]`, 'births'); await waitSpec(s => s.kind === 'smallmult' && s.series.length === 2);
            await p.click(`${D} [data-dg-tab="perso"]`); await p.waitForSelector(`${D} [data-dgp-xsec="dgd-format"]`);
            await p.$eval(`${D} [data-dgp-xsec="dgd-format"]`, d => { d.open = true; });
            await p.click(`${D} [data-dgd-two="axis"]`); await sleep(300);
            await p.waitForSelector(`${D} [data-dgd-two="axis"][aria-pressed="true"]`);
            // format 16:9
            await p.click(`${D} [data-dgd-format="169"]`); await sleep(400);
            const vb = await p.$eval(`${D} [data-dg-preview] svg`, s => s.getAttribute('viewBox').split(' ').map(Number));
            assert.ok(Math.abs(vb[2] / vb[3] - 16 / 9) < 0.02, vb.join(' '));
        });
        await t('📝 une note posée d’un clic sur une colonne ; ⭐ enregistrer comme modèle (sans chiffres ni noms), le partager', async () => {
            await openData(); await waitSpec(s => s && s.rows && s.rows.length);
            await p.click(`${D} [data-dg-tab="perso"]`); await p.waitForSelector(`${D} [data-dgp-xsec="dgd-format"]`); await p.$eval(`${D} [data-dgp-xsec="dgd-format"]`, d => { d.open = true; });
            await p.click(`${D} [data-dgd-note]`);
            const box = await p.$eval(`${D} [data-dg-preview] svg`, s => { const b = s.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; });
            await p.mouse.click(box[0], box[1]); await sleep(400);
            assert.ok(await p.$(`${D} [data-dg-preview] svg .dg-note`), 'la note est sur le dessin');
            await p.click(`${D} [data-dgd-model]`); await p.waitForSelector('dialog[open] [data-dgd-modelname]');
            await p.fill('dialog[open] [data-dgd-modelname]', 'Mes séismes'); await p.locator('dialog[open]:has([data-dgd-modelname]) button', {hasText: 'Enregistrer'}).last().click(); await sleep(300);
            const m = await E(() => JSON.parse(localStorage.getItem('genealogie-diagrammes-modeles'))[0]);
            assert.strictEqual(m.name, 'Mes séismes'); const txt = JSON.stringify(m);
            for (const bad of ['Tulle', 'Treignac', 'Autour', 'Lambesc', 'rows', 'notes', 'Jeu d']) assert.ok(!txt.includes(bad), bad + ' : ' + txt);
            assert.strictEqual(m.data.list, 'test_seismes');
            // ⭐ Mes modèles : réappliqué, il se remplit avec les données d'ici
            await openData({src: 'list'}); await p.waitForSelector(`${D} [data-dgd-usemodel="0"]`, {state: 'attached'});
            await p.$eval(`${D} .dgd-models`, d => { d.open = true; }); await p.click(`${D} [data-dgd-usemodel="0"]`);
            await waitSpec(s => s.live?.data?.list === 'test_seismes' && s.rows.length > 0);
        });
        await t('tenu à jour dans l’app ; figé (et daté) quand il sort : fichier, export, envoi', async () => {
            await openData(); await waitSpec(s => s && s.rows && s.rows.length);
            await p.click(`${D} [data-dg-save]`); await p.waitForFunction(() => !document.querySelector('dialog[open].h-dg-dlg'), null, {timeout: 15000});
            const r = await E(async () => {
                const X = window.LCNDA_EXT, list = await (await fetch('api.php?action=diagrams', {credentials: 'same-origin'})).json(), d = (list.diagrams || []).slice(-1)[0];
                const D0 = X.diagramData, spec = {...d.spec, kind: d.kind}, tot = s => s.rows.reduce((a, r) => a + Object.keys(r).filter(k => /^s\d+$/.test(k)).reduce((b, k) => b + r[k], 0), 0);
                const before = tot(await D0.resolve(spec));
                window.__seis.push({name: 'Nouveau séisme', date: '1900-01-01', y: 1900, lat: 45.3, lon: 1.78, int: 'V', mag: 3}); X.dataListsEngine.forget('test_seismes');
                D0.forget(); // la minute de mémoire passée
                const after = tot(await D0.resolve(spec)), fz = await D0.frozen(spec);
                return {id: d.id, live: !!d.spec.live?.data, before, after, frozenLive: !!fz.live, frozenSrc: fz.o.source, frozenRecipe: !!fz.dataRecipe};
            });
            assert.ok(r.live, 'enregistré tenu à jour'); assert.strictEqual(r.after, r.before + 1, 'suit la nouvelle donnée');
            assert.ok(!r.frozenLive && !r.frozenRecipe, 'figé : sans la recette'); assert.match(r.frozenSrc, /chiffres du \d{2}\/\d{2}\/\d{4}/);
            // posé ailleurs (bloc Diagramme) : sources et ↗ dessous
            await E(id => { const box = document.createElement('div'); box.id = 'dgd-test-embed'; box.innerHTML = window.LCNDA_EXT.diagramEmbedHtml(id); document.body.appendChild(box); }, r.id);
            await p.waitForSelector('#dgd-test-embed .dgd-src-line [data-dgd-openlist="test_seismes"]', {timeout: 15000});
            await E(() => document.getElementById('dgd-test-embed').remove());
        });
        await t('vie privée : une personne vivante (et son lieu) n’est jamais dans ce qui sort ; l’aperçu de l’app la montre', async () => {
            const db = (function find(dir) { for (const f of fs.readdirSync(dir)) { const q = path.join(dir, f); if (fs.statSync(q).isDirectory()) { const r = find(q); if (r) return r; } else if (f === 'genealogy.sqlite') return q; } return null; })(B.tmp);
            assert.ok(db, 'base introuvable');
            const php = spawnSync('php', ['-r', `$p=new PDO('sqlite:${db}');$p->exec("INSERT INTO places(id,name,county,country,latitude,longitude) VALUES(900,'Lieu-des-Vivants','Gers','France',43.70,7.25)");$p->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status) VALUES(9000,'Zoé','VIVANTE','female','living')");$t=(int)$p->query("SELECT id FROM event_types WHERE gedcom_tag='BIRT'")->fetchColumn();$p->exec("INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES('person',9000,$t,'1990',1990,900)");echo 'ok';`], {encoding: 'utf8'});
            assert.match(php.stdout, /ok/, php.stderr);
            const r = await E(async () => {
                const X = window.LCNDA_EXT, a = await window.LCNDA_APP.api('ld_famille'), b = await window.LCNDA_APP.api('ld_famille', {share: 1});
                X.listesFamille.reset();
                const cfg = {src: 'list', list: 'test_seismes', fam: true, km: 30, color: '_fam', gal: 'bars', live: true};
                const inApp = await X.diagramData.compute(cfg, {}), out = await X.diagramData.compute(cfg, {}, {share: true});
                return {all: JSON.stringify(a).includes('VIVANTE'), allPlace: JSON.stringify(a.places).includes('Lieu-des-Vivants'), share: JSON.stringify(b).includes('VIVANTE'), sharePlace: JSON.stringify(b.places).includes('Lieu-des-Vivants'),
                    inApp: inApp.spec.series.map(s => s.name), out: out.spec.series.map(s => s.name), outSrc: out.spec.o.source};
            });
            assert.ok(r.all && r.allPlace, 'dans l’app, la personne vivante compte');
            assert.ok(!r.share && !r.sharePlace, 'ce qui sort : ni la personne vivante ni son lieu');
            assert.ok(r.inApp.some(n => /Lieu-des-Vivants/.test(n)), r.inApp.join(','));
            assert.ok(!r.out.some(n => /Lieu-des-Vivants/.test(n)), r.out.join(','));
            assert.match(r.outSrc, /chiffres du/);
        });
        await t('plus de 50 000 lignes : calculé par morceaux, la page répond', async () => {
            const r = await E(async () => { let ticks = 0; const iv = setInterval(() => ticks++, 5); const t0 = performance.now(); const res = await window.LCNDA_EXT.diagramData.compute({src: 'list', list: 'test_gros', x: '_time', color: 'k', gal: 'bars', live: true}, {}); clearInterval(iv); return {n: res.n, ms: performance.now() - t0, ticks, kind: res.spec.kind, rows: res.spec.rows.length}; });
            assert.strictEqual(r.n, 60000); assert.strictEqual(r.kind, 'stacked'); assert.ok(r.rows >= 10);
            assert.ok(r.ticks >= 1, 'la page a respiré pendant le calcul'); assert.ok(r.ms < 15000, r.ms + ' ms');
        });
        await t('Listes → une liste de données : « 📊 Faire un diagramme » ouvre le même écran, la liste choisie', async () => {
            await closeAll(); await E(() => window.LCNDA_EXT.dataListsEngine.open('test_seismes'));
            await p.waitForSelector('#workspace [data-dgd-fromlist]', {timeout: 20000});
            await p.click('#workspace [data-dgd-fromlist]'); await p.waitForSelector(`${D} [data-dgd]`);
            assert.strictEqual(await p.$eval(`${D} [data-dgd-src="list"]`, b => b.getAttribute('aria-pressed')), 'true');
            assert.match(await p.textContent(`${D} .dgd-chosen`), /Séismes d’essai/);
            await waitSpec(s => s?.live?.data?.list === 'test_seismes');
        });
        await t('390 px en sombre : rien ne déborde, rien n’est collé aux bords', async () => {
            await p.setViewportSize({width: 390, height: 844}); await E(() => { document.documentElement.dataset.theme = 'dark'; });
            await openData(); await waitSpec(s => s && s.rows && s.rows.length);
            const r = await E(() => {
                const vw = document.documentElement.clientWidth, bad = [];
                document.querySelectorAll('dialog[open] .dgd, dialog[open] .dgd *').forEach(el => { const b = el.getBoundingClientRect(); if (!b.width || el.closest('.ldt-pick-themes, [hidden], details:not([open]) > :not(summary)')) return; if (b.right > vw + 0.5 || b.left < -0.5) bad.push((el.className || el.tagName) + ' ' + Math.round(b.left) + '→' + Math.round(b.right)); });
                const step = document.querySelector('dialog[open] .dgd-step').getBoundingClientRect(), gt = document.querySelector('dialog[open] .dgd-gt');
                return {page: document.documentElement.scrollWidth - vw, bad: bad.slice(0, 6), left: step.left, right: vw - step.right, bg: getComputedStyle(gt).backgroundColor};
            });
            assert.ok(r.page <= 0, 'la page ne défile pas de côté : ' + r.page); assert.deepStrictEqual(r.bad, []);
            assert.ok(r.left >= 8 && r.right >= 8, `marges ${r.left} / ${r.right}`);
            assert.ok(!/rgb\(255, 255, 255\)/.test(r.bg), 'sombre : pas de carte blanche ' + r.bg);
            await p.setViewportSize({width: 1440, height: 900}); await E(() => { delete document.documentElement.dataset.theme; });
        });
        await t('mode consultation : lecture seule (pas de réglage, pas d’export, pas d’envoi) ; rien n’est téléchargé', async () => {
            await E(() => document.body.classList.add('is-kiosk'));
            await openData();
            assert.ok(await p.$(`${D} .dgd-ro`), 'lecture seule');
            assert.ok(!(await p.$(`${D} [data-dgd-send]`)) && !(await p.$(`${D} [data-dgd-poser]`)) && !(await p.$(`${D} [data-dgd-chips]`)));
            const r = await E(async () => { let installs = 0; const L = window.LCNDA_EXT.dataListsEngine.list(); L.forEach(d => { if (d.install) { const o = d.install; d.install = (...a) => { installs++; return o(...a); }; } }); await window.LCNDA_EXT.diagramData.resolve({kind: 'columns', o: {}, live: {data: {src: 'list', list: 'test_seismes', fam: true, km: 150, live: true}}}); return installs; });
            assert.strictEqual(r, 0);
            await E(() => document.body.classList.remove('is-kiosk')); await closeAll();
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(B.errs, []); });
    } finally { await B.stop(); }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
