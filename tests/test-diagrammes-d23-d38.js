'use strict';
/**
 * 📊 Diagrammes D23 à D38 (assets/js/heritage-diagram-vie.js, lib/diagram_vie.php) et le menu « Graphique » de
 * « Depuis l'app » (assets/js/heritage-diagram-options.js, lib/diagram_appcount.php) : critères « ＋ Critère » combinés,
 * points de départ rangés par rubrique, grisés quand ils n'ont pas de sens pour le diagramme.
 *     node tests/test-diagrammes-d23-d38.js        (DVI_SHOTS=<dossier> pour les captures)
 * 1. Sans navigateur : les 12 nouvelles sortes se dessinent (900 et 360 px) ; les points de départ (rubriques, formes,
 *    réglages valides) ; la phrase avec les critères ; les anciens réglages se relisent.
 * 2. Serveur (tests/fixtures/diagram-vie-seed.php) : les chiffres connus de la famille BOIS (mortalité, conceptions,
 *    écart d'âge, durée, veuvage, signatures, registres) ; bûcheron + 3 enfants + né à Pernay = 2 personnes ; migration 59.
 * 3. Navigateur : chaque sorte s'ouvre depuis la galerie et se remplit depuis la base ; « Graphique » : rubriques, grisés,
 *    critères ajoutés à la souris, « N personnes trouvées », clic → la liste des personnes ; 390 px ; mode sombre ; aucune erreur.
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
const KINDS = ['vieenfants', 'viefratries', 'viesaisons', 'vieveuvage', 'viedurees', 'vieparents', 'vieavant', 'vieecart', 'vieberceau', 'viesigner', 'viepreuves', 'vieregistres'];
const GROUP = { vieenfants: 'Vie et mort', viefratries: 'Vie et mort', viesaisons: 'Vie et mort', vieveuvage: 'Couples et familles', viedurees: 'Couples et familles', vieparents: 'Couples et familles',
    vieavant: 'Couples et familles', vieecart: 'Couples et familles', vieberceau: 'Lieux', viesigner: 'Ma recherche', viepreuves: 'Ma recherche', vieregistres: 'Ma recherche' };
const RUBRIQUES = ['Personnes', 'Couples', 'Enfants', 'Lieux', 'Métiers', 'Dates', 'Ma recherche', 'Médias'];
const RULES = [{ field: 'occupation', value: 'bûcheron' }, { field: 'children_count', from: 3, to: 3 }, { field: 'place', value: 'Pernay' }];

/* ── 1. Bac à sable ── */
const sandbox = { window: {}, console, setTimeout, clearTimeout, performance, Intl, MutationObserver: class { observe() {} }, CSS: { escape: s => s }, document: { documentElement: {}, querySelectorAll: () => [], addEventListener() {}, createElement: () => ({}) } };
sandbox.window.LCNDA_APP = { state: { bootstrap: { startPersonId: 1 } }, plural: (n, one, many) => `${n} ${n < 2 ? one : many}` };
vm.createContext(sandbox);
for (const f of ['heritage-diagrams-render.js', 'heritage-diagram-famille.js', 'heritage-diagram-vie.js', 'heritage-diagram-options.js'])
    vm.runInContext(fs.readFileSync(path.join(appRoot, 'assets/js', f), 'utf8'), sandbox, { filename: f });
const ext = sandbox.window.LCNDA_EXT, R = ext.diagramRender, O = ext.diagramAppOpts;
const same = (a, b, m) => assert.equal(JSON.stringify(a), JSON.stringify(b), m);

step('les 12 sortes D23–D38 : chacune dans son groupe, avec son aide, son exemple dessiné à 900 et 360 px', () => {
    same([...ext.diagramVie.KINDS], KINDS);
    for (const k of KINDS) {
        const d = R.KINDS[k]; assert.ok(d, k); assert.equal(d.group, GROUP[k], k); assert.ok(String(d.help || '').length > 30, k + ' : aide');
        assert.ok(d.fromApp?.html && d.fromApp?.bind, k + ' : « Depuis l’app »'); assert.ok(d.grids?.[0]?.cols?.length, k + ' : données modifiables');
        for (const W of [900, 360]) { const r = d.render(d.sample(), W, 13); assert.ok(r.h > 0 && /<(rect|path|circle|line|text)/.test(r.svg), `${k} ${W}`); assert.doesNotMatch(r.svg, /NaN|undefined|Infinity/, `${k} ${W}`); }
    }
});
step('D23–D31 : le groupe de personnes et la période communs (adopt), leurs anciens champs cachés', () => {
    for (const k of ['vieenfants', 'viefratries', 'viesaisons', 'vieveuvage', 'viedurees', 'vieparents', 'vieavant', 'vieecart']) {
        const c = O.CUSTOM[k]; assert.ok(c, k); assert.equal(c.go, '[data-dfa-go]'); assert.ok(c.hide.includes('[data-dvi="scope"]'), k);
        assert.ok(O.customFields(k).includes('pop') && O.customFields(k).includes('period'), k);
    }
});
step('« Graphique » : des points de départ rangés par rubrique, chacun valide et avec sa forme', () => {
    const P = O.PRESETS; assert.ok(P.length >= 45, P.length + ' points de départ');
    assert.equal(P[0][0], 'custom');
    for (const old of ['surnames', 'firstnames', 'sex', 'occupations', 'generation', 'births_place', 'births_county', 'births_country', 'births_decade', 'marriages_place', 'marriages_month', 'deaths_place', 'deaths_country', 'deaths_decade', 'age_death', 'life_century', 'causes', 'kids', 'events_type', 'places_county', 'media_type'])
        assert.ok(P.some(([id]) => id === old), 'ancien point de départ gardé : ' + old);
    same([...new Set(P.slice(1).map(p => p[3]))], RUBRIQUES);
    for (const [id, label, q, rub, shape] of P.slice(1)) {
        assert.ok(['cat', 'few', 'time', 'month', 'age', 'sex2'].includes(shape), id);
        const n = O.norm(q); for (const k of Object.keys(q)) assert.equal(String(n[k]), String(q[k]), `${id} : ${k} accepté (${label})`);
        assert.ok(RUBRIQUES.includes(rub));
    }
    assert.equal(new Set(P.map(p => p[0])).size, P.length, 'pas deux fois le même');
});
step('« Graphique » : ce qui n’a pas de sens est mis de côté (camembert ≠ temps, courbe ≠ noms, pyramide = hommes et femmes)', () => {
    assert.ok(O.fits('pie', 'few') && O.fits('pie', 'cat') && !O.fits('pie', 'time') && !O.fits('pie', 'age'));
    assert.ok(O.fits('line', 'time') && O.fits('line', 'month') && !O.fits('line', 'cat'));
    assert.ok(O.fits('pyramid', 'sex2') && !O.fits('pyramid', 'cat'));
    assert.ok(O.fits('wordcloud', 'cat') && !O.fits('wordcloud', 'few'));
    assert.ok(O.fits('nightingale', 'month') && !O.fits('nightingale', 'time'));
    for (const k of ['columns', 'bars', 'lollipop']) for (const s of ['cat', 'few', 'time', 'month', 'age', 'sex2']) assert.ok(O.fits(k, s), k + ' accepte tout');
    assert.ok(O.fits('pie', ''), 'Sur mesure : toujours');
});
step('« Sur mesure » : les critères combinés (ET / OU) envoyés au serveur et dits en clair', () => {
    const q = { what: 'persons', by: 'decade', limit: 0, rules: RULES };
    const p = O.params(q); same(JSON.parse(p.rules), RULES); assert.equal(p.match, 'all');
    assert.equal(O.params({ ...q, match: 'any' }).match, 'any');
    assert.equal(O.summary(q, { fields: O.ORDER }), 'Personnes, métier « bûcheron », ayant 3 enfants, nés à « Pernay », par décennie, toutes les valeurs.');
    assert.equal(O.summary(q, { fields: O.ORDER, found: 2 }), 'Personnes, métier « bûcheron », ayant 3 enfants, nés à « Pernay », par décennie, toutes les valeurs — 2 personnes trouvées.');
    assert.match(O.summary({ ...q, match: 'any' }, { fields: O.ORDER }), /métier « bûcheron » ou ayant 3 enfants ou nés à « Pernay »/);
    assert.match(O.summary({ ...q, pop: 'anc', rules: [{ field: 'children_count', from: 3 }, { field: 'year', from: 1800, to: 1900 }, { field: 'gender', value: 'female', not: true }] }, { fields: O.ORDER }), /mes ancêtres, ayant au moins 3 enfants, nés entre 1800 et 1900, sauf femmes/);
    // le bloc : « ＋ Critère » et « tous / au moins un » (montré à partir de 2 critères)
    const h = O.html(q, { fields: O.ORDER, kind: 'columns' });
    assert.match(h, /data-dgo-row="rules"/); assert.match(h, /data-dgo-addrule/); assert.match(h, /data-dgo="match"/);
    assert.doesNotMatch(O.html(q, { fields: O.ORDER, kind: 'columns', locked: true }), /data-dgo-row="rules"/, 'déjà compté : pas de critère');
    assert.match(O.HELP.rules, /ET/);
});
step('les anciens réglages se relisent : sans critère, rien de plus envoyé ; critères piégés écartés', () => {
    const old = { what: 'births', by: 'commune', limit: 10, live: true };
    const n = O.norm(old); same(n.rules, []); assert.equal(n.match, 'all'); assert.equal(O.params(old).rules, undefined);
    same(O.norm({ rules: [{ field: 'x;DROP' }, null, 'abc', { field: 'occupation', value: 'a' }] }).rules, [{ field: 'occupation', value: 'a' }]);
    assert.equal(O.norm({ rules: Array.from({ length: 50 }, () => ({ field: 'sosa' })) }).rules.length, 30);
    assert.equal(O.norm({ match: 'nimporte' }).match, 'all');
});
step('les personnes derrière chaque barre passent dans le tableau (une série, plusieurs séries)', () => {
    // une série : le tableau rempli par heritage-diagrams.js (diagramFillFrom), vérifié dans le navigateur plus bas
    assert.match(R.svg({ kind: 'columns', rows: [{ label: 'a', s0: 2, ids: '145,152' }, { label: 'b', s0: 1 }], series: [{ name: 'n' }] }, 600), /data-dfa-pids="145,152"/);
    assert.match(R.svg({ kind: 'pie', rows: [{ label: 'a', s0: 2, ids: '7' }, { label: 'b', s0: 1 }], series: [{ name: 'n' }] }, 600), /data-dfa-pids="7"/);
    const two = O.toSpec({ kind: 'stacked', ...R.KINDS.stacked.sample() }, { rows: [{ label: 'XIXe s.', value: 3, values: [1, 2], ids_s: ['1', '2,3'] }], series: ['Hommes', 'Femmes'], what: 'persons', unit: 'count' });
    assert.equal(two.rows[0].ids0, '1'); assert.equal(two.rows[0].ids1, '2,3'); assert.match(R.svg(two, 600), /data-dfa-pids="2,3"/);
});

/* ── 2. et 3. Serveur et navigateur ── */
let chromium = null;
for (const p of ['playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright']) { try { ({ chromium } = require(p)); break; } catch (_) { chromium = null; } }
const php = spawnSync('php', ['-v'], { encoding: 'utf8' }).status === 0 ? 'php' : null;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-dvi-'));
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
const SHOTS = process.env.DVI_SHOTS || '';
const freePort = () => new Promise(res => { const s = require('node:net').createServer(); s.listen(0, '127.0.0.1', () => { const q = s.address().port; s.close(() => res(q)); }); });
const runPhp = (dir, code) => { const r = spawnSync(php, ['-r', code], { cwd: appRoot, encoding: 'utf8', env: envFor(dir) }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout; };
const seed = dir => {
    fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    runPhp(dir, 'require "lib/paths.php"; (new PDO("sqlite:".DATA_DIR."/genealogy.sqlite"))->exec(file_get_contents(APP_ROOT."/data/schema.sql")); require "lib/bootstrap.php"; db();');
    const r = spawnSync(php, [path.join(appRoot, 'tests/fixtures/diagram-vie-seed.php')], { cwd: appRoot, encoding: 'utf8', env: envFor(dir) });
    const m = /^ok vie (.+)$/m.exec(r.stdout || ''); if (r.status !== 0 || !m) throw new Error(r.stderr || r.stdout);
    return JSON.parse(m[1]);
};
const qs = o => Object.entries(o).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

(async () => {
    for (const [name, fn] of steps) { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } }
    if (!chromium || !php) { console.log('— serveur et navigateur : Playwright ou PHP absent, partie sautée'); process.exit(failed ? 1 : 0); }
    const dir = path.join(tmp, 'a'); const S = seed(dir);
    const port = await freePort(), base = `http://127.0.0.1:${port}/`;
    const proc = spawn(php, ['-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(dir), stdio: 'ignore' });
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
    const get = async (action, q) => { const r = await fetch(`${base}api.php?action=${action}&${qs(q)}`); const j = await r.json(); return { status: r.status, ...j }; };
    const fam = { dg_pop: 'people', dg_ids: S.family.join(',') };
    let browser = null;
    try {
        await t('migration 59 : « a signé » sur les événements et les témoins', async () => {
            const cols = runPhp(dir, 'require "lib/paths.php"; require "lib/bootstrap.php"; $p = db(); echo json_encode([array_column($p->query("PRAGMA table_info(events)")->fetchAll(), "name"), array_column($p->query("PRAGMA table_info(event_witnesses)")->fetchAll(), "name")]);');
            const [ev, ew] = JSON.parse(cols); assert.ok(ev.includes('signed1') && ev.includes('signed2')); assert.ok(ew.includes('signed'));
            const src = fs.readFileSync(path.join(appRoot, 'api.php'), 'utf8'); assert.equal((src.match(/foreach\(\['signed1','signed2'\] as \$sk\)/g) || []).length, 2, 'ajout et modification d’un événement');
            assert.match(fs.readFileSync(path.join(appRoot, 'index.php'), 'utf8'), /name="signed1"[\s\S]*name="signed2"/);
        });
        await t('serveur : les chiffres connus de la famille BOIS (D23, D29, D30, D31, D27, D28)', async () => {
            const inf = await get('diagram_vie', { what: 'infant', ...fam });
            const r70 = inf.rows.find(r => r.label === '1870'); assert.ok(r70, JSON.stringify(inf)); assert.equal(r70.n, 3); assert.equal(r70.d1, 1); assert.equal(r70.d5, 2);
            assert.equal(r70.ids5.split(',').length, 2); assert.equal(inf.unknown, 1, 'Jacques : décès inconnu, laissé de côté');
            const pre = await get('diagram_vie', { what: 'prenup', ...fam }); same(pre.rows.map(r => [r.label, r.n, r.before, r.early]), [['1870', 1, 0, 1]]);
            const gap = await get('diagram_vie', { what: 'agegap', ...fam }); const jm = gap.rows.find(r => /Jean BOIS/.test(r.couple)); assert.ok(Math.abs(jm.gap - 5.92) < 0.05, JSON.stringify(jm));
            const du = await get('diagram_vie', { what: 'duration', ...fam }); assert.ok(Math.abs(du.rows.find(r => /Jean BOIS/.test(r.couple)).years - 35.9) < 0.1);
            const wi = await get('diagram_vie', { what: 'widow', ...fam }); same(wi.rows.map(r => [r.name, r.sex, r.months]), [['Marie LEBLANC', 'f', 22]]);
            const pa = await get('diagram_vie', { what: 'parentage', ...fam }); const pierre = pa.rows.find(r => r.year === '1875'); assert.equal(Math.floor(Number(pierre.fa)), 24); assert.equal(Math.floor(Number(pierre.ma)), 18);
        });
        await t('serveur : signatures (D35), registres (D37), preuves (D36), loin du berceau (D34), fratries (D25)', async () => {
            const sg = await get('diagram_vie', { what: 'sign' }); same(sg.rows.map(r => [r.label, r.h1, r.h0, r.f1, r.f0, r.w1]), [['1870', 1, 0, 0, 1, 1]]);
            const rg = await get('diagram_vie', { what: 'registers' }); assert.ok(rg.rows.some(r => r.place === 'Pernay' && r.from === '1874' && r.kind === 'act'), JSON.stringify(rg));
            const pr = await get('diagram_vie', { what: 'proof', root: S.jean, gens: 3 }); assert.ok(pr.rows.length >= 1); assert.equal(pr.rows[0].gen, 1);
            const cr = await get('diagram_vie', { what: 'cradle', root: S.jean, gens: 3, ref: 'place', place: S.pernay }); assert.ok(!cr.missing, JSON.stringify(cr));
            const fr = await get('diagram_vie', { what: 'siblings', ...fam }); const bois = fr.rows.find(r => /Jean BOIS/.test(r.couple)); assert.equal(bois.born, 3); assert.equal(bois.adult, 1); assert.equal(bois.young, 2);
            const bad = await get('diagram_vie', { what: 'rien' }); assert.equal(bad.status, 422);
            const pop = await get('diagram_vie', { what: 'infant', dg_pop: 'zzz' }); assert.equal(pop.status, 422, 'groupe piégé refusé');
        });
        await t('serveur : bûcheron + 3 enfants + né à Pernay = Jean et Paul (2 personnes), le clic garde leurs fiches', async () => {
            const all = await get('diagram_app_count', { what: 'persons', by: 'decade', limit: 0, rules: JSON.stringify(RULES), match: 'all' });
            assert.equal(all.people, 2); same(all.rows.map(r => [r.label, r.value]), [['1850–1859', 2]]);
            same(all.rows[0].ids.split(',').map(Number).sort((a, b) => a - b), [S.jean, S.paul].sort((a, b) => a - b));
            const any = await get('diagram_app_count', { what: 'persons', by: 'decade', limit: 0, rules: JSON.stringify(RULES), match: 'any' }); assert.ok(any.people > 2);
            // chaque critère retire bien quelqu'un : sans le lieu, Marc (Tours) entre ; sans le métier, Pierre (laboureur) et Marie (mère de 3 enfants) entrent ; sans les enfants, Louis (2 enfants) entre
            for (const [i, who, n] of [[2, 'Marc', 3], [0, 'Pierre', 4], [1, 'Louis', 3]]) { const r = await get('diagram_app_count', { what: 'persons', by: 'first_name', limit: 0, rules: JSON.stringify(RULES.filter((_, j) => j !== i)) }); assert.equal(r.people, n, who); assert.ok(r.rows.some(x => x.label === who), who); }
            const occ = await get('diagram_app_count', { what: 'persons', by: 'occupation', limit: 0, rules: JSON.stringify([RULES[2]]) }); assert.ok(occ.rows.some(r => /^Bûcheron$/i.test(r.label) && r.value === 3), JSON.stringify(occ.rows));
            const big = await get('diagram_app_count', { what: 'persons', rules: 'x'.repeat(30000) }); assert.equal(big.status, 422, 'critères trop longs refusés');
            const junk = await get('diagram_app_count', { what: 'persons', rules: '{"a":' }); assert.equal(junk.status, 422);
        });
        await t('serveur : les nouveaux regroupements (âge au mariage, au premier enfant, unions, branche, vivant, source)', async () => {
            for (const by of ['marr_age5', 'child_age5', 'unions', 'branch', 'living', 'sourced']) { const r = await get('diagram_app_count', { what: 'persons', by, limit: 0 }); assert.equal(r.status, 200, by); assert.ok(r.rows?.length >= 1, by + ' ' + JSON.stringify(r).slice(0, 200)); }
            const af = await get('diagram_app_count', { what: 'persons', by: 'century', unit: 'avg', value: 'age_first_child', limit: 0, ...fam }); assert.ok(af.rows.length && af.rows[0].value > 15 && af.rows[0].value < 60, JSON.stringify(af.rows));
        });

        browser = await chromium.launch(exe ? { executablePath: exe } : {});
        const errors = [];
        const watch = p => { p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); }); p.on('dialog', d => { errors.push('dialogue : ' + d.message()); d.dismiss(); }); };
        const ready = async p => { await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.bootstrap && window.LCNDA_EXT?.openDiagramEditor && window.LCNDA_EXT?.diagramVie && window.LCNDA_EXT?.diagramAppOpts, null, { timeout: 20000 }); await p.waitForTimeout(400); };
        const closeEditor = p => p.evaluate(() => document.querySelectorAll('.h-dg-dlg, dialog.dfa-people').forEach(d => { if (d.open) d.close(); d.remove(); }));
        const openKind = async (p, k) => { await closeEditor(p); await p.evaluate(k => { window.LCNDA_EXT.openDiagramEditor(null, { kind: k }); }, k); await p.waitForSelector('.h-dg-dlg [data-dg-preview] svg'); };
        const preview = p => p.$eval('.h-dg-dlg [data-dg-preview] svg', s => s.outerHTML);
        const shot = async (p, name, sel = '.h-dg-dlg [data-dg-preview]') => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); const el = await p.$(sel); await (el || p).screenshot({ path: path.join(SHOTS, name + '.png') }); };
        const ctx = await browser.newContext({ viewport: { width: 1360, height: 950 } });
        const p = await ctx.newPage(); watch(p); await ready(p);

        await t('« Nouveau diagramme » : les 12 sortes dans la galerie, chacune dans son groupe', async () => {
            const pr = p.evaluate(() => window.LCNDA_EXT.diagramsInternals.chooseType());
            await p.waitForSelector('.h-dg-gallery .h-dg-tile');
            const groups = await p.$$eval('.h-dg-gallery h4', hs => Object.fromEntries(hs.map(h => [h.textContent, [...h.nextElementSibling.querySelectorAll('.h-dg-tile')].map(x => x.textContent.trim())])));
            for (const k of KINDS) { const label = await p.evaluate(k => window.LCNDA_EXT.diagramRender.KINDS[k].label, k); assert.ok(groups[GROUP[k]]?.some(x => x.includes(label)), `${k} dans ${GROUP[k]}`); }
            await shot(p, 'galerie', '.h-dg-gallery');
            await p.click('.h-dg-gallery [data-close]'); assert.equal(await pr, null);
        });
        const fromApp = async k => {
            await openKind(p, k); await p.click('.h-dg-dlg [data-dg-tab="app"]'); await p.waitForSelector('.h-dg-dlg [data-dfa-go]');
            if (k === 'vieberceau' || k === 'viepreuves') await p.evaluate(id => { const pk = document.querySelector('.h-dg-dlg input[name="dvi_root"]')?.closest('.pk'); window.LCNDA_PICKER.pickerSet(pk, id); }, S.jean);
            await p.click('.h-dg-dlg [data-dfa-go]');
            await p.waitForFunction(() => document.querySelector('.h-dg-dlg [data-dg-tab="data"]')?.classList.contains('is-active') || /⚠️/.test(document.querySelector('.h-dg-dlg [data-dfa-msg]')?.textContent || ''), null, { timeout: 15000 });
            const msg = await p.$eval('.h-dg-dlg [data-dfa-msg]', e => e.textContent).catch(() => '');
            assert.doesNotMatch(msg, /⚠️/, `${k} : ${msg}`);
            await p.waitForTimeout(300);
            return p.evaluate(() => document.querySelectorAll('.h-dg-dlg [data-grid="0"] tbody tr').length);
        };
        for (const k of KINDS) {
            await t(`« Depuis l’app » : ${k} se remplit avec la base, le dessin change`, async () => {
                await openKind(p, k); const before = await preview(p); await shot(p, 'exemple-' + k);
                const n = await fromApp(k); assert.ok(n > 0, `${k} : ${n} lignes`);
                const s = await preview(p); assert.notEqual(s, before, k + ' : dessin de la base'); assert.doesNotMatch(s, /NaN|undefined|Dessin impossible/);
                await shot(p, 'base-' + k);
            });
        }
        await t('D23 : un clic sur une barre ouvre la liste des enfants morts jeunes', async () => {
            await fromApp('vieenfants');
            const n = await p.$$eval('.h-dg-dlg [data-dg-preview] [data-dfa-pids]', l => l.length); assert.ok(n >= 1);
            await p.$eval('.h-dg-dlg [data-dg-preview] [data-dfa-pids]', e => e.dispatchEvent(new MouseEvent('click', { bubbles: true })));
            await p.waitForSelector('dialog.dfa-people .choose-list-item'); await p.click('dialog.dfa-people [data-x]');
        });
        // « Graphique » : le menu des chiffres de l'app
        const graph = async k => { await openKind(p, k); await p.click('.h-dg-dlg [data-dg-tab="app"]'); await p.waitForSelector('.h-dg-dlg [data-dg-src] option[value="q:custom"]', { state: 'attached' }); };
        await t('« Graphique » : rangé par rubrique, ce qui n’a pas de sens est grisé « pas pour ce diagramme »', async () => {
            await graph('pie');
            const g = await p.$$eval('.h-dg-dlg [data-dg-src] optgroup', l => l.map(x => x.label));
            for (const r of RUBRIQUES) assert.ok(g.includes('🧮 Compter dans ma base · ' + r), r + ' : ' + g.join(' | '));
            const off = await p.$$eval('.h-dg-dlg [data-dg-src] option:disabled', l => l.map(o => o.value + '|' + o.textContent));
            assert.ok(off.some(x => x.startsWith('q:births_decade|') && /pas pour ce diagramme/.test(x)), 'camembert : pas de décennies');
            assert.ok(!off.some(x => x.startsWith('q:surnames|')), 'camembert : les noms oui');
            await graph('line');
            const off2 = await p.$$eval('.h-dg-dlg [data-dg-src] option:disabled', l => l.map(o => o.value));
            assert.ok(off2.includes('q:surnames') && !off2.includes('q:births_decade'), 'courbe : le temps oui, les noms non');
            await graph('columns');
            assert.equal(await p.$$eval('.h-dg-dlg [data-dg-src] option:disabled', l => l.length), 0, 'colonnes : tout');
        });
        await t('« Sur mesure » : bûcheron + 3 enfants + né à Pernay, par décennie — la phrase dit « 2 personnes trouvées », le clic ouvre Jean et Paul', async () => {
            await graph('columns');
            await p.selectOption('.h-dg-dlg [data-dg-src]', 'q:custom');
            await p.waitForSelector('.h-dg-dlg [data-dgo-addrule]');
            const add = async (field, fill) => { await p.selectOption('.h-dg-dlg [data-dgo-addrule]', field); const row = `.h-dg-dlg [data-dgo-rules] .h-lr-row:last-child`; await p.waitForSelector(row); await fill(row); };
            await add('occupation', r => p.fill(`${r} [data-lr="value"]`, 'bûcheron'));
            await add('children_count', async r => { await p.fill(`${r} [data-lr="from"]`, '3'); await p.fill(`${r} [data-lr="to"]`, '3'); await p.$eval(`${r} [data-lr="to"]`, e => e.dispatchEvent(new Event('change', { bubbles: true }))); });
            await add('place', async r => { await p.fill(`${r} [data-lr="value"]`, 'Pernay'); await p.$eval(`${r} [data-lr="value"]`, e => e.dispatchEvent(new Event('change', { bubbles: true }))); });
            assert.ok(await p.isVisible('.h-dg-dlg .h-dgo-match'), '« tous / au moins un » à partir de 2 critères');
            await p.selectOption('.h-dg-dlg [data-dgo="by"]', 'decade');
            await p.waitForFunction(() => /2 personnes trouvées/.test(document.querySelector('.h-dg-dlg [data-dg-sum]')?.textContent || ''), null, { timeout: 8000 });
            const sum = await p.$eval('.h-dg-dlg [data-dg-sum]', e => e.textContent);
            assert.match(sum, /métier « bûcheron », ayant 3 enfants, nés à « Pernay », par décennie/);
            await shot(p, 'sur-mesure', '.h-dg-dlg');
            await p.click('.h-dg-dlg [data-dg-srcgo]');
            await p.waitForFunction(() => document.querySelector('.h-dg-dlg [data-dg-tab="data"]')?.classList.contains('is-active'), null, { timeout: 10000 });
            const rows = await p.$$eval('.h-dg-dlg [data-grid="0"] tbody tr', l => l.length); assert.equal(rows, 1);
            await p.waitForSelector('.h-dg-dlg [data-dg-preview] [data-dfa-pids]', { state: 'attached', timeout: 8000 });
            const pids = await p.$eval('.h-dg-dlg [data-dg-preview] [data-dfa-pids]', e => e.getAttribute('data-dfa-pids'));
            same(pids.split(',').map(Number).sort((a, b) => a - b), [S.jean, S.paul].sort((a, b) => a - b));
            await p.$eval('.h-dg-dlg [data-dg-preview] [data-dfa-pids]', e => e.dispatchEvent(new MouseEvent('click', { bubbles: true })));
            await p.waitForSelector('dialog.dfa-people .choose-list-item');
            const names = await p.$$eval('dialog.dfa-people .choose-list-item', l => l.map(x => x.textContent));
            assert.equal(names.length, 2); assert.ok(names.some(x => /Jean/.test(x)) && names.some(x => /Paul/.test(x)), names.join(' | '));
            await shot(p, 'clic-personnes', 'dialog.dfa-people');
            await p.click('dialog.dfa-people [data-x]');
            // retirer un critère : la phrase et le nombre suivent
            await p.click('.h-dg-dlg [data-dg-tab="app"]'); await p.waitForSelector('.h-dg-dlg [data-dgo-rules] .h-lr-row');
            await p.click('.h-dg-dlg [data-dgo-rules] .h-lr-row:last-child [data-lr-del]');
            await p.waitForFunction(() => /3 personnes trouvées/.test(document.querySelector('.h-dg-dlg [data-dg-sum]')?.textContent || ''), null, { timeout: 8000 });
        });
        await t('« Tenir à jour » garde les critères ; le diagramme enregistré se relit pareil', async () => {
            const spec = await p.evaluate(async rules => { const O = window.LCNDA_EXT.diagramAppOpts, R = window.LCNDA_EXT.diagramRender; const q = { what: 'persons', by: 'decade', limit: 0, rules, live: true };
                const res = await O.count(q); return O.toSpec({ kind: 'bars', ...R.KINDS.bars.sample() }, res, 'Bûcherons'); }, RULES);
            assert.equal(spec.rows.length, 1); assert.equal(spec.rows[0].s0, 2);
        });
        await t('mode sombre et 390 px : le bloc des critères tient dans l’écran', async () => {
            await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
            await graph('pie'); await p.selectOption('.h-dg-dlg [data-dg-src]', 'q:custom'); await p.selectOption('.h-dg-dlg [data-dgo-addrule]', 'occupation');
            await p.waitForSelector('.h-dg-dlg [data-dgo-rules] .h-lr-row'); await shot(p, 'sombre-criteres', '.h-dg-dlg');
            await closeEditor(p); await p.evaluate(() => document.documentElement.removeAttribute('data-theme'));
            const m = await ctx.newPage(); await m.setViewportSize({ width: 390, height: 844 }); watch(m); await ready(m);
            await m.evaluate(() => window.LCNDA_EXT.openDiagramEditor(null, { kind: 'columns' })); await m.waitForSelector('.h-dg-dlg [data-dg-preview] svg');
            await m.click('.h-dg-dlg [data-dg-tab="app"]'); await m.waitForSelector('.h-dg-dlg [data-dg-src] option[value="q:custom"]', { state: 'attached' });
            await m.selectOption('.h-dg-dlg [data-dg-src]', 'q:custom');
            for (const f of ['occupation', 'children_count', 'age_at']) { await m.selectOption('.h-dg-dlg [data-dgo-addrule]', f); await m.waitForTimeout(150); }
            const w = await m.evaluate(() => ({ doc: document.documentElement.scrollWidth, rows: [...document.querySelectorAll('.h-dg-dlg .h-lr-row')].map(r => Math.round(r.getBoundingClientRect().right)) }));
            assert.ok(w.doc <= 391 && w.rows.length === 3 && w.rows.every(x => x <= 391), JSON.stringify(w));
            if (SHOTS) await m.screenshot({ path: path.join(SHOTS, 'mobile-criteres.png'), fullPage: false });
            for (const k of KINDS) {
                await m.evaluate(k => { document.querySelectorAll('.h-dg-dlg').forEach(d => { d.close(); d.remove(); }); window.LCNDA_EXT.openDiagramEditor(null, { kind: k }); }, k);
                await m.waitForSelector('.h-dg-dlg [data-dg-preview] svg');
                const r = await m.evaluate(() => ({ doc: document.documentElement.scrollWidth, svg: document.querySelector('.h-dg-dlg [data-dg-preview] svg').getBoundingClientRect().right }));
                assert.ok(r.doc <= 391 && r.svg <= 391, `${k} : ${JSON.stringify(r)}`);
            }
            await m.close();
        });
        await t('aucune erreur JavaScript', async () => assert.deepEqual(errors, []));
    } finally {
        if (browser) await browser.close();
        proc.kill();
        fs.rmSync(tmp, { recursive: true, force: true });
    }
    console.log(failed ? `\n${failed} échec(s)` : '\nTout est bon.');
    process.exit(failed ? 1 : 0);
})();
