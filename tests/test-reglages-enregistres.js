'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 💾 Réglages enregistrés : « l’Apparence » et « toute l’app » (assets/js/heritage-studio.js), avec les nouveautés :
 * portraits K7, colonne K15, designs au choix A1–A8, mode simple, Accessibilité, tri et affichage des listes,
 * designs de l’Apparence (keyedPresetsFrame, app.js), défauts du site (SITE_DEFAULT_KEYS, site_defaults_allowed_keys).
 *   node tests/test-reglages-enregistres.js
 *  1. enregistrer : toutes les clés concernées sont dans le réglage (l’Apparence : seulement l’apparence ; toute l’app : tout) ;
 *  2. appliquer : tout revient (écran, localStorage), aussi après un rechargement complet ;
 *  3. exporter puis importer dans une AUTRE base (navigateur vide), par la fenêtre K13 en 3 étapes ;
 *  4. renommer, dupliquer, remplacer, supprimer + « ↶ Annuler », un vieux réglage d’avant les nouveautés ;
 *  5. jamais : le code de sortie du mode simple (même haché), qui regarde, un chemin de dossier, un Sosa multiple ;
 *  6. un fichier piégé (clés inconnues, valeurs énormes, HTML, types faux) est nettoyé ;
 *  7. les défauts du site avec les nouvelles clés (« Définir comme défaut du site », « Appliquer les défauts du site »).
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
const finish = () => { console.log(`${failed ? '✗' : '✓'} réglages enregistrés : ${count} vérifications${failed ? `, ${failed} en échec` : ''}`); process.exit(failed ? 1 : 0); };

(async () => {
    /* ═════ sans navigateur : les listes de clés ═════ */
    const keysOf = txt => [...txt.matchAll(/'([^']+)'/g)].map(m => m[1]);
    const layoutKeys = keysOf(read('assets/js/heritage-studio.js').match(/const LAYOUT_KEYS = \[([\s\S]*?)\];/)[1]);
    const siteKeys = keysOf(read('assets/js/app.js').match(/const SITE_DEFAULT_KEYS = \[([\s\S]*?)\];/)[1]);
    const serverKeys = keysOf(read('api.php').match(/function site_defaults_allowed_keys\(\): array\s*\{[^\[]*return \[([\s\S]*?)\];/)[1]);
    await t('l’Apparence garde les nouveautés de l’apparence, et pas le mode simple ni l’Accessibilité', () => {
        for (const k of ['genealogie-design', 'genealogie-portraits', 'genealogie-left-column', 'genealogie-designs', 'genealogie-avatar-shapes', 'genealogie-person-header', 'genealogie-design-custom-presets']) assert.ok(layoutKeys.includes(k), k);
        for (const k of ['genealogie-mode-simple', 'genealogie-accessibilite', 'genealogie-auto-backup-settings']) assert.ok(!layoutKeys.includes(k), k);
    });
    await t('défauts du site : les nouvelles clés envoyées par la page sont acceptées par le serveur', () => {
        for (const k of ['genealogie-portraits', 'genealogie-left-column', 'genealogie-designs', 'genealogie-mode-simple', 'genealogie-accessibilite', 'genealogie-design-custom-presets']) assert.ok(siteKeys.includes(k), k);
        assert.deepEqual(siteKeys.filter(k => !serverKeys.includes(k)), []);
    });

    /* ═════ le navigateur : deux bases (A et B), chacune son serveur ═════ */
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    let phpPath = null;
    try { const {findPhp, devBundledPhp} = require('../electron/php-server'); phpPath = findPhp([devBundledPhp()]); } catch (_) { phpPath = null; }
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); finish(); return; }
    const {phpRuntimeArgs} = require('../electron/php-server');
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const tmpAll = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-reglages-'));
    const procs = [];
    async function makeBase(name, port) {
        const dir = path.join(tmpAll, name); fs.mkdirSync(path.join(dir, 'media'), {recursive: true});
        const env = {...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
        const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Louise','BORIE','female','deceased'),('Antoine','BORIE','male','living')");
$p = null; require 'lib/bootstrap.php'; db(); echo 'ok';`], {cwd: root, encoding: 'utf8', env});
        if (r.status !== 0) throw new Error(r.stderr || r.stdout);
        port = port || await freePort();
        const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
        procs.push(proc);
        const base = `http://127.0.0.1:${port}/`;
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
        return {dir, base};
    }
    const A = await makeBase('a', Number(process.env.REGLAGES_PORT) || 0), B = await makeBase('b');
    const browser = await chromium.launch();
    const errs = [];
    const open = async (srv, ctx = null) => {
        const context = ctx || await browser.newContext({viewport: {width: 1440, height: 900}, acceptDownloads: true});
        const page = await context.newPage();
        await page.addInitScript(() => { try { if (!localStorage.getItem('genealogie-reglages-presentation')) localStorage.setItem('genealogie-reglages-presentation', 'old'); } catch (_) {} }); // ce test vise la page « Apparence » d'avant, en un seul morceau
        page.on('pageerror', e => errs.push(`${srv.base} : ${e.message}`)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(`${srv.base} console : ${m.text()}`); });
        await page.route(u => !u.toString().startsWith(srv.base), rt => rt.abort());
        await page.goto(srv.base, {waitUntil: 'load'}); await page.waitForTimeout(1200);
        return page;
    };
    const PICK = {a1: 'doux', a2: 'compacte', a3: 'trait', a4: 'acte', a5: 'genre', a6: 'contour', a7: 'petit', a8: 'zebre'};
    const KEYS = ['genealogie-design', 'genealogie-designs', 'genealogie-portraits', 'genealogie-left-column', 'genealogie-accessibilite', 'genealogie-mode-simple', 'lcnda-sort:listes:media', 'lcnda-view:listes:media', 'lcnda-listbar:listes:media', 'genealogie-auto-backup-settings', 'genealogie-sosa-multi'];
    /** beaucoup de réglages changés d'un coup */
    const setMany = page => page.evaluate(() => {
        const D = window.LCNDA_DESIGNS, G = D.read();
        Object.entries({a1: 'doux', a2: 'compacte', a3: 'trait', a4: 'acte', a5: 'genre', a6: 'contour', a7: 'petit', a8: 'zebre'}).forEach(([k, v]) => { G[k].v = v; });
        G.a1.r = 12; G.a7.size = 115; D.write(G);
        window.LCNDA_PORTRAITS.write({...window.LCNDA_PORTRAITS.read(), mode: 'rond', m: '#112233'});
        window.LCNDA_COLUMN.write({...window.LCNDA_COLUMN.read(), mode: 'nouveau', width: 360});
        window.LCNDA_EXT.access.set({size: 120, contrast: true, font: 'legible'});
        const MS = window.LCNDA_EXT.modeSimple;
        MS.write({...MS.settings(), ready: true, viewer: 2, theme: 'sepia', fs: 30, useCode: true, codeHash: MS.makeCodeHash('1234'), hiddenPhotos: [5, 6]});
        localStorage.setItem('lcnda-sort:listes:media', 'az');
        localStorage.setItem('lcnda-view:listes:media', 'cards');
        localStorage.setItem('lcnda-listbar:listes:media', JSON.stringify({q: 'ma recherche', f: {lieu: 42}, sort: 'az', view: 'cards'}));
        localStorage.setItem('genealogie-auto-backup-settings', JSON.stringify({enabled: true, dir: '/home/victor/sauvegardes', intervalMinutes: 30}));
        localStorage.setItem('genealogie-sosa-multi', JSON.stringify({2: [1, 3]}));
        localStorage.setItem('genealogie-design', JSON.stringify({...JSON.parse(localStorage.getItem('genealogie-design') || '{}'), preset: 'dark', blue: '#aa0000'}));
    });
    /** tout remis comme au départ (ici et dans la base), puis rechargé */
    const resetAll = async page => {
        await page.evaluate(async keys => {
            keys.forEach(k => localStorage.removeItem(k));
            const csrf = window.INSTALL_CSRF || window.LCNDA_APP.state.csrf || '';
            await fetch('api.php?action=save_settings', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-CSRF-Token': csrf}, body: JSON.stringify({set: {}, remove: keys.filter(k => k.startsWith('genealogie-')), csrf})});
        }, KEYS);
        await page.waitForTimeout(1300); await page.reload({waitUntil: 'load'}); await page.waitForTimeout(1000);
    };
    const screen = page => page.evaluate(() => {
        const r = document.documentElement, g = k => localStorage.getItem(k);
        return {attrs: Object.fromEntries([...r.attributes].filter(a => a.name.startsWith('data-lc')).map(a => [a.name, a.value])), cls: [...r.classList].filter(c => c.startsWith('a11y-')), sidebar: r.style.getPropertyValue('--sidebar'),
            designs: JSON.parse(g('genealogie-designs') || 'null'), portraits: window.LCNDA_PORTRAITS.read(), column: window.LCNDA_COLUMN.read(), access: window.LCNDA_EXT.access.get(), ms: window.LCNDA_EXT.modeSimple.settings(), msRaw: g('genealogie-mode-simple'),
            design: JSON.parse(g('genealogie-design') || '{}'), sort: g('lcnda-sort:listes:media'), view: g('lcnda-view:listes:media'), bar: JSON.parse(g('lcnda-listbar:listes:media') || 'null')};
    });
    const toApparence = page => page.evaluate(async () => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'design'; await A.setModule('maintenance'); });
    const frame = (page, id) => page.locator(`.ui-presets[data-ui-presets="${id}"]`);
    const LAY = 'apparence-mises-en-page', ALL = 'apparence-tous-les-reglages', DES = 'apparence';
    async function openFrame(page, id) {
        await toApparence(page); const f = frame(page, id); await f.waitFor();
        if (!/is-open/.test(await f.getAttribute('class'))) await f.locator('[data-ps-toggle]').click();
        return f;
    }
    async function saveAs(page, id, name) {
        const f = await openFrame(page, id);
        await f.locator('[data-ps-new]').click(); await f.locator('[data-ps-name]').fill(name); await f.locator('[data-ps-ok]').click();
        await f.locator('.ui-presets-name b', {hasText: name}).first().waitFor();
    }
    const rowOf = (f, name) => f.locator('li[data-i]', {has: f.page().locator('.ui-presets-name b', {hasText: new RegExp(`^${name.replace(/[()]/g, '\\$&')}$`)})});
    async function applyRow(page, id, name) {
        const f = await openFrame(page, id);
        await rowOf(f, name).locator('[data-ps-apply]').click();
        await Promise.all([page.waitForNavigation({waitUntil: 'load', timeout: 15000}), page.locator('dialog.confirm-box-dialog[open] button', {hasText: 'Appliquer'}).click()]);
        await page.waitForTimeout(1200);
    }
    async function menu(page, id, name, label) {
        const f = await openFrame(page, id);
        await rowOf(f, name).locator('[data-ps-more]').click();
        return page.locator('.ui-actmenu-i', {hasText: label}).first();
    }
    async function exportRow(page, id, name, file) {
        const item = await menu(page, id, name, 'Exporter');
        const [dl] = await Promise.all([page.waitForEvent('download'), item.click()]);
        await dl.saveAs(file); return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    /** ⤒ Importer : la fenêtre K13 en 3 étapes (déposer · voir · importer) */
    async function importFile(page, id, file) {
        const f = await openFrame(page, id);
        await f.locator('[data-ps-import]').click();
        const dlg = page.locator('dialog.k-import[open]'); await dlg.waitFor();
        assert.match(await dlg.locator('[data-k-step]').innerText(), /ÉTAPE 1 SUR 3/);
        await dlg.locator('input[type=file]').setInputFiles(file);
        await dlg.locator('[data-k-go]:not([disabled])').waitFor();
        assert.match(await dlg.locator('[data-k-step]').innerText(), /ÉTAPE 2 SUR 3/);
        await dlg.locator('[data-k-go]').click();
        await page.waitForTimeout(600);
    }
    const lsJson = (page, k) => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
    const checkAll = (s, {ms = true, lists = true, access = true} = {}) => {
        for (const [k, v] of Object.entries(PICK)) assert.equal(s.designs?.[k]?.v, v, `design ${k}`);
        assert.equal(s.attrs['data-lc-style'], 'doux'); assert.equal(s.attrs['data-lc-fiche'], 'acte'); assert.equal(s.attrs['data-lc-motion'], 'petit'); assert.equal(s.attrs['data-lc-list'], 'zebre');
        assert.equal(s.attrs['data-lc-portraits'], 'rond'); assert.equal(s.portraits.mode, 'rond'); assert.equal(s.portraits.m, '#112233');
        assert.equal(s.column.mode, 'nouveau'); assert.equal(s.column.width, 360); assert.equal(s.sidebar, '360px');
        assert.equal(s.design.preset, 'dark'); assert.equal(s.design.blue, '#aa0000');
        if (access) { assert.equal(s.access.size, 120); assert.equal(s.access.contrast, true); assert.ok(s.cls.includes('a11y-contrast') && s.cls.includes('a11y-zoom'), 'classes a11y'); }
        if (ms) { assert.equal(s.ms.theme, 'sepia'); assert.equal(s.ms.fs, 30); }
        if (lists) { assert.equal(s.sort, 'az'); assert.equal(s.view, 'cards'); assert.equal(s.bar?.sort, 'az'); assert.equal(s.bar?.view, 'cards'); }
    };
    const files = {};
    try {
        const pa = await open(A);
        let hashA = '';
        await t('1. enregistrer : l’Apparence garde toute l’apparence, rien d’autre', async () => {
            await setMany(pa); await pa.waitForTimeout(400);
            hashA = (await screen(pa)).ms.codeHash; assert.match(hashA, /^[0-9a-f]{16}:[0-9a-f]{64}$/);
            await saveAs(pa, LAY, 'Mon apparence');
            const p = (await lsJson(pa, 'genealogie-layout-profiles')).find(x => x.name === 'Mon apparence');
            for (const k of ['genealogie-design', 'genealogie-designs', 'genealogie-portraits', 'genealogie-left-column']) assert.ok(k in p.settings, k);
            for (const k of Object.keys(p.settings)) assert.ok(!/accessibilite|mode-simple|auto-backup|sosa|^lcnda-/.test(k), `pas dans l’Apparence : ${k}`);
            assert.match(p.settings['genealogie-designs'], /"a8":\{"v":"zebre"/);
        });
        await t('1. enregistrer : toute l’app garde tout ce qui se règle (designs, portraits, colonne, Accessibilité, mode simple, tri des listes)', async () => {
            await saveAs(pa, ALL, 'Tout');
            const p = (await lsJson(pa, 'genealogie-settings-profiles')).find(x => x.name === 'Tout');
            for (const k of ['genealogie-design', 'genealogie-designs', 'genealogie-portraits', 'genealogie-left-column', 'genealogie-accessibilite', 'genealogie-mode-simple', 'lcnda-sort:listes:media', 'lcnda-view:listes:media', 'lcnda-listbar:listes:media']) assert.ok(k in p.settings, k);
            assert.deepEqual(JSON.parse(p.settings['lcnda-listbar:listes:media']), {sort: 'az', view: 'cards'}, 'ni la recherche tapée ni les filtres');
        });
        await t('5. jamais dans un réglage : code de sortie (même haché), qui regarde, photos cachées, chemin de dossier, Sosa multiple', async () => {
            const all = (await lsJson(pa, 'genealogie-settings-profiles')).find(x => x.name === 'Tout'), lay = (await lsJson(pa, 'genealogie-layout-profiles')).find(x => x.name === 'Mon apparence');
            for (const p of [all, lay]) {
                const txt = JSON.stringify(p);
                assert.ok(!txt.includes(hashA.split(':')[1]) && !/codeHash/.test(txt), 'code de sortie');
                assert.ok(!/\/home\/|sauvegardes/.test(txt), 'chemin de dossier');
                assert.ok(!('genealogie-sosa-multi' in p.settings) && !('genealogie-auto-backup-settings' in p.settings));
            }
            const ms = JSON.parse(all.settings['genealogie-mode-simple']);
            for (const k of ['codeHash', 'useCode', 'viewer', 'notInTree', 'ready', 'hiddenPhotos']) assert.ok(!(k in ms), `mode simple : ${k}`);
            assert.equal(ms.theme, 'sepia');
        });
        await t('2. appliquer « l’Apparence » après tout remis comme au départ : tout revient, aussi après rechargement', async () => {
            await resetAll(pa);
            const s0 = await screen(pa); assert.deepEqual(s0.attrs, {}); assert.equal(s0.portraits.mode, 'avant'); assert.equal(s0.column.mode, 'avant');
            await applyRow(pa, LAY, 'Mon apparence');
            checkAll(await screen(pa), {ms: false, lists: false, access: false});
            await pa.reload({waitUntil: 'load'}); await pa.waitForTimeout(1200);
            const s = await screen(pa); checkAll(s, {ms: false, lists: false, access: false});
            assert.equal(s.access.size, 100, 'l’Accessibilité n’est pas dans l’Apparence');
            // la page Apparence et la page Designs disent la même chose
            await toApparence(pa); await pa.waitForSelector('[data-lck-pmode="rond"].is-active', {state: 'attached'});
            assert.equal(await pa.locator('#design-form [name="preset"]').inputValue(), 'dark');
            if (process.env.REGLAGES_SHOTS) { await openFrame(pa, LAY); await openFrame(pa, ALL); await pa.locator('#h-layouts').screenshot({path: path.join(process.env.REGLAGES_SHOTS, 'apparence-1440.png')}); await pa.locator('#h-allsets').screenshot({path: path.join(process.env.REGLAGES_SHOTS, 'toute-app-1440.png')}); }
            await pa.evaluate(async () => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'designs'; await A.setModule('maintenance'); });
            await pa.waitForSelector('#lcd-a1 > summary'); assert.match(await pa.locator('#lcd-a1 > summary').innerText(), /Doux/);
            assert.match(await pa.locator('#lcd-a8 > summary').innerText(), /Une ligne sur deux/i);
        });
        await t('2. appliquer « toute l’app » : tout revient (et le code de sortie d’ici reste celui d’ici)', async () => {
            await resetAll(pa);
            // ici, entre-temps : un autre code et une autre personne qui regarde
            const hashHere = await pa.evaluate(() => { const MS = window.LCNDA_EXT.modeSimple; const h = MS.makeCodeHash('9876'); MS.write({...MS.settings(), useCode: true, codeHash: h, viewer: 1, ready: true}); return h; });
            await pa.waitForTimeout(1300);
            await applyRow(pa, ALL, 'Tout');
            checkAll(await screen(pa));
            await pa.reload({waitUntil: 'load'}); await pa.waitForTimeout(1200);
            const s = await screen(pa); checkAll(s);
            assert.equal(s.ms.codeHash, hashHere); assert.equal(s.ms.useCode, true); assert.equal(s.ms.viewer, 1); assert.equal(s.ms.ready, true);
            assert.ok(!s.bar.q && !s.bar.f, 'la recherche tapée et les filtres ne sont pas dans le réglage');
        });
        await t('3. exporter les deux réglages (fichiers sans secret)', async () => {
            files.lay = path.join(tmpAll, 'apparence.json'); files.all = path.join(tmpAll, 'tout.json');
            const lay = await exportRow(pa, LAY, 'Mon apparence', files.lay), all = await exportRow(pa, ALL, 'Tout', files.all);
            assert.equal(lay.type, 'lcnda-mise-en-page'); assert.equal(all.type, 'lcnda-reglages');
            for (const f of [files.lay, files.all]) { const txt = fs.readFileSync(f, 'utf8'); assert.ok(!/codeHash|\/home\/|sosa-multi|"viewer"/.test(txt), f); }
            // un ensemble enregistré avant ces précautions (avec le code et un chemin) : le fichier exporté ne les a pas
            await pa.evaluate(h => { const l = JSON.parse(localStorage.getItem('genealogie-settings-profiles') || '[]'); l.push({name: 'Vieux', saved: '2025-01-01T10:00:00Z', settings: {'genealogie-mode-simple': JSON.stringify({theme: 'dark', useCode: true, codeHash: h, viewer: 2}), 'genealogie-auto-backup-settings': '{"dir":"/home/victor/x"}', 'genealogie-sosa-multi': '{"2":[1]}', 'lcnda-listbar:listes:media': '{"q":"secret","sort":"az"}'}}); localStorage.setItem('genealogie-settings-profiles', JSON.stringify(l)); }, hashA);
            const old = await exportRow(pa, ALL, 'Vieux', path.join(tmpAll, 'vieux.json'));
            assert.deepEqual(Object.keys(old.settings).sort(), ['genealogie-mode-simple', 'lcnda-listbar:listes:media']);
            assert.ok(!/codeHash|viewer|victor|secret/.test(JSON.stringify(old)), 'vieil ensemble nettoyé à l’export');
            // le design de l'Apparence (le cadre du haut) : avec les designs au choix, plus longs que 500 signes
            await saveAs(pa, DES, 'Mon design');
            files.des = path.join(tmpAll, 'design.json');
            const des = await exportRow(pa, DES, 'Mon design', files.des);
            assert.ok(des.donnees.design.a_designs.length > 500, 'un vrai réglage des designs au choix');
        });
        await t('3. importer dans une AUTRE base (navigateur vide) par la fenêtre K13, appliquer : tout revient pareil', async () => {
            const pb = await open(B);
            assert.equal(await pb.evaluate(() => localStorage.getItem('genealogie-designs')), null, 'navigateur vide');
            await importFile(pb, LAY, files.lay);
            assert.ok((await lsJson(pb, 'genealogie-layout-profiles')).some(x => x.name === 'Mon apparence'));
            await applyRow(pb, LAY, 'Mon apparence');
            checkAll(await screen(pb), {ms: false, lists: false, access: false});
            await importFile(pb, ALL, files.all);
            await applyRow(pb, ALL, 'Tout');
            await pb.reload({waitUntil: 'load'}); await pb.waitForTimeout(1200);
            const s = await screen(pb); checkAll(s);
            assert.equal(s.ms.codeHash, ''); assert.equal(s.ms.useCode, false); assert.equal(s.ms.viewer, 0, 'aucune personne de la base A');
            // le design de l'Apparence : les designs au choix reviennent entiers
            await resetAll(pb);
            await importFile(pb, DES, files.des);
            const f = await openFrame(pb, DES); await rowOf(f, 'Mon design').locator('[data-ps-apply]').click(); await pb.waitForTimeout(800);
            const d = await screen(pb);
            for (const [k, v] of Object.entries(PICK)) assert.equal(d.designs?.[k]?.v, v, `design ${k}`);
            assert.equal(d.attrs['data-lc-style'], 'doux'); assert.equal(d.portraits.mode, 'rond'); assert.equal(d.column.mode, 'nouveau');
            await pb.close();
        });
        await t('4. renommer, dupliquer, remplacer, supprimer avec « ↶ Annuler »', async () => {
            const names = async () => (await lsJson(pa, 'genealogie-layout-profiles')).map(x => x.name);
            await (await menu(pa, LAY, 'Mon apparence', 'Renommer')).click();
            const f = frame(pa, LAY); await f.locator('[data-ps-name]').fill('Apparence bis'); await f.locator('[data-ps-ok]').click();
            await pa.waitForTimeout(300); assert.ok((await names()).includes('Apparence bis') && !(await names()).includes('Mon apparence'));
            await (await menu(pa, LAY, 'Apparence bis', 'Dupliquer')).click(); await pa.waitForTimeout(300);
            assert.ok((await names()).includes('Apparence bis (2)'));
            const before = (await lsJson(pa, 'genealogie-layout-profiles')).find(x => x.name === 'Apparence bis (2)').settings;
            await pa.evaluate(() => { const D = window.LCNDA_DESIGNS, G = D.read(); G.a1.v = 'papier'; D.write(G); });
            await (await menu(pa, LAY, 'Apparence bis (2)', 'Remplacer')).click();
            await pa.locator('dialog.confirm-box-dialog[open] button', {hasText: 'Remplacer'}).click(); await pa.waitForTimeout(300);
            const after = (await lsJson(pa, 'genealogie-layout-profiles')).find(x => x.name === 'Apparence bis (2)').settings;
            assert.match(before['genealogie-designs'], /"v":"doux"/); assert.match(after['genealogie-designs'], /"a1":\{"v":"papier"/);
            await (await menu(pa, LAY, 'Apparence bis (2)', 'Supprimer')).click(); await pa.waitForTimeout(300);
            assert.ok(!(await names()).includes('Apparence bis (2)'), 'supprimé tout de suite, sans question');
            const toast = pa.locator('.toast', {hasText: 'supprimée'}).last(); await toast.waitFor();
            await toast.locator('button', {hasText: 'Annuler'}).click(); await pa.waitForTimeout(300);
            assert.ok((await names()).includes('Apparence bis (2)'), '↶ Annuler le remet');
            // même chose dans « toute l’app »
            await (await menu(pa, ALL, 'Tout', 'Dupliquer')).click(); await pa.waitForTimeout(300);
            await (await menu(pa, ALL, 'Tout (2)', 'Supprimer')).click(); await pa.waitForTimeout(300);
            const t2 = pa.locator('.toast', {hasText: 'supprimé'}).last(); await t2.waitFor(); await t2.locator('button', {hasText: 'Annuler'}).click(); await pa.waitForTimeout(300);
            assert.ok((await lsJson(pa, 'genealogie-settings-profiles')).some(x => x.name === 'Tout (2)'));
        });
        await t('4. un vieux réglage d’avant les nouveautés : les nouveautés reviennent « Comme avant », le code du mode simple reste', async () => {
            await pa.evaluate(() => {
                const old = {'genealogie-design': JSON.stringify({preset: 'soft', blue: '#3978d8'}), 'genealogie-menu-hidden': '[]'};
                const lay = JSON.parse(localStorage.getItem('genealogie-layout-profiles') || '[]'); lay.push({name: 'Ancienne', saved: '2025-01-01T10:00:00Z', settings: old}); localStorage.setItem('genealogie-layout-profiles', JSON.stringify(lay));
                const all = JSON.parse(localStorage.getItem('genealogie-settings-profiles') || '[]'); all.push({name: 'Ancien tout', saved: '2025-01-01T10:00:00Z', settings: old}); localStorage.setItem('genealogie-settings-profiles', JSON.stringify(all));
            });
            await pa.waitForTimeout(1300);
            const hashHere = (await screen(pa)).ms.codeHash; assert.ok(hashHere);
            await applyRow(pa, LAY, 'Ancienne');
            let s = await screen(pa);
            assert.deepEqual(Object.keys(s.attrs).filter(k => !k.startsWith('data-lc-col')), [], 'designs et portraits comme avant');
            assert.equal(s.portraits.mode, 'avant'); assert.equal(s.column.mode, 'avant'); assert.equal(s.design.preset, 'soft');
            assert.equal(s.access.size, 120, 'l’Accessibilité ne bouge pas (pas dans l’Apparence)'); assert.equal(s.ms.theme, 'sepia');
            await applyRow(pa, ALL, 'Ancien tout');
            s = await screen(pa);
            assert.equal(s.access.size, 100, 'Accessibilité comme avant'); assert.equal(s.sort, null);
            assert.equal(s.ms.theme, 'light', 'mode simple comme avant'); assert.equal(s.ms.codeHash, hashHere, 'son code de sortie reste'); assert.equal(s.ms.viewer, 1);
        });
        await t('6. un fichier piégé : clés inconnues, valeurs énormes, HTML, types faux, code de sortie forcé → nettoyé', async () => {
            const trap = {type: 'lcnda-reglages', version: 1, name: '<img src=x onerror=window.__xss=1>', settings: {
                'genealogie-designs': JSON.stringify({a1: {v: 'nimporte', r: 9999, acc: '#ff0000'}, a4: {v: 'acte', bh: 'grand'}, a7: {v: 'serif'}, a9: {v: 'cartes'}, a10: {v: 'journal'}, evil: {v: 1}}), // un ancien réglage (A1–A10)
                'genealogie-designs-presets': JSON.stringify([{name: 'Ancien ensemble', data: {a1: {v: 'papier'}}}]),
                'genealogie-portraits': JSON.stringify({mode: 'rond', m: 'red;background:red', radius: 1e9, evil: 1}),
                'genealogie-left-column': JSON.stringify({mode: 'nouveau', width: 99999, style: 'x'}),
                'genealogie-accessibilite': JSON.stringify({size: 9000, contrast: 'oui', font: 'Comic', evil: true, voice: 'x'.repeat(5000)}),
                'genealogie-mode-simple': JSON.stringify({theme: 'dark', useCode: true, codeHash: '0123456789abcdef:' + 'b'.repeat(64), viewer: 1, fs: 999}),
                'genealogie-menu-names': '{"a":"<script>alert(1)</script>"}', 'genealogie-menu-icons': '{"a":"url(javascript:x)"}', 'genealogie-huge': 'x'.repeat(300000), 'genealogie-num': 12, 'genealogie-obj': {a: 1},
                'inconnue': '1', '__proto__': '1', 'lcnda-listbar:listes:media': JSON.stringify({q: 'chercher', f: {lieu: 1}, sort: 'az', view: 'grand'}), 'lcnda-sort:x': 'a"b', 'lcnda-view:y': '<b>',
            }};
            const file = path.join(tmpAll, 'piege.json'); fs.writeFileSync(file, JSON.stringify(trap));
            await importFile(pa, ALL, file);
            const p = (await lsJson(pa, 'genealogie-settings-profiles')).slice(-1)[0];
            assert.ok(/img src/.test(p.name) && await pa.evaluate(() => window.__xss) === undefined, 'nom gardé comme texte, jamais exécuté');
            const keys = Object.keys(p.settings);
            for (const k of ['genealogie-menu-names', 'genealogie-menu-icons', 'genealogie-huge', 'genealogie-num', 'genealogie-obj', 'inconnue', 'lcnda-sort:x', 'lcnda-view:y']) assert.ok(!keys.includes(k), `refusée : ${k}`);
            const g = k => JSON.parse(p.settings[k]);
            assert.equal(g('genealogie-designs').a1.v, 'avant'); assert.equal(g('genealogie-designs').a4.v, 'acte'); assert.ok(!('evil' in g('genealogie-designs')));
            assert.equal(g('genealogie-designs').ver, 2); assert.equal(g('genealogie-designs').a8.v, 'cartes', 'A9 Listes → A8'); assert.equal(g('genealogie-designs').a7.v, 'avant', 'A7 police ignorée');
            assert.ok(!('a9' in g('genealogie-designs')) && !('a10' in g('genealogie-designs')) && !('acc' in g('genealogie-designs').a1), 'A10 et la couleur d’accent ignorées');
            assert.ok(!keys.includes('genealogie-designs-presets'), 'plus d’ensembles enregistrés des designs');
            assert.match(g('genealogie-portraits').m, /^#[0-9a-f]{6}$/); assert.ok(g('genealogie-portraits').radius <= 45); assert.ok(!('evil' in g('genealogie-portraits')));
            assert.ok(g('genealogie-left-column').width <= 420);
            const ac = g('genealogie-accessibilite'); assert.equal(ac.size, 160); assert.equal(ac.contrast, false); assert.equal(ac.font, 'app'); assert.ok(!('evil' in ac)); assert.ok(ac.voice.length <= 200);
            const ms = g('genealogie-mode-simple'); assert.ok(!('codeHash' in ms) && !('viewer' in ms) && !('useCode' in ms)); assert.equal(ms.fs, 40);
            assert.deepEqual(g('lcnda-listbar:listes:media'), {sort: 'az'});
            // même nettoyage dans l'Apparence (une mise en page piégée)
            const lay = path.join(tmpAll, 'piege-apparence.json'); fs.writeFileSync(lay, JSON.stringify({...trap, type: 'lcnda-mise-en-page', name: 'Piège'}));
            await importFile(pa, LAY, lay);
            const q = (await lsJson(pa, 'genealogie-layout-profiles')).find(x => x.name === 'Piège');
            assert.deepEqual(Object.keys(q.settings).sort(), ['genealogie-designs', 'genealogie-left-column', 'genealogie-portraits']);
            // un fichier qui n'en est pas un : refusé sans rien casser
            const bad = path.join(tmpAll, 'pas-un-reglage.json'); fs.writeFileSync(bad, '{"type":"autre","settings":[]}');
            const n = (await lsJson(pa, 'genealogie-layout-profiles')).length;
            const f = await openFrame(pa, LAY); await f.locator('[data-ps-import]').click();
            const dlg = pa.locator('dialog.k-import[open]'); await dlg.waitFor();
            await dlg.locator('input[type=file]').setInputFiles(bad); await pa.waitForTimeout(500);
            if (await dlg.locator('[data-k-go]:not([disabled]):visible').count()) { await dlg.locator('[data-k-go]').click(); await pa.locator('.toast', {hasText: 'pas une mise en page'}).last().waitFor(); }
            else await dlg.locator('button.icon-button[data-k-x]').click(); // la fenêtre K13 ne propose même pas de l'importer (rien dedans)
            await pa.waitForTimeout(300);
            assert.equal(await pa.locator('dialog.k-import[open]').count(), 0);
            assert.equal((await lsJson(pa, 'genealogie-layout-profiles')).length, n);
        });
        await t('7. défauts du site avec les nouvelles clés : définis, sans secret, puis appliqués d’un clic', async () => {
            await setMany(pa); await pa.waitForTimeout(1300);
            await toApparence(pa); await pa.locator('#save-site-defaults').click();
            await pa.locator('.toast', {hasText: 'défaut du site'}).last().waitFor();
            const cfg = [path.join(A.dir, 'config', 'site-defaults.json'), path.join(A.dir, 'site-defaults.json')].find(f => fs.existsSync(f)) || (() => { const all = []; const walk = d => fs.readdirSync(d, {withFileTypes: true}).forEach(e => { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/site.?defaults.*\.json$/.test(e.name)) all.push(p); }); walk(A.dir); return all[0]; })();
            assert.ok(cfg, 'fichier des défauts du site');
            const txt = fs.readFileSync(cfg, 'utf8'), st = JSON.parse(txt).settings;
            for (const k of ['genealogie-designs', 'genealogie-portraits', 'genealogie-left-column', 'genealogie-accessibilite', 'genealogie-mode-simple']) assert.ok(k in st, k);
            assert.ok(!/codeHash|"viewer"|hiddenPhotos|\/home\//.test(txt), 'rien de privé dans le défaut du site (montré à tout le monde)');
            const boot = await pa.evaluate(() => fetch('api.php?action=bootstrap').then(r => r.text()));
            assert.ok(!/codeHash/.test(boot));
            await resetAll(pa);
            assert.deepEqual((await screen(pa)).attrs, {});
            await toApparence(pa);
            await pa.locator('#apply-site-defaults').click(); await pa.waitForTimeout(600);
            const s = await screen(pa); checkAll(s, {ms: false, lists: false});
        });
        await t('390 px et sombre : les deux cadres sans débordement', async () => {
            const ctx = await browser.newContext({viewport: {width: 390, height: 800}, colorScheme: 'dark'});
            const p = await open(A, ctx);
            for (const id of [LAY, ALL]) await openFrame(p, id);
            const sel = '#h-layouts, #h-allsets, .ui-presets, .ui-presets li, .ui-presets li > button, .ui-presets-foot > *';
            const over = await p.evaluate(sel => { const W = document.documentElement.clientWidth; return Math.max(document.documentElement.scrollWidth - W, ...[...document.querySelectorAll(sel)].map(e => Math.round(e.getBoundingClientRect().right - W))); }, sel);
            assert.ok(over <= 1, `débordement de ${over}px`);
            if (process.env.REGLAGES_SHOTS) { await p.locator('#h-layouts').screenshot({path: path.join(process.env.REGLAGES_SHOTS, 'apparence-390-sombre.png')}); await p.locator('#h-allsets').screenshot({path: path.join(process.env.REGLAGES_SHOTS, 'toute-app-390-sombre.png')}); }
            await ctx.close();
        });
        await t('aucune erreur JavaScript', async () => { assert.deepEqual(errs, []); });
    } finally {
        await browser.close(); procs.forEach(p => p.kill());
        if (process.env.REGLAGES_KEEP) console.log('dossier gardé :', tmpAll); else try { fs.rmSync(tmpAll, {recursive: true, force: true}); } catch (_) {}
    }
    finish();
})();
