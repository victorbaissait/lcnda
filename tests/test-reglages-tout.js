'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 💾 « Réglages enregistrés : toute l’app » prend VRAIMENT tout (assets/js/heritage-studio.js, le registre des réglages ;
 * inventaire : docs/reglages-inventaire.md).
 *   node tests/test-reglages-tout.js
 *  A. sans navigateur : tout assets/js est passé au crible ; chaque clé de localStorage doit être classée par le registre
 *     (« genealogie-… » et « lcnda-… » : gardées d'office, sauf exceptions listées avec leur raison ; une autre clé : déclarée
 *     dans ALL_EXTRA ou ALL_OUTSIDE). Une clé au nom suspect (clé, jeton, brouillon, tâche, cache, « déjà dit »…) gardée sans avoir
 *     été relue ici fait échouer : un secret ou un état passager n'entre jamais par mégarde dans un fichier de réglages.
 *  B. de bout en bout : ~20 réglages de toutes sortes (ordre d'une liste, groupe caché, colonnes, tri, thème, raccourci, Atelier,
 *     carte, widget du tableau de bord, sections repliées, favoris, horloges, liste de données, puzzle…) → enregistrer → tout remis
 *     au départ → appliquer → tout revient (aussi après rechargement) → « ↶ Annuler » remet l'état d'avant → fichier exporté puis
 *     importé : tout revient encore. Les secrets et l'état passager ne sont ni gardés ni effacés.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const vm = require('node:vm');
const { spawn, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const finish = () => { console.log(`${failed ? '✗' : '✓'} réglages : tout de chez tout : ${count} vérifications${failed ? `, ${failed} en échec` : ''}`); process.exit(failed ? 1 : 0); };

/* ═════ le registre, tel qu'il est écrit dans heritage-studio.js (exécuté à part, sans navigateur) ═════ */
function loadRegistry() {
    const src = read('assets/js/heritage-studio.js');
    const start = src.indexOf("const ALL_PROFILES_KEY = 'genealogie-settings-profiles';"), endMark = src.indexOf('ext.settingsRegistry = ');
    assert.ok(start > 0 && endMark > start, 'le registre des réglages est dans heritage-studio.js');
    const end = src.indexOf('\n', endMark);
    const ctx = {ext: {}, PROFILES_KEY: 'genealogie-layout-profiles', JSON};
    vm.runInNewContext(src.slice(start, end), ctx);
    return {...ctx.ext.settingsRegistry, src};
}

/* ═════ toutes les clés de localStorage écrites ou lues par assets/js ═════ */
const WRAPPERS = ['ls', 'lsSet', 'lsGet', 'lsDel', 'lsJson', 'lsSave', 'readJ', 'writeJ', 'readJson', 'writeJson', 'readLS', 'writeLS'];
function scanKeys() {
    const files = [];
    (function walk(d) { for (const e of fs.readdirSync(d, {withFileTypes: true})) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.js$/.test(e.name) && !/\.min\.js$/.test(e.name)) files.push(p); } })(path.join(root, 'assets/js'));
    const found = new Map(); // clé (ou « préfixe* ») → {store, files}
    const add = (key, store, f) => { const k = `${store}|${key}`; if (!found.has(k)) found.set(k, {key, store, files: new Set()}); found.get(k).files.add(path.relative(root, f)); };
    const LIT = (n = 1) => '([\'"`])([^\'"`$\\n]{1,120})(?:\\' + n + '(\\s*\\+)?|(\\$\\{))'; // 'clé', 'préfixe-' + x, `préfixe-${x}` (n : le numéro du groupe du guillemet)
    const named = n => /^[A-Z][A-Z0-9_]*$/.test(n) || /(KEY|Key|PREF|Pref|PREFIX|Prefix)/.test(n); // (pas « k », « key »… : trop de valeurs différentes)
    const keyLike = v => /^[A-Za-z]/.test(v) && /[-_:]/.test(v);
    for (const f of files) {
        const src = fs.readFileSync(f, 'utf8');
        if (src.length > 3e6) continue;
        // const X = 'clé' (plusieurs valeurs possibles), pour retrouver localStorage.getItem(X)
        const consts = {};
        for (const m of src.matchAll(/\b([A-Za-z_$][\w$]*)\s*=\s*(['"`])([^'"`$\n]{1,120})(?:\2|(\$\{))/g)) if (named(m[1])) (consts[m[1]] = consts[m[1]] || new Set()).add(m[3] + (m[4] ? '*' : ''));
        for (const m of src.matchAll(new RegExp(String.raw`\b(local|session)Storage\.(?:get|set|remove)Item\(\s*` + LIT(2), 'g'))) add(m[3] + (m[4] || m[5] ? '*' : ''), m[1], f);
        for (const m of src.matchAll(/\b(local|session)Storage\.(?:get|set|remove)Item\(\s*([A-Za-z_$][\w$]*)\s*[,)+]/g)) for (const v of consts[m[2]] || []) if (keyLike(v)) add(v, m[1], f);
        for (const m of src.matchAll(new RegExp(String.raw`(?<![\w.$])(?:${WRAPPERS.join('|')})\(\s*` + LIT(), 'g'))) add(m[2] + (m[3] || m[4] ? '*' : ''), 'local', f);
        for (const m of src.matchAll(new RegExp(String.raw`(?<![\w.$])(?:${WRAPPERS.join('|')})\(\s*([A-Za-z_$][\w$]*)\s*[,)+]`, 'g'))) for (const v of consts[m[1]] || []) if (keyLike(v)) add(v, 'local', f);
        // les petits magasins des modules (store.get, ls.set, sess.get…) : seulement les clés « genealogie-… » / « lcnda-… » (leurs autres noms sont des sous-clés)
        for (const m of src.matchAll(new RegExp(String.raw`\.(?:get|set|del|remove|getJSON|setJSON)\(\s*` + LIT(), 'g'))) if (/^(genealogie|lcnda)[-_]/.test(m[2])) add(m[2] + (m[3] || m[4] ? '*' : ''), /\bsess\.$/.test(src.slice(Math.max(0, m.index - 5), m.index + 1)) ? 'session' : 'local', f);
        for (const m of src.matchAll(/\.(?:get|set|del|remove|getJSON|setJSON)\(\s*([A-Za-z_$][\w$]*)\s*[,)]/g)) for (const v of consts[m[1]] || []) if (/^(genealogie|lcnda)[-_]/.test(v)) add(v, 'local', f);
        // toute chaîne « genealogie-… » / « lcnda-… » nommée comme une clé (const XXX_KEY = '…') : aussi classée
        for (const m of src.matchAll(/\b[A-Z][A-Z0-9_]*(?:KEY|PREF|PREFIX)[A-Z0-9_]*\s*=\s*(['"`])((?:genealogie|lcnda)[-_][^'"`$\n]{1,100})(\$\{)?/g)) add(m[2] + (m[3] ? '*' : ''), 'local', f);
    }
    return [...found.values()].map(x => ({...x, files: [...x.files]}));
}
// des noms qui font penser à un secret, un brouillon, une tâche, un cache, une date ou « déjà dit » : relus un par un (gardés : c'est voulu)
const SUSPECT = /(^|[-_:])(keys?|tokens?|secrets?|pass(word)?|pwd|draft|brouillon|job|cache|dl|recents?|told|warned|shown|seen|reminded|notified|tip|hint|closed|last|derniere?|dernier|history|historique|timers?|chrono|clock|pending|unsent|lock|locks|records|scores|games)([-_:]|$)/i;
const REVIEWED_KEPT = {
    'genealogie-recent-colors': 'les couleurs récentes du sélecteur : un choix d’apparence, sans fiche',
    'genealogie-recent-fonts': 'les polices récentes : idem', 'genealogie-recent-icons': 'les icônes récentes : idem', 'genealogie-glyphs-recent': 'les caractères récents : idem',
    'lcnda-vx-recent-colors': 'les couleurs récentes du dessin : idem', 'genealogie-tresors-recent': 'les derniers trésors ouverts (noms d’outils, pas de fiche)',
    'genealogie-donnees-recents': 'les dernières données ouvertes (identifiants de listes, pas de fiche)',
    'lcnda-lot-derniere': 'la dernière recette des traitements par lot : un réglage', 'genealogie-retouch-side-closed': 'le panneau de la retouche replié : un choix de mise en page',
    'genealogie-menu-own-last': '« Mettre mes onglets à la fin du menu » : un vrai choix',
    'lcnda-calculette-ouverte': 'la calculette ouverte ou non : un choix de mise en page', 'genealogie-tx-trouve-ouvert': '« Ce que l’app a trouvé » ouvert : un choix de mise en page',
    'lcnda-i18n-banner-closed': '(non gardé)', 'genealogie-goose-lists-v1': 'les listes de questions du jeu de l’oie faites par soi : comme des modèles',
    'genealogie-atelier-timers': '(non gardé)', 'genealogie-auto-backup-lock': '(non gardé)', 'genealogie-histoire-dl': '(non gardé)',
    'lcnda-succ-chrono': '(non gardé)', 'lcnda-succ-chrono-act': '(non gardé)', 'genealogie-research-clock': '(non gardé)',
};

(async () => {
    const R = loadRegistry();
    const keys = scanKeys();
    await t(`A. le crible : ${keys.length} clés trouvées dans assets/js, chacune classée par le registre`, () => {
        const unknown = [], suspect = [];
        for (const {key, store, files} of keys) {
            if (store === 'session') continue; // sessionStorage : jamais gardé (passager par nature)
            const base = key.endsWith('*') ? key.slice(0, -1) : key, probe = key.endsWith('*') ? base + 'x' : key;
            if (/^(genealogie|lcnda)-/.test(base)) {
                if (R.isAllKey(probe) && SUSPECT.test(base.replace(/[-:]$/, '')) && !REVIEWED_KEPT[base]) suspect.push(`${key} (${files[0]})`);
                continue;
            }
            if (R.extra.includes(base) || Object.keys(R.outside).some(k => k === base || (k.endsWith(':') && base.startsWith(k)))) continue;
            unknown.push(`${key} (${files.join(', ')})`);
        }
        assert.deepEqual(unknown, [], 'des clés hors « genealogie-… » / « lcnda-… » que le registre ne connaît pas : à renommer, ou à déclarer dans ALL_EXTRA / ALL_OUTSIDE (heritage-studio.js)');
        assert.deepEqual(suspect, [], 'des clés au nom suspect gardées par « toute l’app » : à exclure (ALL_SKIP / LCNDA_SKIP) ou à relire (REVIEWED_KEPT de ce test)');
    });
    await t('A. ce qui ne doit jamais partir : secrets, chemins, état passager, fiches précises', () => {
        const never = ['genealogie-artist-keys', 'genealogie-auto-backup-settings', 'genealogie-auto-backup-lock', 'genealogie-settings-unsent', 'genealogie-settings-profiles', 'genealogie-layout-profiles',
            'genealogie-sosa-root', 'genealogie-sosa-multi', 'genealogie-tx-draft-new', 'genealogie-tx-draft-m12', 'genealogie-tx-cmp-draft-5', 'genealogie-tx-pages-pliees-7', 'genealogie-gov-dl', 'genealogie-meteo-dl',
            'genealogie-bg-photo', 'lcnda-langue', 'lcnda-mode-simple-device', 'lcnda-jeux-dos-image', 'lcnda-journal-erreurs', 'lcnda-faces-job', 'lcnda-relecture-abc', 'lcnda-photomaps-view:12',
            'lcnda-settings-renamed-v1', 'lcnda-designs-ui-v2', 'lcnda_puzzle-base-v2', 'theme', 'inconnue'];
        for (const k of never) assert.equal(R.isAllKey(k), false, k);
        const kept = ['genealogie-design', 'genealogie-side-order', 'lcnda-side-order', 'genealogie-list-hidden', 'genealogie-list-columns', 'lcnda-sort:listes:persons', 'genealogie-shortcuts',
            'genealogie-tx-aide-ia-place', 'genealogie-tx-trouve-mode', 'genealogie-tx-comparer-image', 'genealogie-tx-cmp-mode', 'genealogie-tx-cmp-ma-lecture', 'genealogie-map-options',
            'lcnda-cartes-couches', 'lcnda-map-frontieres', 'lcnda-cadastre-layer', 'genealogie-dashboard-blocks', 'genealogie-horloges', 'genealogie-reglages-ouverts', 'lcnda-sheet-sections-open',
            'lcnda-tresors-groups', 'genealogie-tresors-favs', 'genealogie-tx-car-favoris', 'lcnda-side-panel-width', 'lcnda-ld:hist_gares', 'lcnda-puzzle-prefs', 'lcnda-photomaps-shape', 'lcnda-vx-folds'];
        for (const k of kept) assert.equal(R.isAllKey(k), true, k);
    });
    await t('A. les jetons personnels (Discogs, TMDb) ne vont pas non plus dans la base (ni dans une sauvegarde)', () => {
        assert.match(read('assets/js/app.js'), /LOCAL_ONLY=new Set\(\[[^\]]*'genealogie-artist-keys'/);
        assert.match(read('lib/settings.php'), /APP_SETTINGS_LOCAL_ONLY = \[[^\]]*'genealogie-artist-keys'/);
    });
    await t('A. le puzzle range ses réglages sous « lcnda-… » (l’ancien nom est encore lu)', () => {
        const p = read('assets/js/app-puzzle.js');
        assert.match(p, /PREFS_KEY = 'lcnda-puzzle-prefs', OLD_PREFS_KEY = 'lcnda_puzzle-prefs-v1'/);
        assert.match(p, /store\.get\(PREFS_KEY, null\) \|\| store\.get\(OLD_PREFS_KEY/);
    });
    await t('A. l’inventaire (docs/reglages-inventaire.md) existe et parle du registre', () => {
        const md = read('docs/reglages-inventaire.md');
        for (const w of ['genealogie-artist-keys', 'lcnda-langue', 'ALL_SKIP', 'sessionStorage', 'IndexedDB', 'genealogie-ia-serveur.json']) assert.ok(md.includes(w), w);
    });

    /* ═════ B. de bout en bout, dans le navigateur ═════ */
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    let phpPath = null;
    try { const {findPhp, devBundledPhp} = require('../electron/php-server'); phpPath = findPhp([devBundledPhp()]); } catch (_) { phpPath = null; }
    if (!chromium || !phpPath || process.env.REGLAGES_SANS_NAVIGATEUR) { console.log('— navigateur : Playwright ou PHP absent (ou REGLAGES_SANS_NAVIGATEUR), partie sautée'); finish(); return; }
    const {phpRuntimeArgs} = require('../electron/php-server');
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const tmpAll = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-reglages-tout-'));
    const dir = path.join(tmpAll, 'base'); fs.mkdirSync(path.join(dir, 'media'), {recursive: true});
    const env = {...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const r0 = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Louise','BORIE','female','deceased')");
$p = null; require 'lib/bootstrap.php'; db(); echo 'ok';`], {cwd: root, encoding: 'utf8', env});
    if (r0.status !== 0) throw new Error(r0.stderr || r0.stdout);
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch();
    const errs = [];
    const context = await browser.newContext({viewport: {width: 1440, height: 900}, acceptDownloads: true});
    const page = await context.newPage();
    await page.addInitScript(() => { try { if (!localStorage.getItem('genealogie-reglages-presentation')) localStorage.setItem('genealogie-reglages-presentation', 'old'); } catch (_) {} });
    page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(`console : ${m.text()}`); });
    await page.route(u => !u.toString().startsWith(base), rt => rt.abort());
    await page.goto(base, {waitUntil: 'load'}); await page.waitForTimeout(1200);

    const ALL = 'apparence-tous-les-reglages';
    const frame = id => page.locator(`.ui-presets[data-ui-presets="${id}"]`);
    async function openFrame(id) {
        await page.evaluate(async () => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'design'; await A.setModule('maintenance'); });
        const f = frame(id); await f.waitFor();
        if (!/is-open/.test(await f.getAttribute('class'))) await f.locator('[data-ps-toggle]').click();
        return f;
    }
    const rowOf = (f, name) => f.locator('li[data-i]', {has: page.locator('.ui-presets-name b', {hasText: new RegExp(`^${name}$`)})});
    async function saveAs(name) {
        const f = await openFrame(ALL);
        await f.locator('[data-ps-new]').click(); await f.locator('[data-ps-name]').fill(name); await f.locator('[data-ps-ok]').click();
        await f.locator('.ui-presets-name b', {hasText: name}).first().waitFor();
    }
    async function applyRow(name) {
        const f = await openFrame(ALL);
        await rowOf(f, name).locator('[data-ps-apply]').click();
        await Promise.all([page.waitForNavigation({waitUntil: 'load', timeout: 15000}), page.locator('dialog.confirm-box-dialog[open] button', {hasText: 'Appliquer'}).click()]);
        await page.waitForTimeout(1500);
    }
    async function menu(name, label) {
        const f = await openFrame(ALL);
        await rowOf(f, name).locator('[data-ps-more]').click();
        return page.locator('.ui-actmenu-i', {hasText: label}).first();
    }

    // ~20 réglages de toutes sortes (valeurs brutes : le registre les garde telles quelles)
    const MINE = {
        'lcnda-side-order': JSON.stringify({listes: {order: ['media', 'persons'], hidden: ['sources']}}), // ↕ Réordonner (ancien nom → genealogie-side-order)
        'genealogie-list-order': JSON.stringify(['places', 'persons']), 'genealogie-list-hidden': JSON.stringify(['sources']), // ordre et groupe caché des listes
        'lcnda-tresors-groups': JSON.stringify({groups: [{id: 'g1', name: 'Mes jeux', items: ['bougie']}], hidden: ['lettres']}), // dossiers de la colonne des Trésors
        'genealogie-list-columns': JSON.stringify({persons: {cols: ['name', 'birth'], w: {name: 220}}}), // colonnes choisies et largeurs
        'lcnda-sort:listes:persons': 'za', 'lcnda-view:listes:persons': 'cards', // tri, affichage
        'genealogie-shortcuts': JSON.stringify({calculator: 'Alt+K'}), // un raccourci
        'genealogie-tx-aide-ia-place': 'droite', 'genealogie-tx-trouve-mode': 'ferme', 'genealogie-tx-comparer-image': '0', 'genealogie-tx-cmp-mode': 'mot', // Atelier
        'lcnda-cartes-couches': 'true', 'lcnda-map-frontieres': JSON.stringify({on: true, year: 1790}), 'lcnda-cadastre-layer': 'true', // cartes
        'genealogie-horloges': JSON.stringify([{tz: 'Europe/Paris'}, {tz: 'America/Montreal'}]), // horloges
        'genealogie-reglages-ouverts': JSON.stringify({design: false}), 'lcnda-sheet-sections-open': JSON.stringify({sources: false}), // sections repliées
        'genealogie-tresors-favs': JSON.stringify(['bougie']), 'genealogie-tx-car-favoris': JSON.stringify(['ꝑ', 'ꝓ']), // favoris
        'lcnda-side-panel-width': '430', 'lcnda-puzzle-prefs': JSON.stringify({count: 100, shape: 'square', rotate: true, model: false}),
        'lcnda-ld:hist_gares': JSON.stringify({q: 'tulle', crit: [], sort: 'name', dir: 'desc', view: 'table', hide: ['code'], gps: true}), // liste de données : colonne GPS, colonne cachée
    };
    // ce qui ne doit ni partir ni être effacé
    const PRIVATE = {'genealogie-artist-keys': JSON.stringify({discogs: 'JETON-SECRET-123'}), 'lcnda-langue': 'fr', 'genealogie-tx-draft-new': 'mon brouillon', 'lcnda-journal-erreurs': '[]', 'lcnda-mode-simple-device': JSON.stringify({start: false})};
    const lsAll = () => page.evaluate(ks => Object.fromEntries(ks.map(k => [k, localStorage.getItem(k)])), [...Object.keys(MINE), ...Object.keys(PRIVATE), 'genealogie-side-order', 'genealogie-dashboard-blocks', 'genealogie-design', 'lcnda-photomaps-shape']);
    const setLs = obj => page.evaluate(o => { for (const [k, v] of Object.entries(o)) { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } }, obj);
    const resetServer = keys => page.evaluate(async ks => {
        const csrf = window.INSTALL_CSRF || window.LCNDA_APP.state.csrf || '';
        await fetch('api.php?action=save_settings', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-CSRF-Token': csrf}, body: JSON.stringify({set: {}, remove: ks.filter(k => k.startsWith('genealogie-')), csrf})});
    }, keys);
    let saved = null, preset = null;
    try {
        await t('B. 20 réglages changés, un widget du tableau de bord et le thème, puis « 💾 Enregistrer » : tout est dans l’ensemble, rien de privé', async () => {
            await setLs({...MINE, ...PRIVATE});
            await page.evaluate(() => {
                localStorage.setItem('genealogie-design', JSON.stringify({...JSON.parse(localStorage.getItem('genealogie-design') || '{}'), preset: 'dark', blue: '#aa0000'}));
                localStorage.setItem('genealogie-dashboard-blocks', JSON.stringify({order: ['birthdays', 'stats'], hidden: ['news'], widgets: [{type: 'clock', id: 'w1'}]}));
            });
            await page.waitForTimeout(1500); // (la base reçoit les « genealogie-… »)
            saved = await lsAll();
            await saveAs('Tout de chez tout');
            preset = (await page.evaluate(() => JSON.parse(localStorage.getItem('genealogie-settings-profiles') || '[]'))).find(x => x.name === 'Tout de chez tout');
            assert.equal(preset.reg, 2, 'un ensemble fait avec le registre');
            for (const k of Object.keys(MINE)) if (!['lcnda-ld:hist_gares', 'genealogie-reglages-ouverts', 'lcnda-side-order'].includes(k)) assert.equal(preset.settings[k], MINE[k], `tel quel : ${k}`);
            assert.equal(JSON.parse(preset.settings['genealogie-reglages-ouverts']).design, false, 'les sections repliées');
            for (const k of [...Object.keys(MINE), 'genealogie-side-order', 'genealogie-dashboard-blocks', 'genealogie-design']) assert.ok(k in preset.settings, `gardé : ${k}`);
            for (const k of Object.keys(PRIVATE)) assert.ok(!(k in preset.settings), `pas gardé : ${k}`);
            assert.ok(!JSON.stringify(preset).includes('JETON-SECRET'), 'aucun jeton');
            assert.deepEqual(JSON.parse(preset.settings['lcnda-ld:hist_gares']), {crit: [], sort: 'name', dir: 'desc', view: 'table', hide: ['code'], gps: true}, 'la liste de données sans la recherche tapée');
            assert.deepEqual(JSON.parse(preset.settings['genealogie-side-order']), JSON.parse(MINE['lcnda-side-order']), 'Réordonner');
        });
        let before = null;
        await t('B. tout remis au départ (autres valeurs, un réglage en plus), puis « Appliquer » : tout revient, le reste est effacé, le privé ne bouge pas', async () => {
            const all = [...Object.keys(MINE), 'genealogie-side-order', 'genealogie-dashboard-blocks', 'genealogie-design'];
            await page.evaluate(ks => ks.forEach(k => localStorage.removeItem(k)), all); await resetServer(all);
            await setLs({'genealogie-list-hidden': JSON.stringify(['media']), 'lcnda-sort:listes:persons': 'az', 'lcnda-cartes-couches': 'false', 'lcnda-photomaps-shape': 'square',
                'lcnda-ld:hist_gares': JSON.stringify({q: 'brive', sort: 'code', gps: false}), 'genealogie-tx-aide-ia-place': 'dessous', 'genealogie-artist-keys': JSON.stringify({discogs: 'AUTRE-JETON'})});
            await page.waitForTimeout(1500); await page.reload({waitUntil: 'load'}); await page.waitForTimeout(1000);
            before = await lsAll();
            assert.equal(before['genealogie-side-order'], null); assert.equal(before['lcnda-sort:listes:persons'], 'az');
            await applyRow('Tout de chez tout');
            const s = await lsAll();
            for (const k of Object.keys(MINE)) if (k !== 'lcnda-ld:hist_gares') assert.equal(s[k], preset.settings[k], `revenu : ${k}`);
            for (const k of ['genealogie-side-order', 'genealogie-dashboard-blocks', 'genealogie-design']) assert.equal(s[k], preset.settings[k], `revenu : ${k}`);
            assert.deepEqual(JSON.parse(s['lcnda-ld:hist_gares']), {q: 'brive', crit: [], sort: 'name', dir: 'desc', view: 'table', hide: ['code'], gps: true}, 'colonne GPS et tri revenus, la recherche tapée d’ici reste');
            assert.equal(s['lcnda-photomaps-shape'], null, 'un réglage absent de l’ensemble revient au départ');
            assert.equal(s['genealogie-artist-keys'], JSON.stringify({discogs: 'AUTRE-JETON'}), 'le jeton d’ici ne bouge pas');
            assert.equal(s['lcnda-langue'], 'fr'); assert.equal(s['genealogie-tx-draft-new'], 'mon brouillon', 'le brouillon reste');
            assert.equal(JSON.parse(s['genealogie-design']).preset, 'dark', 'le thème');
            await page.reload({waitUntil: 'load'}); await page.waitForTimeout(1200);
            const s2 = await lsAll();
            for (const k of [...Object.keys(MINE), 'genealogie-side-order', 'genealogie-dashboard-blocks']) assert.equal(s2[k], s[k], `après rechargement (la base) : ${k}`);
        });
        await t('B. « ↶ Annuler » juste après : l’état d’avant revient (et le dit)', async () => {
            await page.reload({waitUntil: 'load'}); // (le message ne revient pas une deuxième fois)
            await page.waitForTimeout(1500);
            assert.equal(await page.locator('.toast', {hasText: 'appliqué'}).count(), 0, 'le « ↶ Annuler » n’est proposé qu’une fois');
            // de nouveau : appliquer, puis annuler tout de suite
            await page.evaluate(ks => ks.forEach(k => localStorage.removeItem(k)), [...Object.keys(MINE), 'genealogie-side-order']);
            await setLs({'genealogie-list-hidden': JSON.stringify(['media']), 'lcnda-sort:listes:persons': 'az', 'lcnda-photomaps-shape': 'square'});
            await page.waitForTimeout(1500);
            const f = await openFrame(ALL);
            const b = await lsAll(); // (après avoir ouvert le cadre : il retient lui-même qu'il est ouvert)
            await rowOf(f, 'Tout de chez tout').locator('[data-ps-apply]').click();
            await Promise.all([page.waitForNavigation({waitUntil: 'load', timeout: 15000}), page.locator('dialog.confirm-box-dialog[open] button', {hasText: 'Appliquer'}).click()]);
            const toast = page.locator('.toast', {hasText: 'Tout de chez tout'}).last(); await toast.waitFor({state: 'attached', timeout: 15000});
            await Promise.all([page.waitForNavigation({waitUntil: 'load', timeout: 15000}), toast.locator('button', {hasText: 'Annuler'}).click()]);
            await page.locator('.toast', {hasText: 'comme avant'}).last().waitFor({state: 'attached', timeout: 15000});
            await page.waitForTimeout(800);
            const s = await lsAll();
            for (const k of Object.keys(b)) if (!Object.keys(PRIVATE).includes(k)) assert.equal(s[k], b[k], `remis comme avant : ${k}`);
            assert.equal(s['lcnda-photomaps-shape'], 'square'); assert.equal(s['genealogie-side-order'], null);
        });
        await t('B. fichier : exporté (sans secret ni recherche tapée), importé, appliqué → tout revient', async () => {
            const file = path.join(tmpAll, 'tout.json');
            const item = await menu('Tout de chez tout', 'Exporter');
            const [dl] = await Promise.all([page.waitForEvent('download'), item.click()]);
            await dl.saveAs(file);
            const data = JSON.parse(fs.readFileSync(file, 'utf8'));
            assert.equal(data.type, 'lcnda-reglages'); assert.equal(data.reg, 2);
            for (const k of [...Object.keys(MINE), 'genealogie-side-order', 'genealogie-dashboard-blocks']) assert.ok(k in data.settings, `dans le fichier : ${k}`);
            assert.ok(!/JETON|brouillon|"q":"tulle"|lcnda-langue|artist-keys/.test(fs.readFileSync(file, 'utf8')), 'rien de privé dans le fichier');
            // ailleurs : la liste des ensembles vidée, tout remis au départ
            await page.evaluate(ks => { ks.forEach(k => localStorage.removeItem(k)); localStorage.setItem('genealogie-settings-profiles', '[]'); }, [...Object.keys(MINE), 'genealogie-side-order']);
            await page.waitForTimeout(1500); await page.reload({waitUntil: 'load'}); await page.waitForTimeout(1000);
            const f = await openFrame(ALL);
            await f.locator('[data-ps-import]').click();
            const dlg = page.locator('dialog.k-import[open]'); await dlg.waitFor();
            await dlg.locator('input[type=file]').setInputFiles(file);
            await dlg.locator('[data-k-go]:not([disabled])').waitFor(); await dlg.locator('[data-k-go]').click(); await page.waitForTimeout(800);
            const imported = (await page.evaluate(() => JSON.parse(localStorage.getItem('genealogie-settings-profiles') || '[]'))).find(x => x.name === 'Tout de chez tout');
            assert.ok(imported, 'importé'); assert.equal(imported.reg, 2);
            await applyRow('Tout de chez tout');
            const s = await lsAll();
            for (const k of Object.keys(MINE)) if (k !== 'lcnda-ld:hist_gares') assert.equal(s[k], preset.settings[k], `revenu par le fichier : ${k}`);
            assert.equal(JSON.parse(s['lcnda-ld:hist_gares']).gps, true);
            assert.equal(s['genealogie-side-order'], preset.settings['genealogie-side-order']);
        });
        await t('B. un ensemble d’avant le registre (sans « reg ») n’efface pas les « lcnda-… » qu’il ne connaissait pas', async () => {
            await page.evaluate(() => { const l = JSON.parse(localStorage.getItem('genealogie-settings-profiles') || '[]'); l.push({name: 'Ancien', saved: '2025-01-01T10:00:00Z', settings: {'genealogie-design': JSON.stringify({preset: 'soft'})}}); localStorage.setItem('genealogie-settings-profiles', JSON.stringify(l)); });
            await setLs({'lcnda-photomaps-shape': 'square'});
            await applyRow('Ancien');
            const s = await lsAll();
            assert.equal(s['lcnda-photomaps-shape'], 'square', 'un « lcnda-… » inconnu de l’ancien ensemble reste');
            assert.equal(s['lcnda-cartes-couches'], saved['lcnda-cartes-couches'], 'idem');
            assert.equal(s['genealogie-list-hidden'], null, 'un « genealogie-… » absent revient au départ, comme avant');
        });
        await t('aucune erreur JavaScript', () => { assert.deepEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        if (process.env.REGLAGES_KEEP) console.log('dossier gardé :', tmpAll); else try { fs.rmSync(tmpAll, {recursive: true, force: true}); } catch (_) {}
    }
    finish();
})();
