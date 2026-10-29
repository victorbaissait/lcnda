'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Suite du test « utilisateur qui fait n'importe quoi » :   node tests/test-chaos-suite.js
 *   1. plusieurs généalogies : une image media/… qui ne se charge plus dans une fenêtre restée sur une autre généalogie →
 *      le message unique « … recharge la page » avec « ↻ Recharger » (et rien de plus pour une seule fenêtre) ;
 *   2. pendant un enregistrement lent, « Annuler », × et Échap ne ferment pas la fenêtre ;
 *   3. Traitement de texte : fermer pendant l'enregistrement ne demande pas « Fermer sans enregistrer ? » s'il réussit ;
 *   4. un deuxième « ↶ Annuler » de la même suppression → « Déjà remis » (pas d'erreur rouge) ;
 *   5. Contrôle de la base : bornes à l'envers, date trop longue, « -5 », mariage avec son descendant, animal conjoint ;
 *      même nombre de doublons que « Fusion de doublons » ;
 *   6. GEDCOM « CHAR ANSEL » écrit en Latin-1 → lu en Windows-1252 et dit ; deux @I1@ → avertissement, chacun ses événements ;
 *   7. menu du haut trop long : flèches ‹ › aux bords seulement quand il déborde.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
const appRoot = path.resolve(__dirname, '..');
const js = f => fs.readFileSync(path.join(appRoot, 'assets/js', f), 'utf8');
const php = f => fs.readFileSync(path.join(appRoot, f), 'utf8');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const finish = () => { console.log(`\n${count} réussi(s), ${failed} échec(s)`); process.exit(failed ? 1 : 0); };

(async () => {
    await t('statique : vérification des médias, fenêtre gardée pendant l’enregistrement, Déjà remis, menu qui déborde', () => {
        const a = js('app.js');
        assert.match(a, /document\.addEventListener\('error',e=>\{/); assert.match(a, /api\('kiosk_state'\)/);
        assert.match(a, /const lockClose=\(dlg,on\)=>/); assert.match(a, /origAdd\.call\(document,'cancel'/);
        assert.match(a, /Déjà remis/); assert.match(a, /function navOverflowHint\(nav\)/);
        assert.match(php('api.php'), /'already'=>true\]/);
        assert.match(js('heritage-traitement-texte-fichiers.js'), /if \(this\._saving\) \{ try \{ await this\._saving; \}/);
        const c = php('lib/controle.php');
        for (const k of ["'reversed-range'", "'long-date'", "'negative-date'", "'spouse-ancestor'", "'animal-link'"]) assert.ok(c.includes(k), k);
        assert.ok(Number(c.match(/CONTROLE_VERSION = (\d+)/)[1]) >= 4);
        assert.match(php('lib/gedcom.php'), /function gedcom_ansel_mismatch\(/);
    });

    const phpPath = findPhp([devBundledPhp()]);
    if (!phpPath) { console.log('— PHP absent : partie serveur sautée'); return finish(); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-chaos-suite-')); fs.mkdirSync(path.join(tmp, 'media'));
    const env = { ...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
    const runPhp = code => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout; };
    runPhp(String.raw`require 'lib/paths.php'; $p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null; require 'lib/bootstrap.php'; $pdo = db();
        $T = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' ORDER BY id LIMIT 1")->fetchColumn();
        $P = function ($fn, $ln, $g, $kind = null) use ($pdo) { $pdo->prepare('INSERT INTO persons(first_name,last_name,gender) VALUES(?,?,?)')->execute([$fn, $ln, $g]); $id = (int) $pdo->lastInsertId(); if ($kind) $pdo->prepare('UPDATE persons SET kind=? WHERE id=?')->execute([$kind, $id]); return $id; };
        $E = function ($pid, $tag, $text, $year) use ($pdo, $T) { $pdo->prepare('INSERT INTO events(scope,person_id,event_type_id,date_text,year) VALUES(?,?,?,?,?)')->execute(['person', $pid, $T($tag), $text, $year]); };
        $F = function ($a, $b, $kids = []) use ($pdo) { $pdo->prepare('INSERT INTO families(partner1_id,partner2_id) VALUES(?,?)')->execute([$a ?: null, $b ?: null]); $f = (int) $pdo->lastInsertId(); foreach ($kids as $k) $pdo->prepare('INSERT INTO family_children(family_id,child_id) VALUES(?,?)')->execute([$f, $k]); return $f; };
        $jean = $P('Jean', 'Martin', 'male'); $E($jean, 'BIRT', 'entre 1900 et 1800', 1900);
        $paul = $P('Paul', 'Lefort', 'male'); $E($paul, 'BIRT', '-5', 5);
        $luc = $P('Luc', 'Roux', 'male'); $E($luc, 'BIRT', 'le douze du mois de mars mil huit cent vingt, à dix heures du matin, en la maison de son père, rue Haute', 1820);
        $pierre = $P('Pierre', 'Durand', 'male'); $marie = $P('Marie', 'Lenoir', 'female'); $louis = $P('Louis', 'Durand', 'male'); $rose = $P('Rose', 'Petit', 'female'); $anne = $P('Anne', 'Durand', 'female');
        $F($pierre, $marie, [$louis]); $F($louis, $rose, [$anne]); $F($pierre, $anne);
        $medor = $P('Médor', '', 'male', 'animal'); $F($medor, $jean);
        $j1 = $P('Jacques', 'Bernard', 'male'); $E($j1, 'BIRT', '1 mai 1850', 1850); $j2 = $P('Jacques', 'Bernard', 'male'); $E($j2, 'BIRT', '1 mai 1850', 1850);
        $pdo->prepare('INSERT INTO notes(entity_type,entity_id,title,body) VALUES(?,?,?,?)')->execute(['person', $jean, '', 'Note à supprimer']);
        echo 'ok';`);
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const pp = s.address().port; s.close(() => res(pp)); }); });
    const srv = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    // session + CSRF (comme la page)
    let cookie = '', csrf = '';
    { const r = await fetch(base); cookie = (r.headers.get('set-cookie') || '').split(';')[0]; csrf = JSON.parse(((await r.text()).match(/window\.INSTALL_CSRF = ("[^"]*")/) || [])[1] || '""'); }
    const get = async (action, q = '') => (await fetch(`${base}api.php?action=${action}${q}`, { headers: { Cookie: cookie } })).json();
    const post = async (action, body) => (await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ ...body, csrf }) })).json();

    try {
        await t('5. Contrôle : bornes à l’envers, date trop longue, « -5 », marié(e) à son descendant, animal conjoint', async () => {
            const d = await get('controle');
            const by = c => (d.alerts || []).filter(a => a.check === c);
            assert.equal(by('reversed-range').length, 1, 'entre 1900 et 1800'); assert.equal(by('reversed-range')[0].sort, 'dates');
            assert.equal(by('long-date').length, 1); assert.equal(by('negative-date').length, 1);
            const sa = by('spouse-ancestor'); assert.equal(sa.length, 1); assert.equal(sa[0].level, 'red'); assert.match(sa[0].title, /petite-fille/); assert.equal(sa[0].sort, 'parents');
            const an = by('animal-link'); assert.equal(an.length, 1); assert.match(an[0].title, /Médor/); assert.match(an[0].title, /conjoint/);
        });
        await t('5. doublons : le même nombre dans le Contrôle et dans « Fusion de doublons »', async () => {
            const d = await get('controle'), c = await get('duplicate_candidates');
            const dups = (d.alerts || []).filter(a => a.check === 'duplicate');
            assert.ok(dups.length >= 1); assert.equal(c.candidates.filter(x => !x.animal).length, dups.length);
            assert.ok(c.candidates.every(x => x.score_max === 100 || x.animal));
        });
        await t('4. deux « ↶ Annuler » de la même suppression : le second répond « déjà remis », sans erreur', async () => {
            const id = Number(runPhp(String.raw`require 'lib/bootstrap.php'; echo db()->query("SELECT id FROM notes ORDER BY id DESC LIMIT 1")->fetchColumn();`));
            const del = await post('delete_note', { id }); assert.ok(del.ok, JSON.stringify(del));
            const r1 = await post('restore_last_delete', { entity_type: 'note', entity_id: id }); assert.ok(r1.ok, JSON.stringify(r1)); assert.ok(!r1.result?.already);
            const r2 = await post('restore_last_delete', { entity_type: 'note', entity_id: id }); assert.ok(r2.ok, JSON.stringify(r2)); assert.equal(r2.result.already, true);
        });
        await t('6. GEDCOM « CHAR ANSEL » en Latin-1 → Windows-1252 dans l’analyse ; deux @I1@ → avertissement, chacun ses événements', async () => {
            const ged = Buffer.from('0 HEAD\n1 CHAR ANSEL\n1 GEDC\n2 VERS 5.5.1\n0 @I1@ INDI\n1 NAME Ren\xe9 /LAT\xcfN/\n1 BIRT\n2 DATE 1 JAN 1850\n0 @I1@ INDI\n1 NAME L\xe9a /F\xe9vrier/\n1 BIRT\n2 DATE 3 MAR 1860\n0 TRLR\n', 'latin1');
            const fd = new FormData(); fd.append('file', new Blob([ged]), 'latin.ged'); fd.append('csrf', csrf);
            const v = await (await fetch(`${base}api.php?action=verify_gedcom`, { method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': csrf }, body: fd })).json();
            assert.match(v.encoding, /Windows-1252/); assert.ok(v.warnings.some(w => /annonce « CHAR ANSEL »/.test(w)), JSON.stringify(v.warnings));
            assert.ok(v.warnings.some(w => /2 fiches ont le même identifiant @I1@/.test(w)), JSON.stringify(v.warnings));
            assert.ok(v.import_preview.rows.some(r => r.name === 'René LATÏN'), JSON.stringify(v.import_preview.rows));
            // vrai import (ajouté à la base de test)
            const fd2 = new FormData(); fd2.append('file', new Blob([ged]), 'latin.ged'); fd2.append('csrf', csrf);
            const imp = await (await fetch(`${base}api.php?action=import_package`, { method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': csrf }, body: fd2 })).json();
            assert.ok(!imp.error, JSON.stringify(imp));
            const st = imp.stats || imp.result || imp; const out = {w: st.warnings || imp.warnings || []};
            out.p = JSON.parse(runPhp(String.raw`require 'lib/paths.php'; require 'lib/bootstrap.php'; echo json_encode(db()->query("SELECT p.first_name||' '||p.last_name AS n, (SELECT count(*) FROM events e WHERE e.person_id=p.id) AS ev FROM persons p WHERE p.gedcom_id='I1' ORDER BY p.id")->fetchAll(PDO::FETCH_ASSOC), JSON_UNESCAPED_UNICODE);`).replace(/^[^\[]*/, ''));
            assert.deepEqual(out.p.map(p => p.n), ['René LATÏN', 'Léa Février']); assert.deepEqual(out.p.map(p => Number(p.ev)), [1, 1]);
            assert.ok(out.w.some(w => /annonce « CHAR ANSEL »/.test(w))); assert.ok(out.w.some(w => /2 fiches ont le même identifiant @I1@/.test(w)));
        });
        await t('6. un vrai fichier ANSEL reste lu en ANSEL', () => {
            const out = runPhp(String.raw`require 'lib/paths.php'; require 'lib/bootstrap.php'; require_once 'lib/gedcom.php'; $t = "0 HEAD\n1 CHAR ANSEL\n0 @I1@ INDI\n1 NAME Ren\xE2e /L\xE2eon/\n0 TRLR\n"; echo gedcom_detect_encoding($t), '|', gedcom_text_to_utf8($t);`);
            assert.match(out, /^ANSEL\|/); assert.match(out, /René \/Léon\//);
        });

        let pw = null; for (const m of ['playwright', '/opt/node22/lib/node_modules/playwright', '/opt/node-tools/node_modules/playwright']) { try { pw = require(m); break; } catch (_) {} }
        if (!pw) { console.log('— navigateur : Playwright absent, partie sautée'); return; }
        const browser = await pw.chromium.launch(), errors = [];
        try {
            const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } }), page = await ctx.newPage();
            page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource|409/.test(m.text())) errors.push(m.text()); });
            await page.goto(base); await page.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.openDialog && window.LCNDA_EXT?.openTextDoc);
            await page.waitForTimeout(400);
            const toasts = () => page.evaluate(() => [...document.querySelectorAll('.toast, .h7-toast, [class*="toast"]')].map(x => x.textContent).join(' | '));

            await t('1. une seule fenêtre : une image media/ absente ne montre aucun message de généalogie', async () => {
                const n = await page.evaluate(async () => { let calls = 0; const of = window.fetch; window.fetch = function (u, i) { if (String(u?.url || u).includes('kiosk_state')) calls++; return of.call(this, u, i); }; const img = new Image(); img.src = 'media/nexiste-pas.jpg'; document.body.appendChild(img); await new Promise(r => setTimeout(r, 900)); window.fetch = of; img.remove(); return calls; });
                assert.equal(n, 1, 'un petit appel de vérification'); assert.doesNotMatch(await toasts(), /autre généalogie/);
            });
            await t('1. fenêtre restée sur une autre généalogie : image media/ en 404 → « recharge la page » avec « ↻ Recharger »', async () => {
                await page.evaluate(async () => { window.LCNDA_GENEALOGY = 'autre-genealogie'; const img = new Image(); img.src = 'media/encore-absente.jpg?x=' + Date.now(); document.body.appendChild(img); });
                // la première vérification a eu lieu il y a moins de 30 s : on remet le délai à zéro en rechargeant la page dans cet état
                await page.reload(); await page.waitForFunction(() => window.LCNDA_APP?.state?.csrf);
                await page.evaluate(() => { window.LCNDA_GENEALOGY = 'autre-genealogie'; const img = new Image(); img.src = 'media/encore-absente.jpg'; document.body.appendChild(img); });
                await page.waitForFunction(() => /autre généalogie a été ouverte/.test(document.body.textContent), null, { timeout: 5000 });
                assert.match(await page.evaluate(() => document.body.textContent), /↻ Recharger/);
                await page.reload(); await page.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.openDialog && window.LCNDA_EXT?.openTextDoc); await page.waitForTimeout(300);
            });
            await t('2. enregistrement lent : Annuler, × et Échap ne ferment pas ; la fenêtre se ferme une fois enregistré', async () => {
                await page.evaluate(() => { window.__slowDone = false; window.__dlg = window.LCNDA_EXT.openDialog({title: 'Essai', body: '<label>Nom<input name="n" value="x"></label>', onSubmit: () => new Promise(r => setTimeout(() => { window.__slowDone = true; r(); }, 1500))}); });
                await page.click('dialog[open] [type=submit]'); await page.waitForTimeout(150);
                const st = await page.evaluate(() => { const d = window.__dlg; const c = d.querySelector('.modal-actions [data-h-close]'); return {saving: d.dataset.lcSaving, aria: c.getAttribute('aria-disabled'), cls: c.classList.contains('is-save-locked'), op: getComputedStyle(c).opacity}; });
                assert.equal(st.saving, '1'); assert.equal(st.aria, 'true'); assert.ok(st.cls);
                await page.waitForFunction(() => Number(getComputedStyle(window.__dlg.querySelector('.modal-actions [data-h-close]')).opacity) < 0.5, null, { timeout: 1000 }); // aspect C8
                await page.click('dialog[open] .modal-actions [data-h-close]', {force: true}); await page.click('dialog[open] .modal-head [data-h-close]', {force: true}); await page.keyboard.press('Escape');
                assert.equal(await page.evaluate(() => window.__dlg.open), true, 'toujours ouverte pendant l’enregistrement');
                await page.waitForFunction(() => window.__slowDone && !window.__dlg.isConnected, null, { timeout: 4000 });
                // un échec : les boutons reviennent et Annuler ferme de nouveau
                await page.evaluate(() => { window.__dlg = window.LCNDA_EXT.openDialog({title: 'Essai', body: '<input name="n">', onSubmit: () => new Promise((_, no) => setTimeout(() => no(new Error('Base verrouillée')), 400))}); });
                await page.click('dialog[open] [type=submit]'); await page.waitForTimeout(700);
                assert.equal(await page.evaluate(() => window.__dlg.dataset.lcSaving || ''), '');
                await page.click('dialog[open] .modal-actions [data-h-close]'); assert.equal(await page.evaluate(() => window.__dlg.open), false);
            });
            await t('3. Traitement de texte : fermer pendant l’enregistrement → pas de « Fermer sans enregistrer ? » quand il réussit', async () => {
                await page.route(/action=save_textdoc/, async route => { await new Promise(r => setTimeout(r, 1200)); await route.continue(); });
                await page.evaluate(() => window.LCNDA_EXT.openTextDoc({}));
                await page.waitForSelector('dialog[open] [contenteditable="true"]');
                await page.click('dialog[open] [contenteditable="true"]'); await page.keyboard.type('Bonjour la famille');
                await page.keyboard.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s'); await page.waitForTimeout(150);
                await page.evaluate(() => document.querySelector('dialog[open] [data-wp-cmd="close"]').click()); // × de l'éditeur
                await page.waitForTimeout(300);
                assert.equal(await page.evaluate(() => !!document.querySelector('dialog.confirm-box-dialog[open]')), false, 'pas de question pendant l’enregistrement');
                await page.waitForFunction(() => !document.querySelector('dialog[open] [contenteditable="true"]'), null, { timeout: 5000 });
                assert.equal(await page.evaluate(() => !!document.querySelector('dialog.confirm-box-dialog[open]')), false);
                await page.unroute(/action=save_textdoc/);
            });
            await t('4. dans la page : le deuxième « ↶ Annuler » dit « Déjà remis » (pas de message rouge)', async () => {
                const r = await page.evaluate(async () => { const A = window.LCNDA_APP; const pid = (await A.api('people', {limit: 1}).catch(() => null))?.people?.[0]?.id || 1;
                    const add = await A.api('add_note', {}, {method: 'POST', body: {person_id: pid, body: 'Encore une'}}); const id = add.result.id;
                    await A.api('delete_note', {}, {method: 'POST', body: {id}});
                    A.undoDelete({type: 'note', id, message: 'Note supprimée'}); A.undoDelete({type: 'note', id, message: 'Note supprimée'});
                    const runs = [...document.querySelectorAll('button')].filter(b => /↶ Annuler/.test(b.textContent)).slice(-2);
                    runs[0].click(); await new Promise(r => setTimeout(r, 600)); runs[1].click(); await new Promise(r => setTimeout(r, 600));
                    return document.body.textContent; });
                assert.match(r, /Déjà remis/); assert.doesNotMatch(r, /quinze dernières/);
            });
            await t('7. menu du haut : rien quand il tient ; ‹ › aux bords quand il déborde, et la flèche fait défiler', async () => {
                const vis = () => page.evaluate(() => [...document.querySelectorAll('.nav-ov-hint')].map(h => !h.hidden));
                await page.setViewportSize({ width: 2600, height: 900 }); await page.waitForTimeout(300);
                assert.deepEqual(await vis(), [false, false], 'menu qui tient');
                await page.evaluate(() => { document.querySelectorAll('.main-nav .nav-item').forEach(b => { b.style.display = ''; }); });
                await page.setViewportSize({ width: 900, height: 800 }); await page.waitForTimeout(300);
                const st = await page.evaluate(() => { const n = document.querySelector('.main-nav'); return {over: n.scrollWidth > n.clientWidth}; });
                assert.ok(st.over, 'le menu déborde à 900 px');
                assert.deepEqual(await vis(), [false, true], 'flèche à droite seulement');
                await page.click('.nav-ov-hint.is-right .nav-ov-btn'); await page.waitForTimeout(700);
                assert.ok(await page.evaluate(() => document.querySelector('.main-nav').scrollLeft > 0));
                assert.equal((await vis())[0], true, 'flèche à gauche après le défilement');
                await page.screenshot({ path: path.join(os.tmpdir(), 'chaos-suite-menu.png') });
                await page.setViewportSize({ width: 1440, height: 950 });
            });
            await t('aucune erreur dans la page', () => assert.deepEqual(errors, []));
        } finally { await browser.close(); }
    } finally {
        srv.kill(); fs.rmSync(tmp, { recursive: true, force: true });
    }
    finish();
})().catch(e => { console.error(e); process.exit(1); });
