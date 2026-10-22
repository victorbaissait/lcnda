'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 📊 Diagrammes « Généalogie » et « Frises » (assets/js/heritage-diagram-genea.js, lib/diagram_genea.php) :
 *     node tests/test-diagram-genea.js
 * 1. Sans navigateur (heritage-diagrams-render.js + heritage-diagram-genea.js dans un bac à sable) : les 8 sortes
 *    (éventail, soleil, réseau, arcs, Venn 2 à 4, calendrier, rose des mois, spirale) se dessinent avec leur exemple,
 *    les dates C4 sont comprises (« 7 mai 1925 », « 08/12/1960 », « 12 thermidor an II »…), le Venn à 4 ensembles a ses
 *    15 zones, l'ancien Venn (3 ensembles) se dessine encore ; données énormes : dessin rapide et borné ; données
 *    piégées : textes échappés, couleurs refusées, boucles sans fin évitées.
 * 2. Navigateur (si Playwright et PHP sont là ; sinon partie sautée), sur un vrai « php -S » avec une petite généalogie
 *    (tests/fixtures/diagram-genea-seed.php) : la galerie range les sortes (Généalogie, Frises), chaque sorte se remplit
 *    « Depuis l'app », un CSV et un tableau collé entrent, les réglages changent le dessin, l'export SVG et CSV,
 *    l'enregistrement et la pose dans une case (comme une Fiche), le réseau qu'on glisse et qu'on zoome, le mode sombre,
 *    390 px de large sans débordement, aucun nom piégé exécuté, aucune erreur JavaScript.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const vm = require('node:vm');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
let failed = 0;
const steps = [];
const step = (name, fn) => steps.push([name, fn]);
const NEW = ['fan', 'sunburst', 'network', 'arcs', 'venn', 'calendar', 'monthrose', 'spiral'];

/* ── 1. Bac à sable ── */
const sandbox = { window: {}, console, setTimeout, clearTimeout, performance, Intl, MutationObserver: class { observe() {} }, document: { documentElement: {}, querySelectorAll: () => [] } };
sandbox.window.LCNDA_APP = { state: {} };
vm.createContext(sandbox);
for (const f of ['heritage-diagrams-render.js', 'heritage-diagram-genea.js']) vm.runInContext(fs.readFileSync(path.join(appRoot, 'assets/js', f), 'utf8'), sandbox, { filename: f });
const ext = sandbox.window.LCNDA_EXT, R = ext.diagramRender, G = ext.diagramGenea;
const N = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const draw = spec => R.svg(JSON.parse(JSON.stringify(spec)));

step('les 8 sortes sont rangées (Généalogie, Frises) avec une icône, un nom, un exemple', () => {
    for (const k of NEW) {
        const K = R.KINDS[k];
        assert.ok(K, k); assert.ok(K.icon && K.label && typeof K.render === 'function' && typeof K.sample === 'function', k);
        assert.equal(K.group, ['calendar', 'monthrose', 'spiral'].includes(k) ? 'Frises' : 'Généalogie', k);
        assert.ok(K.grids.length && K.fromApp && typeof K.fromApp.html === 'function' && typeof K.fromApp.bind === 'function', k + ' : données de l’app');
        const svg = draw({ kind: k, ...K.sample() });
        assert.match(svg, /^<svg[^>]+viewBox="0 0 900 \d+/, k); assert.doesNotMatch(svg, /Dessin impossible/, k);
        assert.ok(svg.length > 1500, k + ' : un vrai dessin');
    }
    assert.match(R.KINDS.venn.label, /2 à 4/);
});
step('SVG valide en XML (fichier .svg exporté, image PNG) : chaque attribut a une valeur', () => {
    // <rect … data-gn-bg/> passait dans la page (HTML) mais rendait le fichier SVG du réseau illisible
    for (const k of NEW) {
        const svg = draw({ kind: k, ...R.KINDS[k].sample() });
        for (const [, name, attrs] of svg.matchAll(/<([a-zA-Z][\w:-]*)((?:\s+[^\s=>\/]+(?:="[^"]*")?)*)\s*\/?>/g)) {
            const bare = attrs.replace(/\s+[^\s=>\/]+="[^"]*"/g, '').trim();
            assert.equal(bare, '', `${k} : <${name}> a un attribut sans valeur (${bare})`);
        }
    }
});
step('dates C4 comprises (jour, mois, année ; républicain ; sans année)', () => {
    const d = s => { const r = G.parseDay(s); return r ? [r.y ?? null, r.m ?? null, r.d ?? null] : null; };
    assert.deepEqual(d('7 mai 1925'), [1925, 5, 7]);
    assert.deepEqual(d('08/12/1960'), [1960, 12, 8]);
    assert.deepEqual(d('le 1er janvier 1900'), [1900, 1, 1]);
    assert.deepEqual(d('1925-05-07'), [1925, 5, 7]);
    assert.deepEqual(d('1925-05-00'), [1925, 5, null]);
    assert.deepEqual(d('12 thermidor an II'), [1794, 7, 30]);
    assert.deepEqual(d('an II'), [1793, null, null]);
    assert.deepEqual(d('vers 1784'), [1784, null, null]);
    assert.deepEqual(d('29 février 1900'), [1900, 2, null], 'pas de 29 février en 1900');
    assert.deepEqual(d('29/02/1600'), [1600, 2, 29]);
    assert.deepEqual(d('7 mai'), [null, 5, 7]);
    assert.deepEqual(d('3 7bre 1750'), [1750, 9, 3]);
    assert.equal(d('n’importe quoi'), null); assert.equal(d(''), null); assert.equal(d('x'.repeat(500)), null);
});
step('Venn : 2, 3 ou 4 ensembles, toutes les zones placées ; l’ancien Venn se dessine encore', () => {
    for (const [n, z] of [[2, 3], [3, 7], [4, 15]]) { assert.equal(G.ZONES(n).length, z); assert.deepEqual(Object.keys(G.vennLayout(n).at).sort(), [...G.ZONES(n)].sort(), `${n} ensembles`); }
    const fixed = R.KINDS.venn.grids[1].fixed; assert.equal(typeof fixed, 'function');
    assert.equal(fixed({ sets: [{}, {}] }).length, 3); assert.equal(fixed({ sets: [{}, {}, {}, {}, {}] }).length, 15);
    const old = draw({ kind: 'venn', sets: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], rows: [['A', '120'], ['B', '85'], ['C', '30'], ['AB', '40'], ['AC', '12'], ['BC', '9'], ['ABC', '5']].map(([region, value]) => ({ region, value })) });
    for (const v of ['120', '85', '30', '40', '12', '9', '>5<']) assert.ok(old.includes(v), v);
    const four = draw({ kind: 'venn', ...R.KINDS.venn.sample() });
    assert.equal((four.match(/<ellipse /g) || []).length, 4);
});
step('éventail : n° Sosa à la bonne place, couleurs par catégorie ou dégradé, formes', () => {
    const s = { kind: 'fan', o: { gens: 3, shape: 'full' }, rows: [{ sosa: 1, name: 'Moi', value: '10' }, { sosa: 2, name: 'Père', value: '0' }, { sosa: 3, name: 'Mère', value: '100' }, { sosa: 7, name: 'Grand-mère', value: '50' }] };
    const svg = draw(s);
    assert.match(svg, /<circle[^>]+r="/); assert.match(svg, /Sosa 7 · Grand-mère · 50/);
    assert.equal((svg.match(/<path /g) || []).length, 2 + 4, '2 + 4 cases autour du centre');
    assert.match(svg, /fill="#b3261e"/, 'la plus grande valeur prend la couleur « grands chiffres »');
    const half = draw({ ...s, o: { gens: 10, shape: 'half' } });
    assert.equal((half.match(/<path /g) || []).length, 1 + 1022, 'demi-cercle de 10 générations : 1022 cases + le centre');
});
step('soleil : parts proportionnelles, boucle « A dans B dans A » sans blocage', () => {
    const svg = draw({ kind: 'sunburst', rows: [{ name: 'R' }, { name: 'a', parent: 'R', value: 3 }, { name: 'b', parent: 'R', value: 1 }] });
    assert.match(svg, /a : 3 \(75 %\)/); assert.match(svg, /b : 1 \(25 %\)/);
    const loop = draw({ kind: 'sunburst', rows: [{ name: 'x', parent: 'y' }, { name: 'y', parent: 'x' }, { name: 'z', parent: 'z' }] });
    assert.doesNotMatch(loop, /Dessin impossible/);
});
step('réseau : disposition gardée en mémoire (le dessin suivant repart de là), liens et points comptés', () => {
    const s = { kind: 'network', ...R.KINDS.network.sample() };
    const a = draw(s), b = draw(s);
    assert.equal(a.match(/data-gn-net="([^"]+)"/)[1], b.match(/data-gn-net="([^"]+)"/)[1]);
    assert.equal((a.match(/<line data-e=/g) || []).length, s.rows.length);
    assert.equal((a.match(/<g data-n=/g) || []).length, s.nodes.length);
});
step('données énormes : dessin rapide (moins de 300 ms) et image bornée', () => {
    const big = {
        fan: { o: { gens: 10, labels: 'both' }, rows: N(3000, i => ({ sosa: i + 1, name: 'Nom ' + i, value: String(i % 100) })) },
        sunburst: { o: { depth: 12, sizeBy: 'desc' }, rows: N(20000, i => ({ name: 'n' + i, parent: i ? 'n' + Math.floor((i - 1) / 3) : '' })) },
        network: { rows: N(20000, i => ({ a: 'p' + (i % 2000), b: 'p' + ((i * 7 + 3) % 2000), kind: 'k' + i % 5 })) },
        arcs: { rows: N(20000, i => ({ a: 'p' + (i % 900), b: 'p' + ((i * 7 + 3) % 900), kind: 'k' + i % 5 })) },
        venn: { sets: N(9, i => ({ name: 'S' + i })), rows: N(50, i => ({ region: 'ABCD'.slice(0, 1 + i % 4), value: '1' })) },
        calendar: { rows: N(100000, i => ({ date: `${1600 + i % 400}-${String(1 + i % 12).padStart(2, '0')}-${String(1 + i % 28).padStart(2, '0')}` })) },
        monthrose: { series: N(30, i => ({ name: 's' + i })), rows: N(5000, i => ({ label: 'janvier', s0: i })) },
        spiral: { rows: N(20000, i => ({ start: String(1000 + i % 1000), end: String(1060 + i % 1000), label: 'L' + i, kind: 'k' + i % 7 })) },
    };
    const times = [];
    for (const [k, s] of Object.entries(big)) {
        let best = 1e9, svg = '';
        for (let r = 0; r < 3; r++) { const t = performance.now(); svg = draw({ kind: k, ...s }); best = Math.min(best, performance.now() - t); }
        times.push(`${k} ${Math.round(best)} ms`);
        assert.doesNotMatch(svg, /Dessin impossible/, k); assert.ok(svg.length < 3e6, `${k} : ${svg.length} octets`);
        assert.ok(best < 300, `${k} : ${Math.round(best)} ms`);
    }
    console.log('   ', times.join(' · '));
});
step('données piégées : textes échappés, couleurs refusées, nombres absurdes bornés', () => {
    const trap = '<img src=x onerror=alert(1)>"\'&';
    for (const k of NEW) {
        const s = { kind: k, o: { title: trap, height: '1e9', gens: '99', depth: '-5', hole: 'abc', strength: '1e9', years: trap, segWidth: 'NaN', palette: '__proto__' },
            rows: N(30, i => ({ sosa: i - 3, name: trap + i, value: trap, detail: trap, parent: trap, a: trap + i, b: trap, kind: trap, weight: 'NaN', date: trap, label: trap, start: String(1900 + i), end: trap, region: trap, color: 'red;background:url(x)', s0: '1e400' })),
            sets: [{ name: trap, color: 'url(javascript:1)' }, { name: trap }], nodes: [{ name: trap, group: trap, color: '"><script>' }], series: [{ name: trap, color: 'x"y' }], cats: [{ value: trap, color: '#fff" onload="x' }] };
        const svg = draw(s);
        assert.doesNotMatch(svg, /<img|<script|url\(|" onload=|"y"/i, k);
        assert.doesNotMatch(svg, /Dessin impossible/, k);
        assert.ok(svg.length < 2e6, k);
    }
});

/* ── 2. Navigateur ── */
let chromium = null;
try { ({ chromium } = require('playwright')); } catch (_) { try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
const phpPath = findPhp([devBundledPhp()]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-dgn-'));
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

(async () => {
    for (const [name, fn] of steps) { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } }
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); process.exit(failed ? 1 : 0); }
    fs.mkdirSync(path.join(tmp, 'media'), { recursive: true });
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), path.join(appRoot, 'tests/fixtures/diagram-genea-seed.php')], { cwd: appRoot, encoding: 'utf8', env: envFor(tmp) });
    if (r.status !== 0 || !/^ok /m.test(r.stdout)) { console.error(r.stderr || r.stdout); process.exit(1); }
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(tmp), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch();
    const errors = [];
    const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
    const watch = p => { p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); }); p.on('dialog', d => { errors.push('dialogue : ' + d.message()); d.dismiss(); }); };
    const ready = async p => { await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.bootstrap && window.LCNDA_EXT?.openDiagramEditor && window.LCNDA_EXT?.diagramGenea, null, { timeout: 20000 }); await p.waitForTimeout(500); };
    const closeEditor = p => p.evaluate(() => document.querySelectorAll('.h-dg-dlg').forEach(d => { d.close(); d.remove(); }));
    const openKind = async (p, k) => { await closeEditor(p); await p.evaluate(k => { window.LCNDA_EXT.openDiagramEditor(null, { kind: k }); }, k); await p.waitForSelector('.h-dg-dlg [data-dg-preview] svg'); };
    const previewText = p => p.$eval('.h-dg-dlg [data-dg-preview] svg', s => s.textContent);
    try {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
        const p = await ctx.newPage(); watch(p); await ready(p);
        const api = q => p.evaluate(q => window.LCNDA_APP.api('diagram_genea', q), q);
        await t('serveur : données de l’app bornées, ensembles inconnus refusés', async () => {
            const fan = await api({ what: 'fan', gens: 99 });
            assert.equal(fan.gens, 10); assert.ok(fan.rows.length > 50 && fan.rows.every(x => x.sosa < 1024));
            assert.ok(fan.rows.every(x => x.score >= 0 && x.score <= 100));
            const im = await api({ what: 'implexe' }); assert.ok(im.links.length >= 1, 'un implexe dans la petite généalogie');
            const v = await api({ what: 'venn', keys: 'sosa,male,female' }); assert.equal(v.regions.ABC || 0, 0); assert.ok(v.regions.AB > 0 && v.regions.AC > 0);
            const bad = await p.evaluate(() => window.LCNDA_APP.api('diagram_genea', { what: 'venn', keys: "sosa,label:1 OR 1=1" }).then(() => 'ok', e => e.message));
            assert.match(bad, /inconnu/);
            const d = await api({ what: 'dates', types: 'birth,marriage,death', scope: 'ancestors' }); assert.ok(d.days.length > 10 && d.months.birth.length === 12);
            // paramètres en tableau (?types[]=…, ?root[]=…) : lus comme vides, pas « Array » ni erreur
            const arr = await p.evaluate(() => fetch('api.php?action=diagram_genea&what=dates&types[]=death&root[]=1&scope[]=x').then(async r => [r.status, await r.json()]));
            assert.equal(arr[0], 200); assert.deepEqual(arr[1].types, ['birth']);
        });
        await t('« Nouveau diagramme » : les sortes rangées dans Généalogie et Frises, avec leur vignette', async () => {
            const pr = p.evaluate(() => window.LCNDA_EXT.diagramsInternals.chooseType());
            await p.waitForSelector('.h-dg-gallery .h-dg-tile');
            const groups = await p.$$eval('.h-dg-gallery h4', hs => Object.fromEntries(hs.map(h => [h.textContent, [...h.nextElementSibling.querySelectorAll('.h-dg-tile')].map(x => x.textContent.trim())])));
            for (const l of ['Éventail', 'Soleil', 'Réseau', 'Arcs', 'Venn']) assert.ok(groups['Généalogie']?.some(x => x.includes(l)), l);
            for (const l of ['Calendrier', 'Rose des mois', 'Spirale']) assert.ok(groups['Frises']?.some(x => x.includes(l)), l);
            assert.ok(!groups['Liens']?.some(x => x.includes('Venn')), 'un seul Venn');
            assert.equal(await p.$$eval('.h-dg-gallery .h-dg-mini [data-gn-net]', g => g.filter(x => x.__gn).length), 0, 'la vignette du réseau reste immobile');
            await p.click('.h-dg-gallery [data-close]'); assert.equal(await pr, null);
        });
        const ids = {};
        const fanRows = (await api({ what: 'fan', gens: 6 })).rows, s16 = fanRows.find(x => x.sosa === 16).id;
        const fromApp = async (k, before) => {
            await openKind(p, k); await p.click('.h-dg-dlg [data-dg-tab="app"]'); await p.waitForSelector('.h-dg-dlg [data-gn-go]');
            if (before) await before();
            await p.click('.h-dg-dlg [data-gn-go]');
            await p.waitForFunction(() => document.querySelector('.h-dg-dlg [data-dg-tab="data"]')?.classList.contains('is-active'), null, { timeout: 10000 });
            await p.waitForTimeout(250);
            return p.$$eval('.h-dg-dlg [data-grid="0"] tbody tr', e => e.length);
        };
        await t('🪭 éventail « Depuis l’app » : mes ancêtres colorés par région, puis par taux de recherche', async () => {
            assert.ok(await fromApp('fan', () => p.selectOption('.h-dg-dlg [data-gn="by"]', 'state')) > 20);
            const txt = await previewText(p); assert.match(txt, /Bretagne/); assert.match(txt, /Normandie/);
            await p.click('.h-dg-dlg [data-dg-tab="app"]'); await p.selectOption('.h-dg-dlg [data-gn="by"]', 'score'); await p.selectOption('.h-dg-dlg [data-gn="gens"]', '7');
            await p.click('.h-dg-dlg [data-gn-go]'); await p.waitForFunction(() => /100 %/.test(document.querySelector('.h-dg-dlg [data-dg-preview] svg')?.textContent || ''));
            // réglages : cercle complet
            await p.click('.h-dg-dlg [data-dg-tab="opts"]'); await p.selectOption('.h-dg-dlg [data-opt="shape"]', 'full');
            await p.waitForFunction(() => document.querySelector('.h-dg-dlg [data-dg-preview] svg circle'));
        });
        await t('🌞 soleil « Depuis l’app » : la descendance d’un ancêtre', async () => {
            const n = await fromApp('sunburst', () => p.evaluate(id => window.LCNDA_PICKER.pickerSet(document.querySelector('.h-dg-dlg [name=gn_root]').closest('.pk'), id), s16));
            assert.ok(n > 8, `${n} personnes`); assert.match(await previewText(p), /Descendance de/);
        });
        await t('🕸 réseau « Depuis l’app » (toute la base), puis un CSV de liens', async () => {
            assert.ok(await fromApp('network', () => p.selectOption('.h-dg-dlg [data-gn="depth"]', 'all')) > 20);
            const csv = path.join(tmp, 'liens.csv'); fs.writeFileSync(csv, 'Personne A;Personne B;Sorte;Force\nLouis;Marie;parrain;2\nMarie;Jean;témoin;1\nJean;Louis;voisin;\n');
            await p.setInputFiles('.h-dg-dlg [data-dg-csv="0"]', csv);
            await p.waitForFunction(() => document.querySelectorAll('.h-dg-dlg [data-dg-preview] [data-n]').length >= 3 && /parrain/.test(document.querySelector('.h-dg-dlg [data-dg-preview] svg').textContent));
        });
        await t('🌈 arcs « Depuis l’app » : implexe et mariages entre familles', async () => {
            assert.ok(await fromApp('arcs', () => p.selectOption('.h-dg-dlg [data-gn="src"]', 'implexe')) >= 1);
            assert.match(await previewText(p), /Sosa \d+ · /);
            assert.ok(await fromApp('arcs', () => p.selectOption('.h-dg-dlg [data-gn="src"]', 'marriages')) > 3);
        });
        await t('⭕ Venn « Depuis l’app » : 3 ensembles cochés, zones comptées', async () => {
            await fromApp('venn', async () => { await p.waitForSelector('.h-dg-dlg [data-gn-sets] input'); for (const v of ['sosa', 'male', 'female']) await p.check(`.h-dg-dlg [data-gn-sets] input[value="${v}"]`); });
            const zones = await p.$$eval('.h-dg-dlg [data-grid="1"] tbody tr', e => e.map(r => r.textContent.trim()));
            assert.equal(zones.length, 7); assert.ok(zones.some(z => /^ABC\s*0$/.test(z.replace(/\s+/g, ' ').trim()) || /^ABC/.test(z)));
            // un 4e ensemble à la main : 15 zones
            await p.click('.h-dg-dlg [data-dg-add="0"]'); await p.waitForFunction(() => document.querySelectorAll('.h-dg-dlg [data-grid="1"] tbody tr').length === 15);
        });
        await t('🗓 calendrier « Depuis l’app », puis une ligne par année', async () => {
            assert.ok(await fromApp('calendar', () => p.check('.h-dg-dlg [data-gn-type][value="death"]')) > 5);
            await p.click('.h-dg-dlg [data-dg-tab="opts"]'); await p.selectOption('.h-dg-dlg [data-opt="layout"]', 'year');
            await p.waitForFunction(() => /\b1[89]\d\d\b/.test(document.querySelector('.h-dg-dlg [data-dg-preview] svg')?.textContent || ''));
        });
        await t('🌸 rose des mois « Depuis l’app », puis un tableau collé', async () => {
            await fromApp('monthrose');
            assert.match(await previewText(p), /janv\./); assert.match(await previewText(p), /Naissances/);
            await p.click('.h-dg-dlg [data-dg-paste="0"]'); await p.waitForSelector('dialog[open] textarea[name=t]');
            await p.fill('dialog[open] textarea[name=t]', 'Mois\tBaptêmes\tSépultures\njanvier\t10\t4\nfévrier\t12\t7\nmars\t3\t9');
            await p.click('dialog[open] form.h-dialog-form button[type=submit]');
            await p.waitForFunction(() => /Baptêmes/.test(document.querySelector('.h-dg-dlg [data-dg-preview] svg')?.textContent || ''));
        });
        await t('🌀 spirale « Depuis l’app » : vies des ancêtres, puis événements', async () => {
            assert.ok(await fromApp('spiral', () => p.selectOption('.h-dg-dlg [data-dgo="pop"]', 'anc')) > 20); // « Qui » est devenu le groupe de personnes commun (heritage-diagram-options.js)
            assert.ok(await fromApp('spiral', () => p.selectOption('.h-dg-dlg [data-gn="what"]', 'events')) > 20);
            assert.match(await previewText(p), /Naissance de/);
        });
        await t('export : SVG et CSV des données (fenêtre commune), puis enregistrement', async () => {
            const exp = async fmt => { await p.click('.h-dg-dlg [data-dg-expdlg]'); await p.waitForSelector(`[data-fmt="${fmt}"]`); await p.click(`[data-fmt="${fmt}"]`); const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-ui-go]')]); return fs.readFileSync(await dl.path(), 'utf8'); };
            assert.match(await exp('svg'), /^<svg[^>]+role="img"|^<svg/);
            const csv = await exp('csv'); assert.match(csv, /Date ou début;Fin/); assert.match(csv, /Naissance de/);
            await p.click('.h-dg-dlg [data-dg-save]'); await p.waitForFunction(() => !document.querySelector('.h-dg-dlg'));
        });
        await t('enregistrés et posés dans une case (comme une Fiche) : les 8 sortes', async () => {
            for (const k of NEW) {
                const id = await p.evaluate(async k => { const R = window.LCNDA_EXT.diagramRender, s = {kind: k, ...R.KINDS[k].sample()}; const { kind, ...spec } = s; const r = await window.LCNDA_APP.api('save_diagram', {}, { method: 'POST', body: { name: 'Test ' + k, kind, spec } }); return Number(r.result?.id || r.id); }, k);
                assert.ok(id > 0, k); ids[k] = id;
            }
            await p.evaluate(ids => { const box = document.createElement('div'); box.id = 'dgn-test'; box.style.width = '640px'; box.innerHTML = Object.values(ids).map(id => window.LCNDA_EXT.diagramEmbedHtml(id)).join(''); document.body.appendChild(box); }, ids);
            await p.waitForFunction(n => document.querySelectorAll('#dgn-test .h-dg-svg svg').length === n, NEW.length, { timeout: 15000 });
        });
        await t('🕸 réseau posé : la disposition continue, on glisse un point, on zoome', async () => {
            await p.waitForSelector('#dgn-test .gn-net-tools');
            const node = await p.$('#dgn-test [data-gn-net] [data-n="0"]'); const before = await node.getAttribute('transform');
            await node.scrollIntoViewIfNeeded(); const b = await node.boundingBox(); await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p.mouse.down(); await p.mouse.move(b.x + 80, b.y + 40, { steps: 6 }); await p.mouse.up();
            await p.waitForTimeout(150);
            assert.notEqual(await node.getAttribute('transform'), before);
            assert.equal(await p.evaluate(() => { const g = document.querySelector('#dgn-test [data-gn-net]'); return window.LCNDA_EXT.diagramGenea.netState().get(g.dataset.gnNet).pin[0]; }), 1, 'le point reste où on l’a posé');
            await p.click('#dgn-test .gn-net-tools [data-z="in"]');
            assert.match(await p.$eval('#dgn-test [data-gn-vp]', g => g.getAttribute('transform')), /scale\(1\.3\)/);
            await p.click('#dgn-test .gn-net-tools [data-z="reset"]');
            assert.match(await p.$eval('#dgn-test [data-gn-vp]', g => g.getAttribute('transform')), /scale\(1\)/);
            assert.equal(await p.evaluate(() => window.__xss), undefined, 'aucun nom piégé exécuté');
        });
        await t('mode sombre : les dessins restent sur fond clair, la barre du réseau est lisible', async () => {
            await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
            const bg = await p.$eval('#dgn-test svg rect', r => r.getAttribute('fill')); assert.equal(bg, '#ffffff');
            const c = await p.$eval('#dgn-test .gn-net-hint', e => getComputedStyle(e).color); assert.notEqual(c, 'rgb(0, 0, 0)');
            await p.evaluate(() => { document.documentElement.removeAttribute('data-theme'); document.getElementById('dgn-test').remove(); });
        });
        await t('390 px de large : l’éditeur ne déborde pas, le dessin tient', async () => {
            const m = await browser.newPage({ viewport: { width: 390, height: 844 } }); watch(m); await ready(m);
            for (const k of ['fan', 'network', 'calendar']) {
                await m.evaluate(k => { document.querySelectorAll('.h-dg-dlg').forEach(d => { d.close(); d.remove(); }); window.LCNDA_EXT.openDiagramEditor(null, { kind: k }); }, k);
                await m.waitForSelector('.h-dg-dlg [data-dg-preview] svg');
                const w = await m.evaluate(() => ({ doc: document.documentElement.scrollWidth, svg: document.querySelector('.h-dg-dlg [data-dg-preview] svg').getBoundingClientRect().right, dlg: document.querySelector('.h-dg-dlg').getBoundingClientRect().right }));
                assert.ok(w.doc <= 391 && w.svg <= 391 && w.dlg <= 391, `${k} : ${JSON.stringify(w)}`);
            }
            await m.close();
        });
        await t('aucune erreur JavaScript', async () => assert.deepEqual(errors, []));
    } finally { await browser.close(); proc.kill(); }
    process.exit(failed ? 1 : 0);
})();
