'use strict';
/* 🌐 Traduction de la zone « maison » (vague 5, les éditeurs) : 🏠 plan de la maison, 3D et visite — heritage-house.js, -lib.js,
 * -more.js, -equip.js, -cultes.js, -plus.js, -pics.js, -vides.js, heritage-house3d.js (heritage-house-metiers.js reste en français).
 * Mode d'emploi : docs/I18N.md.
 *     node tests/test-i18n-maison.js                 (I18N_SHOTS=dossier pour garder des captures, I18N_PORT=20580 par défaut)
 *     I18N_PROBE=de node tests/test-i18n-maison.js    liste les textes français restés dans l’éditeur et ses panneaux (sans rien vérifier)
 * 1. Node : fichiers de langue complets (scripts/i18n-check.js) ; chaque i18n('…') et chaque paire nW('…', '…') des fichiers de la
 *    zone a sa traduction EXACTE dans les 7 langues ; les noms du catalogue (sauf métiers) sont traduits ; dans Node, les contrôles
 *    du plan (checks) restent en français.
 * 2. Navigateur (Playwright, sinon sauté) : en français rien ne change ; en de, pl et en, presque plus de français dans l’éditeur
 *    (barre du haut, outils, onglets Propriétés / Mobilier / Étage / Maison, un mur, une pièce, un meuble), la fenêtre ⚠️ Vérifier le
 *    plan, les époques, et le texte du plan (SVG) ; la barre du haut tient sur une ligne en allemand à 1440 px ; rien ne déborde à
 *    390 px en allemand ; aucune erreur JS.
 */
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {spawn, spawnSync} = require('node:child_process');
const {findPhp, devBundledPhp, phpRuntimeArgs} = require('../electron/php-server');

const root = path.resolve(__dirname, '..');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const PROBE = process.env.I18N_PROBE || '';
const LANGS = ['en', 'es', 'de', 'it', 'pt', 'pl', 'nl'];
const ZONE = ['heritage-house.js', 'heritage-house-lib.js', 'heritage-house-plus.js', 'heritage-house3d.js', 'heritage-house-pics.js'];
const ZONE_FILES = ZONE.map(f => path.join(root, 'assets/js', f));
const ALLOWED = Number(process.env.I18N_ALLOWED || 4);

(async () => {
    /* ═════ 1. Node ═════ */
    await t('fichiers de langue complets et à jour (scripts/i18n-check.js)', () => {
        const r = spawnSync(process.execPath, [path.join(root, 'scripts/i18n-check.js')], {encoding: 'utf8'});
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.ok(fs.existsSync(path.join(root, 'assets/i18n/src/maison.tsv')));
    });
    const X = require('../scripts/i18n-extract.js');
    const un = s => s.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    await t('chaque i18n(\'…\'), chaque nW(\'…\', \'…\') et chaque mot de pluriel de la zone a sa traduction exacte dans les 7 langues', () => {
        for (const l of LANGS) {
            const dict = X.loadDict(l), miss = [];
            for (const f of ZONE_FILES) {
                const src = fs.readFileSync(f, 'utf8'); let m;
                const rx = /\bi18n\(\s*'((?:[^'\\]|\\.)*)'(\s*,\s*\{[^}]*ctx:\s*'(\w+)')?/g;
                while ((m = rx.exec(src))) { const s = un(m[1]), k = m[3] ? `${m[3]}|${s}` : s; if (dict[k] == null && dict[s] == null) miss.push(`${path.basename(f)} ${s}`); }
                const rn = /\bnW\([^']*'((?:[^'\\]|\\.)*)',\s*'((?:[^'\\]|\\.)*)'/g;
                while ((m = rn.exec(src))) for (const s of [un(m[1]), un(m[2])]) if (!dict[s] || typeof dict[s] !== 'object') miss.push(`${path.basename(f)} nW ${s}`);
                const rp = /\bplural\([^,()]*(?:\([^()]*\)[^,()]*)*,\s*'((?:[^'\\]|\\.)*)'/g;
                while ((m = rp.exec(src))) { const s = un(m[1]); if (!dict[s] || typeof dict[s] !== 'object') miss.push(`${path.basename(f)} pluriel ${s}`); }
            }
            assert.deepEqual(miss, [], `${l} : ${miss.join('\n')}`);
        }
    });
    // le catalogue du mobilier, chargé comme dans la page (sans DOM)
    const loadCatalog = () => {
        const doc = {addEventListener() {}, querySelector() { return null; }, getElementById() { return null; }, createElement() { return {getContext() { return null; }, style: {}}; }, head: {appendChild() {}}, body: {appendChild() {}}};
        const win = {setTimeout, clearTimeout, requestAnimationFrame: () => 0, LCNDA_EXT: {}, document: doc, addEventListener() {}, localStorage: {getItem() { return null; }, setItem() {}}};
        win.window = win; const ctx = vm.createContext(win); ctx.globalThis = ctx;
        for (const f of ['heritage-house-vides', 'heritage-house-plus', 'heritage-house', 'heritage-house-lib', 'heritage-house-more', 'heritage-house-metiers', 'heritage-house-cultes', 'heritage-house-equip']) vm.runInContext(fs.readFileSync(path.join(root, 'assets/js', `${f}.js`), 'utf8'), ctx, {filename: f});
        try { win.LCNDA_EXT.houseLibUI.pane({cat: 'Chambre', q: '', mine: [], sym2d: () => ''}); } catch (_) {} // extend() : tout le catalogue
        return win.LCNDA_EXT;
    };
    await t('les noms et les catégories du mobilier sont traduits (sauf les métiers, données de référence)', () => {
        const E = loadCatalog(), met = fs.readFileSync(path.join(root, 'assets/js/heritage-house-metiers.js'), 'utf8');
        const others = ['heritage-house', 'heritage-house-lib', 'heritage-house-more', 'heritage-house-cultes', 'heritage-house-equip'].map(f => fs.readFileSync(path.join(root, 'assets/js', `${f}.js`), 'utf8')).join('\n');
        const lit = s => `'${s.replace(/'/g, "\\'")}'`;
        const names = new Set(); E.houseLib.LIB.forEach(l => { if (!(met.includes(lit(l[1])) && !others.includes(lit(l[1])))) names.add(l[1]); names.add(l[2]); });
        E.houseLibUI.CATS.forEach(c => names.add(c));
        assert.ok(names.size > 800, `catalogue : ${names.size}`);
        for (const l of LANGS) { const dict = X.loadDict(l), miss = [...names].filter(n => dict[n] == null); assert.deepEqual(miss, [], `${l} : ${miss.slice(0, 30).join(' | ')}`); }
    });
    await t('dans Node, les contrôles du plan restent en français', () => {
        const P = require('../assets/js/heritage-house-plus.js') || globalThis.LCNDA_EXT?.housePlus;
        const HP = globalThis.LCNDA_EXT?.housePlus || P;
        const l = HP.checks({slab: 20, floors: [{id: 'f', name: 'RdC', level: 0, height: 270, walls: [{id: 'w', a: [0, 0], b: [2, 0]}], openings: [], rooms: [], items: []}]});
        assert.match(l.map(x => x.text).join(' '), /Un mur de moins de 5 cm/);
    });

    /* ═════ 2. Navigateur ═════ */
    const phpPath = findPhp([devBundledPhp()]);
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); console.log(`${failed ? '✗' : '✓'} traduction de la maison : ${count} vérifications`); process.exit(failed ? 1 : 0); }
    const R = require('../scripts/i18n-remaining.js');
    const shots = process.env.I18N_SHOTS || '';
    const tmp = fs.mkdtempSync(path.join(process.env.I18N_TMP || os.tmpdir(), 'carnet-i18n-maison-'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Joseph','Martin','male','deceased')"); $p = null;
require 'lib/bootstrap.php'; db(); echo 'ok';`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = Number(process.env.I18N_PORT) || 20580;
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch();
    const errs = [];
    const watch = (page, tag) => { page.on('pageerror', e => errs.push(`${tag} : ${e.message}`)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|tile\.openstreetmap/.test(m.text())) errs.push(`${tag} console : ${m.text()}`); }); page.on('dialog', d => d.dismiss()); };
    const open = async ({w = 1440, lang = ''} = {}) => {
        const ctx = await browser.newContext({viewport: {width: w, height: 900}});
        await ctx.addInitScript(l => { try { if (!sessionStorage.getItem('i18n-test-set')) { if (l) localStorage.setItem('lcnda-langue', l); else localStorage.removeItem('lcnda-langue'); sessionStorage.setItem('i18n-test-set', '1'); } localStorage.setItem('genealogie-visite-guidee', JSON.stringify({never: true, done: true})); } catch (_) {} }, lang);
        const page = await ctx.newPage(); watch(page, `${lang || 'fr'} ${w}px`);
        await page.goto(base, {waitUntil: 'load'});
        await page.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.openHouse && window.LCNDA_EXT?.housePlus, null, {timeout: 30000});
        await page.waitForTimeout(800);
        return page;
    };
    // une maison d'essai : 4 murs, une pièce (nom = donnée), une porte, une fenêtre, un meuble, un escalier, un toit, deux époques
    const openHouse = page => page.evaluate(async () => {
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        const ed = window.__ed = await window.LCNDA_EXT.openHouse({});
        const H = ed.house, f = H.floors[0];
        f.walls = [[0, 0, 600, 0], [600, 0, 600, 400], [600, 400, 0, 400], [0, 400, 0, 0]].map((r, i) => ({id: 'w' + i, a: [r[0], r[1]], b: [r[2], r[3]], t: 30, mat: 'pierre'}));
        f.rooms = [{id: 'r1', name: 'Zx1', pts: [[0, 0], [600, 0], [600, 400], [0, 400]], floor: 'parquet'}];
        f.openings = [{id: 'o1', type: 'door', wall: 'w0', pos: .3, w: 90, h: 210}, {id: 'o2', type: 'window', wall: 'w1', pos: .5, w: 100, h: 120, sill: 90}];
        f.items = [{id: 'i1', kind: 'tablerect', x: 300, y: 200, w: 160, d: 90, h: 75}, {id: 'i2', kind: 'escalier', x: 100, y: 200, w: 90, d: 300, rot: 0}];
        f.showTable = true; f.showTitle = true;
        H.roof = {on: true, pitch: 40, kind: 'tuiles', shape: 'gable'};
        ed.commit('test'); ed.render();
        await new Promise(r => setTimeout(r, 400));
        return true;
    });
    const SKIP = '[data-i18n-off], script, style, textarea, code, pre, input, .h-hs-name, .h-hs-floors, .h-hs-rname, [data-hs-vers], .pk-chip, .person-name';
    const textsOf = (page, sel) => page.evaluate(([sel, skip]) => {
        const out = new Set(); const el = document.querySelector(sel); if (!el) return null;
        const tw = document.createTreeWalker(el, 5); let n = el;
        do {
            if (n.nodeType === 1) { if (n.closest(skip)) continue; ['title', 'placeholder', 'aria-label'].forEach(a => n.getAttribute(a) && out.add(n.getAttribute(a))); }
            else if (n.nodeType === 3 && !n.parentElement.closest(skip)) { const s = n.nodeValue.replace(/\s+/g, ' ').trim(); if (s) out.add(s); }
        } while ((n = tw.nextNode()));
        el.querySelectorAll('select option').forEach(o => { if (!o.closest(skip)) { const s = o.textContent.trim(); if (s) out.add(s); } });
        return [...out];
    }, [sel, SKIP]);
    const settle = page => page.waitForTimeout(350);
    // les écrans de l'éditeur : l'onglet, puis un objet choisi
    const SCREENS = [
        ['props (rien)', p => p.evaluate(() => { window.__ed.select(null, null); window.__ed.setTab('props'); })],
        ['mur', p => p.evaluate(() => window.__ed.select('wall', 'w0'))],
        ['pièce', p => p.evaluate(() => window.__ed.select('room', 'r1'))],
        ['porte', p => p.evaluate(() => window.__ed.select('opening', 'o1'))],
        ['meuble', p => p.evaluate(() => window.__ed.select('item', 'i1'))],
        ['escalier', p => p.evaluate(() => window.__ed.select('item', 'i2'))],
        ['mobilier', p => p.evaluate(() => window.__ed.setTab('lib'))],
        ['étage', p => p.evaluate(() => window.__ed.setTab('floor'))],
        ['maison', p => p.evaluate(() => window.__ed.setTab('house'))],
    ];
    // la vue 3D : sa barre, la lumière du jour, la visite (sa barre d'aide)
    const view3dTexts = async page => {
        await page.evaluate(async () => { await window.__ed.toggle3d(true); await new Promise(r => setTimeout(r, 1500)); document.querySelector('.h-hs-dlg [data-h3="sun"]')?.click(); await new Promise(r => setTimeout(r, 400)); });
        return textsOf(page, '.h-hs-dlg .h-hs-3d') .then(async a => { const b = await textsOf(page, '.h-hs-dlg [data-h3bar]'); await page.evaluate(() => window.__ed.toggle3d(false)); return [...(a || []), ...(b || [])]; });
    };
    const allTexts = async page => {
        const out = {};
        await page.evaluate(() => document.querySelectorAll('.h-hs-dlg details.h-hs-menu, .h-hs-dlg details.ui-section').forEach(d => { d.open = true; }));
        out['barre et plan'] = await textsOf(page, '.h-hs-dlg');
        for (const [k, go] of SCREENS) { await go(page); await settle(page); await page.evaluate(() => document.querySelectorAll('.h-hs-dlg details.ui-section').forEach(d => { d.open = true; })); await settle(page); out[k] = await textsOf(page, '.h-hs-dlg [data-hs-pane]'); }
        return out;
    };
    const dialogTexts = (page, run) => page.evaluate(async run => {
        const before = new Set(document.querySelectorAll('dialog[open]'));
        if (run === 'check') window.LCNDA_EXT.housePlus.cmd('check', {...{H: window.__ed.house}, commit() {}, render() {}, paint() {}});
        else window.__ed.cmd(run);
        for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 100)); if ([...document.querySelectorAll('dialog[open]')].some(d => !before.has(d))) break; }
        await new Promise(r => setTimeout(r, 500));
        const d = [...document.querySelectorAll('dialog[open]')].filter(x => !before.has(x)).pop(); if (!d) return null;
        d.id = d.id || 'i18n-probe-dlg'; return d.id;
    }, run).then(async id => { if (!id) return null; const out = await textsOf(page, `#${id}`); await page.evaluate(id => { const d = document.getElementById(id); d?.close(); d?.remove?.(); }, id); return out; });
    const DIALOGS = ['check', 'floors', 'addfloor', 'vernew', 'repeat'];
    try {
        if (PROBE) {
            const isFr = R.make(PROBE), page = await open({lang: PROBE});
            await openHouse(page);
            const all = await allTexts(page);
            for (const [k, v] of Object.entries(all)) { const left = (v || []).filter(isFr); console.log(`\n══ ${k} (${left.length})`); left.forEach(s => console.log(s)); }
            const v3 = (await view3dTexts(page)).filter(isFr); console.log(`\n══ 3D (${v3.length})`); v3.forEach(s => console.log(s));
            for (const c of DIALOGS) { await page.evaluate(() => window.__ed.select('item', 'i1')); const dl = await dialogTexts(page, c).catch(e => { console.log('!', c, e.message); return null; }); if (!dl) { console.log(`── ${c} : pas de fenêtre`); continue; } const l2 = dl.filter(isFr); console.log(`── ${c} (${l2.length})`); l2.forEach(s => console.log(s)); }
            console.log('\nerreurs JS :', errs);
            return;
        }
        await t('en français, rien ne change : pas de bandeau, html lang="fr", l’éditeur en français', async () => {
            const page = await open();
            await openHouse(page);
            const r = await page.evaluate(() => ({lang: document.documentElement.lang, banner: !!document.getElementById('lc-i18n-banner'), tabs: [...document.querySelectorAll('.h-hs-dlg [data-hs-tab] .h-hs-tl')].map(s => s.textContent), floor: window.__ed.house.floors[0].name, svg: document.querySelector('.h-hs-dlg [data-hs-world]').textContent}));
            assert.equal(r.lang, 'fr'); assert.equal(r.banner, false);
            assert.deepEqual(r.tabs, ['Propriétés', 'Mobilier', 'Étage', 'Maison']);
            assert.equal(r.floor, 'Rez-de-chaussée');
            assert.match(r.svg, /Pièces et surfaces/);
            await page.context().close();
        });
        for (const l of ['de', 'pl', 'en']) await t(`${l} : l’éditeur, ses panneaux et ses fenêtres sont traduits (au plus ${ALLOWED} textes français chacun)`, async () => {
            const isFr = R.make(l), page = await open({lang: l}), bad = {};
            await openHouse(page);
            const all = await allTexts(page);
            for (const [k, v] of Object.entries(all)) { if (!v) { bad[`${k} (vide)`] = []; continue; } const left = v.filter(isFr); if (left.length > ALLOWED) bad[k] = left; }
            const v3 = (await view3dTexts(page)).filter(isFr); if (v3.length > ALLOWED) bad['vue 3D'] = v3;
            const r = await page.evaluate(() => ({tabs: [...document.querySelectorAll('.h-hs-dlg [data-hs-tab] .h-hs-tl')].map(s => s.textContent), svg: (() => { window.__ed.render(); return document.querySelector('.h-hs-dlg [data-hs-world]').textContent; })()}));
            assert.notDeepEqual(r.tabs, ['Propriétés', 'Mobilier', 'Étage', 'Maison'], 'les onglets sont traduits');
            assert.doesNotMatch(r.svg, /Pièces et surfaces|Plan du/, 'le plan (cartouche, tableau des pièces) est traduit dès le dessin');
            if (shots) await page.screenshot({path: path.join(shots, `i18n-maison-${l}.png`)});
            for (const c of DIALOGS) {
                await page.evaluate(() => window.__ed.select('item', 'i1'));
                const dl = await dialogTexts(page, c);
                if (!dl) { bad[`${c} (pas de fenêtre)`] = []; continue; }
                const l2 = dl.filter(isFr); if (l2.length > ALLOWED) bad[c] = l2;
            }
            assert.deepEqual(bad, {}, `textes français restés : ${JSON.stringify(bad, null, 1)}`);
            await page.context().close();
        });
        await t('allemand à 1440 px : la barre du haut tient sur une ligne (même hauteur qu’en français)', async () => {
            const h = {};
            for (const l of ['', 'de']) {
                const page = await open({lang: l}); await openHouse(page);
                h[l || 'fr'] = await page.evaluate(() => { const b = document.querySelector('.h-hs-dlg .h-hs-top'); const kids = [...b.children].filter(k => k.offsetParent); const tops = kids.map(k => Math.round(k.getBoundingClientRect().top)); return {h: Math.round(b.getBoundingClientRect().height), spread: Math.max(...tops) - Math.min(...tops), over: b.scrollWidth - b.clientWidth}; });
                if (shots) await page.screenshot({path: path.join(shots, `i18n-maison-topbar-${l || 'fr'}.png`), clip: {x: 0, y: 0, width: 1440, height: 120}});
                await page.context().close();
            }
            assert.ok(h.de.h <= h.fr.h + 2, `hauteur : ${JSON.stringify(h)}`);
            assert.ok(h.de.spread <= h.fr.spread + 2 && h.de.over <= 1, `une seule ligne : ${JSON.stringify(h)}`);
        });
        await t('allemand à 390 px : l’éditeur, ses panneaux et ses fenêtres ne débordent pas', async () => {
            const page = await open({lang: 'de', w: 390}), wide = [];
            await openHouse(page);
            for (const [k, go] of SCREENS) {
                await go(page); await settle(page);
                const r = await page.evaluate(() => { const d = document.querySelector('.h-hs-dlg'), p = d.querySelector('[data-hs-pane]'); return {d: d.scrollWidth - d.clientWidth, p: p ? p.scrollWidth - p.clientWidth : 0, doc: document.documentElement.scrollWidth}; });
                if (r.d > 1 || r.p > 1 || r.doc > 391) wide.push(`${k} (${JSON.stringify(r)})`);
            }
            for (const c of DIALOGS) {
                const w = await page.evaluate(async c => {
                    const before = new Set(document.querySelectorAll('dialog[open]')); window.__ed.select('item', 'i1');
                    if (c === 'check') window.LCNDA_EXT.housePlus.cmd('check', {H: window.__ed.house, commit() {}, render() {}, paint() {}}); else window.__ed.cmd(c);
                    for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 100)); if ([...document.querySelectorAll('dialog[open]')].some(d => !before.has(d))) break; }
                    await new Promise(r => setTimeout(r, 400));
                    const d = [...document.querySelectorAll('dialog[open]')].filter(x => !before.has(x)).pop(); if (!d) return null;
                    const box = d.getBoundingClientRect(), res = {w: Math.round(box.right), sw: d.scrollWidth - d.clientWidth, doc: document.documentElement.scrollWidth};
                    d.close(); d.remove?.(); return res;
                }, c);
                if (w && (w.w > 391 || w.sw > 1 || w.doc > 391)) wide.push(`${c} (${JSON.stringify(w)})`);
            }
            assert.deepEqual(wide, []);
            await page.context().close();
        });
        await t('aucune erreur JavaScript', () => { assert.deepEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(`${failed ? '✗' : '✓'} traduction de la maison : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
