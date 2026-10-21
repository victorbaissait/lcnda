'use strict';
/**
 * 📊 Diagrammes « de famille » D1 à D8 (assets/js/heritage-diagram-famille.js, lib/diagram_famille.php) :
 *     node tests/test-diagrammes-famille.js        (DFA_PORT=20221 par défaut ; DFA_SHOTS=<dossier> pour les captures)
 * 1. Sans navigateur (bac à sable) : les 8 sortes rangées (icône, nom, aide, tableaux, exemple, « Depuis l'app »), dessinées
 *    avec leur exemple, SVG valide en XML, textes piégés échappés, données énormes dessinées vite ; calculs (survie de
 *    Kaplan-Meier, liens de parenté en mots, ancêtre ou non, mois, directions).
 * 2. Navigateur (Playwright + PHP ; sinon partie sautée) : une petite généalogie (tests/fixtures/diagram-famille-seed.php)
 *    dans un dossier à part ; les données du serveur ; la galerie ; chaque sorte s'ouvre, se dessine, ses réglages changent
 *    le dessin, « Depuis l'app » la remplit ; enregistrée, posée, exportée en SVG et PNG ; un clic ouvre la fiche ou la
 *    liste des personnes ; l'Éditeur de graphiques ; mode sombre ; 390 px ; aucune erreur JavaScript ;
 *    base de 5 000 personnes : chaque donnée en moins de 3 secondes.
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
const KINDS = ['faknown', 'fasurvie', 'fametiers', 'famariages', 'faimplexe', 'famois', 'fanaiss', 'falieux'];
const GROUP = { faknown: 'Frises', fasurvie: 'Chiffres', fametiers: 'Généalogie', famariages: 'Généalogie', faimplexe: 'Généalogie', famois: 'Frises', fanaiss: 'Frises', falieux: 'Frises' };
const EXPECT = { faknown: /a connu son arrière-petit-fils/, fasurvie: /data-dfa-curve="0"/, fametiers: /data-dfa-flow=/, famariages: /le village de l’époux/, faimplexe: /data-dfa-gen="12"/, famois: /data-dfa-month="1-11"/, fanaiss: /écart médian/, falieux: /data-dfa-seg=/ };
// un réglage par sorte, et ce qu'il change dans le dessin
const OPTION = { faknown: ['colorBy', 'sex', /Femme/], fasurvie: ['median', false, null], fametiers: ['colorBy', 'kept', /Même métier que le père/], famariages: ['colorBy', 'distance', /Tout près/], faimplexe: ['theo', false, null], famois: ['layout', 'side', null], fanaiss: ['axis', 'year', null], falieux: ['level', 'country', /France/] };

/* ── 1. Bac à sable ── */
const sandbox = { window: {}, console, setTimeout, clearTimeout, performance, Intl, MutationObserver: class { observe() {} }, document: { documentElement: {}, querySelectorAll: () => [], addEventListener() {} } };
sandbox.window.LCNDA_APP = { state: {} };
vm.createContext(sandbox);
for (const f of ['heritage-diagrams-render.js', 'heritage-diagram-genea.js', 'heritage-diagram-more.js', 'heritage-diagram-famille.js']) vm.runInContext(fs.readFileSync(path.join(appRoot, 'assets/js', f), 'utf8'), sandbox, { filename: f });
const ext = sandbox.window.LCNDA_EXT, R = ext.diagramRender, F = ext.diagramFamille;
const N = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const draw = spec => R.svg(JSON.parse(JSON.stringify(spec)));

step('les 8 sortes : rangées, une icône, un nom, une aide, des tableaux, un exemple, « Depuis l’app »', () => {
    assert.deepEqual([...F.KINDS], KINDS);
    for (const k of KINDS) {
        const K = R.KINDS[k]; assert.ok(K, k);
        assert.ok(K.icon && K.label && K.help && typeof K.render === 'function' && typeof K.sample === 'function' && K.grids.length && K.options.length >= 5, k);
        assert.equal(K.group, GROUP[k], k);
        assert.ok(K.fromApp && typeof K.fromApp.html === 'function' && typeof K.fromApp.bind === 'function', k);
        const svg = draw({ kind: k, ...K.sample() });
        assert.match(svg, /^<svg[^>]+viewBox="0 0 900 \d+/, k); assert.doesNotMatch(svg, /Dessin impossible|NaN|undefined/, k);
        assert.match(svg, EXPECT[k], k);
    }
});
step('SVG valide en XML : chaque attribut a une valeur, balises bien fermées', () => {
    for (const k of KINDS) {
        const svg = draw({ kind: k, ...R.KINDS[k].sample() });
        for (const [, name, attrs] of svg.matchAll(/<([a-zA-Z][\w:-]*)((?:\s+[^\s=>\/]+(?:="[^"]*")?)*)\s*\/?>/g)) {
            const bare = attrs.replace(/\s+[^\s=>\/]+="[^"]*"/g, '').trim();
            assert.equal(bare, '', `${k} : <${name}> a un attribut sans valeur (${bare})`);
        }
        const stack = [];
        for (const [, end, name, self] of svg.matchAll(/<(\/?)([a-zA-Z][\w:-]*)(?:\s[^>]*?)?(\/?)>/g)) { if (self) continue; if (end) assert.equal(stack.pop(), name, `${k} : </${name}> mal placé`); else stack.push(name); }
        assert.equal(stack.length, 0, k + ' : balises non fermées');
    }
});
step('calculs : survie (Kaplan-Meier), parenté en mots, ancêtre ou non, mois, directions', () => {
    const c = F.survivalCurves({ rows: [{ group: 'A', age: 10, dead: '1' }, { group: 'A', age: 20, dead: '0' }, { group: 'A', age: 30, dead: '1' }, { group: 'A', age: 40, dead: '1' }] })[0];
    assert.equal(c.at(15), .75); assert.equal(Math.round(c.at(35) * 1000), 375, 'le vivant de 20 ans sort du compte sans mourir'); assert.equal(c.at(45), 0); assert.equal(c.med, 30);
    assert.equal(F.relWord(3, 'f', true), 'arrière-grand-mère'); assert.equal(F.relWord(2, 'h', false), 'petit-fils'); assert.equal(F.relWord(4, '', false), 'arrière-arrière-petit-enfant');
    const kp = F.knownPeople(R.KINDS.faknown.sample()), by = n => kp.list.find(p => p.name === n);
    assert.equal(kp.isAnc(by('Jeanne ROUX'), by('Lucas MARTIN')), true); assert.equal(kp.isAnc(by('Jeanne ROUX'), by('Emma MARTIN')), true);
    assert.equal(kp.isAnc(by('Henri LEROY'), by('Anne DURAND')), false, 'une autre branche'); assert.equal(kp.isAnc(by('Pierre MARTIN'), by('Tom MARTIN')), true);
    assert.deepEqual(['janvier', 'févr.', 'mars', 'Mai', 'juil', 'juin', 'déc', '12', 'xx'].map((m, i) => F.monthIdx(m, i)), [0, 1, 2, 4, 6, 5, 11, 11, -1]);
    assert.equal(F.bearingOf('NE', 0), 45); assert.equal(F.bearingOf('so', 0), 225); assert.equal(F.bearingOf('90', 0), 90); assert.equal(F.median([5, 1, 3, 2]), 2.5);
});
step('données énormes : dessin rapide (moins d’une seconde) et borné', () => {
    const big = {
        faknown: { rows: N(600, i => ({ name: 'P' + i, gen: String((i % 9) - 4), start: String(1700 + i % 300), end: String(1760 + i % 300), up: 'P' + Math.max(0, i - 9) })) },
        fasurvie: { rows: N(30000, i => ({ group: ['XVIIIe s.', 'XIXe s.', 'XXe s.'][i % 3], age: String((i * 37) % 101), dead: i % 11 ? '1' : '0' })) },
        fametiers: { rows: N(3000, i => ({ g1: 'M' + (i % 30), g2: 'M' + (i * 7 % 30), g3: 'M' + (i * 3 % 30), g4: 'M' + (i * 11 % 30), g5: 'M' + (i % 13), value: String(1 + i % 5) })) },
        famariages: { rows: N(8000, i => ({ a: 'A' + i, b: 'B' + i, km: String((i * 13) % 400), bearing: String(i % 360), year: String(1600 + i % 400) })) },
        faimplexe: { rows: N(25, i => ({ gen: String(i + 1), found: String(Math.min(2 ** i, 50000)), distinct: String(Math.min(2 ** i, 20000)) })) },
        famois: { rows: N(12, i => ({ label: String(i + 1), s0: String(1000 * i), s1: String(900 * i), ids0: N(400, j => j + 1).join(',') })) },
        fanaiss: { rows: N(3000, i => ({ mother: 'M' + (i % 60), mbirth: String(1700 + i % 60), child: 'E' + i, birth: String(1720 + i % 60 + (i % 20)), death: String(1722 + i % 60) })) },
        falieux: { rows: N(2000, i => ({ person: 'P' + (i % 80), place: 'L' + (i % 50), start: String(1800 + (i % 25) * 4), end: String(1804 + (i % 25) * 4) })) },
    };
    const times = [];
    for (const [k, s] of Object.entries(big)) {
        let best = 1e9, svg = '';
        for (let r = 0; r < 2; r++) { const t = performance.now(); svg = draw({ kind: k, ...s }); best = Math.min(best, performance.now() - t); }
        times.push(`${k} ${Math.round(best)} ms`);
        assert.doesNotMatch(svg, /Dessin impossible/, k); assert.ok(svg.length < 6e6, `${k} : ${svg.length} octets`);
        assert.ok(best < 1000, `${k} : ${Math.round(best)} ms`);
    }
    console.log('   ', times.join(' · '));
});
step('données piégées : textes échappés, couleurs refusées, nombres absurdes bornés', () => {
    const trap = '<img src=x onerror=alert(1)>"\'&';
    for (const k of KINDS) {
        const s = { kind: k, o: { title: trap, height: '1e9', pairs: '99', minGap: '-3', maxAge: 'abc', top: '0', maxKm: '-1', rings: trap, scale: trap, layout: trap, axis: trap, level: trap, palette: '__proto__', center: trap, colNames: trap, barH: 'NaN', lanes: '1e9', young: '-5', from: trap, to: '1e12', dotColor: 'red;x:url(y)' },
            series: [{ name: trap, color: 'url(javascript:1)' }, { name: trap }],
            rows: N(30, i => ({ name: trap + i, sex: trap, gen: i % 2 ? '1e9' : String(i % 5 - 2), start: String(1800 + i), end: i % 3 ? trap : String(1850 + i), living: trap, up: trap, pid: trap, link: '-4',
                group: trap, age: i % 4 ? String(i * 3) : trap, dead: trap, id: trap, g1: trap, g2: trap + i % 3, g3: '', g4: trap, value: trap, a: trap, b: trap, pa: trap, pb: trap, km: i % 2 ? '1e9' : String(i), bearing: trap, year: trap,
                theo: trap, found: String(i), distinct: trap, ids: trap + ',1,2', label: i % 2 ? trap : String(i % 12 + 1), s0: trap, s1: '-5', ids0: trap, mother: trap, mbirth: trap, mdeath: trap, marriage: trap, child: trap, birth: String(1800 + i), death: trap,
                person: trap, place: trap, county: trap, country: trap, what: trap, color: 'red;background:url(x)' })),
            cats: [{ value: trap, color: '#fff" onload="x' }], facts: { lent: trap, precise_m: '3' } };
        const svg = draw(s);
        assert.doesNotMatch(svg, /<img|<script|url\(|" onload=|javascript:/i, k);
        assert.doesNotMatch(svg, /Dessin impossible/, k);
    }
});

/* ── 2. Navigateur ── */
let chromium = null;
for (const p of ['playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright']) { try { ({ chromium } = require(p)); break; } catch (_) { chromium = null; } }
const php = spawnSync('php', ['-v'], { encoding: 'utf8' }).status === 0 ? 'php' : null;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-dfa-'));
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
const SHOTS = process.env.DFA_SHOTS || '';
const PORT = Number(process.env.DFA_PORT) || 20221;
const freePort = () => new Promise(res => { const s = require('node:net').createServer(); s.listen(0, '127.0.0.1', () => { const q = s.address().port; s.close(() => res(q)); }); });
const seed = (dir, extra = []) => {
    fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    const init = spawnSync(php, ['-r', 'require "lib/paths.php"; (new PDO("sqlite:".DATA_DIR."/genealogy.sqlite"))->exec(file_get_contents(APP_ROOT."/data/schema.sql")); require "lib/bootstrap.php"; db();'], { cwd: appRoot, encoding: 'utf8', env: envFor(dir) });
    if (init.status !== 0) throw new Error(init.stderr || init.stdout);
    const r = spawnSync(php, [path.join(appRoot, 'tests/fixtures/diagram-famille-seed.php'), ...extra], { cwd: appRoot, encoding: 'utf8', env: envFor(dir) });
    if (r.status !== 0 || !/^ok famille/m.test(r.stdout)) throw new Error(r.stderr || r.stdout);
};
const serve = async (dir, port) => {
    const proc = spawn(php, ['-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(dir), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    return { proc, base };
};

(async () => {
    for (const [name, fn] of steps) { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } }
    if (!chromium || !php) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); process.exit(failed ? 1 : 0); }
    const dir = path.join(tmp, 'a'); seed(dir);
    const { proc, base } = await serve(dir, PORT);
    const browser = await chromium.launch(exe ? { executablePath: exe } : {});
    const errors = [];
    const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
    const watch = p => { p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); }); p.on('dialog', d => { errors.push('dialogue : ' + d.message()); d.dismiss(); }); };
    const ready = async p => { await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.bootstrap && window.LCNDA_EXT?.openDiagramEditor && window.LCNDA_EXT?.diagramFamille, null, { timeout: 20000 }); await p.waitForTimeout(400); };
    const closeEditor = p => p.evaluate(() => document.querySelectorAll('.h-dg-dlg, dialog.dfa-people').forEach(d => { if (d.open) d.close(); d.remove(); }));
    const openKind = async (p, k) => { await closeEditor(p); await p.evaluate(k => { window.__ed = window.LCNDA_EXT.openDiagramEditor(null, { kind: k }); }, k); await p.waitForSelector('.h-dg-dlg [data-dg-preview] svg'); };
    const preview = p => p.$eval('.h-dg-dlg [data-dg-preview] svg', s => s.outerHTML);
    const shot = async (p, name, sel = '.h-dg-dlg [data-dg-preview]') => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); const el = await p.$(sel); await (el || p).screenshot({ path: path.join(SHOTS, name + '.png') }); };
    let big = null;
    try {
        const ctx = await browser.newContext({ viewport: { width: 1360, height: 950 }, acceptDownloads: true });
        const p = await ctx.newPage(); watch(p); await ready(p);
        const api = q => p.evaluate(q => window.LCNDA_APP.api('diagram_famille', q), q);
        const root = await p.evaluate(() => Number(window.LCNDA_APP.state.bootstrap.startPersonId));
        await t('serveur : les huit données de diagram_famille, bornées ; demande inconnue refusée', async () => {
            const ov = await api({ what: 'overlap', up: 3, down: 2 }); assert.ok(ov.people.length > 10); assert.ok(ov.people.some(x => x.gen === -2) && ov.people.some(x => x.gen === 1 && x.living), 'ancêtres et enfants vivants');
            assert.ok(ov.people.filter(x => x.gen < 0).every(x => x.link > 0), 'chaque ancêtre relié vers la personne de départ');
            const sv = await api({ what: 'survival', by: 'branch' }); assert.ok(sv.rows.some(x => x.group === 'Branche paternelle') && sv.rows.some(x => x.group === 'Branche maternelle'));
            const sc = await api({ what: 'survival' }); assert.ok(sc.rows.some(x => x.dead === 0), 'les vivants comptent'); assert.ok(sc.rows.some(x => /^XIXe/.test(x.group)));
            const oc = await api({ what: 'occflow', gens: 4 }); assert.ok(oc.rows.length > 2 && oc.rows.some(r => r.g1 === 'Charpentier' || r.g2 === 'Charpentier' || r.g3 === 'Charpentier' || r.g4 === 'Charpentier'), 'le métier de l’événement « Profession »');
            const ra = await api({ what: 'radius' }); assert.ok(ra.rows.length > 3 && ra.rows.every(x => x.km >= 0 && x.bearing >= 0 && x.bearing < 360)); assert.ok(ra.rows.some(x => x.km > 100), 'Caen ↔ Angers');
            const im = await api({ what: 'implexe', gens: 8 }); const g7 = im.rows.find(x => x.gen === 7); assert.ok(g7 && g7.distinct < g7.found && g7.ids.split(',').length >= 2, 'implexe à la génération 7');
            const mo = await api({ what: 'months' }); assert.equal(mo.rows.length, 12); assert.ok(mo.stats.lent >= 1 && mo.stats.advent >= 1, JSON.stringify(mo.stats));
            const sp = await api({ what: 'spacing', mode: 'anc', root }); assert.ok(sp.rows.length > 3 && sp.rows.every(x => x.mid > 0 && x.cid > 0));
            const pl = await api({ what: 'places', gens: 2, root }); assert.ok(pl.rows.some(x => x.place === 'Brest') && pl.rows.some(x => /recensement/.test(x.what)));
            const bad = await p.evaluate(() => window.LCNDA_APP.api('diagram_famille', { what: 'rien' }).then(() => 'ok', e => e.message)); assert.match(bad, /inconnu/);
            const arr = await p.evaluate(() => fetch('api.php?action=diagram_famille&what=places&ids[]=1&gens[]=5').then(r => r.status)); assert.equal(arr, 200);
        });
        await t('« Nouveau diagramme » : les 8 sortes rangées dans leur groupe, l’aide au survol', async () => {
            const pr = p.evaluate(() => window.LCNDA_EXT.diagramsInternals.chooseType());
            await p.waitForSelector('.h-dg-gallery .h-dg-tile');
            const groups = await p.$$eval('.h-dg-gallery h4', hs => Object.fromEntries(hs.map(h => [h.textContent, [...h.nextElementSibling.querySelectorAll('.h-dg-tile')].map(x => [x.textContent.trim(), x.getAttribute('title') || ''])])));
            for (const k of KINDS) { const { label, help } = await p.evaluate(k => window.LCNDA_EXT.diagramRender.KINDS[k], k); const tile = groups[GROUP[k]]?.find(([x]) => x.includes(label)); assert.ok(tile, `${k} dans ${GROUP[k]}`); assert.equal(tile[1], help, k + ' : aide'); }
            await shot(p, 'galerie', '.h-dg-gallery');
            await p.click('.h-dg-gallery [data-close]'); assert.equal(await pr, null);
        });
        await t('chaque sorte s’ouvre dans l’éditeur, se dessine avec son exemple, un réglage change le dessin', async () => {
            for (const k of KINDS) {
                await openKind(p, k);
                const svg = await preview(p); assert.match(svg, EXPECT[k], k);
                await shot(p, 'exemple-' + k);
                await p.click('.h-dg-dlg [data-dg-tab="opts"]'); await p.waitForSelector(`.h-dg-dlg [data-opt="${OPTION[k][0]}"]`);
                const [opt, v, re] = OPTION[k];
                if (typeof v === 'boolean') await p.setChecked(`.h-dg-dlg [data-opt="${opt}"]`, v); else await p.selectOption(`.h-dg-dlg [data-opt="${opt}"]`, v);
                await p.waitForFunction(old => document.querySelector('.h-dg-dlg [data-dg-preview] svg')?.outerHTML !== old, svg, { timeout: 5000 });
                if (re) assert.match(await preview(p), re, k + ' : ' + opt);
                // les curseurs (C3) : au moins un change le dessin
                let moved = false;
                for (const rng of await p.$$('.h-dg-dlg input[type=range][data-opt]')) { const before = await preview(p); await rng.evaluate(r => { r.value = String(Number(r.min) + (Number(r.max) - Number(r.min)) * .8); r.dispatchEvent(new Event('input', { bubbles: true })); }); await p.waitForTimeout(450); if (await preview(p) !== before) { moved = true; break; } }
                assert.ok(moved, k + ' : curseur');
            }
        });
        const fromApp = async (k, before) => {
            await openKind(p, k); await p.click('.h-dg-dlg [data-dg-tab="app"]'); await p.waitForSelector('.h-dg-dlg [data-dfa-go]');
            if (before) await before();
            await p.click('.h-dg-dlg [data-dfa-go]');
            await p.waitForFunction(() => document.querySelector('.h-dg-dlg [data-dg-tab="data"]')?.classList.contains('is-active') || /⚠️/.test(document.querySelector('.h-dg-dlg [data-dfa-msg]')?.textContent || ''), null, { timeout: 15000 });
            const msg = await p.$eval('.h-dg-dlg [data-dfa-msg]', e => e.textContent).catch(() => '');
            assert.doesNotMatch(msg, /⚠️/, `${k} : ${msg}`);
            await p.waitForTimeout(300);
            return p.evaluate(() => document.querySelectorAll('.h-dg-dlg [data-grid="0"] tbody tr').length);
        };
        const sel = (k, v) => () => p.selectOption(`.h-dg-dlg [data-dfa="${k}"]`, v);
        const APP = {
            faknown: [null, async () => { const s = await preview(p); assert.ok((s.match(/data-dfa-pid=/g) || []).length > 8); assert.match(s, /a connu son arrière-petit-(fils|fille)/); }],
            fasurvie: [sel('by', 'sex'), async () => assert.match(await preview(p), /Hommes[^<]*personnes/)],
            fametiers: [sel('gens', '3'), async () => assert.match(await preview(p), /Charpentier|Laboureur/)],
            famariages: [null, async () => assert.ok((await p.$$('.h-dg-dlg [data-dg-preview] [data-dfa-pids]')).length > 3)],
            faimplexe: [sel('gens', '8'), async () => { const s = await preview(p); assert.match(s, /Gén\. 7/); assert.match(s, /data-dfa-pids="\d+,\d+/); }],
            famois: [null, async () => assert.match(await preview(p), /pendant le Carême/)],
            fanaiss: [sel('mode', 'anc'), async () => assert.ok((await p.$$('.h-dg-dlg [data-dg-preview] circle[data-dfa-pid], .h-dg-dlg [data-dg-preview] g[data-dfa-pid]')).length > 3)],
            falieux: [null, async () => assert.match(await preview(p), /Brest/)],
        };
        for (const k of KINDS) {
            await t(`« Depuis l’app » : ${k}`, async () => {
                const n = await fromApp(k, APP[k][0]); assert.ok(n > 0, `${k} : ${n} lignes`);
                const s = await preview(p); assert.doesNotMatch(s, /<img|Dessin impossible/); assert.equal(await p.evaluate(() => window.__xss), undefined);
                await APP[k][1](); await shot(p, 'base-' + k);
            });
        }
        await t('un clic dans l’éditeur : un conseil, pas de changement d’écran ; la liste des personnes s’ouvre', async () => {
            await fromApp('faimplexe', sel('gens', '8'));
            await p.$eval('.h-dg-dlg [data-dg-preview] [data-dfa-pids]', e => e.dispatchEvent(new MouseEvent('click', { bubbles: true })));
            await p.waitForSelector('dialog.dfa-people .choose-list-item');
            assert.ok((await p.$$('dialog.dfa-people .choose-list-item')).length >= 2);
            await p.click('dialog.dfa-people [data-x]');
        });
        const saved = {};
        await t('enregistrées, posées dans une case ; un clic ouvre la fiche ou la liste des personnes', async () => {
            await closeEditor(p);
            for (const k of KINDS) saved[k] = await p.evaluate(async k => { const R = window.LCNDA_EXT.diagramRender, s = { kind: k, ...R.KINDS[k].sample() }; const { kind, ...spec } = s; const r = await window.LCNDA_APP.api('save_diagram', {}, { method: 'POST', body: { name: 'Test ' + k, kind, spec } }); return Number(r.result?.id || r.id); }, k);
            assert.ok(Object.values(saved).every(x => x > 0));
            await p.evaluate(ids => { const box = document.createElement('div'); box.id = 'dfa-test'; box.style.width = '760px'; box.innerHTML = Object.values(ids).map(id => window.LCNDA_EXT.diagramEmbedHtml(id)).join(''); document.body.prepend(box); }, saved);
            await p.waitForFunction(n => document.querySelectorAll('#dfa-test .h-dg-svg svg').length === n, KINDS.length, { timeout: 20000 });
            // une barre reliée à une fiche
            const ov = await api({ what: 'overlap', up: 2, down: 1 }); const pid = ov.people.find(x => x.gen === -1).id;
            await p.evaluate(pid => { const R = window.LCNDA_EXT.diagramRender; const d = document.createElement('div'); d.id = 'dfa-one'; d.innerHTML = R.svg({ kind: 'faknown', rows: [{ name: 'Moi', gen: '0', start: '1990', living: '1' }, { name: 'Père', gen: '-1', start: '1960', end: '2010', pid }] }, 600); document.body.prepend(d); }, pid);
            await p.$eval('#dfa-one [data-dfa-pid] rect', e => e.dispatchEvent(new MouseEvent('click', { bubbles: true })));
            await p.waitForFunction(pid => window.LCNDA_APP.state.currentPersonId === pid && window.LCNDA_APP.state.module === 'personnes', pid, { timeout: 8000 });
            // une case reliée à plusieurs personnes : la liste, puis la fiche
            const ids = ov.people.slice(0, 3).map(x => x.id);
            await p.evaluate(ids => { const R = window.LCNDA_EXT.diagramRender; const d = document.createElement('div'); d.id = 'dfa-two'; d.innerHTML = R.svg({ kind: 'faimplexe', rows: [{ gen: '1', found: '1', distinct: '1', ids: ids.join(',') }] }, 600); document.body.prepend(d); }, ids);
            await p.$eval('#dfa-two [data-dfa-pids]', e => e.dispatchEvent(new MouseEvent('click', { bubbles: true })));
            await p.waitForSelector('dialog.dfa-people .choose-list-item');
            assert.equal((await p.$$('dialog.dfa-people .choose-list-item')).length, 3);
            assert.equal(await p.evaluate(() => window.__xss), undefined, 'aucun nom piégé exécuté');
            await shot(p, 'liste-personnes', 'dialog.dfa-people');
            await p.click(`dialog.dfa-people [data-dfa-open="${ids[1]}"]`);
            await p.waitForFunction(id => window.LCNDA_APP.state.currentPersonId === id && !document.querySelector('dialog.dfa-people'), ids[1], { timeout: 8000 });
            await p.evaluate(() => ['dfa-test', 'dfa-one', 'dfa-two'].forEach(i => document.getElementById(i)?.remove()));
        });
        await t('exports : SVG et PNG non vides pour les 8 sortes (fenêtre commune)', async () => {
            for (const k of KINDS) for (const fmt of ['svg', 'png']) {
                await p.evaluate(i => window.LCNDA_EXT.openDiagram(i), saved[k]); await p.waitForSelector('[data-dg-pexpdlg]');
                await p.click('[data-dg-pexpdlg]'); await p.click(`.ui-export-fmt[data-fmt="${fmt}"]`);
                const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 10000 }), p.click('[data-ui-go]')]);
                assert.ok(dl.suggestedFilename().endsWith('.' + fmt), dl.suggestedFilename());
                const body = fs.readFileSync(await dl.path()); assert.ok(body.length > 2000, `${k} ${fmt} : ${body.length} octets`);
                if (fmt === 'svg') assert.match(body.toString(), /^<svg[^>]+aria-label/);
                else assert.equal(body.slice(1, 4).toString(), 'PNG');
                await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
            }
        });
        await t('Éditeur de graphiques : courbe de survie et mois des conceptions avec une liste de personnes', async () => {
            const r = await p.evaluate(() => {
                const E = window.LCNDA_EXT, styles = E.diagramStatStyles().flatMap(([, l]) => l.map(([v]) => v));
                const people = [{ name: 'A', birth: '1801-03-04', death: '1860', gender: 'male' }, { name: 'B', birth: '12/05/1830', death: '1831', gender: 'female' }, { name: 'C', birth: '1950-07-01', death: '', gender: 'female' }];
                const cell = (row, k) => row[k] || '';
                const s = E.diagramStatSpec({ style: 'dg:fasurvie' }, { shown: people }, [], cell), m = E.diagramStatSpec({ style: 'dg:famois' }, { shown: people }, [], cell), none = E.diagramStatSpec({ style: 'dg:fasurvie' }, {}, [['x', 1]], cell);
                return { styles, s: s.rows, m: m.rows.map(x => x.s0), html: E.diagramStatHtml({ style: 'dg:fasurvie' }, { shown: people }, [], cell).slice(0, 4), none: !!none.html };
            });
            assert.ok(r.styles.includes('dg:fasurvie') && r.styles.includes('dg:famois'));
            assert.deepEqual(r.s.map(x => [x.group, x.age]), [['XIXe s.', '59'], ['XIXe s.', '1']]);
            assert.equal(r.m[5], '1', 'née en mars → conçue en juin'); assert.equal(r.m[7], '1', 'né en mai → conçu en août');
            assert.equal(r.html, '<svg'); assert.ok(r.none, 'sans liste de personnes : un message');
        });
        await t('mode sombre : les dessins restent sur fond clair', async () => {
            await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
            for (const k of ['faknown', 'famariages']) { await openKind(p, k); assert.equal(await p.$eval('.h-dg-dlg [data-dg-preview] svg > rect', r => r.getAttribute('fill')), '#ffffff'); }
            await p.click('.h-dg-dlg [data-dg-tab="app"]'); await shot(p, 'sombre-famariages', '.h-dg-dlg');
            await closeEditor(p); await p.evaluate(() => document.documentElement.removeAttribute('data-theme'));
        });
        await t('390 px de large : l’éditeur ne déborde pas', async () => {
            const m = await ctx.newPage(); await m.setViewportSize({ width: 390, height: 844 }); watch(m); await ready(m);
            for (const k of KINDS) {
                await m.evaluate(k => { document.querySelectorAll('.h-dg-dlg').forEach(d => { d.close(); d.remove(); }); window.LCNDA_EXT.openDiagramEditor(null, { kind: k }); }, k);
                await m.waitForSelector('.h-dg-dlg [data-dg-preview] svg');
                const w = await m.evaluate(() => ({ doc: document.documentElement.scrollWidth, svg: document.querySelector('.h-dg-dlg [data-dg-preview] svg').getBoundingClientRect().right }));
                assert.ok(w.doc <= 391 && w.svg <= 391, `${k} : ${JSON.stringify(w)}`);
                if (k === 'faknown') { await m.click('.h-dg-dlg [data-dg-tab="app"]'); await m.waitForSelector('.h-dg-dlg [data-dfa-go]'); assert.ok(await m.evaluate(() => document.documentElement.scrollWidth <= 391)); if (SHOTS) await m.screenshot({ path: path.join(SHOTS, 'mobile-faknown.png') }); }
            }
            await m.close();
        });
        await t('aucune erreur JavaScript', async () => assert.deepEqual(errors, []));
        // une base de 5 000 personnes : les données restent rapides
        await t('base de 5 000 personnes : chaque donnée en moins de 3 secondes', async () => {
            const dir2 = path.join(tmp, 'big'); seed(dir2, ['big']);
            big = await serve(dir2, await freePort());
            const times = [];
            for (const q of ['overlap&up=6&down=4', 'survival', 'survival&by=branch', 'occflow&gens=5&chain=parent', 'radius', 'implexe&gens=20', 'months', 'spacing&top=40', 'places&gens=6']) {
                const t0 = Date.now(); const r = await fetch(`${big.base}api.php?action=diagram_famille&what=${q}`); const j = await r.json(); const ms = Date.now() - t0;
                assert.equal(r.status, 200, q); assert.ok(!j.error, q + ' : ' + j.error); times.push(`${q.split('&')[0]} ${ms} ms`); assert.ok(ms < 3000, `${q} : ${ms} ms`);
            }
            const n = await fetch(`${big.base}api.php?action=diagram_famille&what=survival`).then(r => r.json()); assert.ok(n.rows.length > 3000, `${n.rows.length} personnes`);
            console.log('   ', times.join(' · '));
        });
    } finally { await browser.close(); proc.kill(); big?.proc.kill(); fs.rmSync(tmp, { recursive: true, force: true }); }
    process.exit(failed ? 1 : 0);
})();
