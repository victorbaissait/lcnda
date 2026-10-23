'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🗓 Journal des recherches (lib/research_journal.php, assets/js/heritage-journal.js) :   node tests/test-journal-recherches.js
 *  1. un vrai « php -S » sur une base neuve : résultat simple d'un dépouillement (Trouvé / Rien trouvé / En partie ; valeur forgée
 *     refusée ; gardé quand une page ré-enregistre sans lui), personnes cherchées (à part des relevées, ids forgés écartés),
 *     « ✓ Fait le … » d'une visite (date forgée refusée), résultat et note de chaque cote, « ＋ Créer le dépouillement » d'une cote,
 *     « Déjà dans ton suivi » (même cote écrite autrement, autre service, même service + commune + type + années qui se recoupent),
 *     journal complet et filtré sur une personne (dépouillement cherché / relevé, visite, piste d'enquête, battue, demande),
 *     menu de choix « dépouillement », suppression, jeton CSRF ;
 *  2. le navigateur (Playwright ; sinon sauté) à 1440 px, 390 px et en sombre : Recherche → 🗓 Journal des recherches et
 *     Listes → Journal des recherches (barre H10, filtres, Liste | Fiches, ⤓ CSV avec cellules protégées), formulaire du
 *     dépouillement (Résultat, Personnes cherchées, ⚠️ Déjà dans ton suivi), visite « ✓ Fait le… » puis résultat d'une cote,
 *     bloc de fiche « 🔍 Déjà cherché » ; aucune erreur JavaScript, pas de défilement horizontal.
 * Captures : SHOTS=dossier node tests/test-journal-recherches.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
if (!phpPath) { console.log('— PHP absent : test sauté'); process.exit(0); }
const SHOTS = process.env.SHOTS || '';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-journal-'));
const dir = path.join(tmp, 'data');
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

// la base : 3 personnes, une enquête avec une piste explorée, une battue avec une commune cherchée
{ const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Jean','Martin','male'),('Marie','Borie','female'),('Paul','Autre','male')");
$p = null; require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO investigations(person_id,title,status) VALUES(2,'Le mariage de Marie',  'open')");
$pdo->exec("INSERT INTO investigation_items(investigation_id,kind,title,status) VALUES(1,'lead','Registre de Brive vu','explored'),(1,'lead','À regarder plus tard','to_explore')");
$pdo->exec("INSERT INTO commune_contours(insee_code,name,geometry_json) VALUES('19272','Tulle','{}')");
$pdo->exec("INSERT INTO battues(title,target_type,start_insee_code) VALUES('Naissance de Paul','naissance','19272')");
$pdo->exec("INSERT INTO battue_persons(battue_id,person_id,role) VALUES(1,3,'primary')");
$pdo->exec("INSERT INTO battue_search_items(battue_id,insee_code,record_type,period,status) VALUES(1,'19272','naissance','1850-1860','not_found'),(1,'19272','deces','1900','todo')");
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
  if (r.status !== 0 || !String(r.stdout).includes('ok')) { console.error(r.stderr || r.stdout); process.exit(1); } }

let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

(async () => {
    const port = Number(process.env.JOURNAL_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let cookie = '';
    const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
    const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
    const get = async (action, q = {}) => { const r = await fetch(`${base}api.php?action=${action}&${new URLSearchParams(q)}`, { headers: { Cookie: cookie } }); return r.json(); };
    const post = async (action, body, token = csrf) => { const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: JSON.stringify({ ...body, csrf: token }) }); const j = await r.json().catch(() => ({})); return { status: r.status, body: j, id: j.result?.id }; };
    const ids = {};
    try {
        await t('dépouillement : résultat simple et personnes cherchées (à part des relevées), valeurs forgées écartées', async () => {
            const a = await post('save_archive_digest', { city_name: 'Tulle', archive_service: 'AD 19', archive_reference: '3 E 12/4', year_text: '1823-1832', record_type: 'naissance', status: 'done', result: 'none', sought_ids: '1,2,9999,abc', searched: 'Naissance de Jean' });
            assert.equal(a.status, 200); ids.d1 = a.id;
            const row = (await get('archive_digest_search', { id: ids.d1 })).rows[0];
            assert.equal(row.result, 'none');
            assert.deepEqual(row.sought.map(p => p.id), [1, 2]);
            assert.equal(row.sought[0].title, 'Jean MARTIN');
            assert.equal(row.people.length, 0, 'les personnes cherchées ne sont pas des personnes relevées');
            const b = await post('save_archive_digest', { city_name: 'Brive', archive_service: 'AD 19', archive_reference: '2 E 1', year_text: '1890', record_type: 'mariage', result: '<b>x</b>', searched: '=SOMME(A1)' });
            ids.d2 = b.id;
            assert.equal((await get('archive_digest_search', { id: ids.d2 })).rows[0].result, '', 'résultat inconnu refusé');
            const c = await post('save_archive_digest', { id: ids.d2, city_name: 'Brive', archive_service: 'AD 19', archive_reference: '2 E 1', year_text: '1890', record_type: 'mariage', result: 'not_consulted', searched: '=SOMME(A1)' });
            assert.equal(c.status, 200);
            assert.equal((await get('archive_digest_search', { id: ids.d2 })).rows[0].result, '', '« Pas consulté » ne vaut que pour une cote de visite');
        });
        await t('une page qui ré-enregistre sans « résultat » ni « personnes cherchées » les garde', async () => {
            await post('save_archive_digest', { id: ids.d1, city_name: 'Tulle', archive_service: 'AD 19', archive_reference: '3 E 12/4', year_text: '1823-1832', record_type: 'naissance', status: 'done', pages_json: '[]' });
            const row = (await get('archive_digest_search', { id: ids.d1 })).rows[0];
            assert.equal(row.result, 'none'); assert.deepEqual(row.sought.map(p => p.id), [1, 2]);
            // une personne relevée (avec sa fiche) : Paul
            const r = await post('save_archive_digest_person', { archive_digest_id: ids.d2, person_mode: 'existing', person_id: 3, first_name: 'Paul', last_name: 'Autre' });
            assert.equal(r.status, 200);
        });
        await t('visite : « ✓ Fait le … » (date forgée refusée), résultat et note de chaque cote, « ＋ Créer le dépouillement »', async () => {
            ids.v1 = (await post('save_archive_visit_plan', { archive_center: 'AD 19', title: 'Visite AD Corrèze', visit_date: '2025-03-12' })).id;
            ids.v2 = (await post('save_archive_visit_plan', { archive_center: 'AD 87', title: 'Visite à venir', visit_date: '2030-01-01' })).id;
            ids.i1 = (await post('save_archive_visit_item', { visit_id: ids.v1, archive_reference: '4 E 7', archive_service: 'AD 19', title: 'Mariages Brive', place_label: 'Brive' })).id;
            ids.i2 = (await post('save_archive_visit_item', { visit_id: ids.v1, archive_reference: '3E12-4', archive_service: 'AD 19', title: 'Naissances Tulle', archive_digest_id: ids.d1 })).id;
            ids.i3 = (await post('save_archive_visit_item', { visit_id: ids.v2, archive_reference: '9 Z 9', archive_service: 'AD 87' })).id;
            for (const bad of ['12/03/2025', '2025-02-30', "2025-03-12' OR 1"]) assert.equal((await post('save_archive_visit_done', { visit_id: ids.v1, done_at: bad })).status, 422, bad);
            assert.equal((await post('save_archive_visit_done', { visit_id: 9999, done_at: '2025-03-12' })).status, 422);
            assert.equal((await post('save_archive_visit_done', { visit_id: ids.v1, done_at: '2025-03-12' })).status, 200);
            const it = (await get('archive_visit_plans')).plans.find(p => p.id === ids.v1).items.find(i => i.id === ids.i1);
            assert.equal((await post('save_archive_visit_item', { ...it, result: 'found', result_note: 'Acte n° 12, vue 34' })).status, 200);
            await post('save_archive_visit_item', { ...it, result: 'pas-un-resultat' });
            let plan = (await get('archive_visit_plans')).plans.find(p => p.id === ids.v1);
            assert.equal(plan.done_at, '2025-03-12');
            assert.equal(plan.items.find(i => i.id === ids.i1).result, '', 'résultat forgé → pas noté');
            await post('save_archive_visit_item', { ...it, result: 'found', result_note: 'Acte n° 12, vue 34' });
            // le simple « coché » (sans résultat envoyé) ne l'efface pas
            await post('save_archive_visit_item', { id: ids.i1, visit_id: ids.v1, archive_reference: '4 E 7', archive_service: 'AD 19', title: 'Mariages Brive', place_label: 'Brive', checked: 1 });
            plan = (await get('archive_visit_plans')).plans.find(p => p.id === ids.v1);
            assert.equal(plan.items.find(i => i.id === ids.i1).result, 'found'); assert.equal(plan.items.find(i => i.id === ids.i1).result_note, 'Acte n° 12, vue 34');
            const mk = await post('archive_visit_item_make_digest', { id: ids.i1 });
            assert.equal(mk.status, 200); ids.d3 = mk.id;
            const d3 = (await get('archive_digest_search', { id: ids.d3 })).rows[0];
            assert.equal(d3.archive_reference, '4 E 7'); assert.equal(d3.result, 'found'); assert.equal(d3.found, 'Acte n° 12, vue 34'); assert.equal(d3.city_name, 'Brive');
            assert.equal((await post('archive_visit_item_make_digest', { id: ids.i1 })).body.result.existing, true, 'pas deux fois');
        });
        await t('« Déjà dans ton suivi » : même cote écrite autrement, pas un autre service ; même service + commune + type + années qui se recoupent', async () => {
            let m = (await get('research_already', { reference: '3e12 4', service: 'ad 19' })).matches;
            assert.ok(m.some(x => x.kind === 'digest' && x.id === ids.d1 && x.result_label === 'Rien trouvé'), JSON.stringify(m));
            assert.ok(m.some(x => x.kind === 'visit' && x.id === ids.i2), 'la cote de la visite faite');
            assert.equal((await get('research_already', { reference: '3 E 12/4', service: 'AD 87' })).matches.length, 0, 'autre service : pas la même cote');
            m = (await get('research_already', { service: 'AD 19', city: 'Tulle', record_type: 'naissance', year_text: 'vers 1830' })).matches;
            assert.ok(m.some(x => x.id === ids.d1 && x.why === 'same'));
            assert.equal((await get('research_already', { service: 'AD 19', city: 'Tulle', record_type: 'naissance', year_text: '1900-1910' })).matches.length, 0, 'années qui ne se recoupent pas');
            assert.equal((await get('research_already', { service: 'AD 19', city: 'Tulle', record_type: 'deces', year_text: '1830' })).matches.length, 0, 'autre type d’acte');
            m = (await get('research_already', { reference: '3 E 12/4', service: 'AD 19', exclude_kind: 'digest', exclude_id: ids.d1 })).matches;
            assert.ok(!m.some(x => x.kind === 'digest' && x.id === ids.d1), 'le dépouillement en cours de modification n’est pas un doublon de lui-même');
            assert.ok(!(await get('research_already', { reference: '3E124', linked_digest: ids.d1 })).matches.some(x => x.kind === 'digest' && x.id === ids.d1));
            assert.equal((await get('research_already', { reference: '9 Z 9' })).matches.length, 0, 'une cote d’une visite pas encore faite n’est pas « déjà cherchée »');
            assert.equal((await get('research_already', {})).matches.length, 0);
        });
        await t('demande liée : dans le journal et sur la fiche des personnes du dépouillement', async () => {
            ids.r1 = (await post('save_archive_digest_request', { title: 'Copie de l’acte', archive_service: 'AD 19', archive_reference: '3 E 12/4', archive_digest_id: ids.d1, request_type: 'order', status: 'received' })).id;
            assert.ok(ids.r1);
        });
        await t('journal : toutes les sortes, du plus récent au plus ancien ; filtré sur une personne', async () => {
            const j = await get('research_journal');
            const kinds = new Set(j.rows.map(r => r.kind));
            for (const k of ['digest', 'visit', 'lead', 'battue', 'request']) assert.ok(kinds.has(k), k);
            assert.ok(!j.rows.some(r => r.kind === 'visit' && r.id === ids.i3), 'visite pas faite : pas dans le journal');
            assert.ok(!j.rows.some(r => r.kind === 'lead' && r.title === 'À regarder plus tard'), 'piste « à explorer » : pas encore cherchée');
            assert.ok(!j.rows.some(r => r.kind === 'battue' && r.years === '1900'), 'commune « à chercher » d’une battue : pas encore cherchée');
            const dates = j.rows.map(r => r.date); assert.deepEqual(dates, [...dates].sort().reverse());
            const visit = j.rows.find(r => r.kind === 'visit' && r.id === ids.i1);
            assert.equal(visit.date, '2025-03-12'); assert.equal(visit.result, 'found'); assert.equal(visit.note, 'Acte n° 12, vue 34');
            assert.equal(j.rows.find(r => r.kind === 'battue').result, 'none');
            const jean = (await get('research_journal', { person_id: 1 })).rows.map(r => `${r.kind}:${r.id}`);
            assert.ok(jean.includes(`digest:${ids.d1}`) && jean.includes(`request:${ids.r1}`) && jean.includes(`visit:${ids.i2}`), jean.join(' '));
            assert.ok(!jean.includes(`digest:${ids.d2}`));
            const marie = (await get('research_journal', { person_id: 2 })).rows.map(r => r.kind);
            assert.ok(marie.includes('lead') && marie.includes('digest'), marie.join(' '));
            const paul = (await get('research_journal', { person_id: 3 })).rows;
            assert.ok(paul.some(r => r.kind === 'battue') && paul.some(r => r.kind === 'digest' && r.id === ids.d2 && r.people.find(p => p.id === 3).role === 'found'), 'Paul : relevé dans un registre, cherché par une battue');
        });
        await t('menu de choix : la sorte « dépouillement » (cote, commune, résultat)', async () => {
            const g = (await get('picker_search', { kind: 'digest', q: 'tulle' })).groups[0];
            assert.equal(g.kind, 'digest'); assert.ok(g.items.some(i => i.id === ids.d1 && i.badge === 'Rien trouvé'));
            const byCote = (await get('picker_search', { kind: 'digest', q: '4 E 7' })).groups[0].items;
            assert.ok(byCote.some(i => i.id === ids.d3));
        });
        await t('sécurité : sans jeton CSRF, rien n’est écrit ; suppression d’un dépouillement : ses personnes cherchées partent aussi', async () => {
            const r = await post('save_archive_visit_done', { visit_id: ids.v1, done_at: '' }, 'mauvais');
            assert.equal(r.status, 419);
            assert.equal((await get('archive_visit_plans')).plans.find(p => p.id === ids.v1).done_at, '2025-03-12');
            const tmpD = (await post('save_archive_digest', { city_name: 'Ussel', record_type: 'autre', sought_ids: [1] })).id;
            assert.equal((await post('delete_archive_digest', { id: tmpD })).status, 200);
            assert.ok(!(await get('research_journal', { person_id: 1 })).rows.some(r => r.kind === 'digest' && r.id === tmpD));
        });

        /* ─── le navigateur ─── */
        let pw = null;
        for (const m of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(m); break; } catch (_) {} }
        if (!pw) { console.log('— navigateur : Playwright absent, partie sautée'); return; }
        const browser = await pw.chromium.launch();
        const errors = [];
        const watch = (p, name) => {
            p.on('pageerror', e => errors.push(`${name} : ${e.message}`));
            p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(`${name} : ${m.text()}`); });
            p.on('dialog', d => { errors.push(`${name} : dialogue natif ${d.message()}`); d.dismiss(); });
        };
        const shot = async (p, name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, name), fullPage: true }); };
        const boot = async p => { await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state && window.LCNDA_EXT?.researchJournal && window.LCNDA_UI?.listBar, null, { timeout: 20000 }); };
        const journal = async (p, where) => {
            await p.evaluate(w => { const A = window.LCNDA_APP; if (w === 'recherche') { A.state.researchKind = 'journal'; A.setModule('recherche'); } else { A.state.listType = 'research_journal'; A.setModule('listes'); } }, where);
            await p.waitForSelector('.h-rj .ui-listbar', { timeout: 10000 }); await p.waitForSelector('.h-rj .ui-rows, .h-rj .ui-cards', { timeout: 10000 });
        };
        try {
            for (const [name, vp, dark] of [['1440', { width: 1440, height: 900 }, false], ['390', { width: 390, height: 844 }, false], ['sombre', { width: 1440, height: 900 }, true]]) {
                const ctx = await browser.newContext({ viewport: vp, colorScheme: dark ? 'dark' : 'light', acceptDownloads: true });
await ctx.addInitScript(() => { try { localStorage.setItem('lcnda-sheet-sections-open', JSON.stringify({human: {s_ident: false, s_family: false, s_life: false, s_docs: false}})); } catch (_) {} }); // 🗂 sur téléphone les sections de la fiche sont repliées sauf la première (validé) : ici, toutes ouvertes
                const p = await ctx.newPage(); watch(p, name);
                await boot(p);
                if (dark) { await p.evaluate(() => { const A = window.LCNDA_APP; localStorage.setItem('genealogie-design', JSON.stringify({...A.readDesignSettings(), preset: 'dark'})); A.applyDesign(); }); assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), 'dark'); }
                await t(`${name} : Recherche → 🗓 Journal des recherches (option à côté de « Dépouillement d’archive »), barre H10, chercher`, async () => {
                    await journal(p, 'recherche');
                    const opts = await p.$$eval('#research-form select[name=search_kind] option', os => os.map(o => o.value));
                    assert.equal(opts[opts.indexOf('archive_digest') + 1], 'journal');
                    assert.ok(await p.$('.h-rj .ui-listbar .ui-listbar-fbtn'));
                    const n = await p.$$eval('.h-rj .ui-row', r => r.length);
                    assert.ok(n >= 6, `lignes : ${n}`);
                    await p.fill('.h-rj .ui-listbar input', '4 E 7'); await p.waitForTimeout(500);
                    const names = await p.$$eval('.h-rj .ui-row-name', r => r.map(x => x.textContent));
                    assert.ok(names.length >= 1 && names.length < n, names.join(' | '));
                    assert.ok(await p.$('.h-rj .ui-row .ui-badge.is-green'), 'pastille verte « Trouvé »');
                    await p.fill('.h-rj .ui-listbar input', ''); await p.waitForTimeout(400);
                    await shot(p, `journal-recherche-${name}.png`);
                    const sw = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert.ok(sw <= 0, `défilement horizontal : ${sw}`);
                });
                if (name === '1440') {
                    await t('Listes → Archives et sources → Journal des recherches ; filtre « Rien trouvé » ; Fiches ; ⤓ CSV protégé', async () => {
                        await journal(p, 'listes');
                        assert.ok(await p.$('#sidebar-content [data-side-value="research_journal"]'), 'dans la colonne des listes');
                        await p.click('.h-rj .ui-listbar-fbtn'); await p.click('.ui-listbar-menu input[data-lb-f="result"][value="none"]'); await p.click('.ui-listbar-menu [data-lb-done]');
                        await p.waitForTimeout(300);
                        const badges = await p.$$eval('.h-rj .ui-row .ui-badge', b => b.map(x => x.textContent.trim().toLowerCase()));
                        assert.ok(badges.length && badges.every(b => b === 'rien trouvé'), badges.join(','));
                        assert.ok(await p.$('.ui-listbar-active:not([hidden])'), 'pastille du filtre actif');
                        await p.click('.h-rj .ui-viewtoggle button[data-view="cards"]'); await p.waitForSelector('.h-rj .ui-cards .ui-card');
                        await shot(p, 'journal-listes-fiches.png');
                        const [dl] = await Promise.all([p.waitForEvent('download'), p.click('.h-rj [data-rj-csv]')]);
                        const csv = fs.readFileSync(await dl.path(), 'utf8');
                        assert.match(csv, /^\ufeff"?Date"?;/); assert.match(csv, /Rien trouvé/);
                        await p.click('.h-rj .ui-listbar-fbtn'); await p.click('.ui-listbar-menu [data-lb-clear]'); await p.waitForTimeout(300);
                        const [dl2] = await Promise.all([p.waitForEvent('download'), p.click('.h-rj [data-rj-csv]')]);
                        const csv2 = fs.readFileSync(await dl2.path(), 'utf8');
                        assert.ok(csv2.includes("'=SOMME(A1)") && !/;"?=SOMME/.test(csv2), 'une cellule qui commence par « = » est protégée');
                        await p.evaluate(() => { try { localStorage.removeItem('lcnda-listbar:listes:research_journal'); } catch (_) {} });
                    });
                    await t('formulaire du dépouillement : Résultat, Personnes cherchées, ⚠️ « Déjà dans ton suivi … (Rien trouvé, le …) ↗ Ouvrir »', async () => {
                        await p.evaluate(() => { const A = window.LCNDA_APP; Object.assign(A.state, { researchKind: 'archive_digest', archiveDigestAdding: true, archiveDigestEditId: 0 }); A.setModule('recherche'); });
                        await p.waitForSelector('#archive-digest-form select[name=result]');
                        assert.ok(await p.$('#archive-digest-form .pk input[type=hidden][name=sought_ids]'), 'menu de choix des personnes (plusieurs)');
                        await p.fill('#archive-digest-form [name=archive_service]', 'AD 19'); await p.fill('#archive-digest-form [name=archive_reference]', '3E 12 4');
                        await p.waitForSelector('#archive-digest-form .h-rj-already', { timeout: 5000 });
                        const txt = await p.textContent('#archive-digest-form .h-rj-already');
                        assert.match(txt, /Déjà dans ton suivi/); assert.match(txt, /Rien trouvé, le|Rien trouvé, aujourd|Rien trouvé, hier|Rien trouvé, \w+ à/); assert.match(txt, /↗ Ouvrir/);
                        await p.$eval('#archive-digest-form .h-rj-already', e => e.scrollIntoView({ block: 'center' }));
                        if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'formulaire-alerte.png') });
                        await p.selectOption('#archive-digest-form select[name=result]', 'partial');
                        const sought = '#archive-digest-form .pk:has(input[name=sought_ids]) input:not([type=hidden])';
                        await p.click(sought); await p.type(sought, 'bori', { delay: 30 });
                        await p.waitForFunction(() => /Marie/.test(document.querySelector('#archive-digest-form .pk:has(input[name=sought_ids])')?.textContent || '') || [...document.querySelectorAll('.pk-list, .pk-pop')].some(x => /Marie/.test(x.textContent)), null, { timeout: 5000 });
                        await p.keyboard.press('Enter');
                        await p.waitForFunction(() => document.querySelector('#archive-digest-form input[name=sought_ids]').value === '2', null, { timeout: 5000 });
                        await p.fill('#archive-digest-form [name=archive_reference]', '5 E 1');
                        await p.click('#archive-digest-form button[type=submit]');
                        await p.waitForSelector('#archive-digest-form', { state: 'detached', timeout: 8000 });
                        const rows = (await get('archive_digest_search', { q: '5 E 1' })).rows;
                        assert.equal(rows[0].result, 'partial'); assert.deepEqual(rows[0].sought.map(s => s.id), [2]);
                        await p.waitForSelector('.archive-digest-result .ui-badge.is-yellow');
                    });
                    await t('Listes → Dépouillements : la pastille du résultat sur la vignette', async () => {
                        await p.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'depouillements'; A.setModule('listes'); });
                        await p.waitForSelector('.h-dp .ui-card');
                        const b = await p.$$eval('.h-dp .ui-card .ui-badge', x => x.map(e => e.textContent.trim().toLowerCase()));
                        assert.ok(b.includes('rien trouvé') && b.includes('trouvé') && b.includes('en partie'), b.join(','));
                    });
                    await t('visite : « ✓ Fait le… » range la feuille dans « ✓ Visites faites » ; le résultat d’une cote s’enregistre (↶ Annuler)', async () => {
                        await p.evaluate(() => { const A = window.LCNDA_APP; Object.assign(A.state, { listType: 'archive_visits', archiveVisitFilter: 'upcoming' }); A.setModule('listes'); });
                        await p.waitForSelector(`[data-archive-visit-done]`);
                        await p.click(`[data-archive-visit-plan] [data-archive-visit-done]`);
                        await p.waitForSelector('dialog[open] input[name=done_at]');
                        await p.fill('dialog[open] input[name=done_at]', '2025-04-02');
                        await p.click('dialog[open] .modal-actions button[type=submit]');
                        await p.waitForSelector('[data-archive-visit-filter="done"][aria-selected="true"]');
                        assert.equal((await get('archive_visit_plans')).plans.find(x => x.id === ids.v2).done_at, '2025-04-02');
                        await p.selectOption(`select[data-archive-visit-result="${ids.i3}"]`, 'not_consulted');
                        await p.waitForFunction(() => [...document.querySelectorAll('.ui-toast')].some(x => /Résultat noté/.test(x.textContent)));
                        assert.equal((await get('archive_visit_plans')).plans.find(x => x.id === ids.v2).items[0].result, 'not_consulted');
                        await shot(p, 'visites-faites.png');
                    });
                }
                await t(`${name} : fiche de la personne → bloc « 🔍 Déjà cherché » (où, quand, cote, résultat, ↗ Ouvrir)`, async () => {
                    await p.evaluate(() => window.LCNDA_APP.openPersonById(1));
                    await p.waitForSelector('[data-rj-person="1"][data-rj-done] .ui-row', { timeout: 10000 });
                    const txt = await p.textContent('[data-rj-person="1"]');
                    assert.match(txt, /cote 3 E 12\/4/); assert.match(txt, /RIEN TROUVÉ|Rien trouvé/i); assert.match(txt, /↗ Ouvrir/);
                    await p.$eval('[data-rj-person="1"]', e => e.closest('.card').scrollIntoView());
                    if (SHOTS) await (await p.$('[data-rj-person="1"]')).evaluateHandle(e => e.closest('.card')).then(h => h.asElement().screenshot({ path: path.join(SHOTS, `bloc-fiche-${name}.png`) }));
                    const sw = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert.ok(sw <= 0, `défilement horizontal : ${sw}`);
                    if (name === '1440') {
                        await p.click('[data-rj-person="1"] .ui-row [data-rj-open]');
                        await p.waitForFunction(() => window.LCNDA_APP.state.module !== 'personnes', null, { timeout: 8000 });
                    }
                });
                await ctx.close();
            }
            await t('aucune erreur JavaScript', async () => assert.deepEqual(errors, []));
        } finally { await browser.close(); }
    } finally {
        proc.kill();
        fs.rmSync(tmp, { recursive: true, force: true });
        console.log(failed ? `\n${failed} vérification(s) en échec.` : '\nToutes les vérifications réussies.');
        process.exit(failed ? 1 : 0);
    }
})();
