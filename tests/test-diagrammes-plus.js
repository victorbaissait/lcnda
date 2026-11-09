'use strict';
/**
 * 📊 Douze diagrammes de plus (assets/js/heritage-diagram-plus.js, calculs : assets/js/app-diagram-plus-core.js, données :
 * lib/diagram_plus.php) :   node tests/test-diagrammes-plus.js     (DPL_PORT=20394 par défaut ; DPL_SHOTS=<dossier> pour les captures)
 *  1. calculs purs : chemin de parenté sur des cas difficiles (demi-frère, cousins issus de germains, à la mode de Bretagne,
 *     alliances, implexe, boucle, rien en commun), mots du lien, complétude, centre de gravité (même à travers le 180e méridien),
 *     méthode de Leeds, vivants année par année, jour de l'année ;
 *  2. dessin (Node) : chaque exemple à 900 et 390 px, vide et lignes abîmées, textes et couleurs piégés, beaucoup de lignes ;
 *  3. navigateur (base de test) : données du serveur (fiche confidentielle jamais nommée, « pour partager » sans les vivants),
 *     galerie, éditeur, « Depuis l'app » pour les 12 sortes, clic → fiche, impression du tableau d'ascendance (fenêtre L1),
 *     exports SVG et PNG, clair / sombre, 390 px, sans erreur.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawn, spawnSync } = require('node:child_process');
const appRoot = path.resolve(__dirname, '..');
const P = require(path.join(appRoot, 'assets/js/app-diagram-plus-core.js'));
let failed = 0, n = 0;
const t = (name, fn) => { try { fn(); n++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

/* ── 1. Calculs purs ── */
// Une famille : 1 ⚭ 2 → 3 (⚭ 6), 4 (⚭ 7) ; 3+6 → 5 ; 7+4 → 8 ; 5 → 9 ; 8 → 10 ; 11 ⚭ 10 ; 12 : 2e épouse de 1 → 13 (demi-frère de 3)
// 20 ⚭ 21 → 22 et 23 ; 22 → 24 ; 23 → 25 ; 24 et 25 (cousins germains) ont un enfant 26 : implexe ; 30 : seul, sans lien.
const G = {1: {s: 'h', sp: [2, 12]}, 2: {s: 'f'}, 12: {s: 'f'}, 3: {s: 'h', p: [1, 2], sp: [6]}, 4: {s: 'f', p: [1, 2], sp: [7]}, 6: {s: 'f'}, 7: {s: 'h'}, 13: {s: 'h', p: [1, 12]},
    5: {s: 'h', p: [3, 6]}, 8: {s: 'f', p: [7, 4]}, 9: {s: 'h', p: [5]}, 10: {s: 'f', p: [8]}, 11: {s: 'h', sp: [10]},
    20: {s: 'h', sp: [21]}, 21: {s: 'f'}, 22: {s: 'h', p: [20, 21]}, 23: {s: 'f', p: [20, 21]}, 24: {s: 'h', p: [22]}, 25: {s: 'f', p: [23]}, 26: {s: 'f', p: [24, 25]}, 30: {s: 'h'}};
const say = (a, b, o) => { const r = P.kinPath(G, a, b, o); return r && P.kinSentence(r.steps, r.path.map(id => G[id]?.s || ''), r.path.map(id => 'P' + id)); };
t('chemin de parenté : sang, alliances, demi, à la mode de Bretagne', () => {
    assert.equal(say(9, 10), 'P9 est le cousin issu de germains de P10.');
    assert.equal(say(5, 8), 'P5 est le cousin germain de P8.');
    assert.equal(say(3, 8), 'P3 est l’oncle de P8.');
    assert.equal(say(8, 3), 'P8 est la nièce de P3.');
    assert.equal(say(5, 10), 'P5 est l’oncle à la mode de Bretagne de P10.');
    assert.equal(say(1, 10), 'P1 est l’arrière-grand-père de P10.');
    assert.equal(say(10, 1), 'P10 est l’arrière-petite-fille de P1.');
    assert.equal(say(7, 3), 'P7 est le beau-frère de P3.', 'époux de la sœur');
    assert.equal(say(6, 8), 'P6 est l’épouse de l’oncle de P8.');
    assert.equal(say(11, 9), 'P11 est l’époux de la cousine issue de germains de P9.');
    assert.equal(say(11, 8), 'P11 est le gendre de P8.');
    assert.equal(say(2, 7), 'P2 est la belle-mère de P7.');
    assert.equal(say(9, 9), 'P9 et P9 : c’est la même personne.');
    // demi-frère : un seul parent commun, dont l'autre conjoint est connu
    const all = P.kinAll(G, 13, 3, 'h'); assert.equal(all.length, 1); assert.equal(all[0].word, 'demi-frère');
    assert.equal(P.kinAll(G, 3, 4, 'h')[0].word, 'frère');
});
t('chemin de parenté : implexe (un double lien), rien en commun, sans alliances, boucle', () => {
    // 26 descend de 20 et 21 par son père ET sa mère : 24 et 25 sont cousins germains, 26 est la petite-fille de 22 et la petite-nièce… de 22 aussi ?
    const k = P.kinAll(G, 26, 22, 'f'); assert.deepEqual(k.map(x => x.word), ['petite-fille', 'petite-nièce'], JSON.stringify(k));
    assert.equal(P.kinAll(G, 24, 25, 'h')[0].word, 'cousin germain'); assert.equal(P.kinAll(G, 24, 25, 'h')[0].via.length, 2, 'le couple 20 + 21');
    assert.equal(P.kinPath(G, 9, 30), null, 'aucun lien');
    assert.equal(P.kinPath(G, 7, 3, {alliances: false}), null, 'sans alliances : pas de chemin pour un beau-frère');
    assert.equal(P.kinPath(G, 9, 10, {alliances: false}).steps.join(''), 'uuuddd');
    // données abîmées : soi-même parent de soi, parents inconnus, boucles, identifiants absurdes
    const bad = {1: {p: [1, 2, 'x', -4]}, 2: {p: [1]}, 3: {p: [2], sp: [3, 99999]}, x: {p: [1]}, '-5': {}};
    assert.ok(P.kinPath(bad, 3, 1)); assert.equal(P.kinPath(bad, 3, 77), null); assert.equal(P.kinPath(null, 1, 2), null);
    // très long : 40 générations d'une seule lignée et deux cousins au bout
    const deep = {1: {}}; for (let i = 2; i <= 41; i++) deep[i] = {p: [i - 1]}; deep[100] = {p: [1]}; for (let i = 101; i <= 139; i++) deep[i] = {p: [i - 1]};
    const r = P.kinPath(deep, 41, 139); assert.equal(r.steps.length, 80); assert.match(P.kinSentence(r.steps, [], r.path.map(String)), /cousin au 40e degré ou cousine au 40e degré/);
});
t('mots du lien : comme « Quel lien ? » (lib/question_more.php)', () => {
    assert.equal(P.kinWord(2, 2, 'h'), 'cousin germain'); assert.equal(P.kinWord(3, 3, 'f'), 'cousine issue de germains');
    assert.equal(P.kinWord(4, 4, 'h'), 'cousin issu d’issus de germains'); assert.equal(P.kinWord(6, 6, 'h'), 'cousin au 6e degré');
    assert.equal(P.kinWord(3, 2, 'f'), 'nièce à la mode de Bretagne'); assert.equal(P.kinWord(2, 3, 'h'), 'oncle à la mode de Bretagne');
    assert.equal(P.kinWord(2, 4, 'h'), 'cousin germain avec 2 générations d’écart');
    assert.equal(P.kinWord(0, 4, 'h'), 'arrière-arrière-grand-père'); assert.equal(P.kinWord(1, 4, 'f'), 'arrière-grand-tante'); assert.equal(P.kinWord(4, 1, 'h'), 'arrière-petit-neveu');
    assert.equal(P.kinWord(1, 2, ''), 'oncle ou tante'); assert.equal(P.kinWord(1, 1, 'h', true), 'demi-frère');
});
t('complétude : 2^n possibles, doublons et numéros abîmés ignorés', () => {
    const c = P.completeness([1, 2, 3, 4, 5, 7, 8, 9, 15, 15, 16, 0, -3, 'x', 2.5, 1e30, 1024], 5);
    assert.deepEqual(c.map(x => [x.gen, x.theo, x.found]), [[1, 1, 1], [2, 2, 2], [3, 4, 3], [4, 8, 3], [5, 16, 1]]);
    assert.equal(c[2].pct, 75); assert.equal(P.completeness([], 3).length, 3); assert.equal(P.completeness(null, 99).length, 40);
});
t('centre de gravité : moyenne sur la sphère, écart en km, 180e méridien', () => {
    const g = P.gravity([{gen: 2, lat: 48, lon: -1}, {gen: 2, lat: 46, lon: 3}, {gen: 3, lat: 45, lon: 5}, {gen: 'x', lat: 1, lon: 1}, {gen: 4, lat: 99, lon: 0}]);
    assert.deepEqual(g.map(x => x.gen), [2, 3]); assert.ok(Math.abs(g[0].lat - 47.02) < .05 && Math.abs(g[0].lon - 1.04) < .05, JSON.stringify(g[0])); assert.ok(g[0].spread > 150 && g[0].spread < 220);
    assert.equal(g[1].spread, 0);
    const pac = P.gravity([{gen: 1, lat: 0, lon: 179}, {gen: 1, lat: 0, lon: -179}])[0]; assert.ok(Math.abs(Math.abs(pac.lon) - 180) < .01, 'pas au milieu de l’Afrique : ' + pac.lon);
    assert.ok(Math.abs(P.km(48.11, -1.68, 48.86, 2.35) - 308) < 5, 'Rennes – Paris ≈ 308 km');
});
t('méthode de Leeds : groupes, liens dans les deux sens, bornes', () => {
    const L = P.leeds([{name: 'A', cm: 300, shared: 'B; C'}, {name: 'B', cm: 200, shared: ['A']}, {name: 'C', cm: 150}, {name: 'D', cm: 250}, {name: 'E', cm: 100, shared: 'd'}, {name: 'F', cm: 120}, {name: 'G', cm: 2000, shared: 'A'}, {name: 'H', cm: 20, shared: 'A'}, {name: '', cm: 200}, null]);
    assert.deepEqual(L.clusters, [[0, 1, 2], [3, 4]], 'D ↔ E : le lien est écrit par E seulement');
    assert.ok(!L.pool.includes(6) && !L.pool.includes(7), 'hors de 90–400 cM');
    assert.deepEqual(L.order, [0, 1, 2, 3, 4, 5]); assert.ok(L.shares(4, 3) && L.shares(3, 4) && !L.shares(0, 3));
    assert.equal(P.leeds([{name: 'A', cm: 300, shared: 'B'}, {name: 'B', cm: 200}, {name: 'C', cm: 290, shared: 'D'}, {name: 'D', cm: 100}], {max: 1}).clusters.length, 1);
});
t('vivants année par année : décès inconnu (récent = en vie, ancien = 60 ans)', () => {
    const r = P.aliveByYear([{b: 1900, d: 1950}, {b: 1920}, {b: 1990}, {b: 1700}, {b: 'x'}, {b: 1960, living: true}], 1945, 1952, {now: 2026});
    assert.deepEqual(r.map(x => x.n), [2, 2, 2, 2, 2, 2, 1, 1]);
    assert.equal(P.aliveByYear([{b: 1700}], null, null, {now: 2026}).length, 61);
    assert.deepEqual(P.aliveByYear([], 1, 2), []);
});
t('jour de l’année', () => {
    assert.equal(P.dayOfYear('01-01'), 0); assert.equal(P.dayOfYear('14/07'), 195); assert.equal(P.dayOfYear('1925-12-31'), 365); assert.equal(P.dayOfYear('02-29'), 59);
    assert.equal(P.dayOfYear('31/02'), null); assert.equal(P.dayOfYear('x'), null);
});

/* ── 2. Dessin (Node) ── */
const sb = {window: {}, console, setTimeout, clearTimeout, Intl};
vm.createContext(sb);
sb.window.LCNDA_DIAGPLUS = P;
for (const f of ['heritage-diagrams-render.js', 'heritage-diagram-plus.js']) vm.runInContext(fs.readFileSync(path.join(appRoot, 'assets/js', f), 'utf8'), sb, {filename: f});
const R = sb.window.LCNDA_EXT.diagramRender;
const NOMAP = ['dplkin', 'dplcomp', 'dplahn', 'dplleeds', 'dplwheel', 'dplbarline', 'dpldiv', 'dplhills', 'dplpar', 'dplstep'];
const ALL = ['dplkin', 'dplgrav', 'dplgenmap', ...NOMAP.slice(1)];
const GROUP = {dplkin: 'Généalogie', dplcomp: 'Généalogie', dplahn: 'Généalogie', dplgrav: 'Cartes', dplgenmap: 'Cartes', dplleeds: 'ADN', dplwheel: 'Frises', dplbarline: 'Chiffres', dpldiv: 'Chiffres', dplhills: 'Chiffres', dplpar: 'Chiffres', dplstep: 'Chiffres'};
const TRAP = '<img src=x onerror="window.__xss=1">\'"&';
t('les sortes sans carte sont au catalogue (sans fond de carte, les cartes ne s’ajoutent pas)', () => {
    assert.deepEqual([...sb.window.LCNDA_EXT.diagramPlus.KINDS], NOMAP);
    NOMAP.forEach(k => { const K = R.KINDS[k]; assert.ok(K.icon && K.label && K.help && K.group === GROUP[k] && K.grids.length && K.options.length >= 3 && typeof K.sample === 'function' && K.fromApp?.html, k); });
});
t('chaque exemple se dessine (900 et 390 px), avec un résumé', () => {
    NOMAP.forEach(k => [900, 390].forEach(W => { const s = R.svg({kind: k, ...R.KINDS[k].sample()}, W);
        assert.match(s, /^<svg [^>]*role="img" aria-label="[^"]+"/, k); assert.doesNotMatch(s, /Dessin impossible|NaN|undefined|Infinity/, `${k} ${W}`); assert.ok(s.length > 2500, `${k} ${W}`); assert.match(s, /<desc>/, k); }));
    assert.match(R.svg({kind: 'dplkin', ...R.KINDS.dplkin.sample()}, 900), /Hugo MARTIN est le cousin issu de germains de Léa PEYRE/);
    assert.match(R.svg({kind: 'dplleeds', ...R.KINDS.dplleeds.sample()}, 900), /Grand-père paternel \(4\)|Grand-père paternel/);
});
t('réglages : autre dessin, autre présentation — toujours un dessin', () => {
    const o = {layout: 'fan', colorBy: 'one', mode: 'one', sort: 'diff', labels: 'middle', colors: 'gradient', scaleBy: 'same', order: 'reverse', step: 'before', fill: false, lineSeries: 1, scale: 'log', highlight: 'XIXe s.', smooth: false, values: true, peaks: true};
    NOMAP.forEach(k => { const sp = R.KINDS[k].sample(); for (const extra of [o, {layout: 'list'}, {layout: 'chart'}]) { const s = R.svg({kind: k, ...sp, o: {...sp.o, ...extra}}, 600); assert.doesNotMatch(s, /Dessin impossible|NaN|undefined|Infinity/, k + JSON.stringify(extra).slice(0, 30)); } });
});
t('vide, lignes abîmées, réglages absurdes : un message, jamais d’erreur', () => {
    NOMAP.forEach(k => {
        for (const spec of [{kind: k}, {kind: k, rows: []}, {kind: k, rows: [null, 'x', 42, [], {}, {name: {}, gen: 'x', sosa: -3, step: 'zz', date: '99/99', cm: 'NaN', s0: 'x', s1: null, label: {}}], o: null, series: 'x'},
            {kind: k, rows: [{name: 'a', sosa: 1e30, gen: 1e308, step: 'u', date: '07-14', kind: 'birth', cm: 1e308, s0: 1e308, s1: -1e308, label: '1900', found: 1e9, theo: -2}], series: [{name: 'a'}, {name: 'b'}], o: {height: -5, rowH: 1e9, overlap: 'x', hole: 1e9, max: -3, maxRows: 1e9, lineSeries: 99, center: 'x', dot: 1e9}}]) {
            const s = R.svg(spec, 400); assert.doesNotMatch(s, /Dessin impossible|NaN|Infinity/, `${k} ${JSON.stringify(spec).slice(0, 90)}`);
        }
    });
});
t('textes et couleurs piégés : échappés, couleurs refusées', () => {
    NOMAP.forEach(k => {
        const rows = Array.from({length: 10}, (_, i) => ({name: TRAP + i, sex: TRAP, years: TRAP, step: i ? 'u' : '', gen: String(i + 1), found: '1', sosa: String(i + 1), birth: TRAP, bplace: TRAP, job: TRAP, cm: String(100 + i * 20), shared: TRAP + (i + 1), date: `0${(i % 9) + 1}-1${i}`, kind: TRAP, label: TRAP + i, year: TRAP, group: TRAP, s0: String(i), s1: String(i * 2), s2: '3', ids: TRAP, pid: TRAP}));
        const s = R.svg({kind: k, rows, others: [{label: TRAP}], colors: [{color: 'url(javascript:x)'}], cats: [{value: TRAP, color: '"><script>'}], series: [{name: TRAP, color: 'expression(1)'}, {name: TRAP, color: 'x;y'}, {name: TRAP}],
            o: {title: TRAP, names: TRAP, leftLabel: TRAP, unit: TRAP, manColor: 'javascript:x', knownColor: '"/><x', c_birth: 'url(x)', oneColor: 'x;y', highlight: TRAP}}, 700);
        assert.doesNotMatch(s, /<img|<script|onerror="|javascript:|url\((?!#)|expression\(/, k);
    });
});
t('beaucoup de lignes : rapide et borné', () => {
    NOMAP.forEach(k => { const rows = Array.from({length: 5000}, (_, i) => ({name: 'P' + i, step: i ? ['u', 'd', 's'][i % 3] : '', gen: String(1 + (i % 12)), found: String(i % 50), sosa: String(i + 1), cm: String(90 + (i % 300)), shared: 'P' + ((i + 1) % 5000), date: `${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`, kind: 'birth', label: String(1700 + (i % 300)), s0: String(i % 70), s1: String(i % 40), s2: String(i % 9), group: 'G' + (i % 5)}));
        const t0 = Date.now(); const s = R.svg({kind: k, rows, series: [{name: 'a'}, {name: 'b'}, {name: 'c'}]}, 900); assert.ok(Date.now() - t0 < 5000, k + ' ' + (Date.now() - t0) + ' ms'); assert.ok(s.length < 8e6, k); });
});
t('tableau d’ascendance à imprimer : HTML échappé, lieux et métiers au choix', () => {
    const h = sb.window.LCNDA_EXT.diagramPlus.ahnentafelHtml({o: {title: TRAP}, rows: [{sosa: '1', name: TRAP, birth: '1925-05-07', bplace: 'Tulle', job: 'Menuisier'}, {sosa: '3', name: 'Marie', death: '2001-12'}]});
    assert.doesNotMatch(h, /<img|<script/); assert.match(h, /7 mai 1925, Tulle/); assert.match(h, /décembre 2001/); assert.match(h, /Génération 2 — Parents/); assert.match(h, /Menuisier/);
    assert.doesNotMatch(sb.window.LCNDA_EXT.diagramPlus.ahnentafelHtml({rows: [{sosa: '1', name: 'A', bplace: 'Tulle', job: 'M'}]}, {places: false, jobs: false}), /Tulle|>M</);
});

/* ── 3. Navigateur ── */
let chromium = null;
for (const p of ['playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright']) { try { ({ chromium } = require(p)); break; } catch (_) { chromium = null; } }
const php = spawnSync('php', ['-v'], { encoding: 'utf8' }).status === 0 ? 'php' : null;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-dpl-'));
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
const SHOTS = process.env.DPL_SHOTS || '';
const PORT = Number(process.env.DPL_PORT) || 20394;
const seed = dir => {
    fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    const init = spawnSync(php, ['-r', 'require "lib/paths.php"; (new PDO("sqlite:".DATA_DIR."/genealogy.sqlite"))->exec(file_get_contents(APP_ROOT."/data/schema.sql")); require "lib/bootstrap.php"; db();'], { cwd: appRoot, encoding: 'utf8', env: envFor(dir) });
    if (init.status !== 0) throw new Error(init.stderr || init.stdout);
    const r = spawnSync(php, [path.join(appRoot, 'tests/fixtures/diagram-plus-seed.php')], { cwd: appRoot, encoding: 'utf8', env: envFor(dir) });
    const m = String(r.stdout).match(/^ok plus root=(\d+) cousin=(\d+) aunt=(\d+) private=(\d+) paul=(\d+)/m);
    if (r.status !== 0 || !m) throw new Error(r.stderr || r.stdout);
    return { root: +m[1], cousin: +m[2], aunt: +m[3], priv: +m[4], paul: +m[5] };
};
const serve = async (dir, port) => {
    const proc = spawn(php, ['-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(dir), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    return { proc, base };
};

(async () => {
    if (!chromium || !php) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); process.exit(failed ? 1 : 0); }
    const dir = path.join(tmp, 'a'); let ids;
    try { ids = seed(dir); } catch (e) { failed++; console.error('✗ base de test\n ', e.message); process.exit(1); }
    const { proc, base } = await serve(dir, PORT);
    process.on('exit', () => { try { proc.kill(); } catch (_) {} });
    const browser = await chromium.launch(exe ? { executablePath: exe } : {});
    const errors = [];
    const tt = async (name, fn) => { try { await fn(); n++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
    const watch = (p, tag) => { p.on('pageerror', e => errors.push(tag + ' ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(tag + ' ' + m.text()); }); p.on('dialog', d => { errors.push('dialogue : ' + d.message()); d.dismiss(); }); };
    const ready = async p => { await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.bootstrap && window.LCNDA_EXT?.openDiagramEditor && window.LCNDA_EXT?.diagramPlus, null, { timeout: 30000 }); await p.waitForTimeout(400); };
    const closeEditor = p => p.evaluate(() => document.querySelectorAll('.h-dg-dlg, dialog.dfa-people').forEach(d => { if (d.open) d.close(); d.remove(); }));
    const openKind = async (p, k) => { await closeEditor(p); await p.evaluate(k => { window.LCNDA_EXT.openDiagramEditor(null, { kind: k }); }, k); await p.waitForSelector('.h-dg-dlg [data-dg-preview] svg'); };
    const preview = p => p.$eval('.h-dg-dlg [data-dg-preview] svg', s => s.outerHTML);
    const mapReady = p => p.waitForFunction(() => { const s = document.querySelector('.h-dg-dlg [data-dg-preview] svg'); return s && !s.querySelector('[data-geo-wait]'); }, null, { timeout: 20000 });
    const shot = async (p, name, sel = '.h-dg-dlg') => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); const el = await p.$(sel); await (el || p).screenshot({ path: path.join(SHOTS, name + '.png') }); };
    const setPk = (p, name, v) => p.evaluate(([name, v]) => window.LCNDA_PICKER.pickerSet(document.querySelector(`.h-dg-dlg [name="${name}"]`).closest('.pk'), v), [name, v]);
    const fromApp = async (p, k, before) => {
        await openKind(p, k); await p.click('.h-dg-dlg [data-dg-tab="app"]'); await p.waitForSelector('.h-dg-dlg [data-dpl-go]');
        if (before) await before();
        await p.click('.h-dg-dlg [data-dpl-go]');
        await p.waitForFunction(() => document.querySelector('.h-dg-dlg [data-dg-tab="data"]')?.classList.contains('is-active') || /⚠️/.test(document.querySelector('.h-dg-dlg [data-dpl-msg]')?.textContent || ''), null, { timeout: 20000 });
        const msg = await p.$eval('.h-dg-dlg [data-dpl-msg]', e => e.textContent).catch(() => '');
        assert.doesNotMatch(msg, /⚠️/, `${k} : ${msg}`);
        if (k === 'dplgrav' || k === 'dplgenmap') await mapReady(p); else await p.waitForTimeout(300);
        return preview(p);
    };
    try {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, acceptDownloads: true });
        const p = await ctx.newPage(); watch(p, '1440'); await ready(p);
        const api = q => p.evaluate(q => window.LCNDA_APP.api('diagram_plus', q), q);
        const nameOf = id => p.evaluate(id => window.LCNDA_APP.api('diagram_people', { ids: String(id) }).then(r => r.people[0]?.name), id);
        const auntName = await nameOf(ids.aunt), privName = await nameOf(ids.priv);
        await tt('serveur : les données, bornées ; fiche confidentielle jamais nommée ; « pour partager » sans les vivants', async () => {
            const k = await api({ what: 'kinpath', a: ids.root, b: ids.cousin }); assert.ok(k.found && k.nodes[ids.root] && k.nodes[ids.cousin]);
            const s = await p.evaluate(([r, a, b]) => { const P = window.LCNDA_DIAGPLUS, G = P.normGraph(r.nodes), x = P.kinPath(G, a, b); return P.kinSentence(x.steps, x.path.map(id => r.nodes[id].s), x.path.map(id => r.nodes[id].n)); }, [k, ids.root, ids.cousin]);
            assert.match(s, /est le cousin germain de/);
            const al = await api({ what: 'kinpath', a: ids.aunt, b: ids.root }); assert.ok(al.nodes[ids.aunt] && al.nodes[ids.paul], 'l’épouse de l’oncle et l’oncle');
            const sh = await api({ what: 'kinpath', a: ids.root, b: ids.cousin, share: '1' }); assert.equal(sh.nodes[ids.root].n, 'Personne vivante'); assert.equal(sh.nodes[ids.root].pid, 0); assert.equal(sh.nodes[ids.root].y, '');
            const c = await api({ what: 'completeness', gens: 8 }); assert.equal(c.rows.length, 8); assert.equal(c.rows[0].found, 1); assert.ok(c.rows.find(x => x.gen === 7).distinct < c.rows.find(x => x.gen === 7).found, 'implexe à la génération 7'); assert.ok(c.known.includes(1) && c.known.every(x => x < 1024));
            const ah = await api({ what: 'ahnentafel', gens: 7 }); assert.ok(ah.rows.length > 20 && ah.rows[0].sosa === 1 && ah.rows.some(r => r.again), 'implexe : « voir n° »'); assert.ok(ah.rows.some(r => r.marriage));
            const ap = await api({ what: 'ancplaces', gens: 6 }); assert.ok(ap.rows.length > 5 && ap.rows.every(r => Math.abs(r.lat) <= 90 && r.gen >= 1));
            for (const who of ['living', 'all', 'anc']) { const w = await api({ what: 'wheel', who, kinds: 'birth,union,death,fete' }); assert.ok(w.rows.length > 0, who); assert.ok(w.rows.every(r => /^\d\d-\d\d$/.test(r.date) && !r.label.includes(privName) && !r.ids.split(',').includes(String(ids.priv))), who + ' : jamais la fiche confidentielle'); }
            const wl = await api({ what: 'wheel', who: 'living', kinds: 'birth,fete', share: '1' }); assert.ok(wl.rows.some(r => r.label === 'Personne vivante') && wl.rows.some(r => r.kind === 'fete'));
            const pe = await api({ what: 'periods', step: 25 }); assert.ok(pe.rows.length > 3 && pe.rows.some(r => r.age > 0));
            const su = await api({ what: 'surnames', top: 4 }); assert.equal(su.series.length, 4); assert.equal(su.series[0].values.length, su.labels.length);
            const lv = await api({ what: 'alive', from: 1900, to: 1910 }); assert.equal(lv.rows.length, 11); assert.ok(lv.rows.every(r => r.n > 0));
            const pa = await api({ what: 'parallel' }); assert.ok(pa.rows.length > 3 && pa.rows.every(r => r.pid > 0 && r.group));
            const bad = await p.evaluate(() => window.LCNDA_APP.api('diagram_plus', { what: 'rien' }).then(() => 'ok', e => e.message)); assert.match(bad, /inconnu/);
            const b2 = await p.evaluate(() => window.LCNDA_APP.api('diagram_plus', { what: 'kinpath', a: 0, b: 1 }).then(() => 'ok', e => e.message)); assert.match(b2, /deux personnes/);
            const arr = await p.evaluate(() => fetch('api.php?action=diagram_plus&what=completeness&gens[]=5&root[]=1').then(r => r.status)); assert.equal(arr, 200);
            void auntName;
        });
        await tt('« Nouveau diagramme » : les 12 sortes rangées dans leur groupe, l’aide au survol', async () => {
            const pr = p.evaluate(() => window.LCNDA_EXT.diagramsInternals.chooseType());
            await p.waitForSelector('.h-dg-gallery .h-dg-tile');
            const groups = await p.$$eval('.h-dg-gallery h4', hs => Object.fromEntries(hs.map(h => [h.textContent, [...h.nextElementSibling.querySelectorAll('.h-dg-tile')].map(x => [x.textContent.trim(), x.getAttribute('title') || ''])])));
            assert.deepEqual(await p.evaluate(() => window.LCNDA_EXT.diagramPlus.KINDS), ALL);
            for (const k of ALL) { const { label, help } = await p.evaluate(k => window.LCNDA_EXT.diagramRender.KINDS[k], k); const tile = groups[GROUP[k]]?.find(([x]) => x.includes(label)); assert.ok(tile, `${k} dans ${GROUP[k]}`); assert.equal(tile[1], help, k + ' : aide'); }
            await shot(p, 'galerie', '.h-dg-gallery');
            await p.click('.h-dg-gallery [data-close]'); assert.equal(await pr, null);
            const st = await p.evaluate(() => window.LCNDA_EXT.diagramStatStyles().flatMap(([, l]) => l.map(([k]) => k)));
            for (const k of ['dplbarline', 'dpldiv', 'dplstep', 'dplhills']) assert.ok(st.includes('dg:' + k), k + ' dans l’Éditeur de graphiques');
        });
        await tt('chaque sorte s’ouvre dans l’éditeur et se dessine avec son exemple', async () => {
            for (const k of ALL) {
                await openKind(p, k); if (GROUP[k] === 'Cartes') await mapReady(p);
                const svg = await preview(p); assert.doesNotMatch(svg, /Dessin impossible|NaN/, k);
                await shot(p, 'exemple-' + k);
            }
        });
        const APP = {
            dplkin: [async () => { await setPk(p, 'dpl_a', ids.aunt); await setPk(p, 'dpl_b', ids.root); }, s => { assert.match(s, /est l’épouse de l’oncle de|est la tante/); assert.ok((s.match(/data-dfa-pid=/g) || []).length >= 3); }],
            dplgrav: [null, s => { assert.match(s, /data-geo-map/); assert.match(s, /s’est déplacé de/); }],
            dplgenmap: [null, s => assert.ok((s.match(/<circle/g) || []).length > 5)],
            dplcomp: [null, s => { assert.match(s, /Gén\. 7/); assert.match(s, /data-dfa-pids/); }],
            dplahn: [null, s => assert.match(s, /Génération 3 — Grands-parents/)],
            dplleeds: [null, s => { assert.match(s, /Grand-père paternel \(4\)|Grand-mère paternelle \(3\)/); assert.doesNotMatch(s, /Très proche/); }],
            dplwheel: [null, s => assert.ok((s.match(/<circle[^>]+data-dfa-pid/g) || []).length > 2)],
            dplbarline: [null, s => assert.match(s, /Âge moyen au décès/)],
            dpldiv: [null, s => assert.match(s, /Naissances/)],
            dplhills: [null, s => assert.match(s, /Martin|Durand|Petit/i)],
            dplpar: [null, s => assert.match(s, /Âge au décès/)],
            dplstep: [null, s => assert.match(s, /Personnes en vie|en \d{4}/)],
        };
        for (const k of ALL) {
            await tt(`« Depuis l’app » : ${k}`, async () => {
                const s = await fromApp(p, k, APP[k][0]); assert.doesNotMatch(s, /<img|Dessin impossible/); assert.equal(await p.evaluate(() => window.__xss), undefined);
                APP[k][1](s); await shot(p, 'base-' + k);
            });
        }
        await tt('chemin de parenté : la fiche confidentielle n’apparaît jamais par son nom', async () => {
            const s = await fromApp(p, 'dplkin', async () => { await setPk(p, 'dpl_a', ids.priv); await setPk(p, 'dpl_b', ids.root); });
            assert.doesNotMatch(s, new RegExp(privName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))); assert.match(s, /Fiche confidentielle/);
        });
        await tt('tableau d’ascendance : « 🖨 Imprimer le tableau… » ouvre la fenêtre Imprimer (L1)', async () => {
            await fromApp(p, 'dplahn'); await p.click('.h-dg-dlg [data-dg-tab="app"]'); await p.waitForSelector('.h-dg-dlg [data-dpl-print]');
            await p.click('.h-dg-dlg [data-dpl-print]');
            await p.waitForFunction(() => [...document.querySelectorAll('dialog[open]')].some(d => /Imprimer/.test(d.textContent) && d.querySelector('iframe')), null, { timeout: 10000 });
            await shot(p, 'imprimer-ahnentafel', 'dialog[open]:last-of-type');
            await p.evaluate(() => [...document.querySelectorAll('dialog[open]')].filter(d => !d.classList.contains('h-dg-dlg')).forEach(d => d.close()));
        });
        await tt('un clic dans une case posée : la fiche s’ouvre', async () => {
            await closeEditor(p);
            await p.evaluate(id => { const R = window.LCNDA_EXT.diagramRender, d = document.createElement('div'); d.id = 'dpl-one'; d.innerHTML = R.svg({ kind: 'dplahn', rows: [{ sosa: '1', name: 'Test', pid: String(id) }] }, 600); document.body.prepend(d); }, ids.paul);
            await p.$eval('#dpl-one [data-dfa-pid]', e => e.dispatchEvent(new MouseEvent('click', { bubbles: true })));
            await p.waitForFunction(id => window.LCNDA_APP.state.currentPersonId === id, ids.paul, { timeout: 8000 });
            await p.evaluate(() => document.getElementById('dpl-one')?.remove());
        });
        await tt('exports : SVG et PNG non vides (fenêtre commune)', async () => {
            for (const k of ['dplkin', 'dplwheel', 'dplgrav', 'dplbarline']) {
                const id = await p.evaluate(async k => { const R = window.LCNDA_EXT.diagramRender, s = { kind: k, ...R.KINDS[k].sample() }; const { kind, ...spec } = s; const r = await window.LCNDA_APP.api('save_diagram', {}, { method: 'POST', body: { name: 'Test ' + k, kind, spec } }); return Number(r.result?.id || r.id); }, k);
                for (const fmt of ['svg', 'png']) {
                    await p.evaluate(i => window.LCNDA_EXT.openDiagram(i), id); await p.waitForSelector('[data-dg-pexpdlg]');
                    if (k === 'dplgrav') await p.waitForTimeout(1500);
                    await p.click('[data-dg-pexpdlg]'); await p.click(`.ui-export-fmt[data-fmt="${fmt}"]`);
                    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 15000 }), p.click('[data-ui-go]')]);
                    const body = fs.readFileSync(await dl.path()); assert.ok(body.length > 2000, `${k} ${fmt} : ${body.length} octets`);
                    if (fmt === 'svg') assert.match(body.toString(), /^<svg[^>]+aria-label/); else assert.equal(body.slice(1, 4).toString(), 'PNG');
                    await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
                }
            }
        });
        await ctx.close();
        // 390 px et mode sombre
        for (const [w, h, dark] of [[390, 844, true], [390, 844, false], [1440, 950, true]]) {
            await tt(`${w} px${dark ? ', mode sombre' : ''} : chaque sorte se dessine, sans débordement`, async () => {
                const c2 = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: dark ? 'dark' : 'light' });
                const q = await c2.newPage(); watch(q, `${w}${dark ? ' sombre' : ''}`); await ready(q);
                if (dark) await q.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
                for (const k of ALL) {
                    await openKind(q, k); if (GROUP[k] === 'Cartes') await mapReady(q);
                    const svg = await preview(q); assert.doesNotMatch(svg, /Dessin impossible|NaN/, k);
                    const over = await q.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); assert.ok(over <= 1, `${k} : la page déborde de ${over} px`);
                    if (w === 390 || ['dplkin', 'dplwheel', 'dplgrav', 'dplleeds'].includes(k)) await shot(q, `${w}${dark ? '-sombre' : ''}-${k}`);
                }
                if (w === 390) { await q.click('.h-dg-dlg [data-dg-tab="app"]').catch(() => {}); await q.waitForTimeout(300); await shot(q, `${w}${dark ? '-sombre' : ''}-depuis-app`); }
                await c2.close();
            });
        }
        await tt('aucune erreur dans la page', async () => assert.deepEqual(errors, []));
    } finally {
        await browser.close(); proc.kill();
        fs.rmSync(tmp, { recursive: true, force: true });
    }
    console.log(`${failed ? '✗' : '✓'} douze diagrammes de plus : ${n} vérifications${failed ? `, ${failed} en échec` : ''}`);
    process.exit(failed ? 1 : 0);
})();
