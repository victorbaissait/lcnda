'use strict';
/* 🌐 Traduction de la zone « graphiques » (vague 3) : l'onglet Graphiques (arbres, diagrammes, distributions, statistiques),
 * l'éditeur de diagrammes et ses options, l'éditeur de graphiques (« Mes graphiques »), le tableau de bord et ses widgets,
 * la Carte, la météo d'autrefois, le suivi des animaux, l'ADN. Mode d'emploi : docs/I18N.md.
 *     node tests/test-i18n-graphiques.js               (I18N_SHOTS=dossier pour garder des captures, I18N_PORT=20470 par défaut)
 *     I18N_PROBE=de node tests/test-i18n-graphiques.js    liste les textes français restés à l'écran, écran par écran (sans rien vérifier)
 * 1. Node : les fichiers de langue sont complets (scripts/i18n-check.js), les textes i18n() des fichiers de la zone sont tous traduits.
 * 2. Navigateur (Playwright, sinon sauté) : en français rien ne change ; en de, pl et en, presque plus de français dans chaque écran
 *    de la zone ; allemand à 390 px sans débordement ; aucune erreur JS. Données d'essai : une petite famille (dont une personne
 *    née en 1962), des lieux avec coordonnées, un animal.
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
const ZONE_FILES = ['app-carte.js', 'app-graphiques.js', 'app-diagram-plus-core.js', 'app-suivi-core.js', 'app-tableau-de-bord.js', 'heritage-carte-vie.js',
    'heritage-cartes-plus.js', 'heritage-desk-widgets.js', 'heritage-diagram-adn-chiffres.js', 'heritage-diagram-cartes-plus.js', 'heritage-diagram-cartes.js',
    'heritage-diagram-cartes2.js', 'heritage-diagram-chiffres.js', 'heritage-diagram-famille.js', 'heritage-diagram-genea.js', 'heritage-diagram-graphique.js',
    'heritage-diagram-kinds.js', 'heritage-diagram-more.js', 'heritage-diagram-nouveaux.js', 'heritage-diagram-options.js', 'heritage-diagram-perso.js',
    'heritage-diagram-plus.js', 'heritage-diagram-vie.js', 'heritage-diagrams-render.js', 'heritage-diagrams.js', 'heritage-dna.js', 'heritage-graphs.js',
    'heritage-meteo.js', 'heritage-suivi-fiche.js', 'heritage-suivi-partage.js', 'heritage-suivi.js', 'heritage-widgets.js'].map(f => path.join(root, 'assets/js', f));
const GRAPH_MODES = ['ancestors', 'descendants', 'hourglass', 'fan', 'kinship', 'implexe', 'lineage', 'social', 'occupations', 'occtree', 'migrations', 'household',
    'square', 'circular', 'symmetric', 'fractal', 'genogram', 'distribution', 'place_monograph'];
// les écrans de la zone : [nom, sorte, clé]
const SCREENS = [
    ...GRAPH_MODES.map(k => [`graphique ${k}`, 'graph', k]),
    ['statistiques (noms)', 'stats', 'surnames'], ['statistiques (âge au décès)', 'stats', 'age_at_death'], ['statistiques (pyramide)', 'stats', 'genealogy_age_pyramid'],
    ['tableau de bord', 'module', 'dashboard'], ['carte', 'module', 'carte'], ['ADN', 'module', 'adn'], ['suivi des animaux', 'module', 'suivi'],
    ['éditeur de diagrammes', 'dialog', 'diagram'], ['éditeur de graphiques', 'dialog', 'mygraph'], ['météo : réglages', 'dialog', 'meteo-settings'], ['météo : à propos', 'dialog', 'meteo-about'],
];
// au plus ce nombre de textes français par écran (ce qui vient d'app.js ou d'une autre zone, et quelques mots rares)
const ALLOWED = Number(process.env.I18N_ALLOWED || 12);
// le tableau de bord montre aussi les widgets des autres zones (pistes de recherche calculées par le serveur, SocFace, Trésors,
// mode simple) : on les laisse à leur zone, d'où une marge plus grande pour cet écran-là
const ALLOWED_BY = {dashboard: Number(process.env.I18N_ALLOWED_DASH || 35)};

(async () => {
    /* ═════ 1. Node ═════ */
    await t('fichiers de langue complets et à jour (scripts/i18n-check.js)', () => {
        const r = spawnSync(process.execPath, [path.join(root, 'scripts/i18n-check.js')], {encoding: 'utf8'});
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.ok(fs.existsSync(path.join(root, 'assets/i18n/src/graphiques.tsv')));
    });
    await t('les textes passés à i18n() dans les fichiers de la zone sont traduits dans les 7 langues', () => {
        const X = require('../scripts/i18n-extract.js');
        for (const l of ['en', 'es', 'de', 'it', 'pt', 'pl', 'nl']) {
            const dict = X.loadDict(l), miss = [];
            for (const f of ZONE_FILES) X.tCalls(f).forEach(x => { if (/^[a-z_0-9.]+$/.test(x.text)) return; if (!X.translated(dict, x.text, x.ctx)) miss.push(`${path.basename(f)}:${x.line} ${x.text}`); });
            assert.deepEqual(miss, [], `${l} : ${miss.join('\n')}`);
        }
    });
    /* ═════ 2. Navigateur ═════ */
    const phpPath = findPhp([devBundledPhp()]);
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); console.log(`${failed ? '✗' : '✓'} traduction des graphiques : ${count} vérifications`); process.exit(failed ? 1 : 0); }
    const R = require('../scripts/i18n-remaining.js');
    const shots = process.env.I18N_SHOTS || '';
    const tmp = fs.mkdtempSync(path.join(process.env.I18N_TMP || os.tmpdir(), 'carnet-i18n-graphiques-'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status,is_start) VALUES('Joseph','Martin','male','deceased',0),('Marie','Durand','female','deceased',0),('Louis','Martin','male','deceased',0),('Jeanne','Petit','female','deceased',0),('Claire','Martin','female','living',1)"); $p = null;
require 'lib/bootstrap.php'; $d = db();
$birth = (int) $d->query("SELECT id FROM event_types WHERE slug='birth'")->fetchColumn(); $death = (int) $d->query("SELECT id FROM event_types WHERE slug='death'")->fetchColumn();
$d->exec("INSERT INTO places(name,county,country,latitude,longitude) VALUES('Tulle','Corrèze','France',45.267,1.770),('Brive-la-Gaillarde','Corrèze','France',45.159,1.533)");
$d->exec("INSERT INTO families(partner1_id,partner2_id) VALUES(1,2),(3,4)");
$d->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,3),(2,5)");
$ev = $d->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)");
foreach ([[1,$birth,'1880',1880,'1880-01-01',1],[1,$death,'1950',1950,'1950-01-01',1],[2,$birth,'1885',1885,'1885-01-01',2],[2,$death,'1960',1960,'1960-01-01',2],[3,$birth,'1910',1910,'1910-03-02',1],[3,$death,'1990',1990,'1990-01-01',2],[4,$birth,'1915',1915,'1915-01-01',2],[4,$death,'2001',2001,'2001-01-01',1],[5,$birth,'12 mai 1962',1962,'1962-05-12',2]] as $r) { try { $ev->execute($r); } catch (Throwable $e) {} }
foreach (["INSERT INTO pets(data_json) VALUES('{\"name\":\"Rex\",\"species\":\"chien\"}')"] as $q) { try { $d->exec($q); } catch (Throwable $e) {} }
echo 'ok';`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = Number(process.env.I18N_PORT) || 20470;
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch();
    const errs = [];
    const watch = (page, tag) => { page.on('pageerror', e => errs.push(`${tag} : ${e.message}`)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|tile|Leaflet/i.test(m.text())) errs.push(`${tag} console : ${m.text()}`); }); page.on('dialog', d => d.dismiss()); };
    const open = async ({w = 1440, lang = ''} = {}) => {
        const ctx = await browser.newContext({viewport: {width: w, height: 900}});
        await ctx.addInitScript(l => { try { if (!sessionStorage.getItem('i18n-test-set')) { if (l) localStorage.setItem('lcnda-langue', l); else localStorage.removeItem('lcnda-langue'); sessionStorage.setItem('i18n-test-set', '1'); } localStorage.setItem('genealogie-visite-guidee', JSON.stringify({never: true, done: true})); } catch (_) {} }, lang);
        const page = await ctx.newPage(); watch(page, `${lang || 'fr'} ${w}px`);
        await page.route(/tile\.openstreetmap|tiles?\.|arcgisonline|opentopomap|cartocdn/i, r => r.abort());
        await page.goto(base, {waitUntil: 'load'}); await page.waitForTimeout(1500);
        return page;
    };
    const go = (page, kind, id) => page.evaluate(async ([kind, id]) => {
        const A = window.LCNDA_APP, E = window.LCNDA_EXT || {};
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        A.state.currentPersonId = 5;
        if (kind === 'graph') { A.state.graphTab = 'types'; A.state.graphMode = id; await A.setModule('graphiques'); }
        else if (kind === 'stats') { A.state.graphTab = 'types'; A.state.graphMode = 'stats'; A.state.graphStatsType = id; await A.setModule('graphiques'); }
        else if (kind === 'module') await A.setModule(id);
        else if (kind === 'dialog') {
            if (A.state.module !== 'graphiques') await A.setModule('graphiques');
            if (id === 'diagram') E.openDiagramEditor?.(null);
            else if (id === 'mygraph') E.newMyGraph?.();
            else if (id === 'meteo-settings') E.meteo?.openSettings?.();
            else if (id === 'meteo-about') E.meteo?.openAbout?.();
        }
    }, [kind, id]);
    // tous les textes de l'écran (#workspace + colonne de gauche + fenêtre ouverte), hors données et champs de saisie
    const texts = (page, dialogOnly) => page.evaluate(only => {
        const out = new Set();
        const roots = only ? [...document.querySelectorAll('dialog[open], .modal-backdrop .modal')] : [...document.querySelectorAll('#workspace, #sidebar-content, #sidebar-footer, dialog[open]')];
        roots.forEach(el => {
            const tw = document.createTreeWalker(el, 5); let n = el;
            do {
                if (n.nodeType === 1) { if (n.closest('[data-i18n-off], script, style, textarea, code, pre')) continue; ['title', 'placeholder', 'aria-label'].forEach(a => n.getAttribute(a) && out.add(n.getAttribute(a))); }
                else if (n.nodeType === 3 && !n.parentElement.closest('[data-i18n-off], script, style, textarea, code, pre, [data-person-id], .person-name, tbody, svg, .leaflet-container .leaflet-tile-pane')) { const s = n.nodeValue.replace(/\s+/g, ' ').trim(); if (s) out.add(s); }
            } while ((n = tw.nextNode()));
        });
        return [...out];
    }, dialogOnly);
    try {
        if (PROBE) {
            const isFr = R.make(PROBE), page = await open({lang: PROBE});
            const only = process.env.I18N_SCREENS ? process.env.I18N_SCREENS.split(',') : null;
            for (const [name, kind, id] of SCREENS) {
                if (only && !only.includes(id)) continue;
                try { await go(page, kind, id); await page.waitForTimeout(1800); } catch (e) { console.log('!', name, e.message); continue; }
                const left = (await texts(page, kind === 'dialog')).filter(isFr);
                console.log(`\n══ ${name} (${left.length})`); left.forEach(s => console.log(s));
            }
            console.log('\nerreurs JS :', errs);
            return;
        }
        await t('en français, rien ne change : pas de bandeau, html lang="fr", textes des graphiques en français', async () => {
            const page = await open();
            await go(page, 'graph', 'ancestors'); await page.waitForTimeout(1500);
            const r = await page.evaluate(() => ({lang: document.documentElement.lang, banner: !!document.getElementById('lc-i18n-banner'), side: document.querySelector('#sidebar-content').innerText + document.querySelector('#sidebar-footer').innerText}));
            assert.equal(r.lang, 'fr'); assert.equal(r.banner, false);
            assert.ok(/Diagrammes/.test(r.side) && /Arbre décoratif à imprimer/.test(r.side), r.side.slice(0, 300));
            await go(page, 'module', 'dashboard'); await page.waitForTimeout(1500);
            assert.ok(/tableau de bord/i.test(await page.locator('body').innerText()));
            await page.context().close();
        });
        for (const l of ['de', 'pl', 'en']) await t(`${l} : les écrans des graphiques, de la carte et du tableau de bord sont traduits (au plus ${ALLOWED} textes français par écran)`, async () => {
            const isFr = R.make(l), page = await open({lang: l}), bad = {};
            for (const [name, kind, id] of SCREENS) {
                await go(page, kind, id); await page.waitForTimeout(1500);
                const left = (await texts(page, kind === 'dialog')).filter(isFr);
                if (left.length > (ALLOWED_BY[id] || ALLOWED)) bad[name] = left;
                if (shots) await page.screenshot({path: path.join(shots, `i18n-graphiques-${l}-${id}.png`), fullPage: false});
            }
            assert.deepEqual(bad, {}, `textes français restés : ${JSON.stringify(bad, null, 1)}`);
            await page.context().close();
        });
        await t('allemand à 390 px : les écrans de la zone ne débordent pas', async () => {
            const page = await open({lang: 'de', w: 390}), wide = [];
            for (const [name, kind, id] of SCREENS) {
                if (kind === 'dialog') continue;
                await go(page, kind, id); await page.waitForTimeout(1200);
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
    console.log(`${failed ? '✗' : '✓'} traduction des graphiques : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
