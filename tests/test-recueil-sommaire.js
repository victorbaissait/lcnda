#!/usr/bin/env node
/* 📑 Le sommaire d'un recueil : chapitres sur plusieurs niveaux, passages décrits (milieu de page), « ✨ Proposer le découpage »
 * (d'après les actes de l'Atelier), incohérences, ouvrir / fermer (retenu), niveaux, chercher, mode lecture, ↶ Annuler, le chemin du
 * chapitre sur la page et dans Documents, une page supprimée qui resserre le sommaire, une liasse rangée par date.
 *   node tests/test-recueil-sommaire.js */
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

(async () => {
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-somm-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const php = code => spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], {cwd: root, encoding: 'utf8', env});
    // registre : 8 pages ; actes de l'Atelier : p.1-2 baptêmes 1789, p.3 mariage 1789, p.4-5 sépultures 1789, p.6 baptême 1790, p.7 mariage 1790, p.8 rien
    // liasse (Reddition d'Ulm) : 3 pièces dans le désordre (dates 1805-10-20, 1805-10-17, sans date)
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Pierre','MAZAUD','male','deceased',1)");
foreach (range(1, 11) as $id) { $im = imagecreatetruecolor(120, 160); imagefill($im, 0, 0, imagecolorallocate($im, 230, 215, 180)); imagepng($im, MEDIA_DIR . "/m$id.png"); }
$m = $pdo->prepare("INSERT INTO media(id,title,filename,thumbnail,media_type,date_text,document_reference) VALUES(?,?,?,?,'image',?,?)");
foreach (range(1, 8) as $id) { $m->execute([$id, "Registre, vue $id", "m$id.png", "m$id.png", '', '']); }
$m->execute([9, 'Capitulation', 'm9.png', 'm9.png', '20 octobre 1805', 'GR 2 C 12/3']); $m->execute([10, 'Lettre du capitaine LACOMBE', 'm10.png', 'm10.png', '17 octobre 1805', 'GR 2 C 12/1']); $m->execute([11, 'Note sans date', 'm11.png', 'm11.png', '', 'GR 2 C 12/2']);
$r = save_recueil($pdo, ['title' => 'Registre paroissial de Sancoins', 'numbering' => 'page']);
recueil_add_images($pdo, ['recueil_id' => $r['id'], 'version_id' => (int) $pdo->query('SELECT MAX(id) FROM recueil_versions')->fetchColumn(), 'mode' => 'new_pages', 'media_ids' => range(1, 8)]);
$l = save_recueil($pdo, ['title' => 'Reddition d’Ulm', 'numbering' => 'liasse']);
recueil_add_images($pdo, ['recueil_id' => $l['id'], 'version_id' => (int) $pdo->query('SELECT MAX(id) FROM recueil_versions')->fetchColumn(), 'mode' => 'new_pages', 'media_ids' => [9, 10, 11]]);
act_transcriptions_ensure($pdo);
$a = $pdo->prepare("INSERT INTO act_transcriptions(title,kind,media_id,date_text,body) VALUES(?,?,?,?,'texte')");
foreach ([[1, 'bapteme', '1789'], [2, 'bapteme', '3 mars 1789'], [3, 'mariage', '1789'], [4, 'sepulture', '1789'], [5, 'sepulture', '1789'], [6, 'bapteme', '1790'], [7, 'mariage', '1790']] as [$mid, $k, $d]) { $a->execute(["Acte $mid", $k, $mid, $d]); }
$ids = array_map('intval', $pdo->query('SELECT id FROM recueil_pages WHERE recueil_id=' . $r['id'] . ' ORDER BY position')->fetchAll(PDO::FETCH_COLUMN));
$lids = array_map('intval', $pdo->query('SELECT id FROM recueil_pages WHERE recueil_id=' . $l['id'] . ' ORDER BY position')->fetchAll(PDO::FETCH_COLUMN));
echo json_encode(['ok' => 1, 'rid' => $r['id'], 'lid' => $l['id'], 'ids' => $ids, 'lids' => $lids]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const {rid, lid, ids, lids} = JSON.parse(seed.stdout);
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const p = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.recueilSommaire && window.LCNDA_EXT?.openRecueil && window.LCNDA_APP?.state?.csrf, null, {timeout: 30000});
        const api = (a, q = {}) => p.evaluate(([x, y]) => window.LCNDA_APP.api(x, y), [a, q]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);
        const undoLast = re => p.evaluate(r => { const t = [...document.querySelectorAll('.ui-toast')].reverse().find(x => new RegExp(r).test(x.textContent)); t?.querySelector('button')?.click(); return !!t; }, re.source);
        const toc = async () => (await api('recueil_toc', {id: rid})).items;
        const flat = items => items.map(r => `${'  '.repeat(r.level - 1)}${r.title} [${r.from_num}-${r.to_num}]`);

        await t('✨ Proposer le découpage : par année, puis par sorte (d’après l’Atelier) ; rien n’est écrit avant d’accepter', async () => {
            const pr = await api('recueil_toc_propose', {id: rid});
            assert.deepEqual(pr.chapters.map(c => [c.title, c.from_num, c.to_num, c.children.map(k => `${k.title} ${k.from_num}-${k.to_num}`)]), [
                ['Année 1789', 1, 5, ['Baptêmes 1789 1-2', 'Mariages 1789 3-3', 'Sépultures 1789 4-5']], ['Année 1790', 6, 7, ['Baptêmes 1790 6-6', 'Mariages 1790 7-7']]]);
            assert.deepEqual(await toc(), []);
        });
        await t('côté serveur : accepter, un passage du milieu de la page 5 au milieu de la page 6, les refus (passage parent, boucle, page d’un autre recueil), ↶ Annuler', async () => {
            const pr = await api('recueil_toc_propose', {id: rid});
            const acc = await post('recueil_toc_accept', {recueil_id: rid, chapters: pr.chapters}); assert.equal(acc.ids.length, 7);
            const y89 = (await toc()).find(r => r.title === 'Année 1789');
            const el = await post('save_recueil_toc', {recueil_id: rid, kind: 'element', parent_id: y89.id, title: 'Sépulture de Louis LACOMBE', page_from: ids[4], pos_from: 'milieu', page_to: ids[5], pos_to: 'milieu', note: 'Témoins : Jean DURAND'});
            assert.ok(el.id > 0, JSON.stringify(el));
            const items = await toc();
            assert.deepEqual(flat(items), ['Année 1789 [1-5]', '  Baptêmes 1789 [1-2]', '  Mariages 1789 [3-3]', '  Sépultures 1789 [4-5]', '  Sépulture de Louis LACOMBE [5-6]', 'Année 1790 [6-7]', '  Baptêmes 1790 [6-6]', '  Mariages 1790 [7-7]']);
            assert.deepEqual([items[4].kind, items[4].pos_from, items[4].pos_to], ['element', 'milieu', 'milieu']);
            assert.match((await post('save_recueil_toc', {recueil_id: rid, kind: 'chapter', parent_id: el.id, title: 'x', page_from: ids[0]})).error || '', /passage décrit ne peut pas contenir/);
            const bap = items.find(r => r.title === 'Baptêmes 1789');
            assert.match((await post('save_recueil_toc', {id: y89.id, parent_id: bap.id})).error || '', /dans lui-même/);
            assert.match((await post('save_recueil_toc', {recueil_id: rid, title: 'x', page_from: lids[0]})).error || '', /pas dans ce recueil/);
            assert.match((await post('save_recueil_toc', {recueil_id: rid, title: ''})).error || '', /Donne un titre/);
            const del = await post('delete_recueil_toc', {id: y89.id}); assert.equal(del.removed.length, 5, 'le chapitre et ce qu’il contient');
            assert.equal((await toc()).length, 3);
            await post('restore_recueil_toc', {recueil_id: rid, rows: del.removed}); assert.equal((await toc()).length, 8);
        });
        await t('incohérences : deux chapitres qui se chevauchent, un acte d’une autre sorte ou d’une autre année dans un chapitre', async () => {
            const mar = (await toc()).find(r => r.title === 'Mariages 1789');
            await post('save_recueil_toc', {id: mar.id, page_to: ids[3]}); // p. 3-4 : déborde sur les sépultures
            const y90 = (await toc()).find(r => r.title === 'Année 1790');
            await post('save_recueil_toc', {id: y90.id, year_from: 1791, year_to: 1791});
            const w = (await api('recueil_toc', {id: rid})).warnings;
            assert.ok(w.some(x => x.type === 'overlap' && x.a_title === 'Mariages 1789' && x.b_title === 'Sépultures 1789'), JSON.stringify(w));
            assert.ok(w.some(x => x.type === 'kind' && x.page === 4 && x.kind === 'sepulture'), 'une sépulture dans « Mariages »');
            assert.ok(w.some(x => x.type === 'year' && x.year === 1790 && x.title === 'Année 1790'), 'une année hors du chapitre');
            await post('save_recueil_toc', {id: mar.id, page_to: ids[2]}); await post('save_recueil_toc', {id: y90.id, year_from: 1790, year_to: 1790});
            assert.deepEqual((await api('recueil_toc', {id: rid})).warnings, []);
        });

        await p.evaluate(id => { const A = window.LCNDA_APP; A.state.hRecueil = {id, tab: 'sommaire', page: 0, view: 'grid', q: ''}; A.state.listType = 'recueils'; A.setModule('listes'); }, rid);
        await p.waitForSelector('.rs-tree .rs-li', {timeout: 20000});
        const lines = () => p.evaluate(() => [...document.querySelectorAll('.rs-tab .rs-tree > .rs-li')].map(li => li.querySelector('.rs-title').textContent));
        await t('l’onglet « 📑 Sommaire » : l’arbre, les plages, l’avancement ; ▸ ▾ retenus ; Tout fermer / ouvrir ; niveaux ; chercher', async () => {
            const s = await p.evaluate(() => ({rng: [...document.querySelectorAll('.rs-tree .rs-rng')].map(x => x.textContent), prog: document.querySelector('.rs-prog small')?.textContent}));
            assert.deepEqual(s.rng.slice(0, 5), ['p. 1–5', 'p. 1–2', 'p. 3', 'p. 4–5', 'milieu de p. 5 → milieu de p. 6']); assert.equal(s.prog, '0/5');
            assert.equal((await lines()).length, 8);
            await p.click('.rs-tree [data-rs-fold]'); // ferme « Année 1789 »
            assert.deepEqual(await lines(), ['Année 1789', 'Année 1790', 'Baptêmes 1790', 'Mariages 1790']);
            await p.evaluate(id => { const A = window.LCNDA_APP; A.state.hRecueil.tab = 'sommaire'; A.setModule('listes'); }, rid); await p.waitForSelector('.rs-tree .rs-li'); await sleep(300);
            assert.equal((await lines()).length, 4, 'retenu');
            await p.click('[data-rs-all="open"]'); await sleep(200); assert.equal((await lines()).length, 8);
            await p.click('[data-rs-all="shut"]'); await sleep(200); assert.deepEqual(await lines(), ['Année 1789', 'Année 1790']);
            await p.click('[data-rs-all="open"]'); await sleep(200);
            await p.click('[data-rs-level="1"]'); await sleep(200); assert.deepEqual(await lines(), ['Année 1789', 'Année 1790']);
            await p.click('[data-rs-level="all"]'); await sleep(200);
            await p.fill('[data-rs-q]', 'lacombe'); await sleep(500);
            assert.deepEqual(await lines(), ['Année 1789', 'Sépulture de Louis LACOMBE'], 'la ligne trouvée et son chapitre');
            await p.fill('[data-rs-q]', ''); await sleep(500);
        });
        await t('📖 Mode lecture : la description de chaque passage sous son titre ; un clic sur un titre ouvre sa première page', async () => {
            await p.click('[data-rs-read]'); await sleep(200);
            assert.match(await p.evaluate(() => document.querySelector('.rs-tab.is-read .rs-note')?.textContent || ''), /Témoins : Jean DURAND/);
            await p.click('[data-rs-read]'); await sleep(200);
            await p.locator('.rs-title').filter({hasText: 'Mariages 1789'}).click();
            await p.waitForSelector('[data-rc-path] .rs-path', {timeout: 10000});
            assert.match(await p.evaluate(() => document.querySelector('[data-rc-path]').textContent.replace(/\s+/g, ' ')), /📑 Année 1789 › Mariages 1789/);
        });
        await t('＋ Chapitre… (fenêtre) puis ⋯ → Supprimer, ↶ Annuler ; ✨ Proposer (en décochant une ligne) puis ↶ Annuler', async () => {
            await p.evaluate(() => document.querySelector('[data-rc-tab="sommaire"]').click()); await p.waitForSelector('[data-rs-new="chapter"]');
            await p.click('[data-rs-new="chapter"]'); await p.waitForSelector('dialog[open] [name=title]');
            await p.fill('dialog[open] [name=title]', 'Table décennale'); await p.selectOption('dialog[open] [name=page_from]', String(ids[7])); await p.click('dialog[open] [type=submit]');
            await p.waitForFunction(() => [...document.querySelectorAll('.rs-title')].some(x => x.textContent === 'Table décennale'), null, {timeout: 10000});
            const tbl = (await toc()).find(r => r.title === 'Table décennale'); assert.deepEqual([tbl.from_num, tbl.to_num, tbl.level], [8, 8, 1]);
            await p.click(`[data-rs-menu="${tbl.id}"]`); await p.locator('.ui-actmenu [role=menuitem]').filter({hasText: 'Supprimer'}).click();
            await p.waitForFunction(() => ![...document.querySelectorAll('.rs-title')].some(x => x.textContent === 'Table décennale'), null, {timeout: 10000});
            assert.ok(await undoLast(/retiré du sommaire/));
            await p.waitForFunction(() => [...document.querySelectorAll('.rs-title')].some(x => x.textContent === 'Table décennale'), null, {timeout: 10000});
            const n0 = (await toc()).length;
            await p.click('[data-rs-propose]'); await p.waitForSelector('dialog[open] .rs-prop');
            await p.evaluate(() => { const cb = document.querySelector('dialog[open] [data-rs-p="1"]:not([data-rs-pk])'); cb.click(); }); // décoche « Année 1790 » (et ses sorties)
            await p.fill('dialog[open] [data-rs-pt="0"]', 'L’année 1789');
            await p.click('dialog[open] [type=submit]');
            await p.waitForFunction(() => /4 chapitres ajoutés/.test([...document.querySelectorAll('.ui-toast')].map(x => x.textContent).join(' ')), null, {timeout: 10000});
            assert.ok((await toc()).some(r => r.title === 'L’année 1789')); assert.equal((await toc()).length, n0 + 4);
            assert.ok(await undoLast(/chapitres ajoutés/)); await sleep(800);
            assert.equal((await toc()).length, n0);
        });
        await t('le Résumé a « 📑 Sommaire » ; la page du document (Documents) dit « 📑 Année 1789 › Sépultures 1789 »', async () => {
            await p.evaluate(() => document.querySelector('[data-rc-tab="summary"]').click());
            await p.waitForFunction(() => document.querySelector('[data-rs-host] .rs-tree .rs-title'), null, {timeout: 10000});
            assert.ok(await p.evaluate(() => [...document.querySelectorAll('[data-rs-host] .rs-title')].some(x => x.textContent === 'Année 1789')));
            const pl = (await api('recueil_places', {media_id: 5})).places[0]; assert.deepEqual(pl.chapters, ['Année 1789', 'Sépultures 1789']);
            await p.evaluate(() => { localStorage.setItem('genealogie-menu-documents', '1'); localStorage.setItem('genealogie-menu-hidden', '[]'); location.hash = '#documents/5'; });
            await p.waitForFunction(() => /📑 Année 1789 › Sépultures 1789/.test(document.querySelector('#workspace [data-ong-recueil]')?.textContent || ''), null, {timeout: 20000});
        });
        await t('une page supprimée : le sommaire se resserre (« Sépultures 1789 » passe à p. 4–4… puis 4–5 avec la page suivante)', async () => {
            await post('delete_recueil_page', {id: ids[4]});
            const items = await toc(), sep = items.find(r => r.title === 'Sépultures 1789'), el = items.find(r => r.kind === 'element');
            assert.deepEqual([sep.from_num, sep.to_num], [4, 4]); assert.deepEqual([el.from_num, el.to_num], [5, 5], 'le passage commence à la page suivante');
        });
        await t('🗃 une liasse : « Ranger par… » date (acte, sinon document ; sans date à la fin), puis ↶ Annuler', async () => {
            await p.evaluate(id => { const A = window.LCNDA_APP; A.state.hRecueil = {id, tab: 'pages', page: 0, view: 'grid', q: ''}; A.state.listType = 'recueils'; A.setModule('listes'); }, lid);
            await p.waitForSelector('[data-rc-arrange]', {timeout: 20000});
            await p.click('[data-rc-arrange]'); await p.locator('.ui-actmenu [role=menuitem]').filter({hasText: 'Par date'}).click();
            await p.waitForFunction(() => /Pièces rangées/.test([...document.querySelectorAll('.ui-toast')].map(x => x.textContent).join(' ')), null, {timeout: 10000});
            const order = async () => { const d = await api('recueil', {id: lid}); return d.pages.map(pg => d.images.find(i => i.page_id === pg.id).media_id); };
            assert.deepEqual(await order(), [10, 9, 11]);
            assert.match(await p.evaluate(() => document.querySelector('.h-rc-page-name')?.textContent || ''), /Pièce 1/);
            assert.ok(await undoLast(/Pièces rangées/)); await sleep(800);
            assert.deepEqual(await order(), [9, 10, 11]);
            const r = await post('recueil_reorder', {recueil_id: lid, by: 'cote'}); assert.deepEqual(r.order, [lids[1], lids[2], lids[0]]);
            assert.ok(!(await p.evaluate(id => { window.LCNDA_APP.state.hRecueil = {id, tab: 'pages', page: 0}; return false; }, rid)));
        });
        await t('sous-sous-sous-chapitres et ainsi de suite : 6 niveaux, le choix « Niveau 1 · 2 · … · 6 », chaque niveau se replie', async () => {
            let parent = 0; const made = [];
            for (const [i, title] of ['Partie A', 'Livre 1', 'Cahier I', 'Feuillet a', 'Section α', 'Détail ω'].entries()) {
                const r = await post('save_recueil_toc', {recueil_id: lid, parent_id: parent, title, page_from: lids[0], page_to: lids[0]}); assert.ok(r.id > 0, JSON.stringify(r)); made.push(r.id); parent = r.id;
            }
            const items = (await api('recueil_toc', {id: lid})).items;
            assert.deepEqual(items.map(r => [r.title, r.level]), [['Partie A', 1], ['Livre 1', 2], ['Cahier I', 3], ['Feuillet a', 4], ['Section α', 5], ['Détail ω', 6]]);
            await p.evaluate(id => { const A = window.LCNDA_APP; A.state.hRecueil = {id, tab: 'sommaire', page: 0, view: 'grid', q: ''}; A.state.listType = 'recueils'; A.setModule('listes'); }, lid);
            await p.waitForSelector('.rs-tree .rs-li', {timeout: 20000});
            assert.deepEqual(await p.evaluate(() => [...document.querySelectorAll('[data-rs-level]')].map(b => b.textContent)), ['Niveau 1', '2', '3', '4', '5', '6', '+ passages']);
            const shown = () => p.evaluate(() => [...document.querySelectorAll('.rs-tree > .rs-li .rs-title')].map(x => x.textContent));
            assert.equal((await shown()).length, 6);
            await p.click('[data-rs-level="4"]'); await sleep(200); assert.deepEqual(await shown(), ['Partie A', 'Livre 1', 'Cahier I', 'Feuillet a']);
            await p.click('[data-rs-level="all"]'); await sleep(200);
            await p.click(`[data-rs-fold="${made[2]}"]`); await sleep(200); assert.deepEqual(await shown(), ['Partie A', 'Livre 1', 'Cahier I'], 'replier « Cahier I » cache les 3 niveaux dessous');
            await p.click(`[data-rs-fold="${made[2]}"]`); await sleep(200);
            const ind = await p.evaluate(() => [...document.querySelectorAll('.rs-tree > .rs-li')].map(li => parseFloat(getComputedStyle(li).paddingLeft)));
            assert.ok(ind.every((x, i) => !i || x > ind[i - 1]), 'chaque niveau plus en retrait : ' + ind);
            const ead = (await api('recueils_ead')).xml; assert.match(ead, /Partie A.*Livre 1.*Cahier I.*Feuillet a.*Section α.*Détail ω(<\/unittitle>.*?<\/c>){0,1}/s);
            assert.equal((ead.match(/<c /g) || []).length, (ead.match(/<\/c>/g) || []).length, 'EAD : chaque niveau bien fermé');
            await post('recueil_toc_remove', {recueil_id: lid, ids: [made[0]]});
        });
        await t('migration 107 rejouable ; un recueil supprimé emporte son sommaire', async () => {
            const r = php(`require 'lib/bootstrap.php'; $p = db(); schema_v107($p); schema_v107($p); delete_recueil($p, ['id' => ${rid}]); echo $p->query('PRAGMA user_version')->fetchColumn(), ' ', SCHEMA_VERSION, ' ', $p->query('SELECT count(*) FROM recueil_toc')->fetchColumn();`);
            const m = r.stdout.match(/^(\d+) (\d+) 0$/); assert.ok(m && m[1] === m[2] && Number(m[1]) >= 107, r.stdout + r.stderr);
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `${fails} essai(s) en échec` : 'Le sommaire des recueils marche.');
    process.exit(fails ? 1 : 0);
})();
