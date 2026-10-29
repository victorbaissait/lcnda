'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🎨 Relecture de Réglages → Apparence (« Look ») avant la 0.9.1.
 *   node tests/test-audit-apparence.js
 *  1. le code : les correctifs de la relecture sont là ;
 *  2. le navigateur (Playwright ; sinon sauté), sur une base vide à part :
 *     - Preset, couleur principale, taille, police, fond des blocs, prénom / nom du logo : l'écran change, « ✓ Enregistré »,
 *       gardé après rechargement, « ↺ Remettre comme au départ » ;
 *     - « ↶ Annuler » tient même si l'écran met du temps à se redessiner (l'ancien écran ne réécrit plus l'ancien réglage) ;
 *     - une taille absurde (« 40 », « 0 », venue d'un fichier ou d'un réglage abîmé) ne rend pas l'app illisible ;
 *     - des réglages abîmés (listes cachées, blocs des fiches, menus…) ne cassent ni la fiche ni les pages d'Apparence ;
 *     - 💾 Réglages enregistrés : l'Apparence : nom piégé sans effet, date écrite comme K4, fichier abîmé refusé,
 *       fichier piégé importé sans effet puis appliqué sans casser l'app ;
 *     - à 390 px : pas de défilement de côté sur les pages d'Apparence ; aucune erreur dans la console.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const finish = () => { console.log(`\n${count} réussi(s), ${failed} échoué(s)`); process.exit(failed ? 1 : 0); };
const LOOK_PAGES = ['look_theme', 'look_portraits', 'look_msgs', 'look_layouts', 'nav_menus', 'design_sheets', 'design_maps'];

(async () => {
    /* ═════ 1. le code ═════ */
    await t('app.js : taille bornée, « Normale » par défaut, ↶ Annuler protégé, réglages de listes relus avec soin', () => {
        const src = read('assets/js/app.js');
        assert.match(src, /Math\.min\(2,Math\.max\(0\.75,k\)\)/, 'taille du texte bornée (75 % à 200 %)');
        assert.match(src, /<option value="1" \$\{!\['0\.82'/, '« Normale » choisie quand la valeur est inconnue');
        assert.match(src, /f\.dataset\.k2Stale\)return;/, 'l’écran d’avant ne réécrit plus le réglage');
        assert.match(src, /redraw:\(\)=>\{const f=\$\('#design-form'\);if\(f\)f\.dataset\.k2Stale='1';/);
        for (const k of ['list-hidden', 'map-hidden', 'graph-diagram-hidden', 'graph-stats-hidden', 'tile-hidden', 'tile-hidden-cats', 'dashboard-widget-catalog-hidden'])
            assert.ok(src.includes(`const v=JSON.parse(localStorage.getItem('genealogie-${k}')||'[]');return Array.isArray(v)?v:[];`), k);
        assert.match(src, /if\(!Array\.isArray\(settings\.order\)\)settings\.order=\[\];if\(!Array\.isArray\(settings\.hidden\)\)settings\.hidden=\[\];/);
        assert.match(read('assets/js/app-listes.js'), /return Array\.isArray\(v\) \? v : \[\];/);
        assert.match(read('assets/js/heritage-studio.js'), /day = p => \(p\.saved && \(UI\.whenText\?\.\(p\.saved\)/, 'K4 dans les réglages enregistrés');
    });

    /* ═════ 2. le navigateur ═════ */
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    let phpPath = null;
    try { const {findPhp, devBundledPhp} = require('../electron/php-server'); phpPath = findPhp([devBundledPhp()]); } catch (_) { phpPath = null; }
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); finish(); return; }
    const {phpRuntimeArgs} = require('../electron/php-server');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-audit-look-'));
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Louise','BORIE','female','deceased'),('Antoine','BORIE','male','deceased')");
$p = null; require 'lib/bootstrap.php'; db(); echo 'ok';`], {cwd: root, encoding: 'utf8', env});
    if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const port = Number(process.env.AUDIT_LOOK_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch();
    const errs = [];
    /** un onglet ; inject = réglages posés comme s'ils venaient de la base (rien n'est envoyé à la base) */
    const open = async ({w = 1440, inject = null, slowRedraw = null} = {}) => {
        const ctx = await browser.newContext({viewport: {width: w, height: 900}, acceptDownloads: true});
        await ctx.route(u => !u.toString().startsWith(base), rt => rt.abort());
        if (inject) {
            await ctx.addInitScript(set => { let s; Object.defineProperty(window, 'LCNDA_SETTINGS', {configurable: true, get() { return s; }, set(x) { if (x && typeof x === 'object' && !Array.isArray(x)) Object.assign(x, set); s = x; }}); }, inject);
            await ctx.route(/action=save_settings/, rt => rt.fulfill({status: 200, contentType: 'application/json', body: '{"ok":true}'}));
        }
        if (slowRedraw) await ctx.route(/action=lock_candidates/, async rt => { if (slowRedraw.on) await new Promise(res => setTimeout(res, 2500)); rt.continue(); });
        await ctx.addInitScript(() => { window.alert = () => { window.__xss = 1; }; });
        const page = await ctx.newPage();
        const tag = inject ? ` (${Object.keys(inject).join(', ').slice(0, 80)})` : '';
        page.on('pageerror', e => errs.push(`${w}px${tag} : ${e.message}`));
        page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(`${w}px${tag} console : ${m.text().slice(0, 300)}`); });
        page.on('response', rs => { if (rs.status() >= 400 && rs.url().startsWith(base)) errs.push(`${w}px${tag} HTTP ${rs.status()} ${rs.url()}`); });
        page.on('dialog', d => { errs.push(`fenêtre du navigateur : ${d.message()}`); d.dismiss().catch(() => {}); });
        page.ctx = ctx;
        return page;
    };
    const go = async (page, hash, ms = 1800) => { await page.goto(base + hash, {waitUntil: 'load'}); await page.waitForTimeout(ms); };
    const look = page => page.evaluate(() => { const de = document.documentElement, cs = getComputedStyle(de), v = n => cs.getPropertyValue(n).trim().toLowerCase();
        return {blue: v('--blue'), bg: v('--bg'), card: v('--card-bg'), size: de.style.fontSize, font: v('--font-family'), first: document.querySelector('#brand-firstname')?.textContent, last: document.querySelector('#brand-lastname')?.textContent, title: document.title}; });
    const set = async (page, name, value) => { await page.evaluate(([n, v]) => { const f = document.querySelector(`#design-form [name="${n}"]`); f.value = v; f.dispatchEvent(new Event('input', {bubbles: true})); f.dispatchEvent(new Event('change', {bubbles: true})); }, [name, value]); await page.waitForTimeout(1200); };
    const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('genealogie-design') || '{}'));
    try {
        await t('Thème et couleurs : chaque réglage change l’écran, « ✓ Enregistré », gardé après rechargement, ↺ remet comme au départ', async () => {
            const p = await open();
            await go(p, '#maintenance/look_theme', 2500);
            const start = await look(p);
            await set(p, 'preset', 'archiveGreen');
            let l = await look(p); assert.equal(l.bg, '#e8f6ed', 'Preset'); assert.equal(l.blue, '#315f9f', 'couleur principale reprise du thème');
            assert.equal((await p.locator('.ui-ph-saved').innerText()).trim(), '✓ Enregistré');
            await set(p, 'blue', '#aa3300'); await set(p, 'fontScale', '1.25'); await set(p, 'fontFamily', 'georgia'); await set(p, 'cardBackground', 'archive');
            await p.fill('#design-form [name="ownerFirst"]', 'Jean<b>x</b>'); await p.waitForTimeout(900);
            await p.fill('#design-form [name="ownerLast"]', 'dupont'); await p.waitForTimeout(1200);
            l = await look(p);
            assert.equal(l.blue, '#aa3300'); assert.equal(l.size, '125%'); assert.match(l.font, /georgia/); assert.equal(l.card, '#fff7e5');
            assert.equal(l.first, 'Jean<b>x</b>', 'écrit comme texte'); assert.equal(l.last, 'dupont'); assert.equal(l.title, 'Généalogie Dupont');
            await p.waitForTimeout(2000); await p.reload({waitUntil: 'load'}); await p.waitForTimeout(2500);
            assert.deepEqual(await look(p), l, 'gardé après rechargement');
            await p.click('#reset-design'); await p.waitForTimeout(1500);
            l = await look(p); assert.equal(l.blue, start.blue); assert.equal(l.size, '100%'); assert.equal(l.first, 'MA'); assert.equal(l.title, start.title);
            await p.waitForSelector('.toast:has-text("remis comme au départ")', {timeout: 5000});
            await p.waitForTimeout(1300); await p.ctx.close();
        });
        await t('« ↶ Annuler » tient même quand l’écran met du temps à se redessiner', async () => {
            const slow = {on: false};
            const p = await open({slowRedraw: slow});
            await go(p, '#maintenance/look_theme', 2500);
            await p.fill('#design-form [name="ownerLast"]', 'Martin'); await p.waitForTimeout(1500);
            assert.equal((await stored(p)).ownerLast, 'Martin');
            slow.on = true;
            await p.locator('.toast button:has-text("Annuler")').last().click();
            await p.waitForTimeout(300);
            // pendant que l'écran se redessine, un autre changement arrive dans la page (l'ancien formulaire montre encore « Martin »)
            await p.evaluate(() => document.querySelector('#design-form [name="fontScale"]').dispatchEvent(new Event('change', {bubbles: true})));
            await p.waitForTimeout(4000);
            assert.equal((await stored(p)).ownerLast, '', 'le nom est bien retiré');
            assert.equal(await p.inputValue('#design-form [name="ownerLast"]'), '');
            slow.on = false; await p.waitForTimeout(1300); await p.ctx.close();
        });
        await t('une taille absurde (fichier, réglage abîmé) : l’app reste lisible, « Normale » proposée', async () => {
            for (const [v, want] of [['40', '200%'], ['0', '100%'], ['-3', '100%'], ['abc', '100%'], ['0.1', '75%'], ['1.13', '113%']]) {
                const p = await open({inject: {'genealogie-design': JSON.stringify({preset: 'portfolio', fontScale: v})}});
                await go(p, '#dashboard', 1500);
                assert.equal(await p.evaluate(() => document.documentElement.style.fontSize), want, `fontScale ${v}`);
                if (v === '40') { await go(p, '#maintenance/look_theme', 2200); assert.equal(await p.inputValue('#design-form [name="fontScale"]'), '1', 'menu sur « Normale »'); }
                await p.ctx.close();
            }
        });
        await t('réglages abîmés : la fiche et les pages d’Apparence s’ouvrent sans erreur', async () => {
            const before = errs.length;
            const BAD = [
                ['genealogie-list-hidden', '123'], ['genealogie-list-hidden', '{"a":{"b":1}}'], ['genealogie-menu-hidden', '{"x":1}'], ['genealogie-map-hidden', '"x"'],
                ['genealogie-person-blocks', '{"order":"abc","hidden":5,"widths":"x"}'], ['genealogie-graph-stats-hidden', '{"a":1}'],
                ['genealogie-design', '[1,2]'], ['genealogie-design', '{"preset":"constructor","blue":"red;}<\/style>","fontFamily":"local:\\"><img src=x onerror=alert(1)>"}'],
                ['genealogie-portraits', '"x"'], ['genealogie-left-column', '{"mode":"new","width":99999}'], ['genealogie-topbar-buttons', '{"order":"x","hidden":7}'],
                ['genealogie-designs', '[]'], ['genealogie-sheet-sections', '{"sections":"x","assign":5}'], ['genealogie-sheet-head', '{"order":5}'],
                ['genealogie-design-custom-presets', '{"custom":{"my_a":{"name":{"x":1},"blue":5}}}'], ['genealogie-layout-profiles', '[null,{"name":5}]'],
            ];
            for (const [k, v] of BAD) {
                const p = await open({inject: {[k]: v}});
                for (const h of ['#personnes/1', '#maintenance/look_theme', '#maintenance/design_sheets', '#maintenance/nav_menus']) {
                    await go(p, h, 2000);
                    assert.ok(await p.evaluate(() => (document.querySelector('#workspace')?.innerText || '').length > 40), `${k} = ${v} : ${h} vide`);
                }
                assert.equal(await p.evaluate(() => window.__xss || 0), 0, `${k} : rien d’exécuté`);
                await p.ctx.close();
            }
            assert.deepEqual(errs.slice(before), []);
        });
        await t('💾 Réglages enregistrés : l’Apparence — nom piégé, date K4, fichier abîmé, fichier piégé, appliquer', async () => {
            const p = await open();
            await go(p, '#maintenance/look_layouts', 2500);
            const fr = p.locator('#h-layouts .ui-presets');
            if (!(await fr.locator('[data-ps-new]').count())) await fr.locator('[data-ps-toggle]').click();
            await fr.locator('[data-ps-new]').click();
            await fr.locator('[data-ps-name]').fill('<img src=x onerror="alert(1)">Mon look'); await fr.locator('[data-ps-ok]').click(); await p.waitForTimeout(800);
            const row = await fr.locator('.ui-presets-name').first().innerText();
            assert.match(row, /^<img src=x onerror="alert\(1\)">Mon look/, 'le nom reste du texte');
            assert.match(row, /aujourd’hui à \d+ h \d\d/, 'date K4'); assert.doesNotMatch(row, /\d{4}-\d\d-\d\dT/, 'pas de date ISO');
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-audit-look-f-'));
            fs.writeFileSync(path.join(dir, 'abime.json'), '{pas du json');
            fs.writeFileSync(path.join(dir, 'piege.json'), JSON.stringify({type: 'lcnda-mise-en-page', version: 1, name: '<b>Piégé</b><img src=x onerror=alert(2)>', author: '<i>x</i>', settings: {
                'genealogie-design': JSON.stringify({preset: 'archiveRed', fontScale: '40', ownerFirst: 'Zoé', blue: '#123456'}),
                'genealogie-menu-names': JSON.stringify({personnes: '<script>alert(3)</script>'}), 'genealogie-person-badge-colors': '{"sosa":"url(javascript:alert(1))"}',
                'genealogie-auto-backup-settings': '{"dir":"/etc"}', 'genealogie-portraits': '{"mode":"rond","size":"9999"}', 'genealogie-list-hidden': '123', 'genealogie-person-blocks': '{"order":"abc"}'}}));
            const importFile = async f => {
                await fr.locator('[data-ps-import]').click(); await p.waitForTimeout(700);
                await p.locator('dialog[open] input[type=file]').first().setInputFiles(path.join(dir, f)); await p.waitForTimeout(1200);
                const dlg = p.locator('dialog[open]'), txt = await dlg.innerText(), go2 = dlg.locator('button:has-text("Importer")').last();
                if (await go2.isEnabled()) { await go2.click(); await p.waitForTimeout(1000); } else await dlg.getByRole('button', {name: 'Annuler', exact: true}).last().click();
                return txt;
            };
            assert.match(await importFile('abime.json'), /⛔|n’est pas|illisible|abîmé/i, 'fichier abîmé refusé');
            await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
            await importFile('piege.json');
            assert.match((await p.locator('.toast').allInnerTexts()).join(' '), /importée[\s\S]*illisibles? laissés? de côté/, 'ce qui est illisible est laissé de côté');
            const names = await fr.locator('.ui-presets-name').allInnerTexts();
            assert.ok(names.some(n => n.startsWith('<b>Piégé</b><img src=x onerror=alert(2)>')), 'nom importé écrit comme texte');
            const kept = await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-layout-profiles')).find(x => /Piégé/.test(x.name)).settings);
            assert.ok(!('genealogie-menu-names' in kept) && !('genealogie-person-badge-colors' in kept) && !('genealogie-auto-backup-settings' in kept), Object.keys(kept).join(', '));
            // appliquer le fichier piégé : l'app se recharge, lisible
            const rows = fr.locator('li[data-i]');
            for (let i = 0; i < await rows.count(); i++) if (/Piégé/.test(await rows.nth(i).innerText())) { await rows.nth(i).locator('[data-ps-apply]').click(); break; }
            await p.waitForTimeout(600); await p.locator('dialog[open] button:has-text("Appliquer")').click();
            await p.waitForTimeout(3500); await p.waitForLoadState('load'); await p.waitForTimeout(1500);
            const l = await look(p);
            assert.equal(l.first, 'Zoé'); assert.equal(l.blue, '#123456');
            assert.ok(['200%', '82%', '100%'].includes(l.size), `taille lisible : ${l.size}`);
            assert.equal(await p.evaluate(() => window.__xss || 0), 0, 'rien d’exécuté');
            // revenir au premier
            await go(p, '#maintenance/look_layouts', 2500);
            const fr2 = p.locator('#h-layouts .ui-presets'); if (!(await fr2.locator('li[data-i]').count())) await fr2.locator('[data-ps-toggle]').click();
            const r2 = fr2.locator('li[data-i]');
            for (let i = 0; i < await r2.count(); i++) if (/Mon look/.test(await r2.nth(i).innerText())) { await r2.nth(i).locator('[data-ps-apply]').click(); break; }
            await p.waitForTimeout(600); await p.locator('dialog[open] button:has-text("Appliquer")').click(); await p.waitForTimeout(3500); await p.waitForTimeout(1500);
            assert.equal((await look(p)).first, 'MA', 'remis');
            await p.ctx.close();
        });
        await t('390 px : aucune page d’Apparence ne défile de côté', async () => {
            const p = await open({w: 390});
            const bad = [];
            for (const pg of LOOK_PAGES) {
                await go(p, `#maintenance/${pg}`, 2200);
                const o = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
                if (o > 1) bad.push(`${pg} : ${o} px`);
            }
            assert.deepEqual(bad, []);
            await p.ctx.close();
        });
        await t('aucune erreur dans la console pendant tout le test', () => { assert.deepEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    finish();
})();
