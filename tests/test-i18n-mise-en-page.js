'use strict';
/* 🌐 Traduction de la zone « mise-en-page » (vague 4 : les éditeurs) : l'atelier de mise en page (heritage-layout.js, -facts.js,
 * -livret.js, -pdfa.js). Mode d'emploi : docs/I18N.md.
 *     node tests/test-i18n-mise-en-page.js              (I18N_PORT=20510 par défaut)
 *     I18N_PROBE=de node tests/test-i18n-mise-en-page.js   liste les textes français restés à l'écran (sans rien vérifier)
 * 1. Node : les fichiers de langue sont complets (scripts/i18n-check.js) ; chaque texte passé à i18n() dans les fichiers de la
 *    zone a sa clé exacte (ou son pluriel) dans les 7 langues.
 * 2. Navigateur (Playwright, sinon sauté) : en français rien ne change ; en de, pl et en, presque plus de français dans la liste
 *    des livres, l'atelier (menus, panneau de droite, barre du bas) et ses fenêtres ; en allemand à 1440 px la barre du haut
 *    (E1) tient sur une ligne et rien ne déborde du panneau de droite ; à 390 px la liste ne déborde pas ; aucune erreur JS.
 *    Le contenu des pages (ce que la personne écrit) n'est jamais retouché (data-i18n-off).
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
const ZONE_FILES = ['heritage-layout.js', 'heritage-layout-facts.js', 'heritage-layout-livret.js', 'heritage-layout-pdfa.js'].map(f => path.join(root, 'assets/js', f));
const ALLOWED = Number(process.env.I18N_ALLOWED || 8);
const PANELS = ['pages', 'layers', 'obj', 'text', 'color', 'links', 'review', 'history', 'doc'];
const DIALOGS = ['docformat', 'docinfo', 'preflight', 'masters', 'insert', 'merge', 'qr', 'tree', 'stylelib', 'export'];

(async () => {
    /* ═════ 1. Node ═════ */
    await t('fichiers de langue complets et à jour (scripts/i18n-check.js)', () => {
        const r = spawnSync(process.execPath, [path.join(root, 'scripts/i18n-check.js')], {encoding: 'utf8'});
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.ok(fs.existsSync(path.join(root, 'assets/i18n/src/mise-en-page.tsv')));
    });
    await t('chaque texte passé à i18n() dans l’atelier a sa clé exacte dans les 7 langues', () => {
        const X = require('../scripts/i18n-extract.js');
        for (const l of ['en', 'es', 'de', 'it', 'pt', 'pl', 'nl']) {
            const dict = X.loadDict(l), miss = [];
            for (const f of ZONE_FILES) X.tCalls(f).forEach(x => { const k = x.ctx ? `${x.ctx}|${x.text}` : x.text; if (dict[k] == null && dict[x.text] == null) miss.push(`${path.basename(f)}:${x.line} ${k}`); });
            assert.deepEqual(miss, [], `${l} : ${miss.join('\n')}`);
        }
    });
    await t('les mots comptés par plural() ont leurs formes (polonais : 3 formes)', () => {
        const pl = JSON.parse(fs.readFileSync(path.join(root, 'assets/i18n/pl.json'), 'utf8'));
        for (const w of ['objet', 'page', 'page créée', 'page sera créée', 'objet copié', 'page ajoutée', 'commentaire ajouté', 'image déposée', 'texte qui déborde', 'avertissement', 'problème', 'police', 'métier'])
            assert.ok(pl[w] && pl[w].few && pl[w].many, `pluriel manquant : ${w}`);
    });
    /* ═════ 2. Navigateur ═════ */
    const phpPath = findPhp([devBundledPhp()]);
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); console.log(`${failed ? '✗' : '✓'} traduction de la mise en page : ${count} vérifications`); process.exit(failed ? 1 : 0); }
    const R = require('../scripts/i18n-remaining.js');
    const tmp = fs.mkdtempSync(path.join(process.env.I18N_TMP || os.tmpdir(), 'carnet-i18n-ly-'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(id,first_name,last_name,gender,is_start,living_status) VALUES(1,'Jean','Martin','male',1,'deceased'),(2,'Pierre','Martin','male',0,'deceased'),(3,'Marie','Durand','female',0,'deceased')"); $p = null;
require 'lib/bootstrap.php'; $d = db();
$d->prepare('INSERT INTO families(partner1_id,partner2_id) VALUES(2,3)')->execute(); $f = (int) $d->lastInsertId(); $d->prepare('INSERT INTO family_children(family_id,child_id) VALUES(?,1)')->execute([$f]);
echo 'ok';`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = Number(process.env.I18N_PORT) || 20510;
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
        await page.waitForFunction(() => window.LCNDA_EXT?.newLayoutDoc && window.LCNDA_APP?.state?.bootstrap, null, {timeout: 30000});
        await page.waitForTimeout(800);
        return page;
    };
    // les textes d'un endroit (sans le contenu des pages, les champs, les noms de polices)
    const textsOf = (page, sel) => page.evaluate(sel => {
        const out = new Set();
        document.querySelectorAll(sel).forEach(el => {
            const tw = document.createTreeWalker(el, 5); let n = el;
            do {
                if (n.nodeType === 1) { if (n.closest('[data-i18n-off], script, style, textarea, code, pre, .ly-page, select, .ly-fontpick')) continue; ['title', 'placeholder', 'aria-label'].forEach(a => n.getAttribute(a) && out.add(n.getAttribute(a))); }
                else if (n.nodeType === 3 && !n.parentElement.closest('[data-i18n-off], script, style, textarea, code, pre, .ly-page, select, [data-person-id], .person-name, .ly-name, .ly-thumb, .ly-layrow, .ly-objrow')) { const s = n.nodeValue.replace(/\s+/g, ' ').trim(); if (s) out.add(s); }
            } while ((n = tw.nextNode()));
        });
        return [...out];
    }, sel);
    const E = 'dialog.ly-editor[open]';
    const openEditor = async page => {
        await page.evaluate(() => window.LCNDA_EXT.newLayoutDoc('blank', () => {}));
        await page.waitForSelector('dialog[open] [name=pages]');
        await page.fill('dialog[open] [name=name]', 'Essai'); await page.fill('dialog[open] [name=pages]', '2');
        await page.click('dialog[open] button[type=submit]');
        await page.waitForSelector(E); await page.waitForTimeout(700);
        // un bloc de texte (pour remplir les onglets Objet et Texte)
        const box = await page.locator(`${E} .ly-page`).first().boundingBox();
        await page.click(`${E} [data-ly-tool="text"]`);
        await page.mouse.move(box.x + 60, box.y + 60); await page.mouse.down(); await page.mouse.move(box.x + 260, box.y + 160, {steps: 4}); await page.mouse.up();
        await page.waitForTimeout(300); await page.keyboard.type('Bonjour'); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
        await page.click(`${E} [data-ly-tool="select"]`);
        await page.mouse.click(box.x + 150, box.y + 100); await page.waitForTimeout(300);
    };
    const closeOthers = page => page.evaluate(() => document.querySelectorAll('dialog[open]:not(.ly-editor)').forEach(d => d.close()));
    // [nom, fonction qui ouvre, sélecteur à lire]
    const steps = [];
    steps.push(['atelier (barre du haut, outils, barre du bas)', async () => {}, `${E} .ly-top, ${E} .ly-tools, ${E} .ed-status, ${E} .ly-status`]);
    for (const p of PANELS) steps.push([`panneau ${p}`, page => page.click(`${E} [data-ly-panel="${p}"]`).then(() => page.waitForTimeout(400)), `${E} .ly-panels`]);
    for (const m of ['Fichier', 'Édition', 'Objet', 'Page', 'Relecture', 'Affichage']) steps.push([`menu ${m}`, page => page.evaluate(m => { document.querySelectorAll('dialog.ly-editor details.ly-menu').forEach(d => { d.open = d.dataset.tb === `menu-${m}`; }); }, m).then(() => page.waitForTimeout(300)), `${E} details.ly-menu[open]`]);
    for (const c of DIALOGS) steps.push([`fenêtre ${c}`, async page => { await page.evaluate(() => document.querySelectorAll('dialog.ly-editor details.ly-menu').forEach(d => { d.open = false; })); await page.evaluate(c => document.querySelector(`dialog.ly-editor [data-ly-cmd="${c}"]`)?.click(), c); await page.waitForTimeout(900); }, 'dialog[open]:not(.ly-editor), .ui-export, .k-print']);
    const WIZARDS = [['nouveau document (page blanche)', () => window.LCNDA_EXT.newLayoutDoc('blank', () => {})], ['nouveau livre d’après la famille', () => window.LCNDA_EXT.newLayoutDoc('family', () => {})],
        ['nouveau depuis un design', () => window.LCNDA_EXT.newLayoutDoc('design', () => {})], ['livre prêt à l’emploi', () => window.LCNDA_EXT.layoutTemplates.wizard(() => {})]];
    const run = async (page, isFr, onStep) => {
        for (const [name, fn] of WIZARDS) {
            await page.evaluate(fn); await page.waitForTimeout(900);
            onStep(name, (await textsOf(page, 'dialog[open]')).filter(isFr));
            await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close())); await page.waitForTimeout(200);
        }
        await openEditor(page);
        for (const [name, go, sel] of steps) {
            try { await go(page); } catch (e) { onStep(name, [`! ${e.message}`]); continue; }
            onStep(name, (await textsOf(page, sel)).filter(isFr));
            if (/^fenêtre/.test(name)) { await closeOthers(page); await page.waitForTimeout(200); }
        }
    };
    try {
        if (PROBE) {
            const isFr = R.make(PROBE), page = await open({lang: PROBE});
            await page.evaluate(async () => { const A = window.LCNDA_APP; A.state.listType = 'layout_books'; await A.setModule('listes'); }); await page.waitForTimeout(1500);
            const l0 = (await textsOf(page, '#workspace')).filter(isFr); console.log(`\n══ liste des livres (${l0.length})`); l0.forEach(s => console.log(s));
            await run(page, isFr, (name, left) => { console.log(`\n══ ${name} (${left.length})`); left.forEach(s => console.log(s)); });
            console.log('\nerreurs JS :', errs);
            return;
        }
        await t('en français, rien ne change : pas de bandeau, html lang="fr", menus en français', async () => {
            const page = await open();
            await openEditor(page);
            const r = await page.evaluate(() => ({lang: document.documentElement.lang, banner: !!document.getElementById('lc-i18n-banner'), top: document.querySelector('dialog.ly-editor .ly-top').innerText}));
            assert.equal(r.lang, 'fr'); assert.equal(r.banner, false);
            assert.ok(/Fichier/.test(r.top) && /Relecture/.test(r.top) && /Enregistrer/.test(r.top), r.top.slice(0, 200));
            await page.click(`${E} [data-ly-panel="doc"]`); await page.waitForTimeout(300);
            assert.ok(/réglages par défaut/.test(await page.locator(`${E} .ly-panels`).innerText()));
            await page.context().close();
        });
        for (const l of ['de', 'pl', 'en']) await t(`${l} : la liste des livres, l’atelier, ses menus, panneaux et fenêtres sont traduits (au plus ${ALLOWED} textes français par écran)`, async () => {
            const isFr = R.make(l), page = await open({lang: l}), bad = {};
            await page.evaluate(async () => { const A = window.LCNDA_APP; A.state.listType = 'layout_books'; await A.setModule('listes'); }); await page.waitForTimeout(1500);
            const l0 = (await textsOf(page, '#workspace')).filter(isFr); if (l0.length > ALLOWED) bad['liste des livres'] = l0;
            await run(page, isFr, (name, left) => { if (left.length > ALLOWED || left.some(s => /^!/.test(s))) bad[name] = left; });
            // le texte écrit dans la page ne change pas
            assert.ok((await page.locator(`${E} .ly-page`).first().innerText()).includes('Bonjour'));
            await page.context().close();
            assert.deepEqual(bad, {}, JSON.stringify(bad, null, 1));
        });
        await t('allemand à 1440 px : la barre du haut (E1) tient sur une ligne, rien ne déborde du panneau de droite', async () => {
            const page = await open({lang: 'de'}), bad = [];
            await openEditor(page);
            const top = await page.evaluate(() => {
                const bar = document.querySelector('dialog.ly-editor .ly-top'), kids = [...bar.children].filter(k => k.offsetWidth && getComputedStyle(k).display !== 'none');
                const r = kids.map(k => k.getBoundingClientRect()), tops = r.map(x => Math.round(x.top + x.height / 2));
                return {spread: Math.max(...tops) - Math.min(...tops), over: bar.scrollWidth - bar.clientWidth, h: bar.getBoundingClientRect().height};
            });
            assert.ok(top.spread <= 8 && top.over <= 1 && top.h < 64, `barre du haut sur plusieurs lignes : ${JSON.stringify(top)}`);
            for (const p of PANELS) {
                await page.click(`${E} [data-ly-panel="${p}"]`); await page.waitForTimeout(400);
                const o = await page.evaluate(() => { const b = document.querySelector('dialog.ly-editor [data-ly-pbody]'); const r = b.getBoundingClientRect(); const out = [...b.querySelectorAll('button, label, select, input, h3, summary, .ly-f, .ly-row > *')].filter(e => e.offsetWidth && e.getBoundingClientRect().right > r.right + 2 && !e.closest('.ly-page')).map(e => (e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 40)); return {over: b.scrollWidth - b.clientWidth, out: out.slice(0, 5)}; });
                if (o.over > 1 || o.out.length) bad.push(`${p} : ${JSON.stringify(o)}`);
            }
            const tabs = await page.evaluate(() => { const t = document.querySelector('dialog.ly-editor .ly-ptabs'); return t.scrollWidth - t.clientWidth; });
            if (tabs > 1) bad.push(`onglets du panneau : ${tabs} px de trop`);
            await page.context().close();
            assert.deepEqual(bad, []);
        });
        await t('allemand à 390 px : la liste des livres ne déborde pas', async () => {
            const page = await open({lang: 'de', w: 390});
            await page.evaluate(async () => { const A = window.LCNDA_APP; A.state.listType = 'layout_books'; await A.setModule('listes'); }); await page.waitForTimeout(1500);
            const w = await page.evaluate(() => document.documentElement.scrollWidth);
            await page.context().close();
            assert.ok(w <= 391, `largeur ${w}`);
        });
        await t('aucune erreur JS', () => assert.deepEqual(errs, []));
    } finally {
        await browser.close(); try { proc.kill(); } catch (_) {}
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(`${failed ? '✗' : '✓'} traduction de la mise en page : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
