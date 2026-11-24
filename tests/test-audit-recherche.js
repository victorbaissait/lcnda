#!/usr/bin/env node
/* 🔎 Recherche et 🛠 Réglages — audit des onglets (docs/design/audit-onglets.html §11, §17, manques transversaux).
 *  Serveur (lib/recherche_outils.php) : chercher et remplacer (aperçu, remplacer, ↶ Annuler exact, ↷ Rétablir, fiche verrouillée),
 *  lien de parenté, comparer deux recherches, sources et citations, étiqueter / Mes listes (+ ↶), dépouillement supprimé (+ ↶),
 *  santé de la base + compacter, remplacer un lieu (+ ↶), règles d'étiquettes (+ ↶), mode consultation (écritures refusées).
 *  Écran : colonne de boutons des sortes (R2), en-têtes UI.pageHeader (R1), 🕘 dernières recherches, ☑ barre d'actions,
 *  ⤓ Exporter / 🖨 Imprimer (R4), 🔁 aperçu + Remplacer + ↶ Annuler, 🧬 📊 🧾, dépouillement : 🗑 tout de suite + ↶ Annuler (R7),
 *  « ⋯ » et clic droit (R11), « En pause » (R9), Réglages : 🔎 Ce que j'ai changé (↺ ligne, ↺ groupe, ↶), 🗄 Santé de la base,
 *  🔁 remplacer un lieu, 🏷 règles automatiques, en-têtes (R1), mode consultation (R6), 390 px sans débordement (R12).
 *   node tests/test-audit-recherche.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const {spawn, spawnSync} = require('child_process');
let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
const root = path.join(__dirname, '..');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-ar-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$tag = function ($t) use ($pdo) { $s = $pdo->prepare('SELECT id FROM event_types WHERE gedcom_tag=? ORDER BY id LIMIT 1'); $s->execute([$t]); return (int) $s->fetchColumn(); };
$pl = function ($name, $county) use ($pdo) { $pdo->prepare("INSERT INTO places(name, county, country) VALUES(?,?,'France')")->execute([$name, $county]); return (int) $pdo->lastInsertId(); };
$tulle = $pl('Tulle', 'Corrèze'); $stam = $pl('St Amand', 'Cher'); $stam2 = $pl('Saint-Amand-Montrond', 'Cher');
$per = function ($f, $l, $g, $by, $place, $occ = '', $dy = null, $living = 'deceased') use ($pdo, $tag) {
    $pdo->prepare("INSERT INTO persons(first_name,last_name,gender,living_status,occupation) VALUES(?,?,?,?,?)")->execute([$f, $l, $g, $living, $occ]); $id = (int) $pdo->lastInsertId();
    $pdo->prepare("INSERT INTO events(scope, person_id, event_type_id, year, date_text, place_id) VALUES('person',?,?,?,?,?)")->execute([$id, $tag('BIRT'), $by, (string) $by, $place]);
    if ($dy) { $pdo->prepare("INSERT INTO events(scope, person_id, event_type_id, year, date_text, place_id) VALUES('person',?,?,?,?,?)")->execute([$id, $tag('DEAT'), $dy, (string) $dy, $place]); }
    return $id; };
$fam = function ($a, $b, $kids) use ($pdo) { $pdo->prepare('INSERT INTO families(partner1_id, partner2_id) VALUES(?,?)')->execute([$a, $b]); $f = (int) $pdo->lastInsertId();
    foreach ($kids as $k) { $pdo->prepare('INSERT INTO family_children(family_id, child_id) VALUES(?,?)')->execute([$f, $k]); } return $f; };
// grands-parents → deux fils → leurs enfants (cousins germains)
$gp = $per('Antoine', 'MAZAUD', 'male', 1840, $tulle, 'cultivatr', 1900); $gm = $per('Marie', 'LACOMBE', 'female', 1845, $tulle, '', 1910);
$f1 = $per('Pierre', 'MAZAUD', 'male', 1870, $tulle, 'cultivatr', 1930); $f2 = $per('Jean', 'MAZAUD', 'male', 1875, $stam, 'Cultivatr', 1940);
$m1 = $per('Louise', 'DURAND', 'female', 1872, $tulle, '', 1950); $m2 = $per('Anne', 'DURAND', 'female', 1878, $stam, '', 1960);
$c1 = $per('Paul', 'MAZAUD', 'male', 1898, $tulle, 'cultivatrice', 1970); $c2 = $per('Jeanne', 'MAZAUD', 'female', 1905, $stam, '', null, 'living');
$c3 = $per('Louis', 'MAZAUD', 'male', 1901, $stam, '', 1980);
$fam($gp, $gm, [$f1, $f2]); $fam($f1, $m1, [$c1]); $fam($f2, $m2, [$c2, $c3]);
$pdo->prepare('UPDATE persons SET is_locked=1 WHERE id=?')->execute([$f2]); // fiche verrouillée : ne change pas
$pdo->prepare("INSERT INTO notes(entity_type, entity_id, title, body) VALUES('person', ?, 'Note', 'Il était cultivatr à Tulle.')")->execute([$gp]);
$pdo->prepare("INSERT INTO sources(title, author, text) VALUES('Registre paroissial de Tulle', 'AD Corrèze', 'baptême de Paul, folio douze')")->execute(); $src = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO source_links(entity_type, entity_id, source_record_id, page, note) VALUES('person', ?, ?, 'f° 12', 'acte retrouvé grâce au folio douze')")->execute([$c1, $src]);
$e = $pdo->prepare("INSERT INTO events(scope, person_id, event_type_id, year, date_text, place_id) VALUES('person',?,?,1920,'1920',?)"); $e->execute([$c3, $tag('RESI'), $stam]); $e->execute([$c1, $tag('RESI'), $stam]);
echo json_encode(compact('gp', 'gm', 'f1', 'f2', 'm1', 'm2', 'c1', 'c2', 'c3', 'tulle', 'stam', 'stam2', 'src'));`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"gp"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const ID = JSON.parse(seed.stdout.trim().split('\n').pop());
    const sql = q => spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `$p = new PDO('sqlite:' . getenv('GENEALOGY_DATA_DIR') . '/genealogy.sqlite'); echo $p->query(${JSON.stringify(q)})->fetchColumn();`], {cwd: root, encoding: 'utf8', env}).stdout.trim();
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    // les fichiers nouveaux (pas encore branchés dans index.php) : chargés ici s'il le faut
    const wire = async p => {
        await p.evaluate(async () => {
            const add = (tag, attrs) => new Promise(res => { const el = document.createElement(tag); Object.assign(el, attrs); el.onload = res; el.onerror = res; document.head.append(el); });
            if (!document.querySelector('link[href*="audit-recherche.css"]')) await add('link', {rel: 'stylesheet', href: 'assets/css/audit-recherche.css'});
            if (!window.LCNDA_EXT?.researchPlus) await add('script', {src: 'assets/js/app-recherche-outils.js'});
        });
    };
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}, acceptDownloads: true});
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        p.on('dialog', d => d.dismiss().catch(() => {}));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_PARTS?.renderResearch && window.LCNDA_PARTS?.renderMaintenance, null, {timeout: 30000});
        await wire(p);
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);
        const occ = id => api('person', {id}).then(d => d.person.occupation);
        const clickToast = async re => { await p.waitForFunction(r => [...document.querySelectorAll('.toast')].some(x => new RegExp(r).test(x.textContent) && /Annuler/.test(x.textContent)), re.source, {timeout: 8000});
            await p.evaluate(r => { const tt = [...document.querySelectorAll('.toast')].filter(x => new RegExp(r).test(x.textContent)).pop(); [...tt.querySelectorAll('button')].find(b => /Annuler/.test(b.textContent)).click(); }, re.source); };
        const goResearch = async kind => { await p.evaluate(async k => { const s = window.LCNDA_APP.state; s.researchKind = k; s.archiveDigestAdding = false; await window.LCNDA_APP.setModule('recherche'); }, kind); await p.waitForSelector('#research-form [data-rk-menu] [data-rk-pick]'); };
        const goMaint = async tab => { await p.evaluate(async k => { const s = window.LCNDA_APP.state; s.maintenanceTab = k; await window.LCNDA_APP.setModule('maintenance'); }, tab); };

        /* ═════ serveur ═════ */
        await t('serveur : chercher et remplacer — aperçu, mot entier, majuscules, fiche verrouillée', async () => {
            const d = await api('ro_replace_preview', {field: 'occupation', find: 'cultivatr', replace: 'cultivateur', word: 1});
            assert.ok(!d.error, d.error);
            const keys = d.rows.map(r => r.key).sort();
            assert.deepStrictEqual(keys, [`persons:occupation:${ID.f1}`, `persons:occupation:${ID.f2}`, `persons:occupation:${ID.gp}`].sort(), 'mot entier : « cultivatrice » reste');
            assert.strictEqual(d.locked, 1);
            assert.strictEqual(d.rows.find(r => r.id === ID.f2).after, 'cultivateur');
            const cs = await api('ro_replace_preview', {field: 'occupation', find: 'cultivatr', replace: 'x', case: 1, word: 1});
            assert.strictEqual(cs.total, 2, 'majuscules respectées : « Cultivatr » ne compte pas');
            const notes = await api('ro_replace_preview', {field: 'note', find: 'cultivatr', replace: 'cultivateur'});
            assert.strictEqual(notes.total, 1); assert.strictEqual(notes.rows[0].after, 'Il était cultivateur à Tulle.');
        });
        await t('serveur : remplacer, ↶ Annuler remet exactement, ↷ Rétablir, journal', async () => {
            const r = await post('ro_replace_apply', {field: 'occupation', find: 'cultivatr', replace: 'cultivateur', word: 1});
            assert.strictEqual(r.count, 2, JSON.stringify(r)); // la fiche verrouillée ne change pas
            assert.strictEqual(await occ(ID.gp), 'cultivateur'); assert.strictEqual(await occ(ID.f2), 'Cultivatr'); assert.strictEqual(await occ(ID.c1), 'cultivatrice');
            const log = await api('changes', {});
            assert.ok(JSON.stringify(log).includes('Chercher et remplacer'), 'journalisé');
            const u = await post('ro_undo', {id: r.undo_id}); assert.strictEqual(u.undone, 2);
            assert.strictEqual(await occ(ID.gp), 'cultivatr'); assert.strictEqual(await occ(ID.f1), 'cultivatr');
            assert.ok((await post('ro_undo', {id: r.undo_id})).already, 'deuxième ↶ : déjà');
            await post('ro_redo', {id: r.undo_id}); assert.strictEqual(await occ(ID.gp), 'cultivateur');
            await post('ro_undo', {id: r.undo_id}); assert.strictEqual(await occ(ID.gp), 'cultivatr');
            // une case changée entre-temps n'est pas écrasée par ↶
            const r2 = await post('ro_replace_apply', {field: 'occupation', find: 'cultivatr', replace: 'cultivateur', word: 1, keys: [`persons:occupation:${ID.gp}`]});
            assert.strictEqual(r2.count, 1);
            await post('save_person', {id: ID.gp, occupation: 'meunier', first_name: 'Antoine', last_name: 'MAZAUD', gender: 'male', living_status: 'deceased'}).catch(() => {});
            const now = await occ(ID.gp);
            await post('ro_undo', {id: r2.undo_id});
            assert.strictEqual(await occ(ID.gp), now === 'meunier' ? 'meunier' : 'cultivatr');
        });
        await t('serveur : lien de parenté (cousins germains, descendants vivants nés après 1900, ancêtres)', async () => {
            const c = await api('ro_kinship', {person_id: ID.c1, relation: 'cousins'});
            assert.deepStrictEqual(c.people.map(x => x.first_name).sort(), ['Jeanne', 'Louis']);
            const d = await api('ro_kinship', {person_id: ID.gp, relation: 'descendants', living: 'living', born_after: 1900});
            assert.deepStrictEqual(d.people.map(x => x.first_name), ['Jeanne']);
            const a = await api('ro_kinship', {person_id: ID.c1, relation: 'ancestors'});
            assert.strictEqual(a.people.length, 4); assert.strictEqual(a.people.find(x => x.id === ID.gp).generation, 2);
            assert.deepStrictEqual((await api('ro_kinship', {person_id: ID.c2, relation: 'siblings'})).people.map(x => x.id), [ID.c3]);
            assert.deepStrictEqual((await api('ro_kinship', {person_id: ID.c2, relation: 'uncles'})).people.map(x => x.id), [ID.f1]);
        });
        let ssA, ssB;
        await t('serveur : comparer deux recherches enregistrées', async () => {
            ssA = (await post('save_saved_search', {name: 'Les MAZAUD', criteria: {last_name: 'MAZAUD'}})).id;
            ssB = (await post('save_saved_search', {name: 'Nés à Tulle', criteria: {place: 'Tulle'}})).id;
            assert.ok(ssA && ssB);
            const d = await api('ro_compare', {a: ssA, b: ssB, op: 'minus'});
            assert.ok(!d.error, d.error);
            assert.ok(d.people.every(x => x.last_name === 'MAZAUD'));
            const and = await api('ro_compare', {a: ssA, b: ssB, op: 'and'});
            assert.strictEqual(d.count + and.count, d.a.count, 'A = (A sans B) + (A et B)');
        });
        await t('serveur : sources et citations', async () => {
            const d = await api('ro_sources', {q: 'folio douze'});
            assert.strictEqual(d.sources.length, 1); assert.strictEqual(d.sources[0].field, 'Texte'); assert.strictEqual(d.sources[0].uses, 1);
            assert.strictEqual(d.citations.length, 1); assert.strictEqual(d.citations[0].person_id, ID.c1); assert.strictEqual(d.citations[0].person_name, 'Paul MAZAUD');
            assert.strictEqual((await api('ro_sources', {q: 'AD Corrèze'})).sources[0].field, 'Auteur');
        });
        let listId;
        await t('serveur : étiqueter et ajouter à Mes listes (+ ↶ Annuler)', async () => {
            const r = await post('ro_people_label', {ids: [ID.c1, ID.c2], label_name: 'Cousins'});
            assert.strictEqual(r.added, 2);
            assert.ok(JSON.stringify(await api('person', {id: ID.c1})).includes('Cousins'));
            await post('ro_undo', {id: r.undo_id});
            const labels = (await api('ro_label_rules')).labels;
            assert.ok(!labels.some(l => l.name === 'Cousins'), 'étiquette créée puis retirée par ↶');
            listId = (await post('save_my_list', {name: 'À voir', source: 'persons', definition: {match: 'all', rules: [], columns: ['name']}})).id;
            const l = await post('ro_people_to_list', {list_id: listId, ids: [ID.c1, ID.c3]});
            assert.strictEqual(l.added, 2, JSON.stringify(l));
            assert.strictEqual(sql(`SELECT group_concat(row_key) FROM (SELECT row_key FROM custom_list_rows WHERE list_id=${listId} AND included=1 ORDER BY row_key)`), [`p:${ID.c1}`, `p:${ID.c3}`].sort().join(','));
            await post('ro_undo', {id: l.undo_id});
            assert.strictEqual(sql(`SELECT count(*) FROM custom_list_rows WHERE list_id=${listId} AND included=1`), '0');
        });
        let digestId;
        await t('serveur : dépouillement supprimé tout de suite, ↶ Annuler le remet avec ses personnes', async () => {
            digestId = (await post('save_archive_digest', {city_name: 'Tulle', year_text: '1898', archive_reference: '3 E 12', record_type: 'naissance', status: 'later', pages_json: JSON.stringify([{number: '4', status: 'checked'}, {number: '5', status: 'checked'}])})).id;
            assert.ok(digestId);
            const person = await post('save_archive_digest_person', {archive_digest_id: digestId, person_mode: 'existing', person_id: ID.c1, page_number: '4'});
            assert.ok(!person.error, person.error);
            const tr = await post('ro_digest_trash', {id: digestId});
            assert.strictEqual(((await api('archive_digest_search', {id: digestId})).rows || []).length, 0);
            await post('ro_undo', {id: tr.undo_id});
            const back = (await api('archive_digest_search', {id: digestId})).rows[0];
            assert.ok(back && back.people.length === 1 && back.pages.length === 2, JSON.stringify(back).slice(0, 300));
        });
        await t('serveur : santé de la base + compacter ; remplacer un lieu (+ ↶)', async () => {
            const h = await api('ro_db_health');
            assert.ok(h.db_size > 0 && h.tables.find(x => x.name === 'persons').rows === 9, JSON.stringify(h).slice(0, 200));
            const v = await post('ro_db_vacuum', {});
            assert.ok(v.before > 0 && v.after > 0, JSON.stringify(v));
            const pv = await api('ro_place_replace_preview', {from: ID.stam, to: ID.stam2});
            assert.ok(pv.total >= 6, JSON.stringify(pv.counts));
            const r = await post('ro_place_replace_apply', {from: ID.stam, to: ID.stam2, delete_from: 1});
            assert.strictEqual(r.count, pv.total); assert.ok(r.deleted);
            assert.strictEqual((await api('ro_place_replace_preview', {from: ID.stam2, to: ID.tulle})).total, pv.total);
            await post('ro_undo', {id: r.undo_id});
            const again = await api('ro_place_replace_preview', {from: ID.stam, to: ID.stam2});
            assert.strictEqual(again.total, pv.total, 'le lieu revient avec ses événements');
        });
        await t('serveur : règle d’étiquette « Poilu » (hommes nés entre 1870 et 1900) + ↶', async () => {
            const pr = await api('ro_label_rule_preview', {criteria: JSON.stringify({gender: 'male', born_from: 1870, born_to: 1900})});
            assert.strictEqual(pr.count, 3, JSON.stringify(pr)); // Pierre 1870, Jean 1875, Paul 1898
            const s = await post('ro_label_rule_save', {name: 'Poilus', label_name: 'Poilu', criteria: {gender: 'male', born_from: 1870, born_to: 1900}});
            const a = await post('ro_label_rule_apply', {id: s.id});
            assert.strictEqual(a.added, 3);
            assert.strictEqual((await post('ro_label_rule_apply', {id: s.id})).added, 0, 'deuxième fois : rien de plus');
            await post('ro_undo', {id: a.undo_id});
            assert.ok(!JSON.stringify(await api('person', {id: ID.f1})).includes('"Poilu"'));
            const del = await post('ro_label_rule_delete', {id: s.id});
            assert.strictEqual((await api('ro_label_rules')).rules.length, 0);
            await post('ro_undo', {id: del.undo_id});
            assert.strictEqual((await api('ro_label_rules')).rules.length, 1);
        });

        /* ═════ écran : Recherche ═════ */
        await t('R2 : les sortes dans une colonne de boutons numérotés ; R1 : en-têtes UI.pageHeader ; ⤓ / 🖨', async () => {
            await goResearch('text');
            const picks = await p.$$eval('#research-form [data-rk-pick]', b => b.map(x => x.dataset.rkPick));
            assert.ok(picks.includes('replace') && picks.includes('kinship') && picks.includes('compare') && picks.includes('sources'), picks.join());
            assert.strictEqual(await p.$eval('#research-form [name=search_kind]', s => s.closest('label').hidden), true, 'le menu déroulant est caché');
            assert.strictEqual(await p.$('#research-form .ui-ph-search, #research-form [aria-label="⌕"]'), null);
            await p.fill('#research-form [name=text_q]', 'MAZAUD');
            await p.click('#research-form button[type=submit]');
            await p.waitForSelector('#workspace .page-header.ui-ph [data-rp-export]');
            assert.ok(await p.$('#workspace [data-rp-bar]'));
            assert.ok((await p.$$('#workspace [data-rp-pick]')).length >= 5);
            // R4 aussi sur les lieux avec joker
            await p.click('#research-form [data-rk-pick="place_name"]');
            await p.fill('#research-form [name=place_name_q]', 'Tul*');
            await p.click('#research-form button[type=submit]');
            await p.waitForSelector('#workspace .page-header.ui-ph [data-rp-print]', {state: 'attached'});
            // … et sur les dates
            await p.click('#research-form [data-rk-pick="dates"]');
            await p.selectOption('#research-form [name=date_mode]', 'range');
            await p.fill('#research-form [name=year_from]', '1890'); await p.fill('#research-form [name=year_to]', '1910');
            await p.click('#research-form button[type=submit]');
            await p.waitForSelector('#workspace .page-header.ui-ph [data-rp-export]', {state: 'attached'});
            assert.match(await p.textContent('#workspace'), /Paul MAZAUD/);
            await p.click('#research-form [data-rk-pick="text"]');
            await p.fill('#research-form [name=text_q]', 'MAZAUD');
            await p.click('#research-form button[type=submit]');
            await p.waitForSelector('#workspace [data-rp-bar]');
        });
        await t('🕘 dernières recherches : gardée, rappelée d’un clic', async () => {
            await p.waitForSelector('#research-form [data-rp-history] [data-rp-hist]', {state: 'attached'});
            assert.match(await p.$eval('[data-rp-history]', e => e.textContent), /MAZAUD/);
            await p.click('#research-form [data-rk-pick="dates"]');
            await p.evaluate(() => { window.LCNDA_APP.state.research.q = ''; });
            await p.$eval('[data-rp-history]', d => { d.open = true; });
            await p.click('[data-rp-hist="0"]');
            await p.waitForFunction(() => /« MAZAUD »/.test(document.querySelector('#workspace h2')?.textContent || ''));
            assert.strictEqual(await p.evaluate(() => window.LCNDA_APP.state.researchKind), 'text');
            const h = await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-research-history')));
            assert.strictEqual(h[0].kind, 'text');
        });
        await t('☑ barre d’actions : 🏷 étiqueter les cochées (+ ↶), ⤓ CSV', async () => {
            await p.waitForSelector('#workspace [data-rp-pick]');
            const ids = await p.$$eval('#workspace [data-rp-pick]', b => b.slice(0, 2).map(x => Number(x.dataset.rpPick)));
            for (const id of ids) await p.check(`#workspace [data-rp-pick="${id}"]`);
            assert.match(await p.textContent('[data-rp-count]'), /2 cochée/);
            await p.click('[data-rp-label]');
            await p.waitForSelector('.ui-actmenu');
            await p.evaluate(() => { window.LCNDA_APP.askText = async () => 'Branche Tulle'; });
            await p.click('.ui-actmenu button:has-text("Nouvelle étiquette")');
            await clickToast(/Branche Tulle/);
            await sleep(400);
            assert.ok(!JSON.stringify(await api('person', {id: ids[0]})).includes('Branche Tulle'), '↶ retire');
            const [dl] = await Promise.all([p.waitForEvent('download'), (async () => { await p.click('#workspace [data-rp-export]'); await p.waitForSelector('dialog.ui-export'); await p.click('dialog.ui-export [data-fmt="csv"]'); await p.click('dialog.ui-export [data-ui-go]'); })()]);
            const csv = fs.readFileSync(await dl.path(), 'utf8');
            assert.ok(/MAZAUD/.test(csv) && csv.trim().split(/\r?\n/).length === 3, csv);
        });
        await t('🔁 chercher et remplacer : aperçu, décocher, Remplacer, ↶ Annuler', async () => {
            await p.click('#research-form [data-rk-pick="replace"]');
            await p.waitForSelector('[data-rp-replace-form]');
            assert.ok(await p.$('#workspace .page-header.ui-ph'), 'R1');
            await p.selectOption('[data-rp-replace-form] [name=field]', 'occupation');
            await p.fill('[data-rp-replace-form] [name=find]', 'cultivatr');
            await p.fill('[data-rp-replace-form] [name=replace]', 'cultivateur');
            await p.check('[data-rp-replace-form] [name=word]');
            await p.click('[data-rp-replace-form] button[type=submit]');
            await p.waitForSelector('[data-rp-rkey]');
            assert.ok(await p.$(`[data-rp-rkey="persons:occupation:${ID.f1}"]:checked`));
            assert.ok(await p.$(`[data-rp-rkey="persons:occupation:${ID.f2}"]:disabled`), 'la fiche verrouillée est grisée');
            assert.ok(await p.$('.rp-before mark'));
            await p.uncheck('[data-rp-rall]');
            assert.strictEqual(await p.$eval('[data-rp-apply]', b => b.disabled), true, 'rien de coché : rien à faire');
            await p.check(`[data-rp-rkey="persons:occupation:${ID.f1}"]`);
            assert.match(await p.textContent('[data-rp-apply]'), /\(1\)/);
            await p.click('[data-rp-apply]');
            await p.waitForFunction(async f1 => (await window.LCNDA_APP.api('person', {id: f1})).person.occupation === 'cultivateur', ID.f1, {timeout: 5000, polling: 300});
            await clickToast(/remplacement/);
            await p.waitForFunction(async f1 => (await window.LCNDA_APP.api('person', {id: f1})).person.occupation === 'cultivatr', ID.f1, {timeout: 5000, polling: 300});
            const h = await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-research-history')));
            assert.ok(h.some(x => x.kind === 'replace' && /cultivatr → cultivateur/.test(x.label)));
        });
        await t('🧬 lien de parenté : cousins germains, barre d’actions', async () => {
            await p.evaluate(id => { window.LCNDA_APP.state.currentPersonId = id; }, ID.c1);
            await p.click('#research-form [data-rk-pick="kinship"]');
            await p.waitForSelector('[data-rp-kin-form]');
            await p.selectOption('[data-rp-kin-form] [name=relation]', 'cousins');
            await p.click('[data-rp-kin-form] button[type=submit]');
            await p.waitForSelector('[data-rp-kin-out] [data-rp-pick]');
            assert.match(await p.textContent('[data-rp-kin-out]'), /Jeanne MAZAUD/);
            assert.match(await p.textContent('[data-rp-kin-out]'), /Louis MAZAUD/);
            assert.ok(await p.$('[data-rp-kin-out] [data-rp-bar] [data-rp-list]'));
        });
        await t('📊 comparer deux recherches ; 🧾 sources et citations', async () => {
            await p.click('#research-form [data-rk-pick="compare"]');
            await p.waitForSelector('[data-rp-cmp-form]');
            await p.selectOption('[data-rp-cmp-form] [name=a]', String(ssA)); await p.selectOption('[data-rp-cmp-form] [name=b]', String(ssB));
            await p.click('[data-rp-cmp-form] button[type=submit]');
            await p.waitForSelector('[data-rp-cmp-out] .rp-results, [data-rp-cmp-out] .empty-state, [data-rp-cmp-out] p');
            assert.match(await p.textContent('[data-rp-cmp-out]'), /Les MAZAUD/);
            await p.click('#research-form [data-rk-pick="sources"]');
            await p.waitForSelector('[data-rp-src-form]');
            await p.fill('[data-rp-src-form] [name=q]', 'folio');
            await p.click('[data-rp-src-form] button[type=submit]');
            await p.waitForSelector('.rp-cit-table');
            assert.match(await p.textContent('.rp-src-table'), /Registre paroissial de Tulle/);
            assert.match(await p.textContent('.rp-cit-table'), /Paul MAZAUD/);
        });
        await t('dépouillement : « En pause » (R9), ⋯ et clic droit (R11), 🗑 tout de suite + ↶ Annuler (R7), page retirée + ↶', async () => {
            await p.click('#research-form [data-rk-pick="archive_digest"]');
            await p.click('#research-form button[type=submit]');
            await p.waitForSelector(`article.archive-digest-row[data-archive-digest-id="${digestId}"]`);
            assert.match(await p.textContent(`article.archive-digest-row[data-archive-digest-id="${digestId}"] .status-badge`), /En pause/);
            assert.ok(await p.$('#workspace .page-header.ui-ph [data-archive-digest-new]'), 'R1 : en-tête commun');
            await p.click(`article.archive-digest-row[data-archive-digest-id="${digestId}"] [data-archive-digest-more]`);
            const items = await p.$$eval('.ui-actmenu .ui-actmenu-i', b => b.map(x => x.textContent.trim()));
            assert.ok(items.some(x => /Modifier/.test(x)) && /Supprimer/.test(items.at(-1)), items.join('|'));
            await p.keyboard.press('Escape');
            await p.click(`article.archive-digest-row[data-archive-digest-id="${digestId}"] > div:first-child`, {button: 'right'});
            await p.waitForSelector('.ui-actmenu');
            assert.deepStrictEqual(await p.$$eval('.ui-actmenu .ui-actmenu-i', b => b.map(x => x.textContent.trim())), items, 'même menu au clic droit');
            await p.keyboard.press('Escape');
            // page retirée + ↶
            await p.click(`[data-archive-digest-page-delete="1"][data-archive-digest-id="${digestId}"]`);
            await p.waitForFunction(id => !document.querySelector(`[data-archive-digest-page-delete="1"][data-archive-digest-id="${id}"]`), digestId);
            await clickToast(/Page retirée/);
            await p.waitForSelector(`[data-archive-digest-page-delete="1"][data-archive-digest-id="${digestId}"]`);
            // 🗑 sans fenêtre
            await p.click(`article.archive-digest-row[data-archive-digest-id="${digestId}"] [data-archive-digest-delete]`);
            await p.waitForFunction(id => !document.querySelector(`article.archive-digest-row[data-archive-digest-id="${id}"]`), digestId);
            assert.strictEqual(await p.$('dialog[open]'), null, 'pas de fenêtre de confirmation');
            await clickToast(/Dépouillement supprimé/);
            await p.waitForSelector(`article.archive-digest-row[data-archive-digest-id="${digestId}"] .archive-digest-person`);
        });

        /* ═════ écran : Réglages ═════ */
        await t('Réglages → 🔎 Ce que j’ai changé : ↺ une ligne, ↺ un groupe, ↶ Annuler', async () => {
            await p.evaluate(() => { localStorage.setItem('genealogie-menu-order', JSON.stringify(['carte', 'personnes'])); localStorage.setItem('genealogie-map-default', '"osm"'); localStorage.setItem('genealogie-research-kind-hidden', JSON.stringify(['web'])); });
            await goMaint('mes_changements');
            await p.waitForSelector('.mc-page [data-mc-row]');
            assert.ok(await p.$('#sidebar [data-side-value="mes_changements"], [data-side-value="mes_changements"]'), 'dans la colonne');
            assert.ok(await p.$('#workspace .page-header.ui-ph'));
            assert.ok(await p.$('[data-mc-reset="genealogie-menu-order"]'));
            await p.click('[data-mc-reset="genealogie-menu-order"]');
            assert.strictEqual(await p.evaluate(() => localStorage.getItem('genealogie-menu-order')), null);
            await clickToast(/remis comme au départ/);
            await p.waitForFunction(() => localStorage.getItem('genealogie-menu-order'));
            const grp = await p.$eval('[data-mc-reset="genealogie-research-kind-hidden"]', b => b.closest('[data-mc-group]').dataset.mcGroup);
            await p.click(`[data-mc-reset-group="${grp}"]`);
            assert.strictEqual(await p.evaluate(() => localStorage.getItem('genealogie-research-kind-hidden')), null);
            assert.ok(await p.evaluate(() => localStorage.getItem('genealogie-menu-order')), 'les autres groupes ne bougent pas');
            await p.fill('[data-mc-find]', 'map default');
            assert.strictEqual(await p.$$eval('[data-mc-row]:not([hidden])', r => r.length), 1, 'R13 : chercher dans cette page');
        });
        await t('Réglages → 🗄 Santé de la base : tailles, lignes, compacter', async () => {
            await goMaint('base_sante');
            await p.waitForSelector('.dbh-page .dbh-table');
            assert.match(await p.textContent('.dbh-table'), /persons/);
            await p.click('[data-dbh-vacuum]');
            await p.waitForFunction(() => [...document.querySelectorAll('.toast')].some(x => /compactée/.test(x.textContent)), null, {timeout: 15000});
        });
        await t('Réglages → Modifications groupées : 🔁 remplacer un lieu (aperçu, ↶) ; en-têtes communs', async () => {
            await goMaint('bulk');
            await p.waitForSelector('[data-pr-form]');
            assert.strictEqual(await p.$$eval('#workspace .page-header', h => h.every(x => x.classList.contains('ui-ph'))), true);
            await p.evaluate(([a, b]) => { window.LCNDA_PICKER.pickerSet(document.querySelector('[data-pr-from] .pk'), a); window.LCNDA_PICKER.pickerSet(document.querySelector('[data-pr-to] .pk'), b); }, [ID.stam, ID.stam2]);
            await sleep(300);
            await p.click('[data-pr-form] button[type=submit]');
            await p.waitForSelector('[data-pr-apply]');
            await p.click('[data-pr-apply]');
            await clickToast(/Lieu remplacé/);
            await sleep(500);
            assert.ok((await api('ro_place_replace_preview', {from: ID.stam, to: ID.stam2})).total >= 6);
        });
        await t('Réglages → Étiquettes : 🏷 règle automatique, ▶ Appliquer, ⋯', async () => {
            await goMaint('labels');
            await p.waitForSelector('[data-lr-panel] .lr-row[data-lr-id]');
            const id = await p.$eval('.lr-row[data-lr-id]', r => r.dataset.lrId);
            await p.click(`[data-lr-apply="${id}"]`);
            await p.waitForFunction(() => [...document.querySelectorAll('.toast')].some(x => /Poilu/.test(x.textContent)), null, {timeout: 8000});
            assert.ok(JSON.stringify(await api('person', {id: ID.f1})).includes('Poilu'));
            await p.waitForSelector(`[data-lr-more="${id}"]`);
            await p.click(`[data-lr-more="${id}"]`);
            assert.deepStrictEqual(await p.$$eval('.ui-actmenu .ui-actmenu-i', b => b.map(x => x.textContent.replace(/^[^\p{L}]+/u, '').trim())), ['Appliquer', 'Modifier', 'Supprimer']);
            await p.keyboard.press('Escape');
        });
        await t('Réglages → type d’événement supprimé tout de suite + ↶ (R7)', async () => {
            const r = await post('save_event_type', {scope: 'person', label: 'Essai MAZAUD', icon: 'diamond', color: '#0066cc'});
            await p.evaluate(() => window.LCNDA_APP.reloadBootstrap?.());
            await goMaint('event_types');
            const sel = '[data-delete-event-type][data-label="Essai MAZAUD"]';
            await p.waitForSelector(sel, {timeout: 10000});
            await p.click(sel);
            await p.waitForFunction(s => !document.querySelector(s), sel);
            assert.strictEqual(await p.$('dialog[open]'), null);
            await clickToast(/Essai MAZAUD/);
            await p.waitForSelector(sel, {timeout: 10000});
            assert.ok(r);
        });

        /* ═════ mode consultation (R6) et téléphone (R12) ═════ */
        await t('R6 : en consultation, pas de Remplacer ni de 🗑, ni de compacter', async () => {
            await p.evaluate(() => document.body.classList.add('is-kiosk'));
            await goResearch('replace');
            await p.waitForSelector('[data-rp-replace-form]');
            await p.click('[data-rp-replace-form] button[type=submit]');
            await p.waitForSelector('[data-rp-rkey]');
            assert.strictEqual(await p.$('[data-rp-apply]'), null);
            await p.click('#research-form [data-rk-pick="archive_digest"]'); await p.click('#research-form button[type=submit]').catch(() => {});
            await p.waitForSelector('article.archive-digest-row');
            assert.strictEqual(await p.isVisible('article.archive-digest-row [data-archive-digest-delete]'), false);
            await goMaint('base_sante'); await p.waitForSelector('.dbh-page');
            assert.strictEqual(await p.$('[data-dbh-vacuum]'), null);
            await p.evaluate(() => document.body.classList.remove('is-kiosk'));
        });
        await t('R12 : à 390 px, rien ne dépasse (Recherche → remplacer, Réglages → Ce que j’ai changé)', async () => {
            const ph = await ctx.newPage(); ph.on('pageerror', e => errs.push(e.message));
            await ph.setViewportSize({width: 390, height: 844});
            await ph.goto(base); await ph.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_PARTS?.renderResearch, null, {timeout: 30000});
            await wire(ph);
            for (const [mod, key, sel] of [['recherche', 'replace', '[data-rp-replace-out] [data-rp-rkey]'], ['maintenance', 'mes_changements', '.mc-page'], ['maintenance', 'base_sante', '.dbh-table']]) {
                await ph.evaluate(async ([m, k]) => { const s = window.LCNDA_APP.state; if (m === 'recherche') s.researchKind = k; else s.maintenanceTab = k; await window.LCNDA_APP.setModule(m); }, [mod, key]);
                if (key === 'replace') { await ph.waitForSelector('[data-rp-replace-form]'); await ph.click('[data-rp-replace-form] button[type=submit]'); }
                await ph.waitForSelector(sel);
                const over = await ph.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
                assert.ok(over <= 1, `${key} : la page dépasse de ${over}px`);
            }
            await ph.close();
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
        await t('mode consultation côté serveur : les écritures « ro_* » sont refusées', async () => {
            const k = await post('kiosk_enter', {password: 'secret-durand'});
            assert.ok(!k.error, k.error);
            const r = await post('ro_replace_apply', {field: 'occupation', find: 'cultivatr', replace: 'x'});
            assert.match(String(r.error || ''), /consultation/i);
            const g = await api('ro_replace_preview', {field: 'occupation', find: 'cultivatr', replace: 'x'});
            assert.ok(!g.error, 'la lecture reste permise');
            await post('kiosk_exit', {password: 'secret-durand'});
        });
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est vert.');
    process.exit(fails ? 1 : 0);
})();
