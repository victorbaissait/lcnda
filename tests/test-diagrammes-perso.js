'use strict';
/**
 * 📊 Diagrammes → « ⚙️ Personnaliser » (assets/js/heritage-diagram-perso.js) : annotations, styles enregistrés,
 * petits multiples, lecture dans le temps, lignes de repère (+ deuxième axe, échelle log).
 *     node tests/test-diagrammes-perso.js        (DGP_SHOTS=<dossier> pour les captures)
 * 1. Sans navigateur : annotations gardées et dans le SVG (textes échappés) ; moyenne et médiane calculées justes, à la
 *    bonne hauteur ; style appliqué à tous (style par défaut) ; petits multiples à la même échelle ; curseur du temps
 *    (catégories-années, frises) ; log et deuxième axe ; chaque sorte de diagramme reste sans erreur avec tout coché.
 * 2. Navigateur : l'onglet dans l'éditeur, annotations glissées puis retirées (↶ Annuler), enregistrées et exportées en
 *    SVG ; « Appliquer à tous » (↶ Annuler) ; « Répéter par sexe » recompte ; ▶ lecture, « Réduire les animations » ;
 *    page Graphiques ; clair / sombre ; 390 px ; aucune erreur.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {spawn, spawnSync} = require('node:child_process');

const appRoot = path.resolve(__dirname, '..');
let failed = 0, n = 0;
const t = async (name, fn) => { try { await fn(); n++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

/* ── 1. Bac à sable ── */
const sb = {window: {}, console, setTimeout, clearTimeout, performance, Intl, MutationObserver: class { observe() {} }, CSS: {escape: s => s}, fetch: () => new Promise(() => {}), document: {documentElement: {}, querySelectorAll: () => [], addEventListener() {}, createElement: () => ({})}};
sb.window.LCNDA_APP = {state: {bootstrap: {startPersonId: 1}}};
vm.createContext(sb);
const KIND_FILES = ['heritage-diagrams-render.js', 'heritage-diagram-genea.js', 'heritage-diagram-chiffres.js', 'heritage-diagram-cartes.js', 'heritage-diagram-more.js', 'heritage-diagram-famille.js', 'heritage-diagram-vie.js', 'heritage-diagram-adn-chiffres.js', 'heritage-diagram-cartes2.js', 'heritage-diagram-nouveaux.js', 'heritage-diagram-plus.js'];
for (const f of [...KIND_FILES, 'heritage-diagram-perso.js']) { const p = path.join(appRoot, 'assets/js', f); if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), sb, {filename: f}); }
const ext = sb.window.LCNDA_EXT, R = ext.diagramRender, P = ext.diagramPerso;
const J = v => JSON.parse(JSON.stringify(v)); // les objets du bac à sable viennent d'un autre « monde »
const sample = k => ({kind: k, ...J(R.KINDS[k].sample ? R.KINDS[k].sample() : {})});
const TRAP = '<img src=x onerror="window.__xss=1">\'"&';
const BAD = /Dessin impossible|NaN|Infinity|undefined/;

const sandbox = async () => {
    await t('branché sur le dessin commun (prepare, overlay, styleCss)', () => {
        assert.equal(typeof R.prepare, 'function'); assert.equal(typeof R.overlay, 'function'); assert.equal(typeof R.styleCss, 'function');
        assert.equal(P.READY.length, 5); assert.deepEqual(J(P.READY.map(s => s.name)), ['Sobre', 'Archive', 'Couleurs vives', 'Noir et blanc imprimable', 'Daltonien']);
    });
    await t('annotations : gardées dans spec.o.notes et dessinées dans le SVG (textes échappés, couleurs vérifiées)', () => {
        const s = sample('columns');
        s.o.notes = [{t: 'arrow', x1: .2, y1: .2, x2: .4, y2: .5, text: 'Ici'}, {t: 'text', x: .5, y: .3, text: TRAP, color: 'javascript:alert(1)'}, {t: 'rect', x1: .1, y1: .2, x2: .3, y2: .4, text: 'Zone'},
            {t: 'vband', x1: .5, x2: .6, text: 'Bande'}, {t: 'hband', y1: .3, y2: .4}, {t: 'date', date: '1720', text: 'Épidémie'}, {t: 'date', date: '1730', to: '1740', text: 'Guerre'}, null, 'x', {t: 'bizarre', x: 'NaN'}];
        const svg = R.svg(s);
        assert.equal((svg.match(/class="dg-note"/g) || []).length, 8);
        for (const w of ['Ici', 'Zone', 'Bande', 'Épidémie', 'Guerre']) assert.ok(svg.includes(w), w);
        assert.doesNotMatch(svg, /<img|onerror="|javascript:/); assert.match(svg, /&lt;img src=x/);
        assert.doesNotMatch(svg, BAD);
        // le repère de date est posé sur l'axe des années : 1720 tombe sur la colonne « 1720 »
        const ax = R.KINDS.columns.render(s, 900 - 32, 12);
        const x1720 = P.xOfYear(ax.time, 1720) + 16, line = svg.match(/data-dgn="5"[^>]*><line x1="([\d.]+)"/);
        assert.ok(line && Math.abs(Number(line[1]) - x1720) < 1, `repère à ${line?.[1]}, attendu ${x1720}`);
        // une fois enregistré et relu (JSON), le dessin est le même
        assert.equal(R.svg(JSON.parse(JSON.stringify(s))).replace(/dgs\d+/g, ''), svg.replace(/dgs\d+/g, ''));
    });
    await t('lignes de repère : moyenne et médiane calculées justes, à la bonne hauteur ; objectif et valeur libre', () => {
        const s = sample('columns'); // Baptêmes 32 28 35 38 30 41 ; Sépultures 25 41 22 27 36 24
        const ax = R.KINDS.columns.render(s, 868, 12).axis;
        assert.equal(P.refValue({t: 'mean', series: '0'}, ax), 34);
        assert.equal(P.refValue({t: 'median', series: '0'}, ax), 33.5);
        assert.equal(P.refValue({t: 'mean', series: '1'}, ax), 29.166666666666668);
        assert.equal(P.refValue({t: 'median'}, ax), 31); // toutes les séries : 12 valeurs, médiane 31
        assert.equal(P.refValue({t: 'goal', v: '40,5'}, ax), 40.5);
        s.o.refs = [{t: 'mean', series: '0'}, {t: 'median', series: '0', label: 'Milieu'}, {t: 'goal', v: 45, label: 'Objectif'}, {t: 'value', v: 9999}];
        const svg = R.svg(s);
        assert.match(svg, /Moyenne : 34</); assert.match(svg, /Milieu : 33,5</); assert.match(svg, /Objectif : 45</);
        assert.equal((svg.match(/class="dg-ref"/g) || []).length, 3, 'la valeur hors de l’axe n’est pas dessinée');
        const y = Number(svg.match(/data-dgr="0"><line x1="[\d.]+" y1="([\d.]+)"/)[1]), top = svg.match(/<g transform="translate\(16 ([\d.]+)\)">/);
        const expect = Number(top[1]) + ax.y0 + ax.h - (34 - ax.lo) / (ax.hi - ax.lo) * ax.h;
        assert.ok(Math.abs(y - expect) < .02, `moyenne à ${y}, attendu ${expect}`);
        // barres horizontales : la ligne est verticale
        const b = sample('bars'); b.o.refs = [{t: 'mean'}]; const sb2 = R.svg(b), m = sb2.match(/data-dgr="0"><line x1="([\d.]+)" y1="[\d.]+" x2="([\d.]+)"/); assert.ok(m && m[1] === m[2]);
    });
    await t('échelle logarithmique et deuxième axe', () => {
        const s = {kind: 'line', series: [{name: 'Petits'}, {name: 'Grands'}], rows: [['1800', 1, 2000], ['1850', 10, 3000], ['1900', 100, 2500], ['1950', 10000, 40000]].map(([label, s0, s1]) => ({label, s0, s1})), o: {log: true}};
        const svg = R.svg(s); assert.doesNotMatch(svg, BAD); for (const v of ['>10<', '>100<', '>1 000<', '>10 000<']) assert.ok(svg.replace(/ /g, ' ').includes(v), v);
        const ax = R.KINDS.line.render(s, 868, 12).axis; assert.equal(ax.log, true); assert.equal(ax.lo, 1); assert.equal(ax.hi, 100000);
        s.o = {y2: '1'}; const two = R.svg(s); assert.match(two, /Grands \(axe de droite\)/); assert.match(two, /stroke-dasharray="6 3"/); assert.doesNotMatch(two, BAD);
        const ax2 = R.KINDS.line.render(s, 868, 12).axis; assert.ok(ax2.hi < 20000, 'l’axe de gauche ne prend plus les grands chiffres : ' + ax2.hi);
        assert.equal(P.refValue({t: 'mean'}, ax2), (1 + 10 + 100 + 10000) / 4, '« toutes les séries » : sans celle de droite');
    });
    await t('styles : appliqué à un diagramme, puis à tous (style par défaut), « Comme avant » ne bouge pas', () => {
        const nb = P.READY.find(s => s.id === 'nb'), arc = P.READY.find(s => s.id === 'archive');
        const a = P.applyStyle(sample('columns'), arc); assert.equal(a.o.style, 'archive'); assert.equal(a.o.bgColor, '#f5ecd8');
        const sa = R.svg(a); assert.match(sa, /font-family="'Georgia', /); assert.match(sa, /fill="#f5ecd8"/); assert.match(sa, /#6f4e37/);
        P.setDefault(nb);
        try {
            for (const k of ['columns', 'pie', 'parliament', 'treemap', 'line']) { const s = sample(k); delete s.o.palette; const svg = R.svg(s); assert.match(svg, /#000000|#5a5a5a/, k); assert.match(svg, /<style>[^<]*stroke-opacity:\.38/, k + ' : quadrillage marqué'); }
            const keep = P.applyStyle(sample('columns'), null); assert.equal(keep.o.style, 'none'); const sk = R.svg(keep); assert.doesNotMatch(sk, /<style>/); assert.match(sk, /#4e79a7/);
            const own = P.applyStyle(sample('columns'), arc); assert.match(R.svg(own), /#6f4e37/, 'un style à soi passe devant le style par défaut');
        } finally { P.setDefault(null); }
        assert.doesNotMatch(R.svg(sample('columns')), /<style>/);
        // le <style> du dessin reste limité à ce dessin (classe propre)
        const css = R.svg({...sample('columns'), o: {radius: 6, grid: 'none'}}), cls = css.match(/<svg [^>]*class="(dgs\d+)"/)[1];
        assert.ok(css.match(/<style>([^<]*)<\/style>/)[1].split('}').filter(Boolean).every(r => r.startsWith('.' + cls + ' ')));
        assert.deepEqual(J(P.cleanStyle({colors: ['url(x)', '#123456', '"/><x'], font: 'Ar"ial<script>', bg: 'x', lineW: 1e9, radius: -5, grid: 'zzz'})), {colors: ['#123456'], font: 'Arialscript', lineW: 12, radius: 0});
    });
    await t('petits multiples : un dessin par série, côte à côte, même échelle', () => {
        const s = {kind: 'columns', series: [{name: 'Hommes'}, {name: 'Femmes'}, {name: 'Inconnu'}], rows: [['XVIIe', 3, 40, 1], ['XVIIIe', 12, 25, 2], ['XIXe', 30, 9, 0]].map(([label, s0, s1, s2]) => ({label, s0, s1, s2})), o: {title: 'Naissances', facet: 'series', refs: [{t: 'mean'}]}};
        const svg = R.svg(s); assert.doesNotMatch(svg, BAD);
        const panels = svg.split('class="dgp-facet"').slice(1); assert.equal(panels.length, 3);
        const tops = panels.map(p => Math.max(...[...p.matchAll(/text-anchor="end"[^>]*>(\d+)</g)].map(m => Number(m[1]))));
        assert.ok(tops.every(v => v === tops[0]) && tops[0] >= 40, 'même échelle partout : ' + tops);
        for (const w of ['Hommes', 'Femmes', 'Inconnu']) assert.ok(svg.includes(`>${w}</text>`), w);
        assert.equal((svg.match(/class="dg-ref"/g) || []).length, 3, 'une moyenne par petit dessin');
        for (const k of ['bars', 'line', 'area', 'stacked', 'radar']) { const x = R.svg({...s, kind: k}, 390); assert.doesNotMatch(x, BAD, k); assert.equal(x.split('class="dgp-facet"').length - 1, 3, k); }
        assert.equal(P.canFacet('pie'), false); assert.equal(P.canFacet('parliament'), false);
        assert.doesNotMatch(R.svg({...s, kind: 'columns', series: [{name: 'Seule'}]}), /dgp-facet/, 'une seule série : un seul dessin');
    });
    await t('lecture dans le temps : catégories-années (échelle fixe), frises (fin arrêtée à l’année lue), rien sans dates', () => {
        const c = sample('columns'), T = P.timeInfo(c);
        assert.deepEqual(J(T.years), [1700, 1710, 1720, 1730, 1740, 1750]);
        const f = T.at(1720); assert.equal(f.rows.filter(r => r.__off).length, 3); assert.equal(f.o.__year, 1720); assert.equal(f.o.__lo, 0); assert.equal(f.o.__hi, 41);
        const s20 = R.svg(f), s50 = R.svg(T.at(1750)); assert.doesNotMatch(s20, BAD);
        assert.equal((s20.match(/<rect x=/g) || []).length + 6, (s50.match(/<rect x=/g) || []).length, 'trois catégories de moins, deux séries');
        const ticks = s => [...s.replace(/<text class="dgp-year"[^>]*>\d+<\/text>/, '').matchAll(/text-anchor="end"[^>]*>(\d+)</g)].map(m => m[1]).join(','); assert.equal(ticks(s20), ticks(s50), 'l’axe ne bouge pas');
        assert.match(s20, /class="dgp-year"[^>]*>1720</);
        const tl = sample('timeline'), T2 = P.timeInfo(tl); assert.ok(T2 && T2.from === 1978);
        const at = T2.at(1985); assert.ok(at.rows.every(r => Number(String(r.start).slice(0, 4)) <= 1985)); assert.ok(at.rows.every(r => !r.end || Number(r.end) <= 1985)); assert.equal(at.o.from, '1978');
        assert.ok(at.events.every(e => Number(e.date) <= 1985));
        assert.doesNotMatch(R.svg(at), BAD);
        const ch = P.timeInfo(sample('chrono')); assert.ok(ch); const a1 = R.svg(ch.at(1840)); assert.doesNotMatch(a1, BAD); assert.ok(!a1.includes('Guerre') && a1.includes('Départ pour Nantes'));
        for (const k of ['pie', 'parliament', 'wordcloud', 'sankey', 'venn']) assert.equal(P.timeInfo(sample(k)), null, k);
        if (R.KINDS.alivepyr) assert.equal(P.timeInfo(sample('alivepyr')), null, 'la pyramide « qui vivait » garde sa lecture à elle');
    });
    await t('chaque sorte de diagramme reste sans erreur avec tout coché (900 et 390 px)', () => {
        const all = Object.keys(R.KINDS); assert.ok(all.length >= 95, all.length);
        const o = {notes: [{t: 'arrow'}, {t: 'text', text: TRAP}, {t: 'rect'}, {t: 'vband'}, {t: 'hband'}, {t: 'date', date: '1900', to: '1910', text: 'Guerre'}], refs: [{t: 'mean'}, {t: 'median'}, {t: 'goal', v: 10}],
            colors: ['#0072B2', '#E69F00', '#009E73'], font: 'Georgia', radius: 4, lineW: 3, grid: 'strong', facet: 'series', log: true, y2: '1', time: {show: true}};
        for (const k of all) {
            const s0 = sample(k); if (/Dessin impossible/.test(R.svg(s0, 900))) continue; // une sorte qui attend son fond de carte (pas de réseau ici) : vue par ses propres tests
            for (const W of [900, 390]) {
                const s = {...s0, o: {...(s0.o || {}), ...J(o)}}, svg = R.svg(s, W);
                assert.doesNotMatch(svg, /Dessin impossible|NaN|Infinity/, `${k} ${W}`); assert.doesNotMatch(svg, /<img|onerror="/, k);
                const T = P.timeInfo(s0); if (T) { const f = R.svg(T.at(T.years[Math.floor(T.years.length / 2)]), W); assert.doesNotMatch(f, /Dessin impossible|NaN|Infinity/, `${k} temps`); }
            }
        }
    });
};

/* ── 2. Serveur et navigateur ── */
const php = spawnSync('php', ['-v'], {encoding: 'utf8'}).status === 0 ? 'php' : null;
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
const SHOTS = process.env.DGP_SHOTS || '';
const envFor = d => ({...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1'});
const freePort = () => new Promise(res => { const s = require('node:net').createServer(); s.listen(0, '127.0.0.1', () => { const q = s.address().port; s.close(() => res(q)); }); });
const runPhp = (dir, code) => { const r = spawnSync(php, ['-r', code], {cwd: appRoot, encoding: 'utf8', env: envFor(dir)}); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout; };

const browserPart = async () => {
    if (!php) { console.log('… pas de PHP : partie navigateur sautée'); return; }
    let chromium; try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (_) { try { ({chromium} = require('playwright')); } catch (__) { console.log('… pas de Playwright : partie navigateur sautée'); return; } }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-dgp-'));
    fs.mkdirSync(path.join(dir, 'media'), {recursive: true});
    runPhp(dir, 'require "lib/paths.php"; (new PDO("sqlite:".DATA_DIR."/genealogy.sqlite"))->exec(file_get_contents(APP_ROOT."/data/schema.sql")); require "lib/bootstrap.php"; db();');
    const seed = spawnSync(php, [path.join(appRoot, 'tests/fixtures/diagram-famille-seed.php')], {cwd: appRoot, encoding: 'utf8', env: envFor(dir)});
    if (seed.status !== 0 || !/^ok famille/m.test(seed.stdout)) throw new Error(seed.stderr || seed.stdout);
    const port = await freePort(), base = `http://127.0.0.1:${port}/`;
    const proc = spawn(php, ['-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], {cwd: appRoot, env: envFor(dir), stdio: 'ignore'});
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    const browser = await chromium.launch(exe ? {executablePath: exe} : {});
    const errors = [];
    const watch = p => { p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); }); p.on('dialog', d => { errors.push('dialogue : ' + d.message()); d.dismiss(); }); };
    const ready = async p => { await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.bootstrap && window.LCNDA_EXT?.openDiagramEditor && window.LCNDA_EXT?.diagramPerso && window.LCNDA_EXT?.diagramAppOpts, null, {timeout: 30000}); await p.waitForTimeout(400); };
    const shot = async (p, name, sel = '.h-dg-dlg') => { if (!SHOTS) return; fs.mkdirSync(SHOTS, {recursive: true}); const el = sel ? await p.$(sel) : null; await (el || p).screenshot({path: path.join(SHOTS, name + '.png')}); };
    const closeEditor = p => p.evaluate(() => document.querySelectorAll('.h-dg-dlg').forEach(d => { if (d.open) d.close(); d.remove(); }));
    const openSpec = async (p, spec, name = 'Essai') => { await closeEditor(p); await p.evaluate(([s, n2]) => { window.LCNDA_EXT.openDiagramEditor(null, {spec: s, name: n2}); }, [spec, name]); await p.waitForSelector('.h-dg-dlg [data-dg-preview] svg'); };
    const perso = async p => { await p.click('.h-dg-dlg [data-dg-tab="perso"]'); await p.waitForSelector('.h-dg-dlg [data-dgp]'); await p.evaluate(() => document.querySelectorAll('[data-dgp-sec]').forEach(d => { d.open = true; })); };
    const preview = p => p.$eval('.h-dg-dlg [data-dg-preview] svg', s => s.outerHTML);
    const until = (p, fn, arg, what) => p.waitForFunction(fn, arg, {timeout: 8000}).catch(() => { throw new Error('attente : ' + what); });
    const apiGet = async (action, q = {}) => (await (await fetch(base + 'api.php?action=' + action + '&' + new URLSearchParams(q))).json());
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 950}});
        const p = await ctx.newPage(); watch(p); await ready(p);

        await t('navigateur : l’onglet « ⚙️ Personnaliser » et ses sections selon le diagramme', async () => {
            await openSpec(p, sample('columns')); await perso(p);
            const secs = await p.$$eval('[data-dgp-sec]', l => l.map(x => x.dataset.dgpSec)); assert.deepEqual(secs, ['style', 'notes', 'refs', 'facet', 'time']);
            await openSpec(p, sample('pie')); await perso(p);
            assert.deepEqual(await p.$$eval('[data-dgp-sec]', l => l.map(x => x.dataset.dgpSec)), ['style', 'notes'], 'camembert : pas d’axe, pas de dates');
            await openSpec(p, sample('timeline')); await perso(p);
            assert.deepEqual(await p.$$eval('[data-dgp-sec]', l => l.map(x => x.dataset.dgpSec)), ['style', 'notes', 'time']);
        });
        let savedId = 0;
        await t('navigateur : annotations posées, glissées, retirées (↶ Annuler), enregistrées et exportées en SVG', async () => {
            await openSpec(p, sample('columns'), 'Annoté'); await perso(p);
            for (const a of ['arrow', 'text', 'rect', 'date']) { await p.click(`[data-dgp-add="${a}"]`); await p.waitForTimeout(150); }
            await until(p, () => document.querySelectorAll('.h-dg-dlg [data-dg-preview] .dg-note').length === 4, null, '4 annotations');
            await p.fill('.h-dgp-note[data-i="1"] [data-dgp-n="text"]', 'Pic de 1750'); await p.waitForTimeout(300);
            assert.match(await preview(p), /Pic de 1750/);
            // glisser le texte vers la gauche : ses coordonnées changent
            const before = await p.evaluate(() => ({...window.LCNDA_EXT.diagramPerso && document.querySelector('.h-dg-dlg') && null}));
            const box = await p.$eval('.h-dg-dlg [data-dg-preview] .dg-note[data-dgn="1"] text', e => { const r = e.getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height / 2}; });
            await p.mouse.move(box.x, box.y); await p.mouse.down(); await p.mouse.move(box.x - 120, box.y + 40, {steps: 6}); await p.mouse.up(); await p.waitForTimeout(400);
            const moved = await p.$eval('.h-dg-dlg [data-dg-preview] .dg-note[data-dgn="1"] text', e => Number(e.getAttribute('x')));
            assert.ok(moved < box.x && moved > 0, 'le texte a glissé : ' + moved); void before;
            await shot(p, '01-annotations');
            // retirer la flèche, puis ↶ Annuler
            await p.click('[data-dgp-ndel="0"]'); await until(p, () => document.querySelectorAll('.h-dg-dlg [data-dg-preview] .dg-note').length === 3, null, 'flèche retirée');
            await p.click('.toast button:has-text("Annuler"), .ui-toast button:has-text("Annuler")'); await until(p, () => document.querySelectorAll('.h-dg-dlg [data-dg-preview] .dg-note').length === 4, null, 'flèche remise');
            // lignes de repère
            await p.click('[data-dgp-radd="mean"]'); await p.waitForTimeout(300); assert.match(await preview(p), /Moyenne : 31,58/);
            await p.click('.h-dg-dlg [data-dg-save]'); await p.waitForFunction(() => !document.querySelector('.h-dg-dlg'));
            const list = await apiGet('diagrams'); const d = list.diagrams.find(x => x.name === 'Annoté'); assert.ok(d, 'enregistré'); savedId = d.id;
            assert.equal(d.spec.o.notes.length, 4); assert.equal(d.spec.o.notes[1].text, 'Pic de 1750'); assert.equal(d.spec.o.refs[0].t, 'mean');
            const svg = await p.evaluate(id => window.LCNDA_EXT.diagramSvg(id), d.id);
            assert.equal((svg.match(/class="dg-note"/g) || []).length, 4); assert.match(svg, /Pic de 1750/); assert.match(svg, /Moyenne : 31,58/); assert.doesNotMatch(svg, /dgn-h"[^>]*fill="#/, 'les poignées restent invisibles à l’export');
        });
        await t('navigateur : style « Archive », puis « Appliquer à tous les diagrammes » et ↶ Annuler', async () => {
            await p.evaluate(() => window.LCNDA_APP.api('save_diagram', {}, {method: 'POST', body: {name: 'Second', kind: 'pie', spec: {o: {title: 'Parts'}, series: [{name: 'N'}], rows: [{label: 'A', s0: 3}, {label: 'B', s0: 5}]}}}));
            await p.evaluate(id => window.LCNDA_EXT.openDiagramEditor(id), savedId); await p.waitForSelector('.h-dg-dlg [data-dg-preview] svg'); await perso(p);
            await p.click('[data-dgp-style="archive"]'); await p.waitForTimeout(300); assert.match(await preview(p), /Georgia/);
            await shot(p, '02-style-archive');
            await p.click('[data-dgp-all]');
            await until(p, () => [...document.querySelectorAll('.toast, .ui-toast')].some(x => /appliqué à \d+ diagramme/.test(x.textContent)), null, 'message « appliqué à tous »');
            let all = (await apiGet('diagrams')).diagrams; assert.ok(all.length >= 2 && all.every(x => x.spec.o?.style === 'archive'), 'tous en Archive');
            assert.equal(await p.evaluate(() => window.LCNDA_EXT.diagramPerso.getDefault()?.id), 'archive', 'devient le style par défaut');
            await p.click('.toast button:has-text("Annuler"), .ui-toast button:has-text("Annuler")');
            await p.waitForFunction(async () => (await window.LCNDA_APP.api('diagrams')).diagrams.some(x => x.name === 'Second' && !x.spec.o?.style), null, {timeout: 8000});
            all = (await apiGet('diagrams')).diagrams; assert.ok(!all.find(x => x.name === 'Second').spec.o.style, 'le second retrouve son style d’avant');
            await p.evaluate(() => window.LCNDA_EXT.diagramPerso.setDefault(null));
            await closeEditor(p);
        });
        await t('navigateur : petits multiples « Répéter par sexe » (Compter dans ma base, tenu à jour), même échelle', async () => {
            const spec = await p.evaluate(async () => { const O = window.LCNDA_EXT.diagramAppOpts, q = O.norm({what: 'births', by: 'century', limit: 0, live: true}); const res = await O.count(q); const s = O.toSpec({kind: 'columns', o: {title: 'Naissances par siècle'}}, res, 'Naissances'); s.live = {key: 'q:custom', label: 'Naissances', q, preset: 'custom'}; return s; });
            await openSpec(p, spec, 'Multiples'); await perso(p);
            const opts = await p.$$eval('[data-dgp-facet] option', l => l.map(o => o.value)); assert.deepEqual(opts, ['', 'sex', 'century', 'branch', 'county', 'country', 'generation']);
            await p.selectOption('[data-dgp-facet]', 'sex');
            await until(p, () => document.querySelectorAll('.h-dg-dlg [data-dg-preview] .dgp-facet').length >= 2, null, 'petits multiples');
            const svg = await preview(p); assert.match(svg, />Homme|>Hommes|>Femme/);
            await shot(p, '03-petits-multiples');
            await p.selectOption('[data-dgp-facet]', 'branch');
            await until(p, () => [...document.querySelectorAll('.h-dg-dlg [data-dg-preview] .dgp-facet text')].some(x => /Côté p[eè]re|Côté mère/.test(x.textContent)), null, 'par branche');
        });
        await t('navigateur : ▶ lecture des années, vitesse, boucle ; « Réduire les animations » respecté', async () => {
            await openSpec(p, sample('timeline'), 'Frise');
            await p.waitForSelector('.h-dg-dlg .h-dgp-play');
            await p.selectOption('.h-dgp-play [data-dgp-speed]', 'fast');
            await p.click('.h-dgp-play [data-dgp-p]'); await p.waitForTimeout(700);
            const y = await p.$eval('.h-dgp-play output', o => o.textContent); assert.ok(/^\d{4}$/.test(y.replace(/\s/g, '')), y);
            assert.match(await preview(p), /class="dgp-year"/);
            await shot(p, '04-lecture');
            await p.click('.h-dgp-play [data-dgp-p]');
            await p.click('.h-dgp-play [data-dgp-all]'); assert.doesNotMatch(await preview(p), /class="dgp-year"/);
            const pc = await ctx.newPage(); watch(pc); await pc.emulateMedia({reducedMotion: 'reduce'}); await ready(pc);
            await pc.evaluate(s => window.LCNDA_EXT.openDiagramEditor(null, {spec: s, name: 'Calme'}), sample('chrono')); await pc.waitForSelector('.h-dg-dlg .h-dgp-play');
            assert.match(await pc.$eval('.h-dgp-play', b => b.textContent), /Mouvements réduits/);
            await pc.close();
        });
        await t('navigateur : page Graphiques avec le curseur ▶ (« Montrer aussi là où il est posé »)', async () => {
            await closeEditor(p);
            const id = await p.evaluate(async s => { const r = await window.LCNDA_APP.api('save_diagram', {}, {method: 'POST', body: {name: 'Frise posée', kind: 'chrono', spec: {...s, kind: undefined, o: {...s.o, time: {show: true}}}}}); return Number(r.result?.id || r.id); }, sample('chrono'));
            await p.evaluate(async id2 => { await window.LCNDA_EXT.diagramList(true); window.LCNDA_EXT.openDiagram(id2); }, id);
            await p.waitForSelector('#workspace .h-dg-big .h-dgp-play', {timeout: 10000});
            await shot(p, '05-page-graphiques', '#workspace');
        });
        await t('navigateur : mode sombre et 390 px, sans erreur', async () => {
            const pd = await browser.newPage({viewport: {width: 1440, height: 950}, colorScheme: 'dark'}); watch(pd); await ready(pd);
            await pd.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
            await pd.evaluate(s => window.LCNDA_EXT.openDiagramEditor(null, {spec: s, name: 'Sombre'}), {...sample('columns'), o: {...sample('columns').o, notes: [{t: 'arrow', text: 'Ici'}], refs: [{t: 'median'}]}});
            await pd.waitForSelector('.h-dg-dlg [data-dg-preview] svg'); await perso(pd); await pd.waitForTimeout(300);
            await shot(pd, '06-sombre');
            const pm = await browser.newPage({viewport: {width: 390, height: 844}}); watch(pm); await ready(pm);
            await pm.evaluate(s => window.LCNDA_EXT.openDiagramEditor(null, {spec: s, name: 'Téléphone'}), sample('columns'));
            await pm.waitForSelector('.h-dg-dlg [data-dg-preview] svg'); await perso(pm); await pm.waitForTimeout(300);
            const over = await pm.evaluate(() => { const d = document.querySelector('.h-dg-dlg .h-dgp'); return d ? d.scrollWidth - d.clientWidth : -1; });
            assert.ok(over <= 2, 'pas de défilement de côté : ' + over);
            await shot(pm, '07-390', null);
            await pd.close(); await pm.close();
        });
        await t('aucune erreur dans la console', () => { assert.deepEqual(errors, []); });
    } finally {
        await browser.close(); proc.kill(); try { fs.rmSync(dir, {recursive: true, force: true}); } catch (_) {}
    }
};

(async () => {
    await sandbox();
    if (!process.env.DGP_NO_BROWSER) await browserPart().catch(e => { failed++; console.error('✗ partie navigateur', e); });
    console.log(`${failed ? '✗' : '✓'} diagrammes personnalisés : ${n} vérifications${failed ? `, ${failed} en échec` : ''}`);
    process.exit(failed ? 1 : 0);
})();
