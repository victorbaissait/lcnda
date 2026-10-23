'use strict';
/* Harmonisation K16 (interrupteur ou case à cocher) et K17 (nombres, durées, heures).
 *     node tests/test-harmo-k16-k17.js        (HARMO_K16_SHOTS=dossier pour garder des captures)
 * 1. Le composant (bac à sable) : UI.readTime, UI.readDuration, UI.formatDuration, UI.clock, UI.timeText.
 * 2. Plus de variante dans le code (assets/js/*.js, index.php) : input type=time, unité dans le libellé
 *    (« Taille (px) », F('Durée (s)', …), C('k', 'Hauteur (px)', 'number'), label: 'Durée (min)'), unité écrite après
 *    la case ; interrupteurs bien construits ; réglages immédiats en interrupteur, options d'export en cases.
 * 3. Navigateur (Playwright, si présent) : heure, durée, nombre avec unité dans une fenêtre (valeurs enregistrées
 *    inchangées), erreur K1 pour une heure impossible, interrupteur dans Réglages → Export, unités des diagrammes,
 *    1440 px, 390 px en mode sombre, aucune erreur JavaScript.
 */
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const vm = require('node:vm');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const root = path.resolve(__dirname, '..');
const js = f => fs.readFileSync(path.join(root, 'assets/js', f), 'utf8');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

(async () => {
    /* ── 1. le composant ── */
    const Inp = function () {}; Object.defineProperty(Inp.prototype, 'value', {get() { return this._v; }, set(v) { this._v = v; }, configurable: true});
    const sandbox = {window: {}, document: {addEventListener() {}, readyState: 'loading', documentElement: {}}, HTMLInputElement: Inp, MutationObserver: function () { this.observe = () => {}; }, console};
    vm.createContext(sandbox);
    vm.runInContext(js('app-saisies.js'), sandbox, {filename: 'app-saisies.js'});
    const UI = sandbox.window.LCNDA_UI;
    await t('K17 UI.readTime : « 14 h 30 », « 14:30 », « 9h05 », « midi »… → la valeur enregistrée reste « HH:MM »', () => {
        for (const [a, v, l] of [['14 h 30', '14:30', '14 h 30'], ['14h30', '14:30', '14 h 30'], ['14:30', '14:30', '14 h 30'], ['9h05', '09:05', '9 h 05'], ['9h5', '09:05', '9 h 05'], ['1430', '14:30', '14 h 30'], ['14', '14:00', '14 h 00'],
            ['midi', '12:00', '12 h 00'], ['minuit et demie', '00:30', '0 h 30'], ['2 pm', '14:00', '14 h 00'], ['14 heures 30', '14:30', '14 h 30'], ['7.30', '07:30', '7 h 30']]) {
            const r = UI.readTime(a); assert.equal(r.ok, true, a); assert.equal(r.value, v, a); assert.equal(r.label, l, a);
        }
        assert.equal(UI.readTime(''), null);
        for (const a of ['25:00', '14:75', 'abc']) assert.equal(UI.readTime(a).ok, false, a);
        assert.match(UI.readTime('25:00').text, /heure impossible/);
        assert.equal(UI.timeText('09:05'), '9 h 05');
    });
    await t('K17 UI.readDuration : « 2 h 15 », « 1 min 30 », « 90 s », « 1:30 », « 1:05:00 », « 3\'20 », un nombre seul dans l’unité de la case', () => {
        const D = (a, o) => UI.readDuration(a, o);
        for (const [a, u, v, l] of [['2 h 15', 's', 8100, '2 h 15 min'], ['1 min 30', 's', 90, '1 min 30 s'], ['90 s', 's', 90, '1 min 30 s'], ['1:30', 's', 90, '1 min 30 s'], ['1:05:00', 's', 3900, '1 h 05 min'],
            ["3'20", 's', 200, '3 min 20 s'], ['45', 's', 45, '45 s'], ['0,8', 's', 0.8, '0,8 s'], ['800 ms', 's', 0.8, '0,8 s'], ['1:30', 'min', 90, '1 h 30 min'], ['90', 'min', 90, '1 h 30 min'],
            ['1 h 30', 'min', 90, '1 h 30 min'], ['1 min et 30 s', 's', 90, '1 min 30 s']]) {
            const r = D(a, {unit: u}); assert.equal(r.ok, true, a); assert.equal(r.value, v, a); assert.equal(r.label, l, a);
        }
        assert.equal(D('', {}), null);
        assert.equal(D('abc', {}).ok, false);
        const big = D('10', {unit: 's', max: 5}); assert.equal(big.value, 5); assert.match(big.label, /trop long : ramené à 5 s/);
        const small = D('0,1', {unit: 's', min: 1}); assert.equal(small.value, 1); assert.match(small.label, /trop court/);
        assert.equal(D('1 min 30', {unit: 'min', step: 1}).value, 2, 'arrondi au pas de la case');
        assert.equal(D('52:34', {unit: 'min', colon: 'ms'}).seconds, 52 * 60 + 34, 'deux-points = minutes:secondes si demandé');
    });
    await t('K17 UI.formatDuration et UI.clock : un seul affichage (« 3:20 », « 1:05:00 »)', () => {
        assert.equal(UI.formatDuration(90), '1 min 30 s'); assert.equal(UI.formatDuration(65), '1 min 5 s'); assert.equal(UI.formatDuration(3600), '1 h'); assert.equal(UI.formatDuration(90, {unit: 'min'}), '1 h 30 min');
        assert.equal(UI.clock(200), '3:20'); assert.equal(UI.clock(3900), '1:05:00'); assert.equal(UI.clock(0), '0:00'); assert.equal(UI.clock(3.5, {tenths: true}), '0:03,5');
    });
    await t('K16 UI.toggleHtml / UI.checkHtml', () => {
        assert.match(UI.toggleHtml('Afficher les dates', {checked: true, attrs: 'data-x'}), /^<label class="ui-toggle"><input type="checkbox" data-x checked><i><\/i><span>Afficher les dates<\/span><\/label>$/);
        assert.match(UI.checkHtml('Inclure les médias', {attrs: 'name="m"'}), /^<label class="checkbox-line"><input type="checkbox" name="m"> Inclure les médias<\/label>$/);
    });

    /* ── 2. plus de variante ── */
    const files = fs.readdirSync(path.join(root, 'assets/js')).filter(f => f.endsWith('.js') && f !== 'app-saisies.js');
    const all = Object.fromEntries(files.map(f => [f, js(f)]));
    all['index.php'] = fs.readFileSync(path.join(root, 'index.php'), 'utf8');
    const names = Object.keys(all);
    const hits = re => names.flatMap(f => [...all[f].matchAll(re)].map(m => `${f}:${all[f].slice(0, m.index).split('\n').length}: ${m[0].slice(-110)}`));
    const none = (re, msg) => assert.deepEqual(hits(re), [], msg);
    const U = String.raw`(?:en\s+)?(?:px|mm|cm|m|km|cM|Mb|s|ms|min|minutes?|secondes?|heures?|h|jours?|ans|années|mois|semaines?|%|°|pt|ppp|dpi|€|kg|g|pixels?)`;
    await t('K17 plus de champ « heure » du navigateur (input type=time)', () => none(/<input\b[^>]*type=["']?time\b/g, 'type=time → data-ui-time'));
    await t('K17 plus d’unité dans le libellé d’une case chiffrée', () => {
        none(new RegExp(String.raw`[^<>\`'"]\s*\(${U}\)\s*(?:</(?:span|b|strong|small)>\s*)?(?:<output[^>]*>[^<]*</output>\s*)?<input(?=[^>]*(?:type="(?:number|range)"|inputmode="(?:decimal|numeric)"))`, 'g'), 'libellé HTML « Taille (px) »');
        none(new RegExp(String.raw`\b(?:F|FH)\(['"][^'"]*\(${U}\)['"]\s*,\s*\`\s*<input`, 'g'), 'F(\'Durée (s)\', …)');
        none(new RegExp(String.raw`\bC\(\s*'[^']+'\s*,\s*['"][^'"]*\(${U}\)['"]\s*,\s*'(?:number|range)'`, 'g'), 'option de diagramme C(…, \'Hauteur (px)\', \'number\')');
        none(new RegExp(String.raw`label:\s*['"][^'"]*\(${U}\)['"]\s*,\s*type:\s*'(?:number|range)'`, 'g'), 'champ { label: \'Durée (min)\', type: \'number\' }');
        none(new RegExp(String.raw`(?:F|fld|n3)\(\s*(?:'[^']*',\s*)?'[^']*\((?:px|mm|cm|%|°|s)\)'`, 'g'), 'aides F / fld / n3');
    });
    await t('K17 plus d’unité écrite après une case chiffrée (« <input type=number> px »)', () => {
        none(/<input(?=[^>]*(?:type="(?:number|range)"))(?:[^>`]|\$\{[^}]*\})*>\s*(?:px|cm|mm|%|°|s|min|jours|ans|pt|€|cM)\s*(?=<\/label>|<\/span>)/g, 'unité après la case');
    });
    await t('K17 les durées des lecteurs passent par UI.clock', () => {
        for (const f of ['heritage-av.js', 'heritage-edittools.js', 'heritage-periodicals.js', 'app-puzzle.js', 'heritage-atelier-widgets.js', 'heritage-studio-av.js', 'heritage-slideshow.js']) assert.match(all[f], /LCNDA_UI\??\.clock/, f);
        for (const [f, k] of [['heritage-keynote.js', 'data-knp="transDur"'], ['heritage-slideshow.js', 'data-ss-p="dur"'], ['heritage-atelier-widgets.js', 'name="minutes"'], ['app.js', 'name="avSkipSeconds"'], ['heritage-studio-av.js', 'data-mt-k="imgdur"']]) {
            const i = all[f].indexOf(k); assert.ok(i > 0, k); const tag = all[f].slice(all[f].lastIndexOf('<input', i), i); assert.match(tag, /data-ui-duration=/, `${f} ${k} : champ de durée`);
        }
    });
    await t('K16 interrupteurs bien construits (<input type=checkbox> puis <i></i>)', () => {
        const bad = [];
        for (const f of names) for (const m of all[f].matchAll(/<label\b[^>]*class="[^"]*\bui-toggle\b[^"]*"[^>]*>\s*(<input\b(?:[^>`$]|\$\{(?:[^{}]|\{[^}]*\})*\})*>)(.{0,8})/g)) {
            if (!/type="checkbox"/.test(m[1]) || !m[2].startsWith('<i></i>')) bad.push(`${f}:${all[f].slice(0, m.index).split('\n').length}`);
        }
        assert.deepEqual(bad, []);
    });
    await t('K16 plus de « switch » ni de case appelée « toggle »', () => {
        none(/<label\b[^>]*class="(?![^"]*\bui-toggle\b)[^"]*(?:-switch|switch-|-toggle\b)[^"]*"[^>]*>\s*<input[^>]*type="checkbox"/g, 'une case appelée toggle / switch');
        none(/event-type-artistic-toggle|pm-switch/g, 'anciens noms');
    });
    const kindOf = (f, key) => { const s = all[f], i = s.indexOf(key); assert.ok(i > 0, `${f} : ${key}`); const L = s.lastIndexOf('<label', i); return s.slice(L, s.indexOf('>', L) + 1); };
    await t('K16 réglages qui s’appliquent tout de suite → interrupteur', () => {
        for (const [f, key] of [['app.js', 'Activer la sauvegarde automatique'], ['app.js', 'Masquer les personnes vivantes dans GEDCOM'], ['app.js', 'data-hide-empty-identity ${'], ['app.js', 'data-online-side'], ['app.js', 'id="person-phonetic"'],
            ['index.php', 'id="lightbox-person-photo"'], ['index.php', 'id="lightbox-tags-visible-toggle"'], ['heritage-diagrams.js', "if (o.type === 'check')"], ['heritage-studio-av.js', 'data-mt-k="mute"'], ['heritage-vector.js', 'data-vx-p="dsnap"'],
            ['heritage-house.js', 'data-hs-f="showDims"'], ['heritage-vector-map.js', 'data-vm="kmgrid"'], ['app-chronologie.js', 'id="timeline-partners"'], ['heritage-photomaps.js', 'data-pm="track"'], ['heritage-layout.js', 'data-ly-set="lockRatio"'],
            ['heritage-keynote.js', 'data-kn-k="bool"'], ['app-recherche.js', 'data-insee-auto'], ['heritage-pets.js', 'data-pp-own'], ['heritage-board-kit.js', 'data-bp-tc="header"']]) {
            const k = key.startsWith('if (') ? '<label class="ui-toggle"><input type="checkbox" ${at}' : key;
            assert.match(kindOf(f, k), /\bui-toggle\b/, `${f} : ${key}`);
        }
    });
    await t('K16 options qu’on valide par un bouton, ou choix dans une liste → case à cocher', () => {
        for (const [f, key] of [['app.js', 'name="include_media"'], ['app.js', 'name="share"'], ['app-ui.js', 'data-ui-copy'], ['index.php', 'name="date_uncertain"'], ['heritage-calendars.js', 'name="weekNumbers"'], ['heritage-vector.js', 'name="marks"']])
            assert.match(kindOf(f, key), /\bcheckbox-line\b/, `${f} : ${key}`);
    });
    await t('index.php charge app-saisies.js après app-ui.js, saisies.css après ui.css', () => {
        const idx = all['index.php'];
        assert.ok(idx.indexOf('assets/js/app-saisies.js?v=') > idx.indexOf('assets/js/app-ui.js?v=') && idx.indexOf('assets/js/app-ui.js?v=') > 0);
        assert.ok(idx.indexOf('assets/css/saisies.css?v=') > idx.indexOf('assets/css/ui.css?v='));
    });

    /* ── 3. navigateur ── */
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    const phpPath = findPhp([devBundledPhp()]);
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); console.log(`${failed ? '✗' : '✓'} harmonisation K16 / K17 : ${count} vérifications`); process.exit(failed ? 1 : 0); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-harmo-k16-'));
    const shots = process.env.HARMO_K16_SHOTS || '';
    const envFor = d => ({...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1'});
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Joseph','Martin','male','deceased'),('Marie','Durand','female','living')"); $p = null;
require 'lib/bootstrap.php'; db(); echo 'ok';`], {cwd: root, encoding: 'utf8', env: envFor(tmp)});
    if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const port = Number(process.env.HARMO_K16_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env: envFor(tmp), stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch();
    const errs = [];
    const open = async (w, dark = false) => {
        const page = await browser.newPage({viewport: {width: w, height: 900}, colorScheme: dark ? 'dark' : 'light'});
        page.on('pageerror', e => errs.push(`${w}px : ${e.message}`)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(`${w}px console : ${m.text()}`); });
        page.on('dialog', d => d.dismiss());
        await page.goto(base, {waitUntil: 'load'}); await page.waitForTimeout(1800);
        if (dark) await page.evaluate(() => { const A = window.LCNDA_APP; localStorage.setItem('genealogie-design', JSON.stringify({...A.readDesignSettings(), preset: 'dark'})); A.applyDesign(); });
        return page;
    };
    const go = (page, id) => page.evaluate(async id => { const A = window.LCNDA_APP; document.querySelectorAll('dialog[open]').forEach(d => d.close()); A.state.maintenanceTab = id; await A.setModule('maintenance'); }, id);
    const FORM = `<div class="form-grid"><label>Arrivée<input data-ui-time name="t" value="09:05" required></label><label>Durée de la transition<input data-ui-duration="s" type="number" name="d" min="0.1" max="600" step="0.1" value="90"></label>
        <label>Taille<input type="number" name="n" value="12" data-unit="px"></label><label>Hauteur (cm)<input type="number" name="h" value="150"></label><label>Minuteur<input type="number" name="m" data-ui-duration="min" min="1" value="25"></label></div>`;
    try {
        const page = await open(1440);
        await t('K17 dans une fenêtre : heure, durée, unité dans la case ; les valeurs enregistrées ne changent pas de format', async () => {
            await page.evaluate(F => { window.__sub = null; window.LCNDA_EXT.openDialog({eyebrow: 'TEST', title: 'Essai K17', body: F, onSubmit: f => { window.__sub = Object.fromEntries(new FormData(f.closest ? (f.closest('form') || f) : f)); return true; }}); }, FORM);
            await page.waitForTimeout(400);
            const st = await page.evaluate(() => { const d = document.querySelector('dialog[open]'); return {
                time: d.querySelector('.ui-hm.is-time .ui-hm-input')?.value, help: [...d.querySelectorAll('.ui-hm-help')].map(x => x.textContent),
                dur: d.querySelector('.ui-hm.is-duration .ui-hm-input')?.value, units: [...d.querySelectorAll('.ui-unit-u')].map(x => x.textContent),
                labels: [...d.querySelectorAll('label')].map(l => l.firstChild?.textContent?.trim())}; });
            assert.equal(st.time, '9 h 05'); assert.equal(st.dur, '1 min 30 s'); assert.deepEqual(st.units, ['px', 'cm']);
            assert.ok(st.help.includes('✓ Compris : 9 h 05'), st.help.join(' / '));
            assert.ok(st.labels.includes('Hauteur'), 'l’unité quitte le libellé : ' + st.labels.join(' / '));
            await page.fill('dialog[open] .ui-hm.is-time .ui-hm-input', '14h30'); await page.press('dialog[open] .ui-hm.is-time .ui-hm-input', 'Tab');
            await page.fill('dialog[open] .ui-hm.is-duration .ui-hm-input', '2 min 15'); await page.press('dialog[open] .ui-hm.is-duration .ui-hm-input', 'Tab');
            const vals = await page.evaluate(() => { const d = document.querySelector('dialog[open]'); return {t: d.querySelector('[name=t]').value, d: d.querySelector('[name=d]').value, m: d.querySelector('[name=m]').value, help: [...d.querySelectorAll('.ui-hm-help')].map(x => x.textContent)}; });
            assert.equal(vals.t, '14:30'); assert.equal(vals.d, '135'); assert.ok(vals.help.includes('✓ Compris : 2 min 15 s'));
            if (shots) await page.screenshot({path: path.join(shots, 'k17-fenetre.png')});
            await page.evaluate(() => { document.querySelector('dialog[open] [name=d]').value = 5; });
            assert.equal(await page.evaluate(() => document.querySelector('dialog[open] .ui-hm.is-duration .ui-hm-input').value), '5 s', 'champ.value = … écrit par le code met la case à jour');
        });
        await t('K17 heure impossible : « ⚠️ » dessous, et K1 empêche d’enregistrer', async () => {
            await page.fill('dialog[open] .ui-hm.is-time .ui-hm-input', '25 h'); await page.press('dialog[open] .ui-hm.is-time .ui-hm-input', 'Tab');
            const help = await page.evaluate(() => document.querySelector('dialog[open] .ui-hm.is-time .ui-hm-help').textContent);
            assert.match(help, /^⚠️ Heure impossible/);
            await page.click('dialog[open] .modal-actions button[type=submit]'); await page.waitForTimeout(300);
            const st = await page.evaluate(() => ({open: !!document.querySelector('dialog[open]'), sub: window.__sub, err: document.querySelector('dialog[open] .ui-field-error')?.textContent || ''}));
            assert.equal(st.open, true, 'la fenêtre reste ouverte'); assert.equal(st.sub, null); assert.match(st.err, /Heure impossible/);
            if (shots) await page.screenshot({path: path.join(shots, 'k17-erreur.png')});
            await page.fill('dialog[open] .ui-hm.is-time .ui-hm-input', 'midi'); await page.press('dialog[open] .ui-hm.is-time .ui-hm-input', 'Tab');
            await page.click('dialog[open] .modal-actions button[type=submit]'); await page.waitForTimeout(300);
            const sub = await page.evaluate(() => window.__sub);
            assert.ok(sub, 'enregistré'); assert.equal(sub.t, '12:00'); assert.equal(sub.d, '5'); assert.equal(sub.n, '12');
        });
        await t('K16 Réglages → Export : réglage immédiat en interrupteur, options d’export en cases', async () => {
            await go(page, 'export'); await page.waitForTimeout(900);
            const st = await page.evaluate(() => { const lab = t => [...document.querySelectorAll('#workspace label')].find(l => l.textContent.includes(t));
                const a = lab('Masquer les personnes vivantes dans GEDCOM'), b = lab('Inclure les médias');
                return {a: a?.className, aDisp: a && getComputedStyle(a).display, b: b?.className}; });
            assert.match(st.a, /ui-toggle/); assert.match(st.aDisp, /^(inline-)?flex$/, 'l’interrupteur reste sur une ligne même dans une grille'); assert.match(st.b, /checkbox-line/);
            if (shots) await page.screenshot({path: path.join(shots, 'k16-export.png')});
        });
        await t('K17 options des diagrammes : « px » dans la case, cases « oui / non » en interrupteurs', async () => {
            await page.evaluate(() => window.LCNDA_EXT.openDiagramEditor(null, {kind: 'columns'})); await page.waitForTimeout(1500);
            await page.click('.h-dg-dlg [data-dg-tab=opts]'); await page.waitForTimeout(800);
            const st = await page.evaluate(() => { const d = document.querySelector('.h-dg-dlg'); return {units: [...d.querySelectorAll('.ui-unit-u')].map(x => x.textContent), tog: d.querySelectorAll('.h-dg-opts .ui-toggle').length, bad: [...d.querySelectorAll('label')].filter(l => /\((px|%|°)\)/.test(l.textContent)).length}; });
            assert.ok(st.units.includes('px'), st.units.join(',')); assert.ok(st.tog >= 1); assert.equal(st.bad, 0);
            if (shots) await page.screenshot({path: path.join(shots, 'k17-diagramme.png')});
            await page.evaluate(() => document.querySelectorAll('.h-dg-dlg').forEach(d => { d.close(); d.remove(); }));
        });
        await page.close();
        const small = await open(390, true);
        await t('390 px en mode sombre : la fenêtre tient, pas de défilement de côté', async () => {
            await small.evaluate(F => window.LCNDA_EXT.openDialog({eyebrow: 'TEST', title: 'Essai K17', body: F, onSubmit: () => true}), FORM); await small.waitForTimeout(500);
            const ok = await small.evaluate(() => [...document.querySelectorAll('dialog[open] .ui-hm, dialog[open] .ui-unit')].every(x => x.getBoundingClientRect().right <= innerWidth + 1) && document.documentElement.scrollWidth <= innerWidth + 1);
            assert.ok(ok);
            if (shots) await small.screenshot({path: path.join(shots, 'k17-390-sombre.png')});
            await go(small, 'export'); await small.waitForTimeout(800);
            assert.ok(await small.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
            if (shots) await small.screenshot({path: path.join(shots, 'k16-390-sombre.png')});
        });
        await small.close();
        await t('aucune erreur JavaScript', () => assert.deepEqual(errs, []));
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(`${failed ? '✗' : '✓'} harmonisation K16 / K17 : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
