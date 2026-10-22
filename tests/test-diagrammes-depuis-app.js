'use strict';
/**
 * 📊 Diagrammes, onglet « Depuis l'app » : les options communes (assets/js/heritage-diagram-options.js,
 * lib/diagram_options.php, lib/diagram_appcount.php) pour chaque type de diagramme.
 *     node tests/test-diagrammes-depuis-app.js        (DDA_SHOTS=<dossier> pour les captures)
 * 1. Sans navigateur (bac à sable) : chaque type a sa place (« Graphique », « Des données de mon arbre » ou son panneau
 *    propre) avec les mêmes champs dans le même ordre ; la phrase du réglage ; tri, N premiers, « Autres », « Inconnu », %.
 * 2. Serveur : « Compter dans ma base » (ce qu'on compte, groupe, période, regroupement, séries, tri, limite, Autres,
 *    Inconnu, unité) ; chaque option change les données ; les données des autres types suivent le groupe et la période ;
 *    les valeurs piégées sont refusées (422) ; base de 5 000 personnes : chaque demande en moins de 3 secondes.
 * 3. Navigateur : pour chaque type, une option change le dessin ; la phrase au-dessus de l'aperçu ; l'erreur sous le champ
 *    (K1) ; les anciens diagrammes s'ouvrent pareil ; « Tenir à jour » suit la base ; 390 px ; mode sombre ; aucune erreur.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawn, spawnSync } = require('node:child_process');

const appRoot = path.resolve(__dirname, '..');
let failed = 0;
const steps = [];
const step = (name, fn) => steps.push([name, fn]);

/* ── 1. Bac à sable ── */
const sandbox = { window: {}, console, setTimeout, clearTimeout, performance, Intl, MutationObserver: class { observe() {} }, CSS: { escape: s => s }, document: { documentElement: {}, querySelectorAll: () => [], addEventListener() {}, createElement: () => ({}) } };
sandbox.window.LCNDA_APP = { state: { bootstrap: { startPersonId: 1 } } };
vm.createContext(sandbox);
for (const f of ['heritage-diagrams-render.js', 'heritage-diagram-genea.js', 'heritage-diagram-chiffres.js', 'heritage-diagram-cartes.js', 'heritage-diagram-more.js', 'heritage-diagram-famille.js', 'heritage-diagram-adn-chiffres.js', 'heritage-diagram-cartes2.js', 'heritage-diagram-options.js'])
    vm.runInContext(fs.readFileSync(path.join(appRoot, 'assets/js', f), 'utf8'), sandbox, { filename: f });
const ext = sandbox.window.LCNDA_EXT, R = ext.diagramRender, O = ext.diagramAppOpts;
const same = (a, b, m) => assert.equal(JSON.stringify(a), JSON.stringify(b), m); // les objets du bac à sable viennent d'un autre « monde » JavaScript
const TABLE_KINDS = ['columns', 'bars', 'stacked', 'stacked100', 'line', 'area', 'pie', 'donut', 'halfdonut', 'waffle', 'treemap', 'funnel', 'radar', 'pyramid', 'heatmap'];
const STATS = Object.keys(R.KINDS).filter(k => TABLE_KINDS.includes(k) || ['parliament', 'wordcloud', 'pictogram', 'gauge'].includes(k) || !!R.KINDS[k].pairs);
const TREE = Object.keys(R.KINDS).filter(k => O.TREE.has(k));
const CUSTOM = Object.keys(R.KINDS).filter(k => O.CUSTOM[k]);
// les types qui ne prennent rien de commun : autour d'une seule personne ou d'un test ADN, ou remplis à la main
const NONE = { timeline: 'personnes ajoutées une à une', chrono: 'personnes ajoutées une à une', scatter: 'à la main', sankey: 'à la main', orgchart: 'à la main',
    fan: 'une personne', sunburst: 'une personne', network: 'une personne', arcs: 'une personne', venn: 'ses ensembles', genbars: 'une personne', siblings: 'une personne', accordion: 'une personne',
    cousinage: 'une personne', kinmatrix: 'des personnes choisies', surnametree: 'une personne', ancestorgrid: 'une personne', faknown: 'une personne', faimplexe: 'une personne',
    fanaiss: 'ses mères', falieux: 'des personnes choisies', chromo: 'un test ADN', cmruler: 'un test ADN', storymap: 'une personne', icicle: 'une personne', kpi: 'toute la base', bullet: 'les ancêtres' };

step('chaque type a sa place : « Graphique », « Des données de mon arbre », son panneau, ou rien de commun (avec la raison)', () => {
    for (const k of Object.keys(R.KINDS)) {
        const where = [STATS.includes(k) && 'graphique', TREE.includes(k) && 'arbre', CUSTOM.includes(k) && 'panneau', NONE[k] && 'rien'].filter(Boolean);
        assert.ok(where.length >= 1, `${k} : aucune place`);
        if (where.includes('rien')) assert.equal(where.length, 1, `${k} : « rien » et autre chose`);
    }
    assert.ok(STATS.length >= 23 && STATS.includes('gauge') && STATS.includes('dotplot') && STATS.includes('nightingale'));
    assert.equal(TREE.length, 14); assert.equal(CUSTOM.length, 19);
});
step('mêmes champs dans le même ordre, chacun avec sa bulle d’aide', () => {
    const order = html => [...html.matchAll(/data-dgo-row="([a-z]+)"/g)].map(m => m[1]).filter(k => O.ORDER.includes(k) || k === 'period');
    const full = order(O.html({}, { fields: O.ORDER, kind: 'stacked' }));
    same(full, ['what', 'distinct', 'rules', 'pop', 'period', 'by', 'series', 'sort', 'limit', 'others', 'empty', 'unit', 'live']);
    for (const k of [...CUSTOM, ...TREE]) {
        const fields = O.CUSTOM[k] ? O.customFields(k) : O.treeFields(k), got = order(O.html({}, { fields, kind: k }));
        same(got, full.filter(f => fields.includes(f)), k);
        assert.ok(fields.includes('pop'), k + ' : le groupe de personnes');
    }
    const h = O.html({}, { fields: O.ORDER, kind: 'columns' });
    const labs = [...h.matchAll(/class="h-dgo-lab" data-help="([^"]+)" data-help-faq="([^"]+)"/g)];
    assert.ok(labs.length >= 12 && labs.every(m => m[1].length > 20 && m[2] === O.FAQ.replace(/’/g, '’')), 'une bulle « ? » par option');
    assert.match(h, /data-ui-date="nocal" data-dgo="from"/); assert.match(h, /type="range" data-dgo="limit"/);
    assert.doesNotMatch(O.html({}, { fields: O.ORDER.filter(f => f !== 'series'), kind: 'pie' }), /data-dgo-row="series"/);
});
step('la phrase du réglage', () => {
    assert.equal(O.summary({ what: 'persons', from: '1800', to: '1900', pop: 'anc', by: 'county', limit: 10, others: false }, { fields: O.ORDER }), 'Personnes nées entre 1800 et 1900, mes ancêtres, par département, 10 premiers.');
    assert.equal(O.summary({ what: 'deaths', from: 'vers 1750', pop: 'label', labelName: 'Bretons', by: 'decade', limit: 0, unit: 'pct' }, { fields: O.ORDER }), 'Décès depuis 1750, l’étiquette « Bretons », par décennie, toutes les valeurs, en %.');
    assert.equal(O.summary({ what: 'persons', unit: 'avg', value: 'age_death', by: 'century', limit: 0, live: true }, { fields: O.ORDER }), 'Moyenne de l’âge au décès (personnes), toute ma base, par siècle, toutes les valeurs, tenu à jour.');
    assert.equal(O.summary({ pop: 'pat', from: '1700', to: '1800' }, { fields: ['pop', 'period'], period: 'birth', source: 'Âge au décès' }), 'Âge au décès, ma branche paternelle, personnes nées entre 1700 et 1800.');
    assert.equal(O.summary({ sort: 'az', limit: 5, others: true }, { fields: O.ORDER, locked: true, source: 'Noms' }), 'Noms, de A à Z, 5 premiers et « Autres ».');
});
step('chiffres déjà comptés : tri, N premiers, « Autres », « Inconnu », %', () => {
    const pairs = [['MARTIN', 7], ['Sans nom', 4], ['BORIE', 9], ['autres', 3], ['ROUX', 1]];
    same(O.post(pairs, { limit: 0 }), [['MARTIN', 7], ['BORIE', 9], ['ROUX', 1], ['Autres', 3]], 'par défaut : l’ordre reçu, sans « Inconnu », le reste à la fin');
    same(O.post(pairs, { sort: 'big', limit: 2, others: true }), [['BORIE', 9], ['MARTIN', 7], ['Autres', 4]]);
    same(O.post(pairs, { sort: 'big', limit: 2, others: false }), [['BORIE', 9], ['MARTIN', 7]]);
    same(O.post(pairs, { sort: 'az', empty: true, limit: 0 }).map(x => x[0]), ['BORIE', 'MARTIN', 'ROUX', 'Sans nom', 'Autres']);
    same(O.post([['a', 1], ['b', 3]], { unit: 'pct' }), [['a', 25], ['b', 75]]);
    assert.equal(O.postOf({ limit: 0 }), null, 'rien de changé : rien de gardé (anciens diagrammes)');
    same(O.postOf({ sort: 'big', limit: 5, others: true }), { sort: 'big', limit: 5, others: true });
});
step('compatibilité : sans option, aucun paramètre en plus ; les valeurs inconnues reprennent leur valeur par défaut', () => {
    same(O.dgParams(O.norm({})), {});
    const n = O.norm({ what: '<x>', by: 'evil', pop: 'x', unit: 'sql', limit: 1e9, gens: -4, ids: '1,a,2', series: 'sex', from: 'x'.repeat(200) });
    assert.equal(n.what, 'persons'); assert.equal(n.by, 'last_name'); assert.equal(n.pop, ''); assert.equal(n.unit, 'count'); assert.equal(n.limit, 60); assert.equal(n.gens, 0); assert.equal(n.ids, '1,2'); assert.equal(n.from.length, 60);
    assert.equal(O.norm({ what: 'media', series: 'sex' }).series, '', 'pas de série par sexe pour les médias');
    same(O.dgParams(O.norm({ pop: 'anc', root: 7, gens: 3, from: 'entre 1880 et 1885', to: 'avant 1900' })), { dg_pop: 'anc', dg_root: 7, dg_gens: 3, dg_from: 1880, dg_to: 1900 });
});

/* ── 2 et 3. Serveur et navigateur ── */
let chromium = null;
for (const p of ['playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright']) { try { ({ chromium } = require(p)); break; } catch (_) { chromium = null; } }
const php = spawnSync('php', ['-v'], { encoding: 'utf8' }).status === 0 ? 'php' : null;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-dda-'));
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
const SHOTS = process.env.DDA_SHOTS || '';
const freePort = () => new Promise(res => { const s = require('node:net').createServer(); s.listen(0, '127.0.0.1', () => { const q = s.address().port; s.close(() => res(q)); }); });
const runPhp = (dir, code) => { const r = spawnSync(php, ['-r', code], { cwd: appRoot, encoding: 'utf8', env: envFor(dir) }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout; };
const IDS = { label: 0, list: 0 };
const seed = (dir, extra = []) => {
    fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    runPhp(dir, 'require "lib/paths.php"; (new PDO("sqlite:".DATA_DIR."/genealogy.sqlite"))->exec(file_get_contents(APP_ROOT."/data/schema.sql")); require "lib/bootstrap.php"; db();');
    const r = spawnSync(php, [path.join(appRoot, 'tests/fixtures/diagram-famille-seed.php'), ...extra], { cwd: appRoot, encoding: 'utf8', env: envFor(dir) });
    if (r.status !== 0 || !/^ok famille/m.test(r.stdout)) throw new Error(r.stderr || r.stdout);
    // une étiquette (les MARTIN), une de « Mes listes » (les femmes), des causes de décès, un média
    const out = runPhp(dir, `require "lib/paths.php"; require "lib/bootstrap.php"; $pdo = db();
        $pdo->exec("INSERT INTO labels(name,color) VALUES('Famille Martin','#cc4700')"); $l = (int) $pdo->lastInsertId();
        $pdo->exec("INSERT INTO label_links(label_id,entity_type,entity_id) SELECT $l,'person',id FROM persons WHERE last_name='MARTIN'");
        $pdo->exec("INSERT INTO custom_lists(name,source,definition_json) VALUES('Les femmes','persons','{\\"match\\":\\"all\\",\\"rules\\":[{\\"field\\":\\"gender\\",\\"value\\":\\"female\\"}]}')"); $li = (int) $pdo->lastInsertId();
        $pdo->exec("UPDATE events SET cause=CASE WHEN id % 3 = 0 THEN 'Fièvre' WHEN id % 3 = 1 THEN 'Vieillesse' ELSE 'Accident' END WHERE event_type_id IN (SELECT id FROM event_types WHERE gedcom_tag='DEAT')");
        $pdo->exec("INSERT INTO media(title,media_type,date_text) VALUES('Photo de mariage','image','1912')"); $m = (int) $pdo->lastInsertId();
        $pdo->exec("INSERT INTO media_links(media_id,entity_type,entity_id) SELECT $m,'person',id FROM persons WHERE is_start=1");
        echo "ok $l $li";`);
    const m = out.match(/ok (\d+) (\d+)/); if (m && !extra.length) Object.assign(IDS, { label: Number(m[1]), list: Number(m[2]) });
};
const serve = async (dir, port) => {
    const proc = spawn(php, ['-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(dir), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    return { proc, base };
};
const qs = o => Object.entries(o).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

// les données propres à chaque type (ce que son panneau demande au serveur) : une option commune doit les changer
const OWN_DATA = {
    choropleth: ['diagram_geo', { what: 'births' }], flowmap: ['diagram_geo', { what: 'birth_death' }], bubblemap: ['diagram_geo', { what: 'births' }], cartogram: ['diagram_geo', { what: 'deaths' }],
    dotmap: ['diagram_cartes2', { what: 'points', ev: 'births' }], hexmap: ['diagram_cartes2', { what: 'points', ev: 'all' }], godnames: ['diagram_cartes2', { what: 'godnames' }], causesun: ['diagram_cartes2', { what: 'causes' }],
    calendar: ['diagram_genea', { what: 'dates', types: 'birth,death' }], monthrose: ['diagram_genea', { what: 'dates', types: 'birth,marriage,death' }], spiral: ['diagram_genea', { what: 'lives' }],
    fasurvie: ['diagram_famille', { what: 'survival' }], fametiers: ['diagram_famille', { what: 'occflow', gens: 3, chain: 'parent' }], famariages: ['diagram_famille', { what: 'radius' }], famois: ['diagram_famille', { what: 'months' }],
    crises: ['diagram_more', { what: 'crises' }], alivepyr: ['diagram_more', { what: 'alive' }], chord: ['diagram_more', { what: 'chord' }], violin: ['diagram_numbers', { what: 'ages_death' }],
    bump: ['diagram_numbers', { what: 'firstnames' }], stream: ['diagram_numbers', { what: 'occupations', step: 25 }], histogram: ['diagram_numbers', { what: 'ages_death' }], boxplot: ['diagram_numbers', { what: 'ages_marriage' }],
    dumbbell: ['diagram_numbers', { what: 'couples' }], slope: ['diagram_numbers', { what: 'births_places', step: 100 }], waterfall: ['diagram_numbers', { what: 'living', step: 50 }], beeswarm: ['diagram_numbers', { what: 'birth_years' }],
    smallmult: ['diagram_numbers', { what: 'births_surnames', step: 10 }], ridgeline: ['diagram_numbers', { what: 'ages_death' }], marimekko: ['diagram_numbers', { what: 'occupations', step: 100 }],
    dotplot: ['diagram_adn_numbers', { what: 'means', by: 'death_century' }], nightingale: ['diagram_adn_numbers', { what: 'months', by: 'type' }], mobility: ['diagram_adn_numbers', { what: 'mobility', who: 'children' }],
};

(async () => {
    for (const [name, fn] of steps) { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } }
    if (!chromium || !php) { console.log('— serveur et navigateur : Playwright ou PHP absent, partie sautée'); process.exit(failed ? 1 : 0); }
    const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
    const dir = path.join(tmp, 'a'); seed(dir);
    const { proc, base } = await serve(dir, await freePort());
    const get = async (action, q) => { const r = await fetch(`${base}api.php?action=${action}&${typeof q === 'string' ? q : qs(q)}`); return [r.status, await r.json()]; };
    const count = async q => { const [st, j] = await get('diagram_app_count', q); assert.equal(st, 200, JSON.stringify(q) + ' → ' + JSON.stringify(j)); return j; };
    const sig = r => JSON.stringify(r.rows);
    let big = null, browser = null;
    try {
        /* ── Serveur ── */
        await t('« Compter dans ma base » : chaque sorte de chose comptée, avec ses regroupements', async () => {
            for (const [what, bys] of Object.entries(O.BY)) for (const by of bys) { const r = await count({ what, by, empty: 1, limit: 0 }); assert.ok(Array.isArray(r.rows), `${what}/${by}`); }
            const p = await count({ what: 'persons', by: 'sex' }); assert.ok(p.rows.some(x => x.label === 'Hommes') && p.rows.some(x => x.label === 'Femmes'));
            assert.ok((await count({ what: 'deaths', by: 'cause' })).rows.some(x => x.label === 'Fièvre'));
            assert.ok((await count({ what: 'media', by: 'mtype' })).rows.some(x => x.label === 'Photos'));
            assert.ok((await count({ what: 'places', by: 'county' })).rows.length > 1);
            assert.ok((await count({ what: 'events', by: 'type' })).rows.some(x => x.label === 'Naissance'));
        });
        await t('chaque option change les données', async () => {
            const base0 = await count({ what: 'persons', by: 'last_name', limit: 0 });
            const changes = {
                what: { what: 'births' }, distinct: { what: 'events', by: 'none', distinct: 1 }, pop_anc: { dg_pop: 'anc' }, pop_desc: { dg_pop: 'desc' }, pop_pat: { dg_pop: 'pat' }, pop_mat: { dg_pop: 'mat' },
                pop_label: { dg_pop: 'label', dg_label: IDS.label }, pop_list: { dg_pop: 'list', dg_list: IDS.list }, pop_search: { dg_pop: 'search', dg_q: 'mar' }, pop_people: { dg_pop: 'people', dg_ids: '1,2,3' }, gens: { dg_pop: 'anc', dg_gens: 2 },
                period: { dg_from: 1850, dg_to: 1950 }, by: { by: 'county' }, series: { by: 'century', series: 'sex' }, sort: { sort: 'az' }, limit: { limit: 2 }, others: { limit: 2, others: 1 }, empty: { by: 'occupation', empty: 1 },
                pct: { unit: 'pct' }, avg: { by: 'century', unit: 'avg', value: 'age_death' }, median: { by: 'century', unit: 'median', value: 'age_death' },
            };
            for (const [name, q] of Object.entries(changes)) {
                const r = await count({ what: 'persons', by: 'last_name', limit: 0, ...q });
                if (name === 'distinct') { const a = await count({ what: 'events', by: 'none' }); assert.notEqual(sig(a), sig(r), name); continue; }
                if (name === 'others') { const a = await count({ what: 'persons', by: 'last_name', limit: 2, others: 0 }); assert.notEqual(sig(a), sig(r), name); assert.equal(r.rows.at(-1).label, 'Autres'); continue; }
                if (name === 'empty') { const a = await count({ what: 'persons', by: 'occupation', limit: 0 }); assert.notEqual(sig(a), sig(r), name); assert.ok(r.rows.some(x => x.label === 'Inconnu')); continue; }
                if (name === 'gens') { const a = await count({ what: 'persons', by: 'last_name', limit: 0, dg_pop: 'anc' }); assert.ok(r.total < a.total, name); continue; }
                if (name === 'median') { const a = await count({ what: 'persons', by: 'century', limit: 0, unit: 'avg', value: 'age_death' }); assert.notEqual(sig(a), sig(r), name); continue; }
                assert.notEqual(sig(r), sig(base0), name);
            }
            const s = await count({ what: 'persons', by: 'century', series: 'sex' }); assert.deepEqual(s.series.slice(0, 2).sort(), ['Femmes', 'Hommes']); assert.ok(s.rows.every(x => x.values.length === s.series.length));
            const pc = await count({ what: 'persons', by: 'sex', unit: 'pct' }); assert.ok(Math.abs(pc.rows.reduce((n, x) => n + x.value, 0) - 100) < 1); assert.equal(pc.unit_label, '%');
            const f = await count({ what: 'persons', by: 'decade', dg_from: 1900 }); assert.ok(f.rows.every(x => Number(x.label.slice(0, 4)) >= 1900));
            const g = await count({ what: 'persons', by: 'generation', dg_pop: 'anc' }); assert.equal(g.rows[0].label, '1 · la personne'); assert.equal(g.rows[1].value, 2);
            const m = await count({ what: 'persons', by: 'sex', dg_pop: 'list', dg_list: IDS.list }); assert.deepEqual(m.rows.map(x => x.label), ['Femmes'], 'la liste « Les femmes »');
            const l = await count({ what: 'persons', by: 'last_name', dg_pop: 'label', dg_label: IDS.label }); assert.deepEqual(l.rows.map(x => x.label), ['MARTIN'], 'l’étiquette « Famille Martin »');
        });
        await t('les données des autres types suivent le groupe de personnes et la période ; sans option, rien ne change', async () => {
            for (const [k, [action, q]] of Object.entries(OWN_DATA)) {
                const [s0, a] = await get(action, q); assert.equal(s0, 200, k);
                const [s1, b] = await get(action, { ...q, dg_pop: 'pat' }); assert.equal(s1, 200, k);
                const [, a2] = await get(action, q); assert.equal(JSON.stringify(a2), JSON.stringify(a), k + ' : stable');
                const [, c] = await get(action, { ...q, dg_pop: 'people', dg_ids: '1,2' });
                assert.ok(JSON.stringify(b) !== JSON.stringify(a) || JSON.stringify(c) !== JSON.stringify(a), `${k} : le groupe ne change rien`);
            }
            for (const k of ['calendar', 'spiral', 'fasurvie', 'violin', 'histogram', 'beeswarm', 'dotplot']) {
                const [action, q] = OWN_DATA[k]; const [, a] = await get(action, q), [, b] = await get(action, { ...q, dg_from: 1900 });
                assert.notEqual(JSON.stringify(a), JSON.stringify(b), k + ' : la période ne change rien');
            }
        });
        await t('valeurs piégées refusées (422), nombres bornés', async () => {
            const traps = [{ what: 'x' }, { what: 'persons', by: 'cause' }, { by: 'nom; DROP TABLE persons' }, { series: '<script>' }, { unit: 'sum' }, { unit: 'avg', value: 'salaire' }, { what: 'places', unit: 'avg' },
                { limit: '-1' }, { limit: '1e9' }, { limit: 'abc' }, { dg_pop: 'tout' }, { dg_root: '1 OR 1=1' }, { dg_label: '1;DROP' }, { dg_ids: '1,2,x' }, { dg_ids: Array.from({ length: 501 }, (_, i) => i + 1).join(',') },
                { dg_q: 'a'.repeat(81) }, { dg_from: 'mil-huit-cents' }, { dg_to: '1900-01-01' }, { dg_gens: '-3' }, { dg_pop: 'label' }, { dg_pop: 'search', dg_q: 'a' }, { dg_pop: 'people' }, { dg_pop: 'list', dg_list: 999 },
                { what: 'media', series: 'sex' }, { others: 'peut-être' }];
            for (const q of traps) { const [st, j] = await get('diagram_app_count', q); assert.equal(st, 422, JSON.stringify(q) + ' → ' + st + ' ' + JSON.stringify(j)); assert.ok(j.error && j.error.length < 200, JSON.stringify(q)); }
            for (const raw of ['by[]=x', 'dg_pop[]=anc', 'dg_ids[a]=1', 'what[]=persons']) { const [st] = await get('diagram_app_count', raw); assert.equal(st, 422, raw); }
            for (const action of ['diagram_genea&what=lives', 'diagram_numbers&what=ages_death', 'diagram_famille&what=survival', 'diagram_more&what=crises', 'diagram_geo&what=births', 'diagram_cartes2&what=causes', 'diagram_adn_numbers&what=mobility']) {
                const [st] = await get(action, { dg_pop: 'tout' }); assert.equal(st, 422, action);
                const [st2] = await get(action, { dg_ids: '1 OR 1' }); assert.equal(st2, 422, action);
            }
            const r = await count({ dg_from: '-9999', dg_to: '9999', dg_gens: '999', dg_pop: 'anc', limit: '9999' }); assert.ok(r.rows.length <= 200, 'au plus 200 valeurs');
            const sw = await count({ what: 'persons', by: 'decade', dg_from: 1950, dg_to: 1800 }); assert.ok(sw.rows.length > 0, 'période à l’envers : remise dans l’ordre');
            const [, x] = await get('diagram_app_count', { by: 'last_name', dg_pop: 'search', dg_q: "%' OR 1=1 --" }); assert.deepEqual(x.rows, [], 'les % de la recherche sont du texte');
        });

        /* ── Navigateur ── */
        browser = await chromium.launch(exe ? { executablePath: exe } : {});
        const errors = [];
        const watch = p => { p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); }); p.on('dialog', d => { errors.push('dialogue : ' + d.message()); d.dismiss(); }); };
        const ready = async p => { await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.bootstrap && window.LCNDA_EXT?.openDiagramEditor && window.LCNDA_EXT?.diagramAppOpts && window.LCNDA_EXT?.diagramFamille && window.LCNDA_EXT?.diagramCartes, null, { timeout: 20000 }); await p.waitForTimeout(400); };
        const closeEditor = p => p.evaluate(() => document.querySelectorAll('.h-dg-dlg').forEach(d => { if (d.open) d.close(); d.remove(); }));
        const openKind = async (p, k, id = null) => { await closeEditor(p); await p.evaluate(([k, id]) => { window.LCNDA_EXT.openDiagramEditor(id, id ? {} : { kind: k }); }, [k, id]); await p.waitForSelector('.h-dg-dlg [data-dg-preview] svg'); };
        const preview = p => p.$eval('.h-dg-dlg [data-dg-preview] svg', s => s.outerHTML);
        const appTab = async p => { await p.click('.h-dg-dlg [data-dg-tab="app"]'); await p.waitForSelector('.h-dg-dlg [data-dgo-box]'); await p.waitForTimeout(150); };
        const shot = async (p, name, sel = '.h-dg-dlg') => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); const el = await p.$(sel); await (el || p).screenshot({ path: path.join(SHOTS, name + '.png') }); };
        /** clic sur « Prendre… », puis attendre que le dessin change */
        const goAndWait = async (p, goSel, before, what = '') => {
            await p.click(goSel.split(',').map(x => `.h-dg-dlg ${x.trim()}`).join(', '));
            await p.waitForFunction(old => { const s = document.querySelector('.h-dg-dlg [data-dg-preview] svg'); return s && s.outerHTML !== old; }, before, { timeout: 12000 })
                .catch(async e => { throw new Error(`${what} : le dessin ne change pas (${await p.$eval('.h-dg-dlg', d => [...d.querySelectorAll('[data-dgm-msg], [data-c2-msg], [data-gn-msg], [data-dfa-msg], [data-dm-msg]')].map(x => x.textContent).join(' ')).catch(() => '')} ${await p.evaluate(() => [...document.querySelectorAll('.ui-toast, .toast')].map(x => x.textContent).join(' | '))}) ${e.message.split('\n')[0]}`); });
            await p.waitForTimeout(250); return preview(p);
        };
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
        const p = await ctx.newPage(); watch(p); await ready(p);

        await t('« Graphique » : pour chaque type, « Compter dans ma base » puis une option change le dessin ; la phrase au-dessus de l’aperçu', async () => {
            for (const k of STATS) {
                await openKind(p, k); await appTab(p);
                await p.waitForFunction(() => document.querySelectorAll('.h-dg-dlg [data-dg-src] option').length > 10);
                await p.selectOption('.h-dg-dlg [data-dg-src]', k === 'pyramid' ? 'q:age_death' : 'q:surnames');
                await p.waitForSelector('.h-dg-dlg [data-dgo-stats] [data-dgo="pop"]');
                const svg0 = await goAndWait(p, '[data-dg-srcgo]', await preview(p), k + ' (toute la base)');
                await appTab(p); await p.selectOption('.h-dg-dlg [data-dg-src]', k === 'pyramid' ? 'q:age_death' : 'q:surnames');
                await p.selectOption('.h-dg-dlg [data-dgo-stats] [data-dgo="pop"]', 'pat');
                const sum = await p.$eval('.h-dg-dlg [data-dg-sum]', e => e.textContent); assert.match(sum, /ma branche paternelle/, k + ' : ' + sum);
                const svg1 = await goAndWait(p, '[data-dg-srcgo]', svg0, k + ' (branche paternelle)');
                assert.notEqual(svg1, svg0, k);
                if (k === 'columns') await shot(p, 'graphique-columns');
            }
        });
        await t('« Graphique » : séries, unité, période (C4), N premiers (C3) ; la phrase suit', async () => {
            await openKind(p, 'stacked'); await appTab(p);
            await p.waitForFunction(() => document.querySelectorAll('.h-dg-dlg [data-dg-src] option').length > 10);
            await p.selectOption('.h-dg-dlg [data-dg-src]', 'q:custom');
            await p.selectOption('.h-dg-dlg [data-dgo="what"]', 'deaths'); await p.selectOption('.h-dg-dlg [data-dgo="by"]', 'century'); await p.selectOption('.h-dg-dlg [data-dgo="series"]', 'sex');
            await p.fill('.h-dg-dlg [data-dgo="from"]', 'vers 1750'); await p.fill('.h-dg-dlg [data-dgo="to"]', '1950');
            await p.waitForFunction(() => /Compris/.test(document.querySelector('.h-dg-dlg [data-dgo-row="period"] .ui-date-help')?.textContent || ''), null, { timeout: 4000 });
            const sum = await p.$eval('.h-dg-dlg [data-dg-sum]', e => e.textContent);
            assert.match(sum, /Décès entre 1750 et 1950, toute ma base, par siècle, une série par sexe/);
            await p.click('.h-dg-dlg [data-dg-srcgo]'); await p.waitForSelector('.h-dg-dlg [data-dg-tab="data"].is-active');
            const series = await p.$$eval('.h-dg-dlg [data-dg-sername]', a => a.map(x => x.value)); assert.ok(series.includes('Hommes') && series.includes('Femmes'), series.join());
            await appTab(p); await p.selectOption('.h-dg-dlg [data-dgo="unit"]', 'pct');
            assert.match(await p.$eval('.h-dg-dlg [data-dg-sum]', e => e.textContent), /en %/);
            assert.ok(await p.$('.h-dg-dlg [data-dgo-row="limit"] .ui-num'), 'C3 : la case chiffrée du curseur');
            assert.ok(await p.$('.h-dg-dlg [data-dgo-row="pop"] .ui-help'), 'C8 : la bulle « ? »');
            await shot(p, 'graphique-stacked');
        });
        await t('K1 : une étiquette manquante ou une année illisible → le champ encadré, la phrase dessous, rien n’est demandé', async () => {
            await openKind(p, 'bars'); await appTab(p);
            await p.waitForFunction(() => document.querySelectorAll('.h-dg-dlg [data-dg-src] option').length > 10);
            await p.selectOption('.h-dg-dlg [data-dg-src]', 'q:surnames'); await p.selectOption('.h-dg-dlg [data-dgo="pop"]', 'label');
            const before = await preview(p); await p.click('.h-dg-dlg [data-dg-srcgo]'); await p.waitForTimeout(500);
            assert.ok(await p.$('.h-dg-dlg [data-dgo-row="label"].is-invalid, .h-dg-dlg [data-dgo-row="label"] .is-invalid'), 'champ encadré');
            assert.match(await p.$eval('.h-dg-dlg .ui-field-error', e => e.textContent), /Choisis une étiquette/);
            assert.equal(await preview(p), before, 'rien n’a changé');
            await p.selectOption('.h-dg-dlg [data-dgo="pop"]', ''); await p.fill('.h-dg-dlg [data-dgo="from"]', 'l’an passé');
            await p.click('.h-dg-dlg [data-dg-srcgo]'); await p.waitForTimeout(300);
            assert.match(await p.$eval('.h-dg-dlg [data-dgo-row="period"] .ui-field-error', e => e.textContent), /Écris une année/);
        });
        await t('une statistique de l’app (déjà comptée) : options grisées, tri, N premiers et % gardés ; « Refaire avec Compter dans ma base »', async () => {
            await openKind(p, 'bars'); await appTab(p);
            await p.waitForFunction(() => document.querySelectorAll('.h-dg-dlg [data-dg-src] option').length > 10);
            await p.selectOption('.h-dg-dlg [data-dg-src]', 'app:surnames');
            await p.waitForSelector('.h-dg-dlg [data-dgo-redo]');
            assert.ok(await p.$eval('.h-dg-dlg [data-dgo="pop"]', e => e.disabled)); assert.ok(!await p.$eval('.h-dg-dlg [data-dgo="sort"]', e => e.disabled));
            await p.selectOption('.h-dg-dlg [data-dgo="sort"]', 'az'); await p.$eval('.h-dg-dlg [data-dgo="limit"]', e => { e.value = '3'; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); });
            await p.click('.h-dg-dlg [data-dg-srcgo]'); await p.waitForSelector('.h-dg-dlg [data-dg-tab="data"].is-active');
            const labels = await p.$$eval('.h-dg-dlg [data-grid="0"] tbody tr', trs => trs.map(tr => tr.querySelector('input')?.value));
            assert.equal(labels.length, 4, labels.join()); assert.equal(labels[3], 'Autres'); assert.deepEqual(labels.slice(0, 3), [...labels.slice(0, 3)].sort((a, b) => a.localeCompare(b, 'fr')));
            await appTab(p); await p.selectOption('.h-dg-dlg [data-dg-src]', 'app:surnames'); await p.click('.h-dg-dlg [data-dgo-redo]');
            assert.equal(await p.$eval('.h-dg-dlg [data-dg-src]', e => e.value), 'q:surnames'); assert.ok(!await p.$eval('.h-dg-dlg [data-dgo="pop"]', e => e.disabled));
        });
        await t('« Des données de mon arbre » : pour chaque type, le groupe de personnes change le dessin', async () => {
            for (const k of TREE) {
                await openKind(p, k); await appTab(p);
                const svg0 = await goAndWait(p, '[data-dg-kappgo]', await preview(p));
                await appTab(p); await p.selectOption('.h-dg-dlg [data-dgo-tree] [data-dgo="pop"]', k === 'mobility' || k === 'nightingale' ? 'desc' : 'pat');
                if (k === 'mobility' || k === 'nightingale') { await p.$eval('.h-dg-dlg [data-dgo-tree] [data-dgo="gens"]', e => { e.value = '0'; }); }
                const svg1 = await goAndWait(p, '[data-dg-kappgo]', svg0, k);
                assert.notEqual(svg1, svg0, k);
            }
        });
        await t('panneaux propres (cartes, frises, survie, métiers…) : pour chaque type, le groupe de personnes ajouté change le dessin ; anciens champs cachés', async () => {
            for (const k of CUSTOM) {
                await openKind(p, k); await appTab(p);
                const go = Object.values({ a: '[data-dgm-go]', b: '[data-c2-go]', c: '[data-gn-go]', d: '[data-dfa-go]', e: '[data-dm-go]' }).join(', ');
                assert.ok(await p.$('.h-dg-dlg .h-dgo-host [data-dgo="pop"]'), k + ' : le groupe de personnes');
                const legacy = await p.$$eval('.h-dg-dlg [data-dgm-anc], .h-dg-dlg [data-c2="anc"], .h-dg-dlg [data-gn="scope"], .h-dg-dlg [data-dfa="scope"]', els => els.filter(e => e.offsetParent !== null).length);
                assert.equal(legacy, 0, k + ' : un ancien « seulement mes ancêtres » encore visible');
                const svg0 = await goAndWait(p, go, await preview(p)).catch(() => preview(p));
                if (!(await p.$('.h-dg-dlg .h-dgo-host'))) await appTab(p);
                await p.selectOption('.h-dg-dlg .h-dgo-host [data-dgo="pop"]', ['crises', 'alivepyr'].includes(k) ? 'mat' : 'pat');
                const svg1 = await goAndWait(p, go, svg0, k);
                assert.notEqual(svg1, svg0, k);
                const sum = await p.$eval('.h-dg-dlg [data-dg-sum]', e => e.textContent).catch(() => ''); assert.match(sum, /branche (paternelle|maternelle)/, k + ' : ' + sum);
                if (k === 'choropleth' || k === 'fasurvie') await shot(p, 'panneau-' + k);
            }
        });
        await t('les anciens diagrammes s’ouvrent pareil (chiffres tenus à jour, figés, cartes)', async () => {
            const out = await p.evaluate(async () => {
                const E = window.LCNDA_EXT, A = window.LCNDA_APP, post = body => A.api('save_diagram', {}, { method: 'POST', body });
                const old1 = { live: { key: 'app:surnames', label: 'Noms' }, o: { title: 'Noms' }, rows: [{ label: 'X', s0: 1 }], series: [{ name: 'Nombre' }] };
                const old2 = { o: { title: 'Fixe' }, rows: [{ label: 'A', s0: 3 }, { label: 'B', s0: 5 }], series: [{ name: 'Nombre' }] };
                const old3 = { live: { key: 'ex:0', label: 'Exemple' }, o: { title: 'Exemple' }, rows: [] };
                const ids = [];
                for (const [kind, spec] of [['columns', old1], ['bars', old2], ['pie', old3]]) { const r = await post({ id: 0, name: spec.o.title, kind, spec }); ids.push(Number(r.result?.id || r.id)); }
                const R = E.diagramRender, svgs = [];
                for (const id of ids) svgs.push(await E.diagramSvg(id));
                const pairs1 = await E.diagramStatRows('app:surnames'), pairs3 = await E.diagramStatRows('ex:0');
                const want = [R.svg(E.diagramFillFrom({ kind: 'columns', ...old1 }, pairs1, 'Noms')), R.svg({ kind: 'bars', ...old2 }), R.svg(E.diagramFillFrom({ kind: 'pie', ...old3 }, pairs3, 'Exemple'))];
                return { ids, same: svgs.map((s, i) => s === want[i]) };
            });
            assert.deepEqual(out.same, [true, true, true]);
            await openKind(p, null, out.ids[0]); await appTab(p);
            await p.waitForFunction(() => document.querySelectorAll('.h-dg-dlg [data-dg-src] option').length > 10);
            assert.equal(await p.$eval('.h-dg-dlg [data-dg-src]', e => e.value), 'app:surnames');
            assert.ok(await p.$eval('.h-dg-dlg [data-dgo="what"]', e => e.disabled), 'déjà compté : « ce qu’on compte » grisé');
            assert.ok(await p.$eval('.h-dg-dlg [data-dg-srclive]', e => e.checked), '« Tenir à jour » gardé');
            const saved = await p.evaluate(async id => (await window.LCNDA_APP.api('diagrams')).diagrams.find(d => d.id === id).spec, out.ids[0]);
            assert.deepEqual(Object.keys(saved.live).sort(), ['key', 'label'], 'rien d’ajouté au diagramme enregistré');
        });
        await t('« Tenir à jour » : le diagramme se recalcule quand la base change', async () => {
            await openKind(p, 'bars'); await appTab(p);
            await p.waitForFunction(() => document.querySelectorAll('.h-dg-dlg [data-dg-src] option').length > 10);
            await p.selectOption('.h-dg-dlg [data-dg-src]', 'q:custom'); await p.selectOption('.h-dg-dlg [data-dgo="pop"]', 'search');
            await p.fill('.h-dg-dlg [data-dgo="search"]', 'MARTIN'); await p.selectOption('.h-dg-dlg [data-dgo="by"]', 'first_name');
            await p.$eval('.h-dg-dlg [data-dgo="limit"]', e => { e.value = '0'; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); });
            await p.click('.h-dg-dlg [data-dgo-row="live"] i'); assert.ok(await p.$eval('.h-dg-dlg [data-dgo="live"]', e => e.checked));
            await p.click('.h-dg-dlg [data-dg-srcgo]'); await p.waitForSelector('.h-dg-dlg [data-dg-tab="data"].is-active');
            assert.match(await p.$eval('.h-dg-dlg [data-dg-sum]', e => e.textContent), /les noms qui contiennent « MARTIN », par prénom.*tenu à jour/);
            await p.click('.h-dg-dlg [data-dg-save]'); await p.waitForFunction(() => !document.querySelector('.h-dg-dlg'));
            const id = await p.evaluate(async () => { const d = (await window.LCNDA_APP.api('diagrams')).diagrams; return d.find(x => x.spec?.live?.q?.search === 'MARTIN').id; });
            assert.doesNotMatch(await p.evaluate(id => window.LCNDA_EXT.diagramSvg(id), id), /Zéphirin/);
            runPhp(dir, `require "lib/paths.php"; require "lib/bootstrap.php"; db()->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Zéphirin','MARTIN','male')");`);
            await ready(p);
            assert.match(await p.evaluate(id => window.LCNDA_EXT.diagramSvg(id), id), /Zéphirin/);
        });
        await t('390 px et mode sombre : le bloc tient dans l’écran, sans défilement de côté', async () => {
            const m = await browser.newPage({ viewport: { width: 390, height: 844 } }); watch(m); await ready(m);
            for (const k of ['columns', 'fasurvie']) {
                await m.evaluate(k => window.LCNDA_EXT.openDiagramEditor(null, { kind: k }), k); await m.waitForSelector('.h-dg-dlg [data-dg-tab="app"]');
                await m.click('.h-dg-dlg [data-dg-tab="app"]'); await m.waitForSelector('.h-dg-dlg [data-dgo-box]'); await m.waitForTimeout(400);
                const over = await m.evaluate(() => { const b = document.querySelector('.h-dg-dlg [data-dgo-box]'), pn = document.querySelector('.h-dg-dlg .h-dg-pane'); return [b.scrollWidth - b.clientWidth, document.documentElement.scrollWidth, pn.scrollWidth - pn.clientWidth]; });
                assert.ok(over[0] <= 2 && over[1] <= 391 && over[2] <= 2, k + ' : ' + over);
                if (SHOTS) await m.screenshot({ path: path.join(SHOTS, `mobile-${k}.png`) });
                await m.evaluate(() => document.querySelectorAll('.h-dg-dlg').forEach(d => { d.close(); d.remove(); }));
            }
            await m.close();
            await p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
            await openKind(p, 'columns'); await appTab(p); await p.waitForTimeout(300);
            const bg = await p.$eval('.h-dg-dlg [data-dg-sum]', e => getComputedStyle(e).backgroundColor);
            const lum = c => (c.match(/\d+/g) || [255, 255, 255]).slice(0, 3).reduce((n, x) => n + Number(x), 0) / 3;
            const fg = await p.$eval('.h-dg-dlg [data-dg-sum]', e => getComputedStyle(e).color);
            assert.ok(lum(bg) < 90 && lum(fg) > 170, `la phrase lisible en sombre (fond ${bg}, texte ${fg})`); await shot(p, 'sombre-columns');
            await p.evaluate(() => { delete document.documentElement.dataset.theme; });
        });
        await t('aucune erreur JavaScript', async () => assert.deepEqual(errors, []));

        /* ── 5 000 personnes ── */
        await t('base de 5 000 personnes : chaque demande en moins de 3 secondes', async () => {
            const dir2 = path.join(tmp, 'big'); seed(dir2, ['big']);
            big = await serve(dir2, await freePort());
            const times = [];
            const runs = [['diagram_app_count', { what: 'persons', by: 'last_name' }], ['diagram_app_count', { what: 'events', by: 'type', distinct: 1 }], ['diagram_app_count', { what: 'persons', by: 'century', series: 'sex', unit: 'avg', value: 'age_death' }],
                ['diagram_app_count', { what: 'births', by: 'county', dg_pop: 'desc', dg_root: 1 }], ['diagram_app_count', { what: 'persons', by: 'generation', dg_pop: 'anc' }], ['diagram_app_count', { what: 'marriages', by: 'month', dg_from: 1650, dg_to: 1750 }],
                ['diagram_app_count', { what: 'places', by: 'county' }], ['diagram_app_count', { what: 'persons', by: 'occupation', dg_pop: 'search', dg_q: 'BIG1' }],
                ...Object.values(OWN_DATA).map(([a, q]) => [a, { ...q, dg_pop: 'pat', dg_from: 1600 }])];
            for (const [action, q] of runs) {
                const t0 = Date.now(); const r = await fetch(`${big.base}api.php?action=${action}&${qs(q)}`); const j = await r.json(); const ms = Date.now() - t0;
                assert.equal(r.status, 200, action + ' ' + JSON.stringify(j).slice(0, 200)); times.push(ms); assert.ok(ms < 3000, `${action} ${JSON.stringify(q)} : ${ms} ms`);
            }
            const all = await fetch(`${big.base}api.php?action=diagram_app_count&what=persons&by=none`).then(r => r.json()); assert.ok(all.total > 5000, `${all.total} personnes`);
            console.log(`    ${runs.length} demandes · la plus lente ${Math.max(...times)} ms · moyenne ${Math.round(times.reduce((a, b) => a + b, 0) / times.length)} ms`);
        });
    } finally { await browser?.close(); proc.kill(); big?.proc.kill(); fs.rmSync(tmp, { recursive: true, force: true }); }
    process.exit(failed ? 1 : 0);
})();
