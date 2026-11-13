'use strict';
/* 🌐 Traduction de la zone « tableaux » (vague 5, les éditeurs) : 🧩 Tableaux façon Freeform (heritage-boards.js, heritage-board-kit.js,
 * heritage-board-shapelib.js, heritage-board-shapes.js et la grande bibliothèque assets/data/shapes-lib.json) et 🎤 Présentation
 * (heritage-keynote.js). Mode d'emploi : docs/I18N.md.
 *     node tests/test-i18n-tableaux.js                (I18N_SHOTS=dossier pour garder des captures, I18N_PORT=20550 par défaut)
 *     I18N_PROBE=de node tests/test-i18n-tableaux.js   liste les textes français restés à l’écran (sans rien vérifier)
 * 1. Node : fichiers de langue complets (scripts/i18n-check.js) ; chaque texte i18n('…') des fichiers de la zone et chaque mot de pluriel
 *    a sa traduction EXACTE dans les 7 langues ; chaque nom de forme (bibliothèque comprise) se traduit en entier (nom + précisions
 *    entre parenthèses) dans les 7 langues ; la recherche des formes trouve aussi les mots français.
 * 2. Navigateur (Playwright, sinon sauté) : en français rien ne change ; en de, pl et en, presque plus de français dans la galerie des
 *    tableaux, l’éditeur (barre du haut, colonne d’outils, options de chaque outil, panneau de chaque sorte d’élément, menus) et ses
 *    fenêtres (nouveau tableau, ranger, ajouter, réglages, bibliothèque de formes), et dans la Présentation (barre, menus, panneau,
 *    fenêtres) ; la barre du haut des deux éditeurs tient sur une ligne en allemand à 1440 px ; rien ne déborde à 390 px ; aucune erreur JS.
 */
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');
const {findPhp, devBundledPhp, phpRuntimeArgs} = require('../electron/php-server');

const root = path.resolve(__dirname, '..');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const PROBE = process.env.I18N_PROBE || '';
const LANGS = ['en', 'es', 'de', 'it', 'pt', 'pl', 'nl'];
const ZONE_FILES = ['heritage-boards.js', 'heritage-board-kit.js', 'heritage-board-shapelib.js', 'heritage-keynote.js'].map(f => path.join(root, 'assets/js', f));
// au plus ce nombre de textes français par écran (mots venus d'une autre zone, données)
const ALLOWED = Number(process.env.I18N_ALLOWED || 4);

(async () => {
    /* ═════ 1. Node ═════ */
    await t('fichiers de langue complets et à jour (scripts/i18n-check.js)', () => {
        const r = spawnSync(process.execPath, [path.join(root, 'scripts/i18n-check.js')], {encoding: 'utf8'});
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.ok(fs.existsSync(path.join(root, 'assets/i18n/src/tableaux.tsv')));
    });
    const X = require('../scripts/i18n-extract.js');
    const un = s => s.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    await t('chaque i18n(\'…\') et chaque mot de pluriel des fichiers de la zone a sa traduction exacte dans les 7 langues', () => {
        for (const l of LANGS) {
            const dict = X.loadDict(l), miss = [];
            for (const f of ZONE_FILES) {
                const src = fs.readFileSync(f, 'utf8'); let m;
                const rx = /\bi18n\(\s*'((?:[^'\\]|\\.)*)'(\s*,\s*\{\s*ctx:\s*'([^']+)'\s*\})?/g;
                while ((m = rx.exec(src))) { const s = un(m[1]), k = m[3] ? `${m[3]}|${s}` : s; if (dict[k] == null && dict[s] == null) miss.push(`${path.basename(f)} ${k}`); }
                const rp = /\bplural\([^,()]*(?:\([^()]*\)[^,()]*)*,\s*'((?:[^'\\]|\\.)*)'/g;
                // « =mot » : la forme du pluriel ; quelques mots (élément, image, étape) sont gardés en simple texte par une autre zone : le simple texte suffit alors
                while ((m = rp.exec(src))) { const s = un(m[1]); if (dict[s] == null) miss.push(`${path.basename(f)} pluriel ${s}`); }
            }
            assert.deepEqual(miss, [], `${l} : ${miss.join('\n')}`);
        }
    });
    // les noms des formes : le nom + ses précisions entre parenthèses, chacun traduit (heritage-board-kit.js : shapeName)
    global.window = {LCNDA_EXT: {}};
    require('../assets/js/heritage-board-shapes.js');
    const extra = global.window.LCNDA_EXT.boardShapesExtra, lib = require('../assets/data/shapes-lib.json');
    const kitSrc = fs.readFileSync(path.join(root, 'assets/js/heritage-board-kit.js'), 'utf8');
    // les formes écrites dans heritage-board-kit.js lui-même ([clé, 'Nom', 'catégorie'] et les noms fabriqués `… ${n} …`)
    const CATS = 'elem|geo|arrows|bubbles|stars|symbols|genea|people|faith|docs|places|house|clothes|jobs|transport|animals|nature|weather|food|leisure|health|objects|mine';
    const kitNames = []; { let m; const rx = new RegExp(`\\['[a-z0-9_\${}]+'?\`?, '([^']+)', '(${CATS})'`, 'g'); while ((m = rx.exec(kitSrc))) kitNames.push(m[1]);
        const rt = new RegExp('`([^`$]*)\\$\\{n\\}([^`]*)`, \'(?:' + CATS + ')\'', 'g'); while ((m = rt.exec(kitSrc))) kitNames.push(m[1] + '5' + m[2]); }
    const shapeNames = [...new Set([...kitNames, ...Object.values(extra).flat().map(r => r[1]), ...lib.shapes.map(r => r[1])])];
    await t(`les ${shapeNames.length} noms de formes (bibliothèque comprise) se traduisent en entier dans les 7 langues`, () => {
        const split = require('../assets/js/heritage-board-kit.js').shapeNameParts;
        assert.equal(typeof split, 'function', 'heritage-board-kit.js exporte shapeNameParts pour Node');
        for (const l of LANGS) {
            const dict = X.loadDict(l), miss = new Set();
            for (const n of shapeNames) for (const k of split(n)) if (dict[k] == null) miss.add(k);
            assert.deepEqual([...miss].slice(0, 40), [], `${l} : ${miss.size} morceaux sans traduction`);
        }
        assert.ok(kitSrc.includes('shapeNameParts')); assert.ok(kitNames.length > 50, 'formes du kit trouvées : ' + kitNames.length);
    });

    /* ═════ 2. Navigateur ═════ */
    const phpPath = findPhp([devBundledPhp()]);
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); console.log(`${failed ? '✗' : '✓'} traduction des tableaux : ${count} vérifications`); process.exit(failed ? 1 : 0); }
    const R = require('../scripts/i18n-remaining.js');
    const shots = process.env.I18N_SHOTS || '';
    const tmp = fs.mkdtempSync(path.join(process.env.I18N_TMP || os.tmpdir(), 'carnet-i18n-tableaux-'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Joseph','Martin','male','deceased'),('Marie','Durand','female','deceased'),('Louis','Martin','male','deceased')"); $p = null;
require 'lib/bootstrap.php'; db(); echo 'ok';`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = Number(process.env.I18N_PORT) || 20550;
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch();
    const errs = [];
    const watch = (page, tag) => { page.on('pageerror', e => errs.push(`${tag} : ${e.message}`)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(`${tag} console : ${m.text()}`); }); page.on('dialog', d => d.dismiss()); };
    const open = async ({w = 1440, lang = ''} = {}) => {
        const ctx = await browser.newContext({viewport: {width: w, height: 900}});
        await ctx.addInitScript(l => { try { if (!sessionStorage.getItem('i18n-test-set')) { if (l) localStorage.setItem('lcnda-langue', l); else localStorage.removeItem('lcnda-langue'); sessionStorage.setItem('i18n-test-set', '1'); } localStorage.setItem('genealogie-visite-guidee', JSON.stringify({never: true, done: true})); } catch (_) {} }, lang);
        const page = await ctx.newPage(); watch(page, `${lang || 'fr'} ${w}px`);
        await page.goto(base, {waitUntil: 'load'});
        await page.waitForFunction(() => window.LCNDA_APP?.setModule && window.LCNDA_EXT?.openBoardById && window.LCNDA_EXT?.openKeynote && window.LCNDA_APP.state.csrf);
        await page.waitForTimeout(800);
        return page;
    };
    // les textes d'un endroit, hors données (contenu des éléments du tableau, diapositive, cases de saisie)
    const SKIP = '[data-i18n-off], script, style, textarea, code, pre, .h-board-world, .kn-slidebox, .kn-thumbs .kn-th, .kn-sl, [data-person-id], .person-name, .pk-chip, .h-bsl-grid, .h-bsl-list';
    const textsOf = (page, sel) => page.evaluate(([sel, skip]) => {
        const out = new Set(); const els = [...document.querySelectorAll(sel)].filter(e => e.getClientRects().length || e.matches('dialog[open], details')); if (!els.length) return null;
        for (const el of els) {
            const tw = document.createTreeWalker(el, 5); let n = el;
            do {
                if (n.nodeType === 1) { if (n.closest(skip)) continue; ['title', 'placeholder', 'aria-label'].forEach(a => n.getAttribute(a) && out.add(n.getAttribute(a))); }
                else if (n.nodeType === 3 && !n.parentElement.closest(skip)) { const s = n.nodeValue.replace(/\s+/g, ' ').trim(); if (s) out.add(s); }
            } while ((n = tw.nextNode()));
            el.querySelectorAll('select:not([data-i18n-off]) option').forEach(o => { const s = o.textContent.trim(); if (s) out.add(s); });
        }
        return [...out];
    }, [sel, SKIP]);
    const closeAll = page => page.evaluate(() => { document.querySelectorAll('.ui-actmenu, .ui-menu, .h-menu, .h-bd-menu, .h-bd-pop').forEach(m => m.remove?.()); document.querySelectorAll('dialog[open]').forEach(d => { if (!d.matches('.kn-dlg')) { d.close(); } }); });
    const POP = '.ui-actmenu, .h-bd-menu, .h-bd-pop, .h-bd-popover, [role=menu]';
    /* ── Tableaux ── */
    const boardItems = [
        {id: 'n1', type: 'note', text: 'Note', x: 0, y: 0, w: 200, h: 140, fill: '#fff3a3'},
        {id: 's1', type: 'shape', shape: 'rect', text: '', x: 260, y: 0, w: 160, h: 100},
        {id: 't1', type: 'text', text: 'Texte', x: 0, y: 200, w: 200, h: 40},
        {id: 'l1', type: 'line', from: 'n1', to: 's1', points: [[200, 60], [260, 50]], color: '#111', sw: 2, arrowEnd: true},
        {id: 'f1', type: 'frame', title: 'Cadre', x: 500, y: 0, w: 300, h: 200, fill: '#eef4ff', stroke: '#9fb7d9'},
        {id: 'g1', type: 'table', cells: [['A', 'B'], ['1', '2']], colw: [120, 120], header: true, x: 0, y: 300, w: 240, h: 80},
        {id: 'd1', type: 'draw', paths: [{pts: [[0, 0], [10, 10], [20, 0]], color: '#111', w: 3}], x: 300, y: 300, w: 40, h: 20, vw: 40, vh: 20},
        {id: 'p1', type: 'person', person_id: 1, x: 600, y: 300, w: 220, h: 120},
        {id: 'w1', type: 'weblink', url: 'https://example.org/', title: 'Exemple', x: 900, y: 300, w: 220, h: 80},
        {id: 'tg', type: 'tag', text: 'Étiquette', fill: '#0066cc', color: '#ffffff', x: 900, y: 0, w: 120, h: 38},
    ];
    const openBoard = async page => {
        await page.evaluate(async items => {
            const r = await window.LCNDA_APP.api('save_board', {}, {method: 'POST', body: {title: 'Board1', data: {items}}});
            window.LCNDA_EXT.openBoardById(r.result?.id || r.id);
        }, boardItems);
        await page.waitForSelector('.h-board .h-board-head', {timeout: 15000}); await page.waitForTimeout(1200);
    };
    const boardScreens = async (page, cb) => {
        // la galerie
        await page.evaluate(() => { window.LCNDA_APP.state.currentBoardId = 0; window.LCNDA_EXT.boards(++window.LCNDA_APP.state.workspaceToken); }); await page.waitForTimeout(900);
        await cb('galerie', await textsOf(page, '#workspace .h-boards'));
        // nouveau tableau
        await page.evaluate(() => window.LCNDA_EXT.newBoard()); await page.waitForTimeout(500);
        await cb('nouveau tableau', await textsOf(page, 'dialog[open]')); await closeAll(page);
        await openBoard(page);
        await cb('éditeur', await textsOf(page, '#workspace .h-board'));
        // chaque outil : ses options dans la barre
        const tools = await page.$$eval('.h-board [data-bd-tool]', l => l.map(x => x.dataset.bdTool));
        for (const k of tools) { await page.click(`.h-board [data-bd-tool="${k}"]`); await page.waitForTimeout(200); await cb(`outil ${k}`, await textsOf(page, '.h-board .h-board-toolbar, .h-board .ed-status, .h-board .ui-edstatus')); }
        await page.click('.h-board [data-bd-tool="select"]');
        // chaque sorte d'élément : son panneau
        for (const it of boardItems) {
            await page.evaluate(id => window.LCNDA_EXT.boardsInternals.current.select([id]), it.id); await page.waitForTimeout(400);
            await cb(`panneau ${it.type}`, await textsOf(page, '.h-board [data-bd-inspector]'));
        }
        await page.evaluate(() => window.LCNDA_EXT.boardsInternals.current.select(['n1', 's1'])); await page.waitForTimeout(300);
        await cb('panneau plusieurs', await textsOf(page, '.h-board [data-bd-inspector]'));
        await page.evaluate(() => window.LCNDA_EXT.boardsInternals.current.select([])); await page.waitForTimeout(300);
        // les menus et fenêtres de la barre du haut
        for (const b of ['export', 'add', 'zoomout', 'layers', 'present', 'search', 'snaps', 'place', 'brushmenu', 'shapelib']) {
            await closeAll(page);
            if (b === 'brushmenu') { await page.click('.h-board [data-bd-tool="pen"]'); await page.waitForTimeout(200); }
            if (b === 'shapelib') { await page.click('.h-board [data-bd-tool="shape"]'); await page.waitForTimeout(200); }
            const sel = `.h-board [data-bd-${b}]`;
            const ok = await page.evaluate(sel => { const el = [...document.querySelectorAll(sel)].find(x => x.getClientRects().length) || document.querySelector(sel); if (!el) return false; el.click(); return true; }, sel);
            if (!ok) { await cb(`${b} (pas de bouton)`, null); continue; }
            await page.waitForTimeout(b === 'shapelib' ? 1800 : 700);
            await cb(`menu ${b}`, await textsOf(page, `${POP}, dialog[open]`));
            await page.keyboard.press('Escape'); await page.waitForTimeout(150);
        }
        await closeAll(page);
        // Réglages → Tableaux (⚙️ Personnaliser), chaque onglet
        await page.click('.h-board [data-bd-prefs]'); await page.waitForTimeout(1500);
        await cb('réglages des tableaux', await textsOf(page, '#workspace'));
        const tabs = await page.$$eval('#workspace [data-bp-tab]', l => l.map(x => x.dataset.bpTab)).catch(() => []);
        for (const k of tabs) { await page.click(`#workspace [data-bp-tab="${k}"]`).catch(() => {}); await page.waitForTimeout(500); await cb(`réglages ${k}`, await textsOf(page, '#workspace')); }
    };
    /* ── Présentation ── */
    const openKn = async page => {
        await closeAll(page);
        await page.evaluate(() => window.LCNDA_EXT.openKeynote({})); await page.waitForSelector('dialog.kn-dlg[open], dialog[open] .kn-top', {timeout: 15000}); await page.waitForTimeout(900);
    };
    const KN = 'dialog[open]:has(.kn-top)';
    const knScreens = async (page, cb) => {
        await openKn(page);
        await page.evaluate(KN => document.querySelectorAll(`${KN} details.kn-dd`).forEach(d => { d.open = true; }), KN);
        await cb('présentation', await textsOf(page, KN));
        await page.evaluate(KN => document.querySelectorAll(`${KN} details.kn-dd`).forEach(d => { d.open = false; }), KN);
        // un objet de chaque sorte : son panneau
        const ins = await page.$$eval(`${KN} [data-kn-ins]`, l => [...new Set(l.map(x => x.dataset.knIns))]);
        for (const k of ins.slice(0, 24)) {
            const did = await page.evaluate(([KN, k]) => { const b = [...document.querySelectorAll(`${KN} [data-kn-ins="${k}"]`)][0]; if (!b) return false; const before = new Set(document.querySelectorAll('dialog[open]')); b.click(); return [...document.querySelectorAll('dialog[open]')].some(d => !before.has(d)); }, [KN, k]);
            await page.waitForTimeout(500);
            const dlgOpen = await page.evaluate(() => [...document.querySelectorAll('dialog[open]')].filter(d => !d.querySelector('.kn-top')).length);
            if (dlgOpen) { if (k !== 'image') await cb(`insérer ${k} (fenêtre)`, await textsOf(page, 'dialog[open]:not(:has(.kn-top))')); /* l’image : la fenêtre commune app-media-picker.js, hors de cette zone */ await page.evaluate(() => [...document.querySelectorAll('dialog[open]')].filter(d => !d.querySelector('.kn-top')).forEach(d => { d.close(); d.remove?.(); })); await page.waitForTimeout(200); continue; }
            await cb(`panneau ${k}`, await textsOf(page, `${KN} .kn-insp, ${KN} [data-kn-insp]`));
        }
        for (const c of ['export', 'import', 'section', 'master']) {
            const before = await page.evaluate(() => document.querySelectorAll('dialog[open]').length);
            await page.evaluate(c => { window.LCNDA_EXT.keynoteCurrent.run(c); }, c); await page.waitForTimeout(900);
            await cb(`commande ${c}`, await textsOf(page, `dialog[open]:not(:has(.kn-top)), ${POP}`));
            await page.evaluate(n => { const l = [...document.querySelectorAll('dialog[open]')].filter(d => !d.querySelector('.kn-top')); l.forEach(d => { d.close(); d.remove?.(); }); document.querySelectorAll('.ui-actmenu').forEach(m => m.remove()); }, before); await page.waitForTimeout(200);
        }
    };
    try {
        if (PROBE) {
            const isFr = R.make(PROBE), page = await open({lang: PROBE});
            const cb = (name, list) => { if (!list) { console.log(`── ${name} : rien`); return; } const l = list.filter(isFr); console.log(`── ${name} (${l.length})`); l.forEach(s => console.log('   ' + s)); };
            await boardScreens(page, cb);
            await knScreens(page, cb);
            console.log('\nerreurs JS :', errs);
            return;
        }
        await t('en français, rien ne change : pas de bandeau, html lang="fr", les éditeurs en français', async () => {
            const page = await open();
            await openBoard(page);
            const r = await page.evaluate(() => ({lang: document.documentElement.lang, banner: !!document.getElementById('lc-i18n-banner'), save: document.querySelector('.h-board [data-bd-save]').textContent, add: document.querySelector('.h-board [data-bd-add]').textContent.trim(), empty: document.querySelector('.h-board [data-bd-inspector]').innerText}));
            assert.equal(r.lang, 'fr'); assert.equal(r.banner, false);
            assert.equal(r.save, '💾 Enregistrer'); assert.equal(r.add, '＋ Ajouter'); assert.match(r.empty, /Choisis un élément pour le régler/);
            await openKn(page);
            const k = await page.evaluate(KN => document.querySelector(`${KN} .kn-name`).getAttribute('aria-label'), KN);
            assert.equal(k, 'Nom de la présentation');
            await page.context().close();
        });
        for (const l of ['de', 'pl', 'en']) await t(`${l} : les tableaux et la présentation sont traduits (au plus ${ALLOWED} textes français par écran)`, async () => {
            const isFr = R.make(l), page = await open({lang: l}), bad = {};
            const cb = (name, list) => { if (!list) return; const left = list.filter(isFr); if (left.length > ALLOWED) bad[name] = left; };
            await boardScreens(page, cb);
            if (shots) await page.screenshot({path: path.join(shots, `i18n-tableaux-${l}.png`)});
            await knScreens(page, cb);
            if (shots) await page.screenshot({path: path.join(shots, `i18n-presentation-${l}.png`)});
            assert.deepEqual(bad, {}, `textes français restés : ${JSON.stringify(bad, null, 1)}`);
            await page.context().close();
        });
        await t('allemand à 1440 px : la barre du haut des deux éditeurs tient sur une ligne (même hauteur qu’en français)', async () => {
            const h = {};
            for (const l of ['', 'de']) {
                const page = await open({lang: l}); await openBoard(page);
                const m = el => { const b = document.querySelector(el); const kids = [...b.children].filter(k => k.offsetParent); const tops = kids.map(k => Math.round(k.getBoundingClientRect().top)); return {h: Math.round(b.getBoundingClientRect().height), spread: Math.max(...tops) - Math.min(...tops), over: b.scrollWidth - b.clientWidth}; };
                h[`bd-${l || 'fr'}`] = await page.evaluate(`(${m})('.h-board .h-board-head')`);
                await openKn(page);
                h[`kn-${l || 'fr'}`] = await page.evaluate(`(${m})('${KN} .kn-top')`);
                if (shots) await page.screenshot({path: path.join(shots, `i18n-tableaux-topbar-${l || 'fr'}.png`), clip: {x: 0, y: 0, width: 1440, height: 140}});
                await page.context().close();
            }
            for (const e of ['bd', 'kn']) {
                assert.ok(h[`${e}-de`].h <= h[`${e}-fr`].h + 2, `hauteur : ${JSON.stringify(h)}`);
                assert.ok(h[`${e}-de`].spread <= h[`${e}-fr`].spread + 2 && h[`${e}-de`].over <= 1, `une seule ligne : ${JSON.stringify(h)}`);
            }
        });
        await t('allemand à 390 px : les éditeurs et leurs fenêtres ne débordent pas', async () => {
            const page = await open({lang: 'de', w: 390}), wide = [];
            await openBoard(page);
            const doc = () => page.evaluate(() => document.documentElement.scrollWidth);
            if (await doc() > 391) wide.push(`tableau (${await doc()})`);
            await page.evaluate(() => window.LCNDA_EXT.newBoard()); await page.waitForTimeout(500);
            const dw = await page.evaluate(() => { const d = document.querySelector('dialog[open]'); return d ? [Math.round(d.getBoundingClientRect().right), d.scrollWidth - d.clientWidth] : null; });
            if (dw && (dw[0] > 391 || dw[1] > 1)) wide.push(`nouveau tableau ${dw}`);
            await closeAll(page);
            await openKn(page);
            const kw = await page.evaluate(KN => { const d = document.querySelector(KN); return [d.scrollWidth - d.clientWidth, document.documentElement.scrollWidth]; }, KN);
            if (kw[0] > 1 || kw[1] > 391) wide.push(`présentation ${kw}`);
            assert.deepEqual(wide, []);
            await page.context().close();
        });
        await t('aucune erreur JavaScript', () => { assert.deepEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(`${failed ? '✗' : '✓'} traduction des tableaux : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
