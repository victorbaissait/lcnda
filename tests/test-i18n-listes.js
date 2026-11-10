'use strict';
/* 🌐 Traduction de la zone « Listes » (vague 2) : l'onglet Listes, la Recherche (Que manque-t-il ?, Où chercher ?, murs de brique,
 * Journal des recherches, INSEE, dépouillements…), les Enquêtes, les Battues et l'Atelier, Ma semaine de recherche, Archives en ligne.
 * Mode d'emploi : docs/I18N.md.
 *     node tests/test-i18n-listes.js               (I18N_SHOTS=dossier pour garder des captures, I18N_PORT=20420 par défaut)
 *     I18N_PROBE=de node tests/test-i18n-listes.js    liste les textes français restés à l'écran, écran par écran (sans rien vérifier)
 * 1. Node : les fichiers de langue sont complets (scripts/i18n-check.js), les textes i18n() des fichiers de la zone sont tous traduits,
 *    le moteur « Où chercher ? » donne ses raisons en français dans Node (rien ne change) et dans la langue choisie.
 * 2. Navigateur (Playwright, sinon sauté) : en français rien ne change ; en de, pl et en, presque plus de français dans chaque écran
 *    de la zone ; allemand à 390 px sans débordement ; aucune erreur JS.
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
const ZONE_FILES = ['app-listes.js', 'app-recherche.js', 'heritage-research.js', 'app-enquetes.js', 'heritage-research-gaps.js', 'heritage-semaine.js', 'heritage-archives-en-ligne.js',
    'app-archives-en-ligne-core.js', 'heritage-archive-services.js', 'heritage-ou-chercher.js', 'app-ou-chercher-core.js', 'heritage-journal.js'].map(f => path.join(root, 'assets/js', f));
// les écrans de la zone : [nom, sorte, clé]
const SCREENS = [
    ...['persons', 'events', 'places', 'media', 'labels', 'occupations', 'employers', 'census', 'reminders', 'research_budget', 'signatures', 'sosa', 'daboville', 'archives', 'external_links',
        'courriers', 'living_contacts', 'changes', 'archive_visits', 'research_journal', 'archive_services'].map(k => [`liste ${k}`, 'list', k]),
    ...['text', 'gaps', 'ou_chercher', 'murs', 'place_name', 'dates', 'proximity', 'transcriptions', 'archive_digest', 'journal', 'insee', 'web'].map(k => [`recherche ${k}`, 'research', k]),
    ['enquêtes', 'enq', 'enquetes'], ['battues', 'enq', 'battue'], ['atelier', 'enq', 'atelier'],
];
// au plus ce nombre de textes français par écran (ce qui vient d'app.js ou d'une autre zone, et quelques mots rares)
const ALLOWED = Number(process.env.I18N_ALLOWED || 12);

(async () => {
    /* ═════ 1. Node ═════ */
    await t('fichiers de langue complets et à jour (scripts/i18n-check.js)', () => {
        const r = spawnSync(process.execPath, [path.join(root, 'scripts/i18n-check.js')], {encoding: 'utf8'});
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.ok(fs.existsSync(path.join(root, 'assets/i18n/src/listes.tsv')));
    });
    await t('les textes passés à i18n() dans les fichiers de la zone sont traduits dans les 7 langues', () => {
        const X = require('../scripts/i18n-extract.js');
        for (const l of ['en', 'es', 'de', 'it', 'pt', 'pl', 'nl']) {
            const dict = X.loadDict(l), miss = [];
            for (const f of ZONE_FILES) X.tCalls(f).forEach(x => { if (!X.translated(dict, x.text, x.ctx)) miss.push(`${path.basename(f)}:${x.line} ${x.text}`); });
            assert.deepEqual(miss, [], `${l} : ${miss.join('\n')}`);
        }
    });
    await t('le français ne change pas ; les pluriels et les phrases à variables suivent la langue', () => {
        const I = require('../assets/js/app-i18n.js');
        I.setLang('fr', {persist: false});
        assert.equal(I.t('Lien « {name} » supprimé', {name: 'Geneanet'}), 'Lien « Geneanet » supprimé');
        assert.equal(I.plural(3, 'ligne chargée', 'lignes chargées'), '3 lignes chargées');
        assert.equal(I.plural(1, 'ligne chargée', 'lignes chargées'), '1 ligne chargée');
        I.setLang('de', {persist: false});
        assert.equal(I.t('Lien « {name} » supprimé', {name: 'Geneanet'}), 'Link „Geneanet“ gelöscht');
        assert.equal(I.plural(3, 'ligne chargée', 'lignes chargées'), '3 Zeilen geladen');
        I.setLang('pl', {persist: false});
        assert.equal(I.plural(2, 'personne trouvée', 'personnes trouvées').split(' ')[0], '2');
        assert.equal(I.plural(5, 'site trouvé', 'sites trouvés'), '5 znalezionych stron');
        I.setLang('fr', {persist: false});
    });
    await t('« Où chercher ? » : les raisons en français dans Node (rien ne change), dans la langue choisie dans la page', () => {
        const O = require('../assets/js/app-ou-chercher-core.js');
        const ctx = O.context({person: {id: 1, first: 'Jean', last: 'Martin', gender: 'male', birth_year: 1890}, events: [{tag: 'BIRT', year: 1890, place: 'Tulle', dept: {code: '19', name: 'Corrèze'}}], missing: ['death']});
        assert.equal(O.bornText(ctx), 'Né en 1890 en Corrèze');
        const I = require('../assets/js/app-i18n.js');
        global.window = {LCNDA_I18N: I}; I.setLang('en', {persist: false});
        try { assert.equal(O.bornText(ctx), 'Born in 1890 in Corrèze'); } finally { I.setLang('fr', {persist: false}); delete global.window; }
    });

    /* ═════ 2. Navigateur ═════ */
    const phpPath = findPhp([devBundledPhp()]);
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); console.log(`${failed ? '✗' : '✓'} traduction des Listes : ${count} vérifications`); process.exit(failed ? 1 : 0); }
    const R = require('../scripts/i18n-remaining.js');
    const shots = process.env.I18N_SHOTS || '';
    const tmp = fs.mkdtempSync(path.join(process.env.I18N_TMP || os.tmpdir(), 'carnet-i18n-listes-'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Joseph','Martin','male','deceased'),('Marie','Durand','female','living'),('Louis','Martin','male','deceased')"); $p = null;
require 'lib/bootstrap.php'; $d = db();
// quelques lignes pour que les listes montrent leurs cartes et boutons (des données : jamais traduites)
foreach (["INSERT INTO investigations(person_id,title,question) VALUES(1,'Joseph M.','Joseph ?')", "INSERT INTO archive_visit_plans(title,visit_date,archive_center) VALUES('AD 19','2026-12-01','AD 19')", "INSERT INTO archive_visit_items(visit_id,archive_reference,title) VALUES(1,'3 E 12','3 E 12')"] as $q) { try { $d->exec($q); } catch (Throwable $e) {} }
echo 'ok';`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = Number(process.env.I18N_PORT) || 20420;
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
        await page.goto(base, {waitUntil: 'load'}); await page.waitForTimeout(1500);
        return page;
    };
    const go = (page, kind, id) => page.evaluate(async ([kind, id]) => {
        const A = window.LCNDA_APP; document.querySelectorAll('dialog[open]').forEach(d => d.close());
        if (kind === 'list') { A.state.listType = id; await A.setModule('listes'); }
        else if (kind === 'research') { A.state.researchKind = id; await A.setModule('recherche'); }
        else if (kind === 'enq') { A.state.enquetesTab = id; A.state.currentInvestigationId = 0; A.state.currentBattueId = 0; await A.setModule('enquetes'); }
    }, [kind, id]);
    // tous les textes de l'écran (#workspace + colonne de gauche), hors données et champs de saisie
    const texts = page => page.evaluate(() => {
        const out = new Set();
        document.querySelectorAll('#workspace, #sidebar-content, #sidebar-footer').forEach(el => {
            const tw = document.createTreeWalker(el, 5); let n = el;
            do {
                if (n.nodeType === 1) { if (n.closest('[data-i18n-off], script, style, textarea, code, pre')) continue; ['title', 'placeholder', 'aria-label'].forEach(a => n.getAttribute(a) && out.add(n.getAttribute(a))); }
                else if (n.nodeType === 3 && !n.parentElement.closest('[data-i18n-off], script, style, textarea, code, pre, [data-person-id], .person-name, tbody')) { const s = n.nodeValue.replace(/\s+/g, ' ').trim(); if (s) out.add(s); }
            } while ((n = tw.nextNode()));
        });
        return [...out];
    });
    try {
        if (PROBE) {
            const isFr = R.make(PROBE), page = await open({lang: PROBE});
            const only = process.env.I18N_SCREENS ? process.env.I18N_SCREENS.split(',') : null;
            for (const [name, kind, id] of SCREENS) {
                if (only && !only.includes(id)) continue;
                try { await go(page, kind, id); await page.waitForTimeout(1500); } catch (e) { console.log('!', name, e.message); continue; }
                const left = (await texts(page)).filter(isFr);
                console.log(`\n══ ${name} (${left.length})`); left.forEach(s => console.log(s));
            }
            console.log('\nerreurs JS :', errs);
            return;
        }
        await t('en français, rien ne change : pas de bandeau, html lang="fr", textes des listes en français', async () => {
            const page = await open();
            await go(page, 'list', 'reminders'); await page.waitForTimeout(1300);
            const r = await page.evaluate(() => ({lang: document.documentElement.lang, banner: !!document.getElementById('lc-i18n-banner'), ws: document.querySelector('#workspace').innerText}));
            assert.equal(r.lang, 'fr'); assert.equal(r.banner, false); assert.ok(/Rappels|rappel/i.test(r.ws), r.ws.slice(0, 200));
            await go(page, 'research', 'gaps'); await page.waitForTimeout(1500);
            assert.ok(/Que manque-t-il|actes à chercher/i.test(await page.locator('#workspace').innerText()));
            await go(page, 'enq', 'atelier'); await page.waitForTimeout(1500);
            assert.ok(/Atelier|projet/i.test(await page.locator('#workspace').innerText()));
            await page.context().close();
        });
        for (const l of ['de', 'pl', 'en']) await t(`${l} : les écrans des Listes, de la Recherche et des Enquêtes sont traduits (au plus ${ALLOWED} textes français par écran)`, async () => {
            const isFr = R.make(l), page = await open({lang: l}), bad = {};
            for (const [name, kind, id] of SCREENS) {
                await go(page, kind, id); await page.waitForTimeout(1300);
                const left = (await texts(page)).filter(isFr);
                if (left.length > ALLOWED) bad[name] = left;
                if (shots) await page.screenshot({path: path.join(shots, `i18n-listes-${l}-${id}.png`), fullPage: false});
            }
            assert.deepEqual(bad, {}, `textes français restés : ${JSON.stringify(bad, null, 1)}`);
            await page.context().close();
        });
        await t('allemand à 390 px : les écrans de la zone ne débordent pas', async () => {
            const page = await open({lang: 'de', w: 390}), wide = [];
            for (const [name, kind, id] of SCREENS) {
                await go(page, kind, id); await page.waitForTimeout(1100);
                const r = await page.evaluate(() => ({sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth}));
                if (r.sw > 391 || r.bw > 391) wide.push(`${name} (${Math.max(r.sw, r.bw)} px)`);
            }
            assert.deepEqual(wide, []);
            await page.context().close();
        });
        await t('aucune erreur JavaScript', () => { assert.deepEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(`${failed ? '✗' : '✓'} traduction des Listes : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
