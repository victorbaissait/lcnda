'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Relecture avant la 0.9.1 : designs (A1–A8, là où ils sont rangés maintenant), Accessibilité et navigation.
 *   node tests/test-audit-designs-navigation.js
 *  1. sans navigateur : les correctifs de la relecture sont là (adresse abîmée, « #maintenance/__proto__ », « #mode-simple »
 *     pendant que l'app tourne, </html> en trop dans index.php, phrase abîmée de la FAQ, « onerror » ôté de l'aperçu d'impression) ;
 *  2. le navigateur (Playwright ; sinon sauté) : adresses abîmées ou piégées sans erreur ; ← → du navigateur ; « #mode-simple » ;
 *     chaque cadre de design (A4, A1, A8, A3, A2, A6, A7) : chaque carte pose son attribut, « Comme avant » n'en pose aucun,
 *     jamais la police, la taille ni les couleurs de l'Apparence ; gardé après rechargement ; réglages abîmés (illisibles, tableaux,
 *     __proto__, HTML) : l'app démarre quand même, rien n'est exécuté ; L6 « / » et Échap ; Accessibilité (classe posée, ↺) ;
 *     menu des onglets en bas et colonne à droite sans débordement à 390 px ; aperçu d'impression sans erreur rouge.
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
    /* ═════ 1. sans navigateur ═════ */
    await t('une adresse abîmée (« #%E0%A4%A ») ne lance plus d’erreur ; « __proto__ » n’est pas un module', () => {
        const src = read('assets/js/app.js');
        assert.match(src, /try\{raw=decodeURIComponent\(raw\.replace\(\/\^#\/,''\)\)\.trim\(\);\}catch\(_\)\{return null;\}/);
        assert.match(src, /if\(!Object\.hasOwn\(modules,module\)\|\|!modules\[module\]\)return null;/);
    });
    await t('« #maintenance/__proto__ », « constructor » : pas une page des Réglages', () => {
        assert.match(read('assets/js/app-maintenance.js'), /Object\.hasOwn\(em,tab\)&&typeof em\[tab\]==='function'/);
    });
    await t('« #mode-simple » tapé pendant que l’app tourne : le mode simple s’ouvre', () => {
        assert.match(read('assets/js/app.js'), /if\(location\.hash==='#mode-simple'\)\{const ms=window\.LCNDA_EXT\?\.modeSimple;/);
    });
    await t('index.php : un seul </html>, à la fin', () => {
        const s = read('index.php');
        assert.doesNotMatch(s, /<\/head><\/html>/);
        assert.equal((s.match(/<\/html>/g) || []).length, 1);
    });
    await t('FAQ des designs : plus de phrase abîmée (« traits d’suit », « femme d’sont »)', () => {
        const s = read('assets/js/heritage-more.js');
        assert.doesNotMatch(s, /d’suit|d’sont/);
    });
    await t('aperçu d’impression : les « onerror=… » de l’écran sont ôtés (plus d’erreur rouge dans la console)', () => {
        assert.match(read('assets/js/app-actions.js'), /body\.querySelectorAll\('\[onerror\], \[onload\], \[onclick\]'\)/);
    });

    /* ═════ 2. le navigateur ═════ */
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    let phpPath = null;
    try { const {findPhp, devBundledPhp} = require('../electron/php-server'); phpPath = findPhp([devBundledPhp()]); } catch (_) { phpPath = null; }
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); finish(); return; }
    const {phpRuntimeArgs} = require('../electron/php-server');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-audit-nav-'));
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Louise','BORIE','female','deceased'),('Antoine','BORIE','male','deceased'),('Marie','LEROY','female','unknown')");
$p = null; require 'lib/bootstrap.php'; db(); echo 'ok';`], {cwd: root, encoding: 'utf8', env});
    if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const port = Number(process.env.AUDIT_NAV_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch();
    let errs = [];
    const wait = ms => new Promise(res => setTimeout(res, ms));
    const open = async ({w = 1400, hash = '#dashboard', init = null, dark = false} = {}) => {
        const ctx = await browser.newContext({viewport: {width: w, height: 900}, colorScheme: dark ? 'dark' : 'light'});
        const page = await ctx.newPage();
        if (init) await page.addInitScript(init);
        page.on('pageerror', e => errs.push(`pageerror : ${e.message}`));
        page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(`console : ${m.text()}`); });
        await page.route(u => !u.toString().startsWith(base), rt => rt.abort());
        await page.goto(base + hash, {waitUntil: 'load'});
        await page.waitForFunction(() => window.LCNDA_APP?.state && document.querySelector('#workspace')?.children.length, null, {timeout: 30000});
        await page.waitForTimeout(1200);
        return {ctx, page};
    };
    const go = async (page, hash, ms = 1800) => { await page.evaluate(h => { location.hash = h; }, hash); await page.waitForTimeout(ms); };
    const lcAttrs = page => page.evaluate(() => Object.fromEntries([...document.documentElement.attributes].filter(a => a.name.startsWith('data-lc-')).map(a => [a.name, a.value])));
    const look = page => page.evaluate(() => { const r = document.documentElement, cs = getComputedStyle(r), b = getComputedStyle(document.body);
        return {fs: r.style.fontSize, ff: cs.getPropertyValue('--font-family').trim(), blue: cs.getPropertyValue('--blue').trim(), bg: cs.getPropertyValue('--bg').trim(), paper: cs.getPropertyValue('--paper').trim(), card: cs.getPropertyValue('--card-bg').trim(), bodyFont: b.fontFamily, bodySize: b.fontSize, color: b.color}; });
    const sw = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    try {
        const {ctx, page} = await open();
        await t('adresses abîmées ou piégées : aucune erreur, on arrive toujours sur une vraie page', async () => {
            errs = [];
            await go(page, '#%E0%A4%A');
            assert.ok(await page.evaluate(() => !!window.LCNDA_APP.state.module));
            for (const h of ['#maintenance/__proto__', '#maintenance/constructor', '#maintenance/toString', '#__proto__', '#constructor']) {
                await go(page, h, 2200);
                const txt = await page.evaluate(() => document.querySelector('#workspace')?.textContent || '');
                assert.doesNotMatch(txt, /is not a function|undefined/, h);
                assert.ok(txt.trim().length > 50, `${h} : une vraie page`);
            }
            assert.deepEqual(errs, []);
        });
        await t('anciennes adresses : « designs » → les fiches, « issues » → Contrôle de la base', async () => {
            await go(page, '#maintenance/designs', 2500);
            assert.equal(await page.evaluate(() => window.LCNDA_APP.state.maintenanceTab), 'design_sheets');
            await go(page, '#maintenance/issues', 2500);
            assert.equal(await page.evaluate(() => window.LCNDA_APP.state.maintenanceTab), 'controle');
        });
        await t('← → du navigateur : on revient sur les écrans visités, dans l’ordre', async () => {
            await go(page, '#dashboard');
            const seq = ['graphiques', 'listes', 'recherche'];
            for (const m of seq) { await page.click(`.main-nav [data-module="${m}"]`); await page.waitForTimeout(1300); }
            for (const m of ['listes', 'graphiques']) { await page.goBack(); await page.waitForTimeout(1300); assert.equal(await page.evaluate(() => window.LCNDA_APP.state.module), m); }
            await page.goForward(); await page.waitForTimeout(1300);
            assert.equal(await page.evaluate(() => window.LCNDA_APP.state.module), 'listes');
        });
        await t('« #mode-simple » tapé pendant que l’app tourne : le mode simple s’ouvre', async () => {
            const {ctx: c2, page: p2} = await open({hash: '#graphiques'});
            await go(p2, '#mode-simple', 2500);
            assert.equal(await p2.evaluate(() => !!document.getElementById('ms-root')), true);
            await c2.close();
        });

        const LOC = {a4: 'design_sheets', a1: 'design_sheets', a8: 'nav_menus', a3: 'nav_menus', a2: 'nav_menus', a6: 'look_msgs', a7: 'accessibilite'};
        const SUB = {a8: /Listes/, a3: /Icônes/, a2: /Densité/, a7: /Mouvement/};
        const showFrame = async id => {
            await go(page, '#maintenance/' + LOC[id], 2600);
            const sel = `[data-lcd-sec="${id}"] [data-lcd-v="avant"]`;
            for (let i = 0; i < 12 && !(await page.isVisible(sel)); i++) {
                if (SUB[id]) await page.evaluate(re => { const b = [...document.querySelectorAll('#workspace .segmented button, #workspace [role=tab]')].find(x => new RegExp(re).test(x.textContent)); b?.click(); }, SUB[id].source);
                await page.waitForTimeout(500);
            }
            assert.ok(await page.isVisible(sel), `${id} visible dans ${LOC[id]}`);
        };
        const base0 = await look(page);
        for (const id of Object.keys(LOC)) {
            await t(`${id} (${LOC[id]}) : chaque carte s’applique, « Comme avant » ne pose rien, jamais police / taille / couleurs`, async () => {
                errs = [];
                await showFrame(id);
                const vs = await page.$$eval(`[data-lcd-sec="${id}"] [data-lcd-v]`, cs => cs.map(c => c.dataset.lcdV));
                assert.ok(vs.length >= 3 && vs[0] === 'avant', vs.join());
                for (const v of vs.slice(1)) {
                    await page.click(`[data-lcd-sec="${id}"] [data-lcd-v="${v}"]`); await page.waitForTimeout(500);
                    assert.equal(await page.$eval(`[data-lcd-sec="${id}"] [data-lcd-v].is-active`, c => c.dataset.lcdV), v);
                    assert.match(await page.$eval(`[data-lcd-sec="${id}"] [data-lcd-saved]`, s => s.textContent), /Enregistré/);
                    if (id !== 'a1') assert.ok(Object.keys(await lcAttrs(page)).length > 0, `${id} ${v} pose un attribut`); // A1 va sur la fiche seulement
                    assert.deepEqual(await look(page), base0, `${id} ${v} ne touche ni police, ni taille, ni couleurs`);
                }
                await page.click(`[data-lcd-sec="${id}"] [data-lcd-v="avant"]`); await page.waitForTimeout(500);
                assert.deepEqual(await lcAttrs(page), {}, `${id} « Comme avant »`);
                assert.deepEqual(errs, []);
            });
        }
        await t('un design choisi tient après rechargement (posé avant le premier dessin)', async () => {
            await showFrame('a8');
            await page.click('[data-lcd-sec="a8"] [data-lcd-v="zebre"]'); await page.waitForTimeout(1500);
            await page.goto(base + '?r=1#dashboard'); await page.waitForTimeout(200);
            assert.equal((await lcAttrs(page))['data-lc-list'], 'zebre');
            await page.waitForTimeout(2000);
            await showFrame('a8'); await page.click('[data-lcd-sec="a8"] [data-lcd-v="avant"]'); await page.waitForTimeout(1500);
            assert.deepEqual(await lcAttrs(page), {});
        });
        const toutApp = async () => { await page.evaluate(() => [...document.querySelectorAll('#workspace .segmented button, #workspace [role=tab]')].find(b => /Toute l/.test(b.textContent))?.click()); await page.waitForTimeout(1500); };
        await t('Accessibilité : une case pose sa classe, gardée ; ↺ Remettre comme au départ l’enlève sans question', async () => {
            await go(page, '#maintenance/accessibilite', 2600); await toutApp();
            await page.click('#workspace label:has-text("Liens toujours soulignés") input', {force: true}); await page.waitForTimeout(600);
            assert.equal(await page.evaluate(() => document.documentElement.classList.contains('a11y-underline')), true);
            await page.reload(); await page.waitForTimeout(3000);
            assert.equal(await page.evaluate(() => document.documentElement.classList.contains('a11y-underline')), true);
            await go(page, '#maintenance/accessibilite', 2600); await toutApp();
            await page.click('#workspace button:has-text("Remettre comme au départ")'); await page.waitForTimeout(800);
            assert.equal(await page.evaluate(() => document.querySelectorAll('dialog[open]').length), 0);
            assert.equal(await page.evaluate(() => [...document.documentElement.classList].some(c => /^a11y-(underline|contrast|big)/.test(c))), false);
        });
        await t('L6 : « / » va dans la case, Échap la vide', async () => {
            await go(page, '#maintenance/accessibilite', 2600); await toutApp();
            await page.waitForSelector('.ui-l6 input', {timeout: 8000});
            await page.mouse.click(5, 400); await page.evaluate(() => document.activeElement?.blur?.());
            await page.keyboard.press('/');
            assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('ui-l6-q')), true);
            await page.keyboard.type('contraste'); await page.waitForTimeout(500);
            assert.ok(await page.evaluate(() => document.querySelectorAll('.ui-l6-mark').length) > 0);
            await page.keyboard.press('Escape'); await page.waitForTimeout(300);
            assert.equal(await page.$eval('.ui-l6 input', i => i.value), '');
            assert.equal(await page.evaluate(() => document.querySelectorAll('.ui-l6-mark, .ui-l6-hide').length), 0);
        });
        await t('aperçu d’impression d’une page des Réglages (⌘P) : aucune erreur rouge', async () => {
            errs = [];
            await go(page, '#maintenance/look_theme', 2600);
            await page.mouse.click(5, 400);
            await page.keyboard.press('Control+p'); await page.waitForTimeout(2500);
            assert.ok(await page.evaluate(() => !!document.querySelector('dialog[open]')));
            await page.keyboard.press('Escape'); await page.waitForTimeout(300);
            assert.deepEqual(errs, []);
        });
        await ctx.close();

        await t('réglages abîmés (illisibles, tableaux, __proto__, HTML) : l’app démarre, rien n’est exécuté', async () => {
            const KEYS = ['genealogie-designs', 'genealogie-accessibilite', 'genealogie-mode-simple', 'genealogie-design', 'genealogie-reglages-presentation', 'genealogie-menu-order', 'genealogie-menu-hidden', 'genealogie-menu-names', 'genealogie-menu-icons', 'genealogie-left-column', 'genealogie-maintenance-order', 'genealogie-topbar-buttons', 'genealogie-shortcuts', 'genealogie-custom-tabs'];
            const X = '<img src=x onerror="window.__x=1">';
            const vals = ['xx{', '[1,"a",null]', '{"__proto__":{"polluted":1}}', JSON.stringify({v: X, name: X, label: X, a8: {v: 'zebre', hover: X}, a2: {v: 'compacte', sp: -1e9}, personnes: X, navPosition: X, fontScale: '1e9', fontFamily: X, preset: '__proto__', blue: 'red;}body{display:none', tiles: [{k: X, t: X}], order: [X, '__proto__'], width: 1e9, mode: X})];
            for (const v of vals) {
                errs = [];
                const set = Object.fromEntries(KEYS.map(k => [k, v]));
                const init = `if(!sessionStorage.getItem('fz')){sessionStorage.setItem('fz','1');try{localStorage.setItem('genealogie-settings-unsent',${JSON.stringify(JSON.stringify({set, remove: []}))});}catch(e){}}`;
                const {ctx: c3, page: p3} = await open({hash: '#dashboard', init});
                for (const h of ['#maintenance/nav_menus', '#maintenance/accessibilite', '#maintenance/design_sheets', '#personnes/1']) {
                    await go(p3, h, 2000);
                    assert.ok((await p3.evaluate(() => document.querySelector('#workspace')?.textContent.trim().length)) > 50, `${v.slice(0, 20)} ${h}`);
                }
                const chk = await p3.evaluate(() => ({x: window.__x, pol: ({}).polluted, nav: document.querySelectorAll('.main-nav [data-module]').length, body: getComputedStyle(document.body).display}));
                assert.deepEqual(chk.x, undefined); assert.equal(chk.pol, undefined); assert.ok(chk.nav > 5); assert.notEqual(chk.body, 'none');
                assert.deepEqual(errs, [], v.slice(0, 30));
                // la base garde ces valeurs : on la remet propre pour la suite
                await p3.evaluate(keys => keys.forEach(k => localStorage.removeItem(k)), KEYS); await p3.waitForTimeout(1500);
                await c3.close();
            }
        });
        await t('menu des onglets en bas, colonne à droite, logo caché : rien ne déborde (1400 et 390 px, clair et sombre)', async () => {
            errs = [];
            for (const [w, dark] of [[1400, false], [390, false], [390, true]]) {
                const {ctx: c4, page: p4} = await open({w, dark, hash: '#personnes/1'});
                await p4.evaluate(() => { const d = JSON.parse(localStorage.getItem('genealogie-design') || '{}'); localStorage.setItem('genealogie-design', JSON.stringify({...d, navPosition: 'bottom', sidebarPosition: 'right', brandDisplay: 'hide'})); });
                await p4.waitForTimeout(1500); await p4.reload(); await p4.waitForTimeout(3000);
                assert.equal(await p4.evaluate(() => ['nav-bottom', 'side-right', 'brand-hidden'].every(c => document.documentElement.classList.contains(c))), true);
                assert.ok((await sw(p4)) <= 1, `${w} ${dark ? 'sombre' : 'clair'} : pas de débordement`);
                await p4.click('.main-nav [data-module="graphiques"]'); await p4.waitForTimeout(1200);
                assert.equal(await p4.evaluate(() => window.LCNDA_APP.state.module), 'graphiques');
                await p4.evaluate(() => { const d = JSON.parse(localStorage.getItem('genealogie-design') || '{}'); delete d.navPosition; delete d.sidebarPosition; delete d.brandDisplay; localStorage.setItem('genealogie-design', JSON.stringify(d)); }); await p4.waitForTimeout(1500);
                await c4.close();
            }
            assert.deepEqual(errs, []);
        });
    } finally {
        await browser.close();
        proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    finish();
})();
