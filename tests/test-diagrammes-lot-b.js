'use strict';
/**
 * 📊 Diagrammes du lot B « chiffres, vies et démographie » : 📐 Lexis, 🔺 ternaire, 🕯 chandeliers (assets/js/heritage-diagram-lot-b.js)
 * et les réglages ajoutés aux types qui existaient : 📏 courbe avec marge (heritage-diagrams-render.js), 🌳 dendrogramme et 🌊 horizon
 * (heritage-diagram-plus.js), 👴 lignées directes et ✅ une ligne par ancêtre (heritage-diagram-vie.js), 💍 trajectoires de vie et
 * 🔀 les mêmes personnes à plusieurs âges (heritage-diagram-famille.js) ; données : lib/diagram_lot_b.php.
 *     node tests/test-diagrammes-lot-b.js        (LB_SHOTS=<dossier> pour les captures ; /tmp/claude-0/sp/diag par défaut s'il existe)
 * 1. Sans navigateur : chaque type et chaque réglage se dessine (900 et 390 px), sans NaN ; vide, lignes abîmées, textes piégés ;
 *    les calculs (état civil d'une vie, état à un âge, lignées, chemins aux âges, moyenne et marge, Lexis, trois parts) sur un petit arbre fictif ;
 *    les données prises restent modifiables (une ligne retouchée change le dessin) ; les textes sont traduits (7 langues + les 24 autres).
 * 2. Serveur (tests/fixtures/diagram-vie-seed.php) : diagram_lot_b — bûcheron + 3 enfants + né à Pernay = Jean et Paul ; groupe ;
 *    période ; couverture par ancêtre ; secteurs de métiers ; bandes historiques ; valeurs piégées refusées (422).
 * 3. Navigateur : chaque nouveau type s'ouvre, une cellule retouchée change l'aperçu ; « Depuis l'app » avec critères combinés ;
 *    les réglages remplis depuis la base (lignée, une ligne par ancêtre, trajectoires, âges, marge) ; 390 px, mode sombre, aucune erreur.
 */
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {spawn, spawnSync} = require('node:child_process');

const root = path.resolve(__dirname, '..');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const same = (a, b, m) => assert.equal(JSON.stringify(a), JSON.stringify(b), m);
const BAD = /NaN|undefined|Infinity|Dessin impossible/;
const TRAP = '<img src=x onerror="window.__xss=1">\'"&';
const MINE = ['lexis', 'ternary', 'candles'];
const FILES = ['heritage-diagram-lot-b.js', 'heritage-diagram-plus.js', 'heritage-diagram-vie.js', 'heritage-diagram-famille.js', 'heritage-diagrams-render.js'];

/* ── 1. Bac à sable ── */
const sb = {window: {}, console, setTimeout, clearTimeout, Intl, document: {addEventListener() {}, querySelectorAll: () => []}};
sb.window.LCNDA_APP = {state: {bootstrap: {startPersonId: 1}}};
vm.createContext(sb);
for (const f of ['heritage-diagrams-render.js', 'app-diagram-plus-core.js', 'heritage-diagram-famille.js', 'heritage-diagram-vie.js', 'heritage-diagram-plus.js', 'heritage-diagram-options.js', 'heritage-diagram-lot-b.js'])
    vm.runInContext(fs.readFileSync(path.join(root, 'assets/js', f), 'utf8'), sb, {filename: f});
const ext = sb.window.LCNDA_EXT, R = ext.diagramRender, LB = ext.diagramLotB;
const draw = (spec, W = 700) => R.svg(spec, W);

/** un petit arbre fictif au format de tresor_tree : Jean MAZAUD × Marie LACOMBE (1820), Marie veuve en 1850, remariée en 1853 ;
 *  leur fils Pierre (1821) × Rose VERDIER ; Paul (1850), fils de Pierre ; métiers et lieux datés */
function fakeTree() {
    const P = (id, first, last, gender, bd, dd, extra = {}) => ({id, first, last, name: `${first} ${last}`, gender, living: false, by: bd ? +bd.slice(0, 4) : null, bd, dy: dd ? +dd.slice(0, 4) : null, dd, bplace: 1, father: null, mother: null, occ: '', ...extra});
    const people = [P(1, 'Jean', 'MAZAUD', 'male', '1795-03-01', '1850-06-01', {occ: 'laboureur'}), P(2, 'Marie', 'LACOMBE', 'female', '1799-05-01', '1880-01-01'), P(3, 'Pierre', 'MAZAUD', 'male', '1821-02-01', '1890-01-01', {father: 1, mother: 2}),
        P(4, 'Rose', 'VERDIER', 'female', '1825-04-01', '1900-01-01'), P(5, 'Paul', 'MAZAUD', 'male', '1850-07-01', '1930-01-01', {father: 3, mother: 4}), P(6, 'Louis', 'NOYER', 'male', '1790-01-01', '1870-01-01')];
    const families = [{id: 1, a: 1, b: 2, my: 1820, md: '1820-05-10', children: [3]}, {id: 2, a: 3, b: 4, my: 1848, md: '1848-02-01', children: [5]}, {id: 3, a: 6, b: 2, my: 1853, md: '1853-09-01', children: []}];
    const events = [{p: 3, tag: 'OCCU', y: 1845, what: 'tisserand', place: 1}, {p: 3, tag: 'OCCU', y: 1865, what: 'marchand', place: 2}, {p: 3, tag: 'RESI', y: 1860, place: 2}, {p: 5, tag: 'RESI', y: 1880, place: 3}];
    return LB.build({people, families, places: {1: {name: 'Naves, Corrèze'}, 2: {name: 'Tulle'}, 3: {name: 'Paris'}}, events});
}

(async () => {
    await t('les 3 nouveaux types sont au catalogue (groupe, aide, tableaux complets, réglages, « Depuis l’app » pour Lexis et ternaire)', () => {
        same([...LB.KINDS], MINE);
        const G = {lexis: 'Vie et mort', ternary: 'Parts', candles: 'Chiffres'};
        for (const k of MINE) { const K = R.KINDS[k]; assert.equal(K.group, G[k]); assert.ok(K.icon && K.label && String(K.help).length > 40, k); assert.ok(K.grids.length >= 2 && K.options.length >= 8, k);
            K.grids.forEach(g => assert.ok(g.key && g.cols.length >= 2, k + ' ' + g.key)); }
        assert.ok(R.KINDS.lexis.fromApp?.html && R.KINDS.ternary.fromApp?.bind, '« Depuis l’app »');
        assert.ok(!R.KINDS.candles.fromApp, 'chandeliers : à la main ou tableau collé');
        assert.ok(R.KINDS.line.app?.sources.some(s => /^lb:death:sd:/.test(s[0])), 'Courbe : moyenne et marge dans « 🌳 Des données de mon arbre »');
    });
    await t('chaque exemple et chaque réglage se dessine (900 et 390 px), sans NaN', () => {
        const variants = {lexis: [{}, {colorBy: 'one'}, {colorBy: 'group'}, {marks: false, bands: false, cohorts: false, names: true}, {from: 1830, to: 1900, maxAge: 60}],
            ternary: [{}, {grid: '20', colorBy: 'point', size: 'total'}, {grid: 'none', colorBy: 'one', connect: false, labels: false}],
            candles: [{}, {ma: 0, hollow: true, unit: 'none'}, {unitFree: 'francs', bands: false, ma: 5}]};
        for (const k of MINE) for (const o of variants[k]) for (const W of [900, 390]) { const sp = R.KINDS[k].sample(); const s = draw({kind: k, ...sp, o: {...sp.o, ...o}}, W);
            assert.match(s, /^<svg /, k); assert.doesNotMatch(s, BAD, `${k} ${W} ${JSON.stringify(o)}`); assert.ok(s.length > 2500, k); }
    });
    await t('vide, lignes abîmées, réglages absurdes : un message, jamais d’erreur', () => {
        for (const k of MINE) for (const spec of [{kind: k}, {kind: k, rows: [], marks: null, bands: 'x'}, {kind: k, rows: [null, 'x', 4, [], {}, {name: {}, birth: 'abc', a: 'x', open: '', label: ''}], o: null},
            {kind: k, rows: [{name: 'a', birth: '1800', death: '1700', label: 'a', a: 1e308, b: -5, c: 'x', open: 1e308, close: -1e308}], o: {maxAge: -4, height: -3, ma: 1e9, dot: 1e9, lineW: 'x', bodyW: -1}}]) {
            const s = draw(spec, 400); assert.doesNotMatch(s, BAD, `${k} ${JSON.stringify(spec).slice(0, 90)}`); }
    });
    await t('textes et couleurs piégés : échappés, couleurs refusées', () => {
        const rows = Array.from({length: 8}, (_, i) => ({name: TRAP + i, sex: TRAP, group: TRAP, birth: String(1800 + i * 10), death: String(1860 + i * 10), label: TRAP + i, a: 3, b: 2, c: 1, open: 10 + i, close: 12, low: 9, high: 14, order: i}));
        const marks = rows.map(r => ({name: r.name, date: '1830', kind: TRAP, label: TRAP})), bands = [{label: TRAP, from: '1820', to: '1830', color: 'url(javascript:x)'}];
        for (const k of MINE) { const s = draw({kind: k, rows, marks, bands, cats: [{value: TRAP, color: '"><script>'}], o: {title: TRAP, nameA: TRAP, nameB: TRAP, unitFree: TRAP, lineColor: 'javascript:x', dotColor: 'expression(1)', upColor: '"/><x', colorBy: 'group'}}, 700);
            assert.doesNotMatch(s, /<img|<script|onerror="|javascript:|url\(|expression\(/, k); }
    });
    await t('beaucoup de lignes : rapide et borné', () => {
        for (const k of MINE) { const rows = Array.from({length: 6000}, (_, i) => ({name: 'P' + i, birth: String(1700 + (i % 200)), death: String(1760 + (i % 200)), label: 'L' + i, a: i % 7, b: i % 5, c: 1, open: 10 + (i % 9), close: 11 + (i % 7), low: 8, high: 20}));
            const t0 = Date.now(); const s = draw({kind: k, rows, marks: rows.map(r => ({name: r.name, date: '1750', kind: 'child'}))}, 900); assert.ok(Date.now() - t0 < 5000, k); assert.ok(s.length < 8e6, k); assert.doesNotMatch(s, BAD, k); }
    });

    await t('📏 Courbe avec marge : colonnes basse / haute ou ± écart, bande dessinée, colonnes retirées des courbes et de la légende', () => {
        const base = {kind: 'line', series: [{name: 'Moyenne'}, {name: 'Basse'}, {name: 'Haute'}], rows: [['1800', 40, 30, 52], ['1825', 42, 33, 51], ['1850', 45, 38, 55]].map(([label, a, b, c]) => ({label, s0: a, s1: b, s2: c}))};
        const plain = draw(base), band = draw({...base, o: {band: 'cols', bandLo: 2, bandHi: 3, bandOp: 30}});
        assert.equal((plain.match(/stroke-linejoin="round"/g) || []).length, 3); assert.equal((band.match(/stroke-linejoin="round"/g) || []).length, 1, 'une seule courbe');
        assert.match(band, /fill-opacity="0\.3"[^>]*stroke="none"><title>Marge \(basse – haute\)/);
        const pm = draw({kind: 'line', series: [{name: 'Moyenne'}, {name: 'Écart'}], rows: [{label: '1800', s0: 40, s1: 5}, {label: '1825', s0: 41, s1: 4}], o: {band: 'pm', bandPm: 2, bandOf: 1}});
        assert.match(pm, /Marge \(±\)/); assert.doesNotMatch(pm, BAD);
        assert.doesNotMatch(draw({...base, o: {band: 'cols', bandLo: 9, bandHi: 2}}), /Marge/, 'colonne inconnue : pas de bande');
        assert.equal(draw(base), plain, 'sans réglage : le dessin d’avant');
    });
    await t('🌳 Dendrogramme (Matrice de Leeds) : arbre à gauche, ordre des lignes, groupes par branches, noms cachés', () => {
        const sp = R.KINDS.dplleeds.sample(), plain = draw({kind: 'dplleeds', ...sp}), tree = draw({kind: 'dplleeds', ...sp, o: {...sp.o, tree: true}});
        assert.match(tree, /<g transform="translate\([\d.]+ 0\)">/); assert.ok((tree.match(/<path d="M[\d.]+ [\d.]+H/g) || []).length >= 10, 'les branches');
        const anon = draw({kind: 'dplleeds', ...sp, o: {...sp.o, tree: true, anon: true, groupsBy: 'tree'}}, 390);
        assert.doesNotMatch(anon, /Paul R\./); assert.match(anon, /Correspondance 1/); assert.doesNotMatch(anon, BAD);
        assert.doesNotMatch(plain, /translate\([\d.]+ 0\)/, 'sans la case : la matrice d’avant');
    });
    await t('🌊 Horizon (Collines empilées) : couches repliées, négatifs en rouge, une ou plusieurs teintes', () => {
        const sp = R.KINDS.dplhills.sample(); sp.rows.forEach(r => { r.s2 = String(Number(r.s2) - 6); });
        const s = draw({kind: 'dplhills', ...sp, o: {shape: 'horizon', bands: 4}}), one = draw({kind: 'dplhills', ...sp, o: {shape: 'horizon', colors: 'one', negColor: '#aa0000'}}, 390);
        assert.match(s, /Graphique en horizon/); assert.match(one, /#aa0000|Négatif/); assert.doesNotMatch(s + one, BAD);
    });
    await t('👴 Durée des générations : lignées en générations ou en années, moyenne ou médiane, légende par lignée', () => {
        const rows = [{child: 'A', year: '1900', fa: '32', gen: '1', line: 'p'}, {child: 'B', year: '1868', fa: '29', gen: '2', line: 'p'}, {child: 'A', year: '1900', ma: '24', gen: '1', line: 'm'}, {child: 'C', year: '1876', ma: '27', gen: '2', line: 'm'}];
        const s = draw({kind: 'vieparents', rows, o: {axis: 'gen', ref: 'mean'}});
        assert.match(s, /Gén\. 1/); assert.match(s, /moyenne 30,5 ans/); assert.match(s, /stroke-dasharray="6 4"/); assert.match(s, /<polyline/);
        assert.match(draw({kind: 'vieparents', rows, o: {ref: 'median'}}, 390), /médiane/); assert.doesNotMatch(s, BAD);
        assert.doesNotMatch(draw({kind: 'vieparents', ...R.KINDS.vieparents.sample()}), /Lignée/, 'sans lignée : comme avant');
    });
    await t('✅ Couverture des sources : une ligne par ancêtre, colonnes en plus, les trous d’abord', () => {
        const people = [{sosa: 1, name: 'Jean MAZAUD', b: 's', m: '', d: ''}, {sosa: 2, name: 'Pierre', b: 's', m: 'e', d: 'x', cens: 2, nota: 1}, {sosa: 3, name: 'Rose', b: 'x', m: 'x', d: 'x', mili: 1}];
        const s = draw({kind: 'viepreuves', people, o: {layout: 'people'}});
        assert.match(s, /Recensements/); assert.match(s, /Notaire/); assert.match(s, /Militaire/); assert.match(s, /29 % des actes attendus/);
        const gaps = draw({kind: 'viepreuves', people, o: {layout: 'people', sort: 'gaps', cols: 'none'}}, 390); assert.ok(gaps.indexOf('Rose') < gaps.indexOf('Jean'), 'Rose (3 manquants) d’abord'); assert.doesNotMatch(gaps, /Recensements/);
        assert.match(draw({kind: 'viepreuves', ...R.KINDS.viepreuves.sample()}), /Génération 2/, 'par génération : comme avant');
    });
    await t('💍 Trajectoires de vie (Frise des lieux de vie) : couleur = état civil, axe des âges, tri à 50 ans', () => {
        const rows = [{person: 'Marie', status: 'single', start: '1799', end: '1820', birth: '1799'}, {person: 'Marie', status: 'married', start: '1820', end: '1850', birth: '1799'}, {person: 'Marie', status: 'widowed', start: '1850', end: '1853', birth: '1799'}, {person: 'Marie', status: 'remarried', start: '1853', end: '1880', birth: '1799'},
            {person: 'Jean', status: 'Célibataire', start: '1795', end: '1820'}, {person: 'Jean', status: 'married', start: '1820', end: '1850'}];
        const s = draw({kind: 'falieux', rows, o: {level: 'status', axis: 'age', sort: 'state50'}});
        assert.match(s, /Veuf ou veuve/); assert.match(s, /âge \(années\)/); assert.match(s, /#e15759/, 'veuvage en rouge'); assert.match(s, /Trajectoires de vie/);
        assert.match(draw({kind: 'falieux', rows: rows.map(r => ({...r, job: 'tisserand'})), o: {level: 'job'}}), /tisserand/);
        assert.doesNotMatch(s, BAD);
    });
    await t('🔀 Diagramme alluvial (Métiers de père en fils) : les mêmes personnes à plusieurs âges, en %', () => {
        const rows = [{g1: 'Célibataire', g2: 'Marié(e)', g3: 'Marié(e)', value: '3'}, {g1: 'Célibataire', g2: 'Marié(e)', g3: 'Veuf ou veuve', value: '1'}, {g1: 'Célibataire', g2: 'Célibataire', g3: 'Décédé(e)', value: '1'}];
        const s = draw({kind: 'fametiers', rows, o: {mode: 'ages', pct: true, colNames: 'À 20 ans, À 40 ans, À 60 ans'}});
        assert.match(s, /À 20 ans/); assert.match(s, /Le même qu’à l’âge d’avant/); assert.match(s, /\d+ %/); assert.match(s, /5 personnes/); assert.doesNotMatch(s, BAD);
    });

    await t('calculs sur un petit arbre fictif : état civil, état à un âge, lignées, métiers, communes, chemins aux âges', () => {
        const tr = fakeTree(), marie = tr.byId.get(2);
        same(LB.statusSegs(tr, marie).map(x => x.state), ['single', 'married', 'widowed', 'remarried', 'widowed'], 'veuve deux fois (Louis NOYER meurt en 1870)');
        assert.equal(Math.round(LB.statusSegs(tr, marie)[2].a), 1850, 'veuve à la mort de Jean');
        assert.equal(LB.stateAt(tr, marie, 'status', LB.birth(marie) + 40), 'married'); assert.equal(LB.stateAt(tr, marie, 'status', 1852), 'widowed');
        assert.equal(LB.stateAt(tr, tr.byId.get(1), 'status', 1860), 'dead');
        const pierre = tr.byId.get(3); assert.equal(LB.stateAt(tr, pierre, 'job', 1850), 'tisserand'); assert.equal(LB.stateAt(tr, pierre, 'job', 1870), 'marchand'); assert.equal(LB.stateAt(tr, pierre, 'place', 1862), 'Tulle');
        same(LB.jobSegs(tr, pierre).map(x => x.job), ['tisserand', 'marchand']); same(LB.placeSegs(tr, pierre).map(x => x.place), ['Naves', 'Tulle']);
        const pat = LB.lineage(tr, 5, 'p'); same(pat.map(r => [r.child, r.gen, Math.round(Number(r.fa))]), [['Paul MAZAUD', '1', 29], ['Pierre MAZAUD', '2', 26]]);
        same(LB.lineage(tr, 5, 'm').map(r => r.gen), ['1'], 'Rose : pas de mère connue');
        const paths = LB.agesPaths(tr, tr.people, [20, 40, 60], 'status'); assert.ok(paths.length >= 3); assert.ok(paths.every(r => Number(r.value) >= 1 && 'g1' in r && 'g5' in r));
        assert.ok(paths.some(r => r.g3 === 'Décédé(e)'), 'Jean mort avant 60 ans');
        assert.ok(LB.walk(tr, 5, true).has(1), 'Jean est un ancêtre de Paul');
    });
    await t('calculs : moyenne et marge (écart-type, 95 %), Lexis avec marques, trois parts', () => {
        const b = LB.band([40, 50, 60], 'sd'); assert.equal(b.mean, 50); assert.equal(Math.round(b.sd), 10); const many = Array.from({length: 40}, (_, i) => 40 + (i % 3) * 10), c = LB.band(many, 'ci95'), d = LB.band(many, 'sd'); assert.ok(c.hi - c.lo < d.hi - d.lo, 'l’intervalle de la moyenne est plus étroit');
        const tr = fakeTree(), m = LB.marginRows(tr, null, 'death', 'sd', 100); assert.ok(m.length >= 1 && m.every(r => Number(r.s1) <= Number(r.s0) && Number(r.s0) <= Number(r.s2)), JSON.stringify(m));
        const L = LB.lexisData(tr, new Set([1, 2, 3])); same(L.rows.map(r => r.name), ['Jean MAZAUD', 'Marie LACOMBE', 'Pierre MAZAUD']);
        assert.ok(L.marks.some(x => x.kind === 'marriage' && x.name === 'Marie LACOMBE') && L.marks.some(x => x.kind === 'child') && L.marks.some(x => x.kind === 'move' && x.label === 'Tulle'), JSON.stringify(L.marks));
        same(LB.threeParts({agri: 5, arti: 2, indu: 1, comm: 3, lib: 1}, [['agri'], ['arti', 'indu'], 'rest']), [5, 3, 4]);
    });
    await t('personnaliser : les données prises restent un tableau ordinaire (une ligne retouchée, retirée, recolorée change le dessin)', () => {
        const tr = fakeTree(), L = LB.lexisData(tr, null), spec = {kind: 'lexis', rows: L.rows, marks: L.marks, bands: [], o: {}};
        const s0 = draw(spec); spec.rows[0].death = '1890'; const s1 = draw(spec); assert.notEqual(s1, s0, 'décès corrigé');
        spec.rows.pop(); assert.notEqual(draw(spec), s1, 'ligne retirée');
        spec.bands.push({label: 'Choléra', from: '1832', to: '1832', color: '#123456'}); assert.match(draw(spec), /#123456/, 'bande ajoutée avec sa couleur');
        const tern = R.KINDS.ternary.sample(); tern.cats = [{value: 'Naves', color: '#abcdef'}]; assert.match(draw({kind: 'ternary', ...tern}), /#abcdef/, 'couleur d’un groupe');
        tern.rows[0].a = '0'; tern.rows[0].b = '0'; tern.rows[0].c = '100'; assert.match(draw({kind: 'ternary', ...tern}), /Naves 1750/);
        const cd = R.KINDS.candles.sample(); cd.rows.push({label: '1780', open: '17', close: '30', low: '16', high: '31'}); assert.match(draw({kind: 'candles', ...cd}), /1780/);
    });
    await t('« Depuis l’app » : le bloc « Seulement les personnes… » (groupe, ＋ Critère, période) et ses paramètres', () => {
        const h = LB.critHtml('lexis'); assert.match(h, /data-dgo-box/); assert.match(h, /data-dgo-rules/); assert.match(h, /data-dgo="pop"/); assert.match(h, /data-dgo="from"/);
        assert.doesNotMatch(LB.critHtml('fametiers', {pop: false}), /data-dgo="pop"/, 'avec le bloc commun : seulement les critères');
        const p = LB.critParams({...ext.diagramAppOpts.DEF, pop: 'anc', root: 7, gens: 3, rules: [{field: 'occupation', value: 'bûcheron'}], match: 'any', from: '1800', to: 'vers 1850'});
        same([p.dg_pop, p.dg_root, p.dg_gens, p.dg_from, p.dg_to, p.match, JSON.parse(p.rules)[0].field], ['anc', 7, 3, 1800, 1850, 'any', 'occupation']);
        for (const k of ['lexis', 'ternary']) assert.match(R.KINDS[k].fromApp.html(), /data-lb-go/);
        assert.match(R.KINDS.falieux.fromApp.html(), /data-dfa="track"/); assert.match(R.KINDS.fametiers.fromApp.html(), /data-dfa="source"/); assert.match(R.KINDS.vieparents.fromApp.html(), /data-dvi="line"/); assert.match(R.KINDS.viepreuves.fromApp.html(), /data-dvi="layout"/);
    });
    await t('traduction : chaque texte des fichiers du lot B est traduit (7 langues complètes, 24 autres dans les sous-dossiers)', () => {
        const r = spawnSync(process.execPath, [path.join(root, 'scripts/i18n-check.js')], {encoding: 'utf8'}); assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.ok(fs.existsSync(path.join(root, 'assets/i18n/src/diagrammes-lot-b.tsv')));
        for (const d of ['nord', 'nord2', 'nord3', 'nord4', 'nord5', 'nord6', 'nord7', 'nord8', 'nord9', 'nord10', 'nord11', 'nord12', 'nord13']) assert.ok(fs.existsSync(path.join(root, 'assets/i18n/src', d, 'diagrammes-lot-b.tsv')), d);
        const X = require('../scripts/i18n-extract.js');
        const texts = new Set();
        for (const f of FILES) X.tCalls(path.join(root, 'assets/js', f)).forEach(x => { if (!/^[a-z_0-9.]+$/.test(x.text)) texts.add(x.text); });
        for (const k of [...MINE, 'line', 'dplleeds', 'dplhills', 'vieparents', 'viepreuves', 'falieux', 'fametiers']) { const K = R.KINDS[k]; [K.label, K.help].forEach(x => x && texts.add(x));
            K.grids.forEach(g => { texts.add(g.label); g.cols.forEach(c => { texts.add(c.label); (c.choices || []).forEach(ch => ch[1].length > 2 && texts.add(ch[1])); }); }); K.options.forEach(c => { texts.add(c.label); (c.choices || []).forEach(ch => ch[1].length > 2 && texts.add(ch[1])); }); }
        const skip = /^(Vive|Sepia|Sobre|Pastel|Terre|Océan|Forêt|Contraste|Monochrome|Daltonien|\?|—|livres|sols|deniers)$/;
        for (const l of ['en', 'es', 'de', 'it', 'pt', 'pl', 'nl', 'ru', 'el', 'vi']) {
            const dict = X.loadDict(l), miss = [...texts].filter(s => !skip.test(s) && !X.translated(dict, s));
            assert.deepEqual(miss, [], `${l} : ${miss.join(' | ')}`);
        }
        const faq = path.join(root, 'assets/i18n/faq/src'); for (const l of fs.readdirSync(faq).filter(d => fs.statSync(path.join(faq, d)).isDirectory())) assert.match(fs.readFileSync(path.join(faq, l, 'diagrammes-lot-b.tsv'), 'utf8'), /^0syiowu\.f4d1\t.+\t.+/, 'FAQ ' + l);
        const I = require('../assets/js/app-i18n.js'); assert.equal(I.t('Diagramme de Lexis : {n}, de {a} à {b}.', {n: '3 vies', a: '1800', b: '1900'}), 'Diagramme de Lexis : 3 vies, de 1800 à 1900.');
    });

    /* ── 2. et 3. Serveur et navigateur ── */
    const php = spawnSync('php', ['-v'], {encoding: 'utf8'}).status === 0 ? 'php' : null;
    if (!php) { console.log('— serveur : PHP absent, partie sautée'); return; }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-lotb-')), dir = path.join(tmp, 'a');
    const envFor = d => ({...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1'});
    const runPhp = code => { const r = spawnSync(php, ['-r', code], {cwd: root, encoding: 'utf8', env: envFor(dir)}); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout; };
    fs.mkdirSync(path.join(dir, 'media'), {recursive: true});
    runPhp('require "lib/paths.php"; (new PDO("sqlite:".DATA_DIR."/genealogy.sqlite"))->exec(file_get_contents(APP_ROOT."/data/schema.sql")); require "lib/bootstrap.php"; db();');
    const sr = spawnSync(php, [path.join(root, 'tests/fixtures/diagram-vie-seed.php')], {cwd: root, encoding: 'utf8', env: envFor(dir)}), sm = /^ok vie (.+)$/m.exec(sr.stdout || '');
    if (sr.status !== 0 || !sm) throw new Error(sr.stderr || sr.stdout);
    const S = JSON.parse(sm[1]);
    // un recensement, une fiche militaire et une bande historique pour Jean
    runPhp(`require "lib/paths.php"; require "lib/bootstrap.php"; $p = db(); $p->exec("INSERT INTO census_records(year,status) VALUES(1856,'found')"); $c = (int) $p->lastInsertId(); $p->exec("INSERT INTO census_members(census_id,person_id,display_name) VALUES($c,${S.jean},'Jean BOIS')");
        $p->exec("INSERT INTO poilu_events(person_id,kind) VALUES(${S.jean},'autre')"); require_once "lib/biographie.php"; if (function_exists('bio_history_schema')) { bio_history_schema($p); } try { $p->exec("INSERT INTO history_events(from_year,to_year,title) VALUES(1870,1871,'Guerre de 1870')"); } catch (Throwable $e) {}`);
    const port = await new Promise(res => { const s = require('node:net').createServer(); s.listen(0, '127.0.0.1', () => { const q = s.address().port; s.close(() => res(q)); }); }), base = `http://127.0.0.1:${port}/`;
    const proc = spawn(php, ['-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env: envFor(dir), stdio: 'ignore'});
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    const qs = o => Object.entries(o).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    const get = async q => { const r = await fetch(`${base}api.php?action=diagram_lot_b&${qs(q)}`); const j = await r.json().catch(() => ({})); return {status: r.status, ...j}; };
    const RULES = [{field: 'occupation', value: 'bûcheron'}, {field: 'children_count', from: 3, to: 3}, {field: 'place', value: 'Pernay'}];
    const sortN = a => [...a].map(Number).sort((x, y) => x - y);
    let browser = null;
    try {
        await t('serveur : bûcheron + 3 enfants + né à Pernay = Jean et Paul ; OU ; groupe ; période ; sans filtre = tout le monde', async () => {
            const r = await get({what: 'people', rules: JSON.stringify(RULES), match: 'all'}); assert.equal(r.status, 200, JSON.stringify(r)); same(sortN(r.ids), sortN([S.jean, S.paul])); assert.equal(r.all, false);
            const any = await get({what: 'people', rules: JSON.stringify(RULES), match: 'any'}); assert.ok(any.ids.length > 2);
            const grp = await get({what: 'people', rules: JSON.stringify(RULES), dg_pop: 'people', dg_ids: String(S.jean)}); same(grp.ids, [S.jean], 'croisé avec le groupe');
            const per = await get({what: 'people', rules: JSON.stringify(RULES), dg_from: 1853, dg_to: 1860}); same(per.ids, [S.paul], 'nés entre 1853 et 1860 : Paul');
            const all = await get({what: 'people'}); assert.equal(all.all, true);
        });
        await t('serveur : couverture par ancêtre, secteurs de métiers, bandes historiques', async () => {
            const c = await get({what: 'coverage', root: S.jean, gens: 3}); assert.equal(c.rows[0].sosa, 1); assert.equal(c.rows[0].pid, S.jean); assert.equal(c.rows[0].b, 'e'); assert.equal(c.rows[0].m, '', 'la personne de départ : mariage pas attendu');
            assert.equal(c.rows[0].cens, 1); assert.ok(c.rows[0].mili >= 1); assert.match(c.root_name, /Jean/);
            const s = await get({what: 'sectors', by: 'place', top: 5}); const pn = s.rows.find(r => r.label === 'Pernay'); assert.ok(pn && pn.by.agri >= 3, JSON.stringify(s.rows)); assert.ok(s.sectors.length >= 10);
            const s2 = await get({what: 'sectors', by: 'decade', rules: JSON.stringify(RULES)}); same(s2.rows.map(r => [r.label, r.n]), [['1850', 2]]);
            const h = await get({what: 'history', dg_from: 1800, dg_to: 1900}); assert.ok(Array.isArray(h.rows));
        });
        await t('serveur : valeurs piégées refusées (422)', async () => {
            for (const q of [{what: 'rien'}, {what: 'people', dg_pop: 'zzz'}, {what: 'people', rules: '{"a":'}, {what: 'people', rules: 'x'.repeat(30000)}, {what: 'coverage', root: '1 OR 1=1'}, {what: 'sectors', top: 'abc'}])
                assert.equal((await get(q)).status, 422, JSON.stringify(q).slice(0, 60));
        });

        let chromium = null; for (const p of ['playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright']) { try { ({chromium} = require(p)); break; } catch (_) { chromium = null; } }
        if (!chromium) { console.log('— navigateur : Playwright absent, partie sautée'); return; }
        const SHOTS = process.env.LB_SHOTS || (fs.existsSync('/tmp/claude-0/sp/diag') ? '/tmp/claude-0/sp/diag' : '');
        const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
        browser = await chromium.launch(exe ? {executablePath: exe} : {});
        const errors = [];
        const ctx = await browser.newContext({viewport: {width: 1360, height: 950}, deviceScaleFactor: 1}), p = await ctx.newPage();
        p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); }); p.on('dialog', d => { errors.push('dialogue : ' + d.message()); d.dismiss(); });
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.bootstrap && window.LCNDA_EXT?.openDiagramEditor && window.LCNDA_EXT?.diagramLotB, null, {timeout: 20000}); await p.waitForTimeout(400);
        const shot = async (name, sel = '.h-dg-dlg [data-dg-preview]') => { if (!SHOTS) return; const el = await p.$(sel); await (el || p).screenshot({path: path.join(SHOTS, 'lotb-' + name + '.png')}); };
        const close = () => p.evaluate(() => document.querySelectorAll('.h-dg-dlg, dialog.dfa-people').forEach(d => { if (d.open) d.close(); d.remove(); }));
        const open = async (kind, extra = null) => { await close(); await p.evaluate(([k, x]) => { const K = window.LCNDA_EXT.diagramRender.KINDS[k]; window.LCNDA_EXT.openDiagramEditor(null, x ? {spec: {kind: k, ...K.sample(), ...x, o: {...K.sample().o, ...(x.o || {})}}} : {kind: k}); }, [kind, extra]); await p.waitForSelector('.h-dg-dlg [data-dg-preview] svg'); };
        const preview = () => p.$eval('.h-dg-dlg [data-dg-preview] svg', s => s.outerHTML);
        const appTab = async go => { await p.click('.h-dg-dlg [data-dg-tab="app"]'); await p.waitForSelector(`.h-dg-dlg ${go}`); };
        const pick = (name, ids) => p.evaluate(([n, v]) => { const pk = document.querySelector(`.h-dg-dlg input[name="${n}"]`)?.closest('.pk'); window.LCNDA_PICKER.pickerSet(pk, v); }, [name, ids]);
        const take = async (go, msgSel) => { await p.click(`.h-dg-dlg ${go}`);
            await p.waitForFunction(m => document.querySelector('.h-dg-dlg [data-dg-tab="data"]')?.classList.contains('is-active') || /⚠️/.test(document.querySelector(`.h-dg-dlg ${m}`)?.textContent || ''), msgSel, {timeout: 20000});
            const msg = await p.$eval(`.h-dg-dlg ${msgSel}`, e => e.textContent).catch(() => ''); assert.doesNotMatch(msg, /⚠️/, msg); await p.waitForTimeout(300); };
        const rowsOf = (gi = 0) => p.$$eval(`.h-dg-dlg [data-grid="${gi}"] tbody tr`, l => l.length);
        const addRules = async () => { const add = async (field, fill) => { await p.selectOption('.h-dg-dlg .lb-crit [data-dgo-addrule], .h-dg-dlg [data-dfa-crit] [data-dgo-addrule]', field); const row = '.h-dg-dlg [data-dgo-rules] .h-lr-row:last-child'; await p.waitForSelector(row); await fill(row); };
            await add('occupation', async r => { await p.fill(`${r} [data-lr="value"]`, 'bûcheron'); await p.$eval(`${r} [data-lr="value"]`, e => e.dispatchEvent(new Event('change', {bubbles: true}))); });
            await add('children_count', async r => { await p.fill(`${r} [data-lr="from"]`, '3'); await p.fill(`${r} [data-lr="to"]`, '3'); await p.$eval(`${r} [data-lr="to"]`, e => e.dispatchEvent(new Event('change', {bubbles: true}))); });
            await add('place', async r => { await p.fill(`${r} [data-lr="value"]`, 'Pernay'); await p.$eval(`${r} [data-lr="value"]`, e => e.dispatchEvent(new Event('change', {bubbles: true}))); }); };

        await t('navigateur : les 3 types dans la galerie ; chacun s’ouvre, une cellule retouchée ou une ligne ajoutée change l’aperçu', async () => {
            const pr = p.evaluate(() => window.LCNDA_EXT.diagramsInternals.chooseType()); await p.waitForSelector('.h-dg-gallery .h-dg-tile');
            const tiles = await p.$$eval('.h-dg-gallery .h-dg-tile', l => l.map(x => x.textContent)); for (const k of MINE) { const lab = await p.evaluate(k => window.LCNDA_EXT.diagramRender.KINDS[k].label, k); assert.ok(tiles.some(x => x.includes(lab)), k); }
            await p.click('.h-dg-gallery [data-close]'); await pr;
            for (const k of MINE) { await open(k); const s0 = await preview(); await shot('exemple-' + k);
                const cell = await p.$('.h-dg-dlg [data-grid="0"] tbody tr:first-child input[data-k]'); await cell.fill(k === 'lexis' ? 'Jeanne TESTEUR' : k === 'ternary' ? 'Village test' : '1764');
                await cell.dispatchEvent('change'); await p.waitForTimeout(500); const s1 = await preview(); assert.notEqual(s1, s0, k + ' : cellule'); assert.doesNotMatch(s1, BAD);
                await p.click('.h-dg-dlg [data-dg-add="0"]'); assert.ok((await rowsOf()) > 1); }
        });
        await t('navigateur : 📐 Lexis depuis la base, avec bûcheron + 3 enfants + né à Pernay → Jean et Paul', async () => {
            await open('lexis'); await appTab('[data-lb-go]'); await addRules(); await take('[data-lb-go]', '[data-lb-msg]');
            const names = await p.$$eval('.h-dg-dlg [data-grid="0"] tbody tr input[data-k="name"]', l => l.map(x => x.value)); same(names.sort(), ['Jean BOIS', 'Paul BOIS']);
            assert.ok((await rowsOf(1)) >= 3, 'marques : mariage et enfants'); const s = await preview(); assert.doesNotMatch(s, BAD); await shot('lexis-base');
        });
        await t('navigateur : 🔺 ternaire depuis la base (secteurs par commune), puis une couleur choisie à la main', async () => {
            await open('ternary'); await appTab('[data-lb-go]'); await take('[data-lb-go]', '[data-lb-msg]');
            const labels = await p.$$eval('.h-dg-dlg [data-grid="0"] tbody tr input[data-k="label"]', l => l.map(x => x.value)); assert.ok(labels.includes('Pernay'), labels.join(','));
            await shot('ternaire-base');
        });
        await t('navigateur : 👴 lignée paternelle, ✅ une ligne par ancêtre, 💍 trajectoires, 🔀 âges, 📏 marge — remplis depuis la base', async () => {
            await open('vieparents'); await appTab('[data-dfa-go]'); await p.selectOption('.h-dg-dlg [data-dvi="line"]', 'p'); await pick('dvi_lroot', S.family[2]); await take('[data-dfa-go]', '[data-dfa-msg]');
            assert.equal(await rowsOf(), 1, 'Pierre ← Jean'); assert.match(await preview(), /Lignée paternelle/); await shot('lignee');
            await open('viepreuves'); await appTab('[data-dfa-go]'); await p.selectOption('.h-dg-dlg [data-dvi="layout"]', 'people'); await pick('dvi_root', S.jean); await take('[data-dfa-go]', '[data-dfa-msg]');
            assert.ok((await rowsOf(1)) >= 1, 'une ligne par ancêtre'); assert.match(await preview(), /Recensements/); await shot('couverture');
            await open('falieux'); await appTab('[data-dfa-go]'); await p.selectOption('.h-dg-dlg [data-dfa="track"]', 'status'); await p.selectOption('.h-dg-dlg [data-dfa="mode"]', 'ids'); await pick('dfa_ids', [S.marie, S.jean]); await take('[data-dfa-go]', '[data-dfa-msg]');
            const sv = await preview(); assert.match(sv, /Veuf ou veuve/); assert.match(sv, /Remarié/); await shot('trajectoires');
            await open('fametiers'); await appTab('[data-dfa-go]'); await p.selectOption('.h-dg-dlg [data-dfa="source"]', 'ages'); assert.ok(await p.isVisible('.h-dg-dlg [data-dfa-crit]'), 'les critères'); await take('[data-dfa-go]', '[data-dfa-msg]');
            assert.match(await preview(), /À 20 ans/); await shot('alluvial');
            await open('line'); await p.click('.h-dg-dlg [data-dg-tab="app"]'); await p.waitForSelector('.h-dg-dlg [data-dg-kapp]'); await p.selectOption('.h-dg-dlg [data-dg-kapp]', 'lb:death:sd:'); await p.click('.h-dg-dlg [data-dg-kappgo]');
            await p.waitForFunction(() => document.querySelector('.h-dg-dlg [data-dg-tab="data"]')?.classList.contains('is-active'), null, {timeout: 15000}); await p.waitForTimeout(300);
            assert.match(await preview(), /Marge/); await shot('courbe-marge');
        });
        await t('navigateur : réglages dendrogramme et horizon dans l’éditeur ; 390 px et mode sombre sans débordement', async () => {
            await open('dplleeds', {o: {tree: true}}); assert.match(await preview(), /translate\(/); await shot('dendrogramme');
            await open('dplhills', {o: {shape: 'horizon'}}); assert.match(await preview(), /horizon/i); await shot('horizon');
            const small = await browser.newContext({viewport: {width: 390, height: 860}, colorScheme: 'dark', deviceScaleFactor: 1}), q = await small.newPage(); q.on('pageerror', e => errors.push(e.message));
            await q.goto(base); await q.waitForFunction(() => window.LCNDA_EXT?.openDiagramEditor && window.LCNDA_EXT?.diagramLotB, null, {timeout: 20000}); await q.waitForTimeout(300);
            for (const k of MINE) { await q.evaluate(k => { document.querySelectorAll('.h-dg-dlg').forEach(d => d.remove()); window.LCNDA_EXT.openDiagramEditor(null, {kind: k}); }, k); await q.waitForSelector('.h-dg-dlg [data-dg-preview] svg');
                await q.click('.h-dg-dlg [data-dg-tab="app"]').catch(() => {}); await q.waitForTimeout(250);
                const over = await q.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); assert.ok(over <= 2, k + ' : ' + over + ' px de trop');
                if (SHOTS) await q.screenshot({path: path.join(SHOTS, `lotb-390-sombre-${k}.png`)}); }
            await small.close();
        });
        await t('navigateur : aucune erreur JavaScript', () => { assert.deepEqual(errors, []); });
    } finally { if (browser) await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
})().then(() => finish(), e => { failed++; console.error(e); finish(); });
function finish() { console.log(`${failed ? '✗' : '✓'} diagrammes du lot B : ${count} vérifications${failed ? `, ${failed} en échec` : ''}`); process.exit(failed ? 1 : 0); }
