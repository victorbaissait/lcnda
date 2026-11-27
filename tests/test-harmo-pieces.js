'use strict';
/* Harmonisation des pièces de l'interface (docs/harmonisation.md, « Déjà corrigé ») : une même chose a le même aspect partout.
 *     node tests/test-harmo-pieces.js
 * 1. Sans navigateur :
 *    - C8 « × pour fermer partout, ✕ / 🗑 pour retirer » : aucun bouton « Fermer » dessiné avec ✕ ;
 *    - le bouton qui vide les réponses gardées sur l'ordinateur s'appelle partout « 🗑 Effacer les réponses gardées » ;
 *    - H7 un message avec « ↶ Annuler » est noir (kind 'undo' ou undoToast), jamais vert ('success') ; 6 s pour tous (pas de durée à part) ;
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
        assert.deepEqual(hits(/'✕ Fermer|data-lm-exit[^>]*>✕/g), [], 'harmonisation.md (Apparence 10) : « Fermer l’essai » sans ✕, le × du musée');
        for (const [f, re] of [['app.js', /id="side-panel-close" aria-label="Fermer le panneau">×</], ['heritage-telech-d.js', /ext\.openDialog\(\{eyebrow: T\('ARTICLE'\)/], ['heritage-fiche-edifice.js', /data-fe-close[^>]*>×</]])
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
        for (const f of ['app-a-trier.js', 'app-reseau-local.js']) assert.match(all[f], /'', \{kind: 'undo', action: \{label: i18n\('↶ Annuler'\)/, f);
    });
    await t('H7 6 secondes pour tous les messages (la souris dessus le garde) : plus de durée à part', () => {
        // harmonisation.md (Apparence 6) ; seules exceptions : un message long à lire (image trop grande) et « la généalogie a changé, ↻ Recharger »
        const left = hits(/toast\??\.?\((?:(?!toast\()[^;])*?duration: ?\d{4,}/g).filter(x => !/^app-media-limits\.js:\d+: toast\(i18n\('Cette image est très grande|^app\.js:\d+: toast\(data\.error, 'error', \{duration: 60000/.test(x));
        assert.deepEqual(left, []);
        assert.deepEqual(hits(/\{kind: 'undo', duration:/g), []);
    });
    await t('C5 onglets segmentés : aria-pressed="true" s’allume comme .is-active (clair, sombre, styles du bouton)', () => {
        const a = css('app.css'), s = css('sections.css');
        assert.match(a, /\.segmented button\.is-active, \.segmented button\[aria-pressed="true"\] \{[^}]*background: var\(--blue\)/);
        assert.match(a, /:root\[data-theme="dark"\] \.segmented button\.is-active, :root\[data-theme="dark"\] \.segmented button\[aria-pressed="true"\] \{/);
        assert.match(s, /\[data-lc-btn="contour"\] \.segmented button:not\(\.is-active\):not\(\[aria-pressed="true"\]\)/);
        assert.match(s, /\[data-lc-btn="texte"\] \.segmented button:not\(\.is-active\):not\(\[aria-pressed="true"\]\)/);
    });

    await t('C5 une seule pièce pour un groupe d’onglets segmentés : UI.segmented met les deux marques (is-active + aria-pressed)', () => {
        // harmonisation.md (Apparence 9) : plus de groupe écrit à la main qui ne met que aria-pressed (le choix ne s'allumait pas)
        const ui = all['app-ui.js'];
        assert.match(ui, /UI\.segBtn = \(\{on = false[^\n]*\$\{on \? ' class="is-active"' : ''\}[^\n]*aria-pressed="\$\{on \? 'true' : 'false'\}"/);
        assert.match(ui, /UI\.segMark = \(b, on\) => \{ if \(!b\) return; b\.classList\.toggle\('is-active', !!on\); b\.setAttribute\('aria-pressed'/);
        const lines = files.flatMap(f => all[f].split('\n').map((l, i) => [f, i + 1, l])).filter(([, , l]) => /class="segmented[ "]/.test(l) && /aria-pressed=/.test(l) && !/is-active|is-on|'on'/.test(l));
        assert.deepEqual(lines.map(([f, n]) => `${f}:${n}`), [], 'groupe fait à la main avec aria-pressed seul : UI.segmented');
        assert.deepEqual(hits(/\.segmented[^;\n]{0,80}\.forEach\(\w+ => \w+\.setAttribute\('aria-pressed'|\[data-dp-(ck|cs|bk|bf|ss)\] button'\)\.forEach\(x => x\.setAttribute\('aria-pressed'/g), [], 'au clic : UI.segPick / UI.segMark (les deux marques)');
        const n = files.reduce((k, f) => k + (all[f].match(/LCNDA_UI\.segmented\(/g) || []).length, 0);
        assert.ok(n >= 19, 'groupes passés par UI.segmented : ' + n);
    });

    await t('Liens qui sortent de l’app : toujours « ↗ Nom du site » (UI.extLink), l’adresse en bulle', () => {
        // harmonisation.md (Apparence 3) : un <a target="_blank"> écrit à la main sans ↗ ne revient pas
        const ui = all['app-ui.js'];
        assert.match(ui, /UI\.extLink = \(url = '', site = '', \{cls = '', title = '', attrs = ''\} = \{\}\) => \{/);
        assert.match(ui, /target="_blank" rel="noopener noreferrer" title="\$\{esc\(title \|\| u\)\}"\$\{attrs \? ' ' \+ attrs : ''\}>↗ \$\{esc\(name\)\}<\/a>/);
        const RE = /<a\b([^>]*?)target=\\?["']?_blank[^>]*>([\s\S]{0,400}?)<\/a>/g;
        const LOCAL = /href=\\?["']\s*(media\/|#|data:|blob:|api\.php|\$\{(esc|escapeHtml)\((BL\.mediaSrc|A\(\)\.mediaUrl|mediaUrl|fileUrl|src\b))/;
        // permis : ce qui est collé dans un texte de l'utilisateur (📎 Insérer, choix d'une liste), une vignette ou une épingle de carte,
        // un fichier qu'on télécharge (⤓), un lien posé par l'utilisateur dans une mise en page imprimée
        const OK = [/^app-inserer\.js$/, /^app-listes-choix\.js$/, /^heritage-layout\.js$/];
        const bad = files.filter(f => !OK.some(r => r.test(f))).flatMap(f => [...all[f].matchAll(RE)].filter(m => !/↗/.test(m[2]) && !LOCAL.test(m[0]) && !/<img\b|<svg\b|^\s*\$\{inner\}/.test(m[2]) && !/^\s*(\$\{i18n\(')?⤓/.test(m[2]) && !/class="cplus-pin"/.test(m[1]))
            .map(m => `${f}:${all[f].slice(0, m.index).split('\n').length}: ${m[0].slice(0, 110)}`));
        assert.deepEqual(bad, [], 'lien vers un autre site sans « ↗ » : UI.extLink(adresse, nom du site)');
        const n = files.reduce((k, f) => k + (all[f].match(/LCNDA_UI\.extLink\(/g) || []).length, 0);
        assert.ok(n >= 110, 'liens passés par UI.extLink : ' + n);
    });

    await t('Les fenêtres : la fenêtre commune (openDialog), les éditeurs gardent leur cadre avec le × à droite', () => {
        // harmonisation.md (Apparence 1) : titre en haut à gauche, × en haut à droite, en bas « Annuler » puis le bouton bleu
        for (const f of ['app-paniers.js', 'heritage-comptes-famille.js', 'heritage-lot9-monde-coutumes.js', 'heritage-telech-d.js', 'heritage-telech-d-traduire.js']) {
            assert.ok(!/createElement\('dialog'\)/.test(all[f]), `${f} : plus de fenêtre faite à la main`);
            assert.ok(/ext\.openDialog\??\.?\(\{/.test(all[f]), `${f} : ext.openDialog`);
        }
        assert.ok((all['heritage-comptes-famille.js'].match(/ext\.openDialog\(\{/g) || []).length >= 4, 'Comptes de la famille : les 4 fenêtres');
        assert.match(all['app-paniers.js'], /const d = ext\.openDialog\(\{eyebrow: T\('PANIERS'\)/, 'Paniers : toutes les fenêtres passent par dlg() → openDialog');
        assert.match(all['heritage-lieux-a-placer.js'], /<h2>📍 \$\{esc\(i18n\('Lieux à placer'\)\)\}/, 'Lieux à placer : un vrai titre (h2)');
        // les éditeurs plein écran : leur cadre, avec le × tout à droite de la barre
        for (const f of ['heritage-tableur.js', 'heritage-traitement-texte.js', 'heritage-site-web.js', 'heritage-slideshow.js']) assert.match(all[f], /editorTopbar\(\{[\s\S]{0,1500}?close: \{attrs:/, `${f} : × de la barre E1`);
        assert.match(all['heritage-keynote.js'], /data-kn-cmd="close" aria-label="\$\{esc\(i18n\('Fermer'\)\)\}">×</, 'Keynote : ×');
        assert.match(all['heritage-vector.js'], /data-vx-close title="Fermer" aria-label="Fermer">×<\/button><\/header>/, 'Dessin : × au bout de la barre');
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
