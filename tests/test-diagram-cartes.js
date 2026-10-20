'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🗺️ Diagrammes « Cartes » (assets/js/heritage-diagram-cartes.js, lib/diagram_cartes.php, assets/data/geo/) :
 *     node tests/test-diagram-cartes.js            (DGM_SHOTS=dossier pour enregistrer des captures, DGM_PORT=port)
 * 1. Sans navigateur : les 12 fonds de carte se lisent (zones, noms français, codes), licences présentes ; les deux
 *    sortes au catalogue (famille Cartes) ; zones retrouvées par nom ou code (INSEE, NUTS, ISO, abréviations), lieux
 *    rattachés par leurs coordonnées ; seuils des classes ; projections réversibles ; textes et couleurs piégés
 *    échappés ; beaucoup de données sans figer (< 200 ms) ; dessin d'attente puis vrai dessin.
 *    Communes (France, Belgique, Suisse, Luxembourg) : fichiers compressés chargés à la demande, codes et noms,
 *    rapprochement par code puis nom + département, homonymes refusés, arrondissements et communes fusionnées,
 *    35 000 communes dessinées en temps borné ; encart de l'Île-de-France selon l'option et le cadrage.
 * 2. Navigateur (Playwright, sinon partie sautée), sur un vrai « php -S » avec une petite base : diagram_geo (lieux,
 *    paires, ancêtres) ; « Nouveau diagramme » (famille Cartes, vignettes dessinées) ; éditeur de chaque sorte
 *    (exemple, réglages, cadrage à la molette et au glisser, « Depuis l'app », tenu à jour, lieux à placer, flux
 *    ajouté avec le menu de choix des lieux), enregistrer, poser (case d'une Fiche), exporter (SVG, PNG, CSV) ;
 *    niveau « Communes » choisi dans les réglages (fichier chargé seulement alors), encart, SVG valide ;
 *    mode sombre et 390 px ; aucune erreur JavaScript.
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
const shots = process.env.DGM_SHOTS || '';

/* ── 1. Bac à sable ── */
const readGeo = url => fs.readFileSync(path.join(appRoot, String(url).split('?')[0]));
const sandbox = { window: {}, console, setTimeout, clearTimeout, performance, TextDecoder, Response, Blob, DecompressionStream,
    fetch: async url => { const b = readGeo(url); return { ok: true, json: async () => JSON.parse(b.toString('utf8')), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) }; } };
vm.createContext(sandbox);
for (const f of ['heritage-diagrams-render.js', 'heritage-diagram-cartes.js']) vm.runInContext(fs.readFileSync(path.join(appRoot, 'assets/js', f), 'utf8'), sandbox, { filename: f });
const ext = sandbox.window.LCNDA_EXT, R = ext.diagramRender, DC = ext.diagramCartes;
const MINE = ['choropleth', 'flowmap'];
const TRAP = '<img src=x onerror="window.__xss=1">\'"&';
const GEO = { 'monde-110m': 170, 'monde-50m': 230, continents: 7, 'fr-departements': 101, 'fr-regions': 18, 'be-provinces': 11, 'be-regions': 3, 'ch-cantons': 26, 'ch-regions': 7, 'lu-cantons': 12, 'eu-nuts1': 100, 'eu-nuts2': 280 };
const J = v => JSON.parse(JSON.stringify(v));

step('les 12 fonds de carte : fichiers légers, zones, noms français, codes, licences', async () => {
    const lic = fs.readFileSync(path.join(appRoot, 'assets/data/geo/LICENCES.txt'), 'utf8');
    for (const [id, min] of Object.entries(GEO)) {
        const size = fs.statSync(path.join(appRoot, 'assets/data/geo', id + '.json')).size; assert.ok(size < 400e3, `${id} : ${size} octets`);
        assert.ok(lic.includes(id + '.json'), `${id} dans LICENCES.txt`);
        const b = await DC.load(id); assert.ok(b.zones.length >= min, `${id} : ${b.zones.length} zones`); assert.ok(b.attr.startsWith('Fond : '), id);
    }
    for (const [id, code, name] of [['fr-departements', '35', 'Ille-et-Vilaine'], ['fr-departements', '2A', 'Corse-du-Sud'], ['fr-regions', '53', 'Bretagne'], ['be-provinces', 'BE21', 'Anvers'], ['ch-cantons', 'CH013', 'Genève'], ['lu-cantons', 'LU-ES', 'Esch-sur-Alzette'],
        ['eu-nuts1', 'DE2', 'Bavière'], ['eu-nuts2', 'ITC4', 'Lombardie'], ['monde-110m', 'US', 'États-Unis'], ['monde-50m', 'DE', 'Allemagne'], ['continents', 'AF', 'Afrique']]) {
        const z = DC.loaded(id).zones.find(x => x.id === code); assert.ok(z, `${id} ${code}`); assert.equal(z.name, name);
    }
    assert.ok(DC.loaded('fr-departements').zones.filter(z => z.outre).length === 5, 'outre-mer en encarts');
});
step('les deux sortes au catalogue, famille Cartes, avec exemple, réglages et branchements', () => {
    MINE.forEach(k => { const K = R.KINDS[k]; assert.ok(K && K.icon && K.label && K.grids.length && K.options.length > 10, k); assert.equal(K.group, 'Cartes');
        assert.equal(typeof K.resolve, 'function'); assert.equal(typeof K.afterDraw, 'function'); assert.equal(typeof K.fromApp?.bind, 'function'); assert.ok(K.sample().rows.length >= 5); });
});
step('zones retrouvées par nom, code ou abréviation (accents, tirets, « (code) »)', () => {
    const m = (id, s) => DC.matchZone(DC.loaded(id), s)?.id || null;
    assert.equal(m('fr-departements', 'ille et vilaine'), '35'); assert.equal(m('fr-departements', '35'), '35'); assert.equal(m('fr-departements', 'FRH03'), '35');
    assert.equal(m('fr-departements', 'Cotes d’Armor'), '22'); assert.equal(m('fr-departements', '2a'), '2A'); assert.equal(m('fr-departements', '1'), '01'); assert.equal(m('fr-departements', 'Département de la Mayenne'), '53');
    assert.equal(m('fr-departements', '35 - Ille-et-Vilaine'), '35'); assert.equal(m('fr-regions', 'FRH'), '53');
    assert.equal(m('ch-cantons', 'VD'), 'CH011'); assert.equal(m('ch-cantons', 'Waadt'), null); assert.equal(m('ch-cantons', 'Berne'), 'CH021'); assert.equal(m('ch-cantons', 'Bern'), 'CH021');
    assert.equal(m('be-provinces', 'Antwerpen'), 'BE21'); assert.equal(m('be-provinces', 'VLI'), 'BE22');
    assert.equal(m('monde-110m', 'USA'), 'US'); assert.equal(m('monde-110m', 'United States of America'), 'US'); assert.equal(m('monde-110m', '250'), 'FR'); assert.equal(m('eu-nuts2', 'Limbourg (BE22)'), 'BE22');
    assert.equal(m('fr-departements', TRAP), null);
});
step('lieux rattachés à leur zone par coordonnées, sinon par département ou pays', () => {
    const fr = DC.loaded('fr-departements'), w = DC.loaded('monde-110m');
    assert.equal(DC.zoneOfPlace(fr, { lat: 48.1147, lon: -1.6794 }).id, '35'); assert.equal(DC.zoneOfPlace(fr, { lat: 42.6973, lon: 9.4508 }).id, '2B');
    assert.equal(DC.zoneOfPlace(fr, { lat: 16.2411, lon: -61.5331 }).id, '971'); assert.equal(DC.zoneOfPlace(fr, { lat: null, lon: null, code: '', county: 'Mayenne' }).id, '53');
    assert.equal(DC.zoneOfPlace(fr, { lat: 45.5, lon: -73.56 }), null); assert.equal(DC.zoneOfPlace(w, { lat: 45.5, lon: -73.56 }).id, 'CA');
    assert.equal(DC.zoneOfPlace(DC.loaded('lu-cantons'), { lat: 49.4958, lon: 5.98 }).id, 'LU-ES');
});
step('seuils des classes : quantiles, même largeur, mes seuils ; dégradé', () => {
    const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 100];
    assert.deepEqual(J(DC.breaksOf(v, { classes: 5 })), [3, 5, 7, 9]); assert.deepEqual(J(DC.breaksOf(v, { classes: 4, method: 'equal' })), [26, 51, 76]);
    assert.deepEqual(J(DC.breaksOf(v, { classes: 4, method: 'manual', breaks: '50; 10 ;x; 10' })), [10, 50]);
    const s = DC.scaleOf(v, { colorMode: 'classes', classes: 3 }); assert.equal(s.cols.length, s.br.length + 1); assert.match(s.color(100), /^#[0-9a-f]{6}$/);
    assert.equal(DC.scaleOf([5, 5], {}).color(5), DC.scaleOf([5, 5], {}).color(5));
});
step('projections : aller et retour (Equal Earth, Robinson, Lambert, Mercator, azimutale)', () => {
    for (const [k, v] of [['equalearth', [-180, -57, 180, 83]], ['robinson', [-180, -57, 180, 83]], ['lambert', [-5, 41, 10, 51]], ['mercator', [-10, 35, 30, 60]], ['laea', [-5, 41, 10, 51]]]) {
        const pr = DC.fitProj(k, v, 800, 3000, true); const [x, y] = pr.p(2.35, 48.85); const [lo, la] = pr.inv(x, y);
        assert.ok(Math.abs(lo - 2.35) < .3 && Math.abs(la - 48.85) < .3, `${k} : ${lo}, ${la}`); assert.ok(x > 0 && x < 800 && y > 0 && y < pr.h, k);
    }
});
step('lieux des migrations : coordonnées tapées, lieux choisis, zones du fond', () => {
    const fr = DC.loaded('fr-departements'), w = DC.loaded('monde-110m'), spec = { places: { rennes: { lat: 48.11, lon: -1.68 } } };
    assert.deepEqual(J(DC.placeOf(spec, 'Rennes', [fr])), [-1.68, 48.11, 'Rennes']); assert.deepEqual(J(DC.placeOf({}, 'Brest 48.39, -4.49', [])), [-4.49, 48.39, 'Brest']);
    assert.deepEqual(J(DC.placeOf({}, 'Alger (36,75; 3,06)', [])), [3.06, 36.75, 'Alger']); assert.equal(DC.placeOf({}, 'Canada', [fr, w])[2], 'Canada');
    assert.equal(DC.placeOf({}, 'Nulle part', [fr, w]), null); assert.equal(DC.placeOf({ places: { x: { lat: 999, lon: 0 } } }, 'x', []), null);
});
step('carte du monde : la Russie (qui passe la ligne des 180°) est dessinée en entier, pas seulement ses îles', async () => {
    const k = R.KINDS.choropleth, smp = k.sample();
    for (const base of ['monde-110m', 'monde-50m']) {
        const s = R.svg(await k.resolve({ kind: 'choropleth', ...smp, o: { ...smp.o, map: 'monde', base, frame: 'monde' }, rows: [{ label: 'Russie', s0: 50 }, { label: 'Fidji', s0: 5 }] }), 900);
        const ru = [...s.matchAll(/<path[^>]*d="([^"]*)"[^>]*><title>Russie/g)][0];
        assert.ok(ru && ru[1].length > 3000, `${base} : contour de la Russie trop court (${ru ? ru[1].length : 0})`);
    }
});
step('chaque exemple se dessine (900 et 390 px), nom pour les lecteurs d’écran, source du fond rappelée', async () => {
    for (const k of MINE) for (const W of [900, 390]) {
        const s = R.svg(await R.KINDS[k].resolve({ kind: k, ...R.KINDS[k].sample() }), W);
        assert.match(s, /^<svg [^>]*role="img" aria-label="[^"]+"/, k); assert.doesNotMatch(s, /Dessin impossible|NaN|undefined|Infinity|data-geo-wait/, `${k} ${W}`); assert.match(s, /Fond : /);
        assert.match(s, /<title>[^<]+<\/title>/, 'valeur au survol');
    }
});
step('tous les fonds, niveaux, cadrages et projections se dessinent', async () => {
    for (const [map, M] of Object.entries(DC.MAPS)) for (const [level] of M.levels) for (const proj of ['', 'robinson', 'lambert']) {
        const spec = await R.KINDS.choropleth.resolve({ kind: 'choropleth', o: { map, level, proj, labels: 'both', colorMode: proj ? 'classes' : '' }, series: [{ name: 'N' }], rows: [{ label: 'x', s0: 1 }] });
        const s = R.svg(spec, 700); assert.doesNotMatch(s, /NaN|Infinity|Dessin impossible|data-geo-wait/, `${map} ${level} ${proj}`);
    }
    for (const [f] of DC.FRAMES_WORLD) { const s = R.svg(await R.KINDS.flowmap.resolve({ kind: 'flowmap', o: { map: 'monde', frame: f }, rows: [{ from: 'France', to: 'Canada', value: 3 }] }), 600); assert.doesNotMatch(s, /NaN|Infinity|data-geo-wait/, f); }
});
step('zone libre (cadrage à soi) plate, à l’envers ou hors du monde : la carte entière, jamais de NaN', async () => {
    for (const view of ['200 0 300 10', '-500 10 -400 20', '0 90 10 95', '5 45 5 46', '10 50 0 40', 'a b c d', '', '1 2 3']) for (const k of MINE) {
        const s = R.svg(await R.KINDS[k].resolve({ kind: k, ...R.KINDS[k].sample(), o: { ...(R.KINDS[k].sample().o || {}), frame: 'custom', view } }), 600);
        assert.doesNotMatch(s, /NaN|Infinity|Dessin impossible|data-geo-wait/, `${k} « ${view} »`);
    }
});
step('textes et couleurs piégés : échappés, couleurs refusées', async () => {
    const s1 = R.svg(await R.KINDS.choropleth.resolve({ kind: 'choropleth', o: { title: TRAP, unit: TRAP, noData: 'red;background:url(x)', borderColor: '"><script>', ramp: 'perso', lowColor: 'url(javascript:x)' }, series: [{ name: TRAP }], rows: [{ label: 'Ille-et-Vilaine', s0: '3', note: TRAP }, { label: TRAP, s0: 1 }] }), 800);
    const s2 = R.svg(await R.KINDS.flowmap.resolve({ kind: 'flowmap', o: { unit: TRAP, flowColor: 'expression(alert(1))' }, places: { [TRAP]: { lat: 48, lon: 0 } }, rows: [{ from: TRAP, to: 'Paris 48.85, 2.35', value: 5, color: 'url(x)' }] }), 800);
    for (const s of [s1, s2]) { assert.doesNotMatch(s, /<img|<script|onerror="|url\((?!#dgm)|expression\(/); assert.match(s, /&lt;img/); }
});
step('beaucoup de données sans figer : 5 000 lignes, 2 000 flux (< 200 ms) ; lignes abîmées', async () => {
    const zones = DC.loaded('eu-nuts2').zones;
    const big = await R.KINDS.choropleth.resolve({ kind: 'choropleth', o: { map: 'eu', level: 'nuts2', labels: 'both' }, rows: Array.from({ length: 5000 }, (_, i) => ({ label: zones[i % zones.length].id, s0: i * 1e9 })) });
    let t = performance.now(); R.svg(big, 1200); const t1 = performance.now() - t; t = performance.now(); R.svg(big, 1200); const t2 = performance.now() - t; console.log("  temps", Math.round(t1), Math.round(t2)); assert.ok(t1 < 200 && t2 < 200, `choroplèthe : ${t1} / ${t2} ms`);
    const fl = await R.KINDS.flowmap.resolve({ kind: 'flowmap', o: { map: 'monde', level: 'pays' }, rows: Array.from({ length: 2000 }, (_, i) => ({ from: `A${i} ${(i % 140) - 70}, ${(i * 7) % 340 - 170}`, to: `B${i} ${(i * 3 % 140) - 70}, ${(i * 11) % 340 - 170}`, value: i })) });
    t = performance.now(); const s = R.svg(fl, 1200); assert.ok(performance.now() - t < 200, `flux : ${performance.now() - t} ms`); assert.ok((s.match(/class="dgm-f"/g) || []).length <= 500);
    for (const k of MINE) { const out = R.svg(await R.KINDS[k].resolve({ kind: k, o: { height: 'x', classes: 99, maxWidth: -5, view: 'a,b', frame: 'custom' }, rows: [null, 3, 'x', { label: {}, s0: [], from: 1, to: {} }] }), 500); assert.doesNotMatch(out, /NaN|Infinity|Dessin impossible/, k); }
});
const COMMUNES = { 'fr-communes': [34000, 3.2e6], 'be-communes': [560, 4e5], 'ch-communes': [2000, 6e5], 'lu-communes': [100, 1e5] };
step('communes : France, Belgique, Suisse, Luxembourg (fichiers compressés, codes, noms, départements ou cantons, licences)', async () => {
    const lic = fs.readFileSync(path.join(appRoot, 'assets/data/geo/LICENCES.txt'), 'utf8');
    for (const [id, [min, max]] of Object.entries(COMMUNES)) {
        const size = fs.statSync(path.join(appRoot, 'assets/data/geo', id + '.json.gz')).size; assert.ok(size < max, `${id} : ${size} octets`);
        assert.ok(lic.includes(id + '.json.gz'), `${id} dans LICENCES.txt`);
        const b = await DC.load(id); assert.ok(b.zones.length >= min, `${id} : ${b.zones.length} communes`); assert.ok(b.attr.startsWith('Fond : '), id); assert.ok(b.communes && b.lines.length > 10, id);
        assert.ok(b.zones.every(z => z.id && z.name && z.parent && z.label.every(Number.isFinite)), `${id} : code, nom, parent, étiquette`);
    }
    for (const [id, code, name, parent] of [['fr-communes', '35238', 'Rennes', '35'], ['fr-communes', '2A004', 'Ajaccio', '2A'], ['fr-communes', '97101', 'Les Abymes', '971'], ['fr-communes', '75056', 'Paris', '75'],
        ['be-communes', '21004', 'Bruxelles', 'BE10'], ['be-communes', '62063', 'Liège', 'BE33'], ['ch-communes', '351', 'Bern', 'CH021'], ['ch-communes', '6621', 'Genève', 'CH013'], ['lu-communes', '0304', 'Luxembourg', 'LU-LU']]) {
        const z = DC.loaded(id).zones.find(x => x.id === code); assert.ok(z, `${id} ${code}`); assert.equal(z.name, name); assert.equal(z.parent, parent, `${id} ${code} : parent`);
    }
    assert.equal(DC.loaded('fr-communes').zones.filter(z => z.outre).length > 100, true, 'communes d’outre-mer en encarts');
    assert.ok(R.KINDS.choropleth.options.some(o => o.k === 'level' && o.choices.some(([k, l]) => k === 'com' && /Communes/.test(l))), 'niveau « Communes » dans les réglages');
    for (const m of ['fr', 'be', 'ch', 'lu']) assert.ok(DC.MAPS[m].levels.some(([l, f]) => l === 'com' && f === m + '-communes'), m);
});
step('rapprochement des communes : code INSEE ou officiel, nom + département, homonymes refusés, arrondissements, fusions', async () => {
    await DC.load('fr-departements');
    const fr = DC.loaded('fr-communes'), mc = (s, b = fr) => { const r = DC.matchCommune(b, s); return r.z ? r.z.id : 'null:' + r.why; };
    assert.equal(mc('35238'), '35238'); assert.equal(mc('Rennes'), '35238'); assert.equal(mc('rennes'), '35238'); assert.equal(mc('St-Malo'), '35288'); assert.equal(mc('Le Mans'), '72181'); assert.equal(mc('Mans'), '72181');
    assert.equal(mc('Saint-Martin'), 'null:homonymes'); assert.equal(mc('Saint-Denis'), 'null:homonymes');
    for (const s of ['Saint-Martin (Gers)', 'Saint-Martin, Gers', 'saint-martin gers', 'Saint-Martin 32', 'Saint-Martin (32)', 'Saint-Martin 32000']) assert.equal(mc(s), '32389', s);
    assert.equal(mc('Saint-Denis 93'), '93066'); assert.equal(mc('Saint-Denis (La Réunion)'), '97411'); assert.equal(mc('Vitré (35)'), '35360');
    for (const s of ['75112', 'Paris 12e', 'Paris 1er Arrondissement']) assert.equal(mc(s), '75056', s);
    assert.equal(mc('69383'), '69123'); assert.equal(mc('Lyon 3e'), '69123'); assert.equal(mc('13205'), '13055'); assert.equal(mc('Marseille 5e Arrondissement'), '13055');
    assert.equal(mc('Annecy-le-Vieux'), '74010'); assert.equal(mc('74011'), '74010'); assert.equal(mc('Cherbourg-Octeville'), '50129'); assert.equal(mc('Courcouronnes'), '91228'); // communes fusionnées
    assert.equal(mc('Nulle part du tout'), 'null:'); assert.equal(mc(TRAP), 'null:');
    // lieux de la base (api diagram_geo) : code d'abord, puis nom + département, puis coordonnées ; un autre pays n'est pas pris par son nom
    const zp = (pl, b = fr) => { const why = {}; const z = DC.zoneOfPlace(b, { lat: null, lon: null, ...pl }, why); return z ? z.id : 'null:' + (why.why || ''); };
    assert.equal(zp({ name: 'Rennes', insee: '35238' }), '35238'); assert.equal(zp({ name: 'Mauvais nom', insee: '35238' }), '35238');
    assert.equal(zp({ name: 'Saint-Martin', code: '32', county: 'Gers' }), '32389'); assert.equal(zp({ name: 'Saint-Martin', county: 'Gers' }), '32389');
    assert.equal(zp({ name: 'Saint-Martin' }), 'null:homonymes'); assert.equal(zp({ name: 'Rennes', country: 'Belgique' }), 'null:');
    assert.equal(zp({ name: 'Le bourg', lat: 48.1147, lon: -1.6794 }), '35238'); assert.equal(zp({ name: 'Paris', insee: '75120' }), '75056');
    assert.equal(zp({ name: 'Zwijndrecht', insee: 'BE-46030' }, DC.loaded('be-communes')), '46030'); assert.equal(mc('Anvers', DC.loaded('be-communes')), '11002'); assert.equal(mc('Antwerpen', DC.loaded('be-communes')), '11002');
    assert.equal(zp({ name: 'Bern', insee: 'CH-351' }, DC.loaded('ch-communes')), '351'); assert.equal(mc('Berne', DC.loaded('ch-communes')), '351');
    assert.equal(zp({ name: 'Wormeldange', insee: 'LU-1108' }, DC.loaded('lu-communes')), '1108'); assert.equal(mc('Wormeldingen', DC.loaded('lu-communes')), '1108');
    // le tableau : les lignes pas trouvées, avec la raison
    const { byZone, missing } = DC.joinRows({ rows: [{ label: 'Saint-Martin', s0: 1 }, { label: 'Saint-Martin (Gers)', s0: 2 }, { label: '35238', s0: 3 }, { label: 'Rennes', s0: 4 }] }, fr);
    assert.equal(byZone.size, 2); assert.equal(byZone.get(fr.zones.find(z => z.id === '35238')).v, 7); assert.match(missing.join(' | '), /^Saint-Martin \(homonymes/);
});
step('encart de l’Île-de-France : présent ou absent selon l’option, le niveau et le cadrage', async () => {
    const k = R.KINDS.choropleth, smp = k.sample(), draw = async (o, W = 900) => R.svg(await k.resolve({ kind: 'choropleth', ...smp, o: { ...smp.o, ...o } }), W);
    const has = s => /data-geo-inset="idf"/.test(s);
    const dep = await draw({}); assert.ok(has(dep), 'départements : encart par défaut'); assert.match(dep, /Paris et petite couronne/);
    assert.match(dep.split('data-geo-inset')[1], /<title>Paris \(75\) : 11 naissances/, 'même bulle dans l’encart'); assert.match(dep.split('data-geo-inset')[1], /class="dgm-z"/);
    assert.ok(!has(await draw({ idf: 'none' })), 'option « Aucun »');
    assert.ok(!has(await draw({ level: 'reg' })), 'régions : pas d’encart par défaut'); assert.ok(has(await draw({ level: 'reg', idf: 'idf' })), 'régions : toute l’Île-de-France si on le demande');
    assert.match(await draw({ idf: 'idf' }), /Île-de-France<\/text>/);
    for (const o of [{ frame: 'idf' }, { frame: 'corse' }, { frame: 'sudouest' }, { frame: 'custom', view: '-5, 47, -1, 49' }, { frame: 'custom', view: '2.1, 48.7, 2.6, 49' }, { frame: 'zone', frameZone: '75' }, { map: 'be' }, { map: 'monde' }])
        assert.ok(!has(await draw(o)), `pas d’encart : ${JSON.stringify(o)}`);
    assert.ok(has(await draw({ frame: 'custom', view: '-1, 46, 6, 50.5' })), 'zone libre qui contient Paris');
    const narrow = await draw({}, 390); assert.ok(has(narrow), '390 px : encart (sous la carte)'); assert.doesNotMatch(narrow, /NaN|undefined|Infinity/);
    const com = await draw({ level: 'com', rows: undefined }); assert.ok(has(com), 'communes : encart par défaut');
});
step('communes : 35 000 dessinées en temps borné, traits fins, limites des départements, étiquettes seulement avec un chiffre', async () => {
    const k = R.KINDS.choropleth, fr = DC.loaded('fr-communes');
    const few = await k.resolve({ kind: 'choropleth', o: { map: 'fr', level: 'com' }, series: [{ name: 'N' }], rows: [{ label: 'Rennes', s0: 5 }, { label: 'Brest', s0: 2 }] });
    let t = performance.now(); const s1 = R.svg(few, 902); const t1 = performance.now() - t; t = performance.now(); R.svg(few, 902); const t2 = performance.now() - t; // 902 : pas encore en mémoire
    const all = await k.resolve({ kind: 'choropleth', o: { map: 'fr', level: 'com', colorMode: 'classes' }, series: [{ name: 'N' }], rows: fr.zones.map((z, i) => ({ label: z.id, s0: i % 50 })) });
    t = performance.now(); const s3 = R.svg(all, 902); const t3 = performance.now() - t;
    console.log(`  temps de dessin des communes (900 px) : ${Math.round(t1)} ms la 1re fois, ${Math.round(t2)} ms ensuite, ${Math.round(t3)} ms avec ${fr.zones.length} chiffres`);
    assert.ok(t1 < 3000 && t2 < 400 && t3 < 1500, `${t1} / ${t2} / ${t3} ms`);
    assert.match(s1, /stroke-width="0.2"/, 'traits fins'); assert.match(s1, /fill="none" stroke="#4a4f57"/, 'limites des départements');
    assert.ok((s1.match(/<text /g) || []).length < 30, 'pas une étiquette par commune'); assert.ok((s3.match(/<text /g) || []).length < 500, 'étiquettes seulement là où elles tiennent'); assert.ok((s1.match(/class="dgm-z"/g) || []).length < 300, 'bulles seulement sur les communes avec un chiffre');
    assert.ok((s3.match(/class="dgm-z"/g) || []).length > 25000, `${(s3.match(/class="dgm-z"/g) || []).length} communes avec bulle`); assert.doesNotMatch(s1 + s3, /NaN|undefined|Infinity|data-geo-wait/);
    // cadrage sur un département : ses communes, sans encarts
    const z35 = R.svg(await k.resolve({ kind: 'choropleth', o: { map: 'fr', level: 'com', frame: 'zone', frameZone: 'Ille-et-Vilaine' }, rows: [{ label: 'Vitré', s0: 3 }] }), 900);
    assert.match(z35, /<title>Vitré \(35360\) : 3/); assert.match(z35, />Vitré<\/text>/, 'étiquette de la commune qui a un chiffre'); assert.doesNotMatch(z35, /Guadeloupe|data-geo-inset/);
    for (const m of ['be', 'ch', 'lu']) { const s = R.svg(await k.resolve({ kind: 'choropleth', o: { map: m, level: 'com' }, rows: [{ label: DC.loaded(m + '-communes').zones[3].id, s0: 1 }] }), 390); assert.doesNotMatch(s, /NaN|Infinity|data-geo-wait/, m); assert.match(s, /Fond : /); }
});
step('champ « Zone » : propositions mélangées (zones de chaque niveau, villes), valeur sans ambiguïté, ville comptée dans sa zone', async () => {
    for (const id of ['fr-departements', 'fr-regions', 'fr-communes', 'be-provinces', 'be-regions', 'be-communes', 'monde-110m', 'continents']) await DC.load(id);
    const sp = (o, rows = []) => ({ kind: 'choropleth', o: { map: 'fr', level: 'dep', ...o }, rows: rows.map(label => ({ label, s0: 1 })) });
    const mo = DC.zoneSuggest(sp({}), 'Montreuil');
    assert.deepEqual(J(mo.slice(0, 3).map(x => x.value)), ['Montreuil (28)', 'Montreuil (85)', 'Montreuil (93)']); assert.ok(mo.every(x => x.icon === '🏘' && x.kind === 'ville' && x.remember));
    assert.match(mo[2].meta, /^Seine-Saint-Denis · Île-de-France/); assert.ok(mo.some(x => x.value === 'Montreuil-sur-Mer' && /aussi « Montreuil »/.test(x.meta)));
    const pa = DC.zoneSuggest(sp({}), 'Paris'); assert.equal(pa[0].kind, 'département'); assert.equal(pa[0].icon, '🏛'); assert.equal(pa[0].remember, false); assert.ok(pa.some(x => x.kind === 'ville'));
    assert.equal(DC.zoneSuggest(sp({}), '35')[0].value, 'Ille-et-Vilaine'); assert.equal(DC.zoneSuggest(sp({}), 'Saint-Martin 32')[0].value, 'Saint-Martin (32)');
    const br = DC.zoneSuggest(sp({}), 'Bretagne')[0]; assert.equal(br.kind, 'région'); assert.ok(br.coarse && !br.remember, 'région : plus large que les départements');
    assert.equal(DC.zoneSuggest(sp({ map: 'monde', level: 'pays' }), 'Afr')[0].icon, '🌍'); assert.equal(DC.zoneSuggest(sp({ map: 'be', level: 'prov' }), 'Anvers')[1].value, 'Anvers');
    assert.deepEqual(J(DC.zoneSuggest(sp({}), TRAP)), []);
    // « Montreuil » seul n'est plus pris pour Montreuil-sur-Mer : homonymes
    assert.equal(DC.matchCommune(DC.loaded('fr-communes'), 'Montreuil').why, 'homonymes'); assert.equal(DC.matchCommune(DC.loaded('fr-communes'), 'Montreuil-sur-Mer').z.id, '62588');
    // une ville choisie : comptée dans son département, sa région, ou elle-même ; « (93) » n'est pas la région n°93
    const s = sp({}, ['Montreuil (93)']); s.rows[0].s0 = 5; DC.rememberPick(s, mo[2].value, mo[2]); assert.equal(s.places['montreuil 93'].k, 'com');
    for (const [lv, base, want] of [['dep', 'fr-departements', 'Seine-Saint-Denis'], ['reg', 'fr-regions', 'Île-de-France'], ['com', 'fr-communes', 'Montreuil']]) {
        const { byZone, missing } = DC.joinRows({ ...s, o: { ...s.o, level: lv } }, DC.loaded(base)); assert.deepEqual(J([...byZone].map(([z, e]) => [z.name, e.v])), [[want, 5]], lv); assert.deepEqual(J(missing), []); }
    assert.equal(DC.matchZone(DC.loaded('fr-regions'), 'Montreuil (93)'), null);
    // l'état de chaque ligne : pastille pour homonymes, autre niveau, inconnu ; une ville tapée à la main est retenue
    const st = (o, v) => { const r = DC.rowStatus(sp(o, [v]), v); return r.ok ? 'ok' : r.auto ? 'auto:' + r.auto.z.name : r.why; };
    assert.equal(st({}, 'Montreuil'), 'homonymes'); assert.match(DC.rowStatus(sp({}, ['Montreuil']), 'Montreuil').msg, /Plusieurs villes s’appellent Montreuil \(3\) : choisis-en une/);
    assert.equal(st({}, 'Rennes'), 'auto:Rennes'); assert.equal(st({}, 'Bretagne'), 'niveau'); assert.equal(st({}, 'Nulle part'), 'inconnu'); assert.equal(st({}, '35'), 'ok');
    assert.equal(st({ level: 'reg' }, '35'), 'auto:Ille-et-Vilaine'); assert.equal(st({ level: 'com' }, 'Montreuil (93)'), 'ok'); assert.equal(st({ level: 'com' }, 'Ille-et-Vilaine'), 'niveau');
    const { missing } = DC.joinRows(sp({}, ['Montreuil']), DC.loaded('fr-departements')); assert.match(missing[0], /plusieurs villes de ce nom/);
    // « Quoi » : quatre groupes, les nouvelles sources ; clés « tenu à jour » : anciennes toujours lues, sorte d'événement en plus
    assert.deepEqual(J(DC.SRC_GROUPS.map(g => g[0])), ['Événements', 'Personnes', 'Valeurs', 'Autres']);
    for (const k of ['baptisms', 'burials', 'residences', 'census', 'occupations', 'departures', 'arrivals', 'people', 'surnames', 'age_death', 'sourced', 'type']) assert.ok(DC.SRC_GROUPS.some(g => g[1].some(x => x[0] === k)), k);
    assert.deepEqual(J(DC.parseLive('geo:births:1:1700:')), { what: 'births', ancestors: 1, from: 1700 }); assert.deepEqual(J(DC.parseLive('geo:type:0::1900:12')), { what: 'type', to: 1900, type: 12 });
    assert.equal(DC.liveKey({ what: 'type', type: 12, from: 1800 }), 'geo:type:0:1800::12'); assert.equal(DC.liveKey({ what: 'age_death' }), 'geo:age_death:0::');
    assert.equal(DC.parseLive('geo:type:0::'), null); assert.equal(DC.parseLive('geo:births:0:::3'), null);
});
step('sans fond chargé : un dessin d’attente, refait tout seul ; chiffres tenus à jour', () => {
    const s = R.svg({ kind: 'choropleth', o: { map: 'zz' } }, 600); assert.doesNotMatch(s, /NaN/);
    assert.deepEqual(J(DC.parseLive(DC.liveKey({ what: 'births', ancestors: 1, from: 1700 }))), { what: 'births', ancestors: 1, from: 1700 });
    assert.equal(DC.parseLive('geo:../../x:0::'), null); assert.equal(DC.parseLive('my:cw_x'), null);
});

/* ── 2. Navigateur ── */
let chromium = null;
try { ({ chromium } = require('playwright')); } catch (_) { try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
const phpPath = findPhp([devBundledPhp()]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-cartes-'));
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const SEED = String.raw`<?php
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$tag = fn($t) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag=" . $pdo->quote($t) . " LIMIT 1")->fetchColumn();
$pid = [];
foreach ([['Rennes','Ille-et-Vilaine','France',48.1147,-1.6794,'35'],['Paris','Paris','France',48.8566,2.3522,'75'],['Nantes','Loire-Atlantique','France',47.2184,-1.5536,'44'],['Vitré','Ille-et-Vilaine','France',48.1236,-1.2094,'35'],
  ['Brest','Finistère','France',48.3904,-4.4861,'29'],['Liège','Liège','Belgique',50.6326,5.5797,''],['Montréal','Québec','Canada',45.5017,-73.5673,''],['Vieux bourg','Mayenne','France',null,null,'53'],['<img src=x onerror=alert(1)>','','',null,null,'']] as $pl) {
  $pdo->prepare('INSERT INTO places(name,county,country,latitude,longitude,admin2_code) VALUES(?,?,?,?,?,?)')->execute($pl); $pid[$pl[0]] = (int) $pdo->lastInsertId(); }
$person = function ($f, $by, $bp, $dy = null, $dp = null) use ($pdo, $tag, $pid) { $pdo->prepare("INSERT INTO persons(first_name,last_name,gender) VALUES(?,'Martin','male')")->execute([$f]); $id = (int) $pdo->lastInsertId();
  if ($bp) $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,year,date_text,place_id) VALUES('person',?,?,?,?,?)")->execute([$id, $tag('BIRT'), $by, "$by", $pid[$bp]]);
  if ($dp) $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,year,date_text,place_id) VALUES('person',?,?,?,?,?)")->execute([$id, $tag('DEAT'), $dy, "$dy", $pid[$dp]]); return $id; };
$fam = function ($a, $b, $y, $pl, $kids) use ($pdo, $tag, $pid) { $pdo->prepare('INSERT INTO families(partner1_id,partner2_id) VALUES(?,?)')->execute([$a, $b]); $f = (int) $pdo->lastInsertId();
  $pdo->prepare("INSERT INTO events(scope,family_id,event_type_id,year,date_text,place_id) VALUES('family',?,?,?,?,?)")->execute([$f, $tag('MARR'), $y, "$y", $pid[$pl]]);
  foreach ($kids as $k) $pdo->prepare('INSERT INTO family_children(family_id,child_id) VALUES(?,?)')->execute([$f, $k]); };
$me = $person('Moi', 1990, 'Paris'); $pdo->exec("UPDATE persons SET is_start=1 WHERE id=$me");
$fa = $person('Père', 1955, 'Rennes', 2015, 'Paris'); $mo = $person('Mère', 1958, 'Brest'); $fam($fa, $mo, 1985, 'Nantes', [$me]);
$gf = $person('Grand-père', 1920, 'Vitré', 1990, 'Rennes'); $gm = $person('Grand-mère', 1924, 'Vieux bourg', 2001, 'Rennes'); $fam($gf, $gm, 1950, 'Vitré', [$fa]);
for ($i = 0; $i < 30; $i++) { $pl = ['Rennes','Nantes','Liège','Montréal','<img src=x onerror=alert(1)>']; $person("Cousin$i", 1800 + $i, $pl[$i % 5], 1870 + $i, $pl[($i + 1) % 5]); }
echo 'ok';`;

(async () => {
    for (const [name, fn] of steps) { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } }
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); process.exit(failed ? 1 : 0); }
    fs.mkdirSync(path.join(tmp, 'media'), { recursive: true });
    const seedFile = path.join(tmp, 'seed.php'); fs.writeFileSync(seedFile, SEED);
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), seedFile], { cwd: appRoot, encoding: 'utf8', env: envFor(tmp) });
    if (r.status !== 0 || !/ok/.test(r.stdout)) { console.error(r.stderr || r.stdout); process.exit(1); }
    const port = Number(process.env.DGM_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(tmp), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch();
    const errors = [];
    const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
    const shot = async (p, name, el) => { if (!shots) return; fs.mkdirSync(shots, { recursive: true }); await (el ? (await p.$(el)).screenshot({ path: path.join(shots, name + '.png') }) : p.screenshot({ path: path.join(shots, name + '.png') })); };
    const closeAll = p => p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => { d.close(); d.remove(); }));
    try {
        await t('serveur : lieux comptés, paires de migrations, ancêtres, période ; sorte inconnue ramenée aux naissances', async () => {
            const get = async q => (await fetch(`${base}api.php?action=diagram_geo&${q}`)).json();
            const b = await get('what=births'); const rn = b.places.find(x => x.name === 'Rennes'); assert.equal(rn.n, 7); assert.equal(rn.code, '35'); assert.equal(rn.lat, 48.1147);
            assert.ok(b.places.some(x => x.name.startsWith('<img')), 'nom piégé renvoyé tel quel (échappé au dessin)');
            const bd = await get('what=birth_death'); assert.ok(bd.pairs.length >= 5); assert.ok(bd.pairs.every(([a, c, n]) => a !== c && n > 0));
            const anc = await get('what=births&ancestors=1'); assert.equal(anc.places.reduce((s, x) => s + x.n, 0), 5);
            const age = await get('what=age_death'); assert.equal(age.avg, true); assert.equal(age.unit, 'ans'); assert.equal(age.places.find(x => x.name === 'Paris')?.n, 60); assert.ok(age.places.every(x => x.w > 0));
            const dep = await get('what=departures&ancestors=1'); assert.deepEqual(dep.places.map(x => x.name + ':' + x.n).sort(), ['Rennes:1', 'Vieux bourg:1', 'Vitré:1']);
            const ppl = await get('what=people'); assert.equal(ppl.distinct, true); assert.ok(ppl.places.every(x => Array.isArray(x.k) && x.k.length === x.n));
            const ty = await get('list=types'); assert.ok(ty.types.length > 20 && ty.types[0].usage_count > 0);
            const bt = await get('what=type&type=' + ty.types.find(x => x.gedcom_tag === 'MARR').id); assert.equal(bt.places.length, 2); assert.equal(bt.type.label, 'Mariage');
            const gen = await get('what=generation&ancestors=1'); assert.equal(gen.pairs.reduce((s, x) => s + x[2], 0), 4);
            const per = await get('what=births&from=1950&to=1960'); assert.equal(per.places.reduce((s, x) => s + x.n, 0), 2);
            assert.equal((await get('what=../../etc')).what, 'births'); assert.equal((await get('what=marriages')).places.length, 2);
        });
        for (const [label, opts] of [['clair, 1280 px', { viewport: { width: 1280, height: 900 } }], ['sombre, 390 px', { viewport: { width: 390, height: 844 }, colorScheme: 'dark' }]]) {
            const ctx = await browser.newContext({ ...opts, acceptDownloads: true });
            const p = await ctx.newPage(), narrow = opts.viewport.width < 500, tag = narrow ? '390-sombre' : '1280';
            p.on('pageerror', e => errors.push(e.message));
            p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
            p.on('dialog', d => { errors.push('dialogue : ' + d.message()); d.dismiss(); });
            await p.goto(base);
            await p.waitForFunction(() => window.LCNDA_APP?.state && window.LCNDA_EXT?.diagramsInternals && window.LCNDA_EXT?.diagramCartes, null, { timeout: 20000 });
            await p.waitForTimeout(500);
            await t(`les fonds ne se chargent pas au démarrage (${label})`, async () => {
                assert.equal(await p.evaluate(() => performance.getEntriesByType('resource').filter(e => /assets\/data\/geo\//.test(e.name)).length), 0);
            });
            await t(`chaque dessin est un SVG valide, qui s’ouvre comme une image (${label})`, async () => {
                const r = await p.evaluate(async () => { const R = window.LCNDA_EXT.diagramRender, out = [];
                    const specs = [...['choropleth', 'flowmap'].map(k => [k, { kind: k, ...R.KINDS[k].sample() }]), ['communes', { kind: 'choropleth', ...R.KINDS.choropleth.sample(), o: { map: 'fr', level: 'com', labels: 'both' }, rows: [{ label: 'Rennes', s0: 3 }, { label: '75112', s0: 2 }] }],
                        ['communes-be', { kind: 'choropleth', o: { map: 'be', level: 'com' }, rows: [{ label: 'Liège', s0: 3 }] }], ['encart-idf', { kind: 'choropleth', ...R.KINDS.choropleth.sample(), o: { map: 'fr', level: 'reg', idf: 'idf' } }]];
                    for (const [k, sp] of specs) { const svg = R.svg(await R.KINDS[sp.kind].resolve(sp));
                        if (new DOMParser().parseFromString(svg, 'image/svg+xml').querySelector('parsererror')) out.push(k + ' : XML');
                        if (!await new Promise(ok => { const i = new Image(); i.onload = () => ok(true); i.onerror = () => ok(false); i.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })); })) out.push(k + ' : image'); }
                    return out; });
                assert.deepEqual(r, []);
            });
            await t(`« Nouveau diagramme » : famille Cartes, deux vignettes dessinées (${label})`, async () => {
                await p.evaluate(() => { window.__chose = window.LCNDA_EXT.diagramsInternals.chooseType(); });
                await p.waitForSelector('dialog.h-dg-gallery[open] .h-dg-tile');
                await p.waitForFunction(() => !document.querySelector('dialog.h-dg-gallery [data-geo-wait]'), null, { timeout: 10000 });
                const tiles = await p.$$eval('dialog.h-dg-gallery .h-dg-tile', els => els.map(e => ({ text: e.textContent, map: !!e.querySelector('svg [data-geo-map]'), group: e.closest('.h-dg-tiles')?.previousElementSibling?.textContent })));
                for (const k of ['Carte colorée par zones', 'Carte des migrations']) { const tl = tiles.find(x => x.text.includes(k)); assert.ok(tl, k); assert.ok(tl.map, k + ' : vignette'); assert.equal(tl.group, 'Cartes'); }
                assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'pas de défilement de côté');
                if (shots) { await p.evaluate(() => [...document.querySelectorAll('dialog.h-dg-gallery h4')].find(x => x.textContent === 'Cartes')?.scrollIntoView()); await shot(p, `planche-vignettes-${tag}`); }
                await p.click('dialog.h-dg-gallery [data-close]');
            });
            for (const k of MINE) {
                await t(`${k} : éditeur, réglages, cadrage, depuis l’app, enregistrer, poser, exporter (${label})`, async () => {
                    await closeAll(p); await p.evaluate(kind => { window.__ed = window.LCNDA_EXT.openDiagramEditor(null, { kind }); }, k);
                    await p.waitForSelector('dialog.h-dg-dlg[open] [data-dg-preview] svg [data-geo-map]');
                    assert.ok(await p.$eval('[data-dg-preview] svg', s => s.getAttribute('role') === 'img' && s.getBoundingClientRect().width > 50));
                    assert.ok(await p.isVisible('.dgm-bar'), 'barre de cadrage');
                    await shot(p, `${k}-${tag}`);
                    // cadrage : molette puis glisser → « Mon cadrage » (à 390 px : les boutons ＋ −)
                    if (narrow) { await p.click('.dgm-bar [data-dgm="in"]'); await p.waitForTimeout(400); }
                    const box = await (await p.$('[data-dg-preview] [data-geo-hit]')).boundingBox();
                    if (!narrow) { await p.mouse.move(box.x + box.width * .4, box.y + box.height * .4); await p.mouse.wheel(0, -300); await p.waitForTimeout(700);
                        await p.mouse.move(box.x + box.width * .5, box.y + box.height * .5); await p.mouse.down(); await p.mouse.move(box.x + box.width * .3, box.y + box.height * .4, { steps: 4 }); await p.mouse.up(); await p.waitForTimeout(500); }
                    await p.click('[data-dg-tab="opts"]');
                    assert.equal(await p.$eval('.h-dg-opts select[data-opt="frame"]', e => e.value), 'custom');
                    assert.match(await p.$eval('.h-dg-opts [data-opt="view"]', e => e.value), /^-?\d+(\.\d+)?, -?\d/);
                    if (!narrow) { await p.click('.dgm-bar [data-dgm="box"]');
                    await p.mouse.move(box.x + 20, box.y + 20); await p.mouse.down(); await p.mouse.move(box.x + box.width * .5, box.y + box.height * .5, { steps: 4 }); await p.mouse.up(); await p.waitForTimeout(400); }
                    // réglages : carte Monde, cadrage tout fait, projection
                    await p.selectOption('.h-dg-opts select[data-opt="map"]', 'monde'); await p.waitForTimeout(200);
                    await p.selectOption('.h-dg-opts select[data-opt="frame"]', 'europe'); await p.selectOption('.h-dg-opts select[data-opt="proj"]', 'lambert'); await p.waitForTimeout(400);
                    await p.waitForSelector('[data-dg-preview] svg [data-geo-map]');
                    await p.click('.dgm-bar [data-dgm="reset"]'); await p.waitForTimeout(200);
                    await p.selectOption('.h-dg-opts select[data-opt="map"]', 'fr'); await p.waitForTimeout(300);
                    // depuis l'app
                    await p.click('[data-dg-tab="app"]'); await p.waitForSelector('[data-dgm-go]');
                    await p.check('[data-dgm-live]'); await p.click('[data-dgm-go]');
                    await p.waitForFunction(() => /✓|⛔|Aucun/.test(document.querySelector('[data-dgm-msg]')?.textContent || ''), null, { timeout: 8000 });
                    const msg = await p.$eval('[data-dgm-msg]', e => e.textContent); assert.match(msg, /^✓/, msg);
                    await p.waitForTimeout(400); const svg = await p.$eval('[data-dg-preview]', e => e.innerHTML); assert.doesNotMatch(svg, /<img/);
                    if (k === 'flowmap') {
                        assert.match(svg, /Rennes/); assert.ok(await p.$('.dgm-places li'), 'les lieux du tableau');
                        // un flux ajouté avec le menu de choix des lieux
                        for (const [sel, q] of [['[data-dgm-pa]', 'Brest'], ['[data-dgm-pb]', 'Liège']]) { await p.fill(`${sel} input[type=search], ${sel} input.pk-input, ${sel} input:not([type=hidden])`, q); await p.waitForSelector(`${sel} .pk-row`, { timeout: 8000 }); await p.click(`${sel} .pk-row`); await p.waitForTimeout(150); }
                        await p.click('[data-dgm-addflow]'); await p.waitForTimeout(500);
                        await p.waitForFunction(() => /Brest → Liège/.test(document.querySelector('[data-dg-preview]').innerHTML), null, { timeout: 5000 });
                    } else assert.match(svg, /Ille-et-Vilaine \(35\) : \d/);
                    await shot(p, `${k}-arbre-${tag}`);
                    await p.click('[data-dg-tab="data"]'); if (k === 'choropleth') assert.ok(await p.$('.h-dg-live'), 'tenu à jour');
                    // enregistrer, poser dans une case (comme un bloc de Fiche), exporter
                    await p.click('[data-dg-save]'); await p.waitForFunction(() => !document.querySelector('dialog.h-dg-dlg[open]'), null, { timeout: 8000 });
                    const id = await p.evaluate(async () => (await window.__ed)?.id || 0); assert.ok(id > 0);
                    await p.evaluate(i => { document.getElementById('dg-pose')?.remove(); const b = document.createElement('div'); b.id = 'dg-pose'; b.innerHTML = window.LCNDA_EXT.diagramEmbedHtml(i); document.body.appendChild(b); }, id);
                    await p.waitForSelector('#dg-pose svg [data-geo-map]');
                    if (!narrow) {
                        for (const fmt of ['svg', 'png', 'csv']) {
                            await p.evaluate(i => window.LCNDA_EXT.openDiagram(i), id); await p.waitForSelector('[data-dg-pexpdlg]');
                            await p.click('[data-dg-pexpdlg]'); await p.click(`.ui-export-fmt[data-fmt="${fmt}"]`);
                            const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 10000 }), p.click('[data-ui-go]')]);
                            assert.ok(dl.suggestedFilename().endsWith('.' + fmt), dl.suggestedFilename());
                            const body = fs.readFileSync(await dl.path()); assert.ok(body.length > 100, fmt);
                            if (fmt === 'svg') { assert.match(body.toString(), /^<svg[^>]+aria-label/); assert.doesNotMatch(body.toString(), /data-geo-wait|<img/); assert.match(body.toString(), /Fond : /); }
                            if (fmt === 'csv') assert.match(body.toString(), k === 'flowmap' ? /Départ/ : /Zone/);
                            await closeAll(p);
                        }
                    } else assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'pas de défilement de côté');
                    await closeAll(p);
                });
            }
            await t(`choroplèthe : champ « Zone » à propositions, « Montreuil », pastille, sources groupées (${label})`, async () => {
                await closeAll(p); await p.evaluate(() => { window.__ed = window.LCNDA_EXT.openDiagramEditor(null, { kind: 'choropleth' }); });
                await p.waitForSelector('dialog.h-dg-dlg[open] [data-dg-preview] svg [data-geo-map]');
                await p.click('[data-dg-add="0"]');
                const inp = 'dialog.h-dg-dlg[open] [data-grid="0"] tbody tr:last-child input[data-dgm-zone]';
                assert.equal(await p.$eval(inp, e => e.getAttribute('role')), 'combobox');
                await p.click(inp); await p.keyboard.type('Montreuil', { delay: 20 });
                await p.waitForFunction(() => [...document.querySelectorAll('.dgm-ac .pk-item')].some(e => /Montreuil \(93\)/.test(e.textContent)) && !document.querySelector('.dgm-ac [data-dgm-acload]'), null, { timeout: 30000 });
                assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'pas de défilement de côté');
                await shot(p, `zone-montreuil-${tag}`);
                const idx = await p.$$eval('.dgm-ac .pk-item', els => els.findIndex(e => /Montreuil \(93\)/.test(e.textContent)));
                for (let i = 0; i < idx; i++) await p.keyboard.press('ArrowDown');
                await p.keyboard.press('Enter'); await p.waitForTimeout(150);
                assert.equal(await p.$eval(inp, e => e.value), 'Montreuil (93)'); assert.ok(!await p.$('.dgm-ac'), 'liste fermée');
                assert.ok(await p.evaluate(() => document.activeElement.classList.contains('is-num')), 'la case du chiffre ensuite');
                await p.keyboard.type('7');
                await p.waitForFunction(() => /Seine-Saint-Denis \(93\) : 7/.test(document.querySelector('[data-dg-preview]').innerHTML), null, { timeout: 8000 });
                await p.waitForFunction(() => !document.querySelector('[data-dgm-zhint]')?.hidden, null, { timeout: 5000 });
                assert.match(await p.$eval('[data-dgm-zhint]', e => e.textContent), /1 ville compte dans son département/);
                // tapé à la main, sans choisir : pastille orange ; Échap ferme la liste, pas l'éditeur
                await p.click('[data-dg-add="0"]'); await p.click(inp); await p.keyboard.type('Montreuil'); await p.waitForSelector('.dgm-ac .pk-item');
                await p.keyboard.press('Escape'); await p.waitForTimeout(100); assert.ok(await p.$('dialog.h-dg-dlg[open]'), 'éditeur toujours ouvert'); assert.ok(!await p.$('.dgm-ac'));
                await p.keyboard.press('Tab');
                const dot = 'dialog.h-dg-dlg[open] [data-grid="0"] tbody tr:last-child [data-dgm-dot]:not([hidden])';
                await p.waitForSelector(dot, { timeout: 5000 }); assert.match(await p.$eval(dot, e => e.title), /Plusieurs villes s’appellent Montreuil/);
                await shot(p, `zone-pastille-${tag}`);
                await p.click(dot); await p.waitForSelector('.dgm-ac .pk-item'); await p.click('.dgm-ac .pk-item'); await p.waitForTimeout(300);
                assert.ok(!await p.$(dot), 'pastille partie après le choix');
                // « Depuis l'app » : quatre groupes, une sorte d'événement au choix, âge moyen en années
                await p.click('[data-dg-tab="app"]'); await p.waitForSelector('[data-dgm-what]');
                assert.deepEqual(await p.$$eval('[data-dgm-what] optgroup', g => g.map(x => x.label)), ['Événements', 'Personnes', 'Valeurs', 'Autres']);
                await p.selectOption('[data-dgm-what]', 'type'); assert.ok(await p.isVisible('[data-dgm-type]'));
                await p.waitForFunction(() => document.querySelectorAll('[data-dgm-type] option').length > 20 && / Mariage \(famille\) — 2/.test(document.querySelector('[data-dgm-type]').textContent), null, { timeout: 5000 });
                await p.selectOption('[data-dgm-type]', { label: await p.$$eval('[data-dgm-type] option', o => o.find(x => / Mariage \(famille\) — 2/.test(x.textContent)).textContent) });
                await p.check('[data-dgm-live]'); await p.click('[data-dgm-go]');
                await p.waitForFunction(() => /^✓/.test(document.querySelector('[data-dgm-msg]')?.textContent || ''), null, { timeout: 8000 });
                await p.selectOption('[data-dgm-what]', 'age_death'); assert.ok(!await p.isVisible('[data-dgm-type]')); await p.click('[data-dgm-go]');
                await p.waitForFunction(() => /âge moyen/.test(document.querySelector('[data-dgm-msg]')?.textContent || ''), null, { timeout: 8000 });
                await p.waitForFunction(() => /: \d+(,\d)? ans/.test(document.querySelector('[data-dg-preview]').innerHTML), null, { timeout: 8000 });
                await shot(p, `depuis-app-age-${tag}`);
                await closeAll(p);
            });
            await t(`choroplèthe : un tableau collé (codes INSEE, région, pays) (${label})`, async () => {
                await closeAll(p); await p.evaluate(() => { window.__ed = window.LCNDA_EXT.openDiagramEditor(null, { kind: 'choropleth' }); });
                await p.waitForSelector('dialog.h-dg-dlg[open] [data-dg-csv]', { state: 'attached' });
                const csv = 'Département;Naissances\n35;12\n2A;4\n971;2\nNulle part;3\n' + TRAP + ';1\n';
                await p.setInputFiles('dialog.h-dg-dlg[open] [data-dg-csv]', { name: 'dep.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
                await p.waitForFunction(() => /Corse-du-Sud \(2A\) : 4/.test(document.querySelector('[data-dg-preview]').innerHTML), null, { timeout: 5000 });
                const h = await p.$eval('[data-dg-preview]', e => e.innerHTML); assert.match(h, /Pas trouvé sur ce fond : Nulle part/); assert.doesNotMatch(h, /<img/);
                await closeAll(p);
            });
            await t(`choroplèthe : niveau « Communes » et encart de l’Île-de-France dans l’éditeur (${label})`, async () => {
                await closeAll(p); await p.evaluate(() => { window.__ed = window.LCNDA_EXT.openDiagramEditor(null, { kind: 'choropleth' }); });
                await p.waitForSelector('dialog.h-dg-dlg[open] [data-dg-preview] svg [data-geo-map]');
                assert.ok(await p.$('[data-dg-preview] [data-geo-inset="idf"]'), 'encart sur la carte des départements');
                await shot(p, `encart-departements-${tag}`);
                await p.click('[data-dg-tab="opts"]');
                assert.equal(await p.$eval('.h-dg-opts select[data-opt="idf"]', e => e.value), 'pc');
                await p.selectOption('.h-dg-opts select[data-opt="level"]', 'com');
                await p.waitForFunction(() => /INSEE COG 2025/.test(document.querySelector('[data-dg-preview]')?.innerHTML || '') && !document.querySelector('[data-dg-preview] [data-geo-wait]'), null, { timeout: 20000 });
                assert.ok(await p.evaluate(() => performance.getEntriesByType('resource').some(e => /fr-communes\.json\.gz/.test(e.name))), 'fichier des communes chargé à la demande');
                assert.ok(await p.$('[data-dg-preview] [data-geo-inset="idf"]'), 'encart sur la carte des communes');
                assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'pas de défilement de côté');
                await shot(p, `communes-france-${tag}`);
                // zoomer sur un département
                await p.selectOption('.h-dg-opts select[data-opt="frame"]', 'zone'); await p.waitForSelector('.h-dg-opts [data-opt="frameZone"]');
                await p.fill('.h-dg-opts [data-opt="frameZone"]', '35'); await p.press('.h-dg-opts [data-opt="frameZone"]', 'Tab');
                await p.waitForFunction(() => !document.querySelector('[data-dg-preview] [data-geo-inset="idf"]') && /Ille-et-Vilaine|35238/.test(document.querySelector('[data-dg-preview]')?.innerHTML || ''), null, { timeout: 10000 });
                await shot(p, `communes-35-${tag}`);
                for (const m of ['be', 'ch', 'lu']) {
                    await p.selectOption('.h-dg-opts select[data-opt="map"]', m); await p.waitForTimeout(150); await p.selectOption('.h-dg-opts select[data-opt="level"]', 'com');
                    const attr = { be: 'IGN-NGI', ch: 'swisstopo', lu: 'ACT Luxembourg' }[m];
                    await p.waitForFunction(a => (document.querySelector('[data-dg-preview]')?.innerHTML || '').includes(a) && !document.querySelector('[data-dg-preview] [data-geo-wait]'), attr, { timeout: 20000 });
                    await shot(p, `communes-${m}-${tag}`);
                }
                await closeAll(p);
            });
            await ctx.close();
        }
        await t('aucune erreur JavaScript', async () => assert.deepEqual(errors, []));
    } finally { await browser.close(); proc.kill(); }
    process.exit(failed ? 1 : 0);
})();
