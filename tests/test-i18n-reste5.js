'use strict';
/**
 * 🌐 Zone « reste5 » (dernier balayage) : Réglages → Apparence (textes venus d’app.js, app-fond.js, app-accord.js, app-premier.js,
 * app-colonne.js, app-designs.js…) et le Tableau de bord (morceaux collés, jeu « Trésors »). Traductions : assets/i18n/src/reste5.tsv
 * (et nord/reste5.tsv pour cs, sv, da).
 *     node tests/test-i18n-reste5.js            (port 20730)
 *     I18N_PROBE=de node tests/test-i18n-reste5.js   liste les textes français restés, écran par écran (sans rien vérifier)
 *  1. sans navigateur : reste5.tsv a 8 colonnes, pas de clé en double ni déjà ailleurs, chaque clé dans les 7 langues (mêmes variables) ;
 *  2. navigateur (Playwright) : en de, pl, en, les pages d’Apparence et le tableau de bord n’ont presque plus de français ; en français
 *     rien ne change ; aucune erreur JS.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
const REMAIN = require('../scripts/i18n-remaining.js');
const appRoot = path.resolve(__dirname, '..');
const LANGS = ['en', 'es', 'de', 'it', 'pt', 'pl', 'nl'];
const PROBE = process.env.I18N_PROBE || '';
const MAX_PER_SCREEN = Number(process.env.I18N_ALLOWED || 12);
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

(async () => {
    if (!PROBE) {
        const dicts = Object.fromEntries(LANGS.map(l => [l, JSON.parse(fs.readFileSync(path.join(appRoot, 'assets/i18n', `${l}.json`), 'utf8'))]));
        const tsv = fs.readFileSync(path.join(appRoot, 'assets/i18n/src/reste5.tsv'), 'utf8').split('\n');
        const own = new Set(tsv.filter(l => l && l[0] !== '#' && !l.startsWith('fr ¦')).map(l => l.split(/\t| ¦ /)[0]));
        await t('reste5.tsv : 8 colonnes, pas de clé en double ni déjà ailleurs', () => {
            const dir = path.join(appRoot, 'assets/i18n/src'), other = new Set();
            for (const f of fs.readdirSync(dir)) if (f.endsWith('.tsv') && f !== 'reste5.tsv') fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach(l => { if (l && l[0] !== '#') other.add(l.split(/\t| ¦ /)[0]); });
            const seen = new Set(), bad = [];
            tsv.forEach((l, i) => {
                if (!l || l[0] === '#' || l.startsWith('fr ¦')) return;
                const cells = l.split(/\t| ¦ /), k = cells[0];
                if (cells.length !== 8) bad.push(`ligne ${i + 1} : ${cells.length} colonnes`);
                if (seen.has(k)) bad.push(`« ${k} » en double`);
                if (other.has(k)) bad.push(`« ${k} » déjà dans un autre .tsv`);
                seen.add(k);
            });
            assert.deepEqual(bad, []);
        });
        await t('chaque clé de reste5.tsv est dans les 7 langues, mêmes variables', () => {
            const vars = s => (String(s).match(/\{[a-z_][a-z0-9_]*\}/gi) || []).sort().join(',');
            const miss = [];
            for (const id of own) for (const l of LANGS) {
                const k = id.replace(/^=/, ''), v = dicts[l][k];
                if (v == null) { miss.push(`[${l}] ${k}`); continue; }
                const one = typeof v === 'object' ? Object.values(v)[0] : v;
                if (vars(one) !== vars(k.replace(/^[a-z]+\|/, ''))) miss.push(`[${l}] variables : ${k}`);
            }
            assert.deepEqual(miss, []);
        });
    }

    /* ═════ 2. Navigateur ═════ */
    let pw = null; for (const m of ['playwright', '/opt/node22/lib/node_modules/playwright', '/opt/node-tools/node_modules/playwright']) { try { pw = require(m); break; } catch (_) {} }
    const phpPath = findPhp([devBundledPhp()]);
    if (!pw || !phpPath) { console.log('— Playwright ou PHP absent : navigateur sauté'); process.exit(failed ? 1 : 0); }
    const tmp = fs.mkdtempSync(path.join(process.env.I18N_TMP || os.tmpdir(), 'carnet-reste5-')); fs.mkdirSync(path.join(tmp, 'media'));
    const env = { ...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), path.join(__dirname, 'tresors-seed.php')], { cwd: appRoot, encoding: 'utf8', env });
    if (seed.status !== 0 || !/ok$/.test(seed.stdout)) throw new Error(seed.stderr || seed.stdout);
    const port = Number(process.env.I18N_PORT) || 20730, base = `http://127.0.0.1:${port}/`;
    const srv = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await pw.chromium.launch();
    const open = async (lang, width = 1440) => {
        const ctx = await browser.newContext({ viewport: { width, height: 900 } });
        await ctx.addInitScript(l => { try { if (l) localStorage.setItem('lcnda-langue', l); else localStorage.removeItem('lcnda-langue'); localStorage.setItem('genealogie-visite-guidee', JSON.stringify({ never: true, done: true })); } catch (_) {} }, lang);
        const page = await ctx.newPage(), errors = [];
        page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.dismiss());
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_APP?.state?.csrf, null, { timeout: 30000 }); await page.waitForTimeout(800);
        return { page, errors, ctx };
    };
    const texts = (page, sel) => page.evaluate(sel => {
        const out = new Set();
        document.querySelectorAll(sel).forEach(el => {
            const tw = document.createTreeWalker(el, 5); let n = el;
            do {
                if (n.nodeType === 1) { if (n.closest('[data-i18n-off], script, style, textarea, code, pre')) continue; ['title', 'placeholder', 'aria-label'].forEach(a => n.getAttribute(a) && out.add(n.getAttribute(a))); }
                else if (n.nodeType === 3 && !n.parentElement.closest('[data-i18n-off], script, style, textarea, code, pre, [data-person-id], .person-name')) { const s = n.nodeValue.replace(/\s+/g, ' ').trim(); if (s) out.add(s); }
            } while ((n = tw.nextNode()));
        });
        return [...out];
    }, sel);
    const settings = tab => async p => { await p.evaluate(async tab => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); const A = window.LCNDA_APP; A.state.maintenanceTab = tab; await A.setModule('maintenance'); }, tab); await p.waitForTimeout(1500); };
    const dashboard = async p => { await p.evaluate(async () => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); await window.LCNDA_APP.setModule('dashboard'); }); await p.waitForTimeout(2500); };
    const SCREENS = [['look_theme', settings('look_theme')], ['look_portraits', settings('look_portraits')], ['look_msgs', settings('look_msgs')],
        ['look_layouts', settings('look_layouts')], ['nav_menus', settings('nav_menus')], ['designs', settings('designs')], ['tableau de bord', dashboard]];
    const SAMPLE = /1922|1999|LEROY|Buttes-Chaumont|#3851|#1$|MARTIN|DURAND|FAURE|BORIE/; // fausses données des aperçus et de l’arbre d’essai
    try {
        if (PROBE) {
            const isFr = REMAIN.make(PROBE), { page, errors, ctx } = await open(PROBE);
            for (const [name, go] of SCREENS) { await go(page); const left = (await texts(page, '#workspace, #sidebar-content, #sidebar-footer')).filter(isFr); console.log(`\n══ ${name} (${left.length})`); left.forEach(s => console.log(s)); }
            console.log('\nerreurs JS :', errors); await ctx.close(); return;
        }
        await t('français : rien ne change, aucune erreur', async () => {
            const { page, errors, ctx } = await open('');
            await settings('look_theme')(page);
            assert.equal(await page.evaluate(() => document.documentElement.lang), 'fr');
            await dashboard(page);
            assert.ok((await page.locator('#workspace').innerText()).length > 50);
            assert.deepEqual(errors, []); await ctx.close();
        });
        for (const l of ['de', 'pl', 'en']) await t(`${l} : Apparence et tableau de bord presque sans français (au plus ${MAX_PER_SCREEN} par écran)`, async () => {
            const isFr = REMAIN.make(l), { page, errors, ctx } = await open(l), bad = {};
            for (const [name, go] of SCREENS) { await go(page); const left = (await texts(page, '#workspace, #sidebar-content, #sidebar-footer')).filter(isFr).filter(x => !SAMPLE.test(x)); if (left.length > MAX_PER_SCREEN) bad[name] = left; }
            assert.deepEqual(bad, {}); assert.deepEqual(errors, []); await ctx.close();
        });
    } finally { await browser.close(); srv.kill(); fs.rmSync(tmp, { recursive: true, force: true }); }
    process.exit(failed ? 1 : 0);
})();
