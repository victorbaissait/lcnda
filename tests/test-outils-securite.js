'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Non-régression de l'audit des outils (puzzle, graphiques, formes des avatars, polices, visages, thèmes) :
 *     node tests/test-outils-securite.js
 * Un vrai « php -S » sur une base neuve, puis un navigateur (Playwright ; sinon sauté) :
 *  1. puzzle : état des pièces forgé dans ce navigateur (NaN, 1e308, texte, rotation 9, ordre qui oublie des pièces) →
 *     la partie s'ouvre quand même (pièces remises en anneau, vue lisible) ; nombre de pièces forgé → message, rien d'injecté ;
 *  2. puzzle : une partie encore en lecture ne recouvre pas l'écran ouvert entre-temps (Personnes, nouvelle partie) ;
 *  3. polices (E5) : récentes forgées (null, retour à la ligne + « background:url(…) ») → pas de plantage, aucune requête ;
 *  4. visages : « ■ Arrêter » pendant le chargement du modèle → on peut relancer tout de suite (pas 3 minutes d'attente) ;
 *     fermer la fenêtre pendant le chargement → le fil de calcul est arrêté ;
 *  5. graphiques : CSV énorme (5 Mo d'une seule ligne, 100 000 lignes, formules) → borné et rapide ;
 *  6. formes des avatars : SVG de 45 000 rectangles → 400 chemins gardés, la page ne se fige pas longtemps ;
 *  7. thèmes : preset « constructor » forgé → les couleurs de départ, pas « undefined ».
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-outils-'));
const dir = path.join(tmp, 'a');
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
{
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Joseph','Martin','male')"); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
if (function_exists('imagecreatetruecolor')) { $im = imagecreatetruecolor(1200, 800); imagefill($im, 0, 0, imagecolorallocate($im, 90, 120, 200)); for ($k = 0; $k < 30; $k++) imagefilledellipse($im, ($k * 97) % 1200, ($k * 53) % 800, 120, 120, imagecolorallocate($im, ($k * 40) % 255, 90, 160)); imagejpeg($im, MEDIA_DIR . '/photo.jpg', 85); }
else { file_put_contents(MEDIA_DIR . '/photo.jpg', base64_decode('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=')); }
$pdo->exec("INSERT INTO media(title, filename, media_type) VALUES('Photo','photo.jpg','image')");
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env: envFor(dir) });
    if (r.status !== 0 || !/ok$/.test(r.stdout)) { console.error(r.stderr || r.stdout); process.exit(1); }
}
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

(async () => {
    const port = Number(process.env.OUTILS_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(dir), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let pw = null;
    for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    const out = {};
    let browser = null;
    try {
        if (!pw) { console.log('  – navigateur : sauté (Playwright absent)'); return; }
        browser = await pw.chromium.launch();
        const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
        await ctx.addInitScript(() => { window.LCNDA_FACES_TEST = { engine: 'mock', ms: 50, bootMs: 4000 }; });
        await ctx.route(/cdn\.jsdelivr\.net/, r => r.abort());
        const evil = []; ctx.on('request', r => { if (/evil\.example/.test(r.url())) evil.push(r.url()); });
        await ctx.route(/evil\.example/, r => r.fulfill({ status: 200, body: '' }));
        const page = await ctx.newPage();
        await page.addInitScript(() => { try { if (!localStorage.getItem('genealogie-reglages-presentation')) localStorage.setItem('genealogie-reglages-presentation', 'old'); } catch (_) {} }); // ce test vise la page « Apparence » d'avant, en un seul morceau
        const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_APP?.api && window.LCNDA_PUZZLE && window.LCNDA_UI?.openFontPicker);
        const csrf = await page.evaluate(() => window.LCNDA_APP.state.csrf || window.INSTALL_CSRF);
        const n = 12, st = { v: 1, cx: Array.from({ length: n }, (_, i) => i * 10), cy: Array(n).fill(-50), rot: Array(n).fill(0), grp: Array.from({ length: n }, (_, i) => i), lk: Array(n).fill(0), order: Array.from({ length: n }, (_, i) => i) };
        const meta = { name: 'Partie A', image: { key: 'm:1', url: 'media/photo.jpg', title: 'Photo', mediaId: 1, w: 1200, h: 800 }, cols: 4, rows: 3, seed: 3 };
        await page.evaluate(async ({ csrf, meta, st }) => { for (const uid of ['puz-1-aaa', 'puz-2-bbb']) await fetch('api.php?action=puzzle_write', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ op: 'save', uid, csrf, meta: { ...meta, name: 'Partie ' + uid }, state: st, saved_at: Date.now() }) }); }, { csrf, meta, st });

        /* 1. puzzle : état forgé gardé dans ce navigateur (serveur muet) */
        await page.route('**/api.php?action=puzzle_write', r => r.abort());
        const base64 = await page.evaluate(async () => { const r = await fetch('api.php?action=puzzle'); return (await r.json()).base; });
        await page.evaluate(({ b, meta }) => {
            const bad = { v: 1, cx: [NaN, 1e308, 'abc', null, 5, 6, 7, 8, 9, 10, 11, 12], cy: Array(12).fill(-50), rot: [9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], grp: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 77], lk: [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], order: [0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 99] };
            const all = { 'puz-9-forge': { op: 'save', uid: 'puz-9-forge', meta: { ...meta, id: 'puz-9-forge', name: '<img src=x onerror=window.__x=1>' }, state: bad, saved_at: Date.now() + 1e6 },
                'puz-8-cols': { op: 'save', uid: 'puz-8-cols', meta: { ...meta, id: 'puz-8-cols', cols: '<img src=x onerror=window.__x=2>', rows: 1e6 }, state: bad, saved_at: Date.now() + 1e6 }, 'x': null };
            localStorage.setItem('lcnda_puzzle-pending-v2:' + (b || 'x'), JSON.stringify(all));
        }, { b: base64, meta });
        await page.goto(base + '#jeu'); await page.waitForSelector('[data-pz-open="puz-9-forge"]', { timeout: 15000 });
        await page.click('[data-pz-open="puz-9-forge"]'); await page.waitForFunction(() => window.LCNDA_PUZZLE.debug(), null, { timeout: 15000 });
        out.forged = await page.evaluate(() => { const d = window.LCNDA_PUZZLE.debug(), p = d.pieces(); return { cam: [d.cam.s, d.cam.x, d.cam.y].every(Number.isFinite), finite: p.every(q => Number.isFinite(q.x) && Number.isFinite(q.y)), placed: d.placed, rot: p.every(q => q.rot <= 3) }; });
        await page.click('[data-pz-open="puz-8-cols"]'); await page.waitForTimeout(1500);
        out.cols = await page.evaluate(() => ({ err: !!document.querySelector('.pz-loaderr'), debug: !!window.LCNDA_PUZZLE.debug() }));
        out.xss = await page.evaluate(() => window.__x || 0);
        await page.unroute('**/api.php?action=puzzle_write');
        await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('lcnda_puzzle-pending')) localStorage.removeItem(k); });

        /* 2. puzzle : lecture lente, puis on part ailleurs */
        await page.goto(base + '#jeu'); await page.waitForSelector('[data-pz-open="puz-1-aaa"]');
        await page.route('**/api.php?action=puzzle&uid=*', async r => { await new Promise(x => setTimeout(x, 1500)); r.continue().catch(() => {}); });
        await page.click('[data-pz-open="puz-1-aaa"]'); await page.waitForTimeout(150);
        await page.evaluate(() => { location.hash = '#personnes'; }); await page.waitForTimeout(2600);
        out.away = await page.evaluate(() => ({ puzzle: !!document.querySelector('#workspace .pz-play'), hash: location.hash }));
        await page.unroute('**/api.php?action=puzzle&uid=*');

        /* 3. polices : récentes forgées */
        await page.evaluate(() => localStorage.setItem('genealogie-recent-fonts', JSON.stringify(['Arial\n;background-image:url(http://evil.example/f.png);x:y', null, 42, 'a\\', '<b>x</b>'])));
        await page.evaluate(() => { window.__fontErr = ''; window.LCNDA_UI.openFontPicker({}).catch(e => { window.__fontErr = e.message; }); });
        await page.waitForSelector('.ui-fontpick .ui-font'); await page.waitForTimeout(400);
        out.fonts = await page.evaluate(() => ({ rows: document.querySelectorAll('.ui-fontpick .ui-font').length, err: window.__fontErr, styles: [...document.querySelectorAll('.ui-fontpick .ui-font span')].slice(0, 3).map(s => s.getAttribute('style')) }));
        await page.evaluate(() => document.querySelectorAll('dialog.ui-fontpick').forEach(d => { d.close(); d.remove(); }));

        /* 4. visages : arrêter ou fermer pendant le chargement du modèle */
        await page.evaluate(() => { const W = window.Worker; let live = 0; window.__workers = () => live; window.Worker = class extends W { constructor(...a) { super(...a); live++; } terminate() { if (!this.__t) { this.__t = true; live--; } return super.terminate(); } }; });
        await page.evaluate(() => window.LCNDA_EXT.openFaces({ step: 'find' })); await page.waitForSelector('[data-fc-go]:not([disabled])', { timeout: 10000 });
        await page.click('[data-fc-go]'); await page.waitForSelector('[data-fc-stop]'); await page.waitForTimeout(300);
        await page.click('[data-fc-stop]'); await page.waitForTimeout(1000);
        out.faceStop = await page.evaluate(() => ({ goEnabled: !document.querySelector('[data-fc-go]')?.disabled, workers: window.__workers() }));
        await page.click('[data-fc-go]'); await page.waitForSelector('[data-fc-stop]'); await page.waitForTimeout(300);
        await page.keyboard.press('Escape'); await page.waitForTimeout(500);
        out.faceClose = await page.evaluate(() => ({ workers: window.__workers(), dlg: !!document.querySelector('dialog.h-faces') }));

        /* 5. graphiques : CSV énorme */
        out.csv = await page.evaluate(() => {
            const X = window.LCNDA_EXT.graphsFreeInternals; let big = 'Ville;1900\n'; for (let i = 0; i < 100000; i++) big += `"V ""${i}""";${i};=cmd|' /C calc'!A0\n`;
            let t = performance.now(); const c1 = X.parseCells(big); const ms1 = performance.now() - t;
            t = performance.now(); const c2 = X.parseCells('1;'.repeat(2.5e6)); const ms2 = performance.now() - t;
            const d = { free: null }; X.pasteFree(d, c1);
            return { rows: c1.length, ms1, cols: c2[0].length, ms2, kept: d.free.rows.length, label: d.free.rows[0].label, quoted: X.parseCells('"a;b";1')[0] };
        });

        /* 6. formes des avatars : SVG de 45 000 rectangles */
        await page.evaluate(() => { window.LCNDA_APP.state.maintenanceTab = 'design'; window.LCNDA_APP.setModule('maintenance'); });
        await page.waitForSelector('[data-shp-new]', {state: 'attached'}); await page.evaluate(() => document.querySelector('[data-shp-new]').click()); /* depuis la 0.9.0, le bouton est dans l'onglet « Le portrait », caché tant qu'on ne l'ouvre pas */ await page.click('.lc-shp-editor [data-tab="svg"]');
        await page.evaluate(() => { let s = '<svg xmlns="http://www.w3.org/2000/svg">'; for (let i = 0; i < 45000; i++) s += `<rect x="${i % 300}" y="${(i / 300) | 0}" width="1" height="1"/>`; document.querySelector('.lc-shp-editor [data-svg-text]').value = s + '</svg>'; });
        await page.waitForTimeout(1500);
        await page.evaluate(() => { window.__lt = 0; new PerformanceObserver(l => l.getEntries().forEach(e => { window.__lt = Math.max(window.__lt, e.duration); })).observe({ type: 'longtask' }); });
        await page.click('.lc-shp-editor [data-svg-read]'); await page.waitForTimeout(800);
        out.svg = await page.evaluate(() => ({ msg: document.querySelector('.lc-shp-editor [data-svg-msg]')?.innerText || '', longest: window.__lt }));
        await page.evaluate(() => document.querySelectorAll('.lc-shp-editor').forEach(d => { d.close(); d.remove(); }));

        /* 7. thèmes : preset « constructor » */
        out.theme = await page.evaluate(() => { const A = window.LCNDA_APP, d = A.readDesignSettings(); d.preset = 'constructor'; localStorage.setItem('genealogie-design', JSON.stringify(d)); A.applyDesign(); const v = document.documentElement.style.getPropertyValue('--blue'); d.preset = 'portfolio'; localStorage.setItem('genealogie-design', JSON.stringify(d)); A.applyDesign(); return v; });

        out.evil = evil; out.errors = errors;
    } finally { await browser?.close(); proc.kill(); }

    const checks = [
        ['puzzle : état forgé (NaN, 1e308, ordre abîmé) → partie lisible, pièces en anneau', () => { assert.ok(out.forged.cam); assert.ok(out.forged.finite); assert.equal(out.forged.placed, 0); assert.ok(out.forged.rot); }],
        ['puzzle : nombre de pièces forgé → message, rien de découpé', () => { assert.equal(out.cols.err, true); assert.equal(out.cols.debug, false); }],
        ['puzzle : noms piégés → rien exécuté', () => assert.equal(out.xss, 0)],
        ['puzzle : une partie encore en lecture ne recouvre pas l’écran suivant', () => { assert.match(out.away.hash, /^#personnes(\/|$)/, 'la fiche dans l’adresse : « #personnes/12 »'); assert.equal(out.away.puzzle, false); }],
        ['polices : récentes forgées → liste affichée, noms nettoyés', () => { assert.equal(out.fonts.err, ''); assert.ok(out.fonts.rows > 3); assert.ok(out.fonts.styles.every(s => { const m = s.match(/^font-family:'([^']*)', (serif|cursive)$/); return m && !/[\n;\\"]/.test(m[1]); }), out.fonts.styles.join(' | ')); }],
        ['visages : « ■ Arrêter » pendant le chargement → relançable tout de suite, fil arrêté', () => { assert.equal(out.faceStop.goEnabled, true); assert.equal(out.faceStop.workers, 0); }],
        ['visages : fermer pendant le chargement → fil arrêté', () => { assert.equal(out.faceClose.workers, 0); assert.equal(out.faceClose.dlg, false); }],
        ['graphiques : CSV énorme borné et rapide, guillemets compris', () => { assert.equal(out.csv.rows, 5000); assert.ok(out.csv.cols <= 101, String(out.csv.cols)); assert.equal(out.csv.kept, 300); assert.equal(out.csv.label, 'V "0"'); assert.deepEqual(out.csv.quoted, ['a;b', '1']); assert.ok(out.csv.ms2 < 1000, `${out.csv.ms2} ms`); }],
        ['formes : SVG de 45 000 rectangles → 400 chemins, pas de long gel', () => { assert.match(out.svg.msg, /400 chemins gardés/); assert.ok(out.svg.longest < 600, `${out.svg.longest} ms`); }],
        ['thèmes : preset « constructor » → couleur de départ', () => assert.match(out.theme, /^#[0-9a-f]{6}$/i)],
        ['aucune requête vers un site extérieur forgé', () => assert.deepEqual(out.evil, [])],
        ['aucune erreur JavaScript', () => assert.deepEqual(out.errors, [])],
    ];
    if (!pw) { fs.rmSync(tmp, { recursive: true, force: true }); return; }
    let failed = 0;
    for (const [name, fn] of checks) { try { fn(); console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n   ', e.message); } }
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(failed ? `${failed} échec(s)` : `${checks.length} vérifications réussies`);
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(1); });
