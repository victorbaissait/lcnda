#!/usr/bin/env node
'use strict';
/* 🐒 Audit de nuit B — l'utilisateur pressé et les cas tordus, sur ce qui a été fait cette nuit (téléchargements A–D, cartes, éclipses,
 * poignées ⠿, langues).
 *  1. Recharger la page pendant que « 🕰 Son époque » et les lots A–D téléchargent leurs fichiers : rien dans la console
 *     (avant : « TypeError: Failed to fetch »).
 *  2. ⠿ partout : sur une page qui change sans arrêt (aperçus, images), les poignées se prennent quand même au clavier (Tab).
 *  3. Fonds de carte : un clic sur une case de « Fonds de cartes » n'écrit pas les fonds Esri (masqués au départ) comme
 *     « décochés » (le plan des adresses, lui, est vérifié par test-recherche-ordre-fonds-raccourcis.js).
 *  4. La ligne « Made with Natural Earth » sur une carte : 4 px au moins autour du texte et du bord de la carte.
 *  5. Éclipses : liens NASA au format du site (carte de l'éclipse de soleil, catalogue du siècle pour la lune, y compris le siècle
 *     qui finit à l'an 0 : « LE-0099--0000 »), avec un libellé clair, traduit dans les 7 langues.
 *  6. Langue changée vite (anglais, allemand) puis ↶ Annuler : l'en-tête de Réglages garde son 🎨, dans chaque langue.
 *  7. Ouvrir « Tout ce qui le concerne » sans Internet : la fenêtre s'ouvre vite, aucune demande au serveur ne traîne.
 *  8. 390 px sombre : la page 🧭 Mémoire et vieux papiers et sa fenêtre ne débordent pas.
 *   node tests/test-audit-nuit-b-chaos.js */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const {spawn, spawnSync} = require('child_process');
let chromium; try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
const root = path.join(__dirname, '..');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
let fails = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    if (!chromium) { console.log('— Playwright absent : essai sauté'); process.exit(0); }
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-nuitb-chaos-'));
    const net0 = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-nuitb-chaos-net-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4',
        GENEALOGY_TEST: '1', LCNDA_TEST_TD_DIR: net0, LCNDA_TEST_TELECHA_DIR: net0, GENEALOGY_TD_SIMULATE: '1'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$tag = function ($t) use ($pdo) { $s = $pdo->prepare('SELECT id FROM event_types WHERE gedcom_tag=? ORDER BY id LIMIT 1'); $s->execute([$t]); return (int) $s->fetchColumn(); };
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code) VALUES(1,'Tulle','Corrèze','France',45.267,1.770,'19272'),(2,'Verdun','Meuse','France',49.1598,5.3844,'55545')");
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','MAZAUD','male','deceased',1),(2,'Anne','LACOMBE','female','deceased',0)");
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)");
foreach ([[1,'BIRT',1890,1],[1,'DEAT',1916,2],[2,'BIRT',1895,1],[2,'DEAT',1970,1]] as [$p,$g,$y,$pl]) { $ins->execute([$p,$tag($g),(string)$y,$y,(string)$y,$pl]); }
$pdo->exec('INSERT INTO families(partner1_id, partner2_id) VALUES(1,2)');
echo 'ok';`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/ok/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 150; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    const open = async ({w = 1440, dark = false, slowData = 0} = {}) => {
        const ctx = await browser.newContext({viewport: {width: w, height: 900}, colorScheme: dark ? 'dark' : 'light'});
        await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort()); // pas d'Internet
        // slowData : les fichiers de données arrivent lentement, et un sur deux est coupé en route (comme quand la page se recharge)
        let nth = 0;
        if (slowData) await ctx.route(/\/assets\/data\/.*\.json/, async r => { await sleep(slowData); if (nth++ % 2) r.abort('failed').catch(() => {}); else r.continue().catch(() => {}); });
        await ctx.addInitScript(d => { try { localStorage.setItem('genealogie-visite-guidee', JSON.stringify({never: true, done: true})); if (d && !localStorage.getItem('genealogie-design')) localStorage.setItem('genealogie-design', JSON.stringify({preset: 'dark'})); } catch (_) {} }, dark);
        const p = await ctx.newPage();
        const mine = [];
        p.on('pageerror', e => { mine.push(e.message); errs.push(e.message); });
        p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) { mine.push(m.text()); errs.push(m.text()); } });
        p.on('dialog', d => d.dismiss());
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf, null, {timeout: 40000}); await p.waitForTimeout(800);
        return {p, ctx, mine};
    };
    try {
        await t('recharger pendant que « Son époque » et les lots A–D téléchargent : rien dans la console', async () => {
            const {p, ctx, mine} = await open({slowData: 1500});
            for (const wait of [150, 400, 700, 1000, 1300]) {
                await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); }).catch(() => {});
                await p.waitForTimeout(wait);
                await p.reload({waitUntil: 'domcontentloaded'}).catch(() => {});
                await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf, null, {timeout: 40000}).catch(() => {});
            }
            await p.waitForTimeout(2500);
            const bad = mine.filter(m => /Failed to fetch|NetworkError|Load failed|AbortError/i.test(m)); if (bad.length && process.env.NUITB_DEBUG) console.log(bad.join('\n---\n'));
            assert.deepStrictEqual(bad, []);
            await ctx.close();
        });

        const {p, ctx} = await open();
        await t('⠿ : sur une page qui change sans arrêt, les poignées se prennent quand même au clavier', async () => {
            const r = await p.evaluate(async () => {
                const ws = document.querySelector('#workspace');
                const box = document.createElement('div'); box.className = 'order-list'; box.id = 'chaos-grips';
                box.innerHTML = Array.from({length: 6}, (_, i) => `<div class="order-row" data-order-key="k${i}"><span class="order-grip" draggable="true" aria-hidden="true">⠿</span><b>Ligne ${i}</b></div>`).join('');
                const churn = document.createElement('i'); ws.append(churn, box);
                // un changement à CHAQUE tâche (comme des aperçus et des images qui arrivent sans arrêt) : un minuteur relancé à chaque fois ne partirait jamais
                let on = true; const tick = () => { if (!on) return; setTimeout(tick, 0); churn.textContent = String(Math.random()); }; tick(); // la tâche suivante est posée AVANT le changement
                const t0 = performance.now(); while (performance.now() - t0 < 1500) await new Promise(res => requestAnimationFrame(res));
                const g0 = [...box.querySelectorAll('.order-grip')].map(x => x.tabIndex); on = false;
                const g = [...box.querySelectorAll('.order-grip')].map(x => [x.tabIndex, x.getAttribute('role'), x.hasAttribute('aria-hidden')]);
                box.remove(); churn.remove(); return g.map((x, i) => [g0[i], x[1], x[2]]);
            });
            assert.ok(r.every(([ti, role, hid]) => ti === 0 && role === 'button' && !hid), JSON.stringify(r));
        });
        await t('fonds de carte : un clic dans « Fonds de cartes » ne range pas les fonds Esri parmi les décochés (ils restent masqués au départ, pas « décochés »)', async () => {
            await p.evaluate(async () => { const s = window.LCNDA_APP.state; s.maintenanceTab = 'design_maps'; await window.LCNDA_APP.setModule('maintenance'); });
            await p.waitForSelector('#tile-cat-order [data-order-key="cassini_royal"] .order-visible input', {timeout: 20000});
            await p.click('#tile-cat-order [data-order-key="cassini_royal"] .order-visible input');
            await p.waitForFunction(() => (localStorage.getItem('genealogie-tile-hidden') || '').includes('cassini_royal'), null, {timeout: 8000});
            const hidden = await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-tile-hidden') || '[]'));
            assert.ok(hidden.includes('cassini_royal'));
            assert.ok(!hidden.includes('satellite') && !hidden.includes('esri_topo'), 'Esri : masqué au départ, pas « décoché » : ' + hidden.join(','));
            // toujours masqués dans les menus (licence), tant que « Montrer les fonds Esri » n'est pas coché
            assert.ok(!(await p.evaluate(() => window.LCNDA_APP.tileLayerCategories.flatMap(c => c.items.map(i => i[0])))).includes('satellite'));
            await p.evaluate(() => localStorage.removeItem('genealogie-tile-hidden'));
        });
        await t('« Made with Natural Earth » : 4 px au moins entre le texte et le bord du cadre, et entre le cadre et le bas de la carte', async () => {
            const r = await p.evaluate(async () => {
                const host = document.createElement('div'); host.className = 'map-stage'; host.style.cssText = 'position:relative;width:300px;height:200px';
                host.innerHTML = '<img alt="" src="api.php?action=offline_tile&z=1&x=0&y=0">';
                document.querySelector('#workspace').append(host);
                window.LCNDA_EXT.fondsLibres.scan();
                const el = host.querySelector('.lfc-attr'); if (!el) { host.remove(); return null; }
                const cs = getComputedStyle(el), hr = host.getBoundingClientRect(), er = el.getBoundingClientRect();
                const o = {text: el.textContent, pt: parseFloat(cs.paddingTop), pb: parseFloat(cs.paddingBottom), pl: parseFloat(cs.paddingLeft), pr: parseFloat(cs.paddingRight), gapB: hr.bottom - er.bottom, gapR: hr.right - er.right};
                host.remove(); return o;
            });
            assert.ok(r, 'la ligne est posée'); assert.match(r.text, /Natural Earth/);
            for (const k of ['pt', 'pb', 'pl', 'pr', 'gapB', 'gapR']) assert.ok(r[k] >= 4 - 0.01, `${k} = ${r[k]}`);
        });
        await t('éclipses : liens NASA au format du site (soleil : carte de l’éclipse ; lune : catalogue du siècle, « -0099--0000 ») et libellés clairs, traduits', async () => {
            const r = await p.evaluate(() => { const E = window.LCNDA_EXT.eclipsesListe; const u = (kind, y, m = 1, d = 1) => E.nasaUrl({kind}, {y, m, d});
                return [u('solar', 1999, 8, 11), u('solar', -584, 5, 28), u('lunar', 1950), u('lunar', 2000), u('lunar', 1), u('lunar', 100), u('lunar', -50), u('lunar', 0), u('lunar', -585), u('lunar', -1999),
                    E.nasaLabel({kind: 'solar'}), E.nasaLabel({kind: 'lunar'})]; });
            assert.deepStrictEqual(r.slice(0, 10), ['https://eclipse.gsfc.nasa.gov/SEsearch/SEsearchmap.php?Ecl=19990811', 'https://eclipse.gsfc.nasa.gov/SEsearch/SEsearchmap.php?Ecl=-05840528',
                'https://eclipse.gsfc.nasa.gov/LEcat5/LE1901-2000.html', 'https://eclipse.gsfc.nasa.gov/LEcat5/LE1901-2000.html', 'https://eclipse.gsfc.nasa.gov/LEcat5/LE0001-0100.html',
                'https://eclipse.gsfc.nasa.gov/LEcat5/LE0001-0100.html', 'https://eclipse.gsfc.nasa.gov/LEcat5/LE-0099--0000.html', 'https://eclipse.gsfc.nasa.gov/LEcat5/LE-0099--0000.html',
                'https://eclipse.gsfc.nasa.gov/LEcat5/LE-0599--0500.html', 'https://eclipse.gsfc.nasa.gov/LEcat5/LE-1999--1900.html']);
            assert.match(r[10], /cette éclipse/); assert.match(r[11], /siècle/);
            const tr = await p.evaluate(() => { const I = window.LCNDA_I18N, out = {}; for (const l of ['en', 'es', 'de', 'it', 'pt', 'pl', 'nl']) { I.setLang(l, {persist: false}); out[l] = [I.t('Carte et détails de cette éclipse (NASA)'), I.t('Catalogue NASA des éclipses de lune de ce siècle'), I.t('Part cachée'), I.t('Mode consultation : rien n’est cherché sur Internet.')]; } I.setLang('fr', {persist: false}); return out; });
            for (const [l, v] of Object.entries(tr)) assert.ok(v[0] !== 'Carte et détails de cette éclipse (NASA)' && v[1] !== 'Catalogue NASA des éclipses de lune de ce siècle' && v[2] !== 'Part cachée' && !/consultation : rien/.test(v[3]), `${l} : ${v.join(' | ')}`);
        });
        await t('langue changée vite (anglais, allemand) puis ↶ Annuler : l’en-tête de « Thème et couleurs » garde son 🎨', async () => {
            await p.evaluate(async () => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'look_theme'; await A.setModule('maintenance'); }); await p.waitForTimeout(1200);
            const ico = () => p.evaluate(() => document.querySelector('#workspace .page-header h2 .ui-ph-ico')?.textContent || '');
            assert.strictEqual(await ico(), '🎨');
            await p.selectOption('select[data-lc-lang]', 'en'); await p.waitForTimeout(300);
            await p.selectOption('select[data-lc-lang]', 'de'); await p.waitForTimeout(1500);
            assert.strictEqual(await ico(), '🎨', 'en allemand');
            assert.ok(!/Thème et couleurs/.test(await p.evaluate(() => document.querySelector('#workspace .page-header h2').textContent)), 'le titre est traduit');
            await p.locator('.toast .ui-toast-btn').last().click(); await p.waitForTimeout(400);
            assert.strictEqual(await ico(), '🎨', 'tout de suite après ↶');
            await p.waitForTimeout(1200);
            assert.strictEqual(await ico(), '🎨', 'et ensuite');
            await p.evaluate(() => { localStorage.removeItem('lcnda-langue'); document.cookie = 'lcnda_lang=; max-age=0; path=/'; });
        });
        await t('« Tout ce qui le concerne » sans Internet : ouvert vite, aucune demande au serveur ne traîne (aucune ne bloque PHP)', async () => {
            await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.toutSur, null, {timeout: 40000});
            await p.waitForTimeout(8000); // le démarrage de l'app d'abord (ses propres demandes)
            const slow = []; let start = Date.now();
            const t0 = new Map();
            p.on('request', r => { if (r.url().includes('/api.php')) t0.set(r, Date.now()); });
            p.on('requestfinished', r => { if (t0.has(r)) { const ms = Date.now() - t0.get(r); if (process.env.NUITB_DEBUG) console.log('   api', new URL(r.url()).searchParams.get('action'), ms, Date.now() - start); if (ms > 6000) slow.push(`${new URL(r.url()).searchParams.get('action')} ${ms} ms`); } });
            start = Date.now();
            await p.evaluate(() => window.LCNDA_EXT.toutSur.open({person: 1}));
            await p.waitForSelector('dialog[open]', {timeout: 20000});
            const opened = Date.now() - start;
            await p.waitForTimeout(6000);
            assert.ok(opened < 8000, `ouverte en ${opened} ms`);
            assert.deepStrictEqual(slow, [], 'demandes lentes');
            await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
        });
        await ctx.close();

        await t('390 px sombre : 🧭 Mémoire et vieux papiers (Réglages) et la fenêtre de l’article gardé ne débordent pas', async () => {
            const {p: q, ctx: c2} = await open({w: 390, dark: true});
            await q.evaluate(() => window.LCNDA_EXT.telechD.openSettings());
            await q.waitForSelector('[data-td-settings-page]', {timeout: 20000}); await q.waitForTimeout(800);
            const o = await q.evaluate(() => ({doc: document.documentElement.scrollWidth - document.documentElement.clientWidth, page: (() => { const pg = document.querySelector('[data-td-settings-page]'); const r = pg.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; })(), theme: document.documentElement.dataset.theme || ''}));
            assert.ok(o.doc <= 1, `la page défile de côté : ${o.doc} px`);
            assert.ok(o.page[0] >= 0 && o.page[1] <= 391, JSON.stringify(o.page));
            const d = await q.evaluate(() => { const dlg = document.createElement('dialog'); dlg.className = 'td-dlg'; dlg.innerHTML = '<div class="td-dlg-head"><h3>Essai</h3></div><p>' + 'mot '.repeat(400) + '</p>'; document.body.appendChild(dlg); dlg.showModal(); const r = dlg.getBoundingClientRect(); const out = [r.left, r.right, innerWidth]; dlg.close(); dlg.remove(); return out; });
            assert.ok(d[0] >= 0 && d[1] <= d[2], JSON.stringify(d));
            await c2.close();
        });
        await t('aucune erreur JavaScript', () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close().catch(() => {});
        proc.kill();
        for (const d of [tmp, net0]) fs.rmSync(d, {recursive: true, force: true});
        console.log(`${fails ? '✗' : '✓'} audit de nuit B (chaos) : ${count} vérifications${fails ? `, ${fails} en échec` : ''}`);
        process.exit(fails ? 1 : 0);
    }
})();
