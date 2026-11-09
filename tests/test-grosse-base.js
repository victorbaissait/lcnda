'use strict';
/**
 * 🐘 Très grosse base : l'app reste-t-elle rapide ?                       node tests/test-grosse-base.js
 *
 * Fabrique une base réaliste (scripts/grosse-base.php : familles sur 13 générations, 3 à 5 événements par personne,
 * lieux, mariages, médias, sources, notes, étiquettes) dans un dossier temporaire — jamais dans la vraie base —,
 * lance l'app comme l'application de bureau (php -S, 4 processus, 1 Go de mémoire, 300 s au plus), puis mesure :
 *  1. le serveur : démarrage (bootstrap), liste et recherche des personnes (aussi phonétique), fiche, arbres
 *     (10 générations d'ascendants, descendants), statistiques (toutes), carte, Contrôle de la base (calcul puis cache),
 *     tableau de bord, listes, ⌘K, menu de choix, export GEDCOM, sauvegarde, puis import GEDCOM de toute la base ;
 *  2. le navigateur (Playwright ; sinon sauté) : démarrage, Personnes, recherche, fiche, arbres, statistiques, carte,
 *     Contrôle, tableau de bord avec tous les widgets, toutes les listes, ⌘K, menu de choix — sans erreur JavaScript.
 *
 * Par défaut : 20 000 personnes et des bornes larges (pour ne pas ralentir la suite des tests).
 * À la main, la vraie mesure :  GROSSE_BASE=100000 node tests/test-grosse-base.js
 *   GROSSE_RAPPORT=fichier.json  garde les mesures ; GROSSE_DOSSIER=dossier  garde la base (sinon effacée) ;
 *   GROSSE_APP=dossier  mesure une autre copie de l'app (comparaison avant / après) ; SHOTS=dossier  captures.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(process.env.GROSSE_APP || path.join(__dirname, '..'));
const phpPath = findPhp([devBundledPhp()]);
if (!phpPath) { console.log('— PHP absent : test sauté'); process.exit(0); }
const N = Math.max(1000, Number(process.env.GROSSE_BASE) || 20000);
const BIG = N >= 50000;
const SHOTS = process.env.SHOTS || '';
const keep = process.env.GROSSE_DOSSIER || '';
const tmp = keep || fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-grosse-'));
// bornes : « usuel » (un écran qu'on ouvre tout le temps) et « lourd » (statistiques, contrôle, export) ; larges pour 20 000
const LIMIT = BIG ? { usuel: 2500, lourd: 30000 } : { usuel: 3000, lourd: 20000 };
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4' });
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const phpArgs = ['-d', 'memory_limit=1024M', '-d', 'max_execution_time=300', '-d', 'max_input_time=-1', '-d', 'upload_max_filesize=2G', '-d', 'post_max_size=2G'];

const results = [];
let failed = 0;
const note = (part, name, ms, kind, extra = '') => {
    results.push({ part, name, ms: Math.round(ms), kind, extra });
    const lim = LIMIT[kind] || LIMIT.lourd;
    const flag = ms > lim ? '  ✗ TROP LENT' : '';
    console.log(`   ${part.padEnd(4)} ${name.padEnd(46)} ${String(Math.round(ms)).padStart(7)} ms${extra ? '  · ' + extra : ''}${flag}`);
    if (ms > lim) { failed++; }
};
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

function makeBase(dir) {
    const t0 = Date.now();
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-d', 'memory_limit=2048M', path.join(appRoot, 'scripts/grosse-base.php'), String(N), '1789'], { cwd: appRoot, env: envFor(dir), encoding: 'utf8', maxBuffer: 1 << 24 });
    if (r.status !== 0 || !/^ok/m.test(r.stdout)) { console.error(r.stderr || r.stdout); process.exit(1); }
    console.log(`   base fabriquée en ${((Date.now() - t0) / 1000).toFixed(1)} s : ${r.stdout.trim().replace(/^ok : /, '')}`);
}

async function startServer(dir) {
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), ...phpArgs, '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(dir), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 200; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let cookie = '';
    const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
    const csrf = JSON.parse((html.match(/window\.INSTALL_CSRF = ("[^"]*")/) || [])[1] || '""');
    const timed = async (action, q = {}, opt = {}) => {
        const t0 = performance.now();
        const r = await fetch(`${base}api.php?action=${action}&${new URLSearchParams(q)}`, { headers: { Cookie: cookie, ...(opt.headers || {}) }, method: opt.method || 'GET', body: opt.body });
        const buf = Buffer.from(await r.arrayBuffer());
        const ms = performance.now() - t0;
        let json = null; try { json = JSON.parse(buf.toString('utf8')); } catch (_) {}
        return { ms, status: r.status, size: buf.length, json, buf };
    };
    const post = (action, body) => timed(action, {}, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ ...body, csrf }) });
    return { proc, base, port, timed, post, csrf, cookie: () => cookie };
}
// une réponse en erreur est notée (le test échoue) sans arrêter les autres mesures
const ok200 = (r, what) => { if (r.status !== 200) { failed++; console.error(`   ✗ ${what} : statut ${r.status} ${r.buf.toString().slice(0, 200)}`); return false; } return true; };
/** Une valeur lue directement dans la base de test (le plus ancien couple qui a des enfants, pour l'arbre des descendants…). */
const sql1 = (dir, sql) => String(spawnSync(phpPath, ['-r', '$p=new PDO("sqlite:".$argv[1]);echo $p->query($argv[2])->fetchColumn();', path.join(dir, 'genealogy.sqlite'), sql], { encoding: 'utf8' }).stdout).trim();
const ko = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' Mo' : Math.round(n / 1024) + ' ko';

(async () => {
    console.log(`🐘 Grosse base : ${N.toLocaleString('fr-FR')} personnes (${appRoot === path.resolve(__dirname, '..') ? 'cette app' : appRoot})`);
    const dir = path.join(tmp, 'base');
    if (!fs.existsSync(path.join(dir, 'genealogy.sqlite'))) { makeBase(dir); }
    const S = await startServer(dir);
    let start = 0, founder = 0;
    try {
        /* ─── 1. le serveur ─── (GROSSE_PARTIE=ui : seulement le navigateur ; =api : seulement le serveur) */
        const PART = process.env.GROSSE_PARTIE || '';
        if (PART !== 'ui') await t('serveur : chaque écran répond, assez vite', async () => {
            let r = await S.timed('bootstrap');
            assert.equal(r.status, 200, r.buf.toString().slice(0, 300));
            start = r.json.startPersonId;
            note('API', 'démarrage (bootstrap)', r.ms, 'usuel', ko(r.size));
            if (r.size > 2e6) { failed++; console.error(`   ✗ bootstrap trop gros : ${ko(r.size)}`); }
            r = await S.timed('people', { limit: 180 }); note('API', 'liste des personnes', r.ms, 'usuel', `${r.json?.people?.length ?? 'erreur'} lignes`);
            r = await S.timed('people', { q: 'MARTIN', limit: 180 }); note('API', 'recherche « MARTIN »', r.ms, 'usuel', `${r.json?.people?.length ?? 'erreur'} lignes`);
            r = await S.timed('people', { q: 'Martain', limit: 180, phonetic: 1 }); note('API', 'recherche phonétique « Martain »', r.ms, 'usuel', `${r.json?.people?.length ?? 'erreur'} lignes`);
            assert.ok(r.json?.people?.length > 0, 'la recherche phonétique trouve des Martin');
            r = await S.timed('quick_search', { q: 'pierre mar' }); note('API', '⌘K recherche rapide', r.ms, 'usuel');
            r = await S.timed('picker_search', { kind: 'person', q: 'jean bor' }); note('API', 'menu de choix (personne)', r.ms, 'usuel');
            r = await S.timed('picker_search', { kind: 'place', q: 'saint-martin 19' }); note('API', 'menu de choix (lieu)', r.ms, 'usuel');
            r = await S.timed('person', { id: start }); note('API', 'fiche (personne de départ)', r.ms, 'usuel', ko(r.size));
            // le bandeau « ⚠️ N choses à vérifier » : la 1re fois (ou après une modification), tout le contrôle est refait ; ensuite il est gardé
            r = await S.timed('controle_person', { id: start }); note('API', 'fiche : bandeau du contrôle (1re fois)', r.ms, 'lourd');
            r = await S.timed('controle_person', { id: start }); note('API', 'fiche : bandeau du contrôle (ensuite)', r.ms, 'usuel');
            r = await S.timed('lineage', { id: start, asc: 10, desc: 0 }); note('API', 'arbre : 10 générations d’ascendants', r.ms, 'usuel', ko(r.size));
            founder = Number(sql1(dir, 'SELECT f.partner1_id FROM families f JOIN family_children fc ON fc.family_id=f.id WHERE f.partner1_id IS NOT NULL ORDER BY f.id LIMIT 1')) || 1;
            r = await S.timed('lineage', { id: founder, asc: 0, desc: 6 }); note('API', 'arbre : 6 générations de descendants', r.ms, 'usuel', ko(r.size));
            r = await S.timed('dashboard', { seed: 7 }); note('API', 'tableau de bord (1re fois)', r.ms, 'lourd', ko(r.size));
            ok200(r, 'tableau de bord');
            r = await S.timed('dashboard', { seed: 8 }); note('API', 'tableau de bord (ensuite)', r.ms, 'usuel', ko(r.size));
            r = await S.timed('controle', { fresh: 1 }); note('API', 'Contrôle de la base (calcul complet)', r.ms, 'lourd', `${(r.json?.alerts || []).length} alertes · ${ko(r.size)}`);
            ok200(r, 'Contrôle de la base');
            r = await S.timed('controle_summary'); note('API', 'Contrôle : résumé (gardé)', r.ms, 'usuel');
            r = await S.timed('controle'); note('API', 'Contrôle : page (gardé)', r.ms, 'usuel', ko(r.size));
            r = await S.timed('map', {}); note('API', 'carte', r.ms, 'usuel', ko(r.size));
            for (const type of ['persons', 'events', 'places', 'media', 'labels', 'occupations', 'sosa', 'daboville']) {
                r = await S.timed('list', { type, limit: 100, offset: 0 }); note('API', `liste « ${type} »`, r.ms, 'usuel', r.status === 200 ? ko(r.size) : 'erreur ' + r.status);
            }
        });
        if (PART !== 'ui') await t('serveur : toutes les statistiques', async () => {
            const types = ['surnames', 'firstnames', 'saint_names', 'firstnames_france', 'probate_wealth', 'heights', 'firstnames_by_generation', 'birth_places', 'marriage_places', 'death_places', 'birth_countries', 'death_countries', 'sex_distribution', 'age_at_death', 'genealogy_age_pyramid', 'death_age_by_generation', 'life_expectancy_generation_century', 'life_expectancy_lineage_generation_century', 'life_expectancy_century_branch', 'marriage_first_birth_age', 'sibling_birth_interval', 'infant_mortality_period', 'marital_patterns', 'death_causes', 'completeness', 'family_gravity_migration', 'farthest_from_origin', 'residence_duration', 'mobility_by_generation', 'birth_years', 'death_years', 'children_per_family', 'occupation_timeline', 'occupation_by_generation', 'occupation_branch_evolution', 'endogamy_index'];
            let total = 0, worst = ['', 0];
            for (const type of types) {
                const r = await S.timed('graph_stats', { type, sosa_root_id: start });
                ok200(r, `statistique ${type}`);
                total += r.ms; if (r.ms > worst[1]) { worst = [type, r.ms]; }
                if (r.ms > 1000) { note('API', `statistique « ${type} »`, r.ms, 'lourd'); }
            }
            note('API', `statistiques (${types.length}, la plus lente : ${worst[0]})`, worst[1], 'lourd', `${Math.round(total)} ms en tout`);
        });
        if (PART !== 'ui') await t('serveur : export GEDCOM, sauvegarde, import GEDCOM de toute la base', async () => {
            let r = await S.timed('export_gedcom', { gedcom_version: '5.5.1' });
            if (!ok200(r, 'export GEDCOM')) { note('API', 'export GEDCOM', r.ms, 'lourd', 'ERREUR ' + r.status); return; }
            const ged = r.buf;
            note('API', 'export GEDCOM', r.ms, 'lourd', ko(ged.length));
            r = await S.timed('export_sqlite'); note('API', 'export de la base (SQLite)', r.ms, 'lourd', ko(r.size));
            r = await S.post('backup_sqlite', { mode: 'manual' }); note('API', 'sauvegarde', r.ms, 'lourd', r.status === 200 ? '' : 'statut ' + r.status);
            // import dans une base vide (comme l'écran d'installation)
            const dir2 = path.join(tmp, 'import-' + Date.now()); fs.mkdirSync(path.join(dir2, 'media'), { recursive: true });
            const I = await startServer(dir2);
            try {
                const fd = new FormData();
                fd.append('file', new Blob([ged]), 'grosse.ged'); fd.append('csrf', I.csrf);
                const t0 = performance.now();
                const res = await fetch(I.base + 'api.php?action=import_package', { method: 'POST', headers: { Cookie: I.cookie(), 'X-CSRF-Token': I.csrf }, body: fd });
                const j = await res.json().catch(() => ({}));
                note('API', `import GEDCOM (${N.toLocaleString('fr-FR')} personnes)`, performance.now() - t0, 'lourd', res.ok ? '' : 'erreur ' + (j.error || res.status));
                assert.ok(res.ok && !j.error, j.error || String(res.status));
                const b = await I.timed('bootstrap');
                assert.equal(b.json.stats['personnes'], N, 'toutes les personnes sont entrées');
            } finally { I.proc.kill(); fs.rmSync(dir2, { recursive: true, force: true }); }
        });

        if (PART === 'api') return;
        start ||= Number(sql1(dir, 'SELECT id FROM persons ORDER BY is_start DESC, id LIMIT 1'));
        founder ||= Number(sql1(dir, 'SELECT f.partner1_id FROM families f JOIN family_children fc ON fc.family_id=f.id WHERE f.partner1_id IS NOT NULL ORDER BY f.id LIMIT 1')) || 1;
        /* ─── 2. le navigateur ─── */
        let pw = null;
        for (const m of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(m); break; } catch (_) {} }
        if (!pw) { console.log('— navigateur : Playwright absent, partie sautée'); return; }
        const browser = await pw.chromium.launch();
        try {
            await t('navigateur : les écrans s’affichent vite, sans erreur', async () => {
                const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
                const p = await ctx.newPage();
                const errors = [];
                p.on('pageerror', e => errors.push(e.message));
                p.on('console', m => { if (m.type() === 'error' && !/net::|Failed to load resource|ERR_/.test(m.text())) errors.push(m.text().slice(0, 200)); });
                await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
                // requêtes de l'écran mesuré (pas les petites vérifications régulières qui tournent en fond)
                const POLL = /^(scan_inbox_status|offsite_status|kiosk_state|vault_status|due_reminders|my_lists|parish_map|insee_stats|saved_searches|save_settings|genealogies|suivi|tresors|tresor_tree|meteo_today|help_requests|genea_calendar|my_agenda|cited_names|field_trips|heritage_overview|pets|research_suggestions|research_gaps|saint_of_day)$/;
                let last = performance.now(); const slow = []; const pending = new Map();
                const act = r => { try { return new URL(r.url()).searchParams.get('action') || ''; } catch (_) { return ''; } };
                // save_settings part avec « keepalive » : le navigateur ne dit jamais quand il finit
                const mine = r => /api\.php/.test(r.url()) && act(r) !== 'save_settings' && !(POLL.test(act(r)) && !p._wantPoll);
                p.on('request', r => { if (mine(r)) { pending.set(r, performance.now()); } });
                const done = r => { if (pending.delete(r)) { last = performance.now(); const tm = r.timing(); if (tm.responseEnd > 0) { slow.push([act(r), Math.round(tm.responseEnd)]); } } };
                p.on('requestfinished', done); p.on('requestfailed', done);
                const inflightSince = t0 => [...pending.values()].filter(x => x >= t0 - 50).length;
                // attend que l'écran soit posé : plus de « Préparation… », plus de squelette, plus de requête depuis 400 ms
                const settle = async (t0, max = 120000) => {
                    const end = performance.now() + max;
                    let idleSince = 0;
                    for (;;) {
                        const busy = await p.evaluate(() => !!document.querySelector('#workspace .loading-screen, #workspace .is-skeleton, #workspace .wait-spinner, dialog[open] .wait-spinner')).catch(() => true);
                        const now = performance.now();
                        if (!busy && inflightSince(t0) === 0) { idleSince ||= now; if (now - Math.max(idleSince, last) > 400) { return Math.max(0, Math.max(idleSince, last) - t0); } } else { idleSince = 0; }
                        if (now > end) { return now - t0; }
                        await p.waitForTimeout(30);
                    }
                };
                const step = async (name, kind, fn, shot) => {
                    slow.length = 0; p._wantPoll = /tableau de bord|démarrage|liste/.test(name); // les widgets du tableau de bord et les données d'une liste comptent
                    const t0 = performance.now(); await fn(); const ms = await settle(t0);
                    const dom = await p.evaluate(() => document.querySelectorAll('#workspace *').length).catch(() => 0);
                    const worst = slow.sort((a, b) => b[1] - a[1])[0];
                    note('UI', name, ms, kind, `DOM ${dom}${worst ? ` · ${worst[0]} ${worst[1]} ms` : ''}`);
                    if (SHOTS && shot) { await p.screenshot({ path: path.join(SHOTS, `grosse-${shot}.png`) }); }
                };
                let started = true;
                // au départ, le tableau de bord montre tous ses widgets (une centaine) : un écran lourd
                await step('démarrage de l’app (tableau de bord)', 'lourd', async () => {
                    await p.goto(S.base, { timeout: 120000 });
                    started = await p.waitForFunction(() => window.LCNDA_APP?.state?.hasRendered, null, { timeout: 120000 }).then(() => true, () => false);
                }, 'demarrage');
                if (!started) { // l'écran d'accueil n'a pas pu s'afficher : noté, puis on mesure le reste depuis « Personnes »
                    failed++; console.error('   ✗ l’app ne s’affiche pas (écran d’accueil en erreur)');
                    await p.goto(S.base + '#personnes', { timeout: 120000 }); await p.reload();
                    await p.waitForFunction(() => window.LCNDA_APP?.state?.bootstrap && window.LCNDA_APP.state.hasRendered, null, { timeout: 120000 });
                }
                const go = (m, prep = '') => p.evaluate(([m, prep]) => { const A = window.LCNDA_APP, st = A.state; if (prep) { Object.assign(st, JSON.parse(prep)); } return A.setModule(m); }, [m, prep]);
                await step('Personnes (liste)', 'usuel', () => go('personnes'), 'personnes');
                await step('recherche « MARTIN »', 'usuel', async () => { await p.fill('#person-search', 'MARTIN'); await p.press('#person-search', 'Enter'); });
                await step('recherche phonétique « Martain »', 'usuel', async () => { await p.fill('#person-search', 'Martain'); await p.check('#person-phonetic').catch(() => p.evaluate(() => { const c = document.querySelector('#person-phonetic'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); })); });
                await p.evaluate(() => { const A = window.LCNDA_APP; A.state.peopleQuery = ''; A.state.peoplePhonetic = false; A.persistUiState(); });
                await step('fiche d’une personne (toutes les sections)', 'usuel', () => p.evaluate(id => window.LCNDA_APP.openPersonById(id), start), 'fiche');
                await step('arbre : 10 générations d’ascendants', 'usuel', () => go('graphiques', JSON.stringify({ graphMode: 'ancestors', graphDepth: 10, currentPersonId: start })), 'ascendants');
                await step('arbre : descendants', 'usuel', () => go('graphiques', JSON.stringify({ graphMode: 'descendants', graphDepth: 6, currentPersonId: founder })), 'descendants');
                await step('arbre : éventail', 'usuel', () => go('graphiques', JSON.stringify({ graphMode: 'fan', graphDepth: 8, currentPersonId: start })), 'eventail');
                for (const type of ['surnames', 'birth_places', 'age_at_death', 'life_expectancy_lineage_generation_century', 'occupation_branch_evolution', 'endogamy_index']) {
                    await step(`statistique « ${type} »`, 'lourd', () => go('graphiques', JSON.stringify({ graphMode: 'stats', graphStatsType: type, currentPersonId: start })), type === 'surnames' ? 'stats' : '');
                }
                await step('Carte', 'usuel', () => go('carte'), 'carte');
                await step('Contrôle de la base', 'usuel', () => go('maintenance', JSON.stringify({ maintenanceTab: 'controle' })), 'controle');
                await step('tableau de bord (widgets de départ)', 'lourd', () => go('dashboard'), 'tableau-de-bord');
                await p.evaluate(() => {
                    const A = window.LCNDA_APP; const { pages } = A.dashboardPages();
                    const all = { id: 'pg_tous', name: 'Tous', widgets: A.defaultDashboardBlocks.map(([type]) => A.dashboardNewWidget(type)).filter(Boolean) };
                    A.saveDashboardPages([...pages.filter(x => x.id !== 'pg_tous'), all], 'pg_tous'); A.state.dashboardPage = 'pg_tous';
                });
                const nW = await p.evaluate(() => window.LCNDA_APP.defaultDashboardBlocks.length);
                await step(`tableau de bord avec tous les widgets (${nW})`, 'lourd', () => go('dashboard'), 'tableau-de-bord-tous');
                // toutes les listes pour la vraie mesure ; les principales (et les plus lourdes) dans la suite des tests
                const MAIN = ['persons', 'events', 'places', 'media', 'labels', 'occupations', 'sosa', 'genea_calendar', 'courriers', 'villages', 'tr_stamps', 'gazettes'];
                const lists = (await p.evaluate(() => window.LCNDA_APP.defaultListTypes.map(x => x[0]))).filter(x => BIG || MAIN.includes(x));
                for (const type of lists) { await step(`liste « ${type} »`, 'usuel', () => go('listes', JSON.stringify({ listType: type })), type === 'persons' ? 'liste-personnes' : ''); }
                await step('⌘K recherche rapide « pierre mar »', 'usuel', async () => {
                    await p.keyboard.press('Control+k'); await p.waitForTimeout(100); await p.keyboard.type('pierre mar');
                }, 'cmdk');
                await p.keyboard.press('Escape');
                await step('menu de choix d’une personne « jean bor »', 'usuel', async () => {
                    p.evaluate(() => window.LCNDA_APP.picker.openPicker({ kind: 'person' })).catch(() => {});
                    await p.waitForSelector('dialog[open] input:not([type=hidden])', { timeout: 10000 }); await p.keyboard.type('jean bor');
                }, 'picker');
                await p.keyboard.press('Escape');
                assert.deepEqual(errors, [], 'aucune erreur JavaScript');
                await ctx.close();
            });
        } finally { await browser.close(); }
    } finally {
        S.proc.kill();
        if (process.env.GROSSE_RAPPORT) { fs.writeFileSync(process.env.GROSSE_RAPPORT, JSON.stringify({ N, results }, null, 1)); }
        if (!keep) { fs.rmSync(tmp, { recursive: true, force: true }); }
    }
    if (failed) { console.error(`\n${failed} problème(s).`); process.exit(1); }
    console.log('\nTout est bon.');
})().catch(e => { console.error(e); process.exit(1); });
