'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * ⚖️ Dossiers de preuve et 🛡 solidité des liens (lib/preuve.php, assets/js/heritage-preuve.js) :   node tests/test-preuve-solidite.js
 *  1. un vrai « php -S » sur une petite base : niveaux calculés sur des cas types (acte de naissance qui nomme les parents →
 *     prouvé ; baptême noté « secondaire » → probable ; citation peu sûre → supposé ; rien → sans source ; naissance « doute »),
 *     le dossier qui prime (prouvé, réfuté ; « à vérifier » ne compte pas), le choix à la main + ↶ Annuler, Branches fragiles
 *     (Sosa, génération), dossier pour / contre avec source, citation et dépouillement, désaccord résolu, conclusion + certitude,
 *     ligne retirée puis remise, dossier supprimé puis remis (↶), fiche verrouillée, entrées forgées, CSRF, sorte « citation »
 *     du menu de choix, « Ma semaine » (✓ puis ↶), cache refait quand une source change ;
 *  2. le navigateur (Playwright ; sinon sauté) à 1440 px, 390 px et en sombre : pastilles 🛡 des parents, ⋯ → dossier, ajout
 *     d'un indice (K1 si vide), certitude + ↶, 🖨 Imprimer (fenêtre L1 avec l'aperçu), 📝 traitement de texte, vue solidité de
 *     l'arbre (traits colorés, légende, clic droit), Branches fragiles (H10), Dossiers de preuve (H10), widget ; aucune erreur
 *     JavaScript, pas de défilement horizontal.
 * Captures : SHOTS=dossier node tests/test-preuve-solidite.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

(async () => {
    const phpPath = findPhp([devBundledPhp()]);
    if (!phpPath) { console.log('— PHP absent : suite sautée'); return done(); }
    const SHOTS = process.env.SHOTS || '';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-preuve-'));
    const dir = path.join(tmp, 'a');
    fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
    // 1 Luc (racine) ← 2 Jean MARTIN + 3 Marie BORIE ; 2 ← 4 Pierre MARTIN + 5 Anne DUFOUR ; 3 ← 6 Paul BORIE + 7 Rose LAFON ; 8 Louis, frère de Jean, sans source
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE slug='" . ['BIRT' => 'birth', 'BAPM' => 'baptism'][$tag] . "' AND scope='person' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,is_start,living_status) VALUES(1,'Luc','MARTIN','male',1,'living'),(2,'Jean','MARTIN','male',0,'deceased'),(3,'Marie','BORIE','female',0,'deceased'),(4,'Pierre','MARTIN','male',0,'deceased'),(5,'Anne','DUFOUR','female',0,'deceased'),(6,'Paul','BORIE','male',0,'deceased'),(7,'Rose','LAFON','female',0,'deceased'),(8,'Louis','MARTIN','male',0,'deceased')");
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,2,3),(2,4,5),(3,6,7)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,1),(2,2),(3,3),(2,8)");
$ev = $pdo->prepare('INSERT INTO events(id,scope,person_id,event_type_id,date_text,year) VALUES(?,?,?,?,?,?)');
foreach ([[1,1,'BIRT','1 juin 1950',1950],[2,2,'BIRT','3 mars 1920',1920],[3,2,'BAPM','4 mars 1920',1920],[4,3,'BIRT','2 avril 1922',1922],[5,8,'BIRT','1918',1918],[6,4,'BIRT','1890',1890]] as [$id,$pid,$tag,$dt,$y]) { $ev->execute([$id,'person',$pid,$t($tag),$dt,$y]); }
$pdo->exec("INSERT INTO sources(id,title) VALUES(1,'Registre des naissances de Tulle, 1950'),(2,'Registre paroissial de Naves'),(3,'Relevé du cercle généalogique'),(4,'Recensement de 1926')");
$sl = $pdo->prepare('INSERT INTO source_links(entity_type,entity_id,source_record_id,page,quality,note) VALUES(?,?,?,?,?,?)');
$sl->execute(['event',1,1,'acte n° 12','','Fils de Jean Martin et de Marie Borie']);   // naissance de Luc : nomme les deux parents → prouvé
$sl->execute(['event',3,2,'vue 5','2','']);                                           // baptême de Jean, noté « secondaire »
$sl->execute(['person',4,2,'vue 2','','']);                                           // la même source sur Pierre : elle le nomme → probable (qualité 2)
$sl->execute(['event',4,3,'','1','']);                                                // naissance de Marie : relevé peu sûr → supposé
$sl->execute(['person',4,4,'Naves, 1926','','']);                                    // une source sur Pierre (pas sur le lien)
$pdo->exec("INSERT INTO archive_digest_entries(id,city_name,archive_reference,year_text,record_type,status) VALUES(1,'Naves','3 E 45','1915-1925','bapteme','done')");
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env: envFor(dir), maxBuffer: 1 << 26 });
    if (seed.status !== 0 || !String(seed.stdout).includes('ok')) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const php = code => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require 'lib/paths.php'; require 'lib/bootstrap.php'; $pdo = db(); ${code}`], { cwd: appRoot, encoding: 'utf8', env: envFor(dir) }); return String(r.stdout).trim(); };
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(dir), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let cookie = '';
    const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
    const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
    const get = async (op, q = {}) => (await fetch(`${base}api.php?action=preuve&op=${op}&${new URLSearchParams(q)}`, { headers: { Cookie: cookie } })).json();
    const post = async (action, body, token = csrf) => { const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: JSON.stringify({ ...body, csrf: token }) }); let json = {}; try { json = await r.json(); } catch (_) {} return { status: r.status, json, res: json.result ?? json }; };
    const w = (op, body) => post('preuve_write', { op, ...body });
    const level = async (c, p) => (await get('link', { child_id: c, parent_id: p })).link?.level;
    try {
        await t('structure : migration 88 (proof_cases, proof_items, link_strength)', async () => {
            assert.equal(php("echo (int) $pdo->query('PRAGMA user_version')->fetchColumn();"), String(Number(fs.readFileSync(path.join(appRoot, 'lib/migrations.php'), 'utf8').match(/const SCHEMA_VERSION = (\d+);/)[1])));
            assert.equal(php("echo (int) $pdo->query(\"SELECT count(*) FROM sqlite_master WHERE name IN ('proof_cases','proof_items','link_strength')\")->fetchColumn();"), '3');
        });
        await t('niveaux calculés sur des cas types, avec le pourquoi', async () => {
            const l12 = (await get('link', { child_id: 1, parent_id: 2 })).link;
            assert.equal(l12.level, 'proved'); assert.match(l12.why, /Acte de naissance cité, qui nomme le père Jean MARTIN/);
            assert.equal(await level(1, 3), 'proved', 'nom de la mère écrit dans la citation');
            const l24 = (await get('link', { child_id: 2, parent_id: 4 })).link;
            assert.equal(l24.level, 'probable'); assert.match(l24.why, /source secondaire/);
            assert.equal(await level(2, 5), 'probable', 'baptême cité sans nommer la mère');
            assert.match((await get('link', { child_id: 2, parent_id: 5 })).link.why, /rien ne montre qu’il nomme Anne DUFOUR/);
            const l36 = (await get('link', { child_id: 3, parent_id: 6 })).link;
            assert.equal(l36.level, 'supposed'); assert.match(l36.why, /peu sûre/);
            const l84 = (await get('link', { child_id: 8, parent_id: 4 })).link;
            assert.equal(l84.level, 'unsourced'); assert.match(l84.why, /Aucune source/);
            const rules = await get('rules');
            assert.deepEqual(rules.rules.map(r => r[0]), ['proved', 'probable', 'supposed', 'unsourced', 'refuted']);
            const fiche = await get('person', { id: 1 });
            assert.deepEqual(fiche.parents.map(x => [x.parent_id, x.level]).sort(), [[2, 'proved'], [3, 'proved']]);
        });
        await t('naissance marquée « doute » : au mieux supposé ; cache refait quand une source change', async () => {
            php("$pdo->exec(\"UPDATE events SET fact_confidence='doubt', updated_at=datetime('now','+1 minute') WHERE id=1\");");
            assert.equal(await level(1, 2), 'supposed');
            assert.match((await get('link', { child_id: 1, parent_id: 2 })).link.why, /doute/);
            php("$pdo->exec(\"UPDATE events SET fact_confidence='unknown', updated_at=datetime('now','+2 minutes') WHERE id=1\");");
            assert.equal(await level(1, 2), 'proved');
            php("$pdo->exec(\"UPDATE source_links SET quality='3' WHERE entity_type='event' AND entity_id=3\");");
            assert.equal(await level(2, 4), 'proved', 'qualité 3 : prouvé');
            php("$pdo->exec(\"UPDATE source_links SET quality='2' WHERE entity_type='event' AND entity_id=3\");");
            assert.equal(await level(2, 4), 'probable');
        });
        let caseId = 0;
        await t('dossier : pour / contre avec source, citation et dépouillement, désaccord, conclusion, certitude', async () => {
            const f = await get('find', { subject: 'parent', person_id: 8, related_id: 4 });
            assert.equal(f.case, null); assert.equal(f.question, 'Louis MARTIN est-il bien le fils de Pierre MARTIN ?');
            let r = await w('save_case', { subject: 'parent', person_id: 8, related_id: 4, question: f.question });
            assert.equal(r.status, 200, JSON.stringify(r.json)); caseId = r.res.case.id; assert.equal(r.res.case.certainty, 'tocheck');
            const cit = Number(php("echo (int) $pdo->query(\"SELECT id FROM source_links WHERE entity_type='event' AND entity_id=3\")->fetchColumn();"));
            r = await w('save_item', { case_id: caseId, kind: 'for', text: 'Le baptême de Jean nomme Pierre Martin', ref_kind: 'citation', ref_id: cit, evidence: 'indirect', quality: 'original' });
            assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.res.item.ref.kind, 'citation'); assert.match(r.res.item.ref.meta, /Citée sur : baptême de Jean MARTIN/);
            r = await w('save_item', { case_id: caseId, kind: 'against', text: 'Un autre Louis Martin à Tulle', ref_kind: 'source', ref_id: 4, evidence: 'negative', quality: 'derived' });
            assert.equal(r.res.item.ref.title, 'Recensement de 1926');
            r = await w('save_item', { case_id: caseId, kind: 'research', text: 'Baptêmes de Naves 1915-1925', ref_kind: 'digest', ref_id: 1 });
            assert.equal(r.res.item.ref.kind, 'digest'); assert.match(r.res.item.ref.title, /Naves/); assert.equal(r.res.item.evidence, '', 'pas de sorte d’indice pour une recherche');
            r = await w('save_item', { case_id: caseId, kind: 'conflict', text: 'Deux âges différents', resolution: 'L’âge au décès est arrondi.' });
            assert.equal(r.res.item.resolution, 'L’âge au décès est arrondi.');
            // pas de texte ni de source : K1 côté serveur
            r = await w('save_item', { case_id: caseId, kind: 'for', text: '  ' }); assert.ok(r.json.error, 'ligne vide refusée');
            r = await w('save_case', { id: caseId, conclusion: 'Le baptême et le recensement concordent.', certainty: 'proved' });
            assert.equal(r.res.prev.certainty, 'tocheck');
            const c = await get('case', { id: caseId });
            assert.deepEqual(c.items.map(i => i.kind), ['for', 'against', 'research', 'conflict']);
            assert.equal(c.certainty, 'proved'); assert.equal(c.link.level, 'proved'); assert.equal(c.link.code, 'case');
            const list = await get('list');
            assert.equal(list.items.length, 1); assert.equal(list.items[0].n_for, 1); assert.equal(list.items[0].n_open, 0); assert.equal(list.counts.proved, 1);
            assert.equal((await get('find', { subject: 'parent', person_id: 8, related_id: 4 })).case.id, caseId, 'le même dossier est retrouvé');
        });
        await t('le dossier prime : prouvé, réfuté ; « à vérifier » laisse le calcul', async () => {
            assert.equal(await level(8, 4), 'proved');
            assert.match((await get('link', { child_id: 8, parent_id: 4 })).link.why, /Dossier de preuve : « Louis MARTIN est-il bien le fils de Pierre MARTIN \? »/);
            await w('save_case', { id: caseId, certainty: 'refuted' }); assert.equal(await level(8, 4), 'refuted');
            await w('save_case', { id: caseId, certainty: 'tocheck' }); assert.equal(await level(8, 4), 'unsourced');
            await w('save_case', { id: caseId, certainty: 'possible' }); assert.equal(await level(8, 4), 'supposed');
            await w('save_case', { id: caseId, certainty: 'proved' }); assert.equal(await level(8, 4), 'proved');
            // le choix à la main ne passe pas devant le dossier
            const r = await w('manual_set', { child_id: 8, parent_id: 4, level: 'unsourced' }); assert.equal(r.res.link.level, 'proved');
            await w('manual_set', { child_id: 8, parent_id: 4, level: '' });
        });
        await t('ligne retirée puis remise, dossier supprimé puis remis (↶ Annuler)', async () => {
            const c = await get('case', { id: caseId });
            const it = c.items.find(i => i.kind === 'against');
            await w('delete_item', { id: it.id });
            assert.equal((await get('case', { id: caseId })).items.length, 3);
            await w('restore_item', { id: it.id });
            assert.equal((await get('case', { id: caseId })).items.length, 4);
            await w('delete_case', { id: caseId });
            assert.equal((await get('list')).items.length, 0);
            assert.equal(await level(8, 4), 'unsourced', 'dossier supprimé : le calcul reprend');
            assert.ok((await get('case', { id: caseId })).error);
            await w('restore_case', { id: caseId });
            assert.equal((await get('case', { id: caseId })).items.length, 4);
            assert.equal(await level(8, 4), 'proved');
        });
        await t('choix à la main + ↶ Annuler', async () => {
            const r = await w('manual_set', { child_id: 8, parent_id: 5, level: 'probable', note: 'Vu dans les papiers de famille' });
            assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.res.prev, null); assert.equal(r.res.link.level, 'probable'); assert.equal(r.res.link.why, 'Choisi à la main.');
            const r2 = await w('manual_set', { child_id: 8, parent_id: 5, level: 'proved' }); assert.equal(r2.res.prev.level, 'probable');
            await w('manual_restore', { child_id: 8, parent_id: 5, prev: r2.res.prev }); assert.equal(await level(8, 5), 'probable');
            await w('manual_restore', { child_id: 8, parent_id: 5, prev: null }); assert.equal(await level(8, 5), 'unsourced');
        });
        await t('Branches fragiles : Sosa, génération, seulement supposé / sans source / réfuté', async () => {
            const d = await get('fragiles');
            assert.equal(d.total, 6);
            assert.deepEqual(d.items.map(x => [x.sosa, x.level]), [[6, 'supposed'], [7, 'supposed']]);
            assert.equal(d.items[0].generation, 3); assert.equal(d.items[0].child.name, 'Marie BORIE'); assert.equal(d.items[0].parent.name, 'Paul BORIE');
            const s = await get('summary'); assert.equal(s.fragile, 2); assert.equal(s.counts.proved, 2);
            const pairs = await get('pairs', { ids: '1,2,3,4,5,6,7' });
            assert.deepEqual(pairs.links['1:2'], ['proved', 0]); assert.equal(pairs.links['3:6'][0], 'supposed'); assert.equal(pairs.links['8:4'], undefined, 'Louis n’est pas montré');
        });
        await t('Ma semaine : un lien à consolider (✓ puis ↶), clé forgée refusée', async () => {
            const s = await (await fetch(`${base}api.php?action=semaine`, { headers: { Cookie: cookie } })).json();
            const row = (s.items || s.rows || []).find(x => String(x.key).startsWith('solidite:'));
            assert.ok(row, JSON.stringify(Object.keys(s)));
            assert.match(row.title, /Lien à consolider : Marie BORIE, la fille de (Paul BORIE|Rose LAFON)/);
            assert.deepEqual([row.open.kind, row.open.list], ['list', 'fragile_branches']);
            const r = await post('semaine_mark', { op: 'done', key: row.key, title: row.title });
            assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.res.label, 'Lien vérifié');
            await post('semaine_mark', { op: 'restore', key: row.key, prev: r.res.prev });
            assert.ok((await post('semaine_mark', { op: 'done', key: 'solidite:1:x:2' })).json.error);
        });
        await t('menu de choix : la sorte « citation »', async () => {
            const r = await (await fetch(`${base}api.php?action=picker_search&kind=citation&q=borie`, { headers: { Cookie: cookie } })).json();
            const it = r.groups[0].items;
            assert.ok(it.some(x => /Registre des naissances de Tulle/.test(x.title)), JSON.stringify(it));
            const one = await (await fetch(`${base}api.php?action=picker_search&kind=citation&q=naves`, { headers: { Cookie: cookie } })).json();
            assert.ok(one.groups[0].items.some(x => x.badge === 'Qualité 2'));
        });
        await t('fiche verrouillée, entrées forgées, CSRF', async () => {
            php("$pdo->exec('UPDATE persons SET is_locked=1 WHERE id=8');");
            let r = await w('save_item', { case_id: caseId, kind: 'for', text: 'x' }); assert.match(r.json.error || '', /verrouillée/);
            r = await w('delete_case', { id: caseId }); assert.match(r.json.error || '', /verrouillée/);
            r = await w('manual_set', { child_id: 8, parent_id: 5, level: 'proved' }); assert.match(r.json.error || '', /verrouillée/);
            php("$pdo->exec('UPDATE persons SET is_locked=0 WHERE id=8');");
            r = await w('manual_set', { child_id: 1, parent_id: 7, level: 'proved' }); assert.ok(r.json.error, 'pas un lien');
            r = await w('manual_set', { child_id: 1, parent_id: 2, level: "x'; DROP TABLE persons;--" }); assert.ok(r.json.error, 'niveau forgé');
            r = await w('save_item', { case_id: caseId, kind: 'for', text: 'y', ref_kind: 'source', ref_id: 999 }); assert.ok(r.json.error, 'source absente');
            r = await w('save_item', { case_id: caseId, kind: '../x', text: 'z', ref_kind: 'persons', ref_id: 1, evidence: 'bogus', quality: '<b>' });
            assert.equal(r.res.item.kind, 'for'); assert.equal(r.res.item.ref_kind, ''); assert.equal(r.res.item.evidence, ''); assert.equal(r.res.item.quality, '');
            await w('delete_item', { id: r.res.item.id });
            r = await w('save_case', { subject: 'parent', person_id: 1 }); assert.match(r.json.error || '', /Choisis le parent/);
            r = await w('save_case', { subject: 'date', person_id: 1, event_id: 3 }); assert.match(r.json.error || '', /pas sur la fiche/);
            r = await w('nope', {}); assert.ok(r.json.error);
            r = await post('preuve_write', { op: 'save_case', subject: 'other', person_id: 1 }, 'mauvais'); assert.ok(r.status >= 400, 'CSRF');
            assert.equal(php("echo (int) $pdo->query('SELECT count(*) FROM persons')->fetchColumn();"), '8');
        });

        /* ═════ 2. le navigateur ═════ */
        let pw = null; try { pw = require('/opt/node22/lib/node_modules/playwright'); } catch (_) { try { pw = require('playwright'); } catch (__) { pw = null; } }
        if (!pw) console.log('— Playwright absent : partie navigateur sautée');
        else {
            const browser = await pw.chromium.launch();
            const errors = [];
            const watch = (p, name) => { p.on('pageerror', e => errors.push(`${name} : ${e.message}`)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errors.push(`${name} console : ${m.text()}`); }); };
            const noScroll = async p => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false, 'pas de défilement horizontal');
            const shot = async (p, n) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `preuve-${n}.png`) }); };
            for (const [name, vp, dark] of [['1440', { width: 1440, height: 1000 }, false], ['390', { width: 390, height: 860 }, false], ['sombre', { width: 1440, height: 1000 }, true]]) {
                await t(`navigateur ${name} : fiche, dossier, impression, arbre, listes, widget`, async () => {
                    const ctx = await browser.newContext({ viewport: vp, colorScheme: dark ? 'dark' : 'light' });
                    await ctx.addInitScript(() => { try { localStorage.setItem('genealogie-last-route', '#tableau-de-bord'); localStorage.removeItem('genealogie-tree-solidite'); } catch (_) {} });
                    const p = await ctx.newPage(); watch(p, name);
                    await p.goto(base);
                    await p.waitForFunction(() => window.LCNDA_APP?.state && window.LCNDA_EXT?.preuve && window.LCNDA_EXT?.openDialog, null, { timeout: 20000 });
                    if (dark) await p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
                    // la fiche : une pastille 🛡 par parent
                    await p.evaluate(() => { window.LCNDA_APP.state.currentPersonId = 2; window.LCNDA_APP.setModule('personnes'); });
                    await p.waitForSelector('[data-pv-sol="2:4"] .ui-badge', { timeout: 20000 });
                    assert.match(await p.locator('[data-pv-sol="2:4"]').innerText(), /probable/i);
                    assert.equal(await p.locator('[data-pv-sol]').count(), 2);
                    await p.locator('[data-pv-sol="2:4"]').scrollIntoViewIfNeeded(); await shot(p, `fiche-${name}`);
                    // pastille → le pourquoi
                    await p.locator('[data-pv-sol="2:5"]').click();
                    await p.waitForSelector('dialog [data-pv-link] .pv-link-now', { timeout: 10000 });
                    assert.match(await p.locator('dialog [data-pv-link] .pv-link-now').innerText(), /rien ne montre/);
                    await shot(p, `lien-${name}`);
                    await p.keyboard.press('Escape');
                    // ⋯ → « ⚖️ Dossier de preuve… » → la question du parent
                    await p.locator('#workspace [data-fsec-hero-more]').first().click();
                    await p.locator('.ui-actmenu button', { hasText: 'Dossier de preuve' }).first().click();
                    await p.waitForSelector('dialog .pv-choose-btn', { timeout: 10000 });
                    await p.locator('dialog .pv-choose-btn', { hasText: 'bien le fils d’Anne' }).first().click();
                    await p.waitForSelector('dialog .pv-case .pv-grid', { timeout: 10000 });
                    const cid = Number(await p.locator('dialog [data-pv-case]').getAttribute('data-pv-case'));
                    assert.ok(cid > 0);
                    // un indice : vide → K1, puis rempli avec sa sorte
                    await p.locator('dialog .pv-case [data-pv-add="for"]').first().click();
                    await p.waitForSelector('dialog .pv-form');
                    const itemDlg = p.locator('dialog', { has: p.locator('.pv-form') });
                    await itemDlg.locator('button[type=submit]').click();
                    await p.waitForSelector('dialog .pv-form .is-invalid, dialog .pv-form [aria-invalid="true"]', { timeout: 5000 });
                    await itemDlg.locator('textarea[name=text]').fill('Le baptême nomme Anne Dufour comme mère');
                    await itemDlg.locator('input[name=evidence][value=direct]').check();
                    await itemDlg.locator('input[name=quality][value=original]').check();
                    await shot(p, `indice-${name}`);
                    await itemDlg.locator('button[type=submit]').click();
                    await p.waitForSelector('dialog .pv-case .pv-item.is-for', { timeout: 10000 });
                    assert.equal(php(`echo $pdo->query("SELECT evidence||'/'||quality FROM proof_items WHERE case_id=${cid} AND kind='for'")->fetchColumn();`), 'direct/original');
                    // certitude + ↶ Annuler
                    await p.locator('dialog .pv-case [data-pv-cert="proved"]').click();
                    await p.waitForFunction(() => document.querySelector('dialog .pv-case [data-pv-cert="proved"]')?.classList.contains('is-active'), null, { timeout: 10000 });
                    assert.equal(php(`echo $pdo->query('SELECT certainty FROM proof_cases WHERE id=${cid}')->fetchColumn();`), 'proved');
                    await shot(p, `dossier-${name}`);
                    await noScroll(p);
                    await p.locator('#toast-region button', { hasText: 'Annuler' }).last().click();
                    await p.waitForFunction(() => document.querySelector('dialog .pv-case [data-pv-cert="tocheck"]')?.classList.contains('is-active'), null, { timeout: 10000 });
                    assert.equal(php(`echo $pdo->query('SELECT certainty FROM proof_cases WHERE id=${cid}')->fetchColumn();`), 'tocheck');
                    // la conclusion, gardée toute seule
                    await p.locator('dialog .pv-case [data-pv-conclusion]').fill('Le baptême la nomme.');
                    await p.waitForFunction(() => /Enregistré/.test(document.querySelector('dialog .pv-case [data-pv-saved]')?.textContent || ''), null, { timeout: 10000 });
                    assert.equal(php(`echo $pdo->query('SELECT conclusion FROM proof_cases WHERE id=${cid}')->fetchColumn();`), 'Le baptême la nomme.');
                    // 🖨 Imprimer : la fenêtre L1, avec l'aperçu
                    await p.locator('dialog .pv-case [data-pv-print]').click();
                    await p.waitForSelector('dialog.k-print', { timeout: 10000 });
                    assert.match(await p.locator('dialog.k-print').innerText(), /Dossier de preuve/);
                    await p.waitForTimeout(400); await shot(p, `imprimer-${name}`);
                    await p.locator('dialog.k-print button', { hasText: 'Annuler' }).first().click();
                    // 📝 traitement de texte
                    const hasWp = await p.evaluate(() => !!(window.LCNDA_EXT.textDocKit?.Editor && window.LCNDA_EXT.openTextDoc));
                    if (hasWp) {
                        await p.locator('dialog .pv-case [data-pv-doc]').click();
                        await p.waitForFunction(() => /Dossier de preuve/.test(document.querySelector('.wp-page, .wp-editor, [class*="wp-"]')?.closest('dialog, .wp-shell, body')?.textContent || ''), null, { timeout: 15000 });
                        await shot(p, `texte-${name}`);
                        await p.keyboard.press('Escape'); await p.waitForTimeout(300);
                        await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => { if (!d.querySelector('.pv-case')) d.close(); }));
                        const confirm = p.locator('dialog[open] button', { hasText: /Fermer sans enregistrer|Ne pas enregistrer/ }); if (await confirm.count()) await confirm.first().click();
                    }
                    await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
                    // l'arbre : vue solidité, légende, clic droit sur un trait
                    await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.state.graphMode = 'ancestors'; A.state.graphDepth = 3; A.setModule('graphiques'); });
                    await p.waitForSelector('#workspace .tool-strip [data-pv-tree]', { timeout: 20000 });
                    await p.locator('#workspace .tool-strip [data-pv-tree]').evaluate(i => { i.checked = true; i.dispatchEvent(new Event('change', {bubbles: true})); });
                    await p.waitForSelector('.tree.lc-sol-on li[data-sol="proved"]', { timeout: 15000 });
                    const sols = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.tree li[data-sol]')].map(li => [li.querySelector('.tree-card')?.dataset.treePerson, li.dataset.sol])));
                    assert.equal(sols['2'], 'proved'); assert.equal(sols['3'], 'proved'); assert.equal(sols['4'], 'probable'); assert.equal(sols['6'], 'supposed');
                    const color = await p.evaluate(() => { const li = document.querySelector('.tree li[data-sol="supposed"]'); return getComputedStyle(li, '::after').borderTopStyle + '|' + getComputedStyle(li, '::before').borderTopStyle; });
                    assert.match(color, /dashed/, color);
                    assert.ok(await p.locator('[data-pv-legend] .lc-sol-key').count() === 5);
                    await shot(p, `arbre-${name}`);
                    await p.locator('.tree .tree-card[data-tree-person="6"]').first().click({ button: 'right' });
                    await p.waitForSelector('.ui-actmenu button', { timeout: 5000 });
                    assert.ok(await p.locator('.ui-actmenu button', { hasText: 'Dossier de preuve : Marie BORIE → enfant de Paul BORIE' }).count());
                    await shot(p, `arbre-menu-${name}`);
                    await p.keyboard.press('Escape');
                    // Branches fragiles (H10)
                    await p.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'fragile_branches'; A.setModule('listes'); });
                    await p.waitForSelector('.pv-frag .ui-listbar', { timeout: 20000 });
                    await p.waitForSelector('.pv-frag [data-pv-frow="3:6"]', { timeout: 20000 });
                    assert.equal(await p.locator('.pv-frag [data-pv-frow]').count(), 2);
                    await shot(p, `fragiles-${name}`);
                    await noScroll(p);
                    // Dossiers de preuve (H10)
                    await p.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'proof_cases'; A.renderList(); });
                    await p.waitForSelector('.pv-page [data-pv-row]', { timeout: 20000 });
                    assert.ok(await p.locator(`.pv-page [data-pv-row="${cid}"]`).count());
                    await shot(p, `dossiers-${name}`);
                    await noScroll(p);
                    // le widget
                    await p.evaluate(async () => { const A = window.LCNDA_APP; A.saveDashboardBlockSettings({widgets: [A.dashboardNewWidget('fragile_widget', {width: '12', limit: 5})]}); if (A.state.module !== 'dashboard') await A.setModule('dashboard'); else await A.setModule('dashboard', false); });
                    await p.waitForSelector('.dashboard-widget[data-widget-type="fragile_widget"] .pv-w-row', { timeout: 20000 });
                    await shot(p, `widget-${name}`);
                    await noScroll(p);
                    // ménage : le dossier fait par ce passage
                    await p.evaluate(async id => { await window.LCNDA_APP.api('preuve_write', {}, {method: 'POST', body: {op: 'delete_case', id}}); }, cid);
                    await ctx.close();
                });
            }
            await browser.close();
            await t('aucune erreur JavaScript', async () => { assert.deepEqual(errors, []); });
        }
    } finally {
        proc.kill();
        fs.rmSync(tmp, { recursive: true, force: true });
    }
    done();
})();
function done() {
    if (failed) { console.error(`\n${failed} échec(s)`); process.exit(1); }
    console.log('\nTout est bon.');
}
