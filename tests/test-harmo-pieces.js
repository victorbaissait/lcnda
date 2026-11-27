'use strict';
/* Harmonisation des pièces de l'interface (docs/harmonisation.md, « Déjà corrigé ») : une même chose a le même aspect partout.
 *     node tests/test-harmo-pieces.js
 * 1. Sans navigateur :
 *    - C8 « × pour fermer partout, ✕ / 🗑 pour retirer » : aucun bouton « Fermer » dessiné avec ✕ ;
 *    - le bouton qui vide les réponses gardées sur l'ordinateur s'appelle partout « 🗑 Effacer les réponses gardées » ;
 *    - H7 un message avec « ↶ Annuler » est noir (kind 'undo' ou undoToast), jamais vert ('success') ;
 *    - C5 un onglet segmenté montré par aria-pressed s'allume comme .is-active (clair, sombre, styles « contour » / « texte »).
 * 2. Navigateur (Playwright + PHP, si présents) : 📈 Diagrammes et Réglages → 🧭 Je veux… : le choix pressé est bleu,
 *    en clair et en sombre ; aucune erreur JavaScript.
 */
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const js = f => fs.readFileSync(path.join(root, 'assets/js', f), 'utf8');
const css = f => fs.readFileSync(path.join(root, 'assets/css', f), 'utf8');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const files = fs.readdirSync(path.join(root, 'assets/js')).filter(f => f.endsWith('.js'));
const all = Object.fromEntries(files.map(f => [f, js(f)]));
const hits = (re, skip = []) => files.filter(f => !skip.includes(f)).flatMap(f => [...all[f].matchAll(re)].map(m => `${f}:${all[f].slice(0, m.index).split('\n').length}: ${m[0].slice(0, 100)}`));

(async () => {
    /* ── 1. sans navigateur ── */
    await t('C8 « Fermer » : toujours ×, jamais ✕ (✕ reste pour « Retirer »)', () => {
        assert.deepEqual(hits(/<button\b[^>]*(aria-label|title)="[^"]*Fermer[^"]*"[^>]*>✕<\/button>/g), []);
        assert.deepEqual(hits(/<button\b[^>]*data-[\w-]*close\b[^>]*>✕<\/button>/g), []);
        for (const [f, re] of [['app.js', /id="side-panel-close" aria-label="Fermer le panneau">×</], ['heritage-telech-d.js', /aria-label="\$\{esc\(T\('Fermer'\)\)\}">×<\/button><\/form>/], ['heritage-fiche-edifice.js', /data-fe-close[^>]*>×</]])
            assert.match(all[f], re, f);
    });
    await t('« 🗑 Effacer les réponses gardées » : un seul nom pour vider ce qui est gardé sur l’ordinateur', () => {
        assert.deepEqual(hits(/data-[\w-]*(cache-)?clear>(\$\{esc\(T\('🗑 Vider'\)\)\}|🗑 \$\{esc\(T\('Tout oublier'\)\)\})/g), []);
        const n = files.reduce((k, f) => k + (all[f].match(/T\('🗑 Effacer les réponses gardées'\)/g) || []).length, 0);
        assert.ok(n >= 14, 'le nom commun : ' + n);
    });
    await t('H7 « ↶ Annuler » dans un message noir, pas dans un message vert', () => {
        // toast(…, 'success', {…action: {label: '↶ Annuler'…}}) sur une même instruction
        assert.deepEqual(hits(/toast\((?:(?!toast\()[^;])*?'success', \{(?:(?!toast\()[^;])*?label: (i18n|T)\('↶ Annuler'\)/g), []);
        for (const f of ['app-a-trier.js', 'app-reseau-local.js']) assert.match(all[f], /'', \{kind: 'undo'(, duration: 10000)?, action: \{label: i18n\('↶ Annuler'\)/, f);
    });
    await t('C5 onglets segmentés : aria-pressed="true" s’allume comme .is-active (clair, sombre, styles du bouton)', () => {
        const a = css('app.css'), s = css('sections.css');
        assert.match(a, /\.segmented button\.is-active, \.segmented button\[aria-pressed="true"\] \{[^}]*background: var\(--blue\)/);
        assert.match(a, /:root\[data-theme="dark"\] \.segmented button\.is-active, :root\[data-theme="dark"\] \.segmented button\[aria-pressed="true"\] \{/);
        assert.match(s, /\[data-lc-btn="contour"\] \.segmented button:not\(\.is-active\):not\(\[aria-pressed="true"\]\)/);
        assert.match(s, /\[data-lc-btn="texte"\] \.segmented button:not\(\.is-active\):not\(\[aria-pressed="true"\]\)/);
    });

    /* ── 2. navigateur ── */
    let ok = true;
    try { require.resolve('playwright'); } catch (_) { try { require.resolve('/opt/node22/lib/node_modules/playwright'); } catch (__) { ok = false; } }
    const {findPhp, devBundledPhp} = require('../electron/php-server');
    if (!ok || !findPhp([devBundledPhp()])) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); console.log(`${failed ? '✗' : '✓'} harmonisation des pièces : ${count} vérifications`); process.exit(failed ? 1 : 0); }
    const {start, newPage, go} = require('./test-rien-de-colle.js');
    const {base, browser, stop} = await start();
    const errs = [];
    try {
        for (const dark of [false, true]) {
            const p = await newPage(browser, base, {dark});
            await t(`C5 le choix pressé est bleu (${dark ? 'sombre' : 'clair'}) : 📈 Diagrammes, Réglages → 🧭 Je veux…`, async () => {
                for (const [name, step] of [['diagrammes', go.module('diagrammes')], ['je_veux', go.settings('je_veux')]]) {
                    await step(p);
                    const r = await p.evaluate(() => [...document.querySelectorAll('#workspace .segmented button')].filter(b => b.getClientRects().length).map(b => ({on: b.getAttribute('aria-pressed') === 'true' || b.classList.contains('is-active'), bg: getComputedStyle(b).backgroundColor})));
                    const on = r.filter(x => x.on), off = r.filter(x => !x.on);
                    assert.ok(on.length && off.length, `${name} : des choix pressés et des choix libres (${JSON.stringify(r).slice(0, 200)})`);
                    const bgOff = new Set(off.map(x => x.bg));
                    for (const x of on) assert.ok(!bgOff.has(x.bg) && x.bg !== 'rgba(0, 0, 0, 0)', `${name} : le choix pressé se voit (${x.bg})`);
                }
            });
            errs.push(...p.errs);
            await p.context().close();
        }
        await t('aucune erreur JavaScript', () => assert.deepEqual(errs, []));
    } finally { await stop(); }
    console.log(`${failed ? '✗' : '✓'} harmonisation des pièces : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
