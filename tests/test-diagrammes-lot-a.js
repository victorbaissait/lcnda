'use strict';
/**
 * 📊 Diagrammes, lot A : 🛡️ tableau de quartiers, 🌿 arbre des variantes d'un nom (assets/js/heritage-diagram-lot-a.js) et ce qui
 * s'ajoute aux types existants : boucles d'implexe et coefficient (Chemin de parenté, app-diagram-plus-core.js : inbreeding),
 * double éventail (Sablier), réseau « toute la famille », Venn de 2 à 8 ensembles en barres croisées, cercles de parenté
 * (accordéon), dates incertaines (frises), pyramide d'un recensement, tableau périodique (quadrillage), nœud papillon (arbre décoratif).
 *     node tests/test-diagrammes-lot-a.js        (LOTA_SHOTS=<dossier> pour les captures)
 * 1. Sans navigateur : chaque type et réglage se dessine (900 et 390 px) sans NaN ; vide et lignes abîmées : un message ;
 *    textes et couleurs piégés échappés ; le coefficient de Wright (cousins germains = 1/16) ; les dates incertaines ;
 *    les textes i18n() traduits dans les 31 langues.
 * 2. Serveur (tests/fixtures/diagram-lot-a-seed.php) : quartiers et armoiries, variantes, toute la famille, implexe biologique,
 *    recensements, croisement des sources ; groupe de personnes et critères combinés ; valeurs piégées refusées.
 * 3. Navigateur : chaque panneau « Depuis l'app » remplit le tableau, le tableau reste modifiable (la correction à la main
 *    n'est pas écrasée), 390 px et mode sombre sans débordement ; aucune erreur JS.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {spawn, spawnSync} = require('node:child_process');

const root = path.resolve(__dirname, '..');
let failed = 0, n = 0;
const steps = [];
const step = (name, fn) => steps.push([name, fn]);
const TRAP = '<img src=x onerror="window.__xss=1">\'"&';
const BAD = /NaN|undefined|Infinity|Dessin impossible/;

/* ── 1. Bac à sable ── */
const ctx2d = {font: '', measureText: t => ({width: String(t).length * 55})};
const sb = {window: {}, console, setTimeout, clearTimeout, performance, Intl, MutationObserver: class { observe() {} }, CSS: {escape: s => s},
    document: {documentElement: {}, querySelectorAll: () => [], addEventListener() {}, createElement: () => ({getContext: () => ctx2d})}};
sb.window.LCNDA_APP = {state: {bootstrap: {startPersonId: 1}}, plural: (k, one, many) => `${k} ${k < 2 ? one : many}`};
vm.createContext(sb);
for (const f of ['heritage-diagrams-render.js', 'heritage-diagram-options.js', 'heritage-diagram-genea.js', 'heritage-diagram-more.js', 'heritage-diagram-nouveaux.js', 'app-diagram-plus-core.js', 'heritage-diagram-plus.js', 'heritage-vector-tree.js', 'heritage-diagram-lot-a.js'])
    vm.runInContext(fs.readFileSync(path.join(root, 'assets/js', f), 'utf8'), sb, {filename: f});
const ext = sb.window.LCNDA_EXT, R = ext.diagramRender, L = ext.diagramLotA, P = sb.window.LCNDA_DIAGPLUS, G = ext.diagramGenea;
const draw = (spec, W = 900) => R.svg(spec, W);
const variantsOf = () => [ // [nom, spec] : chaque type et réglage du lot
    ['quarters', {kind: 'quarters', ...R.KINDS.quarters.sample()}], ['quarters 8 masqué sobre', {kind: 'quarters', ...R.KINDS.quarters.sample(), o: {count: 8, missing: 'hide', notes: false}}],
    ['namevariants', {kind: 'namevariants', ...R.KINDS.namevariants.sample()}], ['namevariants sans deviner, une couleur', {kind: 'namevariants', ...R.KINDS.namevariants.sample(), o: {guess: false, thick: false, colorBy: 'one', sources: true}}],
    ['implexe', {kind: 'dplkin', ...L.sampleLoops()}], ['implexe le plus proche', {kind: 'dplkin', ...L.sampleLoops(), o: {...L.sampleLoops().o, closest: true, calc: false, fraction: false}}],
    ['sablier deux éventails', {kind: 'hourglass', ...R.KINDS.hourglass.sample(), o: {shape: 'fans'}}], ['sablier éventails génération', {kind: 'hourglass', ...R.KINDS.hourglass.sample(), o: {shape: 'fans', fanColor: 'gen', fanSize: 'equal'}}],
    ['réseau sorte écrite', {kind: 'network', ...R.KINDS.network.sample(), o: {edgeLabels: true}}],
    ['venn 6 en barres croisées', {kind: 'venn', sets: 'ABCDEF'.split('').map(x => ({name: 'Source ' + x})), rows: G.ZONES(6).map((z, i) => ({region: z, value: String((i * 7) % 13), ids: i % 3 ? '' : '1,2'}))}],
    ['venn 3 en barres croisées', {kind: 'venn', ...R.KINDS.venn.sample(), o: {shape: 'upset', upsetSort: 'degree', barColors: true}}],
    ['accordéon en cercles', {kind: 'accordion', ...R.KINDS.accordion.sample(), o: {layout: 'circles'}}], ['cercles branche, survol', {kind: 'accordion', ...R.KINDS.accordion.sample(), o: {layout: 'circles', circColor: 'branch', circNames: 'hover', degMax: 4}}],
    ['quadrillage périodique', {kind: 'ancestorgrid', ...R.KINDS.ancestorgrid.sample(), o: {layout: 'periodic', gens: 6}}], ['périodique nom', {kind: 'ancestorgrid', ...R.KINDS.ancestorgrid.sample(), o: {layout: 'periodic', symbol: 'last', pDates: false}}],
    ['arbre en frise incertain', {kind: 'genbars', ...R.KINDS.genbars.sample(), rows: [{sosa: 1, name: 'A', start: 'vers 1850', end: 'avant 1910'}, {sosa: 2, name: 'B', start: '12 mai 1820', end: 'entre 1870 et 1880'}], o: {uncertain: true, uncStyle: 'dash'}}],
    ['frise des membres incertaine', {kind: 'timeline', rows: [{name: 'Paul', roles: 'Chant', start: 'vers 1978', end: 'avant 1990'}, {name: 'Léa', start: '12 mai 1980', end: 'entre 1999 et 2003'}], o: {uncertain: true}}],
    ['frise chronologique incertaine', {kind: 'chrono', rows: [{date: 'vers 1792', label: 'a'}, {date: '12 mai 1815', label: 'b'}, {date: 'avant 1850', label: 'c'}], o: {uncertain: true}}],
    ['pyramide d’un recensement', {kind: 'alivepyr', rows: Array.from({length: 120}, (_, i) => ({name: 'P' + i, sex: i % 3 ? 'h' : 'f', age: String((i * 7) % 90), census: i < 70 ? '1851' : '1856', family: i % 9 ? '' : 'oui'})), o: {pyrSrc: 'census', year: 1851, year2: 1856, place: 'Bort'}}],
];
step('les deux nouveaux types au catalogue : icône, groupe, aide, tableau, réglages, exemple, « Depuis l’app »', () => {
    assert.deepEqual([...L.KINDS], ['quarters', 'namevariants']);
    for (const k of L.KINDS) { const K = R.KINDS[k]; assert.ok(K.icon && K.label && K.group === 'Généalogie' && K.help && K.grids[0].cols.length >= 5 && K.options.length >= 6 && K.fromApp?.html && K.fromApp?.bind, k); }
    // les réglages ajoutés aux types existants, sans nouveau type
    const has = (k, o) => assert.ok(R.KINDS[k].options.some(x => x.k === o), `${k} : ${o}`);
    has('hourglass', 'shape'); has('hourglass', 'fanSize'); has('hourglass', 'fanColor'); has('hourglass', 'emptyCells'); has('network', 'edgeLabels'); has('venn', 'shape'); has('venn', 'top');
    has('accordion', 'layout'); has('accordion', 'degMax'); has('ancestorgrid', 'symbol'); has('genbars', 'uncertain'); has('timeline', 'uncertain'); has('chrono', 'uncertain'); has('alivepyr', 'pyrSrc'); has('alivepyr', 'year2'); has('dplkin', 'view');
    assert.ok(R.KINDS.dplkin.grids.some(g => g.key === 'loops'), 'boucles : un tableau modifiable');
    assert.ok(ext.decorTreeInternals.SHAPES.some(s => s[0] === 'bowtie'), 'arbre décoratif : nœud papillon');
    for (const k of ['hourglass', 'alivepyr', 'accordion']) assert.ok(R.KINDS[k].grids[0].cols.length >= 5, k);
});
step('chaque type et réglage se dessine à 900 et 390 px, sans NaN', () => {
    for (const [name, spec] of variantsOf()) for (const W of [900, 390]) { const s = draw(spec, W); assert.match(s, /^<svg /, name); assert.doesNotMatch(s, BAD, `${name} ${W}`); assert.ok(s.length > 1200, `${name} ${W} : ${s.length}`); }
});
step('vide, lignes abîmées, réglages absurdes : un message, jamais d’erreur', () => {
    for (const k of ['quarters', 'namevariants']) for (const spec of [{kind: k}, {kind: k, rows: [null, 'x', 4, [], {}, {form: {}, sosa: 'x', from: 'abc', count: 'NaN'}], o: null}, {kind: k, rows: [{form: 'a', from: 1e308, to: -1e308, count: 1e308, sosa: 1e308, name: 'a'}], o: {count: 99, rowHeight: -5, lineWidth: 1e9, height: -3}}])
        assert.doesNotMatch(draw(spec, 400), BAD, `${k} ${JSON.stringify(spec).slice(0, 80)}`);
    assert.doesNotMatch(draw({kind: 'dplkin', o: {view: 'loops'}, loops: [{anc: 'A', fside: '', mside: '', fa: 'x'}]}, 400), BAD);
    assert.doesNotMatch(draw({kind: 'hourglass', rows: [{name: 'x', gen: 0}, {name: 'y', gen: -9, sosa: 'z'}, {name: 'z', gen: 3, parent: 'nobody'}], o: {shape: 'fans', fanColor: 'value'}}, 400), BAD);
    assert.doesNotMatch(draw({kind: 'venn', sets: Array.from({length: 12}, (_, i) => ({name: 'S' + i})), rows: [{region: 'AZQ', value: '-3'}, {region: '', value: 'abc'}]}, 400), BAD);
    assert.doesNotMatch(draw({kind: 'alivepyr', rows: [{age: '-4', census: 'x'}, {age: '999', census: '1851'}], o: {pyrSrc: 'census'}}, 400), BAD);
});
step('textes, couleurs et images piégés : échappés, refusés', () => {
    const t = s => assert.doesNotMatch(s, /<img|<script|onerror="|javascript:|url\(javascript|expression\(/, s.slice(0, 200));
    t(draw({kind: 'quarters', rows: Array.from({length: 16}, (_, i) => ({sosa: 16 + i, name: TRAP, coat: TRAP, blazon: TRAP + ' d’azur', img: i % 2 ? 'javascript:alert(1)' : 'media/../../etc/passwd', color: '"><script>'})), o: {title: TRAP}}));
    t(draw({kind: 'namevariants', rows: [{form: TRAP, from: '1700', parent: TRAP, source: TRAP, color: 'url(javascript:x)'}, {form: TRAP + '2', from: '1750'}], o: {sources: true}}));
    t(draw({kind: 'dplkin', o: {view: 'loops', person: TRAP, father: TRAP, mother: TRAP, ancColor: 'expression(1)'}, loops: [{anc: TRAP, fside: `${TRAP} > b`, mside: TRAP}]}));
    t(draw({kind: 'hourglass', rows: [{name: TRAP, gen: 0}, {name: TRAP, gen: -1, sosa: 2}, {name: TRAP, gen: 1, parent: TRAP}], o: {shape: 'fans', upColor: 'javascript:x'}}));
    t(draw({kind: 'venn', sets: Array.from({length: 6}, () => ({name: TRAP})), rows: [{region: 'AB', value: '3', ids: '1,"><x'}]}));
    t(draw({kind: 'accordion', rows: [{name: TRAP, degree: 0}, {name: TRAP + 'b', parent: TRAP, degree: 2, kin: TRAP}], o: {layout: 'circles', circNames: 'written'}}));
    t(draw({kind: 'alivepyr', rows: [{name: TRAP, age: '30', census: '1851', sex: 'f', family: 'oui'}], o: {pyrSrc: 'census', place: TRAP}}));
    const q = draw({kind: 'quarters', rows: [{sosa: 8, name: 'A', img: 'media/coat_1.png'}]}); assert.match(q, /href="media\/coat_1\.png"/, 'une image de media/ est gardée');
});
step('le coefficient de Wright : enfant de cousins germains = 1/16, de frère et sœur = 1/4 ; l’ancêtre lui-même consanguin compte', () => {
    const g = {10: {s: 'h'}, 11: {s: 'f'}, 20: {p: [10, 11], s: 'h'}, 21: {p: [10, 11], s: 'f'}, 30: {s: 'f'}, 31: {s: 'h'}, 40: {p: [20, 30], s: 'h'}, 41: {p: [31, 21], s: 'f'}, 50: {p: [40, 41]}};
    const r = P.inbreeding(g, 50); assert.equal(r.F, 1 / 16); assert.equal(r.loops.length, 2); assert.equal(r.father, 40); assert.equal(r.mother, 41);
    assert.deepEqual([...r.loops[0].up], [40, 20]); assert.equal(P.fraction(r.loops.map(l => l.n1 + l.n2 + 1)).text, '1/16');
    assert.equal(P.inbreeding({1: {s: 'h'}, 2: {s: 'f'}, 3: {p: [1, 2], s: 'h'}, 4: {p: [1, 2], s: 'f'}, 5: {p: [3, 4]}}, 5).F, .25);
    assert.equal(P.inbreeding({1: {}, 2: {p: [1]}}, 2).F, 0, 'un seul parent : 0');
    // l'ancêtre commun lui-même enfant de frère et sœur : sa part compte (1 + F_A)
    const h = {1: {s: 'h'}, 2: {s: 'f'}, 3: {p: [1, 2], s: 'h'}, 4: {p: [1, 2], s: 'f'}, 5: {p: [3, 4], s: 'h'}, 6: {s: 'f'}, 7: {p: [5, 6], s: 'h'}, 8: {p: [5, 6], s: 'f'}, 9: {p: [7, 8]}};
    assert.ok(Math.abs(P.inbreeding(h, 9).F - (.25 * 1.25 + .125 * 0)) < 1e-9 || P.inbreeding(h, 9).F > .25, 'F_A compté');
    assert.equal(P.fraction([5, 7]).text, '5/128');
});
step('les dates incertaines : vers, avant, après, entre, mois, année, jour exact, calendrier républicain', () => {
    const d = (t, a) => G.dateRange(t, a);
    assert.deepEqual([d('vers 1745', 5).lo, d('vers 1745', 5).hi], [1740.5, 1750.5]); assert.equal(d('avant 1760').hi, 1760); assert.equal(d('après 1760').lo, 1761);
    assert.deepEqual([d('entre 1740 et 1745').lo, d('entre 1740 et 1745').hi], [1740, 1746]); assert.equal(d('1745').hi - d('1745').lo, 1); assert.ok(d('mai 1745').hi - d('mai 1745').lo < .1);
    assert.equal(d('12 mai 1745').exact, true); assert.equal(d('12 thermidor an II').exact, true); assert.equal(d('vers 1745', 10).hi, 1755.5); assert.equal(d('n’importe'), null);
    const s = draw({kind: 'genbars', rows: [{sosa: 1, name: 'A', start: 'vers 1850', end: '1900'}], o: {uncertain: true}}); assert.match(s, /linearGradient/, 'la fourchette en dégradé');
    assert.doesNotMatch(draw({kind: 'genbars', rows: [{sosa: 1, name: 'A', start: '1850', end: '1900'}], o: {uncertain: true}}), /stop-opacity="0"/, 'une année seule n’est pas incertaine');
});
step('le nœud papillon : le père à gauche, la mère à droite, les ancêtres à leur place', async () => {
    const tree = s => ({person: {id: s, first_name: 'P' + s, last_name: 'LACOMBE', gender: s % 2 ? 'female' : 'male', birth_year: 1900 - s}, children: s < 16 ? [tree(2 * s), tree(2 * s + 1)] : []});
    sb.window.LCNDA_APP.api = async () => ({tree: tree(1)});
    const doc = await ext.decorTreeInternals.build({person: 1, shape: 'bowtie', gens: 5, format: 'a3', orient: 'land', theme: 'classique', colors: 'branch', dates: true, empty: true, genLabels: true, title: 'Test'});
    const groups = doc.objs.find(l => l.name === 'Ancêtres').children, box = s => groups.find(g => g.name.startsWith(s + '. ')).children[0];
    assert.equal(groups.length, 31); assert.ok(box(2).x < box(1).x && box(3).x > box(1).x, 'père à gauche, mère à droite');
    assert.ok(box(4).x < box(2).x && box(6).x > box(3).x, 'grands-parents plus loin'); assert.ok(box(16).x >= 0 && box(31).x + box(31).w <= doc.w, 'dans la page');
    assert.doesNotMatch(JSON.stringify(doc), /NaN|null,"y"/);
});
step('les textes passés à i18n() dans les fichiers du lot sont traduits dans les 31 langues', () => {
    const X = require('../scripts/i18n-extract.js');
    const files = ['heritage-diagram-lot-a.js'].map(f => path.join(root, 'assets/js', f));
    const langs = ['en', 'es', 'de', 'it', 'pt', 'pl', 'nl', 'cs', 'sv', 'da', 'sk', 'nb', 'ro', 'fi', 'hu', 'hr', 'sl', 'lt', 'lv', 'et', 'is', 'tr', 'lb', 'sq', 'mt', 'vi', 'id', 'ru', 'uk', 'el', 'bg'];
    for (const l of langs) { const dict = X.loadDict(l), miss = []; for (const f of files) X.tCalls(f).forEach(x => { if (/^[a-z_0-9.]+$/.test(x.text)) return; if (!X.translated(dict, x.text, x.ctx)) miss.push(`${path.basename(f)}:${x.line} ${x.text}`); }); assert.deepEqual(miss, [], `${l} : ${miss.join('\n')}`); }
    for (const d of ['', 'nord', 'nord2', 'nord3', 'nord4', 'nord5', 'nord6', 'nord7', 'nord8', 'nord9', 'nord10', 'nord11', 'nord12', 'nord13']) assert.ok(fs.existsSync(path.join(root, 'assets/i18n/src', d, 'diagrammes-lot-a.tsv')), d);
    for (const l of langs) assert.ok(fs.existsSync(path.join(root, 'assets/i18n/faq/src', l, 'diagrammes-lot-a.tsv')), 'FAQ ' + l);
});

/* ── 2. et 3. Serveur et navigateur ── */
let chromium = null;
for (const p of ['playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright']) { try { ({chromium} = require(p)); break; } catch (_) { chromium = null; } }
const php = spawnSync('php', ['-v'], {encoding: 'utf8'}).status === 0 ? 'php' : null;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-lota-'));
const envFor = d => ({...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1'});
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
const SHOTS = process.env.LOTA_SHOTS || '';
const freePort = () => new Promise(res => { const s = require('node:net').createServer(); s.listen(0, '127.0.0.1', () => { const q = s.address().port; s.close(() => res(q)); }); });
const qs = o => Object.entries(o).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

(async () => {
    for (const [name, fn] of steps) { try { await fn(); n++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } }
    if (!php) { console.log('— serveur et navigateur : PHP absent, partie sautée'); process.exit(failed ? 1 : 0); }
    const dir = path.join(tmp, 'a'); fs.mkdirSync(path.join(dir, 'media'), {recursive: true});
    const sd = spawnSync(php, [path.join(root, 'tests/fixtures/diagram-lot-a-seed.php')], {cwd: root, encoding: 'utf8', env: envFor(dir)});
    const m = /^ok lot-a (.+)$/m.exec(sd.stdout || ''); if (sd.status !== 0 || !m) { console.error(sd.stderr || sd.stdout); process.exit(1); }
    const S = JSON.parse(m[1]);
    const port = await freePort(), base = `http://127.0.0.1:${port}/`;
    const proc = spawn(php, ['-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env: envFor(dir), stdio: 'ignore'});
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const t = async (name, fn) => { try { await fn(); n++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
    const get = async q => { const r = await fetch(`${base}api.php?action=diagram_lot_a&${qs(q)}`); const j = await r.json(); return {status: r.status, ...j}; };
    let browser = null;
    try {
        await t('serveur : les quartiers (8) de Marie, Pierre LACOMBE deux fois (implexe) avec ses armoiries', async () => {
            const r = await get({what: 'quarters', root: S.marie, gens: 3}); assert.equal(r.rows.length, 8); assert.equal(r.root_name, 'Marie LACOMBE');
            const p = r.rows.filter(x => x.name === 'Pierre LACOMBE'); assert.deepEqual(p.map(x => x.sosa), [8, 14]); assert.equal(p[0].coat, 'Lacombe'); assert.match(p[0].blazon, /azur/);
            assert.equal(r.with_coat, 2); assert.equal(r.found, 4);
            const r16 = await get({what: 'quarters', root: S.marie, gens: 4}); assert.equal(r16.rows.length, 16);
            assert.equal((await get({what: 'quarters', root: S.marie, gens: 'x'})).status, 422);
        });
        await t('serveur : les variantes du groupe Lacombe (formes, années, actes, source) ; le groupe de personnes restreint', async () => {
            const g = await get({what: 'name_groups'}); assert.ok(g.groups.some(x => x.name === 'Lacombe' && x.n === 5));
            const r = await get({what: 'variants', group: S.grp}); const f = Object.fromEntries(r.rows.map(x => [x.form, x]));
            assert.ok(f['La Combe'] && f.Lacoumbe && f.LACOMBE, JSON.stringify(r.rows)); assert.equal(f.Lacoumbe.from, '1725'); assert.equal(f.Lacoumbe.to, '1740'); assert.equal(f['La Combe'].source, 'Registres de Bort');
            const byName = await get({what: 'variants', name: 'lacombe'}); assert.ok(byName.rows.length >= 3);
            const one = await get({what: 'variants', group: S.grp, dg_pop: 'people', dg_ids: String(S.leonard)}); assert.deepEqual(one.rows.map(x => x.form).sort(), ['LACOMBE', 'Lacoumbe'], 'seulement Léonard');
            const births = await get({what: 'variants', group: S.grp, events: 'BIRT', dg_from: 1750, dg_to: 1800}); assert.ok(births.rows.find(x => x.form === 'LACOMBE').count >= 2);
            assert.equal((await get({what: 'variants'})).status, 422); assert.equal((await get({what: 'variants', group: S.grp, events: 'zzz'})).status, 422);
        });
        await t('serveur : toute la famille, un point par couple (liens = enfants) ou par personne ; critères combinés', async () => {
            const r = await get({what: 'familygraph'}); assert.ok(r.links.some(l => l.kind === 'Catherine LACOMBE' && /Pierre LACOMBE × Jeanne ESTRADE/.test(l.a)), JSON.stringify(r.links));
            const c = await get({what: 'familygraph', color: 'century'}); assert.ok(c.nodes.some(x => /18/.test(x.group)));
            const p = await get({what: 'familygraph', points: 'persons'}); assert.ok(p.links.some(l => l.kind === 'époux') && p.links.some(l => l.kind === 'enfant'));
            const rules = await get({what: 'familygraph', rules: JSON.stringify([{field: 'gender', value: 'female'}])}); assert.ok(rules.nodes.length >= 1 && rules.nodes.length <= r.nodes.length);
            assert.equal((await get({what: 'familygraph', rules: '{"a":'})).status, 422); assert.equal((await get({what: 'familygraph', points: 'x'})).status, 422);
        });
        await t('serveur : l’ascendance biologique (l’adopté n’a pas de parents) → F = 1/16 pour Marie', async () => {
            const r = await get({what: 'implexe', root: S.marie}); const res = P.inbreeding(P.normGraph(r.nodes), S.marie); assert.equal(res.F, 1 / 16); assert.equal(res.loops.length, 2);
            const a = await get({what: 'implexe', root: S.paul}); assert.deepEqual([...a.nodes[S.paul].p], [], 'adoption : pas dans le calcul');
        });
        await t('serveur : les recensements de Bort (âges « 30 ans », « 6 mois » ; « âgé » écarté ; sexe deviné ; la famille reliée)', async () => {
            const l = await get({what: 'census_list'}); assert.deepEqual(l.items.map(x => [x.place, x.year, x.n]), [['Bort', 1851, 5], ['Bort', 1856, 2]]);
            const r = await get({what: 'census_pyr', place: S.bort, year: 1851, year2: 1856}); assert.equal(r.skipped, 1); assert.equal(r.rows.length, 6);
            const rose = r.rows.find(x => x.name === 'Rose FAURIE' && x.census === '1851'); assert.equal(rose.sex, 'f'); assert.equal(rose.age, '30');
            assert.equal(r.rows.find(x => x.name === 'Louis FAURIE' && x.census === '1851').age, '0.5'); assert.equal(r.rows.find(x => x.name === 'Jean LACOMBE').family, 'oui');
            const g = await get({what: 'census_pyr', place: S.bort, year: 1851, dg_pop: 'people', dg_ids: String(S.marie)}); assert.equal(g.rows.find(x => x.name === 'Jean LACOMBE').family, '', 'famille = le groupe choisi');
            assert.equal((await get({what: 'census_pyr', place: S.bort})).status, 422);
        });
        await t('serveur : croisement des sources (5 ensembles), les personnes de chaque combinaison', async () => {
            const s = await get({what: 'sets_more'}); assert.ok(['census', 'notary', 'military', 'anysource', 'source:' + S.src].every(k => s.sets.some(x => x.key === k)));
            const r = await get({what: 'upset', keys: 'census,anysource,sosa,male,female', root: S.marie}); assert.equal(r.keys.length, 5); assert.equal(r.regions.ABCD, 1); assert.equal(r.ids.ABCD, String(S.jean));
            assert.equal((await get({what: 'upset', keys: 'census'})).status, 422); assert.equal((await get({what: 'upset', keys: 'census,x;drop'})).status, 422); assert.equal((await get({what: 'rien'})).status, 422);
        });
        if (!chromium) { console.log('— navigateur : Playwright absent, partie sautée'); return; }
        browser = await chromium.launch(exe ? {executablePath: exe} : {});
        const errors = [];
        const watch = p => { p.on('pageerror', e => errors.push(e.message)); p.on('console', msg => { if (msg.type() === 'error' && !/favicon|Failed to load resource/.test(msg.text())) errors.push(msg.text()); }); };
        const shot = async (p, name, sel = '.h-dg-dlg [data-dg-preview]') => { if (!SHOTS) return; fs.mkdirSync(SHOTS, {recursive: true}); const el = await p.$(sel); await (el || p).screenshot({path: path.join(SHOTS, 'lota-' + name + '.png')}); };
        const open = async (p, k) => { await p.evaluate(() => document.querySelectorAll('.h-dg-dlg').forEach(d => { if (d.open) d.close(); d.remove(); })); await p.evaluate(k => window.LCNDA_EXT.openDiagramEditor(null, {kind: k}), k); await p.waitForSelector('.h-dg-dlg [data-dg-preview] svg'); };
        const preview = p => p.$eval('.h-dg-dlg [data-dg-preview] svg', s => s.outerHTML);
        const ctx = await browser.newContext({viewport: {width: 1360, height: 950}, deviceScaleFactor: 1});
        const p = await ctx.newPage(); watch(p);
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.bootstrap && window.LCNDA_EXT?.openDiagramEditor && window.LCNDA_EXT?.diagramLotA && window.LCNDA_EXT?.diagramRender?.KINDS?.dplkin?.__dla, null, {timeout: 20000});
        await p.waitForTimeout(500);
        // « Depuis l'app » : le panneau, le bouton, le tableau rempli
        const fill = async (k, sel, prep = null) => {
            await open(p, k); await shot(p, `exemple-${k}${sel === '[data-dla-go]' ? '' : '-' + sel.replace(/\W/g, '')}`);
            await p.click('.h-dg-dlg [data-dg-tab="app"]'); await p.waitForSelector(`.h-dg-dlg ${sel}`);
            if (prep) await prep();
            await p.click(`.h-dg-dlg ${sel}`);
            await p.waitForFunction(() => document.querySelector('.h-dg-dlg [data-dg-tab="data"]')?.classList.contains('is-active') || /⚠️/.test([...document.querySelectorAll('.h-dg-dlg [data-dla-msg], .h-dg-dlg [data-gn-msg], .h-dg-dlg [data-dm-msg], .h-dg-dlg [data-n6-msg], .h-dg-dlg [data-dpl-msg]')].map(e => e.textContent).join(' ')), null, {timeout: 15000});
            const msg = await p.$$eval('.h-dg-dlg [data-dla-msg], .h-dg-dlg [data-gn-msg], .h-dg-dlg [data-dm-msg], .h-dg-dlg [data-n6-msg]', l => l.map(e => e.textContent).join(' ')); assert.doesNotMatch(msg, /⚠️/, `${k} : ${msg}`);
            await p.waitForTimeout(300);
        };
        const rowsIn = gi => p.evaluate(gi => document.querySelectorAll(`.h-dg-dlg [data-grid="${gi}"] tbody tr`).length, gi);
        await t('navigateur : 🛡️ quartiers depuis la base, puis une correction à la main qui reste (rien n’est écrasé)', async () => {
            await fill('quarters', '[data-dla-go]', () => p.selectOption('.h-dg-dlg [data-dla="gens"]', '3'));
            assert.equal(await rowsIn(0), 8); const s = await preview(p); assert.match(s, /Pierre LACOMBE/); assert.doesNotMatch(s, BAD); await shot(p, 'base-quarters');
            const inp = '.h-dg-dlg [data-grid="0"] input[data-r="1"][data-k="name"]'; await p.fill(inp, 'Jeanne ESTRADE-CORRIGÉE'); await p.$eval(inp, e => e.dispatchEvent(new Event('change', {bubbles: true})));
            await p.waitForTimeout(600); assert.match(await preview(p), /CORRIGÉE/, 'la correction se voit');
            await p.click('.h-dg-dlg [data-dg-tab="opts"]'); await p.click('.h-dg-dlg [data-dg-tab="data"]'); assert.equal(await p.$eval(inp, e => e.value), 'Jeanne ESTRADE-CORRIGÉE', 'et reste dans le tableau');
        });
        await t('navigateur : 🌿 variantes du groupe Lacombe (avec le bloc groupe / période / ＋ Critère)', async () => {
            await fill('namevariants', '[data-dla-go]', async () => { await p.waitForFunction(() => document.querySelector('.h-dg-dlg [data-dla="group"] option[value^="g"]')); await p.selectOption('.h-dg-dlg [data-dla="group"]', {index: 1}); assert.ok(await p.$('.h-dg-dlg [data-dla-crit] [data-dgo-row="rules"]'), 'critères combinés'); });
            assert.ok(await rowsIn(0) >= 3); assert.match(await preview(p), /Lacoumbe/); await shot(p, 'base-namevariants');
        });
        await t('navigateur : 🔁 boucles d’implexe de Marie (Chemin de parenté) : F = 1/16', async () => {
            await fill('dplkin', '.dla-app [data-dla-go]');
            const s = await preview(p); assert.match(s, /1\/16/); assert.match(s, /Pierre LACOMBE/); assert.doesNotMatch(s, BAD); await shot(p, 'base-implexe');
        });
        await t('navigateur : ⏳ sablier en deux éventails depuis la base', async () => {
            await fill('hourglass', '[data-n6-go]', () => p.selectOption('.h-dg-dlg [data-n6="shape"]', 'fans'));
            const s = await preview(p); assert.match(s, /<path d="M[^"]+A/); assert.match(s, /Léonard LACOMBE/); await shot(p, 'base-sablier-eventails');
        });
        await t('navigateur : 🕸 réseau « toute la famille, un point par couple »', async () => {
            await fill('network', '[data-gn-go]', () => p.selectOption('.h-dg-dlg [data-gn="src"]', 'family'));
            assert.ok(await rowsIn(0) >= 3); assert.match(await preview(p), /Catherine LACOMBE/); await shot(p, 'base-reseau-famille');
        });
        await t('navigateur : ⭕ Venn de 5 ensembles → barres croisées, clic : la liste des personnes', async () => {
            await fill('venn', '[data-gn-go]', async () => { await p.waitForSelector('.h-dg-dlg [data-gn-sets] input[value="census"]'); for (const v of ['census', 'anysource', 'sosa', 'male', 'female']) await p.check(`.h-dg-dlg [data-gn-sets] input[value="${v}"]`); });
            const s = await preview(p); assert.match(s, /data-dfa-pids/); assert.match(s, /<circle/); await shot(p, 'base-venn-upset');
        });
        await t('navigateur : 🔺 pyramide d’un recensement (Bort 1851, comparé à 1856)', async () => {
            await fill('alivepyr', '[data-dm-go]', async () => { await p.selectOption('.h-dg-dlg [data-dm="psrc"]', 'census'); await p.waitForFunction(() => document.querySelector('.h-dg-dlg [data-dm="census"] option[value="0"]')); await p.selectOption('.h-dg-dlg [data-dm="census"]', '0'); await p.selectOption('.h-dg-dlg [data-dm="census2"]', {index: 1}); });
            const s = await preview(p); assert.match(s, /Bort/); assert.match(s, /stroke-dasharray="3 2"/); await shot(p, 'base-pyramide-recensement');
        });
        await t('navigateur : cercles de parenté, tableau périodique, dates incertaines (réglages)', async () => {
            const v = await ctx.newPage();
            for (const [k, o, name] of [['accordion', {layout: 'circles'}, 'cercles'], ['ancestorgrid', {layout: 'periodic'}, 'periodique'], ['genbars', {uncertain: true}, 'frise-incertaine']]) {
                const s = await p.evaluate(([k, o]) => { const R = window.LCNDA_EXT.diagramRender, sp = R.KINDS[k].sample(); if (k === 'genbars') sp.rows[2].start = 'vers ' + sp.rows[2].start; return R.svg({kind: k, ...sp, o: {...sp.o, ...o}}, 900); }, [k, o]);
                assert.doesNotMatch(s, BAD, k); assert.ok(s.length > 2000, k);
                if (SHOTS) { await v.setContent(`<body style="margin:10px;background:#fff;color:#1d1d1f;font-family:Arial">${s}</body>`); await (await v.$('svg')).screenshot({path: path.join(SHOTS, 'lota-' + name + '.png')}); }
            }
            await v.close();
        });
        await t('navigateur : 390 px et mode sombre, sans débordement ; aucune erreur JS', async () => {
            const c2 = await browser.newContext({viewport: {width: 390, height: 800}, deviceScaleFactor: 1, colorScheme: 'dark'}); const q = await c2.newPage(); watch(q);
            await q.goto(base); await q.waitForFunction(() => window.LCNDA_EXT?.diagramLotA && window.LCNDA_EXT?.openDiagramEditor, null, {timeout: 20000});
            for (const k of ['quarters', 'namevariants']) { await q.evaluate(k => window.LCNDA_EXT.openDiagramEditor(null, {kind: k}), k); await q.waitForSelector('.h-dg-dlg [data-dg-preview] svg');
                const over = await q.evaluate(() => { const d = document.querySelector('.h-dg-dlg'); return d.scrollWidth - d.clientWidth; }); assert.ok(over <= 2, `${k} : ${over}px de trop`);
                if (SHOTS) await q.screenshot({path: path.join(SHOTS, `lota-sombre-390-${k}.png`)});
                await q.evaluate(() => document.querySelectorAll('.h-dg-dlg').forEach(d => { if (d.open) d.close(); d.remove(); })); }
            await c2.close();
            assert.deepEqual(errors, []);
        });
    } finally { if (browser) await browser.close(); proc.kill(); console.log(`${failed ? '✗' : '✓'} diagrammes, lot A : ${n} vérifications${failed ? `, ${failed} en échec` : ''}`); process.exit(failed ? 1 : 0); }
})();
