'use strict';
/* 🌐 Traduction de la zone « retouche » (vague 4) : la retouche des photos (menus, colonne d'outils K19, panneau de droite,
 * barre du bas K18, fenêtres des filtres, calques, restauration pas à pas, photo d'identité, taille de l'image…), la retouche
 * rapide, les outils en plus (fluidité, gomme magique, ciel, détourer, agrandir), 🧩 Assembler et le PSD. Mode d'emploi : docs/I18N.md.
 *     node tests/test-i18n-retouche.js                 (I18N_SHOTS=dossier pour garder des captures, I18N_PORT=20540 par défaut)
 *     I18N_PROBE=de node tests/test-i18n-retouche.js     liste les textes français restés à l'écran, écran par écran (sans rien vérifier)
 * 1. Node : les fichiers de langue sont complets (scripts/i18n-check.js), les textes i18n() des fichiers de la zone sont tous traduits,
 *    le moteur de rotation (require) garde ses libellés français sans écran.
 * 2. Navigateur (Playwright, sinon sauté) : en français rien ne change ; en de, pl et en, presque plus de français dans chaque écran
 *    de la zone ; la barre du haut tient sur une ligne en allemand à 1440 px ; pas de débordement à 390 px ; aucune erreur JS.
 *    Données d'essai : une fiche et une image (portrait), faite par python3 + PIL.
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
const ZONE_FILES = ['heritage-studio.js', 'heritage-retouch-simple.js', 'heritage-retouch-plus.js', 'heritage-retouch-fluidite.js', 'heritage-retouch-gomme.js',
    'heritage-retouch-bord.js', 'heritage-retouch-rotation.js', 'heritage-assemble.js', 'heritage-psd.js'].map(f => path.join(root, 'assets/js', f));
// au plus ce nombre de textes français par écran (fenêtres communes : versions L3, choix d'image, couleurs C2…)
const ALLOWED = Number(process.env.I18N_ALLOWED || 6);
// [nom, sorte, clé] : sorte « tab » = onglet du panneau de droite, « cmd » = commande d'un menu, « tool » = outil de la colonne
const SCREENS = [
    ['retouche (Réglages)', 'tab', 'adjust'], ['onglet Filtres', 'tab', 'filters'], ['onglet Calques', 'tab', 'layers'], ['onglet Propriétés', 'tab', 'props'],
    ['onglet Caractère', 'tab', 'char'], ['onglet Motifs', 'tab', 'pat'], ['onglet Formes', 'tab', 'brushes'], ['onglet Historique', 'tab', 'history'],
    ['onglet Restaurer', 'tab', 'restore'], ['outil Sélection', 'tool', 'marquee'], ['outil Texte', 'tool', 'text'], ['outil Dégradé', 'tool', 'gradient'],
    ['filtre Flou gaussien', 'cmd', 'fx:gauss'], ['Teinte/Saturation', 'cmd', 'hs:photo'], ['Taille de l’image', 'cmd', 'imgsize'], ['Zone de travail', 'cmd', 'canvassize'],
    ['Rotation : angle', 'cmd', 'rot:angle'], ['Restaurer en une fois', 'cmd', 'restore:all'], ['Plis et rayures', 'cmd', 'repair:detect'], ['Photo d’identité', 'cmd', 'idphoto'],
    ['Actions', 'cmd', 'actions'], ['Fluidité', 'cmd', 'plus:liquify'], ['Gomme magique', 'cmd', 'plus:magicErase'], ['Remplacer le ciel', 'cmd', 'plus:sky'],
    ['Détourer', 'cmd', 'plus:cutout'], ['Agrandir', 'cmd', 'plus:upscale'], ['Assembler', 'cmd', 'plus:pano'],
    ['retouche rapide', 'simple', ''], ['canevas vide', 'ext', 'newBlankCanvas'], ['projets de retouche', 'ext', 'openRetouchProjects'],
];

(async () => {
    /* ═════ 1. Node ═════ */
    await t('fichiers de langue complets et à jour (scripts/i18n-check.js)', () => {
        const r = spawnSync(process.execPath, [path.join(root, 'scripts/i18n-check.js')], {encoding: 'utf8'});
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.ok(fs.existsSync(path.join(root, 'assets/i18n/src/retouche.tsv')));
    });
    await t('les textes passés à i18n() dans les fichiers de la zone sont traduits dans les 7 langues', () => {
        const X = require('../scripts/i18n-extract.js');
        for (const l of ['en', 'es', 'de', 'it', 'pt', 'pl', 'nl']) {
            const dict = X.loadDict(l), miss = [];
            for (const f of ZONE_FILES) X.tCalls(f).forEach(x => { if (/^[a-z_0-9.]+$/.test(x.text)) return; if (!X.translated(dict, x.text, x.ctx)) miss.push(`${path.basename(f)}:${x.line} ${x.text}`); });
            assert.deepEqual(miss, [], `${l} : ${miss.join('\n')}`);
        }
    });
    await t('sans écran, le moteur de rotation garde ses libellés français (le français ne change pas)', () => {
        const O = require('../assets/js/heritage-retouch-rotation.js');
        assert.equal(O.label({r: 90}), 'Rotation de l’image : 90° horaire');
        assert.equal(O.label({r: 12.5}), 'Rotation de l’image : 12,5° horaire');
        assert.equal(O.label({f: 'h'}), 'Symétrie horizontale de l’image');
    });
    await t('les noms donnés par défaut aux calques se traduisent, pas ceux qu’on a tapés (PSD importé)', () => {
        const src = fs.readFileSync(path.join(root, 'assets/js/heritage-studio.js'), 'utf8');
        assert.match(src, /name: name \? i18n\(name\) : i18n\('Calque \{num\}'/);
        assert.match(fs.readFileSync(path.join(root, 'assets/js/heritage-psd.js'), 'utf8'), /if \(l\.name\) node\.name = l\.name/);
    });

    /* ═════ 2. Navigateur ═════ */
    const phpPath = findPhp([devBundledPhp()]);
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); console.log(`${failed ? '✗' : '✓'} traduction de la retouche : ${count} vérifications`); process.exit(failed ? 1 : 0); }
    const R = require('../scripts/i18n-remaining.js');
    const shots = process.env.I18N_SHOTS || '';
    const tmp = fs.mkdtempSync(path.join(process.env.I18N_TMP || os.tmpdir(), 'carnet-i18n-retouche-'));
    const media = path.join(tmp, 'media'); fs.mkdirSync(media, {recursive: true});
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: media, GENEALOGY_SKIP_REFERENCE: '1'};
    const py = spawnSync('python3', ['-c', String.raw`
import sys
from PIL import Image, ImageDraw
im = Image.new('RGB', (600, 800), (90, 130, 180)); d = ImageDraw.Draw(im); d.ellipse((200, 150, 400, 400), fill=(230, 190, 160)); d.rectangle((150, 420, 450, 800), fill=(150, 30, 40)); im.save(sys.argv[1] + '/portrait.jpg', quality=92)
print('ok')`, media], {encoding: 'utf8'});
    if (py.status !== 0) { console.log('— navigateur : python3 + PIL absent (image d’essai), partie sautée'); fs.rmSync(tmp, {recursive: true, force: true}); console.log(`${failed ? '✗' : '✓'} traduction de la retouche : ${count} vérifications`); process.exit(failed ? 1 : 0); }
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $d = db();
$d->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Louise','Martin','female')");
$d->exec("INSERT INTO media(title,media_type,filename,thumbnail) VALUES('Portrait','image','portrait.jpg','portrait.jpg')");
$d->exec("INSERT INTO media_links(media_id,entity_type,entity_id,position) VALUES(1,'person',1,1)");
echo 'ok';`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = Number(process.env.I18N_PORT) || 20540;
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch();
    const errs = [];
    const watch = (page, tag) => { page.on('pageerror', e => errs.push(`${tag} : ${e.message}`)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|favicon/i.test(m.text())) errs.push(`${tag} console : ${m.text()}`); }); page.on('dialog', d => d.dismiss()); };
    const open = async ({w = 1440, lang = ''} = {}) => {
        const ctx = await browser.newContext({viewport: {width: w, height: 900}});
        await ctx.addInitScript(l => { try { if (!sessionStorage.getItem('i18n-test-set')) { if (l) localStorage.setItem('lcnda-langue', l); else localStorage.removeItem('lcnda-langue'); sessionStorage.setItem('i18n-test-set', '1'); } localStorage.setItem('genealogie-visite-guidee', JSON.stringify({never: true, done: true})); localStorage.setItem('genealogie-retouch-mode', 'advanced'); } catch (_) {} }, lang);
        const page = await ctx.newPage(); page.setDefaultTimeout(15000); watch(page, `${lang || 'fr'} ${w}px`);
        await page.goto(base, {waitUntil: 'load'});
        await page.waitForFunction(() => window.LCNDA_EXT?.openRetouch && window.LCNDA_EXT?.openRetouchSimple && window.LCNDA_APP?.api, null, {timeout: 30000});
        await page.waitForTimeout(800);
        return page;
    };
    const D = 'dialog.h-retouch';
    const openFull = async page => {
        await page.evaluate(() => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); const S = window.LCNDA_APP.state; S.lightboxMedia = [{id: 1, filename: 'portrait.jpg', title: 'Portrait', media_type: 'image'}]; S.lightboxIndex = 0; window.LCNDA_EXT.openRetouch('', null, {advanced: true}); });
        await page.waitForSelector(`${D} [data-rt-canvas]`); await page.waitForTimeout(500);
    };
    const go = async (page, kind, id) => {
        if (kind === 'simple') {
            await page.evaluate(() => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); const S = window.LCNDA_APP.state; S.lightboxMedia = [{id: 1, filename: 'portrait.jpg', title: 'Portrait', media_type: 'image'}]; S.lightboxIndex = 0; window.LCNDA_EXT.openRetouchSimple(); });
            await page.waitForSelector('dialog.h-retouch-simple [data-rs-canvas]'); await page.waitForTimeout(500); return;
        }
        if (kind === 'ext') { await page.evaluate(k => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); window.LCNDA_EXT[k](); }, id); await page.waitForTimeout(900); return; }
        if (!(await page.$(`${D}[open]`))) await openFull(page);
        // ce qui s'est ouvert par-dessus (fenêtre d'un outil, panneau d'un filtre) est refermé d'abord
        await page.evaluate(() => { [...document.querySelectorAll('dialog[open]')].filter(d => !d.classList.contains('h-retouch')).forEach(d => d.close()); document.querySelectorAll('dialog.h-retouch .h-rt-fxpanel').forEach(p => p.remove()); });
        if (kind === 'tab') await page.click(`${D} [data-rt-tab="${id}"]`);
        else if (kind === 'tool') await page.click(`${D} .h-rt-vtools [data-rt-mode="${id}"]`);
        else if (kind === 'cmd') await page.evaluate(k => document.querySelector(`dialog.h-retouch .h-rt-menubar [data-rt-cmd="${k}"]`)?.click(), id);
        await page.waitForTimeout(kind === 'cmd' ? 900 : 350);
    };
    // les textes visibles des fenêtres ouvertes (hors données, champs de saisie et noms de calques tapés)
    const texts = page => page.evaluate(() => {
        const out = new Set();
        document.querySelectorAll('dialog[open]').forEach(el => {
            const tw = document.createTreeWalker(el, 5); let n = el;
            do {
                if (n.nodeType === 1) { if (n.closest('[data-i18n-off], script, style, textarea, code, pre, [contenteditable]')) continue; ['title', 'placeholder', 'aria-label'].forEach(a => n.getAttribute(a) && out.add(n.getAttribute(a))); }
                else if (n.nodeType === 3 && !n.parentElement.closest('[data-i18n-off], script, style, textarea, code, pre, svg, [contenteditable]')) { const s = n.nodeValue.replace(/\s+/g, ' ').trim(); if (s) out.add(s); }
            } while ((n = tw.nextNode()));
        });
        return [...out];
    });
    try {
        if (PROBE) {
            const isFr = R.make(PROBE), page = await open({lang: PROBE});
            for (const [name, kind, id] of SCREENS) {
                try { await go(page, kind, id); } catch (e) { console.log('!', name, e.message.split('\n')[0]); continue; }
                const left = (await texts(page)).filter(isFr);
                console.log(`\n══ ${name} (${left.length})`); left.forEach(s => console.log(s));
            }
            console.log('\nerreurs JS :', errs);
            return;
        }
        await t('en français, rien ne change : pas de bandeau, html lang="fr", menus et outils de la retouche en français', async () => {
            const page = await open();
            await openFull(page);
            const r = await page.evaluate(() => {
                const d = document.querySelector('dialog.h-retouch');
                return {lang: document.documentElement.lang, banner: !!document.getElementById('lc-i18n-banner'),
                    menus: [...d.querySelectorAll('.h-rt-menubar > details > summary')].map(s => s.textContent.trim()),
                    tabs: [...d.querySelectorAll('[data-rt-tab] .h-rt-tl')].map(s => s.textContent.trim()),
                    layer: (() => { d.querySelector('[data-rt-cmd="ladd"]')?.click(); return [...d.querySelectorAll('[data-rt-lname]')].map(i => i.value); })(),
                    help: d.querySelector('[data-rt-mode="brush"]')?.getAttribute('title') || ''};
            });
            assert.equal(r.lang, 'fr'); assert.equal(r.banner, false);
            assert.deepEqual(r.menus, ['Fichier', 'Édition', 'Image', 'Calque', 'Sélection', 'Filtre', 'Affichage']);
            assert.ok(r.tabs.includes('Calques') && r.tabs.includes('Caractère') && r.tabs.includes('Restaurer'), r.tabs.join(', '));
            assert.ok(r.layer.some(n => /^Calque \d+$/.test(n)), r.layer.join(', '));
            await page.click(`${D} [data-rt-tab="layers"]`); await page.waitForTimeout(200);
            assert.ok(/Le pinceau, les formes et le texte vont sur le calque choisi/.test(await page.locator(D).innerText()));
            await page.context().close();
        });
        for (const l of ['de', 'pl', 'en']) await t(`${l} : les écrans de la retouche sont traduits (au plus ${ALLOWED} textes français par écran)`, async () => {
            const isFr = R.make(l), page = await open({lang: l}), bad = {};
            for (const [name, kind, id] of SCREENS) {
                await go(page, kind, id);
                const left = (await texts(page)).filter(isFr);
                if (left.length > ALLOWED) bad[name] = left;
                if (shots) await page.screenshot({path: path.join(shots, `i18n-retouche-${l}-${(id || kind).replace(/[^a-z0-9]+/gi, '-')}.png`), fullPage: false});
            }
            assert.deepEqual(bad, {}, `textes français restés : ${JSON.stringify(bad, null, 1)}`);
            // un nom donné par défaut à un nouveau calque est traduit
            await openFull(page);
            const names = await page.evaluate(() => { const d = document.querySelector('dialog.h-retouch'); d.querySelector('[data-rt-cmd="ladd"]').click(); return [...d.querySelectorAll('[data-rt-lname]')].map(i => i.value); });
            assert.ok(!names.some(n => /^Calque \d/.test(n)), names.join(', '));
            await page.context().close();
        });
        await t('allemand à 1440 px : la barre du haut de la retouche tient sur une ligne (même hauteur qu’en français)', async () => {
            const measure = async lang => {
                const page = await open({lang});
                await openFull(page);
                const r = await page.evaluate(() => { const bar = document.querySelector('dialog.h-retouch .h-rt-topbar'), b = bar.getBoundingClientRect(); return {h: Math.round(b.height), sw: bar.scrollWidth, cw: bar.clientWidth}; });
                await page.context().close();
                return r;
            };
            const fr = await measure(''), de = await measure('de');
            assert.ok(de.h <= fr.h + 2, `fr ${JSON.stringify(fr)} · de ${JSON.stringify(de)}`);
            assert.ok(de.sw <= de.cw + 2, JSON.stringify(de));
        });
        await t('allemand à 390 px : la retouche et la retouche rapide ne débordent pas de l’écran', async () => {
            const page = await open({lang: 'de', w: 390}), wide = [];
            for (const [name, kind, id] of [['retouche', 'tab', 'adjust'], ['calques', 'tab', 'layers'], ['retouche rapide', 'simple', '']]) {
                await go(page, kind, id);
                const r = await page.evaluate(() => ({sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth}));
                if (r.sw > 391 || r.bw > 391) wide.push(`${name} (${Math.max(r.sw, r.bw)} px)`);
            }
            assert.deepEqual(wide, []);
            await page.context().close();
        });
        await t('aucune erreur JavaScript', () => { assert.deepEqual(errs, []); });
    } finally {
        await browser.close().catch(() => {}); proc.kill();
        fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(`${failed ? '✗' : '✓'} traduction de la retouche : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
