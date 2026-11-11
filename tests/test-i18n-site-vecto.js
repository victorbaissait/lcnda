'use strict';
/* 🌐 Traduction de la zone « site-vecto » (vague 5 : les éditeurs restants) : l'éditeur de Site web (heritage-site-web*.js,
 * avec l'aide-mémoire HTML / attributs / CSS / JS) et le Dessin vectoriel (heritage-vector*.js : plan, faire-part, arbre
 * décoratif, signatures et sceaux). Mode d'emploi : docs/I18N.md.
 *     node tests/test-i18n-site-vecto.js              (I18N_PORT=20560 par défaut)
 *     I18N_PROBE=de node tests/test-i18n-site-vecto.js   liste les textes français restés à l'écran (sans rien vérifier)
 * 1. Node : les fichiers de langue sont complets (scripts/i18n-check.js) ; chaque texte passé à i18n() dans les fichiers de la
 *    zone a sa clé exacte (ou son pluriel) dans les 7 langues ; l'aide-mémoire (descriptions et morceaux « a; b ») est traduit.
 * 2. Navigateur (Playwright, sinon sauté) : en français rien ne change ; en de, pl et en, presque plus de français dans les deux
 *    éditeurs (barre du haut, outils, panneaux, menus, fenêtres) ; le contenu du site (aperçu, code) et du dessin n'est jamais
 *    retouché ; en allemand à 1440 px la barre du haut tient sur une ligne ; à 390 px rien ne déborde ; aucune erreur JS.
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
const ZONE_FILES = fs.readdirSync(path.join(root, 'assets/js')).filter(f => /^heritage-(site-web|vector)[\w-]*\.js$/.test(f)).map(f => path.join(root, 'assets/js', f));
const ALLOWED = Number(process.env.I18N_ALLOWED || 8);

(async () => {
    /* ═════ 1. Node ═════ */
    await t('fichiers de langue complets et à jour (scripts/i18n-check.js)', () => {
        const r = spawnSync(process.execPath, [path.join(root, 'scripts/i18n-check.js')], {encoding: 'utf8'});
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.ok(fs.existsSync(path.join(root, 'assets/i18n/src/site-vecto.tsv')));
    });
    await t('chaque texte passé à i18n() dans le site web et le dessin a sa clé exacte dans les 7 langues', () => {
        const X = require('../scripts/i18n-extract.js');
        for (const l of ['en', 'es', 'de', 'it', 'pt', 'pl', 'nl']) {
            const dict = X.loadDict(l), miss = [];
            for (const f of ZONE_FILES) X.tCalls(f).forEach(x => { const k = x.ctx ? `${x.ctx}|${x.text}` : x.text; if (dict[k] == null && dict[x.text] == null) miss.push(`${path.basename(f)}:${x.line} ${k}`); });
            assert.deepEqual(miss, [], `${l} : ${miss.join('\n')}`);
        }
    });
    await t('l’aide-mémoire : descriptions HTML, attributs, CSS et JS traduites ; noms de balises et propriétés jamais', () => {
        global.window = {};
        for (const f of ['heritage-site-web-cssjs-ref.js', 'heritage-site-web-html-attrs.js', 'heritage-site-web-html-ref.js']) require(path.join(root, 'assets/js', f));
        const {siteCssJsRef: C, siteHtmlAttrs: H, siteHtmlRef: R} = global.window.LCNDA_EXT;
        const de = JSON.parse(fs.readFileSync(path.join(root, 'assets/i18n/de.json'), 'utf8'));
        const miss = [];
        R.ELEMENTS.forEach(e => { if (de[e[1]] == null) miss.push(`html ${e[0]} : ${e[1]}`); [e[2], e[3], e[4]].forEach(x => x.split(/;\s*/).forEach(p => { p = p.replace(/\*$/, '').trim(); if (/[a-zà-ÿ]/i.test(p) && de[p] == null && !/^[a-z0-9]+$/.test(p)) miss.push(`html ${e[0]} : morceau « ${p} »`); })); });
        C.CSS.filter(p => p[1]).forEach(p => { if (de[p[1]] == null) miss.push(`css ${p[0]} : ${p[1]}`); });
        C.JS.forEach(j => { if (de[j[1]] == null) miss.push(`js ${j[0]} : ${j[1]}`); });
        H.ATTRS.forEach(([a, rows]) => rows.forEach(r => { if (de[r[1]] == null) miss.push(`attr ${a} : ${r[1]}`); }));
        assert.deepEqual(miss, []);
        assert.equal(de['flux'] && de['texte courant'] ? 'ok' : 'manque', 'ok');
        delete global.window;
    });
    /* ═════ 2. Navigateur ═════ */
    const phpPath = findPhp([devBundledPhp()]);
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); console.log(`${failed ? '✗' : '✓'} traduction du site web et du dessin : ${count} vérifications`); process.exit(failed ? 1 : 0); }
    const R = require('../scripts/i18n-remaining.js');
    const tmp = fs.mkdtempSync(path.join(process.env.I18N_TMP || os.tmpdir(), 'carnet-i18n-sv-'));
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
    const port = Number(process.env.I18N_PORT) || 20560;
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch();
    const errs = [];
    const watch = (page, tag) => { page.on('pageerror', e => errs.push(`${tag} : ${e.message}`)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|Content Security Policy|sandboxed|blocked/.test(m.text())) errs.push(`${tag} console : ${m.text()}`); }); page.on('dialog', d => d.dismiss()); };
    const open = async ({w = 1440, lang = ''} = {}) => {
        const ctx = await browser.newContext({viewport: {width: w, height: 900}});
        await ctx.addInitScript(l => { try { if (!sessionStorage.getItem('i18n-test-set')) { if (l) localStorage.setItem('lcnda-langue', l); else localStorage.removeItem('lcnda-langue'); sessionStorage.setItem('i18n-test-set', '1'); } localStorage.setItem('genealogie-visite-guidee', JSON.stringify({never: true, done: true})); } catch (_) {} }, lang);
        const page = await ctx.newPage(); watch(page, `${lang || 'fr'} ${w}px`);
        await page.goto(base, {waitUntil: 'load'});
        await page.waitForFunction(() => window.LCNDA_EXT?.siteWeb && window.LCNDA_EXT?.openVectorEditor && window.LCNDA_APP?.state?.bootstrap, null, {timeout: 30000});
        await page.waitForTimeout(800);
        return page;
    };
    // les textes d'un endroit (sans l'aperçu du site, le code, le dessin, les champs)
    const textsOf = (page, sel) => page.evaluate(sel => {
        const out = new Set();
        const SKIP = '[data-i18n-off], script, style, textarea, code, pre, select, iframe, svg, kbd, .swc-gutter';
        document.querySelectorAll(sel).forEach(el => {
            const tw = document.createTreeWalker(el, 5); let n = el;
            do {
                if (n.nodeType === 1) { if (n.closest(SKIP)) continue; ['title', 'placeholder', 'aria-label'].forEach(a => n.getAttribute(a) && out.add(n.getAttribute(a))); }
                else if (n.nodeType === 3 && !n.parentElement.closest(`${SKIP}, [data-person-id], .person-name`)) { const s = n.nodeValue.replace(/\s+/g, ' ').trim(); if (s) out.add(s); }
            } while ((n = tw.nextNode()));
        });
        return [...out];
    }, sel);
    const SW = 'dialog.sw-dlg[open]', VX = '.vx-dlg';
    const closeAll = page => page.evaluate(() => { document.querySelectorAll('.ui-menu, .ui-ctxmenu').forEach(m => m.remove()); document.querySelectorAll('dialog[open]').forEach(d => d.close()); document.querySelectorAll('.vx-dlg').forEach(d => d.remove()); });
    const closeExtra = (page, keep) => page.evaluate(keep => { document.querySelectorAll('.ui-menu, .ui-ctxmenu').forEach(m => m.remove()); document.querySelectorAll('dialog[open]').forEach(d => { if (!d.matches(keep)) d.close(); }); }, keep);
    const MENU = '.ui-menu, .ui-ctxmenu, .k-menu, [role="menu"]';
    /* ── l'éditeur de site ── */
    const siteSteps = [
        ['site : barre du haut, outils, panneau de gauche, barre du bas', async () => {}, `${SW} .ui-topbar, ${SW} .sw-rail, ${SW} .sw-left, ${SW} .sw-bar, ${SW} .ed-status, ${SW} .sw-codebar, ${SW} .sw-ftabbar`],
        ['site : panneau Pages', page => page.click(`${SW} .sw-rail [data-sw-left="pages"]`), `${SW} .sw-left`],
        ['site : panneau Styles', page => page.click(`${SW} .sw-rail [data-sw-left="styles"]`), `${SW} .sw-left`],
        ['site : panneau Blocs', page => page.click(`${SW} .sw-rail [data-sw-left="blocks"]`), `${SW} .sw-left`],
        ['site : panneau Ceci est… (rien de choisi)', async () => {}, `${SW} .sw-panel`],
        ['site : Ceci est… (un titre choisi)', async page => { const fr = page.frameLocator(`${SW} [data-sw-frame]`); await fr.locator('h1, h2').first().click(); await page.waitForTimeout(500); }, `${SW} .sw-panel`],
    ];
    for (const k of ['attr', 'css', 'js', 'html']) siteSteps.push([`site : aide-mémoire ${k}`, async page => { await page.evaluate(k => document.querySelector('dialog.sw-dlg [data-sw-refkind="' + k + '"]')?.click(), k); await page.waitForTimeout(400); await page.evaluate(() => document.querySelectorAll('dialog.sw-dlg .sw-ref-el').forEach((d, i) => { if (i < 6) d.open = true; })); }, `${SW} [data-sw-ref]`]);
    for (const m of ['Fichier', 'Édition', 'Insertion', 'Affichage']) siteSteps.push([`site : menu ${m}`, async page => { await page.evaluate(() => document.querySelectorAll('.ui-menu, .ui-ctxmenu').forEach(x => x.remove())); const ok = await page.evaluate(m => { const b = [...document.querySelectorAll('dialog.sw-dlg [data-sw-menus] button')].find(x => x.dataset.uiMenu === m || x.textContent.trim() === m); if (b) b.click(); return !!b; }, m); if (!ok) throw new Error('pas de menu'); await page.waitForTimeout(400); }, MENU]);
    for (const [name, fn] of [['écrans (@media)', 'bpDialog'], ['navigateurs', 'compatDialog'], ['exporter', 'exportDialog'], ['publier', 'publishDialog'], ['versions', 'versions']]) siteSteps.push([`site : fenêtre ${name}`, async page => { await page.evaluate(() => document.querySelectorAll('.ui-menu, .ui-ctxmenu').forEach(x => x.remove())); await page.evaluate(fn => { const c = window.LCNDA_EXT.siteWeb.current; const r = c[fn] && c[fn](); if (r && r.catch) r.catch(() => {}); }, fn); await page.waitForTimeout(1200); }, `dialog[open]:not(.sw-dlg), .ui-export`]);
    const openSite = async page => {
        await page.evaluate(() => { window.LCNDA_APP.state.listType = 'edit_tools'; try { localStorage.setItem('genealogie-edit-tools-tab', 'website'); } catch (_) {} window.LCNDA_APP.setModule('listes'); });
        await page.waitForTimeout(1200);
        await page.evaluate(() => document.querySelector('[data-et-tab="website"]')?.click()); await page.waitForTimeout(600);
    };
    const runSite = async (page, isFr, onStep) => {
        await openSite(page);
        onStep('liste des sites', (await textsOf(page, '#workspace')).filter(isFr));
        await page.click('.h-et-bar [data-et-new]'); await page.waitForSelector('dialog[open] .sw-tpl'); await page.waitForTimeout(400);
        onStep('site : choix du modèle', (await textsOf(page, 'dialog[open]')).filter(isFr));
        await page.click('dialog[open] [data-tpl="family"], dialog[open] [data-tpl="blank"]'); await page.waitForSelector(`${SW} [data-sw-frame]`); await page.waitForTimeout(1500);
        for (const [name, go, sel] of siteSteps) {
            try { await go(page); await page.waitForTimeout(300); } catch (e) { onStep(name, [`! ${e.message}`]); continue; }
            onStep(name, (await textsOf(page, sel)).filter(isFr));
            if (/fenêtre|menu/.test(name)) { await closeExtra(page, '.sw-dlg'); await page.waitForTimeout(200); }
        }
    };
    /* ── le dessin vectoriel ── */
    const vxSteps = [['dessin : barre du haut, outils, bas', async () => {}, `${VX} .vx-top, ${VX} header, ${VX} .vx-tools, ${VX} .vx-foot`]];
    for (const tab of ['props', 'layers', 'doc', 'orn', 'map', 'blason']) vxSteps.push([`dessin : onglet ${tab}`, page => page.evaluate(tab => { const b = document.querySelector(`.vx-dlg [data-vx-tab="${tab}"]`); if (b) { b.hidden = false; b.click(); } }, tab).then(() => page.waitForTimeout(400)), `${VX} .vx-panel`]);
    vxSteps.push(['dessin : propriétés d’un rectangle', async page => {
        await page.click(`${VX} [data-vx-tab="props"]`);
        const box = await page.locator(`${VX} [data-vx-stage]`).boundingBox(); const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
        await page.click(`${VX} [data-vx-tool="rect"]`); await page.mouse.move(cx - 60, cy - 40); await page.mouse.down(); await page.mouse.move(cx + 60, cy + 40, {steps: 4}); await page.mouse.up(); await page.waitForTimeout(400);
    }, `${VX} .vx-panel`]);
    vxSteps.push(['dessin : menus', async page => { await page.evaluate(() => document.querySelectorAll('.vx-dlg details.vx-menu').forEach(d => { d.open = true; })); await page.waitForTimeout(300); }, `${VX} details.vx-menu[open]`]);
    for (const c of ['blason', 'charge', 'grid', 'persp', 'transform', 'repeat_circle', 'textpath', 'ornaments', 'map_base', 'map_places', 'vectorize', 'blend', 'xd_pdf']) vxSteps.push([`dessin : commande ${c}`, async page => { await page.evaluate(() => document.querySelectorAll('.vx-dlg details.vx-menu').forEach(d => { d.open = false; })); await page.evaluate(c => document.querySelector(`.vx-dlg [data-vx-cmd="${c}"]`)?.click(), c); await page.waitForTimeout(1000); }, 'dialog[open], .ui-export']);
    const runVx = async (page, isFr, onStep) => {
        await page.evaluate(() => window.LCNDA_EXT.openVectorEditor({})); await page.waitForSelector(`${VX} [data-vx-stage]`); await page.waitForTimeout(700);
        for (const [name, go, sel] of vxSteps) {
            try { await go(page); } catch (e) { onStep(name, [`! ${e.message}`]); continue; }
            onStep(name, (await textsOf(page, sel)).filter(isFr));
            if (/commande/.test(name)) { await closeExtra(page, '.vx-dlg-never'); await page.waitForTimeout(200); }
        }
        await closeAll(page); await page.waitForTimeout(300);
        // les outils qui préparent un dessin : faire-part, arbre décoratif, sceaux, carte
        for (const [name, tab, fn] of [['faire-part', 'cards', () => window.LCNDA_EXT.openCardMaker()], ['arbre décoratif', 'decortree', () => window.LCNDA_EXT.openDecorTree()], ['signatures et sceaux', 'seals', () => window.LCNDA_EXT.openSeals()], ['carte', 'maps', () => window.LCNDA_EXT.newMapDoc && window.LCNDA_EXT.newMapDoc()]]) {
            await page.evaluate(tab => { window.LCNDA_APP.state.listType = 'edit_tools'; try { localStorage.setItem('genealogie-edit-tools-tab', tab); } catch (_) {} window.LCNDA_APP.setModule('listes'); }, tab); await page.waitForTimeout(900);
            await page.evaluate(tab => document.querySelector(`[data-et-tab="${tab}"]`)?.click(), tab); await page.waitForTimeout(500);
            onStep(`liste ${name}`, (await textsOf(page, '#workspace')).filter(isFr));
            try { await page.evaluate(fn); } catch (e) { onStep(name, [`! ${e.message}`]); continue; }
            await page.waitForTimeout(1300);
            onStep(`fenêtre ${name}`, (await textsOf(page, 'dialog[open], .vx-dlg')).filter(isFr));
            await closeAll(page); await page.waitForTimeout(300);
        }
    };
    try {
        if (PROBE) {
            const isFr = R.make(PROBE), page = await open({lang: PROBE});
            const show = (name, left) => { console.log(`\n══ ${name} (${left.length})`); left.forEach(s => console.log(s)); };
            if (process.env.I18N_ONLY !== 'vx') { await runSite(page, isFr, show); await closeAll(page); }
            if (process.env.I18N_ONLY !== 'site') await runVx(page, isFr, show);
            console.log('\nerreurs JS :', errs);
            return;
        }
        await t('en français, rien ne change : pas de bandeau, html lang="fr", menus en français', async () => {
            const page = await open();
            await openSite(page);
            await page.click('.h-et-bar [data-et-new]'); await page.waitForSelector('dialog[open] .sw-tpl');
            await page.click('dialog[open] [data-tpl="blank"]'); await page.waitForSelector(`${SW} [data-sw-frame]`); await page.waitForTimeout(800);
            const r = await page.evaluate(() => ({lang: document.documentElement.lang, banner: !!document.getElementById('lc-i18n-banner'), top: document.querySelector('dialog.sw-dlg .ui-topbar').innerText, rail: document.querySelector('dialog.sw-dlg [data-sw-mode="text"]').title}));
            assert.equal(r.lang, 'fr'); assert.equal(r.banner, false);
            assert.ok(/Fichier/.test(r.top) && /Enregistrer/.test(r.top), r.top.slice(0, 200));
            assert.equal(r.rail, 'Écrire le texte dans la page');
            await closeAll(page);
            await page.evaluate(() => window.LCNDA_EXT.openVectorEditor({})); await page.waitForSelector(`${VX} [data-vx-stage]`);
            assert.ok(/Calques/.test(await page.locator(`${VX} .vx-tabs`).textContent()));
            await page.context().close();
        });
        for (const l of ['de', 'pl', 'en']) await t(`${l} : le site web et le dessin (barres, panneaux, menus, fenêtres) sont traduits (au plus ${ALLOWED} textes français par écran)`, async () => {
            const isFr = R.make(l), page = await open({lang: l}), bad = {};
            const note = (name, left) => { if (left.length > ALLOWED || left.some(s => /^!/.test(s))) bad[name] = left; };
            await runSite(page, isFr, note);
            // le contenu du site n'est jamais traduit (l'aperçu est une page à part, le code reste tel quel)
            assert.ok(/<header|<section|<h1|<h2/.test(await page.evaluate(() => window.LCNDA_EXT.siteWeb.current.page().html)));
            await closeAll(page);
            await runVx(page, isFr, note);
            await page.context().close();
            assert.deepEqual(bad, {}, JSON.stringify(bad, null, 1));
        });
        await t('le texte d’un dessin n’est jamais traduit (data-i18n-off sur la planche)', async () => {
            const page = await open({lang: 'de'});
            await page.evaluate(() => window.LCNDA_EXT.openVectorEditor({})); await page.waitForSelector(`${VX} [data-vx-stage]`); await page.waitForTimeout(400);
            const box = await page.locator(`${VX} [data-vx-stage]`).boundingBox();
            await page.click(`${VX} [data-vx-tool="text"]`); await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(300);
            await page.keyboard.type('Fermer'); await page.keyboard.press('Escape'); await page.waitForTimeout(500);
            const txt = await page.evaluate(() => [...document.querySelectorAll('.vx-dlg [data-vx-content] text, .vx-dlg [data-vx-content] tspan')].map(e => e.textContent).join('|'));
            await page.context().close();
            assert.ok(/Fermer/.test(txt) && !/Schließen/.test(txt), txt);
        });
        for (const L of (process.env.I18N_BAR_LANGS || 'de').split(',')) await t(`${L} à 1440 px : la barre du haut des deux éditeurs tient sur une ligne`, async () => {
            const page = await open({lang: L === 'fr' ? '' : L}), bad = [];
            const oneLine = sel => page.evaluate(sel => {
                const bar = document.querySelector(sel); if (!bar) return {missing: true};
                const kids = [...bar.children].filter(k => k.offsetWidth && getComputedStyle(k).display !== 'none');
                const r = kids.map(k => k.getBoundingClientRect()), tops = r.map(x => Math.round(x.top + x.height / 2));
                return {spread: Math.max(...tops) - Math.min(...tops), over: bar.scrollWidth - bar.clientWidth, h: bar.getBoundingClientRect().height};
            }, sel);
            await openSite(page);
            await page.click('.h-et-bar [data-et-new]'); await page.waitForSelector('dialog[open] .sw-tpl');
            await page.click('dialog[open] [data-tpl="blank"]'); await page.waitForSelector(`${SW} [data-sw-frame]`); await page.waitForTimeout(800);
            for (const sel of [`${SW} .ui-topbar`]) // (la barre de l’aperçu .sw-bar passe déjà sur deux lignes en français à 1440 px, panneaux ouverts) { const o = await oneLine(sel); if (o.missing || o.spread > 8 || o.over > 1 || o.h > 64) bad.push(`${sel} : ${JSON.stringify(o)}`); }
            await closeAll(page);
            await page.evaluate(() => window.LCNDA_EXT.openVectorEditor({})); await page.waitForSelector(`${VX} [data-vx-stage]`); await page.waitForTimeout(500);
            const o = await oneLine(`${VX} header`); if (o.missing || o.spread > 8 || o.over > 1 || o.h > 64) bad.push(`dessin : ${JSON.stringify(o)}`);
            const tabs = await page.evaluate(() => { const t = document.querySelector('.vx-dlg .vx-tabs'); return t.scrollWidth - t.clientWidth; });
            if (tabs > 1) bad.push(`onglets du dessin : ${tabs} px de trop`);
            await page.context().close();
            assert.deepEqual(bad, []);
        });
        await t('allemand à 390 px : les listes et les éditeurs ne débordent pas', async () => {
            const page = await open({lang: 'de', w: 390}), bad = [];
            await openSite(page);
            let w = await page.evaluate(() => document.documentElement.scrollWidth); if (w > 391) bad.push(`liste des sites : ${w}`);
            await page.click('.h-et-bar [data-et-new]'); await page.waitForSelector('dialog[open] .sw-tpl');
            await page.click('dialog[open] [data-tpl="blank"]'); await page.waitForSelector(`${SW} [data-sw-frame]`); await page.waitForTimeout(800);
            w = await page.evaluate(() => { const d = document.querySelector('dialog.sw-dlg'); return Math.max(d.scrollWidth - d.clientWidth, document.documentElement.scrollWidth - 390); }); if (w > 1) bad.push(`site : ${w}`);
            await closeAll(page);
            await page.evaluate(() => window.LCNDA_EXT.openVectorEditor({})); await page.waitForSelector(`${VX} [data-vx-stage]`); await page.waitForTimeout(500);
            w = await page.evaluate(() => document.documentElement.scrollWidth); if (w > 391) bad.push(`dessin : ${w}`);
            await page.context().close();
            assert.deepEqual(bad, []);
        });
        await t('aucune erreur JS', () => assert.deepEqual(errs, []));
    } finally {
        await browser.close(); try { proc.kill(); } catch (_) {}
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(`${failed ? '✗' : '✓'} traduction du site web et du dessin : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
