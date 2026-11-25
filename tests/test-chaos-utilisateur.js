'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * « Comporte-toi comme un utilisateur qui fait n'importe quoi » : les cas trouvés, rejoués :   node tests/test-chaos-utilisateur.js
 * (famille MAZAUD / LACOMBE / DURAND sur 5 générations, lieux, dates, une note, un portrait ; serveur comme l'app installée :
 *  plusieurs PHP derrière le relais, PhpServer pool 4)
 *   1. ouvrir les fiches pendant qu'un autre onglet travaille : « person » ne répond plus « La base est occupée… »
 *      (une lecture restait ouverte pendant qu'une table se créait : SQLite refusait aussitôt l'écriture) ;
 *   2. Ctrl+Z appuyé deux fois après une suppression : une seule annulation, pas de « rien n'a été annulé » en rouge ;
 *   3. double-clic sur « Garder » (deux naissances) : un seul envoi, pas de « Événements introuvables. » en rouge ;
 *   3b. double-clic sur la pastille « Sans source » d'un lien parent : une seule fenêtre (et un seul dossier de preuve créé) ;
 *   3c. double-clic sur « ＋ Ajouter » / « Tout voir » des blocs presse, récompenses, scolarité : une seule fenêtre ;
 *   4. fiche supprimée dans un autre onglet puis enregistrée ici : message clair (« la fiche a peut-être été supprimée »).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs, PhpServer } = require('../electron/php-server');
const appRoot = path.resolve(__dirname, '..');
const js = f => fs.readFileSync(path.join(appRoot, 'assets/js', f), 'utf8');
const php = f => fs.readFileSync(path.join(appRoot, f), 'utf8');
let failed = 0, count = 0;
const only = process.env.CHAOS_ONLY ? new RegExp(process.env.CHAOS_ONLY) : null; // CHAOS_ONLY=3g : rejouer un seul cas
const t = async (name, fn) => { if (only && !only.test(name)) return; try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const finish = () => { console.log(`\n${count} réussi(s), ${failed} échec(s)`); process.exit(failed ? 1 : 0); };

(async () => {
    await t('statique : person_detail lit tout avant les fonctions qui écrivent ; Ctrl+Z et « Garder » une seule fois ; fiche supprimée', () => {
        const a = php('api.php');
        const body = a.slice(a.indexOf('function person_detail('), a.indexOf('function completion_score('));
        const resp = body.slice(body.lastIndexOf('json_response(['));
        assert.doesNotMatch(resp, /\$[a-zA-Z]+->fetch(All|Column)?\(/, 'aucune lecture laissée ouverte jusqu’à la réponse (heritage_person_data peut créer une table)');
        assert.match(a, /throw new RuntimeException\('Personne introuvable : la fiche a peut-être été supprimée\.'\); \/\/ supprimée dans un autre onglet/);
        const app = js('app.js');
        assert.match(app, /let undoLastBusy=null;\n    function undoLastChange\(\)\{if\(undoLastBusy\)return undoLastBusy;/);
        assert.match(js('heritage-preuve.js'), /function openLink\(childId, parentId\) \{ return once\(/); assert.match(js('heritage-preuve.js'), /function openFor\(q\) \{ return once\(/);
        assert.match(js('heritage-blocs.js'), /BL\.open = \(o = \{\}\) => \{ if \(opening\) return opening;/);
        assert.match(app, /let paKeepBusy=false;\n    async function paKeepEvent\(keepId,others\)\{\n        if\(paKeepBusy\)return;/);
    });

    let pw = null; for (const m of ['playwright', '/opt/node22/lib/node_modules/playwright', '/opt/node-tools/node_modules/playwright']) { try { pw = require(m); break; } catch (_) {} }
    const phpPath = findPhp([devBundledPhp()]);
    if (!phpPath) { console.log('— PHP absent : partie serveur sautée'); return finish(); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-chaos-u-')); fs.mkdirSync(path.join(tmp, 'media'));
    const env = { ...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
    const runPhp = code => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout; };
    // une vraie petite famille : 5 générations, lieux, dates (dont « vers », « avant »), mariages, notes, un portrait
    const ids = JSON.parse(runPhp(String.raw`require 'lib/paths.php'; $p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null; require 'lib/bootstrap.php'; $pdo = db();
        $T = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' ORDER BY id LIMIT 1")->fetchColumn();
        $PL = function ($n, $c) use ($pdo) { $pdo->prepare('INSERT INTO places(name,county,country) VALUES(?,?,?)')->execute([$n, $c, 'France']); return (int) $pdo->lastInsertId(); };
        $tulle = $PL('Tulle', 'Corrèze'); $brive = $PL('Brive-la-Gaillarde', 'Corrèze'); $limoges = $PL('Limoges', 'Haute-Vienne');
        $P = function ($fn, $ln, $g) use ($pdo) { $pdo->prepare('INSERT INTO persons(first_name,last_name,gender,living_status) VALUES(?,?,?,?)')->execute([$fn, $ln, $g, 'deceased']); return (int) $pdo->lastInsertId(); };
        $E = function ($pid, $tag, $text, $year, $pl) use ($pdo, $T) { $pdo->prepare('INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES(?,?,?,?,?,?)')->execute(['person', $pid, $T($tag), $text, $year, $pl]); };
        $F = function ($a, $b, $kids, $mar, $year, $pl) use ($pdo, $T) { $pdo->prepare('INSERT INTO families(partner1_id,partner2_id) VALUES(?,?)')->execute([$a, $b]); $f = (int) $pdo->lastInsertId(); foreach ($kids as $i => $k) $pdo->prepare('INSERT INTO family_children(family_id,child_id,position) VALUES(?,?,?)')->execute([$f, $k, $i]); $pdo->prepare('INSERT INTO events(scope,family_id,event_type_id,date_text,year,place_id) VALUES(?,?,?,?,?,?)')->execute(['family', $f, $T('MARR'), $mar, $year, $pl]); };
        $a = $P('Antoine', 'MAZAUD', 'male'); $E($a, 'BIRT', '12 mars 1790', 1790, $tulle); $E($a, 'DEAT', '4 janvier 1861', 1861, $tulle);
        $b = $P('Marguerite', 'LACOMBE', 'female'); $E($b, 'BIRT', 'vers 1795', 1795, $tulle);
        $c = $P('Jean', 'MAZAUD', 'male'); $E($c, 'BIRT', '3 février 1820', 1820, $tulle); $E($c, 'BIRT', '5 février 1820', 1820, $tulle); // deux naissances : « Garder »
        $d = $P('Marie', 'DURAND', 'female'); $E($d, 'BIRT', '22 octobre 1825', 1825, $brive); $E($d, 'DEAT', 'avant 1900', 1899, $brive);
        $F($a, $b, [$c], '10 mai 1818', 1818, $tulle);
        $e = $P('Pierre', 'MAZAUD', 'male'); $E($e, 'BIRT', '9 septembre 1850', 1850, $brive); $f = $P('Louise', 'LACOMBE', 'female'); $F($c, $d, [$e], '14 février 1848', 1848, $brive);
        $g = $P('Henri', 'MAZAUD', 'male'); $E($g, 'BIRT', '1 janvier 1880', 1880, $limoges); $h = $P('Suzanne', 'DURAND', 'female'); $F($e, $f, [$g], '20 juin 1878', 1878, $limoges);
        $i = $P('Paul', 'MAZAUD', 'male'); $E($i, 'BIRT', '11 novembre 1910', 1910, $limoges); $j = $P('Odette', 'MAZAUD', 'female'); $E($j, 'BIRT', '8 juillet 1912', 1912, $limoges);
        $F($g, $h, [$i, $j], '2 septembre 1908', 1908, $limoges);
        $pdo->prepare('UPDATE persons SET is_start=1 WHERE id=?')->execute([$i]);
        $pdo->prepare('INSERT INTO notes(entity_type,entity_id,title,body) VALUES(?,?,?,?)')->execute(['person', $a, 'Métier', 'Tisserand à Tulle.']);
        $chant = $PL('Chantonnay', 'Vendée'); $pdo->prepare('UPDATE places SET latitude=?, longitude=? WHERE id=?')->execute([46.6833, 1.05, $chant]); // la météorite de 1812 (🌠)
        $k = $P('Jacques', 'BOUTIN', 'male'); $E($k, 'BIRT', '2 avril 1795', 1795, $chant); $E($k, 'DEAT', '7 mai 1860', 1860, $chant);
        file_put_contents(MEDIA_DIR.'/portrait.png', base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='));
        $pdo->exec("INSERT INTO media(source_type,title,media_type,filename) VALUES('local','Portrait d’Henri','image','portrait.png')"); $pdo->prepare('INSERT INTO media_links(media_id,entity_type,entity_id) VALUES(?,?,?)')->execute([(int) $pdo->lastInsertId(), 'person', $g]);
        echo json_encode(['odette' => $j, 'jean' => $c, 'paul' => $i, 'henri' => $g, 'suzanne' => $h, 'jacques' => $k, 'n' => (int) $pdo->query('SELECT count(*) FROM persons')->fetchColumn()]);`));
    const tables = () => JSON.parse(runPhp(String.raw`$p = new PDO('sqlite:'.getenv('GENEALOGY_DATA_DIR').'/genealogy.sqlite'); echo json_encode(['act' => (int) $p->query("SELECT count(*) FROM sqlite_master WHERE name='act_transcriptions'")->fetchColumn()]);`));
    assert.equal(tables().act, 0, 'la table des transcriptions n’existe pas encore (elle se crée à la première lecture d’une fiche)');

    const srv = new PhpServer({ phpPath, appRoot, pool: 4, dataDir: tmp, mediaDir: path.join(tmp, 'media'), sessionDir: path.join(tmp, 'sessions'), logFile: path.join(tmp, 'php.log') });
    srv.on('error', () => {}); await srv.start();
    const base = `http://127.0.0.1:${srv.port}/`, secret = { 'x-carnet-secret': srv.secret };
    let cookie = '';
    { const r = await fetch(base, { headers: secret }); cookie = (r.headers.get('set-cookie') || '').split(';')[0]; await r.text(); }
    const get = async (action, q = '') => { const r = await fetch(`${base}api.php?action=${action}${q}`, { headers: { ...secret, cookie } }); return { status: r.status, text: await r.text() }; };
    try {
        await t('1. fiches ouvertes en même temps qu’un autre onglet : jamais « La base est occupée »', async () => {
            const bad = [];
            for (let round = 0; round < 6; round++) {
                // la table se recrée à chaque tour : c'est pendant sa création qu'une lecture restée ouverte faisait échouer la fiche
                if (round) runPhp(String.raw`$p = new PDO('sqlite:'.getenv('GENEALOGY_DATA_DIR').'/genealogy.sqlite'); $p->exec('PRAGMA busy_timeout=30000'); $p->exec('DROP TABLE IF EXISTS act_transcription_versions'); $p->exec('DROP TABLE IF EXISTS act_transcriptions');`);
                const all = [];
                for (let i = 0; i < 24; i++) {
                    const id = 1 + (i % ids.n);
                    all.push(get('person', `&id=${id}`).then(r => { if (r.status !== 200) bad.push(`${id} → ${r.status} ${r.text.slice(0, 120)}`); }));
                    all.push(get(['dashboard', 'people', 'my_lists', 'act_transcriptions', 'research_journal&person_id=1', 'diagrams&entity_type=person&entity_id=1'][i % 6]));
                }
                await Promise.all(all);
            }
            assert.deepEqual(bad, []);
            assert.equal(tables().act, 1);
        });

        const browser = pw ? await pw.chromium.launch() : null;
        if (!browser) console.log('— navigateur : Playwright absent, partie sautée');
        else try {
            const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, extraHTTPHeaders: secret });
            await ctx.route(u => !u.href.startsWith('http://127.0.0.1'), r => r.abort()); // rien d'Internet
            const open = async (hash) => {
                const page = await ctx.newPage(); page.errs = []; page.toasts = []; page.posts = [];
                page.on('pageerror', e => page.errs.push(e.message));
                page.inflight = 0; page.on('request', () => page.inflight++); for (const ev of ['requestfinished', 'requestfailed']) page.on(ev, () => page.inflight--);
                page.on('request', q => { const m = q.url().match(/action=([a-z_]+)/); if (m && q.method() === 'POST' && m[1] !== 'save_settings') page.posts.push(m[1]); });
                await page.goto(base + hash, { timeout: 180000 }); await page.waitForFunction(() => window.LCNDA_APP?.state?.csrf, null, { timeout: 180000 }); // machine chargée : on attend
                await page.evaluate(() => { const seen = new WeakSet(); new MutationObserver(() => document.querySelectorAll('.ui-toast').forEach(n => { if (seen.has(n)) return; seen.add(n); (window.__toasts ||= []).push((n.classList.contains('error') ? 'ERREUR ' : '') + n.querySelector('.ui-toast-text')?.textContent); })).observe(document.body, { subtree: true, childList: true }); });
                return page;
            };
            const toasts = p => p.evaluate(() => window.__toasts || []);
            // le réseau s'est tu depuis « ms » (rien en cours) : une seconde fenêtre attendait sa réponse du serveur ; machine lente = on attend plus
            const quiet = async (p, ms = 800) => { let since = Date.now(); const end = Date.now() + 90000; while (Date.now() < end) { if (p.inflight > 0) since = Date.now(); else if (Date.now() - since >= ms) return; await p.waitForTimeout(50); } };
            const nOpen = (p, sel) => p.evaluate(s => document.querySelectorAll(s).length, sel);
            const titled = (p, re) => p.evaluate(src => [...document.querySelectorAll('dialog[open]')].filter(d => new RegExp(src).test(d.querySelector('h2')?.textContent || '')).length, re.source);
            const sql = q => JSON.parse(runPhp(`$p = new PDO('sqlite:'.getenv('GENEALOGY_DATA_DIR').'/genealogy.sqlite'); echo json_encode($p->query(${JSON.stringify(q)})->fetchAll(PDO::FETCH_NUM));`));
            const editBtn = '[aria-label="Modifier l’identité"]';

            await t('2. Ctrl+Z deux fois de suite après une suppression : une seule annulation, sans erreur rouge', async () => {
                const page = await open(`#personnes/${ids.odette}`); await page.locator(editBtn).first().waitFor({ timeout: 60000 });
                await page.locator('button[aria-label="Supprimer cette fiche"]').first().click();
                const d = page.locator('dialog[open]').last(); await d.locator('input').fill('SUPPRIMER');
                const gone = page.waitForResponse(r => /action=delete_person/.test(r.url())); await d.getByRole('button', { name: /Supprimer définitivement/ }).click(); await gone;
                await page.waitForFunction(() => !document.querySelector('dialog[open]'));
                assert.deepEqual(sql(`SELECT count(*) FROM persons WHERE id=${ids.odette}`), [[0]]);
                await page.locator('body').click({ position: { x: 700, y: 940 } });
                const undone = page.waitForResponse(r => /action=undo_change/.test(r.url()), { timeout: 60000 });
                await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z');
                await undone;
                await page.waitForFunction(() => (window.__toasts || []).some(x => /↶ Annulé/.test(x)), null, { timeout: 60000 });
                await page.waitForTimeout(800);
                assert.deepEqual(page.posts.filter(x => x === 'undo_change'), ['undo_change'], 'un seul envoi');
                assert.deepEqual((await toasts(page)).filter(x => /^ERREUR/.test(x)), [], 'pas de message rouge');
                assert.deepEqual(sql(`SELECT count(*) FROM persons WHERE first_name='Odette'`), [[1]], 'la fiche revient une fois');
                assert.deepEqual(page.errs, []);
                await page.close();
            });

            await t('3. double-clic sur « Garder » (deux naissances) : un seul envoi, sans « Événements introuvables. »', async () => {
                const page = await open(`#personnes/${ids.jean}`); const keep = page.locator('[data-pa-keep-event]').first(); await keep.waitFor({ timeout: 60000 });
                const kept = page.waitForResponse(r => /action=event_keep_version/.test(r.url()), { timeout: 60000 });
                await keep.dblclick(); await kept;
                await page.waitForFunction(() => (window.__toasts || []).some(x => /Gardé/.test(x)), null, { timeout: 60000 });
                await page.waitForTimeout(800);
                assert.deepEqual(page.posts.filter(x => x === 'event_keep_version'), ['event_keep_version']);
                assert.deepEqual((await toasts(page)).filter(x => /^ERREUR/.test(x)), []);
                const births = sql(`SELECT e.date_text,e.date_alternative FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=${ids.jean} AND t.gedcom_tag='BIRT'`);
                assert.equal(births.length, 1); assert.match(births[0][1], /5 février 1820/);
                await page.close();
            });

            await t('3b. double-clic sur la pastille « Sans source » d’un parent : une seule fenêtre « solidité du lien »', async () => {
                const page = await open(`#personnes/${ids.henri}`); const sol = page.locator('[data-pv-sol]').first(); await sol.waitFor({ timeout: 60000 });
                await sol.dblclick();
                await page.waitForFunction(() => document.querySelector('dialog[open] [data-pv-link]'), null, { timeout: 60000 });
                await page.waitForFunction(() => !document.querySelector('dialog[open] [data-pv-link]')?.textContent.startsWith('…'), null, { timeout: 60000 });
                await page.waitForTimeout(1500); // la seconde fenêtre arrivait après la réponse du serveur
                assert.equal(await page.evaluate(() => document.querySelectorAll('dialog[open] [data-pv-link]').length), 1);
                assert.deepEqual(page.errs, []);
                await page.close();
            });

            await t('3c. double-clic sur « ＋ Ajouter » et « Tout voir » des blocs (presse, récompenses, scolarité) : une seule fenêtre', async () => {
                const page = await open(`#personnes/${ids.henri}`); await page.waitForFunction(() => document.querySelector('[data-bl-new]') && document.querySelector('[data-bl-open]'), null, { timeout: 90000 });
                for (const sel of ['[data-bl-new]', '[data-bl-open]']) {
                    const b = page.locator(sel).first(); await b.scrollIntoViewIfNeeded(); await b.dblclick();
                    await page.waitForFunction(() => document.querySelector('dialog.bl-dlg[open] [data-ar-body]')?.children.length, null, { timeout: 60000 });
                    await page.waitForTimeout(1500); // la seconde fenêtre arrivait après le chargement de la première
                    assert.equal(await page.evaluate(() => document.querySelectorAll('dialog.bl-dlg[open]').length), 1, sel);
                    await page.evaluate(() => document.querySelectorAll('dialog.bl-dlg').forEach(d => { d.close(); d.remove(); }));
                }
                assert.deepEqual(page.errs, []);
                await page.close();
            });

            await t('3d. double-clic sur 📝 « Écrire sur cette personne » : un seul traitement de texte', async () => {
                const page = await open(`#personnes/${ids.henri}`); const b = page.locator('[data-wp-write]').first(); await b.waitFor({ timeout: 60000 });
                await b.dblclick();
                await page.waitForFunction(() => document.querySelector('dialog.wp-dlg[open]'), null, { timeout: 60000 });
                await quiet(page);
                assert.equal(await nOpen(page, 'dialog.wp-dlg[open]'), 1);
                assert.deepEqual(page.errs, []);
                await page.close();
            });

            await t('3e. ✨ « Récit d’une vie » : un clic = la seule fenêtre des choix (pas de diaporama vide derrière) ; double-clic = une seule ; « Créer » = un seul diaporama', async () => {
                const page = await open(`#personnes/${ids.henri}`); const b = page.locator('[data-ss-story-person]').first(); await b.waitFor({ timeout: 60000 });
                await b.click();
                await page.waitForFunction(() => [...document.querySelectorAll('dialog[open] h2')].some(h => /Récit d’une vie/.test(h.textContent)), null, { timeout: 60000 });
                await quiet(page);
                assert.equal(await titled(page, /Récit d’une vie/), 1); assert.equal(await nOpen(page, 'dialog.h-ss-dlg'), 0, 'un simple clic : pas de diaporama vide derrière les choix');
                await page.locator('dialog[open]').last().getByRole('button', { name: 'Annuler' }).click();
                await page.waitForFunction(() => !document.querySelector('dialog[open]'), null, { timeout: 30000 });
                assert.equal(await nOpen(page, 'dialog.h-ss-dlg'), 0, '« Annuler » ne laisse rien');
                await b.dblclick();
                await page.waitForFunction(() => [...document.querySelectorAll('dialog[open] h2')].some(h => /Récit d’une vie/.test(h.textContent)), null, { timeout: 60000 });
                await quiet(page);
                assert.equal(await titled(page, /Récit d’une vie/), 1, 'double-clic : une seule fenêtre des choix'); assert.equal(await nOpen(page, 'dialog.h-ss-dlg'), 0);
                await page.locator('dialog[open]').last().getByRole('button', { name: 'Créer le récit' }).click();
                await page.waitForFunction(() => document.querySelectorAll('dialog.h-ss-dlg[open] [data-ss-slides] .h-ss-item').length, null, { timeout: 90000 });
                await quiet(page);
                assert.equal(await nOpen(page, 'dialog[open]'), 1, 'le diaporama seul'); assert.equal(await nOpen(page, 'dialog.h-ss-dlg'), 1);
                assert.match(await page.locator('dialog.h-ss-dlg [data-ss-name]').inputValue(), /Récit d’une vie — Henri MAZAUD/);
                assert.deepEqual(page.errs, []);
                await page.close();
            });

            await t('3f. 🧭 Ton lien sur la fiche de la mère / du père : « mère », sans « par » elle-même ; « par » reste pour la grand-mère', async () => {
                const page = await open(`#personnes/${ids.suzanne}`);
                const kin = id => page.waitForFunction(i => document.querySelector(`[data-pa-kin-head="${i}"]`)?.textContent.trim(), id, { timeout: 60000 }).then(h => h.jsonValue());
                const mere = await kin(ids.suzanne); assert.match(mere, /mère/); assert.doesNotMatch(mere, /par /, mere);
                await page.evaluate(id => window.LCNDA_APP.openPersonById(id), ids.henri);
                const pere = await kin(ids.henri); assert.match(pere, /père/); assert.doesNotMatch(pere, /par /, pere);
                const r = await page.evaluate(ids => window.LCNDA_APP.api('people_links', { ids: ids.join(','), root: 0 }), [ids.suzanne, ids.henri, ids.jean]);
                assert.deepEqual([r.links[ids.suzanne], r.links[ids.henri]], ['mère', 'père']);
                const pl = await page.evaluate(id => window.LCNDA_APP.api('person_link', { id, root: 0 }), ids.jean);
                assert.equal(pl.link.label, 'arrière-grand-père'); assert.equal(pl.link.via?.name, 'Henri MAZAUD', 'par le père : une vraie information');
                assert.deepEqual(page.errs, []);
                await page.close();
            });

            await t('3g. double-clic sur « ✗ » d’une carte 🌠 (Ce qui le concerne) : une seule carte cachée, une seule fenêtre', async () => {
                const page = await open(`#personnes/${ids.jacques}`);
                const card = page.locator('[data-ts-block] li.ts-sug').filter({ hasText: /1812/ }).filter({ hasText: /Chantonnay/ }).filter({ has: page.locator('.ts-ico', { hasText: '🌠' }) });
                const nope = card.locator('[data-ts-nope]').first(); await nope.waitFor({ timeout: 90000 });
                await quiet(page);
                const before = await page.evaluate(() => document.querySelectorAll('[data-ts-block] li.ts-sug').length), sum = (await card.first().locator('.ts-sum').textContent()).trim();
                await nope.scrollIntoViewIfNeeded(); await nope.dblclick();
                await quiet(page);
                const after = await page.evaluate(() => ({ n: document.querySelectorAll('[data-ts-block] li.ts-sug').length, dlg: document.querySelectorAll('dialog[open]').length, t: (window.__toasts || []).filter(x => /Caché/.test(x)).length, chant: [...document.querySelectorAll('[data-ts-block] li.ts-sug .ts-sum')].map(x => x.textContent.trim()) }));
                after.chant = after.chant.includes(sum) ? sum : false;
                assert.equal(after.chant, false, 'la carte 🌠 est cachée'); assert.equal(after.dlg, 0, 'aucune fenêtre'); assert.equal(after.t, 1, 'une seule « ✗ Caché »'); assert.equal(after.n, before - 1, 'une seule carte en moins');
                assert.deepEqual(page.errs, []);
                await page.close();
            });

            await t('3h. double-clic sur « 🔗 Relier un recueil » (aucun recueil) : une seule question « Aucun recueil »', async () => {
                const page = await open(`#personnes/${ids.henri}`); const b = page.locator('[data-rc-attach]').first(); await b.waitFor({ timeout: 90000 });
                await b.scrollIntoViewIfNeeded(); await b.dblclick();
                await page.waitForFunction(() => [...document.querySelectorAll('dialog[open]')].some(d => /Aucun recueil/.test(d.textContent)), null, { timeout: 60000 });
                await quiet(page);
                assert.equal(await page.evaluate(() => [...document.querySelectorAll('dialog[open]')].filter(d => /Aucun recueil/.test(d.textContent)).length), 1);
                assert.deepEqual(page.errs, []);
                await page.close();
            });

            await t('4. fiche supprimée dans un autre onglet, puis « Enregistrer » ici : message clair, rien de recréé', async () => {
                const A = await open(`#personnes/${ids.paul}`), B = await open(`#personnes/${ids.paul}`);
                for (const p of [A, B]) await p.locator(editBtn).first().waitFor({ timeout: 60000 });
                await B.locator(editBtn).first().click(); await B.locator('#person-form [name=occupation]').fill('instituteur');
                await A.evaluate(id => window.LCNDA_APP.api('delete_person', {}, { method: 'POST', body: { id } }), ids.paul); // l'autre onglet supprime la fiche
                const saved = B.waitForResponse(r => /action=save_person/.test(r.url()), { timeout: 60000 });
                await B.locator('#person-form').getByRole('button', { name: 'Enregistrer' }).click(); assert.equal((await saved).status(), 422);
                await B.waitForFunction(() => (window.__toasts || []).some(x => /supprimée/.test(x)), null, { timeout: 30000 });
                assert.ok((await toasts(B)).some(x => /Personne introuvable : la fiche a peut-être été supprimée\./.test(x)));
                assert.equal(await B.evaluate(() => document.querySelector('#person-dialog').open), true, 'la saisie reste là');
                assert.deepEqual(sql(`SELECT count(*) FROM persons WHERE id=${ids.paul}`), [[0]]);
                await A.close(); await B.close();
            });
        } finally { await browser.close(); }

        await t('5. base intacte à la fin', async () => {
            const r = runPhp(String.raw`$p = new PDO('sqlite:'.getenv('GENEALOGY_DATA_DIR').'/genealogy.sqlite'); echo json_encode([$p->query('PRAGMA integrity_check')->fetchColumn(), $p->query('PRAGMA foreign_key_check')->fetchAll()]);`);
            assert.deepEqual(JSON.parse(r), ['ok', []]);
        });
    } finally { await srv.stop().catch(() => {}); fs.rmSync(tmp, { recursive: true, force: true }); }
    finish();
})().catch(e => { console.error(e); process.exit(1); });
