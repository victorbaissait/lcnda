'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Harmonisation K1 (erreurs dans les formulaires) et K6 (fenêtres) :   node tests/test-harmo-formulaires.js
 * 1. Fichiers : le composant (assets/js/app-forms.js) est chargé ; plus de « toast('Donne…', 'error'); return false; »
 *    pour un champ ; plus de largeur de fenêtre écrite à la main (min(820px…)) : seulement --modal-s/m/l/xl/win ;
 *    pas de style="max-width" sur une fenêtre d'index.php.
 * 2. Navigateur (si Playwright est installé ; sinon sauté), vraie app sur une base temporaire :
 *    - K1 : required + min/max d'une fenêtre openDialog → pas de bulle, champs encadrés, phrase dessous, « 2 choses à
 *      corriger », curseur dans le premier, fenêtre ouverte, l'erreur s'efface quand on corrige ; UI.fail sur un menu de
 *      choix ; throw UI.invalid → sous le champ, pas de toast ; fiche Personne sans nom → sous « Prénom ».
 *    - K6 : 540 / 760 / 1040 / 1180 ; le bas reste visible quand on fait défiler ; « Fermer » seul sans onSubmit ;
 *      une fenêtre sans bas en reçoit un ; aucune erreur de page.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(appRoot, f), 'utf8');
const results = [];
const check = (name, fn) => { try { fn(); results.push(['ok', name]); } catch (e) { results.push(['ÉCHEC', name, e.message]); } };

/* ─── 1. Fichiers ─── */
const jsDir = path.join(appRoot, 'assets/js'), cssDir = path.join(appRoot, 'assets/css');
const jsFiles = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));
check('app-forms.js chargé après app-ui.js dans index.php', () => {
    const idx = read('index.php'), a = idx.indexOf('assets/js/app-ui.js'), b = idx.indexOf('assets/js/app-forms.js');
    assert.ok(a > 0 && b > a, 'app-forms.js absent ou avant app-ui.js');
});
check('API du composant', () => {
    const s = read('assets/js/app-forms.js');
    for (const k of ['fieldError', 'fail', 'invalid', 'validateForm', 'formErrors', 'clearFieldError', 'clearFormErrors', 'showFormError']) assert.ok(new RegExp(`\\b${k}\\b`).test(s), k);
    assert.match(s, /addEventListener\('invalid'/);
});
check('plus de toast d’erreur pour un champ dans une fenêtre (« toast(\'Donne…\', \'error\'); return false; »)', () => {
    const re = /\{\s*(?:A\(\)\.)?toast\((['`])(Donne|Choisis|Indique|Écris|Coche|Colle|Il faut un titre)[^'`]*\1,\s*'error'\);\s*(?:[^;{}]*\.focus\(\);\s*)?return false;\s*\}/g;
    const left = [];
    for (const f of jsFiles) { const s = fs.readFileSync(path.join(jsDir, f), 'utf8'); let m; while ((m = re.exec(s))) left.push(`${f}: ${m[0].slice(0, 70)}`); }
    assert.equal(left.length, 0, left.join('\n'));
});
check('openDialog : erreur sous le champ, « Fermer » seul sans onSubmit', () => {
    const s = read('assets/js/heritage.js');
    assert.match(s, /showFormError\?\.\(error, form\)/);
    assert.match(s, /closeLabel \|\| \(onSubmit \? 'Annuler' : 'Fermer'\)/);
});
check('K6 : plus de largeur de fenêtre écrite à la main', () => {
    const bad = [];
    for (const f of fs.readdirSync(cssDir).filter(x => x.endsWith('.css'))) {
        const s = fs.readFileSync(path.join(cssDir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        for (const m of s.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
            const sel = m[1], body = m[2];
            if (!/(dialog|modal|-dlg\b|\.h-retouch|\.h-as\b|\.h-tbcfg|\.pf-wiz|\.ly-lib|\.h-rt-pick|\.h-dgz|\.h-emp-dialog|\.h-rt2|\.lc-shp-editor|\.h-museum-editor|\.ui-export)/.test(sel) || /dark|@media/.test(sel)) continue;
            if (/(^|;)\s*width\s*:\s*min\(\s*\d+px/.test(body) && !/\s(\.ar-tname|input|\.h-cw-dot|\.pk-av|svg|canvas|img)/.test(sel)) bad.push(`${f}: ${sel.trim().slice(-60)} { ${body.trim().slice(0, 50)} }`);
        }
    }
    assert.equal(bad.length, 0, bad.join('\n'));
    const app = read('assets/css/app.css');
    for (const v of ['--modal-s: min(540px', '--modal-m: min(760px', '--modal-l: min(1040px', '--modal-xl: min(1180px']) assert.ok(app.includes(v), v);
    assert.match(app, /dialog\.modal > \.modal-actions:last-child, dialog\.modal form > \.modal-actions:last-child[^{]*\{[^}]*position: sticky; bottom: 0/);
});
check('K6 : pas de style="max-width" sur une fenêtre d’index.php', () => {
    assert.equal((read('index.php').match(/<dialog[^>]*style="[^"]*width/g) || []).length, 0);
});

/* ─── 2. Navigateur ─── */
async function browserPart() {
    let pw = null;
    for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!pw) { results.push(['sauté', 'navigateur (Playwright absent)']); return; }
    const phpPath = findPhp([devBundledPhp()]);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-k1k6-'));
    fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Joseph','Martin','male'),('Marie','Durand','female')"); $p = null;
require 'lib/bootstrap.php'; db(); echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
    if (r.status !== 0 || !/ok$/.test(r.stdout)) throw new Error('base : ' + (r.stderr || r.stdout));
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await pw.chromium.launch();
    try {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        await ctx.route(u => !u.toString().startsWith(base), rt => rt.abort());
        const page = await ctx.newPage(); const errs = [];
        page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/net::|ERR_|Failed to load resource/.test(m.text())) errs.push(m.text()); });
        await page.goto(base, { waitUntil: 'load' });
        await page.waitForFunction(() => window.LCNDA_EXT?.openDialog && window.LCNDA_UI?.fail, null, { timeout: 30000 });
        const top = () => page.evaluate(() => { const d = [...document.querySelectorAll('dialog[open]')].at(-1); return d ? { w: Math.round(d.getBoundingClientRect().width), errs: [...d.querySelectorAll('.ui-field-error')].map(e => e.textContent.trim()), bad: d.querySelectorAll('.is-invalid').length, sum: d.querySelector('.ui-form-errors')?.textContent.trim() || '', focus: document.activeElement?.name || '', toasts: [...document.querySelectorAll('.toast.error')].length } : null; });
        // K1 : required + min/max
        await page.evaluate(() => { window.__sent = 0; window.LCNDA_EXT.openDialog({ title: 'Nouveau widget', body: `<div class="form-grid one-column"><label>Titre<input name="title" required></label><label>Générations<input name="gen" type="number" min="1" max="12" value="0" data-error="Entre 1 et 12 générations."></label><span class="pk-lab">Personne</span>${window.LCNDA_APP.pickerField({ name: 'pid', kind: 'person' })}</div>`, onSubmit: f => { if (!Number(f.elements.pid.value)) return window.LCNDA_UI.fail(f.elements.pid, 'Choisis une personne.'); window.__sent++; } }); });
        await page.click('dialog[open] [type=submit]'); await page.waitForTimeout(250);
        const a = await top();
        check('K1 : deux champs encadrés, phrase dessous, résumé, curseur, fenêtre ouverte', () => {
            assert.ok(a, 'fenêtre fermée'); assert.equal(a.bad, 2); assert.deepEqual(a.errs, ['⛔ Ce champ est à remplir.', '⛔ Entre 1 et 12 générations.']);
            assert.match(a.sum, /2 choses à corriger avant d’enregistrer/); assert.equal(a.focus, 'title');
        });
        await page.fill('dialog[open] [name=title]', 'Mes ancêtres'); await page.waitForTimeout(50);
        const b = await top();
        check('K1 : l’erreur s’efface dès qu’on corrige (et le résumé avec)', () => { assert.equal(b.bad, 1); assert.equal(b.sum, ''); });
        await page.fill('dialog[open] [name=gen]', '4'); await page.click('dialog[open] [type=submit]'); await page.waitForTimeout(250);
        const c = await top();
        check('K1 : UI.fail sur un menu de choix (encadré, fenêtre ouverte, pas de toast)', () => { assert.ok(c); assert.deepEqual(c.errs, ['⛔ Choisis une personne.']); assert.equal(c.toasts, 0); });
        await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
        // throw UI.invalid
        await page.evaluate(() => window.LCNDA_EXT.openDialog({ title: 'X', body: '<label>Nom<input name="nm"></label>', onSubmit: () => { throw window.LCNDA_UI.invalid('nm', 'Donne un nom.'); } }));
        await page.click('dialog[open] [type=submit]'); await page.waitForTimeout(250);
        const d = await top();
        check('K1 : throw UI.invalid → sous le champ, pas de toast', () => { assert.deepEqual(d.errs, ['⛔ Donne un nom.']); assert.equal(d.toasts, 0); assert.equal(d.focus, 'nm'); });
        await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach(x => x.close()));
        // fiche Personne sans nom
        await page.evaluate(() => window.LCNDA_APP.openNewPersonDialog()); await page.waitForTimeout(300);
        await page.evaluate(() => [...document.querySelectorAll('dialog[open]')].at(-1).querySelector('[type=submit]').click()); await page.waitForTimeout(300);
        const e = await top();
        check('K1 : fiche Personne sans nom → sous « Prénom », pas de toast', () => { assert.deepEqual(e.errs, ['⛔ Indique au moins un prénom ou un nom.']); assert.equal(e.focus, 'first_name'); assert.equal(e.toasts, 0); });
        await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach(x => x.close()));
        // K6 : tailles
        const widths = await page.evaluate(async () => {
            const E = window.LCNDA_EXT, out = {};
            const w = () => Math.round([...document.querySelectorAll('dialog[open]')].at(-1).getBoundingClientRect().width), shut = () => document.querySelectorAll('dialog[open]').forEach(x => x.close());
            window.LCNDA_APP.askText({ title: 'Nom ?', message: 'Nom :' }); out.s = w(); shut();
            E.openDialog({ title: 'M', body: '<p>x</p>', onSubmit: () => {} }); out.m = w(); shut();
            E.openDialog({ title: 'L', wide: true, body: '<p>x</p>', onSubmit: () => {} }); out.l = w(); shut();
            const x = document.createElement('dialog'); x.className = 'modal modal-xl'; x.innerHTML = '<div class="modal-head"><h2>Galerie</h2><button class="icon-button" data-close aria-label="Fermer">×</button></div><p>…</p>'; document.body.append(x); x.showModal(); out.xl = w();
            out.auto = !!x.querySelector('.modal-actions[data-k6-auto]'); out.autoBtn = x.querySelector('.modal-actions button')?.textContent; x.querySelector('.modal-actions button')?.click(); await new Promise(r => setTimeout(r, 30)); out.autoClosed = !x.open; x.remove();
            E.openDialog({ title: 'Montre', body: '<p>x</p>' }); out.showOnly = [...document.querySelectorAll('dialog[open] .modal-actions button')].map(b => b.textContent.trim()); shut();
            return out;
        });
        check('K6 : 540 / 760 / 1040 / 1180', () => { assert.deepEqual([widths.s, widths.m, widths.l, widths.xl], [540, 760, 1040, 1180]); });
        check('K6 : « Fermer » seul pour une fenêtre qui ne fait que montrer', () => { assert.deepEqual(widths.showOnly, ['Fermer']); });
        check('K6 : une fenêtre sans bas en reçoit un (« Fermer » qui ferme)', () => { assert.ok(widths.auto); assert.equal(widths.autoBtn, 'Fermer'); assert.ok(widths.autoClosed); });
        await page.evaluate(() => { const d = document.getElementById('event-dialog'); d.showModal(); d.scrollTop = 400; }); await page.waitForTimeout(150);
        const sticky = await page.evaluate(() => { const d = document.getElementById('event-dialog'), f = d.querySelector('.modal-actions').getBoundingClientRect(), h = d.querySelector('.modal-head').getBoundingClientRect(), r = d.getBoundingClientRect(); return { scrolled: d.scrollTop > 0, footIn: f.bottom <= r.bottom + 1 && f.top >= r.top, headIn: h.top >= r.top - 1 && h.top <= r.top + 10 }; });
        check('K6 : en faisant défiler, le bas reste en bas et le titre en haut', () => { assert.ok(sticky.scrolled, 'la fenêtre ne défile pas'); assert.ok(sticky.footIn); assert.ok(sticky.headIn); });
        check('aucune erreur de page', () => assert.deepEqual(errs, []));
    } finally { await browser.close(); proc.kill(); fs.rmSync(dir, { recursive: true, force: true }); }
}
browserPart().catch(e => results.push(['ÉCHEC', 'navigateur', e.stack || e.message])).finally(() => {
    let bad = 0;
    for (const [st, name, msg] of results) { console.log(`${st === 'ok' ? '✓' : st === 'sauté' ? '–' : '✗'} ${name}${msg ? '\n    ' + msg.split('\n').join('\n    ') : ''}`); if (st === 'ÉCHEC') bad++; }
    console.log(bad ? `\n${bad} échec(s)` : `\n${results.length} vérifications : tout va bien`);
    process.exit(bad ? 1 : 0);
});
