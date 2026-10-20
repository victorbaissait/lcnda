'use strict';
/**
 * 📊 Diagrammes en plus (assets/js/heritage-diagram-more.js, la carte à symboles de heritage-diagram-cartes.js,
 * lib/diagram_more.php) :   node tests/test-diagram-more.js
 * 1. Sans navigateur (bac à sable) : les 11 sortes dessinées en SVG se dessinent avec leur exemple, SVG valide en XML,
 *    textes piégés échappés, données énormes dessinées vite ; calculs (qui vit en telle année, quartiles, arbre sans boucle).
 * 2. Navigateur (Playwright + PHP ; sinon partie sautée) : un dossier de données à part, une petite généalogie
 *    (tests/fixtures/diagram-more-seed.php), un « php -S » à lui. Chaque sorte s'ouvre dans l'éditeur, se dessine,
 *    se remplit « Depuis l'app », la galerie les range ; l'accordéon se plie, la pyramide défile, une case du
 *    quadrillage ouvre la fiche ; aucune erreur JavaScript. Captures d'écran : DMO_SHOTS=<dossier> (facultatif).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const vm = require('node:vm');
const { spawn, spawnSync } = require('node:child_process');

const appRoot = path.resolve(__dirname, '..');
let failed = 0;
const steps = [];
const step = (name, fn) => steps.push([name, fn]);
const SVG_KINDS = ['genbars', 'crises', 'siblings', 'alivepyr', 'accordion', 'cousinage', 'kinmatrix', 'surnametree', 'ancestorgrid', 'chord', 'violin'];
const ALL = [...SVG_KINDS, 'bubblemap'];
const GROUP = { genbars: 'Frises', crises: 'Frises', siblings: 'Frises', alivepyr: 'Frises', accordion: 'Généalogie', cousinage: 'Généalogie', kinmatrix: 'Généalogie', surnametree: 'Généalogie', ancestorgrid: 'Généalogie', chord: 'Liens', violin: 'Chiffres', bubblemap: 'Cartes' };
// ce que chaque dessin doit contenir
const EXPECT = { genbars: /<rect[^>]+rx="[^"]+" fill="#4e79a7"/, crises: /data-dmo-line="deaths"/, siblings: /data-dmo-marr=/, alivepyr: /data-dmo-pyr=/, accordion: /data-acc-t=/, cousinage: /data-dmo-edge=/,
    kinmatrix: /data-dmo-cell="k"/, surnametree: /data-dmo-name=/, ancestorgrid: /data-dmo-slot="1"/, chord: /data-dmo-ribbon=/, violin: /data-dmo-violin=/, bubblemap: /class="dgm-b"/ };

/* ── 1. Bac à sable ── */
const sandbox = { window: {}, console, setTimeout, clearTimeout, performance, Intl, MutationObserver: class { observe() {} }, document: { documentElement: {}, querySelectorAll: () => [], addEventListener() {} } };
sandbox.window.LCNDA_APP = { state: {} };
vm.createContext(sandbox);
for (const f of ['heritage-diagrams-render.js', 'heritage-diagram-genea.js', 'heritage-diagram-more.js']) vm.runInContext(fs.readFileSync(path.join(appRoot, 'assets/js', f), 'utf8'), sandbox, { filename: f });
const ext = sandbox.window.LCNDA_EXT, R = ext.diagramRender, M = ext.diagramMore;
const N = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const draw = spec => R.svg(JSON.parse(JSON.stringify(spec)));

step('les 11 sortes dessinées : rangées, une icône, un nom, des tableaux, un exemple, « Depuis l’app »', () => {
    for (const k of SVG_KINDS) {
        const K = R.KINDS[k]; assert.ok(K, k);
        assert.ok(K.icon && K.label && typeof K.render === 'function' && typeof K.sample === 'function' && K.grids.length, k);
        assert.equal(K.group, GROUP[k], k);
        assert.ok(K.fromApp && typeof K.fromApp.html === 'function' && typeof K.fromApp.bind === 'function', k + ' : Depuis l’app');
        const svg = draw({ kind: k, ...K.sample() });
        assert.match(svg, /^<svg[^>]+viewBox="0 0 900 \d+/, k); assert.doesNotMatch(svg, /Dessin impossible/, k);
        assert.match(svg, EXPECT[k], k);
    }
});
step('SVG valide en XML : chaque attribut a une valeur', () => {
    for (const k of SVG_KINDS) {
        const svg = draw({ kind: k, ...R.KINDS[k].sample() });
        for (const [, name, attrs] of svg.matchAll(/<([a-zA-Z][\w:-]*)((?:\s+[^\s=>\/]+(?:="[^"]*")?)*)\s*\/?>/g)) {
            const bare = attrs.replace(/\s+[^\s=>\/]+="[^"]*"/g, '').trim();
            assert.equal(bare, '', `${k} : <${name}> a un attribut sans valeur (${bare})`);
        }
    }
});
step('calculs : qui vivait en telle année, quartiles, arbre sans boucle, accordéon plié', () => {
    const c = M.aliveCounts([[1800, 1850, 1, 0], [1820, null, 2, 0], [1820, null, 2, 1], [1840, 1841, 1, 0], [1860, 1900, 2, 0]], 1840, 10, 10, 0, 90);
    assert.deepEqual([c.m.reduce((a, b) => a + b), c.f.reduce((a, b) => a + b)], [2, 1], 'décès inconnu : pas compté, sauf les vivants');
    assert.equal(c.m[4], 1); assert.equal(c.m[0], 1);
    assert.equal(M.aliveCounts([[1820, null, 2, 0]], 1840, 10, 10, 60, 90).f[2], 1, 'vie supposée de 60 ans');
    assert.equal(M.quant([1, 2, 3, 4, 5], .5), 3); assert.equal(M.quant([1, 2, 3, 4], .25), 1.75);
    const roots = M.treeOf([{ name: 'a', parent: 'b' }, { name: 'b', parent: 'a' }, { name: 'c', parent: 'c' }]); assert.ok(roots.length >= 1);
    const s = { kind: 'accordion', ...R.KINDS.accordion.sample() };
    const open = draw(s), shut = draw({ ...s, o: { ...s.o, folded: ['n0'] } });
    assert.ok((shut.match(/display="none"/g) || []).length >= 11, 'le sommet plié cache tout le reste');
    assert.doesNotMatch(open, /display="none"/);
    assert.match(shut, />\+11</, 'le nombre de personnes cachées');
});
step('données énormes : dessin rapide (moins d’une seconde) et borné', () => {
    const big = {
        genbars: { rows: N(1100, i => ({ sosa: i + 1, name: 'N' + i, start: String(1500 + i % 400), end: String(1560 + i % 400) })) },
        crises: { rows: N(3000, i => ({ year: String(1000 + i), births: i % 50, deaths: (i * 7) % 60 })) },
        siblings: { rows: N(200, i => ({ name: 'E' + i, birth: String(1800 + i), death: String(1860 + i), marriages: '1830,1840', children: '1831,1833,1835' })) },
        alivepyr: { people: N(40000, i => [1500 + i % 500, i % 3 ? 1560 + i % 500 : null, 1 + i % 2, 0]), o: { year: 1700, band: 5 } },
        accordion: { rows: N(3000, i => ({ name: 'p' + i, parent: i ? 'p' + Math.floor((i - 1) / 3) : '', kin: 'cousin', degree: i % 9 })) },
        cousinage: { rows: N(1500, i => ({ a: 'p' + (i % 150), b: 'p' + ((i * 7 + 3) % 150), kind: 'k' + i % 5 })) },
        kinmatrix: { rows: N(1600, i => ({ a: 'p' + (i % 40), b: 'p' + ((i * 7 + 1) % 40), label: 'cousin issu de germains', degree: i % 9 })) },
        surnametree: { rows: N(600, i => ({ name: 'N' + i, parent: i ? 'N' + Math.floor((i - 1) / 2) : '', gen: 1 + Math.floor(Math.log2(i + 1)), counts: '1,2,3,4' })) },
        ancestorgrid: { o: { gens: 12 }, rows: N(4095, i => ({ sosa: i + 1, name: 'N' + i, value: String(i % 100) })) },
        chord: { rows: N(5000, i => ({ from: 'L' + (i % 300), to: 'L' + ((i * 7) % 300), value: 1 + i % 4 })) },
        violin: { rows: N(30000, i => ({ group: 'G' + (i % 24), value: (i * 37) % 101 })) },
    };
    const times = [];
    for (const [k, s] of Object.entries(big)) {
        let best = 1e9, svg = '';
        for (let r = 0; r < 2; r++) { const t = performance.now(); svg = draw({ kind: k, ...s }); best = Math.min(best, performance.now() - t); }
        times.push(`${k} ${Math.round(best)} ms`);
        assert.doesNotMatch(svg, /Dessin impossible/, k); assert.ok(svg.length < 4e6, `${k} : ${svg.length} octets`);
        assert.ok(best < 1000, `${k} : ${Math.round(best)} ms`);
    }
    console.log('   ', times.join(' · '));
});
step('données piégées : textes échappés, couleurs refusées, nombres absurdes bornés', () => {
    const trap = '<img src=x onerror=alert(1)>"\'&';
    for (const k of SVG_KINDS) {
        const s = { kind: k, o: { title: trap, height: '1e9', gens: '99', top: '-5', year: 'abc', band: '0', indent: 'NaN', bandwidth: '-1', palette: '__proto__', folded: [trap] },
            rows: N(30, i => ({ sosa: i - 3, name: trap + i, parent: trap, gen: '1e9', start: String(1800 + i), end: trap, group: trap, year: String(1800 + i), births: '1e400', deaths: 'x', birth: String(1800 + i), death: trap, sex: trap, marriages: trap, children: '1820,' + trap,
                key: trap + i, pkey: trap, years: trap, kin: trap, degree: 'NaN', a: trap + i, b: trap, kind: trap, label: trap, value: i % 2 ? trap : String(i), detail: trap, counts: trap, variants: trap, from: trap + i % 3, to: trap, color: 'red;background:url(x)' })),
            events: [{ start: '1800', label: trap, color: '"><script>' }], crises: [{ start: '1810', label: trap, color: 'url(javascript:1)' }], people: [[1800, null, 1, 0], ['x', 'y']], nodes: [{ name: trap, group: trap }], cats: [{ value: trap, color: '#fff" onload="x' }] };
        const svg = draw(s);
        assert.doesNotMatch(svg, /<img|<script|url\(|" onload=/i, k);
        assert.doesNotMatch(svg, /Dessin impossible/, k);
    }
});

/* ── 2. Navigateur ── */
let chromium = null;
for (const p of ['playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright']) { try { ({ chromium } = require(p)); break; } catch (_) { chromium = null; } }
const php = spawnSync('php', ['-v'], { encoding: 'utf8' }).status === 0 ? 'php' : null;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-dmo-'));
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
const SHOTS = process.env.DMO_SHOTS || '';

(async () => {
    for (const [name, fn] of steps) { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } }
    if (!chromium || !php) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); process.exit(failed ? 1 : 0); }
    fs.mkdirSync(path.join(tmp, 'media'), { recursive: true });
    const init = spawnSync(php, ['-r', 'require "lib/paths.php"; (new PDO("sqlite:".DATA_DIR."/genealogy.sqlite"))->exec(file_get_contents(APP_ROOT."/data/schema.sql")); require "lib/bootstrap.php"; db();'], { cwd: appRoot, encoding: 'utf8', env: envFor(tmp) });
    if (init.status !== 0) { console.error(init.stderr || init.stdout); process.exit(1); }
    const r = spawnSync(php, [path.join(appRoot, 'tests/fixtures/diagram-more-seed.php')], { cwd: appRoot, encoding: 'utf8', env: envFor(tmp) });
    if (r.status !== 0 || !/^ok fratrie/m.test(r.stdout)) { console.error(r.stderr || r.stdout); process.exit(1); }
    const sib = r.stdout.match(/^ok fratrie ([\d,]+)/m)[1].split(',').map(Number);
    const port = await freePort();
    const proc = spawn(php, ['-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(tmp), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch(exe ? { executablePath: exe } : {});
    const errors = [];
    const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
    const watch = p => { p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); }); p.on('dialog', d => { errors.push('dialogue : ' + d.message()); d.dismiss(); }); };
    const ready = async p => { await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.bootstrap && window.LCNDA_EXT?.openDiagramEditor && window.LCNDA_EXT?.diagramMore, null, { timeout: 20000 }); await p.waitForTimeout(400); };
    const closeEditor = p => p.evaluate(() => document.querySelectorAll('.h-dg-dlg').forEach(d => { d.close(); d.remove(); }));
    const openKind = async (p, k) => { await closeEditor(p); await p.evaluate(k => { window.LCNDA_EXT.openDiagramEditor(null, { kind: k }); }, k); await p.waitForSelector('.h-dg-dlg [data-dg-preview] svg'); };
    const preview = p => p.$eval('.h-dg-dlg [data-dg-preview] svg', s => s.outerHTML);
    const shot = async (p, name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); const el = await p.$('.h-dg-dlg [data-dg-preview]'); await el.screenshot({ path: path.join(SHOTS, name + '.png') }); };
    try {
        const ctx = await browser.newContext({ viewport: { width: 1360, height: 950 } });
        const p = await ctx.newPage(); watch(p); await ready(p);
        const api = q => p.evaluate(q => window.LCNDA_APP.api('diagram_more', q), q);
        await t('serveur : les huit données de diagram_more, bornées ; demande inconnue refusée', async () => {
            const cr = await api({ what: 'crises' }); assert.ok(cr.rows.length > 50); assert.ok(cr.rows.find(x => x.year === '1832').deaths >= 7, 'le choléra de 1832');
            const s = await api({ what: 'siblings', person: sib[0] }); assert.equal(s.people.length, 5); assert.ok(s.people.some(x => /1982/.test(x.marriages) && x.children.split(',').length === 2));
            const al = await api({ what: 'alive' }); assert.ok(al.people.length > 100 && al.people.every(x => x.length === 4));
            const ac = await api({ what: 'accordion', up: 99 }); assert.ok(ac.nodes.some(n => /cousin germain/.test(n.kin)), 'des cousins germains'); assert.ok(ac.nodes.some(n => n.kin === 'oncle'));
            const ids = ac.nodes.slice(0, 6).map(n => n.id).join(',');
            const k = await api({ what: 'kinship', ids }); assert.ok(k.cells.some(c => c.label === 'père'));
            const co = await api({ what: 'cousins', gens: 3 }); assert.ok(co.links.some(l => l.kind === 'cousins germains'));
            const su = await api({ what: 'surnames', gens: 7 }); assert.ok(su.rows.some(x => /Martins/.test(x.variants)), 'variantes regroupées'); assert.ok(su.rows.filter(x => x.parent).length > 5);
            const ch = await api({ what: 'chord', top: 3 }); assert.ok(ch.rows.length >= 2 && ch.rows.every(x => x.value > 0));
            const bad = await p.evaluate(() => window.LCNDA_APP.api('diagram_more', { what: 'rien' }).then(() => 'ok', e => e.message)); assert.match(bad, /inconnu/);
            const arr = await p.evaluate(() => fetch('api.php?action=diagram_more&what=crises&place[]=1&step[]=5').then(r => r.status)); assert.equal(arr, 200);
        });
        await t('« Nouveau diagramme » : les 12 sortes rangées dans leur groupe', async () => {
            const pr = p.evaluate(() => window.LCNDA_EXT.diagramsInternals.chooseType());
            await p.waitForSelector('.h-dg-gallery .h-dg-tile');
            const groups = await p.$$eval('.h-dg-gallery h4', hs => Object.fromEntries(hs.map(h => [h.textContent, [...h.nextElementSibling.querySelectorAll('.h-dg-tile')].map(x => x.textContent.trim())])));
            for (const k of ALL) { const label = await p.evaluate(k => window.LCNDA_EXT.diagramRender.KINDS[k].label, k); assert.ok(groups[GROUP[k]]?.some(x => x.includes(label)), `${k} dans ${GROUP[k]}`); }
            await p.click('.h-dg-gallery [data-close]'); assert.equal(await pr, null);
        });
        await t('chaque sorte s’ouvre dans l’éditeur et se dessine avec son exemple', async () => {
            for (const k of ALL) {
                await openKind(p, k);
                if (k === 'bubblemap') await p.waitForSelector('.h-dg-dlg [data-dg-preview] .dgm-b', { timeout: 15000 });
                const svg = await preview(p); assert.match(svg, EXPECT[k], k); assert.doesNotMatch(svg, /Dessin impossible/, k);
                await shot(p, 'exemple-' + k);
            }
        });
        const fromApp = async (k, before) => {
            await openKind(p, k); await p.click('.h-dg-dlg [data-dg-tab="app"]'); await p.waitForSelector('.h-dg-dlg [data-dm-go], .h-dg-dlg [data-dgm-go]');
            if (before) await before();
            await p.click('.h-dg-dlg [data-dm-go], .h-dg-dlg [data-dgm-go]');
            if (k === 'bubblemap') await p.waitForFunction(() => /✓|Aucun|⛔/.test(document.querySelector('.h-dg-dlg [data-dgm-msg]')?.textContent || ''), null, { timeout: 15000 });
            else await p.waitForFunction(() => document.querySelector('.h-dg-dlg [data-dg-tab="data"]')?.classList.contains('is-active') || /⚠️/.test(document.querySelector('.h-dg-dlg [data-dm-msg]')?.textContent || ''), null, { timeout: 15000 });
            const msg = await p.$eval('.h-dg-dlg [data-dm-msg], .h-dg-dlg [data-dgm-msg]', e => e.textContent).catch(() => '');
            assert.doesNotMatch(msg, /⚠️|⛔/, `${k} : ${msg}`);
            await p.waitForTimeout(300);
            if (k === 'bubblemap') { await p.click('.h-dg-dlg [data-dg-tab="data"]'); await p.waitForSelector('.h-dg-dlg [data-grid="0"]'); } // la carte garde l'onglet ouvert : le tableau est dans « Données »
            return p.evaluate(() => document.querySelectorAll('.h-dg-dlg [data-grid="0"] tbody tr').length);
        };
        const pickRoot = id => () => p.evaluate(id => window.LCNDA_PICKER.pickerSet(document.querySelector('.h-dg-dlg [name=dm_root]').closest('.pk'), id), id);
        const accNodes = (await api({ what: 'accordion', up: 3 })).nodes;
        const APP = {
            genbars: [null, async () => assert.ok((await p.$$('.h-dg-dlg [data-dg-preview] [data-dmo-pid]')).length > 10)],
            crises: [null, async () => assert.match(await preview(p), /Choléra/)],
            siblings: [pickRoot(sib[1]), async () => assert.ok((await p.$$('.h-dg-dlg [data-dg-preview] [data-dmo-kid]')).length >= 4)],
            alivepyr: [() => p.fill('.h-dg-dlg [data-dm="year"]', '1900'), async () => assert.match(await preview(p), />1900</)],
            accordion: [() => p.selectOption('.h-dg-dlg [data-dm="gens"]', '3'), async () => assert.match(await preview(p), /cousin germain/)],
            cousinage: [null, async () => assert.match(await preview(p), /cousins germains/)],
            kinmatrix: [() => p.evaluate(ids => window.LCNDA_PICKER.pickerSet(document.querySelector('.h-dg-dlg [name=dm_ids]').closest('.pk'), ids), accNodes.slice(0, 8).map(n => n.id)), async () => assert.match(await preview(p), /père/)],
            surnametree: [null, async () => assert.match(await preview(p), /Martins/)],
            ancestorgrid: [null, async () => assert.ok((await p.$$('.h-dg-dlg [data-dg-preview] [data-dmo-pid]')).length > 20)],
            chord: [null, async () => assert.match(await preview(p), /Vitré/)],
            violin: [() => p.selectOption('.h-dg-dlg [data-dm="by"]', 'group'), async () => assert.match(await preview(p), /Hommes/)],
            bubblemap: [null, async () => { await p.waitForSelector('.h-dg-dlg [data-dg-preview] .dgm-b'); assert.match(await preview(p), /Rennes/); }],
        };
        for (const k of ALL) {
            await t(`« Depuis l’app » : ${k}`, async () => {
                const n = await fromApp(k, APP[k][0]); assert.ok(n > 0 || ['alivepyr'].includes(k), `${k} : ${n} lignes`);
                await p.click('.h-dg-dlg [data-dg-tab="data"]').catch(() => {});
                await APP[k][1](); await shot(p, 'base-' + k);
            });
        }
        await t('🪗 accordéon : un clic plie une branche (et l’enregistre), un autre la déplie', async () => {
            await fromApp('accordion', () => p.selectOption('.h-dg-dlg [data-dm="gens"]', '2'));
            const vis = () => p.$$eval('.h-dg-dlg [data-dg-preview] [data-acc-row]:not([display="none"])', e => e.length);
            const before = await vis();
            await p.click('.h-dg-dlg [data-dg-preview] [data-acc-t]'); await p.waitForFunction(n => document.querySelectorAll('.h-dg-dlg [data-dg-preview] [data-acc-row]:not([display="none"])').length < n, before);
            const tops = await p.$$eval('.h-dg-dlg [data-dg-preview] [data-acc-row][data-acc-up="-1"]', e => e.length);
            assert.ok((await vis()) <= tops + before - 1 && (await vis()) < before, 'la première branche pliée');
            assert.ok((await p.evaluate(() => document.querySelector('.h-dg-dlg [data-dg-preview] [data-acc-row]').dataset.accF)) === '1', 'pliée et enregistrée dans le dessin');
            await p.click('.h-dg-dlg [data-dg-preview] [data-acc-t]'); await p.waitForFunction(n => document.querySelectorAll('.h-dg-dlg [data-dg-preview] [data-acc-row]:not([display="none"])').length === n, before);
        });
        await t('🔺 pyramide : le curseur change l’année, ▶ fait défiler', async () => {
            await fromApp('alivepyr', () => p.fill('.h-dg-dlg [data-dm="year"]', '1850'));
            await p.waitForSelector('.h-dg-dlg .dmo-tools input[type=range]');
            const y0 = await p.$eval('.h-dg-dlg [data-dmo-pyy]', e => e.textContent);
            await p.$eval('.h-dg-dlg .dmo-tools input[type=range]', i => { i.value = String(Math.floor(i.max / 4)); i.dispatchEvent(new Event('input', { bubbles: true })); });
            const y1 = await p.$eval('.h-dg-dlg [data-dmo-pyy]', e => e.textContent); assert.notEqual(y1, y0);
            await p.click('.h-dg-dlg [data-dmo-play]'); await p.waitForTimeout(500);
            assert.notEqual(await p.$eval('.h-dg-dlg [data-dmo-pyy]', e => e.textContent), y1, 'les années défilent');
            await p.click('.h-dg-dlg [data-dmo-play]');
        });
        await t('enregistrés et posés dans une case : les 12 sortes ; une case du quadrillage ouvre la fiche, l’accordéon se plie', async () => {
            await closeEditor(p);
            const ids = {};
            for (const k of ALL) ids[k] = await p.evaluate(async k => { const R = window.LCNDA_EXT.diagramRender, s = { kind: k, ...R.KINDS[k].sample() }; const { kind, ...spec } = s; const r = await window.LCNDA_APP.api('save_diagram', {}, { method: 'POST', body: { name: 'Test ' + k, kind, spec } }); return Number(r.result?.id || r.id); }, k);
            assert.ok(Object.values(ids).every(x => x > 0));
            await p.evaluate(ids => { const box = document.createElement('div'); box.id = 'dmo-test'; box.style.width = '760px'; box.innerHTML = Object.values(ids).map(id => window.LCNDA_EXT.diagramEmbedHtml(id)).join(''); document.body.prepend(box); }, ids);
            await p.waitForFunction(n => document.querySelectorAll('#dmo-test .h-dg-svg svg').length === n && document.querySelector('#dmo-test .dgm-b'), ALL.length, { timeout: 20000 });
            // accordéon posé : plier sans éditeur
            const h0 = await p.$eval('#dmo-test [data-acc]', g => g.ownerSVGElement.getAttribute('height'));
            await p.$eval('#dmo-test [data-acc] [data-acc-t]', e => e.dispatchEvent(new MouseEvent('click', { bubbles: true })));
            assert.ok(Number(await p.$eval('#dmo-test [data-acc]', g => g.ownerSVGElement.getAttribute('height'))) < Number(h0), 'le dessin rapetisse');
            // une case du quadrillage, rattachée à une personne : la fiche s'ouvre
            const pid = await p.evaluate(async () => { const r = await window.LCNDA_APP.api('diagram_genea', { what: 'fan', gens: 3 }); return r.rows[1].id; });
            await p.evaluate(pid => { const svg = window.LCNDA_EXT.diagramRender.svg({ kind: 'ancestorgrid', rows: [{ sosa: 1, name: 'Moi' }, { sosa: 2, name: 'Père', pid }] }, 600); const d = document.createElement('div'); d.id = 'dmo-grid'; d.innerHTML = svg; document.body.prepend(d); }, pid);
            await p.$eval('#dmo-grid [data-dmo-slot="2"]', e => e.dispatchEvent(new MouseEvent('click', { bubbles: true })));
            await p.waitForFunction(pid => window.LCNDA_APP.state.currentPersonId === pid && window.LCNDA_APP.state.module === 'personnes', pid, { timeout: 8000 });
            assert.equal(await p.evaluate(() => window.__xss), undefined, 'aucun nom piégé exécuté');
            await p.evaluate(() => { document.getElementById('dmo-test')?.remove(); document.getElementById('dmo-grid')?.remove(); });
        });
        await t('mode sombre : les dessins restent sur fond clair', async () => {
            await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
            await openKind(p, 'violin'); assert.equal(await p.$eval('.h-dg-dlg [data-dg-preview] svg > rect', r => r.getAttribute('fill')), '#ffffff');
            await openKind(p, 'alivepyr'); await p.waitForSelector('.h-dg-dlg .dmo-tools'); await shot(p, 'sombre-alivepyr');
            await closeEditor(p); await p.evaluate(() => document.documentElement.removeAttribute('data-theme'));
        });
        await t('390 px de large : l’éditeur ne déborde pas', async () => {
            const m = await ctx.newPage(); await m.setViewportSize({ width: 390, height: 844 }); watch(m); await ready(m);
            for (const k of ['genbars', 'kinmatrix', 'chord', 'alivepyr']) {
                await m.evaluate(k => { document.querySelectorAll('.h-dg-dlg').forEach(d => { d.close(); d.remove(); }); window.LCNDA_EXT.openDiagramEditor(null, { kind: k }); }, k);
                await m.waitForSelector('.h-dg-dlg [data-dg-preview] svg');
                const w = await m.evaluate(() => ({ doc: document.documentElement.scrollWidth, svg: document.querySelector('.h-dg-dlg [data-dg-preview] svg').getBoundingClientRect().right }));
                assert.ok(w.doc <= 391 && w.svg <= 391, `${k} : ${JSON.stringify(w)}`);
            }
            await m.close();
        });
        await t('aucune erreur JavaScript', async () => assert.deepEqual(errors, []));
    } finally { await browser.close(); proc.kill(); fs.rmSync(tmp, { recursive: true, force: true }); }
    process.exit(failed ? 1 : 0);
})();
