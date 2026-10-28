'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 👁 Les aperçus des Réglages ressemblent à ce qu'on voit ensuite (mêmes composants que le vrai écran).
 *   node tests/test-apercus.js
 *  1. le code : plus de pastille, de portrait, de message ni de menu de choix dessinés à la main dans les aperçus
 *     (en-tête de fiche, Portraits K7, Designs au choix A2 / A6, Accessibilité → Couleurs) ;
 *  2. le navigateur (Playwright ; sinon sauté) : l'aperçu comparé au vrai écran — ligne de la liste des personnes,
 *     pastilles de l'en-tête (avec les « Couleurs des badges »), messages et portraits de l'aperçu des couleurs.
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
/** le corps d'une fonction (jusqu'à la suivante) */
const fnBody = (src, name) => { const i = src.indexOf(`function ${name}(`); assert.ok(i >= 0, `fonction ${name} introuvable`); const j = src.indexOf('\n    function ', i + 10); return src.slice(i, j < 0 ? undefined : j); };

(async () => {
    /* ═════ 1. le code ═════ */
    const ap = read('assets/js/app-apparence.js'), col = read('assets/js/app-colonne.js'), des = read('assets/js/app-designs.js'), acc = read('assets/js/app-access.js');
    const css = ['app.css', 'apparence.css', 'access.css'].map(f => read('assets/css/' + f)).join('\n');
    await t('en-tête de fiche : les pastilles K8 et le lien 🧩 de la fiche, plus de pastille faite main', () => {
        const b = fnBody(ap, 'headerPreviewHtml');
        assert.match(b, /ui-badge is-sosa/); assert.match(b, /class="lc-pf-link"/);
        assert.doesNotMatch(b, /lc-hh-b[ "]|SOSA :|ui-badge is-blue">🧩/);
        assert.match(b, /UI\(\)\.avatarOn\?\.\(\)[\s\S]*UI\(\)\.avatar\(/, 'K7 : le portrait commun quand il est choisi');
        assert.doesNotMatch(css, /\.lc-hh-b[ .{]/);
        assert.match(css, /\.lc-hh-badges \.ui-badge\.is-sosa \{ background: var\(--person-badge-sosa-bg/, 'les « Couleurs des badges » suivent');
    });
    await t('Portraits K7 : la vraie ligne de liste, le vrai menu de choix (badge Sosa), les vraies pastilles', () => {
        const b = fnBody(col, 'placesHtml') + fnBody(col, 'avOld');
        assert.match(b, /person-list-item/); assert.match(b, /pk-badge sosa/); assert.match(b, /pk-head/); assert.match(b, /pk-chips/); assert.match(b, /class="pk-av /);
        assert.doesNotMatch(b, /lck-sosa-b|lck-old-liste|lck-old-picker|lck-old-pastille|lck-pi|lck-f-chip/);
        assert.doesNotMatch(css, /\.lck-sosa-b|\.lck-old-pastille|\.lck-old-liste|\.lck-old-picker/);
    });
    await t('Designs au choix : menu de choix et fenêtre faits des vrais morceaux (en-tête, ligne « Créer », rond d’initiales)', () => {
        const m = fnBody(des, 'menuHtml'), f = fnBody(des, 'fenetreHtml'), fi = fnBody(des, 'ficheHtml');
        assert.match(m, /pk-head/); assert.match(m, /pk-act pk-row/); assert.doesNotMatch(m, /pk-create|class="pk-hint"/);
        assert.match(f, /pk-av/); assert.doesNotMatch(f, /lcd-chip-av/);
        assert.match(fi, /A\(\)\.lifeText/, 'les mots de la vraie fiche (Accord des mots)');
    });
    await t('Accessibilité → Couleurs : les vrais messages (UI.notice) et le vrai portrait (UI.avatarOr)', () => {
        assert.match(acc, /demoMsg\('error'/); assert.match(acc, /UI\.avatarOr/);
        assert.doesNotMatch(acc, /a11y-demo-msg(?!s)/); assert.doesNotMatch(css, /a11y-demo-msg(?!s)/);
    });

    /* ═════ 2. le navigateur ═════ */
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    let phpPath = null;
    try { const {findPhp, devBundledPhp} = require('../electron/php-server'); phpPath = findPhp([devBundledPhp()]); } catch (_) { phpPath = null; }
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); finish(); return; }
    const {phpRuntimeArgs} = require('../electron/php-server');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-apercus-'));
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Louise','BORIE','female','deceased'),('Antoine','BORIE','male','deceased'),('Marie','LEROY','female','unknown')");
$p = null; require 'lib/bootstrap.php'; db(); echo 'ok';`], {cwd: root, encoding: 'utf8', env});
    if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const port = Number(process.env.APERCUS_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const page = await browser.newPage({viewport: {width: 1440, height: 1400}});
        page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push('console : ' + m.text()); });
        await page.route(u => !u.toString().startsWith(base), rt => rt.abort());
        await page.goto(base, {waitUntil: 'load'}); await page.waitForTimeout(1200);
        const tab = async k => { await page.evaluate(async k => { const A = window.LCNDA_APP; A.state.maintenanceTab = k; await A.setModule('maintenance'); }, k); await page.waitForTimeout(1200); };
        // le vrai écran : la fiche 1 et la liste des personnes
        await page.evaluate(async () => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; await A.setModule('personnes'); }); await page.waitForSelector('.person-hero'); await page.waitForTimeout(600);
        const styleOf = (sel, props) => page.evaluate(([sel, props]) => { const e = [...document.querySelectorAll(sel)].find(x => x.offsetParent); if (!e) return null; const cs = getComputedStyle(e); return Object.fromEntries(props.map(p => [p, cs[p]])); }, [sel, props]);
        const LIST = ['borderTopWidth', 'borderTopStyle', 'paddingTop', 'backgroundColor', 'boxShadow'];
        const realRow = await styleOf('#sidebar-content .person-list-item', LIST);
        const realStatus = await styleOf('.person-hero-status .status-badge', ['backgroundColor', 'color', 'textTransform', 'fontWeight']);
        assert.ok(realRow && realStatus, 'la vraie liste et la vraie fiche sont là');

        await t('Portraits K7 « Comme avant » : la ligne de la liste a la même forme que la vraie, sans initiales', async () => {
            const reglA = await page.evaluate(() => !!window.LCNDA_APP.reglagesA?.());
            await tab(reglA ? 'look_portraits' : 'design');
            await page.waitForSelector('#lck-p-prev .person-list-item');
            const prev = await styleOf('#lck-p-prev .person-list-item', LIST);
            assert.deepEqual(prev, realRow);
            assert.equal(await page.locator('#lck-p-prev .lck-f-rows .pk-av, #lck-p-prev .lck-f-rows .lc-av').count(), 0, 'pas de rond d’initiales dans la liste « Comme avant »');
            assert.equal(await page.locator('#lck-p-prev .pk-badge.sosa').count(), 3, 'le badge Sosa du menu de choix');
            const sosa = await styleOf('#lck-p-prev .pk-badge.sosa', ['backgroundColor', 'color']);
            assert.deepEqual(sosa, {backgroundColor: 'rgb(5, 93, 255)', color: 'rgb(255, 255, 255)'});
        });
        await t('en-tête de fiche : les pastilles de l’aperçu sont celles de la fiche, avec les « Couleurs des badges »', async () => {
            await tab('design_sheets');
            await page.waitForSelector('.lc-hh-prev .ui-badge.is-sosa', {timeout: 15000});
            const s = await styleOf('.lc-hh-prev .ui-badge.is-sosa', ['backgroundColor', 'color', 'textTransform', 'fontWeight']);
            const real = await page.evaluate(() => { const d = document.createElement('div'); d.className = 'person-hero-status'; d.innerHTML = '<span class="ui-badge is-sosa">Sosa 1</span>'; document.body.appendChild(d); const cs = getComputedStyle(d.firstChild); const o = {backgroundColor: cs.backgroundColor, color: cs.color, textTransform: cs.textTransform, fontWeight: cs.fontWeight}; d.remove(); return o; });
            assert.deepEqual(s, real);
            assert.equal(s.backgroundColor, 'rgb(5, 93, 255)', 'Sosa bleu plein');
            await page.evaluate(() => document.documentElement.style.setProperty('--person-badge-sosa-bg', '#aa0000'));
            assert.equal((await styleOf('.lc-hh-prev .ui-badge.is-sosa', ['backgroundColor'])).backgroundColor, 'rgb(170, 0, 0)', 'la couleur réglée suit');
            await page.evaluate(() => document.documentElement.style.removeProperty('--person-badge-sosa-bg'));
            assert.equal(await page.locator('.lc-hh-prev .lc-hh-b').count(), 0);
            assert.equal(realStatus.textTransform, 'uppercase');
        });
        await t('Accessibilité → Couleurs : les messages de l’aperçu sont les vrais messages (avec leur symbole)', async () => {
            await tab('accessibilite');
            await page.waitForSelector('.a11y-demo .ui-notice', {timeout: 15000});
            assert.equal(await page.locator('.a11y-demo .ui-notice').count(), 3);
            assert.match(await page.locator('.a11y-demo .ui-notice-error').innerText(), /⛔/);
        });
        await t('aucune erreur JavaScript', async () => { assert.deepEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    finish();
})();
function finish() { console.log(`${failed ? '✗' : '✓'} aperçus des Réglages : ${count} vérifications${failed ? `, ${failed} en échec` : ''}`); process.exit(failed ? 1 : 0); }
