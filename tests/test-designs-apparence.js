'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🎨 Designs au choix et Apparence : le premier cadre d'Apparence a TOUJOURS la priorité (validé par l'utilisateur).
 *   node tests/test-designs-apparence.js
 *  1. les feuilles : aucune règle d'un design ne touche à la police, à la taille du texte ni aux couleurs de l'Apparence ;
 *     plus d'ensembles, d'A7 « Police », d'A10 « Tableau de bord », de couleur d'accent ;
 *  2. le navigateur (Playwright ; sinon sauté) : pour CHAQUE carte de chaque design restant (et l'ancien « Archives anciennes »),
 *     les réglages d'Apparence (Preset, Couleur principale, Police de caractères, Taille typographique, Menu des onglets)
 *     donnent exactement le même résultat qu'avec « Comme avant » ; le cas réel « Archives anciennes + changer la police » par
 *     le formulaire d'Apparence, gardé après rechargement ; ancien réglage nettoyé ; le cadre ℹ️ d'Apparence ; aucune erreur.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
// l'ancien ensemble « Archives anciennes » tel qu'il était gardé (A1 à A10, sans numéro de version)
const OLD_ARCHIVES = {a1: {v: 'papier', acc: '#8a4b1f'}, a3: {v: 'trait'}, a4: {v: 'acte'}, a5: {v: 'photo'}, a6: {v: 'texte'}, a7: {v: 'serif', size: 104, titles: 'serif'}, a8: {v: 'petit'}, a9: {v: 'zebre'}, a10: {v: 'journal'}};

(async () => {
    /* ═════ 1. les feuilles ═════ */
    await t('designs.css et designs-gen.css : ni police, ni taille du texte, ni couleurs de l’Apparence', () => {
        const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, '');
        const own = strip(read('assets/css/designs.css'));
        const app = own.slice(0, own.indexOf('.lcd-page {') > 0 ? own.indexOf('.lcd-page {') : own.length); // sans la page de réglages elle-même (.lcd-*)
        const gen = strip(read('assets/css/designs-gen.css'));
        for (const [name, css] of [['designs.css', app], ['designs-gen.css', gen]]) {
            assert.doesNotMatch(css, /--font-family\s*:/, `${name} : --font-family`);
            assert.doesNotMatch(css, /--(blue|blue-bright|blue-soft|bg|paper|card-bg|card-head-bg|ink|muted|white)\s*:/, `${name} : une couleur de l’Apparence`);
            assert.doesNotMatch(css, /data-lc-(acc|cards|font|fz|caps|titles|dash|wgap|dnum|dempty)\b/, `${name} : un attribut retiré`);
            assert.doesNotMatch(css, /zoom\s*:/, `${name} : zoom (taille du texte)`);
            const fams = (css.match(/font-family\s*:[^;}]+|font\s*:[^;}]+/g) || []).filter(x => !/OCR B/.test(x) && !/^font\s*:\s*inherit/.test(x));
            assert.deepEqual(fams, [], `${name} : police imposée`);
        }
        assert.doesNotMatch(gen, /background(-color)?\s*:/, 'designs-gen.css : plus de fond');
    });
    await t('app-designs.js : plus d’ensembles, d’A7 « Police », d’A10, de couleur d’accent ; le cadre ℹ️ juste', () => {
        const src = read('assets/js/app-designs.js');
        assert.doesNotMatch(src, /Police de l’interface|title: 'Tableau de bord'|Ensembles prêts|Couleur d’accent'|data-lcd-preset/);
        assert.match(src, /La police, la taille et les couleurs se règlent ici, dans Apparence\./);
        assert.doesNotMatch(src, /Changer le style de l’app → Designs au choix/, 'ancien texte trompeur');
        assert.doesNotMatch(src, /police, mouvements, listes, tableau de bord : tout est encore/);
    });

    /* ═════ 2. le navigateur ═════ */
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    let phpPath = null;
    try { const {findPhp, devBundledPhp} = require('../electron/php-server'); phpPath = findPhp([devBundledPhp()]); } catch (_) { phpPath = null; }
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); finish(); return; }
    const {phpRuntimeArgs} = require('../electron/php-server');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-designs-app-'));
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Louise','BORIE','female','deceased'),('Antoine','BORIE','male','deceased'),('Marie','LEROY','female','unknown')");
$p = null; require 'lib/bootstrap.php'; db(); echo 'ok';`], {cwd: root, encoding: 'utf8', env});
    if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const port = Number(process.env.DESIGNS_APP_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch();
    const errs = [];
    const open = async (w = 1440) => {
        const page = await browser.newPage({viewport: {width: w, height: 900}});
        await page.addInitScript(() => { try { if (!localStorage.getItem('genealogie-reglages-presentation')) localStorage.setItem('genealogie-reglages-presentation', 'old'); } catch (_) {} }); // ce test vise la page « Apparence » d'avant, en un seul morceau
        page.on('pageerror', e => errs.push(`${w}px : ${e.message}`)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(`${w}px console : ${m.text()}`); });
        await page.route(u => !u.toString().startsWith(base), rt => rt.abort());
        await page.goto(base, {waitUntil: 'load'}); await page.waitForTimeout(1200);
        return page;
    };
    const toApparence = page => page.evaluate(async () => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'design'; await A.setModule('maintenance'); });
    /** ce que l'Apparence règle, tel qu'on le voit à l'écran */
    const look = page => page.evaluate(() => {
        const de = document.documentElement, cs = getComputedStyle(de), b = getComputedStyle(document.body);
        const btn = document.querySelector('#design-form ~ * .button:not(.secondary), .page-actions .button:not(.secondary), .button:not(.secondary)');
        const h2 = document.querySelector('#workspace h2');
        const v = n => cs.getPropertyValue(n).trim().toLowerCase();
        return {font: v('--font-family'), bodyFont: b.fontFamily, h2Font: h2 ? getComputedStyle(h2).fontFamily : '', size: cs.fontSize, blue: v('--blue'), bg: v('--bg'), paper: v('--paper'), card: v('--card-bg'), cardHead: v('--card-head-bg'),
            bodyBg: b.backgroundColor, btnBg: btn ? getComputedStyle(btn).backgroundColor : '', theme: de.dataset.theme || '', navBottom: de.classList.contains('nav-bottom')};
    });
    const setAppearance = (page, d) => page.evaluate(d => { localStorage.setItem('genealogie-design', JSON.stringify(d)); window.LCNDA_APP.applyDesign(); }, d);
    const setDesigns = (page, v) => page.evaluate(v => { if (v == null) localStorage.removeItem('genealogie-designs'); else localStorage.setItem('genealogie-designs', JSON.stringify(v)); window.LCNDA_DESIGNS.apply(); }, v);
    try {
        const page = await open();
        // (hors de la page Apparence : son enregistrement tout seul (K2) ne doit pas réécrire ce que le test pose)
        await page.evaluate(async () => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; await A.setModule('personnes'); }); await page.waitForSelector('.person-hero');
        const D = await page.evaluate(() => { const D = window.LCNDA_DESIGNS; return D.IDS.map(id => ({id, cards: D.DEFS[id].variants.map(v => v.k).filter(k => k !== 'avant')})); });
        const CASES = [...D.flatMap(({id, cards}) => cards.map(k => [`${id} ${k}`, {ver: 2, [id]: {v: k}}])),
            ['tout à la fois', {ver: 2, a1: {v: 'papier', r: 12, bw: 3, sh: 'aucune'}, a2: {v: 'compacte'}, a3: {v: 'deux', lbl: true}, a4: {v: 'carte'}, a5: {v: 'genre'}, a6: {v: 'contour', size: 'grande', shape: 'pilule'}, a7: {v: 'aucun'}, a8: {v: 'cartes'}}],
            ['ancien « Archives anciennes » (A1–A10)', OLD_ARCHIVES]];
        const APP = [
            ['Archive vert, rouge, Verdana, 18 px, onglets en bas', {preset: 'archiveGreen', blue: '#c0392b', fontFamily: 'verdana', fontScale: '1.13', navPosition: 'bottom'}],
            ['Archive papier, Georgia, 14 px', {preset: 'archive', blue: '#315f9f', fontFamily: 'georgia', fontScale: '0.88', navPosition: 'top'}],
            ['Sombre, Times, 20 px', {preset: 'dark', blue: '#4d9fff', fontFamily: 'times', fontScale: '1.25'}],
        ];
        await t(`pour chaque design (${CASES.length} cas) et ${APP.length} Apparences : l’Apparence s’applique et passe devant`, async () => {
            const bad = [];
            for (const [aName, ap] of APP) {
                await setDesigns(page, null); await setAppearance(page, ap); await page.waitForTimeout(450); // (le bouton change de couleur en 0,15 s)
                const ref = await look(page);
                assert.match(ref.font, new RegExp(ap.fontFamily, 'i'), `${aName} : police de l’Apparence`);
                assert.equal(ref.blue, ap.blue.toLowerCase(), `${aName} : couleur principale`);
                for (const [dName, des] of CASES) {
                    await setDesigns(page, des); await page.waitForTimeout(30);
                    const got = await look(page);
                    const diff = Object.keys(ref).filter(k => ref[k] !== got[k]).map(k => `${k}: ${ref[k]} → ${got[k]}`);
                    if (diff.length) bad.push(`${aName} + ${dName} : ${diff.join(' ; ')}`);
                }
            }
            await setDesigns(page, null);
            assert.deepEqual(bad, [], bad.slice(0, 6).join('\n'));
        });
        await t('le design reste bien posé pendant ce temps (traits, coins, listes…)', async () => {
            await setDesigns(page, {ver: 2, a1: {v: 'doux'}, a8: {v: 'zebre'}});
            const a = await page.evaluate(() => ({style: document.documentElement.getAttribute('data-lc-style'), list: document.documentElement.getAttribute('data-lc-list'), line: getComputedStyle(document.documentElement).getPropertyValue('--lc-frame-color').trim()}));
            assert.equal(a.style, 'doux'); assert.equal(a.list, 'zebre'); assert.match(a.line, /color-mix|rgb|#/, 'couleur des traits tirée de l’Apparence');
            // un thème à soi avec ses propres traits les garde
            const own = await page.evaluate(() => { const de = document.documentElement; de.classList.add('lc-frame'); de.style.setProperty('--lc-frame-color', '#ff00aa'); const c = getComputedStyle(de).getPropertyValue('--lc-frame-color').trim(); de.classList.remove('lc-frame'); de.style.removeProperty('--lc-frame-color'); return c; });
            assert.equal(own, '#ff00aa', '« ✎ Mes thèmes » garde ses traits');
            await setDesigns(page, null);
        });
        await t('le cas réel : ancien « Archives anciennes », puis police, Preset, couleur, taille, menu par le formulaire ; gardé après rechargement', async () => {
            const p = await open();
            await p.evaluate(v => { localStorage.removeItem('genealogie-design'); localStorage.setItem('genealogie-designs', JSON.stringify(v)); }, OLD_ARCHIVES);
            await p.waitForTimeout(1500); // la copie de la base suit
            await p.reload({waitUntil: 'load'}); await p.waitForTimeout(1200);
            const kept = JSON.parse(await p.evaluate(() => localStorage.getItem('genealogie-designs')));
            assert.equal(kept.ver, 2, 'ancien réglage réécrit à neuf'); assert.equal(kept.a1.v, 'papier'); assert.equal(kept.a7.v, 'petit'); assert.equal(kept.a8.v, 'zebre'); assert.ok(!('a9' in kept) && !('a10' in kept));
            assert.equal(await p.evaluate(() => document.documentElement.hasAttribute('data-lc-font') || document.documentElement.hasAttribute('data-lc-dash') || document.documentElement.hasAttribute('data-lc-acc')), false);
            await toApparence(p); await p.waitForSelector('#design-form');
            const note = await p.locator('#lcd-apparence-link').innerText();
            assert.match(note, /Designs au choix : la forme des éléments \(traits, densité, icônes, en-tête des fiches, cases des arbres, boutons, listes, mouvements\)\. La police, la taille et les couleurs se règlent ici, dans Apparence\./);
            assert.match(note, /Style général : Papier ancien/); assert.doesNotMatch(note, /police, mouvements, listes, tableau de bord|A9|A10/);
            assert.equal(await p.locator('#design-form .lcd-hint').count(), 0, 'plus de « Designs au choix → A7 choisit la police »');
            const set = async (name, value) => { await p.evaluate(([n, v]) => { const f = document.querySelector(`#design-form [name="${n}"]`); f.value = v; f.dispatchEvent(new Event('input', {bubbles: true})); f.dispatchEvent(new Event('change', {bubbles: true})); }, [name, value]); await p.waitForTimeout(700); };
            const before = await look(p);
            await set('fontFamily', 'verdana');
            let l = await look(p);
            assert.match(l.font, /verdana/i, 'la police change tout de suite'); assert.match(l.bodyFont, /Verdana/);
            assert.notEqual(l.bodyFont, before.bodyFont);
            await set('preset', 'archiveGreen'); await set('blue', '#c0392b'); await set('fontScale', '1.13'); await set('navPosition', 'bottom');
            l = await look(p);
            assert.equal(l.paper, '#f0fff5', 'Preset'); assert.equal(l.blue, '#c0392b', 'couleur principale'); assert.equal(l.btnBg, 'rgb(192, 57, 43)', 'bouton principal'); assert.equal(l.size, '18.08px', 'taille'); assert.equal(l.navBottom, true, 'menu des onglets');
            await p.waitForTimeout(1500);
            await p.reload({waitUntil: 'load'}); await p.waitForTimeout(1200);
            const after = await look(p);
            assert.match(after.font, /verdana/i); assert.equal(after.paper, '#f0fff5'); assert.equal(after.blue, '#c0392b'); assert.equal(after.size, '18.08px'); assert.equal(after.navBottom, true);
            assert.equal(await p.evaluate(() => document.documentElement.getAttribute('data-lc-style')), 'papier', 'le design reste');
            await p.evaluate(() => { localStorage.removeItem('genealogie-design'); localStorage.removeItem('genealogie-designs'); });
            await p.waitForTimeout(1300);
            await p.close();
        });
        await t('ancien réglage enregistré de l’Apparence (a_designs avec A7, A10) : appliqué sans erreur, ces parties ignorées', async () => {
            await page.evaluate(v => window.LCNDA_EXT.lookFromFlat({a_designs: JSON.stringify(v)}), OLD_ARCHIVES);
            const g = JSON.parse(await page.evaluate(() => localStorage.getItem('genealogie-designs')));
            assert.equal(g.ver, 2); assert.equal(g.a7.v, 'petit'); assert.equal(g.a8.v, 'zebre'); assert.ok(!('a10' in g));
            await setDesigns(page, null);
        });
        await t('la page Designs au choix : 4 sections (A5 dans la fenêtre des couleurs, A4 dans Fiches personnes et animaux, A6 dans Notifications et boutons, A8 dans Menus, colonne et listes), pas d’ensembles, le cadre ℹ️ dit que la police et les couleurs sont dans Apparence', async () => {
            await page.evaluate(async () => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'designs'; await A.setModule('maintenance'); });
            await page.waitForSelector('.lcd-page .lcd-toc');
            assert.equal(await page.locator('details.lcd-sec').count(), 4);
            assert.equal(await page.locator('#lcd-ens').count(), 0);
            assert.match(await page.locator('.lcd-intro').innerText(), /police, la taille du texte et les couleurs .* se règlent dans/);
            assert.match(await page.locator('.lcd-page .page-header p').first().innerText(), /Quatre réglages/);
        });
        await t('aucune erreur JavaScript', async () => { assert.deepEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    finish();
})();
function finish() { console.log(`${failed ? '✗' : '✓'} designs au choix et Apparence : ${count} vérifications${failed ? `, ${failed} en échec` : ''}`); process.exit(failed ? 1 : 0); }
