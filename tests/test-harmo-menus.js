'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🧭 Harmonisation K12, K13, K14 :
 *     node tests/test-harmo-menus.js
 *     (HARMO_MENUS_PORT=… HARMO_MENUS_SHOTS=dossier pour choisir le port et garder des captures)
 * 1. Sans navigateur : LCNDA_APP.keys (app-tips.js) écrit les touches pour Mac et pour PC (une seule écriture, jamais
 *    « ⌘V / Ctrl+V ») ; plus aucune variante dans le code : window.print() direct, nouvelle fenêtre « Imprimer », 📥 Importer,
 *    « ⋯ Plus », ⋯ qui ouvre autre chose qu'un menu, clic droit qui fait autre chose que le menu de l'app, « (⌘S) » ajouté aux bulles.
 * 2. Navigateur (si Playwright et PHP sont là), 1440 px, 390 px et sombre : la bulle de l'app (et le title remis), les touches
 *    de la page Raccourcis, « 🖨 Imprimer » d'une fiche (aperçu, A4/A5, Paysage), l'import en 3 étapes (GEDCOM des Réglages,
 *    réglage avec « ↶ Annuler »), le clic droit sur une ligne et sur un objet du dessin vectoriel ; aucune erreur JavaScript.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const vm = require('node:vm');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const js = f => fs.readFileSync(path.join(appRoot, 'assets/js', f), 'utf8');
let failed = 0;
const steps = [];
const step = (name, fn) => steps.push([name, fn]);

/* ── 1. Sans navigateur ── */
function keysFor(platform) {
    const sb = { window: {}, navigator: { platform, userAgent: '' }, HTMLElement: function () {}, SVGElement: function () {}, SVGSVGElement: function () {},
        document: { addEventListener() {}, readyState: 'complete', body: null, documentElement: {} }, MutationObserver: class { observe() {} },
        addEventListener() {}, setTimeout, clearTimeout, setInterval, clearInterval, NodeFilter: {} };
    sb.HTMLElement.prototype = {};
    vm.createContext(sb); vm.runInContext(js('app-tips.js'), sb);
    return sb.window.LCNDA_APP.keys;
}
step('touches : une seule écriture, celle de l’ordinateur (Mac et PC)', () => {
    const mac = keysFor('MacIntel'), pc = keysFor('Win32');
    assert.equal(mac.isMac, true); assert.equal(pc.isMac, false);
    const cases = [['⌘S', '⌘S', 'Ctrl+S'], ['⇧⌘Z', '⇧⌘Z', 'Ctrl+Maj+Z'], ['Mod+Shift+D', '⇧⌘D', 'Ctrl+Maj+D'], ['Ctrl+Z', '⌘Z', 'Ctrl+Z'], ['⌘V / Ctrl+V', '⌘V', 'Ctrl+V'],
        ['Enter', '↩', 'Entrée'], ['⌘↩', '⌘↩', 'Ctrl+Entrée'], ['Alt+ArrowUp', '⌥↑', 'Alt+↑'], ['Échap', 'Échap', 'Échap'], ['⌘', '⌘', 'Ctrl'], ['⌘ ou Ctrl', '⌘', 'Ctrl'], ['Mod+Alt+R', '⌥⌘R', 'Ctrl+Alt+R']];
    for (const [k, m, p] of cases) { assert.equal(mac.text(k), m, `Mac ${k}`); assert.equal(pc.text(k), p, `PC ${k}`); }
    assert.deepEqual([...pc.parts('⇧⌘S')], ['Ctrl', 'Maj', 'S']);
    assert.match(pc.html('⌘S'), /<kbd class="k-cap">Ctrl<\/kbd><kbd class="k-cap">S<\/kbd>/);
    // dans un texte : « ⌘V / Ctrl+V » ne garde qu'une écriture, un ⌘ seul aussi
    const t = pc.textHtml('Colle une capture (⌘V / Ctrl+V), ⌘ en glissant, Grouper (⌘G)');
    assert.ok(!/⌘/.test(t.replace(/data-k="[^"]*"/g, '')), t);
    assert.equal((t.match(/class="k-keys"/g) || []).length, 3);
    assert.ok(!/Ctrl.*Ctrl\+V/.test(mac.textHtml('(⌘V / Ctrl+V)').replace(/data-k="[^"]*"/g, '')));
    assert.equal(pc.textHtml('<b>x</b> ⌘S'), '&lt;b&gt;x&lt;/b&gt; ' + pc.html('⌘S'), 'le texte autour est échappé');
});
const files = fs.readdirSync(path.join(appRoot, 'assets/js')).filter(f => f.endsWith('.js'));
const all = Object.fromEntries(files.map(f => [f, js(f)]));
const grepAll = rx => files.flatMap(f => all[f].split('\n').map((l, i) => [f, i + 1, l]).filter(([, , l]) => rx.test(l)));
step('K13 : plus de window.print() ni de nouvelle fenêtre « Imprimer » hors de la fenêtre commune', () => {
    // restent permis : la fenêtre commune, les solutions de secours (sans LCNDA_UI) et « 🖨 Imprimer » des fenêtres d’export E3 des éditeurs
    const E3 = ['heritage-boards.js', 'heritage-keynote.js', 'heritage-studio.js', 'heritage-house.js'];
    const bad = grepAll(/\bwindow\.print\(\)|\.contentWindow\.print\(\)|\bw\.print\(\)/).filter(([f, , l]) => f !== 'app-actions.js' && !E3.includes(f) && !/LCNDA_UI|printDocument|printPage|openPrintDialog|\/\/ secours|replace\('<\/body>'|win\.document\.write\(doc/.test(l));
    assert.deepEqual(bad.map(([f, n]) => `${f}:${n}`), []);
    for (const f of ['heritage-livrets.js', 'heritage-pets.js', 'heritage-records.js', 'heritage-research-gaps.js', 'heritage-employers.js', 'heritage-widgets.js', 'heritage.js', 'heritage-research.js', 'app-listes.js', 'museum-viewer.js'])
        assert.match(all[f], /openPrintDialog|printPage/, f);
    assert.match(all['app.js'], /function printScreen\(/); assert.doesNotMatch(all['app.js'], /'Mod\+P','global',\(\)=>window\.print\(\)/);
    assert.doesNotMatch(all['app-listes.js'], /onclick="window\.print\(\)"/);
});
step('K13 : « ⤒ Importer » partout (plus de 📥), une seule fenêtre d’import', () => {
    assert.deepEqual(grepAll(/📥 Importer/).map(([f, n]) => `${f}:${n}`), []);
    assert.match(all['app-actions.js'], /UI\.openImportDialog = /);
    assert.match(all['app-actions.js'], /HTMLInputElement\.prototype\.click = function/);
    assert.match(all['app.js'], /function importSettingFile[\s\S]{0,300}openImportDialog/);
    assert.match(all['app-recherche.js'], /id="insee-import-form"[^>]*data-k-import/);
});
step('K14 : « ⋯ » ouvre toujours le menu de l’app ; le clic droit aussi', () => {
    assert.deepEqual(grepAll(/⋯ Plus/).map(([f, n]) => `${f}:${n}`), []);
    assert.doesNotMatch(all['heritage-boards.js'], /data-bd-shapelib title="Toutes les formes">⋯</);
    assert.match(all['heritage-house.js'], /data-hs-cmd="floormenu"[^>]*>⋯</);
    // chaque clic droit d'un outil ouvre le menu de l'app (ou bloque seulement le menu du navigateur pendant un glisser)
    const cm = grepAll(/addEventListener\('contextmenu'/).filter(([f]) => !['app-actions.js', 'app-ui.js'].includes(f));
    // le clic droit peut passer par une méthode de l'outil (« e => this.onContext(e) ») : on regarde alors dans cette méthode
    const viaMethod = (f, l) => [...l.slice(l.indexOf("'contextmenu'")).matchAll(/this\.([A-Za-z_$][\w$]*)\(/g)].some(([, name]) => { const at = all[f].search(new RegExp(`\\n\\s*(?:async\\s+)?${name}\\([\\w, ]*\\)\\s*\\{`)); return at >= 0 && /contextMenu\(|menuAt\(/.test(all[f].slice(at, at + 4000)); }); // menuAt : le menu de l'app (contextMenu n'en est qu'un raccourci)
    for (const [f, n, l] of cm) assert.ok(/contextMenu|e => e\.preventDefault\(\)\);/.test(l) || /contextMenu/.test(all[f].split('\n').slice(n - 1, n + 6).join('\n')) || viaMethod(f, l), `${f}:${n}`);
    assert.doesNotMatch(all['heritage-keynote.js'], /contextmenu', e => \{ e\.preventDefault\(\); prev\(\); \}/);
    assert.match(all['app-ui.js'], /UI\.menuAt = \(anchor, items, \{title = '', onClose = null, at = null\}/);
});
step('K12 : la bulle ne reçoit plus « (⌘S) » ajouté au title', () => {
    assert.doesNotMatch(all['app-harmony.js'], /el\.title = `\$\{t\} \(\$\{k\}\)`/);
    assert.doesNotMatch(all['heritage-editorkeys.js'], /el\.title = `\$\{t\} \(\$\{k\}\)`/);
    assert.doesNotMatch(all['app.js'], /el\.title=`\$\{el\.title\.replace/);
    // pas de double écriture écrite à la main pour les deux systèmes
    const dbl = grepAll(/⌘[A-Z0-9] ?\/ ?Ctrl ?\+ ?[A-Z0-9]|\(Ctrl[ +][A-Z0-9] sur PC\)|⌘[A-Z] \(Mac\) ou Ctrl/).filter(([f]) => f !== 'app-tips.js');
    assert.deepEqual(dbl.map(([f, n]) => `${f}:${n}`), []);
    const idx = fs.readFileSync(path.join(appRoot, 'index.php'), 'utf8');
    const at = f => idx.indexOf(`assets/js/${f}?v=`);
    assert.ok(at('app.js') >= 0 && at('app-ui.js') > at('app.js') && at('app-tips.js') > at('app-ui.js') && at('app-actions.js') > at('app-tips.js'), 'app-tips.js puis app-actions.js, après app-ui.js');
});

/* ── 2. Serveur et navigateur ── */
let chromium = null;
try { ({ chromium } = require('playwright')); } catch (_) { try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
const phpPath = findPhp([devBundledPhp()]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-harmo-menus-'));
const shots = process.env.HARMO_MENUS_SHOTS || '';
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

(async () => {
    for (const [name, fn] of steps) { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } }
    if (!phpPath || !chromium) { console.log('— navigateur : PHP ou Playwright absent, partie sautée'); process.exit(failed ? 1 : 0); }
    fs.mkdirSync(path.join(tmp, 'media'), { recursive: true });
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Joseph','Martin','male'),('Marie','Durand','female'),('<img src=x onerror=window.__xss=1>','Piège','unknown')"); $p = null;
require 'lib/bootstrap.php'; $pdo = db(); echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env: envFor(tmp) });
    if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
    const port = Number(process.env.HARMO_MENUS_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(tmp), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
    const browser = await chromium.launch();
    try {
        for (const [w, dark] of [[1440, false], [390, true]]) {
            const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
            const p = await ctx.newPage(); const errors = [];
            p.on('pageerror', e => errors.push(String(e))); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) errors.push(m.text()); });
            await p.goto(base, { waitUntil: 'load' }); await p.waitForTimeout(1800);
            if (dark) await p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
            const tag = `${w}${dark ? '-sombre' : ''}`;
            const go = (kind, id) => p.evaluate(async ([kind, id]) => { const A = window.LCNDA_APP; document.querySelectorAll('dialog[open]').forEach(d => d.close()); if (kind === 'maint') { A.state.maintenanceTab = id; await A.setModule('maintenance'); } else if (kind === 'list') { A.state.listType = id; await A.setModule('listes'); } else await A.setModule(id); }, [kind, id]).then(() => p.waitForTimeout(1200));
            await t(`${tag} K12 : la bulle de l’app (title remis après), touches de la page Raccourcis`, async () => {
                const sel = await p.evaluate(() => { const b = [...document.querySelectorAll('button[title]')].find(x => { const r = x.getBoundingClientRect(); return r.width > 0 && r.top > 0 && r.top < 800; }); if (!b) return null; b.id = b.id || 'k-probe'; return '#' + b.id; });
                assert.ok(sel, 'un bouton avec une bulle');
                const before = await p.getAttribute(sel, 'title');
                await p.hover(sel); await p.waitForTimeout(700);
                const tip = await p.evaluate(() => { const t = document.querySelector('.k-tip.is-on'); return t && { text: t.textContent, bg: getComputedStyle(t).backgroundColor }; });
                assert.ok(tip && tip.text.trim(), 'la bulle s’affiche');
                assert.equal(await p.getAttribute(sel, 'title'), null, 'pas de bulle du navigateur pendant le survol');
                if (shots) await p.screenshot({ path: path.join(shots, `k12-bulle-${tag}.png`) });
                await p.mouse.move(2, 2); await p.waitForTimeout(150);
                assert.equal(await p.getAttribute(sel, 'title'), before, 'le title est remis');
                await go('maint', 'raccourcis');
                const caps = await p.evaluate(() => [...document.querySelectorAll('.shortcut-table .k-keys')].slice(0, 30).map(k => [...k.querySelectorAll('.k-cap')].map(c => c.textContent)));
                assert.ok(caps.length > 5, 'les touches sont dessinées');
                assert.ok(caps.every(c => !c.includes('⌘')), 'sur PC, jamais ⌘');
            });
            await t(`${tag} K13 : « 🖨 Imprimer » d’une fiche (aperçu, A5, Paysage)`, async () => {
                await p.evaluate(async () => { await window.LCNDA_APP.openPersonById?.(1); }); await p.waitForTimeout(1200);
                await p.evaluate(() => { window.LCNDA_UI.printPage(''); }); await p.waitForTimeout(1500);
                assert.ok(await p.$('dialog.k-print[open] .k-print-prev iframe'), 'aperçu');
                await p.click('dialog.k-print [data-k-paper="A5"]'); await p.click('dialog.k-print [data-k-or="landscape"]'); await p.waitForTimeout(400);
                assert.equal(await p.evaluate(() => document.querySelector('dialog.k-print [data-k-or="landscape"]').classList.contains('is-active')), true);
                const doc = await p.evaluate(() => document.querySelector('dialog.k-print .k-print-prev iframe').srcdoc);
                assert.match(doc, /@page\{size:A5 landscape\}/); assert.doesNotMatch(doc, /<script/i, 'pas de script dans l’aperçu');
                if (shots) await p.locator('dialog.k-print').screenshot({ path: path.join(shots, `k13-imprimer-${tag}.png`) });
                await p.click('dialog.k-print [data-k-x]'); await p.waitForTimeout(200);
                assert.equal(await p.$('dialog.k-print[open]'), null);
            });
            await t(`${tag} K13 : importer en 3 étapes (GEDCOM des Réglages, réglage avec ↶ Annuler)`, async () => {
                await go('maint', 'import');
                await p.click('#import-gedcom-form .file-pick button'); await p.waitForTimeout(300);
                assert.match(await p.textContent('dialog.k-import [data-k-step]'), /ÉTAPE 1 SUR 3/);
                const ged = '0 HEAD\n0 @I1@ INDI\n1 NAME Jean /DUPONT/\n0 @I2@ INDI\n1 NAME Marie /DURAND/\n0 @F1@ FAM\n0 TRLR\n';
                await p.setInputFiles('dialog.k-import input[type=file]', { name: 'essai.ged', mimeType: 'text/plain', buffer: Buffer.from(ged) }); await p.waitForTimeout(500);
                assert.match(await p.textContent('dialog.k-import [data-k-step]'), /ÉTAPE 2 SUR 3/);
                assert.match(await p.textContent('dialog.k-import .ui-notice'), /Voilà ce qui va entrer : 2 personnes, 1 famille/);
                if (shots) await p.locator('dialog.k-import').screenshot({ path: path.join(shots, `k13-importer-${tag}.png`) });
                await p.click('dialog.k-import [data-k-go]'); await p.waitForTimeout(1500);
                assert.equal(await p.$('dialog.k-import[open]'), null);
                assert.match(await p.textContent('#import-result'), /INDI/, 'l’analyse habituelle a suivi');
                await go('maint', 'raccourcis');
                await p.evaluate(() => { const f = document.querySelector('[data-ui-presets]'); if (f && !f.classList.contains('is-open')) f.querySelector('[data-ps-toggle]').click(); });
                await p.click('[data-ps-import]'); await p.waitForTimeout(300);
                await p.setInputFiles('dialog.k-import input[type=file]', { name: 'r.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ lcnda: 'reglage', outil: 'raccourcis', nom: 'Mes touches <b>', version: 1, donnees: { map: {} } })) }); await p.waitForTimeout(400);
                assert.match(await p.textContent('dialog.k-import .ui-notice'), /le réglage « Mes touches <b> »/);
                await p.click('dialog.k-import [data-k-go]'); await p.waitForTimeout(600);
                assert.ok((await p.evaluate(() => [...document.querySelectorAll('.ui-presets-name b')].map(x => x.textContent))).includes('Mes touches <b>'));
            });
            await t(`${tag} K14 : clic droit sur une ligne et sur un objet du dessin`, async () => {
                await go('list', 'persons');
                const tr = await p.$('#workspace tbody tr'); assert.ok(tr); await tr.scrollIntoViewIfNeeded();
                const bb = await tr.boundingBox(); await p.mouse.click(bb.x + Math.min(60, bb.width / 2), bb.y + bb.height / 2, { button: 'right' }); await p.waitForTimeout(300);
                assert.match(await p.textContent('.ui-actmenu'), /Ouvrir/);
                await p.keyboard.press('Escape'); await p.waitForTimeout(150);
                await p.evaluate(() => window.LCNDA_EXT.openVectorEditor({})); await p.waitForTimeout(1500);
                const st = await p.$('dialog[open] .vx-stage'); assert.ok(st);
                await p.evaluate(() => document.querySelector('dialog[open] [data-vx-tool="rect"]')?.click());
                const sb = await st.boundingBox(), cx = sb.x + sb.width / 2, cy = sb.y + sb.height / 2;
                await p.mouse.move(cx - 50, cy - 30); await p.mouse.down(); await p.mouse.move(cx + 50, cy + 30, { steps: 4 }); await p.mouse.up();
                await p.evaluate(() => document.querySelector('dialog[open] [data-vx-tool="select"]')?.click());
                await p.mouse.click(cx, cy, { button: 'right' }); await p.waitForTimeout(400);
                const m = await p.textContent('.ui-actmenu');
                for (const x of ['Couper', 'Copier', 'Coller', 'Dupliquer', 'Supprimer']) assert.ok(m.includes(x), x);
                assert.ok(!m.includes('⌘'), 'touches pour PC');
                if (shots) await p.screenshot({ path: path.join(shots, `k14-editeur-${tag}.png`) });
                await p.keyboard.press('Escape');
            });
            await t(`${tag} aucune erreur JavaScript, aucun texte piégé exécuté`, async () => {
                assert.deepEqual(errors, []); assert.equal(await p.evaluate(() => window.__xss || 0), 0);
            });
            await ctx.close();
        }
    } finally { await browser.close(); proc.kill(); fs.rmSync(tmp, { recursive: true, force: true }); }
    console.log(failed ? `✗ ${failed} échec(s)` : '✓ tout est bon');
    process.exit(failed ? 1 : 0);
})();
