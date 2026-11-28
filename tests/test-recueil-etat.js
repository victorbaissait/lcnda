#!/usr/bin/env node
/* 🗂 État d'un recueil (maquette docs/design/registres-etat-fonds.html, parties 1 à 3) : l'état de chaque page calculé (Atelier ou
 * texte écrit) ou choisi, la fiabilité déduite (lignes relues, « [?] »), les pages absentes et leur raison (avec les Lacunes d'archives),
 * les trous de numérotation repérés, « 📋 Reste à faire » (demandes), la lisibilité, la photo à refaire, ↶ Annuler partout.
 *   node tests/test-recueil-etat.js */
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
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// l'empreinte d'une ligne, comme l'Atelier (heritage-transcribe-relecture.js)
const lineKey = s => { let h = 0x811c9dc5; for (const ch of String(s).replace(/\s+/g, ' ').trim()) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); };
const ACT = 'L’an mil sept cent quatre-vingt-neuf, le trois mars,\na été baptisé Jean MAZAUD, fils de Pierre MAZAUD\net de Marie DURAND.';

(async () => {
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-etat-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const php = code => spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], {cwd: root, encoding: 'utf8', env});
    // 6 pages : f° 1 r° (acte de l'Atelier relu en entier, état « relue »), f° 1 v° (texte écrit), f° 2 r° (texte avec [?]), f° 2 v° (vide),
    // puis un trou : f° 4 r° (vide), f° 4 v° (pas de photo)
    const keys = JSON.stringify(ACT.split('\n').map(lineKey));
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Pierre','MAZAUD','male','deceased',1)");
foreach (range(1, 5) as $id) { $im = imagecreatetruecolor(200, 260); imagefill($im, 0, 0, imagecolorallocate($im, 230, 215, 180)); imagepng($im, MEDIA_DIR . "/m$id.png"); }
$m = $pdo->prepare("INSERT INTO media(id,title,filename,thumbnail,media_type) VALUES(?,?,?,?,'image')");
foreach (range(1, 5) as $id) { $m->execute([$id, "Registre, vue $id", "m$id.png", "m$id.png"]); }
$r = save_recueil($pdo, ['title' => 'Registre paroissial de Sancoins', 'reference' => '3 E 1234', 'place_text' => 'AD Cher', 'date_text' => '1789-1792', 'numbering' => 'folio', 'expected_pages' => 8]);
recueil_add_images($pdo, ['recueil_id' => $r['id'], 'version_id' => (int) $pdo->query('SELECT id FROM recueil_versions')->fetchColumn(), 'mode' => 'new_pages', 'media_ids' => [1, 2, 3, 4, 5]]);
$ids = array_map('intval', $pdo->query('SELECT id FROM recueil_pages ORDER BY position')->fetchAll(PDO::FETCH_COLUMN));
$labels = ['f° 1 r°', 'f° 1 v°', 'f° 2 r°', 'f° 2 v°', 'f° 4 r°'];
foreach ($ids as $i => $id) { save_recueil_page($pdo, ['id' => $id, 'label' => $labels[$i]]); }
save_recueil_page($pdo, ['id' => $ids[1], 'transcription' => "Le même jour a été inhumé Louis LACOMBE"]);
save_recueil_page($pdo, ['id' => $ids[2], 'transcription' => "Mariage de Pierre [?] et de Anne DURAND"]);
save_recueil_page($pdo, ['recueil_id' => $r['id'], 'after' => $ids[4], 'label' => 'f° 4 v°']);
act_transcriptions_ensure($pdo);
$pdo->prepare("INSERT INTO act_transcriptions(title,kind,media_id,body,data_json) VALUES('Baptême de Jean MAZAUD','bapteme',1,?,?)")->execute([getenv('ACT'), json_encode(['status' => 'checked', 'reviewed' => json_decode(getenv('KEYS'))])]);
echo json_encode(['ok' => 1, 'rid' => $r['id'], 'ids' => $ids]);`], {cwd: root, encoding: 'utf8', env: {...env, ACT, KEYS: keys}});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const {rid, ids} = JSON.parse(seed.stdout);
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const p = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.recueilEtat && window.LCNDA_EXT?.openRecueil && window.LCNDA_APP?.state?.csrf, null, {timeout: 30000});
        const api = (a, q = {}) => p.evaluate(([x, y]) => window.LCNDA_APP.api(x, y), [a, q]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);
        const toasts = () => p.evaluate(() => [...document.querySelectorAll('.ui-toast')].map(x => x.textContent).join(' | '));
        const undoLast = re => p.evaluate(r => { const t = [...document.querySelectorAll('.ui-toast')].reverse().find(x => new RegExp(r).test(x.textContent)); t?.querySelector('button')?.click(); return !!t; }, re.source);
        const page = (d, i) => d.pages.find(x => x.id === ids[i]);

        await t('l’état de chaque page : de l’Atelier (relue, tout relu = sûre), d’un texte écrit (en cours, à relire), « [?] » = doute, rien = à faire', async () => {
            const d = await api('recueil', {id: rid});
            assert.deepEqual([d.recueil.numbering, d.recueil.expected_pages], ['folio', 8]);
            assert.deepEqual(d.pages.map(x => [x.label, x.state, x.reliability]), [['f° 1 r°', 'checked', 'sure'], ['f° 1 v°', 'doing', 'review'], ['f° 2 r°', 'doing', 'doubt'], ['f° 2 v°', 'todo', ''], ['f° 4 r°', 'todo', ''], ['f° 4 v°', 'todo', '']]);
            const a = page(d, 0).act; assert.deepEqual([a.status, a.lines, a.reviewed, a.doubt], ['checked', 3, 3, 0]);
            assert.equal(page(d, 2).doubt, 1); assert.equal(d.pages[5].has_photo, false);
            assert.deepEqual(d.etat, {todo: 3, doing: 2, checked: 1, done: 0, absent: 0, blank: 0, redo: 0, review: 1, doubt: 1, photos: 5});
        });
        await t('côté serveur : marquer absentes (avec une lacune d’archives), puis ↶ Annuler remet tout et retire la lacune ; une page d’un autre recueil est refusée', async () => {
            const r = await post('recueil_pages_set', {recueil_id: rid, page_ids: [ids[3], ids[4]], fields: {absent: 'perdue', absent_note: 'arrachées'}, gap: true});
            assert.ok(r.gap_id > 0 && r.changed === 2, JSON.stringify(r));
            const d = await api('recueil', {id: rid}); assert.deepEqual([page(d, 3).absent, page(d, 3).absent_note, page(d, 4).gap_id], ['perdue', 'arrachées', r.gap_id]); assert.equal(d.etat.absent, 2);
            const gaps = php(`require 'lib/bootstrap.php'; echo json_encode(db()->query('SELECT gap_type, title FROM archive_digest_gaps')->fetchAll(PDO::FETCH_ASSOC), JSON_UNESCAPED_UNICODE);`);
            assert.match(gaps.stdout, /"destroyed".*Registre paroissial de Sancoins : p\. 4-5 \(Perdue ou détruite\)/);
            const u = await post('recueil_pages_restore', {recueil_id: rid, before: r.before, gap_id: r.gap_id}); assert.equal(u.restored, 2);
            const d2 = await api('recueil', {id: rid}); assert.deepEqual([page(d2, 3).absent, page(d2, 4).gap_id], ['', 0]);
            assert.match(php(`require 'lib/bootstrap.php'; echo db()->query('SELECT count(*) FROM archive_digest_gaps')->fetchColumn();`).stdout, /^0$/);
            const e = await post('recueil_pages_set', {recueil_id: rid, page_ids: [99999], fields: {state: 'done'}}); assert.match(e.error || '', /pas dans ce recueil/);
            const e2 = await post('recueil_pages_set', {recueil_id: rid, page_ids: [ids[0]], fields: {state: 'n’importe'}}); assert.ok(!e2.error);
            assert.equal(page(await api('recueil', {id: rid}), 0).state, 'checked', 'un état inconnu = revenir au calcul');
        });
        await t('migration 106 rejouable ; la base est à la version courante', async () => {
            const r = php(`require 'lib/bootstrap.php'; $p = db(); schema_v106($p); schema_v106($p); echo $p->query('PRAGMA user_version')->fetchColumn(), ' ', SCHEMA_VERSION, ' ', $p->query("SELECT count(*) FROM pragma_table_info('recueil_pages') WHERE name IN ('state','absent','absent_note','absent_until','legibility','redo','gap_id')")->fetchColumn();`);
            const m = r.stdout.match(/^(\d+) (\d+) 7$/); assert.ok(m && m[1] === m[2] && Number(m[1]) >= 106, r.stdout + r.stderr);
        });

        await p.evaluate(id => { const A = window.LCNDA_APP; A.state.hRecueil = {id, tab: 'etat', page: 0, view: 'grid', q: ''}; A.state.listType = 'recueils'; A.setModule('listes'); }, rid);
        await p.waitForSelector('.re-tab .re-cell', {timeout: 20000});
        await t('« 🗂 État » : les chiffres, une case par page de la bonne couleur, la fiabilité', async () => {
            const s = await p.evaluate(() => ({cells: [...document.querySelectorAll('.re-tab .re-map .re-cell')].map(c => c.className.replace('re-cell', '').trim()), kpi: document.querySelector('.re-kpis').textContent.replace(/\s+/g, ' '), rel: document.querySelector('.re-rel')?.textContent || '',
                tab: [...document.querySelectorAll('[data-rc-tab]')].map(b => b.textContent.trim().replace(/\s+/g, ' ')).join('|')}));
            assert.match(s.tab, /🗂 État/);
            assert.deepEqual(s.cells, ['s-relue', 's-cours', 's-cours', 's-todo', 's-todo', 's-todo']);
            assert.match(s.kpi, /5 \/ 8/); assert.match(s.kpi, /pas encore transcrites/);
            assert.match(s.rel, /1 page à relire/); assert.match(s.rel, /1 page avec des mots peu sûrs/);
            assert.match(await p.evaluate(() => document.querySelector('.re-cell').title), /f° 1 r° · 🔵 Relue · 3 lignes, 3 relues/);
        });
        await t('trou de numérotation repéré (après f° 2 v° vient f° 4 r°) → « Poser ces pages comme absentes… » : perdues, avec la lacune ; ↶ Annuler', async () => {
            const msg = await p.evaluate(() => [...document.querySelectorAll('.re-msg')].map(x => x.textContent.replace(/\s+/g, ' ')));
            assert.ok(msg.some(x => /Après « f° 2 v° » vient « f° 4 r° » : il manque peut-être f° 3 r°, f° 3 v°/.test(x)), JSON.stringify(msg));
            assert.ok(msg.some(x => /devrait avoir 8 pages, il en a 6/.test(x)), 'pages attendues');
            await p.click('[data-re-hole][data-re-do="insert"]');
            await p.waitForSelector('dialog[open] [name=absent]'); await p.check('dialog[open] [name=absent][value="perdue"]'); await p.fill('dialog[open] [name=absent_note]', 'arrachées');
            await p.click('dialog[open] [type=submit]');
            await p.waitForFunction(() => document.querySelectorAll('.re-tab .re-map .re-cell').length === 8, null, {timeout: 10000});
            const d = await api('recueil', {id: rid});
            assert.deepEqual(d.pages.map(x => x.label), ['f° 1 r°', 'f° 1 v°', 'f° 2 r°', 'f° 2 v°', 'f° 3 r°', 'f° 3 v°', 'f° 4 r°', 'f° 4 v°']);
            assert.deepEqual(d.pages.slice(4, 6).map(x => [x.absent, x.absent_note, x.gap_id > 0]), [['perdue', 'arrachées', true], ['perdue', 'arrachées', true]]);
            assert.ok(!(await p.evaluate(() => [...document.querySelectorAll('.re-msg')].some(x => /Après « f° 2 v° »/.test(x.textContent)))), 'le trou n’est plus signalé');
            assert.ok(await undoLast(/pages absentes posées/));
            await p.waitForFunction(() => document.querySelectorAll('.re-tab .re-map .re-cell').length === 6, null, {timeout: 10000});
            assert.match(php(`require 'lib/bootstrap.php'; echo db()->query('SELECT count(*) FROM archive_digest_gaps')->fetchColumn();`).stdout, /^0$/, 'la lacune part avec');
            await p.click('[data-re-hole][data-re-do="ok"]'); // « C'est normal » : plus signalé (sur cet ordinateur)
            assert.ok(!(await p.evaluate(() => [...document.querySelectorAll('.re-msg')].some(x => /Après « f° 2 v° »/.test(x.textContent)))));
        });
        await t('☑ Choisir des pages (Maj + clic : de… à…) → « Changer l’état… » Finie ; ↶ Annuler', async () => {
            await p.click('[data-re-pick]');
            await p.click(`.re-map [data-re-page="${ids[1]}"]`); await p.click(`.re-map [data-re-page="${ids[2]}"]`, {modifiers: ['Shift']});
            assert.match(await p.evaluate(() => document.querySelector('.re-pickbar').textContent), /2 pages choisies/);
            await p.click('[data-re-act="state"]'); await p.locator('.ui-actmenu [role=menuitem]').filter({hasText: 'Finie'}).click();
            await p.waitForFunction(i => document.querySelector(`.re-map [data-re-page="${i}"]`)?.classList.contains('s-fin'), ids[2], {timeout: 10000});
            const d = await api('recueil', {id: rid}); assert.deepEqual([page(d, 1).state, page(d, 1).state_set, page(d, 2).state], ['done', true, 'done']);
            assert.ok(await undoLast(/2 pages changées/));
            await p.waitForFunction(i => document.querySelector(`.re-map [data-re-page="${i}"]`)?.classList.contains('s-cours'), ids[2], {timeout: 10000});
            assert.equal(page(await api('recueil', {id: rid}), 1).state_set, false);
        });
        await t('« 📋 Ce qui reste » : pages absentes → « 📮 Ajouter aux demandes » (Suivi des registres) ; ↶ Annuler', async () => {
            await post('recueil_pages_set', {recueil_id: rid, page_ids: [ids[4]], fields: {absent: 'en_ligne'}});
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.hRecueil.tab = 'etat'; A.state.hRecueil.page = 0; A.setModule('listes'); }); // relu depuis le serveur
            await p.waitForFunction(() => /Numérisée, pas en ligne/.test(document.querySelector('.re-todo')?.textContent || ''), null, {timeout: 15000});
            const items = await p.evaluate(() => [...document.querySelectorAll('.re-todo li')].map(li => li.textContent.replace(/\s+/g, ' ').trim()));
            assert.match(items[0], /Numérisée, pas en ligne : p\. 5/); assert.ok(items.some(x => /Sans photo : p\. 6/.test(x))); assert.ok(items.some(x => /À relire : p\. 2-3/.test(x))); assert.ok(items.some(x => /À transcrire : p\. 4/.test(x)));
            await p.click('.re-todo [data-re-todo="0"]');
            await p.waitForFunction(() => /Demande ajoutée/.test([...document.querySelectorAll('.ui-toast')].map(x => x.textContent).join(' ')), null, {timeout: 10000});
            const rq = JSON.parse(php(`require 'lib/bootstrap.php'; echo json_encode(db()->query('SELECT request_type, title, archive_reference FROM archive_digest_requests')->fetchAll(PDO::FETCH_ASSOC), JSON_UNESCAPED_UNICODE);`).stdout);
            assert.deepEqual(rq, [{request_type: 'reading_room', title: 'Registre paroissial de Sancoins : p. 5 (Numérisée, pas en ligne)', archive_reference: '3 E 1234'}]);
            assert.ok(await undoLast(/Demande ajoutée/)); await sleep(600);
            assert.match(php(`require 'lib/bootstrap.php'; echo db()->query('SELECT count(*) FROM archive_digest_requests')->fetchColumn();`).stdout, /^0$/);
        });
        await t('sur la page : l’état (choisi, ↺ revenir au calcul), la fiabilité, la lisibilité, la photo à refaire, « Plus absente »', async () => {
            await p.click(`.re-map [data-re-page="${ids[2]}"]`); await p.waitForSelector('[data-rc-etat] .re-page');
            const s = await p.evaluate(() => document.querySelector('[data-rc-etat]').textContent.replace(/\s+/g, ' '));
            assert.match(s, /État du texte/); assert.match(s, /❓ Doute/); assert.match(s, /1 mot peu sûr/); assert.match(s, /Calculé : texte écrit = en cours/);
            await p.click('[data-rc-etat] [data-re-pstate="done"]');
            await p.waitForFunction(() => /Choisi à la main/.test(document.querySelector('[data-rc-etat]')?.textContent || ''), null, {timeout: 10000});
            await p.click('[data-rc-etat] [data-re-pauto]');
            await p.waitForFunction(() => /Calculé/.test(document.querySelector('[data-rc-etat]')?.textContent || ''), null, {timeout: 10000});
            await p.selectOption('[data-rc-etat] [data-re-plegi]', 'difficile'); await p.waitForFunction(() => document.querySelector('[data-rc-etat] [data-re-plegi]')?.value === 'difficile', null, {timeout: 10000}); await sleep(300);
            await p.check('[data-rc-etat] [data-re-predo]'); await p.waitForFunction(() => document.querySelector('[data-rc-etat] [data-re-predo]')?.checked, null, {timeout: 10000}); await sleep(300);
            const d = await api('recueil', {id: rid}); assert.deepEqual([page(d, 2).legibility, page(d, 2).redo, page(d, 2).state_set], ['difficile', 1, false]);
            await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.openRecueil && window.LCNDA_APP?.state?.csrf, null, {timeout: 30000});
            await p.evaluate(([r, pg]) => window.LCNDA_EXT.openRecueil(r, pg), [rid, ids[4]]); await p.waitForSelector('[data-rc-etat] .re-page');
            assert.match(await p.evaluate(() => document.querySelector('[data-rc-etat]').textContent), /Numérisée, pas en ligne/);
            await p.click('[data-rc-etat] [data-re-pback]');
            await p.waitForFunction(() => /État du texte/.test(document.querySelector('[data-rc-etat]')?.textContent || ''), null, {timeout: 10000});
        });
        await t('le Résumé : « 🗂 État des pages » et « 📋 Reste à faire » (par défaut) ; la fenêtre du recueil a la numérotation', async () => {
            await p.evaluate(() => document.querySelector('[data-rc-tab="summary"]').click()); await p.waitForSelector('.h-rc-summary');
            const h = await p.evaluate(() => [...document.querySelectorAll('.h-rc-block h3')].map(x => x.textContent));
            assert.ok(h.includes('🗂 État des pages') && h.includes('📋 Reste à faire'), JSON.stringify(h));
            assert.ok(await p.evaluate(() => document.querySelectorAll('.h-rc-summary .re-map.is-mini .re-cell').length === 6));
            await p.click('[data-rc-edit]'); await p.waitForSelector('dialog[open] [name=numbering]');
            assert.ok(await p.evaluate(() => document.querySelector('dialog[open] [name=numbering][value="folio"]').checked));
            await p.check('dialog[open] [name=numbering][value="liasse"]'); await p.click('dialog[open] [type=submit]'); await sleep(800);
            assert.equal((await api('recueil', {id: rid})).recueil.numbering, 'liasse');
            const w = await p.evaluate(() => window.LCNDA_EXT.recueilEtat.pageWord({recueil: {numbering: 'liasse'}}, {num: 3, label: ''}));
            assert.equal(w, 'Pièce 3');
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `${fails} essai(s) en échec` : 'L’état des recueils marche.');
    process.exit(fails ? 1 : 0);
})();
