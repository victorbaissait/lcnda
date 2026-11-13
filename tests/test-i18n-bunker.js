'use strict';
/* 🌐 Traduction du ☢ bunker (jeu caché) : heritage-bunker-moteur.js (le moteur, aussi dans Node) et heritage-bunker.js (l'écran).
 * Mode d'emploi : docs/I18N.md.
 *     node tests/test-i18n-bunker.js                 (I18N_PORT=20611 par défaut ; I18N_PROBE=de liste les textes français restés)
 * 1. Node : fichiers de langue sans erreur (scripts/i18n-check.js) ; chaque i18n('…') et chaque mot de pluriel des deux fichiers a sa
 *    traduction dans les 7 langues ; dans Node (sans traduction), le moteur parle français mot pour mot ; avec le dictionnaire
 *    allemand, le journal d'une partie est en allemand, les noms des tables aussi (et de nouveau en français quand on revient au français).
 * 2. Navigateur (Playwright, sinon sauté) : en français rien ne change ; en de, pl et en, presque plus de français à chaque écran
 *    (accueil, onglets, visiteur à la trappe, lieu de la ville, région et convoi, journal d'un habitant, gazette, records, fin de partie) ;
 *    rien ne déborde à 390 px en allemand ; aucune erreur JS.
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
const FILES = ['heritage-bunker-moteur.js', 'heritage-bunker.js'].map(f => path.join(root, 'assets/js', f));
const ALLOWED = Number(process.env.I18N_ALLOWED || 4);
const freshMoteur = () => { delete require.cache[require.resolve('../assets/js/heritage-bunker-moteur.js')]; require('../assets/js/heritage-bunker-moteur.js'); return global.window.LCNDA_BUNKER; };

(async () => {
    /* ═════ 1. Node ═════ */
    await t('fichiers de langue sans erreur (scripts/i18n-check.js)', () => {
        const r = spawnSync(process.execPath, [path.join(root, 'scripts/i18n-check.js')], {encoding: 'utf8'});
        assert.equal(r.status, 0, r.stdout + r.stderr);
    });
    const X = require('../scripts/i18n-extract.js');
    const un = s => s.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    await t('chaque i18n(\'…\') et chaque mot de pluriel du bunker a sa traduction dans les 7 langues', () => {
        for (const l of LANGS) {
            const dict = X.loadDict(l), miss = [];
            for (const f of FILES) {
                const src = fs.readFileSync(f, 'utf8'); let m;
                const rx = /\bi18n\(\s*'((?:[^'\\]|\\.)*)'/g;
                while ((m = rx.exec(src))) { const s = un(m[1]); if (/\p{L}/u.test(s) && dict[s] == null) miss.push(`${path.basename(f)} ${s}`); }
                const rp = /\b(?:plural|nW)\([^,()]*(?:\([^()]*\)[^,()]*)*,\s*'((?:[^'\\]|\\.)*)'/g;
                while ((m = rp.exec(src))) { const s = un(m[1]); if (!dict[s] || typeof dict[s] !== 'object') miss.push(`${path.basename(f)} pluriel ${s}`); }
            }
            assert.deepEqual(miss, [], `${l} : ${miss.slice(0, 40).join('\n')}`);
        }
    });
    const opts = {seed: 7, me: {name: 'Jean Moi', pid: 1}, team: [{name: 'Marie', pid: 2}], city: {name: 'Rennes', size: 'moyenne'}};
    await t('dans Node, sans traduction, le moteur parle français (mot pour mot)', () => {
        global.window = {};
        const B = freshMoteur(), g = B.newGame(opts);
        const txt = g.log.map(l => l.txt).join('\n');
        assert.match(txt, /Jour 1\. La trappe se referme au-dessus de vous : 2 dans le bunker, à Rennes\./);
        assert.match(txt, /🏆 Pour gagner : tenir 30 jours\. \(On peut continuer ensuite\.\)/);
        assert.equal(B.ITEMS.lit.name, 'Lit');
        assert.equal(B.missionTxt({doc: 'naissance', name: 'Anne B', by: 1709, bplace: 'Quimper'}), 'Retrouver l’acte de naissance de Anne B (né·e en 1709 à Quimper)');
        assert.equal(B.orderBuild(g, 'lit', 0, 0).err, 'Cette place est prise.');
    });
    await t('avec le dictionnaire allemand : journal et tables en allemand, puis de nouveau en français', () => {
        const I = require('../assets/js/app-i18n.js');
        I.provide('de', JSON.parse(fs.readFileSync(path.join(root, 'assets/i18n/de.json'), 'utf8')));
        I.setLang('de', {persist: false, silent: true});
        global.window = {LCNDA_I18N: I};
        const B = freshMoteur(), g = B.newGame(opts);
        const txt = g.log.map(l => l.txt).join('\n');
        assert.match(txt, /Luke/); assert.doesNotMatch(txt, /La trappe se referme/);
        assert.equal(B.ITEMS.lit.name, I.t('Lit', {ctx: 'bunker'})); assert.notEqual(B.ITEMS.lit.name, 'Lit');
        assert.match(B.orderBuild(g, 'lit', 0, 0).err, /Platz/);
        I.setLang('fr', {persist: false, silent: true});
        assert.equal(B.ITEMS.lit.name, 'Lit', 'retour au français : les tables suivent');
        global.window = {};
    });

    /* ═════ 2. Navigateur ═════ */
    const phpPath = findPhp([devBundledPhp()]);
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); console.log(`${failed ? '✗' : '✓'} traduction du bunker : ${count} vérifications`); process.exit(failed ? 1 : 0); }
    const R = require('../scripts/i18n-remaining.js');
    const tmp = fs.mkdtempSync(path.join(process.env.I18N_TMP || os.tmpdir(), 'carnet-i18n-bunker-'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Joseph','Martin','male','deceased')"); $p = null;
require 'lib/bootstrap.php'; db(); echo 'ok';`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = Number(process.env.I18N_PORT) || 20611;
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch();
    const errs = [];
    const open = async ({w = 1440, lang = ''} = {}) => {
        const ctx = await browser.newContext({viewport: {width: w, height: 900}});
        await ctx.addInitScript(l => { let s = 42; Math.random = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; // une partie toujours pareille
            try { if (!sessionStorage.getItem('i18n-test-set')) { if (l) localStorage.setItem('lcnda-langue', l); else localStorage.removeItem('lcnda-langue'); localStorage.removeItem('lcnda-bunker'); sessionStorage.setItem('i18n-test-set', '1'); } localStorage.setItem('genealogie-visite-guidee', JSON.stringify({never: true, done: true})); } catch (_) {} }, lang);
        const page = await ctx.newPage(); const tag = `${lang || 'fr'} ${w}px`;
        page.on('pageerror', e => errs.push(`${tag} : ${e.message}`)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|tile\.openstreetmap|nominatim/.test(m.text())) errs.push(`${tag} console : ${m.text()}`); }); page.on('dialog', d => d.dismiss());
        await page.goto(base, {waitUntil: 'load'});
        await page.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.openBunker && window.LCNDA_BUNKER, null, {timeout: 30000});
        await page.waitForTimeout(800);
        return page;
    };
    const settle = (page, ms = 350) => page.waitForTimeout(ms);
    const SKIP = '[data-i18n-off], script, style, textarea, input, .pk-chip, .bk-pawn, .bk-name, .bk-rlab';
    // les textes du bunker (nœuds de texte, title, aria-label, placeholder, options) — sans les noms (habitants, lieux, ville)
    const texts = page => page.evaluate(skip => {
        const d = document.querySelector('dialog.bk-dlg'); if (!d) return null;
        const out = new Set(), tw = document.createTreeWalker(d, 5); let n = d;
        do {
            if (n.nodeType === 1) { if (n.closest(skip)) continue; ['title', 'placeholder', 'aria-label'].forEach(a => n.getAttribute(a) && out.add(n.getAttribute(a))); if (n.tagName === 'OPTGROUP') out.add(n.label); }
            else if (n.nodeType === 3 && !n.parentElement.closest(skip)) { const s = n.nodeValue.replace(/\s+/g, ' ').trim(); if (s) out.add(s); }
        } while ((n = tw.nextNode()));
        const G = window.LCNDA_EXT.bunkerDebug.game(), names = G ? [...G.people.map(p => p.name), ...G.city.places.map(p => p.name), G.city.name, ...(G.region?.nodes || []).map(x => x.name), ...(G.groups || []).map(x => x.name)] : [];
        return [...out].filter(s => !names.some(nm => nm && s.includes(nm)));
    }, SKIP);
    const startGame = page => page.evaluate(async () => {
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        window.LCNDA_EXT.openBunker();
        for (let i = 0; i < 50 && !document.querySelector('[data-bk-new]'); i++) await new Promise(r => setTimeout(r, 100));
        await new Promise(r => setTimeout(r, 1200));
    });
    const play = page => page.evaluate(async () => {
        const f = document.querySelector('[data-bk-new]'); f.elements.bk_scen.value = 'h1910'; f.elements.bk_scen.dispatchEvent(new Event('change'));
        ['bk_tuto', 'bk_feu', 'bk_age', 'bk_chaines', 'bk_nuit'].forEach(k => { if (f.elements[k]) f.elements[k].checked = true; }); f.requestSubmit();
        for (let i = 0; i < 100 && !window.LCNDA_EXT.bunkerDebug.game(); i++) await new Promise(r => setTimeout(r, 100));
        const G = window.LCNDA_EXT.bunkerDebug.game(), B = window.LCNDA_BUNKER; G.speed = 0;
        B.RES_KEYS.forEach(r => { G.res[r] = 20; }); B.run(G, 1440 * 3); G.speed = 0;
        G.visit = {k: 'marchand', until: G.t + 120, give: {r: 'eau', n: 5}, want: {r: 'bois', n: 3}};
        window.LCNDA_EXT.bunkerDebug.redraw();
    });
    const click = (page, sel) => page.evaluate(sel => { const b = document.querySelector(`dialog.bk-dlg ${sel}`); if (b) b.dispatchEvent(new MouseEvent('click', {bubbles: true})); return !!b; }, sel);
    const TABS = ['gens', 'res', 'atelier', 'bric', 'ville', 'region', 'famille', 'radio', 'stats', 'regl'];
    const screens = async page => {
        const out = {};
        await startGame(page); out['accueil'] = await texts(page);
        await play(page); await settle(page, 600);
        for (const tb of TABS) { await click(page, `[data-bk="tab"][data-v="${tb}"]`); await settle(page); out[`onglet ${tb}`] = await texts(page); }
        await click(page, '[data-bk="tab"][data-v="ville"]'); await settle(page); await click(page, '[data-bk="place"]'); await settle(page); out['lieu de la ville'] = await texts(page);
        await click(page, '[data-bk="tab"][data-v="region"]'); await settle(page);
        await page.evaluate(() => { const G = window.LCNDA_EXT.bunkerDebug.game(); (G.region?.nodes || []).forEach(n => { n.seen = true; }); window.LCNDA_EXT.bunkerDebug.redraw(); });
        await settle(page); await click(page, '[data-bk="rnode"]:not(.is-home)'); await settle(page); await click(page, '[data-bk="cform"]'); await settle(page); out['région et convoi'] = await texts(page);
        await click(page, '[data-bk="tab"][data-v="gens"]'); await settle(page); await click(page, '[data-bk="diary"][data-id]'); await settle(page); out['journal d’un habitant'] = await texts(page);
        await click(page, '[data-bk="gazette"]'); await settle(page, 600); out['gazette'] = await texts(page); await click(page, '[data-bk="gzclose"]');
        await page.evaluate(() => { const G = window.LCNDA_EXT.bunkerDebug.game(); G.people.forEach(p => { p.hp = 0; }); window.LCNDA_BUNKER.step(G); window.LCNDA_EXT.bunkerDebug.redraw(); });
        await settle(page); out['fin de partie'] = await texts(page);
        await click(page, '[data-bk="records"]'); await settle(page, 600); out['records'] = await texts(page);
        return out;
    };
    try {
        if (PROBE) {
            const isFr = R.make(PROBE), page = await open({lang: PROBE});
            for (const [k, v] of Object.entries(await screens(page))) { const left = (v || []).filter(isFr); console.log(`\n══ ${k} (${left.length})`); left.forEach(s => console.log(s)); }
            console.log('\nerreurs JS :', errs);
            return;
        }
        await t('en français, rien ne change : pas de bandeau, html lang="fr", le bunker en français', async () => {
            const page = await open();
            await startGame(page);
            const r = await page.evaluate(() => ({lang: document.documentElement.lang, banner: !!document.getElementById('lc-i18n-banner'), head: document.querySelector('.bk-start-head h2')?.textContent, eyebrow: document.querySelector('.bk-start-head .eyebrow')?.textContent}));
            assert.equal(r.lang, 'fr'); assert.equal(r.banner, false); assert.equal(r.head, 'Le bunker'); assert.equal(r.eyebrow, '☢ TU AS TROUVÉ LA TRAPPE');
            await play(page); await settle(page);
            const g = await page.evaluate(() => ({log: window.LCNDA_EXT.bunkerDebug.game().log.map(l => l.txt).join('\n'), tabs: [...document.querySelectorAll('dialog.bk-dlg [data-bk="tab"]')].map(b => b.textContent), visit: document.querySelector('[data-bk-visit]')?.textContent}));
            assert.match(g.log, /📜 .* : .*de l’époque pour compléter le groupe\./); assert.match(g.log, /🏆 Pour gagner : tenir 14 jours\./);
            assert.deepEqual(g.tabs.slice(0, 3), ['👥 Habitants', '📦 Réserves', '🛠️ Atelier']);
            assert.match(g.visit, /Un marchand propose 💧 5 eau potable contre 🪵 3 bois\./);
            await page.context().close();
        });
        for (const l of ['de', 'pl', 'en']) await t(`${l} : chaque écran du bunker est traduit (au plus ${ALLOWED} textes français chacun)`, async () => {
            const isFr = R.make(l), page = await open({lang: l}), bad = {};
            for (const [k, v] of Object.entries(await screens(page))) { if (!v) { bad[`${k} (vide)`] = []; continue; } const left = v.filter(isFr); if (left.length > ALLOWED) bad[k] = left; }
            assert.deepEqual(bad, {}, JSON.stringify(bad, null, 1));
            const log = await page.evaluate(() => window.LCNDA_EXT.bunkerDebug.game().log.slice(0, 40).map(l => l.txt));
            const frLog = log.filter(isFr); assert.ok(frLog.length <= 2, `journal encore en français : ${frLog.join(' | ')}`);
            await page.context().close();
        });
        await t('de à 390 px : rien ne déborde de l’écran', async () => {
            const page = await open({w: 390, lang: 'de'});
            await startGame(page);
            const check = () => page.evaluate(() => { const d = document.querySelector('dialog.bk-dlg'), r = d.getBoundingClientRect(); return {page: document.documentElement.scrollWidth, dlg: Math.round(r.right), w: innerWidth}; });
            let r = await check(); assert.ok(r.page <= r.w + 1 && r.dlg <= r.w + 1, `accueil : ${JSON.stringify(r)}`);
            await play(page); await settle(page, 600);
            for (const tb of TABS) { await click(page, `[data-bk="tab"][data-v="${tb}"]`); await settle(page, 250); r = await check(); assert.ok(r.page <= r.w + 1 && r.dlg <= r.w + 1, `${tb} : ${JSON.stringify(r)}`); }
            await page.context().close();
        });
        await t('aucune erreur JS', () => { assert.deepEqual(errs, []); });
    } finally {
        await browser.close();
        proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(`${failed ? '✗' : '✓'} traduction du bunker : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
