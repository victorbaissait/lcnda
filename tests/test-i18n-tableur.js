'use strict';
/* 🌐 Traduction de la zone « tableur » (vague 4, les éditeurs) : 🧾 Tableur — heritage-tableur.js, -base.js, -cibles.js, -outils.js,
 * -plus.js et les textes d’aide du moteur app-tableur-engine.js (explications d’erreur, aide des fonctions, messages des fichiers).
 * Mode d'emploi : docs/I18N.md.
 *     node tests/test-i18n-tableur.js                (I18N_SHOTS=dossier pour garder des captures, I18N_PORT=20530 par défaut)
 *     I18N_PROBE=de node tests/test-i18n-tableur.js   liste les textes français restés dans l’éditeur et ses fenêtres (sans rien vérifier)
 * 1. Node : fichiers de langue complets (scripts/i18n-check.js) ; chaque texte i18n('…') des fichiers de la zone, chaque aide de
 *    fonction et chaque mot de pluriel a sa traduction EXACTE dans les 7 langues ; le moteur reste en français dans Node
 *    (explain, noms des fonctions et codes d’erreur inchangés).
 * 2. Navigateur (Playwright, sinon sauté) : en français rien ne change ; en de, pl et en, presque plus de français dans l’éditeur
 *    (barre du haut, menus, barre d’outils, colonne d’outils, panneau, barre du bas) et dans ses fenêtres (réglages, trier, doublons,
 *    texte en colonnes, validation, mise en forme conditionnelle, rechercher, fonctions, modèles, remplir depuis l’app, envoyer vers
 *    la base, préparer pour…, sous-totaux, valeur cible, solveur, scénarios, tableau croisé, mini-graphique) ; la barre du haut
 *    tient sur une ligne en allemand à 1440 px ; rien ne déborde à 390 px en allemand ; aucune erreur JS.
 */
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');
const {findPhp, devBundledPhp, phpRuntimeArgs} = require('../electron/php-server');

const root = path.resolve(__dirname, '..');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const PROBE = process.env.I18N_PROBE || '';
const LANGS = ['en', 'es', 'de', 'it', 'pt', 'pl', 'nl'];
const ZONE_FILES = ['heritage-tableur.js', 'heritage-tableur-base.js', 'heritage-tableur-cibles.js', 'heritage-tableur-outils.js', 'heritage-tableur-plus.js', 'app-tableur-engine.js'].map(f => path.join(root, 'assets/js', f));
// au plus ce nombre de textes français par écran (mots venus d'une autre zone, données)
const ALLOWED = Number(process.env.I18N_ALLOWED || 4);
// les fenêtres ouvertes depuis l'éditeur (commande de ed.run)
const DIALOGS = ['settings', 'sort', 'dedupe', 'split', 'validate', 'cf', 'find', 'fn', 'template', 'appfill', 'apppush', 'prepare', 'subtotals', 'goalseek', 'solver', 'scenarios', 'pivot', 'sparkline'];

(async () => {
    /* ═════ 1. Node ═════ */
    await t('fichiers de langue complets et à jour (scripts/i18n-check.js)', () => {
        const r = spawnSync(process.execPath, [path.join(root, 'scripts/i18n-check.js')], {encoding: 'utf8'});
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.ok(fs.existsSync(path.join(root, 'assets/i18n/src/tableur.tsv')));
    });
    const X = require('../scripts/i18n-extract.js');
    const un = s => s.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    await t('chaque i18n(\'…\') et chaque mot de pluriel des fichiers de la zone a sa traduction exacte dans les 7 langues', () => {
        for (const l of LANGS) {
            const dict = X.loadDict(l), miss = [];
            for (const f of ZONE_FILES) {
                const src = fs.readFileSync(f, 'utf8'); let m;
                const rx = /\bi18n\(\s*'((?:[^'\\]|\\.)*)'/g;
                while ((m = rx.exec(src))) { const s = un(m[1]); if (dict[s] == null) miss.push(`${path.basename(f)} ${s}`); }
                const rp = /\bplural\([^,()]*(?:\([^()]*\)[^,()]*)*,\s*'((?:[^'\\]|\\.)*)'/g;
                while ((m = rp.exec(src))) { const s = un(m[1]); if (!dict[s] || typeof dict[s] !== 'object') miss.push(`${path.basename(f)} pluriel ${s}`); }
            }
            assert.deepEqual(miss, [], `${l} : ${miss.join('\n')}`);
        }
    });
    await t('aide des fonctions, menus, formats, modèles et colonnes du serveur traduits (clés exactes)', () => {
        const S = require('../assets/js/app-tableur-engine.js');
        const keys = new Set();
        Object.values(S.FN).forEach(f => { keys.add(f.desc); keys.add(f.fam); });
        ['Fichier', 'Édition', 'Insertion', 'Format', 'Données', 'Affichage', 'Gras', 'Nombre 0,00', 'Date d’acte', 'Relevé de recensement', 'Registre matricule', 'Personnes', 'Événements', 'Recensements',
            'Relevés de dépouillement', 'Mes listes', 'Lieu de naissance', 'Âge au décès', 'Naissances par décennie', 'Un diagramme', 'Ce que le diagramme attend', 'Vide', '⛔ Formule en erreur', 'Windows (vieil Excel)'].forEach(k => keys.add(k));
        for (const l of LANGS) { const dict = X.loadDict(l); const miss = [...keys].filter(k => dict[k] == null); assert.deepEqual(miss, [], `${l} : ${miss.join(' | ')}`); }
    });
    await t('dans Node, le moteur reste en français (explications, noms des fonctions, codes d’erreur)', () => {
        const S = require('../assets/js/app-tableur-engine.js');
        const wb = S.normalize({sheets: [{name: 'A', cells: {A1: 1, A2: '=A1/0', A3: '=SOMMME(1)'}}]}), calc = new S.Calc(wb);
        const e = calc.val(0, 1, 0); assert.equal(e.code, '#DIV/0!'); assert.match(S.explain(e), /^Tu divises par zéro/);
        const n = calc.val(0, 2, 0); assert.equal(n.code, '#NOM?'); assert.match(S.explain(n), /Je ne connais pas « SOMMME »\. Voulais-tu dire SOMME \?/);
        assert.ok(S.FN.SOMME && S.FN.AGE && S.FN['ANNEE.ACTE']);
    });

    /* ═════ 2. Navigateur ═════ */
    const phpPath = findPhp([devBundledPhp()]);
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); console.log(`${failed ? '✗' : '✓'} traduction du tableur : ${count} vérifications`); process.exit(failed ? 1 : 0); }
    const R = require('../scripts/i18n-remaining.js');
    const shots = process.env.I18N_SHOTS || '';
    const tmp = fs.mkdtempSync(path.join(process.env.I18N_TMP || os.tmpdir(), 'carnet-i18n-tableur-'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Joseph','Martin','male','deceased'),('Marie','Durand','female','deceased'),('Louis','Martin','male','deceased')"); $p = null;
require 'lib/bootstrap.php'; db(); echo 'ok';`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = Number(process.env.I18N_PORT) || 20530;
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch();
    const errs = [];
    const watch = (page, tag) => { page.on('pageerror', e => errs.push(`${tag} : ${e.message}`)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(`${tag} console : ${m.text()}`); }); page.on('dialog', d => d.dismiss()); };
    const open = async ({w = 1440, lang = ''} = {}) => {
        const ctx = await browser.newContext({viewport: {width: w, height: 900}});
        await ctx.addInitScript(l => { try { if (!sessionStorage.getItem('i18n-test-set')) { if (l) localStorage.setItem('lcnda-langue', l); else localStorage.removeItem('lcnda-langue'); sessionStorage.setItem('i18n-test-set', '1'); } localStorage.setItem('genealogie-visite-guidee', JSON.stringify({never: true, done: true})); } catch (_) {} }, lang);
        const page = await ctx.newPage(); watch(page, `${lang || 'fr'} ${w}px`);
        await page.goto(base, {waitUntil: 'load'});
        await page.waitForFunction(() => window.LCNDA_APP?.setModule && window.LCNDA_EXT?.openWorkbook && window.LCNDA_SHEET && window.LCNDA_APP.state.csrf);
        await page.waitForTimeout(800);
        return page;
    };
    // un classeur d'essai (des données : jamais traduites), ouvert dans l'éditeur
    const openBook = page => page.evaluate(async () => {
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        const S = window.LCNDA_SHEET, wb = S.newWorkbook(); const sh = wb.sheets[0]; sh.name = 'Data1';
        sh.cells = S.rowsToCells([['Nom', 'Commune', 'Année', 'Âge'], ['MARTIN', 'Tulle', 1836, 34], ['DURAND', 'Naves', 1841, 52], ['MARTIN', 'Tulle', 1846, 61], ['ROCHE', 'Naves', 1851, 23]]);
        sh.cells.F2 = {v: '=D2/0'};
        await window.LCNDA_EXT.openWorkbook({data: S.normalize(wb), name: 'Book1'});
        await new Promise(r => setTimeout(r, 500));
        const E = window.LCNDA_EXT.tableurInternals.current; E.dirty = false; E.select(1, 5); E.render();
    });
    // les textes d'un élément, hors données (grille, onglets des feuilles, nom du classeur, cases de saisie)
    const textsOf = (page, sel) => page.evaluate(sel => {
        const out = new Set(); const el = typeof sel === 'string' ? document.querySelector(sel) : null; if (!el) return null;
        const skip = '[data-i18n-off], script, style, textarea, code, pre, select, .xl-vp, .xl-tabs, .xl-prev, .xl-pv-table, [data-xl-name], .xl-where, [data-person-id], .person-name, .pk-chip';
        const tw = document.createTreeWalker(el, 5); let n = el;
        do {
            if (n.nodeType === 1) { if (n.closest(skip)) continue; ['title', 'placeholder', 'aria-label'].forEach(a => n.getAttribute(a) && out.add(n.getAttribute(a))); }
            else if (n.nodeType === 3 && !n.parentElement.closest(skip)) { const s = n.nodeValue.replace(/\s+/g, ' ').trim(); if (s) out.add(s); }
        } while ((n = tw.nextNode()));
        el.querySelectorAll('select:not([data-i18n-off]) option').forEach(o => { if (!o.closest('.xl-prev')) { const s = o.textContent.trim(); if (s) out.add(s); } });
        return [...out];
    }, sel);
    // l'éditeur avec tous ses menus déroulés
    const editorTexts = async page => {
        await page.evaluate(() => document.querySelectorAll('dialog.xl-dlg details.xl-menu').forEach(d => { d.open = true; }));
        const out = await textsOf(page, 'dialog.xl-dlg');
        await page.evaluate(() => document.querySelectorAll('dialog.xl-dlg details.xl-menu').forEach(d => { d.open = false; }));
        return out;
    };
    // une fenêtre ouverte par une commande de l'éditeur : ses textes, puis on la ferme
    const dialogTexts = (page, cmd) => page.evaluate(async cmd => {
        const E = window.LCNDA_EXT.tableurInternals.current; if (!E) return null;
        document.querySelectorAll('.ui-menu, .h-menu').forEach(m => m.remove?.()); E.select(1, 0); // A2 : le tableau d'essai (texte en colonnes, sous-totaux, tableau croisé)
        const before = new Set(document.querySelectorAll('dialog[open]'));
        if (cmd === 'template') window.LCNDA_EXT.chooseSheetTemplate?.({}); else E.run(cmd);
        for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 100)); if ([...document.querySelectorAll('dialog[open]')].some(d => !before.has(d))) break; }
        await new Promise(r => setTimeout(r, 500));
        const d = [...document.querySelectorAll('dialog[open]')].filter(x => !before.has(x)).pop(); if (!d) return null;
        d.id = d.id || 'i18n-probe-dlg';
        return d.id;
    }, cmd).then(async id => {
        if (!id) return null;
        const out = await textsOf(page, `#${id}`);
        await page.evaluate(id => { const d = document.getElementById(id); d?.close(); d?.remove?.(); }, id);
        return out;
    });
    try {
        if (PROBE) {
            const isFr = R.make(PROBE), page = await open({lang: PROBE});
            await openBook(page);
            const left = (await editorTexts(page)).filter(isFr); console.log(`\n══ éditeur (${left.length})`); left.forEach(s => console.log(s));
            for (const c of DIALOGS) { const dl = await dialogTexts(page, c).catch(e => { console.log('!', c, e.message); return null; }); if (!dl) { console.log(`── ${c} : pas de fenêtre`); continue; } const l2 = dl.filter(isFr); console.log(`── ${c} (${l2.length})`); l2.forEach(s => console.log(s)); }
            console.log('\nerreurs JS :', errs);
            return;
        }
        await t('en français, rien ne change : pas de bandeau, html lang="fr", l’éditeur et ses menus en français', async () => {
            const page = await open();
            await openBook(page);
            const r = await page.evaluate(() => ({lang: document.documentElement.lang, banner: !!document.getElementById('lc-i18n-banner'), menus: [...document.querySelectorAll('dialog.xl-dlg .xl-menu > summary')].map(s => s.textContent), help: document.querySelector('[data-xl-panel]').innerText}));
            assert.equal(r.lang, 'fr'); assert.equal(r.banner, false);
            assert.deepEqual(r.menus, ['Fichier', 'Édition', 'Insertion', 'Format', 'Données', 'Affichage']);
            assert.match(r.help, /Tu divises par zéro/);
            const st = await dialogTexts(page, 'sort'); assert.ok(st.includes('La première ligne, ce sont les titres'), st.join(' | '));
            await page.context().close();
        });
        for (const l of ['de', 'pl', 'en']) await t(`${l} : l’éditeur et ses ${DIALOGS.length} fenêtres sont traduits (au plus ${ALLOWED} textes français chacun)`, async () => {
            const isFr = R.make(l), page = await open({lang: l}), bad = {};
            await openBook(page);
            const left = (await editorTexts(page)).filter(isFr); if (left.length > ALLOWED) bad['éditeur'] = left;
            const menus = await page.evaluate(() => [...document.querySelectorAll('dialog.xl-dlg .xl-menu > summary')].map(s => s.textContent));
            assert.notDeepEqual(menus, ['Fichier', 'Édition', 'Insertion', 'Format', 'Données', 'Affichage'], 'les menus du haut sont traduits');
            if (shots) await page.screenshot({path: path.join(shots, `i18n-tableur-${l}.png`)});
            for (const c of DIALOGS) {
                const dl = await dialogTexts(page, c);
                if (!dl) { bad[`${c} (pas de fenêtre)`] = []; continue; }
                const l2 = dl.filter(isFr); if (l2.length > ALLOWED) bad[c] = l2;
            }
            assert.deepEqual(bad, {}, `textes français restés : ${JSON.stringify(bad, null, 1)}`);
            await page.context().close();
        });
        await t('allemand à 1440 px : la barre du haut tient sur une ligne (même hauteur qu’en français)', async () => {
            const h = {};
            for (const l of ['', 'de']) {
                const page = await open({lang: l}); await openBook(page);
                h[l || 'fr'] = await page.evaluate(() => { const b = document.querySelector('dialog.xl-dlg .ui-topbar'); const kids = [...b.children].filter(k => k.offsetParent); const tops = kids.map(k => Math.round(k.getBoundingClientRect().top)); return {h: Math.round(b.getBoundingClientRect().height), spread: Math.max(...tops) - Math.min(...tops), over: b.scrollWidth - b.clientWidth}; });
                if (shots) await page.screenshot({path: path.join(shots, `i18n-tableur-topbar-${l || 'fr'}.png`), clip: {x: 0, y: 0, width: 1440, height: 120}});
                await page.context().close();
            }
            assert.ok(h.de.h <= h.fr.h + 2, `hauteur : ${JSON.stringify(h)}`);
            assert.ok(h.de.spread <= h.fr.spread + 2 && h.de.over <= 1, `une seule ligne (les boutons au même niveau qu’en français, rien ne dépasse) : ${JSON.stringify(h)}`);
        });
        await t('allemand à 390 px : l’éditeur et ses fenêtres ne débordent pas', async () => {
            const page = await open({lang: 'de', w: 390}), wide = [];
            await openBook(page);
            const r = await page.evaluate(() => { const d = document.querySelector('dialog.xl-dlg'); return {d: d.scrollWidth - d.clientWidth, doc: document.documentElement.scrollWidth}; });
            if (r.d > 1 || r.doc > 391) wide.push(`éditeur (${JSON.stringify(r)})`);
            for (const c of ['settings', 'sort', 'validate', 'cf', 'appfill', 'prepare', 'pivot', 'solver']) {
                const w = await page.evaluate(async c => {
                    const E = window.LCNDA_EXT.tableurInternals.current, before = new Set(document.querySelectorAll('dialog[open]')); E.run(c);
                    for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 100)); if ([...document.querySelectorAll('dialog[open]')].some(d => !before.has(d))) break; }
                    await new Promise(r => setTimeout(r, 400));
                    const d = [...document.querySelectorAll('dialog[open]')].filter(x => !before.has(x)).pop(); if (!d) return null;
                    const box = d.getBoundingClientRect(), res = {w: Math.round(box.right), sw: d.scrollWidth - d.clientWidth, doc: document.documentElement.scrollWidth};
                    d.close(); d.remove?.(); return res;
                }, c);
                if (w && (w.w > 391 || w.sw > 1 || w.doc > 391)) wide.push(`${c} (${JSON.stringify(w)})`);
            }
            assert.deepEqual(wide, []);
            await page.context().close();
        });
        await t('aucune erreur JavaScript', () => { assert.deepEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(`${failed ? '✗' : '✓'} traduction du tableur : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
