'use strict';
/* Harmonisation K3 (les mêmes mots pour les mêmes boutons) et K11 (une action = un symbole).
 *     node tests/test-harmo-mots-symboles.js        (HARMO_MOTS_SHOTS=dossier pour garder des captures)
 * 1. Le composant (bac à sable) : UI.createLabel (« Nouvelle enquête » → « Créer l’enquête »…), UI.WORDS, UI.SYMBOLS.
 * 2. Plus de variante dans le code (assets/js/*.js et index.php) : Réinitialiser, Revenir au standard, Tout remettre…,
 *    Rattacher / Lier / Associer sur un bouton, « Faire le livre », « Annuler » + « Fermer », 📥 / 📤 / ⬇ / ⬆ pour importer
 *    ou exporter, deux signes (« 📘 + Nouveau livret »), « + » au lieu de « ＋ », ➕, ⊕, 🖨️, ✏️ Modifier, 🔎 Chercher.
 * 3. Navigateur (Playwright, si présent) : openDialog « Nouveau… » → « Créer le … » ; « Fermer » seul ; la même fenêtre
 *    de index.php rouverte pour modifier reprend « Enregistrer » ; des écrans au hasard (1440 px, 390 px en mode sombre)
 *    sans variante ni erreur JavaScript.
 */
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const vm = require('node:vm');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const root = path.resolve(__dirname, '..');
const js = f => fs.readFileSync(path.join(root, 'assets/js', f), 'utf8');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

(async () => {
    /* ── 1. le composant ── */
    const sandbox = {window: {}, document: {addEventListener() {}}, console};
    vm.createContext(sandbox);
    vm.runInContext(js('app-mots.js'), sandbox, {filename: 'app-mots.js'});
    const UI = sandbox.window.LCNDA_UI;
    await t('K3 UI.createLabel : « Créer » + ce qu’on crée', () => {
        const cases = [['Nouvelle enquête', 'Créer l’enquête'], ['Nouveau livret', 'Créer le livret'], ['📘 Nouveau livret', 'Créer le livret'], ['＋ Nouvelle carte de photos', 'Créer la carte de photos'],
            ['Nouvel employeur', 'Créer l’employeur'], ['Nouvelles règles', 'Créer les règles'], ['Nouveaux liens', 'Créer les liens'], ['Nouvelle hypothèse', 'Créer l’hypothèse'],
            ['Nouveau numéro', 'Créer le numéro'], ['Nouvelle fiche — Village', 'Créer la fiche'], ['Nouveau', 'Créer'], ['Nouvelle série ou émission (podcast, radio)', 'Créer la série ou émission']];
        for (const [a, b] of cases) assert.equal(UI.createLabel(a), b, a);
        for (const a of ['Modifier l’enquête', 'Par quoi commencer ?', 'Ajouter une note', '', null]) assert.equal(UI.createLabel(a), null, String(a));
    });
    await t('K3 / K11 : les mots et le petit dictionnaire des symboles', () => {
        assert.deepEqual({...UI.WORDS}, {create: 'Créer', save: 'Enregistrer', add: 'Ajouter', link: 'Relier', reset: '↺ Remettre comme au départ', close: 'Fermer', cancel: 'Annuler', remove: 'Retirer', del: 'Supprimer', edit: 'Modifier'});
        const S = UI.SYMBOLS;
        for (const [k, v] of Object.entries({import: '⤒', export: '⤓', download: '⤓', save: '💾', print: '🖨', edit: '✎', delete: '🗑', close: '×', open: '↗', undo: '↶', redo: '↷', settings: '⚙️', search: '🔍', add: '＋', copy: '📋', duplicate: '⧉', more: '⋯', favorite: '⭐', file: '📁', link: '🔗', reset: '↺', fullscreen: '⛶'}))
            assert.equal(S[k], v, k);
        const used = Object.values(S); assert.ok(!used.includes('📥'), '📥 n’est pas une action');
        assert.equal(typeof UI.fixPrimaryLabel, 'function');
    });

    /* ── 2. plus de variante ── */
    const files = fs.readdirSync(path.join(root, 'assets/js')).filter(f => f.endsWith('.js'));
    const all = Object.fromEntries(files.map(f => [f, js(f)]));
    all['index.php'] = fs.readFileSync(path.join(root, 'index.php'), 'utf8');
    const names = Object.keys(all);
    const hits = (re, skip = []) => names.filter(f => !skip.includes(f)).flatMap(f => [...all[f].matchAll(re)].map(m => `${f}:${all[f].slice(0, m.index).split('\n').length}: ${m[0].slice(0, 90)}`));
    const none = (re, msg, skip) => assert.deepEqual(hits(re, skip), [], msg);
    await t('K3 « ↺ Remettre comme au départ » : plus de Réinitialiser, Revenir au standard, Tout remettre…', () => {
        none(/>\s*(↺\s*)?(Tout )?[Rr]éinitialiser|okLabel: ?'(↺ )?Réinitialiser|title: ?'↺ Réinitialiser/g, 'Réinitialiser');
        none(/Revenir au standard|Tout remettre à zéro|↺ Remettre à zéro|↺ Tout remettre comme|>Tout remettre<|↺ Comme au départ|↺ Réglage de départ|↺ Réglages par défaut|Revenir à l’apparence de départ|Remettre l’ordre de l’app<|>Remettre les réglages de départ<|>Revenir aux réglages de départ<|aria-label="Revenir au départ"/g, 'variantes de « remettre comme au départ »');
        assert.ok(hits(/↺ Remettre comme au départ/g).length >= 60, 'le mot validé est partout');
    });
    await t('K3 « Relier » : plus de Rattacher, Lier, Associer sur un bouton ou une fenêtre', () => {
        none(/<button\b[^>]*>\s*(\S{1,2}\s)?(Rattacher|Lier|Associer)\b/g, 'bouton');
        none(/(submitLabel|okLabel): ?'(Rattacher|Lier|Associer)/g, 'bouton principal');
        none(/title: ?'(Rattacher|Lier|Associer) |<h2>(Rattacher|Lier|Associer) /g, 'titre de fenêtre');
        none(/[+＋📚🏷📍] ?Rattacher|📍 Lier|🔗 (Lier|Associer|Rattacher)/g, 'symbole + ancien mot');
    });
    await t('K3 « Créer le … » pour une chose nouvelle, « Enregistrer » pour un réglage, « Fermer » seul', () => {
        none(/Faire le livre|Fabriquer l’arbre|'＋ Créer le thème'|'＋ Créer la forme'|submitLabel: '✓|'✓ Créer/g, 'Faire, Fabriquer, ＋ ou ✓ sur le bouton principal');
        none(/title: '(＋ )?Nouve\w* [^']{1,40}',[^}\n]{0,30}submitLabel: '(Créer|Enregistrer)'/g, 'fenêtre « Nouveau… » avec « Créer » ou « Enregistrer » seul');
        none(/title: 'Créer une forme[^']*', wide: true, submitLabel: 'Enregistrer/g, '« Créer une forme » → « Créer la forme »');
        none(/submitLabel: 'Annuler'|submitLabel: 'OK', onSubmit: \(\) => \{\}/g, '« Annuler » comme bouton principal');
        none(/submitLabel: 'Appliquer',\n\s*body: `<div class="form-grid"><label>La semaine commence|title: 'Colonnes', wide: true, submitLabel: 'Appliquer'|data-pf-x>Annuler<\/button><button type="submit" class="button">Appliquer/g, 'réglage : « Enregistrer »');
        const h = all['heritage.js'];
        assert.match(h, /if \(submitLabel == null\) submitLabel = window\.LCNDA_UI\?\.createLabel\?\.\(title\) \|\| 'Enregistrer';/, 'openDialog : « Créer le … » tout seul');
        assert.match(h, /const onlyClose = !!onSubmit && \/\^\(Fermer\|Annuler\)\$\/\.test/, 'openDialog : « Fermer » seul');
        assert.match(h, /closeLabel \|\| \(onSubmit \? 'Annuler' : 'Fermer'\)/, 'K6 garde son « Fermer »');
        const idx = all['index.php'];
        const a = idx.indexOf('assets/js/app-forms.js?v='), b = idx.indexOf('assets/js/app-mots.js?v='), c = idx.indexOf('assets/js/heritage.js?v=');
        assert.ok(a > 0 && b > a && b < c, 'index.php charge app-mots.js après app-forms.js, avant heritage.js');
    });
    await t('K11 une action = un symbole : ⤒ importer, ⤓ exporter, plus de 📥 / 📤 / ⬇ / ⬆ pour ça', () => {
        none(/📥 ?(Importer|Exporter|CSV|Télécharger|Récupérer|Garder|Dans les médias|Mon propre)|>📥</g, '📥 n’est plus une action');
        none(/📤 ?(Export|Partager \(fichier)|>📤</g, '📤 Exporter → ⤓');
        none(/(⬆️?|💾|⤓|⬇️?|💬|＋|\+) ?(Importer|Réimporter)\b/g, 'importer : ⤒');
        none(/(⬇️?︎?|📄|🌐|◧|✂|📅|💬|±) ?Exporter\b/g, 'exporter : ⤓');
        none(/(📥|⬇️?|📅|💾) ?Télécharger/g, 'télécharger : ⤓');
        none(/(⬇️?︎?|📥) ?CSV|>⤓ CSV</g, 'le format dans le menu, ou « ⤓ Exporter en CSV »');
    });
    await t('K11 un seul signe : ＋ (pas +, ➕, ⊕), pas d’émoji en plus ; 🖨, ✎, 🔍, ⚙️, ↗', () => {
        none(/(🏢|🧩|📘|🐾|📁|🎧) ?[+＋] ?(Nouve|Ajouter|Ensemble)/g, 'deux signes devant « Nouveau… »');
        none(/[➕⊕] ?Ajouter/g, '➕ / ⊕ → ＋');
        none(/>\s*\+ (?!clic)[A-Za-zÀ-ÿ]/g, '« + » → « ＋ » sur un bouton');
        none(/« \+ [A-Za-zÀ-ÿ]/g, '« + » → « ＋ » dans l’aide');
        none(/>(🎧|📁|👪|🎨|📊) Nouve|>(📅|🖼|🧭|📚) Ajouter|>(✎|🧱|📊) Créer (mon propre|le profil|une sorte|un widget|le tableau)/g, '« ＋ Nouveau… » seul');
        none(/🖨️ ?[A-Za-zÀ-ÿ]|✏️ Modifier|🔎 (Chercher|Rechercher)|⚙ (Réglages|Personnaliser|Créer)/g, '🖨, ✎, 🔍, ⚙️');
        none(/>(📊|🧩|🎨|📐|🏠|🔎|🗓️) Ouvrir/g, '↗ Ouvrir');
        none(/✕ Annuler/g, '« Annuler » sans ✕');
    });

    /* ── 3. navigateur ── */
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    const phpPath = findPhp([devBundledPhp()]);
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); console.log(`${failed ? '✗' : '✓'} harmonisation K3 / K11 : ${count} vérifications`); process.exit(failed ? 1 : 0); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-harmo-mots-'));
    const shots = process.env.HARMO_MOTS_SHOTS || '';
    const envFor = d => ({...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1'});
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Joseph','Martin','male','deceased'),('Marie','Durand','female','living')"); $p = null;
require 'lib/bootstrap.php'; db(); echo 'ok';`], {cwd: root, encoding: 'utf8', env: envFor(tmp)});
    if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const port = Number(process.env.HARMO_MOTS_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env: envFor(tmp), stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch();
    const errs = [];
    const open = async (w, dark = false) => {
        const page = await browser.newPage({viewport: {width: w, height: 900}, colorScheme: dark ? 'dark' : 'light'});
        page.on('pageerror', e => errs.push(`${w}px : ${e.message}`)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(`${w}px console : ${m.text()}`); });
        page.on('dialog', d => d.dismiss());
        await page.goto(base, {waitUntil: 'load'}); await page.waitForTimeout(1800);
        if (dark) await page.evaluate(() => { const A = window.LCNDA_APP; localStorage.setItem('genealogie-design', JSON.stringify({...A.readDesignSettings(), preset: 'dark'})); A.applyDesign(); });
        return page;
    };
    const go = (page, kind, id) => page.evaluate(async ([kind, id]) => { const A = window.LCNDA_APP; document.querySelectorAll('dialog[open]').forEach(d => d.close());
        if (kind === 'list') { A.state.listType = id; await A.setModule('listes'); } else if (kind === 'maint') { A.state.maintenanceTab = id; await A.setModule('maintenance'); } else await A.setModule(id); }, [kind, id]);
    const foot = page => page.evaluate(() => { const d = [...document.querySelectorAll('dialog[open]')].at(-1); return d ? [...d.querySelectorAll('.modal-actions button')].filter(b => b.getBoundingClientRect().width > 0).map(b => b.textContent.trim()) : null; });
    // les variantes qu'on ne doit plus lire à l'écran
    const BAD = /^(↺ )?(Tout )?[Rr]éinitialiser|Revenir au standard|Tout remettre|^(\S{1,2} )?(Rattacher|Lier|Associer)\b|Faire le livre|^📥|^📤 ?Export|^[⬇⬆]|^\+ |^(📘|🐾|🏢|🧩) ?[+＋]|^[➕⊕]/;
    const screenWords = page => page.evaluate(src => { const re = new RegExp(src); return [...document.querySelectorAll('#workspace button, #workspace summary, dialog[open] button')].filter(b => b.getBoundingClientRect().width > 0).map(b => b.textContent.trim().replace(/\s+/g, ' ')).filter(x => re.test(x)); }, BAD.source);
    try {
        const page = await open(1440);
        await t('K3 openDialog « Nouveau… » : « Créer le … » ; « Modifier… » : « Enregistrer » ; « Fermer » seul', async () => {
            await page.evaluate(() => window.LCNDA_EXT.openDialog({eyebrow: 'TEST', title: 'Nouveau livret', body: '<p>x</p>', onSubmit: () => true}));
            assert.deepEqual(await foot(page), ['Annuler', 'Créer le livret']);
            if (shots) await page.screenshot({path: path.join(shots, 'k3-nouveau.png')});
            await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
            await page.evaluate(() => window.LCNDA_EXT.openDialog({eyebrow: 'TEST', title: 'Modifier le livret', body: '<p>x</p>', onSubmit: () => true}));
            assert.deepEqual(await foot(page), ['Annuler', 'Enregistrer']);
            await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
            await page.evaluate(() => { window.__k3 = 0; window.LCNDA_EXT.openDialog({eyebrow: 'TEST', title: 'Les étapes', body: '<p>x</p>', submitLabel: 'Fermer', onSubmit: () => { window.__k3++; return true; }}); });
            assert.deepEqual(await foot(page), ['Fermer'], 'pas « Annuler » + « Fermer »');
            await page.click('dialog[open] .modal-actions button'); await page.waitForTimeout(150);
            assert.equal(await page.evaluate(() => window.__k3), 1, '« Fermer » garde ce que faisait la fenêtre');
            assert.equal(await page.evaluate(() => document.querySelectorAll('dialog[open]').length), 0, 'la fenêtre est fermée');
        });
        await t('K3 filet : une fenêtre de index.php « Nouvelle enquête » → « Créer l’enquête », rouverte pour modifier → « Enregistrer »', async () => {
            const r1 = await page.evaluate(() => { const d = document.getElementById('investigation-dialog'); document.getElementById('investigation-dialog-title').textContent = 'Nouvelle enquête'; d.showModal(); const b = d.querySelector('.modal-actions button[type=submit]').textContent.trim(); d.close();
                document.getElementById('investigation-dialog-title').textContent = 'Modifier l’enquête'; d.showModal(); const b2 = d.querySelector('.modal-actions button[type=submit]').textContent.trim(); d.close(); return [b, b2]; });
            assert.deepEqual(r1, ['Créer l’enquête', 'Enregistrer']);
            const r2 = await page.evaluate(() => { const d = document.getElementById('event-type-dialog'); d.showModal(); const b = d.querySelector('.modal-actions button[type=submit]').textContent.trim(); d.close(); return b; });
            assert.equal(r2, 'Créer le type');
        });
        await t('Des écrans à 1440 px : plus de variante à l’écran (listes, Maintenance, fenêtres « Nouveau… »)', async () => {
            const seen = [];
            for (const [kind, id, click] of [['list', 'pets', '＋ Nouvel animal'], ['list', 'family_booklets', '＋ Nouveau livret'], ['list', 'employers', '＋ Nouvel employeur'], ['list', 'recueils', '＋ Nouveau recueil'], ['list', 'layout_books', null], ['list', 'my_calendar', '⚙️ Réglages'], ['list', 'audios', null], ['maint', 'design', null], ['maint', 'atelier', null], ['module', 'fiches', '＋ Nouvelle fiche']]) {
                await go(page, kind, id); await page.waitForTimeout(700);
                seen.push(...(await screenWords(page)).map(x => `${id}: ${x}`));
                if (click) {
                    const b = page.locator('#workspace button', {hasText: click}).first();
                    if (await b.count()) {
                        await b.click(); await page.waitForTimeout(700);
                        const f = await foot(page);
                        if (f) { seen.push(...(await screenWords(page)).map(x => `${id} (fenêtre) : ${x}`));
                            if (/Nouve/.test(click)) assert.ok(f.some(x => /^Créer (le |la |l’|les )/.test(x)), `${id} : ${f.join(' · ')}`);
                            if (/Réglages/.test(click)) assert.ok(f.includes('Enregistrer') && !f.includes('Appliquer'), `${id} : ${f.join(' · ')}`);
                            if (shots) await page.screenshot({path: path.join(shots, `k3-${id}.png`)}); }
                        await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
                    }
                }
            }
            assert.deepEqual(seen, []);
        });
        await page.close();
        const small = await open(390, true);
        await t('390 px en mode sombre : pas de défilement de côté, « Créer le livret » tient dans la fenêtre', async () => {
            await go(small, 'list', 'family_booklets'); await small.waitForTimeout(800);
            assert.ok(await small.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'pas de défilement de côté');
            await small.evaluate(() => window.LCNDA_EXT.openDialog({eyebrow: 'TEST', title: 'Nouveau livret', body: '<p>x</p>', onSubmit: () => true}));
            const ok = await small.evaluate(() => { const b = [...document.querySelectorAll('dialog[open] .modal-actions button')].at(-1); const r = b.getBoundingClientRect(); return r.right <= window.innerWidth + 1 && b.textContent.trim() === 'Créer le livret'; });
            assert.ok(ok);
            if (shots) await small.screenshot({path: path.join(shots, 'k3-390-sombre.png')});
        });
        await small.close();
        await t('aucune erreur JavaScript', () => assert.deepEqual(errs, []));
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(`${failed ? '✗' : '✓'} harmonisation K3 / K11 : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
