'use strict';
/* 🌐 Traduction de la zone « traitement-texte » (vague 4, les éditeurs) : 📝 Traitement de texte (heritage-traitement-texte*.js)
 * et les messages affichés de son moteur (app-texte-engine.js, app-texte-formats.js). Mode d'emploi : docs/I18N.md.
 *     node tests/test-i18n-traitement-texte.js          (I18N_SHOTS=dossier pour garder des captures, I18N_PORT=20520 par défaut)
 *     I18N_PROBE=de node tests/test-i18n-traitement-texte.js   liste les textes français restés dans l'éditeur et ses fenêtres
 * 1. Node : fichiers de langue complets (scripts/i18n-check.js) ; les textes i18n() des fichiers de la zone sont traduits dans
 *    les 7 langues ; le moteur reste en français dans Node (messages d'erreur, noms de styles enregistrés inchangés).
 * 2. Navigateur (Playwright, sinon sauté) : en français rien ne change ; en de, pl et en, presque plus de français dans l'éditeur
 *    (barre du haut, menus, ruban, colonne d'outils, panneau de droite, barre du bas) et dans ses fenêtres ; la barre du haut
 *    tient sur une ligne en allemand à 1440 px ; allemand à 390 px sans débordement de la page ; le texte du document jamais
 *    retouché ; aucune erreur JS.
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
const ZONE_FILES = ['heritage-traitement-texte.js', 'heritage-traitement-texte-cmd.js', 'heritage-traitement-texte-fichiers.js', 'heritage-traitement-texte-fusion.js',
    'heritage-traitement-texte-onglets.js', 'heritage-traitement-texte-outils.js', 'heritage-traitement-texte-relecture.js', 'app-texte-engine.js', 'app-texte-formats.js'].map(f => path.join(root, 'assets/js', f));
// au plus ce nombre de textes français par écran (noms propres de polices, textes d'autres zones, quelques mots rares)
const ALLOWED = Number(process.env.I18N_ALLOWED || 6);
// les fenêtres de l'éditeur ouvertes une à une (commande de menu → fenêtre)
const DIALOGS = ['paragraph', 'border', 'table', 'link', 'chars', 'columns', 'headfoot', 'words', 'lang', 'newstyle', 'styleset', 'tabs', 'settings', 'template', 'mailmerge', 'sectionbreak', 'cite'];

(async () => {
    /* ═════ 1. Node ═════ */
    await t('fichiers de langue complets et à jour (scripts/i18n-check.js)', () => {
        const r = spawnSync(process.execPath, [path.join(root, 'scripts/i18n-check.js')], {encoding: 'utf8'});
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.ok(fs.existsSync(path.join(root, 'assets/i18n/src/traitement-texte.tsv')));
    });
    await t('les textes passés à i18n() / tr() dans les fichiers de la zone sont traduits dans les 7 langues', () => {
        const X = require('../scripts/i18n-extract.js');
        for (const l of ['en', 'es', 'de', 'it', 'pt', 'pl', 'nl']) {
            const dict = X.loadDict(l), miss = [];
            for (const f of ZONE_FILES) X.tCalls(f).forEach(x => { if (!X.translated(dict, x.text, x.ctx)) miss.push(`${path.basename(f)}:${x.line} ${x.text}`); });
            assert.deepEqual(miss, [], `${l} : ${miss.join('\n')}`);
        }
    });
    await t('le moteur dans Node : messages et noms de styles en français, nom enregistré inchangé', async () => {
        const T = require('../assets/js/app-texte-engine.js'); require('../assets/js/app-texte-formats.js');
        const h1 = T.BASE_STYLES.find(s => s.id === 'h1');
        assert.equal(T.styleLabel(h1), 'Titre 1');
        assert.equal(T.styleLabel({...h1, name: 'Mon titre'}), 'Mon titre');
        assert.equal(T.setLabel(T.STYLE_SETS[0]), 'Classique');
        await assert.rejects(() => T.readFile('vieux.doc', new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]).buffer), /les anciens fichiers Word \(\.doc\) ne se lisent pas/);
    });
    /* ═════ 2. Navigateur ═════ */
    const phpPath = findPhp([devBundledPhp()]);
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); console.log(`${failed ? '✗' : '✓'} traduction du traitement de texte : ${count} vérifications`); process.exit(failed ? 1 : 0); }
    const R = require('../scripts/i18n-remaining.js');
    const shots = process.env.I18N_SHOTS || '';
    const tmp = fs.mkdtempSync(path.join(process.env.I18N_TMP || os.tmpdir(), 'carnet-i18n-texte-'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Joseph','Martin','male','deceased'),('Marie','Durand','female','living')"); $p = null;
require 'lib/bootstrap.php'; db(); echo 'ok';`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = Number(process.env.I18N_PORT) || 20520;
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
        await page.goto(base, {waitUntil: 'load'}); await page.waitForTimeout(1500);
        return page;
    };
    // un document avec un peu de tout (le texte de la personne : jamais traduit)
    const openEditor = page => page.evaluate(async () => {
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        const html = '<h1 data-st="h1">Le moulin de Tulle</h1><p data-st="normal">Joseph Martin, né en 1850, meunier. Les registres de la paroisse.</p><table class="wp-table"><tbody><tr><td>Nom</td><td>Martin</td></tr></tbody></table>';
        const ed = await window.LCNDA_EXT.openTextDoc({name: 'Le moulin', data: {sections: [{html}], comments: []}});
        await new Promise(r => setTimeout(r, 900));
        ed.showPanel('format'); await new Promise(r => setTimeout(r, 200));
        return !!ed;
    });
    // les textes de l'éditeur (hors texte du document, hors données), ou d'une fenêtre par-dessus
    const textsOf = (page, sel) => page.evaluate(sel => {
        const el = sel === 'top' ? [...document.querySelectorAll('dialog[open]')].pop() : document.querySelector(sel); if (!el) return null;
        const out = new Set(); const tw = document.createTreeWalker(el, 5); let n = el;
        const skip = '[data-i18n-off], script, style, textarea, code, pre, select[data-wp-style], .wp-body, .wp-sheets, .wp-doc, [contenteditable="true"], .wp-hf-edit, .wp-fontbtn, [data-wp-name], .wp-tab';
        do {
            if (n.nodeType === 1) { if (n.closest(skip)) continue; ['title', 'placeholder', 'aria-label'].forEach(a => n.getAttribute(a) && out.add(n.getAttribute(a))); }
            else if (n.nodeType === 3 && !n.parentElement.closest(skip)) { const s = n.nodeValue.replace(/\s+/g, ' ').trim(); if (s) out.add(s); }
        } while ((n = tw.nextNode()));
        return [...out];
    }, sel);
    // une fenêtre de l'éditeur : la commande, puis les textes de la fenêtre du dessus, puis on la ferme
    const dialogTexts = async (page, cmd) => {
        await page.evaluate(async cmd => { const k = window.LCNDA_EXT.textDocKit, ed = k.current; ed.focusEnd?.(false); ed.run(cmd); await new Promise(r => setTimeout(r, 700)); }, cmd);
        const n = await page.evaluate(() => document.querySelectorAll('dialog[open]').length);
        const list = n > 1 ? await textsOf(page, 'top') : null;
        await page.evaluate(() => { const ds = [...document.querySelectorAll('dialog[open]')]; if (ds.length > 1) { const d = ds.pop(); d.close(); d.remove?.(); } document.querySelectorAll('.ui-menu, .ctx-menu, [data-ui-menu]').forEach(x => x.remove()); });
        return list;
    };
    const panels = async page => {
        const all = [];
        for (const tab of ['format', 'comments', 'changes', 'check']) {
            await page.evaluate(tab => { const ed = window.LCNDA_EXT.textDocKit.current; ed.showPanel(tab); if (tab === 'format') ed.$$('.wp-panel details').forEach(d => { d.open = true; }); }, tab);
            await page.waitForTimeout(150); all.push(...(await textsOf(page, '.wp-dlg .wp-panel')) || []);
        }
        await page.evaluate(() => { const ed = window.LCNDA_EXT.textDocKit.current; ed.run('find'); ed.toggleNav('heads'); }); await page.waitForTimeout(250);
        all.push(...(await textsOf(page, '.wp-dlg [data-wp-findbar]')) || [], ...(await textsOf(page, '.wp-dlg .wp-side')) || []);
        await page.evaluate(() => { const ed = window.LCNDA_EXT.textDocKit.current; ed.run('findclose'); ed.showPanel('format'); });
        return [...new Set(all)];
    };
    try {
        if (PROBE) {
            const isFr = R.make(PROBE), page = await open({lang: PROBE});
            await openEditor(page);
            const ed = (await textsOf(page, '.wp-dlg')).filter(isFr); console.log(`\n══ éditeur (${ed.length})`); ed.forEach(s => console.log(s));
            const pn = (await panels(page)).filter(isFr); console.log(`\n══ panneaux (${pn.length})`); pn.forEach(s => console.log(s));
            for (const c of DIALOGS) { const l = await dialogTexts(page, c); if (!l) { console.log(`\n── ${c} : pas de fenêtre`); continue; } const left = l.filter(isFr); console.log(`\n── ${c} (${left.length})`); left.forEach(s => console.log(s)); }
            console.log('\nerreurs JS :', errs);
            return;
        }
        await t('en français, rien ne change : menus, ruban et colonne d’outils en français, pas de bandeau', async () => {
            const page = await open();
            await openEditor(page);
            const r = await page.evaluate(() => ({lang: document.documentElement.lang, banner: !!document.getElementById('lc-i18n-banner'),
                menus: [...document.querySelectorAll('.wp-dlg details.wp-menu > summary')].map(s => s.textContent.trim()),
                bold: document.querySelector('.wp-dlg .wp-tools [data-wp-cmd="bold"]')?.title, rail: document.querySelector('.wp-dlg .wp-rail [data-wp-cmd="find"]')?.title,
                style: [...document.querySelectorAll('.wp-dlg [data-wp-style] option')].map(o => o.textContent).slice(0, 3)}));
            assert.equal(r.lang, 'fr'); assert.equal(r.banner, false);
            assert.deepEqual(r.menus.slice(0, 7), ['Fichier', 'Édition', 'Affichage', 'Insertion', 'Format', 'Outils', 'Tableau']);
            assert.equal(r.bold, 'Gras'); assert.equal(r.rail, 'Rechercher et remplacer');
            assert.ok(r.style.includes('Normal') && r.style.includes('Titre du document'), r.style.join(', '));
            await page.context().close();
        });
        for (const l of ['de', 'pl', 'en']) await t(`${l} : l’éditeur, ses panneaux et ses fenêtres sont traduits (au plus ${ALLOWED} textes français par écran)`, async () => {
            const isFr = R.make(l), page = await open({lang: l}), bad = {};
            await openEditor(page);
            const ed = (await textsOf(page, '.wp-dlg')).filter(isFr); if (ed.length > ALLOWED) bad['éditeur'] = ed;
            const pn = (await panels(page)).filter(isFr); if (pn.length > ALLOWED) bad.panneaux = pn;
            for (const c of DIALOGS) { const list = await dialogTexts(page, c); if (!list) continue; const left = list.filter(isFr); if (left.length > ALLOWED) bad[c] = left; }
            // le texte du document n'est jamais retouché
            const doc = await page.evaluate(() => document.querySelector('.wp-dlg .wp-body').textContent);
            assert.ok(/Le moulin de Tulle/.test(doc) && /Les registres de la paroisse/.test(doc), doc);
            const menus = await page.evaluate(() => [...document.querySelectorAll('.wp-dlg details.wp-menu > summary')].map(s => s.textContent.trim()));
            assert.notEqual(menus[0], 'Fichier', menus.join(', '));
            if (shots) await page.screenshot({path: path.join(shots, `i18n-texte-${l}.png`)});
            assert.deepEqual(bad, {}, `textes français restés : ${JSON.stringify(bad, null, 1)}`);
            await page.context().close();
        });
        await t('allemand à 1440 px : la barre du haut tient sur une ligne', async () => {
            const page = await open({lang: 'de'});
            await openEditor(page);
            const r = await page.evaluate(() => {
                const bar = document.querySelector('.wp-dlg .ui-topbar'); const kids = [...bar.querySelectorAll(':scope > *')].filter(x => x.offsetParent && x.getBoundingClientRect().width > 0);
                // une seule ligne : les milieux de tous les éléments de la barre à la même hauteur, rien de coupé ni de caché à droite
                const mids = kids.map(x => { const r = x.getBoundingClientRect(); return Math.round(r.top + r.height / 2); }), h = bar.getBoundingClientRect().height;
                return {h, spread: Math.max(...mids) - Math.min(...mids), sw: bar.scrollWidth, cw: bar.clientWidth, menus: document.querySelector('.wp-dlg .wp-menus')?.getBoundingClientRect().height || 0};
            });
            if (shots) await page.screenshot({path: path.join(shots, 'i18n-texte-de-1440.png')});
            assert.ok(r.spread <= 6 && r.h <= 64 && r.sw <= r.cw + 1 && r.menus <= 44, JSON.stringify(r));
            await page.context().close();
        });
        await t('allemand à 390 px : la page ne déborde pas', async () => {
            const page = await open({lang: 'de', w: 390});
            await openEditor(page);
            const r = await page.evaluate(() => ({sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth}));
            if (shots) await page.screenshot({path: path.join(shots, 'i18n-texte-de-390.png')});
            assert.ok(r.sw <= 391 && r.bw <= 391, JSON.stringify(r));
            await page.context().close();
        });
        await t('aucune erreur JavaScript', () => { assert.deepEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(`${failed ? '✗' : '✓'} traduction du traitement de texte : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
