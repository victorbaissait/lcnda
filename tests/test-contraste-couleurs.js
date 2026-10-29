'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Couleurs qui se lisent mal : node tests/test-contraste-couleurs.js
 *  1. les sources : UNE seule fonction de contraste (contrastRatio, seuil CONTRAST_MIN = 4,5) pour « ✎ Mes thèmes » et
 *     l'avertissement sous « Couleur principale » ; les chiffres des stats en couleur de palette passent par .stats-ink ;
 *  2. le navigateur (Playwright ; sinon sauté) :
 *     - Réglages → Apparence (ancienne et nouvelle présentation) : Preset « Sombre » + #0066cc → « ⚠️ Sur ce fond, cette couleur
 *       se lit mal (contraste 2,8 : il faut 4,5). » ; « Prendre la couleur du thème » remet #4d9fff (K2, « ✓ Enregistré »),
 *       ↶ Annuler la remet, l'avertissement suit tout seul (Preset, couleur), un clic sur la phrase n'ouvre pas le choix de
 *       couleur, gardé après rechargement, 390 px sans débordement ;
 *     - Graphiques → Statistiques en sombre : les chiffres écrits dans une couleur de la palette ≥ 4,5:1 (les 40 couleurs de départ
 *       + des couleurs foncées au hasard), les barres gardent la couleur choisie, rien ne change en clair ; les étiquettes des
 *       nuages de mots lisibles en sombre ;
 *     - aucune erreur (pageerror, console.error, réponse 4xx/5xx).
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
const finish = () => { console.log(`\n${count} réussis, ${failed} en échec`); process.exit(failed ? 1 : 0); };

(async () => {
    /* ═════ 1. les sources ═════ */
    await t('une seule fonction de contraste, partagée par « ✎ Mes thèmes » et « Couleur principale »', () => {
        const src = read('assets/js/app.js');
        assert.equal((src.match(/const contrastRatio=/g) || []).length, 1);
        assert.match(src, /const CONTRAST_MIN=4\.5;/);
        assert.match(src, /const lum=contrastLum,ratio=contrastRatio;/, '« ✎ Mes thèmes » reprend la fonction commune');
        assert.match(src, /ratio\(ink,o\[k\]\)<CONTRAST_MIN/);
        assert.match(src, /contrastRatio\(blue,c\)/, 'l’avertissement utilise la même fonction');
        assert.doesNotMatch(src, /<strong style="color:\$\{palette/, 'chiffre de stat écrit en couleur de palette sans .stats-ink');
        const css = read('assets/css/app.css');
        assert.match(css, /\.stats-ink \{ color: var\(--stat-c, inherit\); \}/);
        assert.match(css, /:root\[data-theme="dark"\] \.stats-ink \{ color: oklch\(from var\(--stat-c\) max\(l, \.75\) c h\); \}/);
        assert.match(css, /\.ui-hint\.is-warn/);
        assert.match(read('assets/js/heritage-more.js'), /Sur ce fond, cette couleur se lit mal/, 'entrée de la FAQ');
    });

    /* ═════ 2. le navigateur ═════ */
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    let phpPath = null;
    try { const {findPhp, devBundledPhp} = require('../electron/php-server'); phpPath = findPhp([devBundledPhp()]); } catch (_) { phpPath = null; }
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); finish(); return; }
    const {phpRuntimeArgs} = require('../electron/php-server');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-contraste-'));
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Louise','BORIE','female','deceased'),('Antoine','BORIE','male','deceased'),('Marie','LEROY','female','unknown')");
$p = null; require 'lib/bootstrap.php'; db(); echo 'ok';`], {cwd: root, encoding: 'utf8', env});
    if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const port = Number(process.env.CONTRASTE_APP_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch();
    const errs = [];
    const open = async (w = 1440, pres = 'old') => {
        const page = await browser.newPage({viewport: {width: w, height: 900}});
        await page.addInitScript(pres => { try { if (!localStorage.getItem('genealogie-reglages-presentation')) localStorage.setItem('genealogie-reglages-presentation', pres); } catch (_) {} }, pres);
        page.on('pageerror', e => errs.push(`${w}px : ${e.message}`));
        page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(`${w}px console : ${m.text()}`); });
        page.on('response', res => { if (res.status() >= 400 && res.url().startsWith(base)) errs.push(`${w}px HTTP ${res.status()} ${res.url()}`); });
        await page.route(u => !u.toString().startsWith(base), rt => rt.abort());
        await page.goto(base, {waitUntil: 'load'}); await page.waitForTimeout(1200);
        return page;
    };
    const setDesign = (page, d) => page.evaluate(d => { const cur = JSON.parse(localStorage.getItem('genealogie-design') || '{}'); localStorage.setItem('genealogie-design', JSON.stringify({...cur, ...d})); window.LCNDA_APP.applyDesign(); }, d);
    const toApparence = page => page.evaluate(async () => { const A = window.LCNDA_APP; A.state.maintenanceTab = A.reglagesA?.() ? 'look_theme' : 'design'; await A.setModule('maintenance'); });
    const hint = page => page.evaluate(() => { const h = document.querySelector('#design-form [data-blue-contrast]'); return h ? {text: h.textContent.trim(), visible: !!h.offsetParent, button: !!h.querySelector('[data-blue-theme]')} : null; });
    const blue = page => page.evaluate(() => ({field: document.querySelector('#design-form [name="blue"]').value.toLowerCase(), saved: String(JSON.parse(localStorage.getItem('genealogie-design') || '{}').blue || '').toLowerCase(), css: getComputedStyle(document.documentElement).getPropertyValue('--blue').trim().toLowerCase()}));
    const typeBlue = (page, c) => page.evaluate(c => { const i = document.querySelector('#design-form [name="blue"]'); i.value = c; i.dispatchEvent(new Event('input', {bubbles: true})); i.dispatchEvent(new Event('change', {bubbles: true})); }, c);
    const WARN = '⚠️ Sur ce fond, cette couleur se lit mal (contraste 2,8 : il faut 4,5).';
    try {
        for (const pres of ['old', 'new']) {
            await t(`Apparence (${pres === 'old' ? 'ancienne' : 'nouvelle'} présentation) : l’avertissement, « Prendre la couleur du thème », ↶ Annuler, Preset, rechargement`, async () => {
                const page = await open(1440, pres);
                await setDesign(page, {preset: 'dark', blue: '#0066cc'});
                await toApparence(page); await page.waitForSelector('#design-form [name="blue"]'); await page.waitForTimeout(400);
                let h = await hint(page);
                assert.ok(h && h.visible, 'avertissement visible');
                assert.ok(h.text.startsWith(WARN), h.text);
                assert.ok(h.button, 'bouton « Prendre la couleur du thème »');
                // un clic sur la phrase n'ouvre pas la fenêtre de couleur
                await page.click('#design-form [data-blue-contrast]', {position: {x: 6, y: 6}}); await page.waitForTimeout(250);
                assert.equal(await page.evaluate(() => [...document.querySelectorAll('dialog[open]')].length), 0, 'aucune fenêtre ouverte');
                // le bouton remet la couleur du thème, gardée tout de suite (K2) avec ↶ Annuler
                await page.click('[data-blue-theme]'); await page.waitForTimeout(1100);
                assert.deepEqual(await blue(page), {field: '#4d9fff', saved: '#4d9fff', css: '#4d9fff'});
                assert.equal(await hint(page), null, 'avertissement parti');
                assert.equal(await page.evaluate(() => document.querySelector('#design-form .ui-color .ui-sw')?.style.getPropertyValue('--c').trim().toLowerCase()), '#4d9fff', 'la pastille C2 suit');
                assert.match(await page.evaluate(() => document.querySelector('.ui-ph-saved')?.textContent || ''), /Enregistré/);
                const undo = await page.evaluateHandle(() => [...document.querySelectorAll('.toast button')].find(b => /Annuler/.test(b.textContent)));
                assert.ok(await undo.evaluate(b => !!b), 'message H7 avec « ↶ Annuler »');
                await undo.evaluate(b => b.click()); await page.waitForTimeout(1200);
                assert.equal((await blue(page)).saved, '#0066cc', '↶ Annuler remet la couleur d’avant');
                h = await hint(page); assert.ok(h && h.text.startsWith(WARN), 'l’avertissement revient après ↶ Annuler');
                // il suit la couleur et le Preset tout seul
                await typeBlue(page, '#7fb8ff'); await page.waitForTimeout(150);
                assert.equal(await hint(page), null, 'couleur claire sur fond sombre : rien');
                await typeBlue(page, '#0066cc'); await page.waitForTimeout(150);
                assert.ok(await hint(page), 'de nouveau foncée : l’avertissement');
                await page.selectOption('#design-form [name="preset"]', 'portfolio'); await page.waitForTimeout(150);
                assert.equal(await hint(page), null, 'Preset clair (sa couleur) : rien');
                await typeBlue(page, '#ffdd55'); await page.waitForTimeout(150);
                h = await hint(page); assert.ok(h && /contraste 1,\d : il faut 4,5/.test(h.text), 'jaune pâle sur fond clair : avertissement');
                await page.selectOption('#design-form [name="preset"]', 'dark'); await page.waitForTimeout(150);
                // (choisir un Preset reprend sa couleur : #4d9fff, lisible)
                assert.equal(await hint(page), null);
                // gardé après rechargement
                await typeBlue(page, '#0066cc'); await page.waitForTimeout(1500);
                assert.equal((await blue(page)).saved, '#0066cc');
                await page.reload({waitUntil: 'load'}); await page.waitForTimeout(1200);
                await toApparence(page); await page.waitForSelector('#design-form [name="blue"]'); await page.waitForTimeout(400);
                h = await hint(page); assert.ok(h && h.text.startsWith(WARN), 'après rechargement');
                await page.close();
            });
        }
        await t('390 px : l’avertissement tient dans l’écran', async () => {
            const page = await open(390, 'old');
            await setDesign(page, {preset: 'dark', blue: '#0066cc'});
            await toApparence(page); await page.waitForSelector('#design-form [data-blue-contrast]'); await page.waitForTimeout(300);
            const m = await page.evaluate(() => { const h = document.querySelector('#design-form [data-blue-contrast]'), r = h.getBoundingClientRect(), b = h.querySelector('[data-blue-theme]').getBoundingClientRect(); return {right: Math.max(r.right, b.right), w: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth}; });
            assert.ok(m.right <= m.w + 1, `dépasse : ${m.right} > ${m.w}`);
            assert.ok(m.scroll <= m.w + 1, `défilement horizontal : ${m.scroll} > ${m.w}`);
            await page.screenshot({path: path.join(tmp, 'contraste-390.png')});
            await page.close();
        });

        /* les statistiques */
        const statsAt = async (page, type) => { await page.evaluate(async ty => { const A = window.LCNDA_APP; A.state.graphMode = 'stats'; A.state.graphStatsType = ty; A.state.currentPersonId = 1; await A.setModule('graphiques'); }, type); await page.waitForSelector('.stats-stage'); await page.waitForTimeout(300); };
        // les 40 couleurs de départ + des couleurs foncées au hasard, dans une vraie carte d'indicateur et une ligne de mesure
        const probe = (page, colors) => page.evaluate(colors => {
            const cv = document.createElement('canvas').getContext('2d', {willReadFrequently: true});
            const rgb = c => { cv.clearRect(0, 0, 1, 1); cv.fillStyle = '#000'; cv.fillStyle = c; cv.fillRect(0, 0, 1, 1); const d = cv.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
            const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
            const hex = a => '#' + a.slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join('');
            const box = document.createElement('div'); box.className = 'stats-stage'; box.style.cssText = 'position:fixed;left:0;top:0;z-index:99999';
            box.innerHTML = `<div class="stats-indicator-grid">${colors.map(c => `<article class="stats-indicator-card"><span>x</span><strong class="stats-ink" style="--stat-c:${c}">42 %</strong></article>`).join('')}</div>
                <div class="stats-custom-grid"><section class="stats-custom-panel">${colors.map(c => `<div class="stats-metric-row"><span>x</span><strong class="stats-ink" style="--stat-c:${c}">71 ans</strong><small>3 pers.</small></div>`).join('')}</section></div>
                <div class="stats-word-cloud"><section><div>${colors.map(c => `<span class="stats-word-chip" style="--chip-color:${c}">Jean <small>4</small></span>`).join('')}</div></section></div>`;
            document.body.appendChild(box);
            const bgOf = el => { const layers = []; for (let e = el; e; e = e.parentElement) { const a = rgb(getComputedStyle(e).backgroundColor); if (a[3] > 0) { layers.push(a); if (a[3] >= .99) break; } } let c = [255, 255, 255]; layers.reverse().forEach(l => { c = c.map((v, i) => v * (1 - l[3]) + l[i] * l[3]); }); return c; };
            const r = el => { const a = lum(rgb(getComputedStyle(el).color)), b = lum(bgOf(el)); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); };
            const ink = [...box.querySelectorAll('.stats-ink')].map((el, i) => ({c: colors[i % colors.length], got: hex(rgb(getComputedStyle(el).color)), r: r(el)}));
            const chips = [...box.querySelectorAll('.stats-word-chip, .stats-word-chip small')].map(el => ({c: el.closest('.stats-word-chip').style.getPropertyValue('--chip-color'), r: r(el)}));
            box.remove();
            return {ink, chips};
        }, colors);
        const randomDark = Array.from({length: 40}, (_, i) => { const x = (i * 2654435761) >>> 0; return '#' + [x & 0x7f, (x >> 8) & 0x7f, (x >> 16) & 0x7f].map(v => v.toString(16).padStart(2, '0')).join(''); });
        await t('Statistiques en sombre : les chiffres en couleur de palette ≥ 4,5:1, les barres gardent la couleur, rien ne change en clair', async () => {
            const page = await open(1440, 'old');
            const pal = await page.evaluate(() => window.LCNDA_APP.getStatsColors().map(c => c.toLowerCase()));
            // en clair : exactement la couleur choisie (comme avant)
            await setDesign(page, {preset: 'portfolio', blue: '#0066cc'});
            const light = await probe(page, pal);
            const changed = light.ink.filter(x => x.got !== x.c);
            assert.deepEqual(changed.slice(0, 3), [], 'en clair, le texte garde la couleur de la palette');
            // en sombre (preset « Sombre », avec #0066cc comme couleur principale : le cas signalé)
            await setDesign(page, {preset: 'dark', blue: '#0066cc'});
            const dark = await probe(page, [...pal, ...randomDark]);
            const bad = dark.ink.filter(x => x.r < 4.5).map(x => `${x.c} → ${x.got} : ${x.r.toFixed(2)}`);
            assert.deepEqual(bad, [], bad.slice(0, 5).join('\n'));
            const badChips = dark.chips.filter(x => x.r < 4.5).map(x => `${x.c} : ${x.r.toFixed(2)}`);
            assert.deepEqual(badChips, [], 'nuage de mots en sombre : ' + badChips.slice(0, 5).join(', '));
            // un vrai écran : Complétude des données (pourcentages) ; une distribution à barres
            await statsAt(page, 'completeness');
            const real = await page.evaluate(() => [...document.querySelectorAll('.stats-stage .stats-ink')].map(el => el.textContent));
            assert.ok(real.length > 0 && real.some(x => /%/.test(x)), 'des pourcentages affichés');
            const realBad = await page.evaluate(() => {
                const cv = document.createElement('canvas').getContext('2d', {willReadFrequently: true});
                const rgb = c => { cv.clearRect(0, 0, 1, 1); cv.fillStyle = '#000'; cv.fillStyle = c; cv.fillRect(0, 0, 1, 1); const d = cv.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; };
                const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
                return [...document.querySelectorAll('.stats-ink')].map(el => { const a = lum(rgb(getComputedStyle(el).color)), b = lum(rgb(getComputedStyle(el.closest('.stats-indicator-card, .stats-custom-panel')).backgroundColor)); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); }).filter(x => x < 4.5);
            });
            assert.deepEqual(realBad, [], 'pourcentages de « Complétude des données » en sombre');
            await statsAt(page, 'sex_distribution');
            const bars = await page.evaluate(() => [...document.querySelectorAll('.stats-chart-bar')].map(b => b.style.background || b.style.backgroundColor));
            const palRgb = await page.evaluate(pal => pal.map(c => { const d = document.createElement('i'); d.style.background = c; return d.style.background; }), pal);
            assert.ok(bars.length > 0, 'des barres');
            bars.forEach((b, i) => assert.equal(b, palRgb[i % palRgb.length], 'barre de la couleur choisie'));
            await page.screenshot({path: path.join(tmp, 'contraste-stats-sombre.png')});
            await page.close();
        });
        await t('aucune erreur (pageerror, console.error, 4xx/5xx)', () => { assert.deepEqual(errs, []); });
    } finally {
        await browser.close();
        proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    finish();
})();
