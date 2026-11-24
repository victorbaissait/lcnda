#!/usr/bin/env node
/* 📚 Recueils depuis Documents (maquette docs/design/documents-lies-recueils.html, partie 3) : « ☑ Choisir plusieurs » →
 * « 📚 Faire un recueil avec ces documents » (l'ordre des clics, un document en plusieurs pages avec toutes ses pages, ↶ Annuler),
 * « 📚 Ajouter à un recueil… », « 📚 Dans le recueil … page N sur M » avec la page d'avant et la suivante, la colonne « 📚 Recueils »,
 * et chercher dans Documents : par recueil, par sorte d'acte (que les naissances), par ville ou à X km autour, entre deux années.
 *   node tests/test-recueils-documents.js */
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
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-recdocs-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Pierre','MAZAUD','male','deceased',1)");
$pdo->exec("INSERT INTO places(id,name,latitude,longitude) VALUES(1,'Sancoins',46.8333,2.9167),(2,'Nérondes',47.0000,2.8167),(3,'Lyon',45.7600,4.8400),(4,'Bourges',NULL,NULL)");
foreach (range(1, 8) as $id) { $im = imagecreatetruecolor(300, 200); imagefill($im, 0, 0, imagecolorallocate($im, 230, 215, 180)); imagepng($im, MEDIA_DIR . "/m$id.png"); }
$m = $pdo->prepare("INSERT INTO media(id,title,filename,thumbnail,media_type,date_text,place_id) VALUES(?,?,?,?,?,?,?)");
foreach ([[1, 'Acte A', 'image', '', null], [2, 'Acte B', 'image', '', null], [3, 'Acte C', 'image', '', null], [4, 'Naissance de Jean DURAND', 'image', '1875', 2],
          [5, 'Lettre du capitaine', 'image', '1813', null], [6, 'Inventaire (PDF)', 'pdf', '', null], [7, 'Contrat, page 1', 'image', '1880', null], [8, 'Contrat, page 2', 'image', '1880', null]] as [$id, $t, $ty, $d, $pl])
    { $m->execute([$id, $t, $ty === 'image' ? "m$id.png" : 'x.pdf', $ty === 'image' ? "m$id.png" : '', $ty, $d, $pl]); }
act_transcriptions_ensure($pdo);
$a = $pdo->prepare("INSERT INTO act_transcriptions(media_id,kind,date_text,place,body) VALUES(?,?,?,?,?)");
$a->execute([1, 'naissance', '3 mars 1870', 'Sancoins', 'Naissance de Louis LACOMBE']); $a->execute([2, 'mariage', '1871', 'Nérondes', 'Mariage']); $a->execute([3, 'naissance', '1870', 'Lyon, Rhône', 'Naissance']);
media_pages_ensure($pdo); $pdo->exec("INSERT INTO media_pages(media_id,set_id,position) VALUES(7,7,1),(8,7,2)");
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const p = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.recueilDocs && window.LCNDA_EXT?.onglets?.documents && window.LCNDA_APP?.state?.csrf, null, {timeout: 30000});
        const api = (a, q = {}) => p.evaluate(([x, y]) => window.LCNDA_APP.api(x, y), [a, q]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);
        const toasts = () => p.evaluate(() => [...document.querySelectorAll('.ui-toast')].map(x => x.textContent).join(' | '));
        let rid = 0;

        await t('côté serveur : un recueil fait de documents, dans l’ordre donné ; un document en 2 pages y entre avec ses 2 pages ; un PDF est laissé de côté', async () => {
            const r = await post('recueil_from_documents', {recueil_id: 0, title: 'Registre de Sancoins', reference: '3 E 12', media_ids: [2, 1, 7, 6]});
            assert.ok(!r.error, r.error); rid = r.id;
            assert.deepEqual([r.created, r.added, r.skipped, r.not_images], [true, 4, 0, 1]);
            const det = await api('recueil', {id: rid});
            const order = det.pages.map(pg => det.images.find(i => i.page_id === pg.id).media_id);
            assert.deepEqual(order, [2, 1, 7, 8]); assert.equal(det.recueil.reference, '3 E 12');
            const pl = (await api('recueil_places', {media_id: 1})).places;
            assert.equal(pl.length, 1); assert.deepEqual([pl[0].num, pl[0].total, pl[0].prev.media_id, pl[0].next.media_id], [2, 4, 2, 7]);
            const p8 = (await api('recueil_places', {media_id: 8})).places[0]; assert.deepEqual([p8.num, p8.next], [4, null]);
            const e = await post('recueil_from_documents', {recueil_id: 0, title: 'Rien', media_ids: [6]}); assert.match(e.error || '', /images/);
        });
        await t('« Ajouter à un recueil » : un document déjà dedans n’est pas remis ; ↶ Annuler retire seulement ce qui a été ajouté', async () => {
            const r = await post('recueil_from_documents', {recueil_id: rid, media_ids: [1, 3]});
            assert.deepEqual([r.created, r.added, r.skipped], [false, 1, 1]);
            assert.equal((await api('recueil', {id: rid})).pages.length, 5);
            const u = await post('recueil_undo_documents', {recueil_id: rid, page_ids: r.page_ids, image_ids: r.image_ids});
            assert.deepEqual([u.removed, u.pages_removed], [1, 1]);
            const det = await api('recueil', {id: rid}); assert.equal(det.pages.length, 4);
            assert.equal((await api('media', {id: 3}).catch(() => ({}))).error, undefined, 'le document reste dans Documents');
        });
        await t('la liste de Documents sait où est chaque document : recueil et page, sortes d’actes, lieux avec leurs coordonnées', async () => {
            const r = await api('onglets', {op: 'documents'});
            const d = id => r.documents.find(x => x.id === id);
            assert.deepEqual(r.recueils.map(x => [x.title, x.pages]), [['Registre de Sancoins', 4]]);
            assert.deepEqual(d(1).recueils, [{id: rid, num: 2}]); assert.deepEqual(d(5).recueils, []);
            assert.deepEqual(d(1).kinds, ['naissance']); assert.equal(d(1).year, 1870, 'l’année de l’acte quand le document n’en a pas');
            assert.deepEqual(d(1).geo.map(g => [g.id, g.name, g.lat]), [[1, 'Sancoins', 46.8333]]);
            assert.deepEqual(d(3).geo.map(g => g.id), [3], '« Lyon, Rhône » écrit dans l’acte : le lieu Lyon');
            assert.deepEqual(d(4).geo.map(g => g.id), [2], 'le lieu du média');
        });

        await p.evaluate(() => { localStorage.setItem('genealogie-menu-documents', '1'); localStorage.setItem('genealogie-menu-hidden', '[]'); location.hash = '#documents'; });
        await p.waitForSelector('#sidebar-content .ong-mode [data-ong-mode]', {timeout: 20000});
        await t('les 4 façons de ranger (A → Z, Par personne, Recueils, Dossiers) tiennent sans être coupées, en 2 × 2', async () => {
            for (const w of [1440, 1100]) {
                await p.setViewportSize({width: w, height: 900}); await sleep(200);
                const r = await p.evaluate(() => [...document.querySelectorAll('#sidebar-content .ong-mode [data-ong-mode]')].map(b => ({t: b.textContent.trim(), cut: b.scrollWidth > b.clientWidth + 1, top: Math.round(b.getBoundingClientRect().top)})));
                assert.deepEqual(r.map(x => x.t), ['A → Z', '👤 Par personne', '📚 Recueils', '📁 Dossiers']);
                assert.ok(r.every(x => !x.cut), `largeur ${w} : un libellé coupé ${JSON.stringify(r)}`);
                assert.equal(new Set(r.map(x => x.top)).size, 2, 'deux rangées');
            }
            await p.setViewportSize({width: 1440, height: 900});
        });
        const shown = () => p.evaluate(() => [...document.querySelectorAll('#sidebar-content .ong-list [data-ong-doc]')].map(b => Number(b.dataset.ongDoc)));
        const withFilters = async (f, q = '') => { await p.evaluate(([ff, qq]) => { localStorage.setItem('lcnda-listbar:onglets:documents', JSON.stringify({q: qq, f: ff, sort: 'az'})); window.LCNDA_APP.renderSidebar(); }, [f, q]); await p.waitForSelector('#sidebar-content .ong-list'); await sleep(300); return shown(); };
        await t('📚 Recueils dans la colonne : chaque recueil (un clic le montre à droite), ses documents dans l’ordre des pages, puis « Dans aucun recueil »', async () => {
            await p.click('#sidebar-content [data-ong-mode="recueils"]'); await p.waitForSelector('#sidebar-content [data-ong-rec]');
            const r = await p.evaluate(() => ({h: [...document.querySelectorAll('#sidebar-content .ong-ph')].map(x => x.textContent.replace(/\s+/g, ' ').trim()),
                rows: [...document.querySelectorAll('#sidebar-content .ong-list [data-ong-doc]')].map(b => b.querySelector('strong').textContent)}));
            assert.match(r.h[0], /📚 Registre de Sancoins\s*4/); assert.match(r.h[1], /Dans aucun recueil/);
            assert.deepEqual(r.rows.slice(0, 4), ['p. 1 Acte B', 'p. 2 Acte A', 'p. 3 Contrat, page 1', 'p. 4 Contrat, page 2']);
        });
        await t('📚 Recueils : « Dans aucun recueil » (et chaque recueil) se masque et se montre, retenu ; aussi dans « ⋯ »', async () => {
            const rows = () => p.evaluate(() => document.querySelectorAll('#sidebar-content .ong-list [data-ong-doc]').length);
            assert.equal(await rows(), 8);
            await p.click('#sidebar-content .ong-fold[data-ong-fold="0"]');
            assert.equal(await rows(), 4, 'les 4 documents hors recueil sont masqués');
            assert.match(await p.evaluate(() => document.querySelector('#sidebar-content .ong-fold[data-ong-fold="0"]').getAttribute('aria-expanded')), /false/);
            await p.evaluate(() => window.LCNDA_APP.renderSidebar()); await p.waitForSelector('#sidebar-content [data-ong-fold="0"]'); await sleep(300);
            assert.equal(await rows(), 4, 'retenu');
            await p.click(`#sidebar-content .ong-fold[data-ong-fold="${rid}"]`); assert.equal(await rows(), 0, 'un recueil se replie aussi');
            await p.click(`#sidebar-content .ong-fold[data-ong-fold="${rid}"]`);
            await p.click('#sidebar-content [data-ong-under]');
            const item = p.locator('.ui-actmenu [role=menuitem]').filter({hasText: 'Montrer « Dans aucun recueil »'}).first();
            await item.click(); await sleep(200);
            assert.equal(await rows(), 8, '« ⋯ » le montre de nouveau');
        });
        await t('📚 Recueils, à droite : les recueils en vignettes (comme Listes → Recueils), un clic → ses documents dans l’ordre des pages', async () => {
            await p.waitForSelector('#workspace [data-ong-reccard]', {timeout: 15000});
            if (process.env.SHOT) { await sleep(800); await p.screenshot({path: process.env.SHOT + '-1.png'}); }
            const cards = await p.evaluate(() => [...document.querySelectorAll('#workspace [data-ong-reccard]')].map(c => c.textContent.replace(/\s+/g, ' ')));
            assert.equal(cards.length, 2, 'le recueil, puis « Dans aucun recueil » : ' + JSON.stringify(cards));
            assert.match(cards[0], /Registre de Sancoins/); assert.match(cards[0], /4 documents/); assert.match(cards[0], /% transcrit/);
            assert.match(cards[1], /Dans aucun recueil/); assert.match(cards[1], /4 documents/);
            await p.click(`#workspace [data-ong-reccard="${rid}"] .ui-card-open`);
            await p.waitForSelector('#workspace [data-ong-recbar]');
            if (process.env.SHOT) await p.screenshot({path: process.env.SHOT + '-2.png'});
            const names = await p.evaluate(() => [...document.querySelectorAll('#workspace [data-ong-card] .ui-card-name')].map(x => x.textContent.trim()));
            assert.deepEqual(names, ['p. 1 · Acte B', 'p. 2 · Acte A', 'p. 3 · Contrat, page 1', 'p. 4 · Contrat, page 2']);
            assert.match(await p.textContent('#workspace [data-ong-recbar]'), /Registre de Sancoins[\s\S]*4 documents/);
            await p.click('#workspace [data-ong-recbar] [data-ong-wsrec=""]');
            await p.waitForSelector('#workspace [data-ong-reccard="none"]');
            await p.click('#workspace [data-ong-reccard="none"] .ui-card-open');
            await p.waitForSelector('#workspace [data-ong-recbar]');
            assert.deepEqual((await p.evaluate(() => [...document.querySelectorAll('#workspace [data-ong-card]')].map(c => Number(c.dataset.ongCard)))).sort(), [3, 4, 5, 6]);
            await p.click(`#sidebar-content [data-ong-rec="${rid}"]`); // la colonne : le titre du recueil le montre à droite
            await p.waitForFunction(() => /Registre de Sancoins/.test(document.querySelector('#workspace [data-ong-recbar]')?.textContent || ''));
            await p.click('#workspace [data-ong-recbar] [data-ong-recopen]');
            await p.waitForFunction(() => window.LCNDA_APP.state.module === 'listes' && /Registre de Sancoins/.test(document.querySelector('#workspace')?.textContent || ''), null, {timeout: 15000});
            await p.evaluate(() => window.LCNDA_APP.setModule('documents')); await p.waitForSelector('#sidebar-content [data-ong-mode]');
            await p.click('#workspace [data-ong-recbar] [data-ong-wsrec=""]').catch(() => {});
        });
        await t('chercher par recueil : son nom dans « Chercher… », et le filtre « Recueil »', async () => {
            await p.click('#sidebar-content [data-ong-mode="az"]');
            assert.deepEqual((await withFilters({}, 'sancoins registre')).sort(), [1, 2, 7, 8]);
            assert.deepEqual((await withFilters({rec: 'out'})).sort(), [3, 4, 5, 6]);
            assert.deepEqual((await withFilters({recname: 'registre'})).sort(), [1, 2, 7, 8]);
        });
        await t('que les naissances (l’Atelier, ou le titre « Naissance de… »), puis les naissances entre deux années', async () => {
            assert.deepEqual((await withFilters({akind: ['naissance']})).sort(), [1, 3, 4]);
            assert.deepEqual((await withFilters({akind: ['naissance'], from: '1870', to: '1870'})).sort(), [1, 3]);
            assert.deepEqual((await withFilters({akind: ['mariage']})), [2]);
        });
        await t('par ville, puis à X km autour : Sancoins seul, Sancoins + 25 km (Nérondes), Lyon loin ; un lieu sans coordonnées le dit', async () => {
            assert.deepEqual(await withFilters({place: {id: 1, title: 'Sancoins'}}), [1]);
            await withFilters({place: {id: 1, title: 'Sancoins'}, km: '25'}); await sleep(600);
            assert.deepEqual((await shown()).sort(), [1, 2, 4]);
            assert.deepEqual((await withFilters({place: {id: 1, title: 'Sancoins'}, km: '25', akind: ['naissance'], from: '1860', to: '1880'})).sort(), [1, 4], 'les naissances à 25 km de Sancoins entre 1860 et 1880');
            await withFilters({place: {id: 4, title: 'Bourges'}, km: '50'}); await sleep(600);
            assert.match(await toasts(), /Bourges.*pas encore de coordonnées/);
            assert.deepEqual(await withFilters({place: 'txt:Lyon'}), [3], 'un lieu écrit à la main');
            await withFilters({});
        });
        await t('à droite : ▦ Vignettes, 🗺 Carte (un rond par lieu, un clic → ses documents), 📅 Frise par décennie ; retenu', async () => {
            await p.click('#workspace [data-ong-wsview="map"]'); await p.waitForSelector('#workspace [data-ong-pin]');
            const pins = await p.$$eval('#workspace [data-ong-pin]', b => b.map(x => [x.title.split(' · ')[0], Number(x.textContent)]).sort());
            assert.deepEqual(pins, [['Lyon', 1], ['Nérondes', 2], ['Sancoins', 1]]);
            assert.match(await p.textContent('#workspace [data-ong-mapside]'), /sans lieu connu/);
            await p.evaluate(() => [...document.querySelectorAll('#workspace [data-ong-pin]')].find(x => /Nérondes/.test(x.title)).click());
            assert.deepEqual((await p.$$eval('#workspace [data-ong-mapside] [data-ong-card]', c => c.map(x => Number(x.dataset.ongCard)))).sort(), [2, 4]);
            await p.click('#workspace [data-ong-wsview="time"]'); await p.waitForSelector('#workspace .ong-tdec');
            const dec = await p.$$eval('#workspace .ong-tdec', s => s.map(x => [x.querySelector('h3 span').textContent, [...x.querySelectorAll('[data-ong-card]')].map(b => Number(b.dataset.ongCard)).sort()]));
            assert.deepEqual(dec, [['1810–1819', [5]], ['1870–1879', [1, 2, 3, 4]], ['1880–1889', [7, 8]]]);
            await p.evaluate(() => window.LCNDA_APP.renderSidebar()); await sleep(300);
            await p.evaluate(() => { window.LCNDA_APP.setModule('documents'); }); await p.waitForSelector('#workspace .ong-tdec', {timeout: 10000});
            await p.click('#workspace [data-ong-wsview="cards"]'); await p.waitForSelector('#workspace [data-ong-card="5"] [data-ong-doc]');
        });
        await t('☑ Choisir plusieurs → « 📚 Faire un recueil avec 2 documents » : l’ordre des clics, ranger ↑ ↓, ↶ Annuler', async () => {
            await p.click('#workspace [data-ong-pick]');
            await p.click('#workspace [data-ong-card="5"] [data-ong-doc]'); await p.click('#workspace [data-ong-card="3"] [data-ong-doc]');
            const n = await p.evaluate(() => ({a: document.querySelector('[data-ong-card="5"] .ong-pickn')?.textContent, b: document.querySelector('[data-ong-card="3"] .ong-pickn')?.textContent, bar: document.querySelector('[data-ong-pickbar]').textContent}));
            assert.deepEqual([n.a, n.b], ['1', '2']); assert.match(n.bar, /2 documents choisis, dans l’ordre des clics/); assert.match(n.bar, /Faire un recueil avec 2 documents/);
            assert.ok(!(await p.evaluate(() => document.querySelector('[data-ong-page="document"]'))), 'en choisissant, la fiche ne s’ouvre pas');
            await p.click('#workspace [data-ong-pick-make]'); await p.waitForSelector('dialog[open] [data-rd-list] .rd-item');
            await sleep(300); assert.ok(await p.evaluate(() => document.querySelectorAll('dialog[open] .rd-item .dnd-grip').length === 2), 'la poignée ⠿ commune'); await p.evaluate(() => document.querySelector('dialog[open] [data-rd-down="0"]').click());
            assert.deepEqual(await p.evaluate(() => [...document.querySelectorAll('dialog[open] .rd-t')].map(x => x.textContent)), ['Acte C', 'Lettre du capitaine']);
            await p.fill('dialog[open] [name=title]', 'Liasse LACOMBE'); await p.click('dialog[open] [type=submit]');
            await p.waitForFunction(() => /Liasse LACOMBE.*fait/.test([...document.querySelectorAll('.ui-toast')].map(x => x.textContent).join(' ')), null, {timeout: 10000});
            const list = (await api('recueils')).recueils; const L = list.find(x => x.title === 'Liasse LACOMBE'); assert.ok(L && L.pages === 2);
            const det = await api('recueil', {id: L.id}); assert.deepEqual(det.pages.map(pg => det.images.find(i => i.page_id === pg.id).media_id), [3, 5]);
            assert.ok(!(await p.evaluate(() => document.querySelector('[data-ong-pickbar]')?.hidden === false)), 'le choix se referme');
            await p.evaluate(() => [...document.querySelectorAll('.ui-toast')].reverse().find(x => /Liasse/.test(x.textContent))?.querySelector('button')?.click());
            await p.waitForFunction(() => /Annulé/.test([...document.querySelectorAll('.ui-toast')].map(x => x.textContent).join(' ')), null, {timeout: 10000});
            assert.ok(!(await api('recueils')).recueils.some(x => x.title === 'Liasse LACOMBE'), '↶ Annuler défait le recueil');
            assert.ok((await api('onglets', {op: 'documents'})).documents.some(x => x.id === 5), 'les documents restent');
        });
        await t('la page du document : « 📚 Dans le recueil … page 2 sur 4 », la page d’avant et la suivante ; ⋯ « Ajouter à un recueil… »', async () => {
            await p.evaluate(() => window.LCNDA_EXT.onglets.documents.select(1));
            await p.waitForSelector('#workspace [data-ong-recueil]:not([hidden]) .rd-place', {timeout: 15000});
            const s = await p.evaluate(() => document.querySelector('#workspace [data-ong-recueil]').textContent.replace(/\s+/g, ' '));
            assert.match(s, /Dans le recueil/); assert.match(s, /Registre de Sancoins/); assert.match(s, /page 2 sur 4/); assert.match(s, /‹ page 1/); assert.match(s, /page 3 ›/);
            await p.click('#workspace [data-ong-recueil] [data-rd-go="7"]');
            await p.waitForFunction(() => /page 3 sur 4/.test(document.querySelector('#workspace [data-ong-page="document"][data-ong-id="7"] [data-ong-recueil]')?.textContent || ''), null, {timeout: 15000});
            await p.evaluate(() => window.LCNDA_EXT.onglets.documents.select(5)); await p.waitForSelector('#workspace [data-ong-page="document"][data-ong-id="5"]');
            assert.ok(await p.evaluate(() => document.querySelector('#workspace [data-ong-recueil]').hidden), 'pas de recueil : rien');
            await p.evaluate(() => document.querySelector('#workspace [data-ong-recadd]').click());
            await p.waitForSelector('dialog[open] [name=rid]'); await p.check(`dialog[open] [name=rid][value="${rid}"]`); await p.click('dialog[open] [type=submit]');
            await p.waitForFunction(() => /page 5 sur 5/.test(document.querySelector('#workspace [data-ong-id="5"] [data-ong-recueil]')?.textContent || ''), null, {timeout: 15000});
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `${fails} essai(s) en échec` : 'Les recueils depuis Documents marchent.');
    process.exit(fails ? 1 : 0);
})();
