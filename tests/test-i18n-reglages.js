'use strict';
/* 🌐 Traduction de la zone « Réglages » (vague 2) : les pages des Réglages et l'écran du mode simple. Mode d'emploi : docs/I18N.md.
 *     node tests/test-i18n-reglages.js              (I18N_SHOTS=dossier pour garder des captures, I18N_PORT=20430 par défaut)
 *     I18N_PROBE=de node tests/test-i18n-reglages.js   liste les textes français restés à l'écran, page par page (sans rien vérifier)
 * 1. Node : les fichiers de langue sont complets (scripts/i18n-check.js), les textes t() des fichiers de la zone sont tous traduits.
 * 2. Navigateur (Playwright, sinon sauté) : en français rien ne change ; en de, pl et en, presque plus de français dans chaque page
 *    des Réglages de la zone (Apparence, Designs au choix, Accessibilité, Contrôle de la base, Entretien, Sauvegarde,
 *    Travail à deux, Raccourcis…) ni dans le mode simple ; allemand à 390 px sans débordement ; aucune erreur JS.
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
const ZONE_FILES = ['app-maintenance.js', 'app-mode-simple.js', 'app-designs.js', 'app-apparence.js', 'app-colonne.js', 'app-portraits.js', 'heritage-controle.js', 'heritage-editorkeys.js',
    'app-access.js', 'heritage-sauvegarde.js', 'app-mises-a-jour.js', 'app-sidegroups.js', 'heritage-lightbox-layout.js'].map(f => path.join(root, 'assets/js', f));
// les pages des Réglages de la zone (clé de state.maintenanceTab)
const PAGES = ['look_theme', 'look_portraits', 'look_msgs', 'look_layouts', 'nav_menus', 'designs', 'accessibilite', 'accessibilite#simple', 'controle', 'controle_seuils', 'entretien', 'sauvegarde', 'sync',
    'raccourcis', 'mises_a_jour', 'viewer_prefs', 'duplicates', 'branches', 'changes', 'labels', 'event_types', 'calendar_measures', 'infos', 'safety'];
// au plus ce nombre de textes français par page (ce qui vient d'app.js, pas encore traduit, et quelques mots rares)
const ALLOWED = Number(process.env.I18N_ALLOWED || 12);

(async () => {
    /* ═════ 1. Node ═════ */
    await t('fichiers de langue complets et à jour (scripts/i18n-check.js)', () => {
        const r = spawnSync(process.execPath, [path.join(root, 'scripts/i18n-check.js')], {encoding: 'utf8'});
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.ok(fs.existsSync(path.join(root, 'assets/i18n/src/reglages2.tsv')));
    });
    await t('les textes passés à i18n() dans les fichiers de la zone sont traduits dans les 7 langues', () => {
        const X = require('../scripts/i18n-extract.js');
        for (const l of ['en', 'es', 'de', 'it', 'pt', 'pl', 'nl']) {
            const dict = X.loadDict(l), miss = [];
            for (const f of ZONE_FILES) X.tCalls(f).forEach(x => { if (!X.translated(dict, x.text, x.ctx)) miss.push(`${path.basename(f)}:${x.line} ${x.text}`); });
            assert.deepEqual(miss, [], `${l} : ${miss.join('\n')}`);
        }
    });
    await t('le français ne change pas : i18n() rend le texte tel quel', () => {
        const I = require('../assets/js/app-i18n.js');
        I.setLang('fr', {persist: false});
        assert.equal(I.t('Forme « {name} » supprimée', {name: 'Cœur'}), 'Forme « Cœur » supprimée');
        I.setLang('de', {persist: false});
        assert.notEqual(I.t('Forme « {name} » supprimée', {name: 'Cœur'}), 'Forme « Cœur » supprimée');
        I.setLang('fr', {persist: false});
    });

    /* ═════ 2. Navigateur ═════ */
    const phpPath = findPhp([devBundledPhp()]);
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); console.log(`${failed ? '✗' : '✓'} traduction des Réglages : ${count} vérifications`); process.exit(failed ? 1 : 0); }
    const R = require('../scripts/i18n-remaining.js');
    // les textes des fichiers de la zone (ceux d'app.js et des autres zones sont seulement comptés et affichés)
    const X = require('../scripts/i18n-extract.js');
    const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
    const BANK = new Set(); ZONE_FILES.forEach(f => X.textsOfFile(f).forEach(x => BANK.add(norm(x.text))));
    const SAMPLE = /1922|1999|LEROY|Buttes-Chaumont|#3851|#1$/; // les exemples des aperçus (fausses données)
    const ofZone = s => { const c = norm(s).replace(/^Aide : /, '').replace(/^· /, ''); return BANK.has(c) && !SAMPLE.test(c); };
    const others = {};
    const shots = process.env.I18N_SHOTS || '';
    const tmp = fs.mkdtempSync(path.join(process.env.I18N_TMP || os.tmpdir(), 'carnet-i18n-reglages-'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Joseph','Martin','male','deceased'),('Marie','Durand','female','living'),('Louis','Martin','male','deceased'),('Louis','Martin','male','deceased')"); $p = null;
require 'lib/bootstrap.php'; db(); echo 'ok';`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = Number(process.env.I18N_PORT) || 20430;
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch();
    const errs = [];
    const watch = (page, tag) => { page.on('pageerror', e => errs.push(`${tag} : ${e.message}`)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(`${tag} console : ${m.text()}`); }); page.on('dialog', d => d.dismiss()); };
    const open = async ({w = 1440, lang = ''} = {}) => {
        const ctx = await browser.newContext({viewport: {width: w, height: 900}});
        await ctx.addInitScript(l => { try { if (!sessionStorage.getItem('i18n-test-set')) { if (l) localStorage.setItem('lcnda-langue', l); else localStorage.removeItem('lcnda-langue'); sessionStorage.setItem('i18n-test-set', '1'); } localStorage.setItem('genealogie-visite-guidee', JSON.stringify({never: true, done: true})); localStorage.setItem('lcnda-mode-simple-open', JSON.stringify({who: 1, colors: 1, sizes: 1, font: 1, voice: 1, show: 1, slides: 1, exit: 1, entry: 1, access: 1})); } catch (_) {} }, lang);
        const page = await ctx.newPage(); watch(page, `${lang || 'fr'} ${w}px`);
        await page.goto(base, {waitUntil: 'load'}); await page.waitForTimeout(1500);
        return page;
    };
    const goPage = (page, id) => page.evaluate(async id => { const A = window.LCNDA_APP; document.querySelectorAll('dialog[open]').forEach(d => d.close()); const [tab, sub] = id.split('#'); try { sessionStorage.setItem('lcnda-a11y-tab', sub || 'general'); } catch (_) {} A.state.maintenanceTab = tab; await A.setModule('maintenance'); }, id);
    // tous les textes de la page (#workspace + colonne de gauche), hors données et champs de saisie
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
    const openSimple = page => page.evaluate(async () => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); const M = window.LCNDA_EXT.modeSimple; if (M.isOpen()) M.close(); M.write({...M.settings(), who: false}); M.open(); await new Promise(r => setTimeout(r, 900)); });
    const SIMPLE = ['home', 'tree', 'people', 'day'];
    const simpleGo = (page, to) => page.evaluate(async to => { const b = document.querySelector(`#ms-root [data-to=${to}]`); if (b) b.click(); await new Promise(r => setTimeout(r, 700)); }, to);
    try {
        if (PROBE) {
            const isFr = R.make(PROBE), page = await open({lang: PROBE}), all = {};
            for (const id of (process.env.I18N_PAGES ? process.env.I18N_PAGES.split(',') : PAGES)) {
                try { await goPage(page, id); await page.waitForTimeout(1400); } catch (e) { console.log('!', id, e.message); continue; }
                const left = (await texts(page, '#workspace, #sidebar-content, #sidebar-footer')).filter(isFr);
                console.log(`\n══ ${id} (${left.length})`); left.forEach(s => console.log(s)); all[id] = left;
            }
            if (!process.env.I18N_PAGES) for (const s of SIMPLE) { await openSimple(page); if (s !== 'home') await simpleGo(page, s); const left = (await texts(page, '#ms-root')).filter(isFr); console.log(`\n══ mode simple ${s} (${left.length})`); left.forEach(x => console.log(x)); }
            console.log('\nerreurs JS :', errs);
            return;
        }
        await t('en français, rien ne change : pas de bandeau, html lang="fr", titres des Réglages en français', async () => {
            const page = await open();
            await goPage(page, 'look_theme'); await page.waitForTimeout(1200);
            const r = await page.evaluate(() => ({lang: document.documentElement.lang, banner: !!document.getElementById('lc-i18n-banner'), side: document.querySelector('#sidebar-content').innerText}));
            assert.equal(r.lang, 'fr'); assert.equal(r.banner, false); assert.ok(/Thème et couleurs/.test(r.side), r.side.slice(0, 200));
            await goPage(page, 'controle'); await page.waitForTimeout(1200);
            assert.ok(/Contrôle de la base/.test(await page.locator('#workspace').innerText()));
            await openSimple(page);
            assert.ok(/Bonjour|L’arbre|Qui regarde/.test(await page.locator('#ms-root').innerText()));
            await page.context().close();
        });
        for (const l of ['de', 'pl', 'en']) await t(`${l} : les pages des Réglages et le mode simple sont traduits (au plus ${ALLOWED} textes français par page)`, async () => {
            const isFr = R.make(l), page = await open({lang: l}), bad = {};
            for (const id of PAGES) {
                await goPage(page, id); await page.waitForTimeout(1300);
                const all = (await texts(page, '#workspace, #sidebar-content, #sidebar-footer')).filter(isFr), left = all.filter(ofZone);
                if (left.length > ALLOWED) bad[id] = left;
                if (all.length > left.length) others[`${l} ${id}`] = all.length - left.length;
                if (shots) await page.screenshot({path: path.join(shots, `i18n-reglages-${l}-${id}.png`), fullPage: false});
            }
            for (const s of SIMPLE) {
                await openSimple(page); if (s !== 'home') await simpleGo(page, s);
                const left = (await texts(page, '#ms-root')).filter(isFr).filter(x => !SAMPLE.test(x));
                if (left.length > 3) bad['mode simple ' + s] = left;
                if (shots) await page.screenshot({path: path.join(shots, `i18n-reglages-${l}-simple-${s}.png`)});
            }
            await page.evaluate(() => window.LCNDA_EXT.modeSimple.close());
            if (l === 'de') console.log('  (textes français venus d’autres fichiers, app.js surtout :', JSON.stringify(Object.fromEntries(Object.entries(others).filter(([k]) => k.startsWith('de ')))), ')');
            assert.deepEqual(bad, {}, `textes français restés : ${JSON.stringify(bad, null, 1)}`);
            await page.context().close();
        });
        await t('allemand à 390 px : les pages des Réglages ne débordent pas', async () => {
            const page = await open({lang: 'de', w: 390}), wide = [];
            for (const id of PAGES) {
                await goPage(page, id); await page.waitForTimeout(1100);
                const r = await page.evaluate(() => ({sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth}));
                if (r.sw > 391 || r.bw > 391) wide.push(`${id} (${Math.max(r.sw, r.bw)} px)`);
            }
            await openSimple(page);
            const r = await page.evaluate(() => document.documentElement.scrollWidth);
            if (r > 391) wide.push(`mode simple (${r} px)`);
            await page.evaluate(() => window.LCNDA_EXT.modeSimple.close());
            assert.deepEqual(wide, []);
            await page.context().close();
        });
        await t('aucune erreur JavaScript', () => { assert.deepEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(`${failed ? '✗' : '✓'} traduction des Réglages : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
