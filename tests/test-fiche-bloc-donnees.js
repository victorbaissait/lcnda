#!/usr/bin/env node
/* 📒 Fiches → bloc « 📊 Données » : une liste de données (ou une question) dans une fiche, à jour ou figée.
 *   heritage-fiches.js (le bloc), lib/topic_sheets.php (topic_clean_data), app-listes-choix.js + app-inserer.js (📎 « dans une fiche »).
 *  1. Serveur (sans navigateur) : le bloc est nettoyé (clés, années, rayon, vue, adresses http(s) seulement, 500 lignes, 300 Ko) ;
 *     « À jour » ne garde pas de copie ; la colonne « 👪 Dans la famille » d'une copie ne nomme jamais une personne vivante ni une
 *     fiche confidentielle (les morts restent) ;
 *  2. Navigateur (base tests/prendre-depuis-seed.js : noms inventés MAZAUD, LACOMBE, DURAND ; une liste FABRIQUÉE « Batailles
 *     inventées » enregistrée dans le moteur des listes) : « ＋ Ajouter un bloc » propose 📊 Données ; la liste se choisit par thème
 *     (⚔️ Guerres et soldats), colonnes, période, autour du sujet de la fiche (« Tulle »), au plus N lignes ; chaque ligne a son ↗ source,
 *     le pied dit source + licence ; ↶ Annuler ; une question (« 🔎 Comprendre », clavier : Entrée) remplit les réglages et montre
 *     « Ce que j'ai compris » ; 📌 Figé (copie datée gardée par le serveur, qui reste quand la liste n'est plus là) ; « 📌 Figer
 *     maintenant » + ↶ ; liste compacte, frise, carte ; ⤓ Markdown / page web et 🖨 Imprimer contiennent le tableau et ses sources ;
 *     mode consultation : rien à modifier ; 📎 depuis une liste (☑ lignes choisies → « Insérer… » → « Dans une fiche → nouveau bloc
 *     Données (figé) ») + ↶ ; à 390 px en sombre : rien ne déborde, rien de collé ; aucune erreur.
 *   node tests/test-fiche-bloc-donnees.js        (FICHE_SHOT=fichier.png : une capture de la fenêtre et de la fiche)
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawnSync} = require('child_process');
const {findPhp, devBundledPhp, phpRuntimeArgs} = require('../electron/php-server');
const {start, sleep} = require('./prendre-depuis-seed.js');
const {detect} = require('./test-rien-de-colle.js');

const root = path.resolve(__dirname, '..');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };

/* ═════════ 1. le serveur ═════════ */
(async () => {
    await t('serveur : bloc nettoyé, adresses http(s) seulement, 500 lignes / 300 Ko, « À jour » sans copie, « Dans la famille » sans vivant', async () => {
        const php = findPhp([devBundledPhp()]) || 'php';
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-fiche-donnees-'));
        const env = {...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
        fs.mkdirSync(path.join(dir, 'media'), {recursive: true});
        const r = spawnSync(php, [...phpRuntimeArgs(php), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php';
$pdo = db();
$ins = $pdo->prepare("INSERT INTO persons(first_name,last_name,gender,living_status,is_private) VALUES(?,?,?,?,?)");
$ins->execute(['Paul', 'MAZAUD', 'male', 'living', 0]); $ins->execute(['Louise', 'LACOMBE', 'female', 'deceased', 1]); $ins->execute(['Jean', 'DURAND', 'male', 'deceased', 0]);
$rows = []; for ($i = 0; $i < 700; $i++) { $rows[] = ['c' => ['Bataille ' . $i, str_repeat('x', 500), $i % 3 === 0 ? 'Paul MAZAUD, 40 ans' : ($i % 3 === 1 ? 'Louise LACOMBE +1' : 'Jean DURAND, 29 ans')], 's' => 'Jeu', 'u' => $i ? 'https://example.org/b' . $i : 'javascript:alert(1)', 'g' => [45.2, 1.7], 'y' => 1800 + $i]; }
$b = ['id' => 'b_test1', 'type' => 'data', 'mode' => 'frozen', 'list' => 'reunie_batailles', 'from' => '1800', 'to' => 'x', 'near' => 'place', 'center' => ['lat' => 45.27, 'lon' => 1.77, 'title' => 'Tulle'],
    'km' => 99999, 'cols' => ['nom', '<b>', 'annee'], 'limit' => 9999, 'sort' => 'annee; DROP', 'dir' => 'desc', 'view' => 'évier', 'evil' => 1,
    'snap' => ['at' => '2026-11-26', 'label' => 'Batailles', 'source' => 'Jeu', 'sourceUrl' => 'javascript:x', 'licence' => 'CC0', 'total' => 700, 'cols' => [['k' => 'nom', 'l' => 'Nom'], ['k' => 'long', 'l' => 'Long'], ['k' => '_fam', 'l' => 'Dans la famille']], 'rows' => $rows]];
$o = topic_clean_block($b);
$live = topic_clean_block(['type' => 'data', 'mode' => 'live', 'list' => 'x', 'snap' => ['rows' => [['c' => ['a']]]], 'near' => 'place']);
$fams = array_count_values(array_map(fn($r) => $r['c'][2], $o['snap']['rows']));
echo json_encode(['o' => array_diff_key($o, ['snap' => 1]), 'n' => count($o['snap']['rows']), 'bytes' => strlen(json_encode($o['snap'], JSON_UNESCAPED_UNICODE)), 'u0' => $o['snap']['rows'][0]['u'], 'u1' => $o['snap']['rows'][1]['u'], 'su' => $o['snap']['sourceUrl'],
    'cell' => mb_strlen($o['snap']['rows'][0]['c'][1]), 'fams' => $fams, 'live' => $live, 'types' => in_array('data', TOPIC_BLOCK_TYPES, true)]);`], {cwd: root, encoding: 'utf8', env});
        fs.rmSync(dir, {recursive: true, force: true});
        assert.strictEqual(r.status, 0, r.stderr || r.stdout);
        const j = JSON.parse(r.stdout.trim().split('\n').pop());
        assert.ok(j.types);
        assert.deepStrictEqual([j.o.mode, j.o.list, j.o.from, j.o.to, j.o.near, j.o.km, j.o.limit, j.o.sort, j.o.dir, j.o.view], ['frozen', 'reunie_batailles', 1800, null, 'place', 2000, 500, '', 'desc', 'table']);
        assert.deepStrictEqual(j.o.cols, ['nom', 'annee'], 'une clé de colonne étrange est retirée'); assert.strictEqual(j.o.evil, undefined, 'ce qui n’est pas prévu est laissé de côté');
        assert.ok(j.n <= 500 && j.n > 100, `lignes : ${j.n}`); assert.ok(j.bytes <= 300000, `${j.bytes} octets`);
        assert.strictEqual(j.u0, '', 'javascript: refusé'); assert.strictEqual(j.u1, 'https://example.org/b1'); assert.strictEqual(j.su, '');
        assert.strictEqual(j.cell, 400, 'une case : 400 caractères au plus');
        assert.ok(!Object.keys(j.fams).some(k => /Paul MAZAUD|Louise LACOMBE/.test(k)), 'ni vivant ni fiche confidentielle : ' + JSON.stringify(j.fams));
        assert.ok(j.fams['—'] > 0 && j.fams['Jean DURAND, 29 ans'] > 0, 'les morts restent : ' + JSON.stringify(j.fams));
        assert.strictEqual(j.live.snap, undefined, '« À jour » : pas de copie'); assert.strictEqual(j.live.near, '', 'autour d’un lieu sans lieu : partout');
    });

    /* ═════════ 2. le navigateur ═════════ */
    const B = await start();
    const p = B.page;
    const post = (a, b) => p.evaluate(async ([x, y]) => { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result ?? r; }, [a, b]);
    const sheet = async id => p.evaluate(i => window.LCNDA_APP.api('topic_sheet', {id: i}), id);
    const openSheet = async (id, editing = false) => { await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => { d.dataset.ownClose = '1'; delete d.dataset.dirty; d.close(); })); await p.evaluate(i => { const A = window.LCNDA_APP; A.state.ficheId = i; A.setModule('fiches'); }, id); await p.waitForSelector('#workspace .h-fi-grid', {timeout: 20000}); if (editing !== await p.evaluate(() => !!document.querySelector('#workspace .h-fi.is-editing'))) { await p.click('[data-fi-mode]'); await p.waitForSelector(editing ? '.h-fi.is-editing' : '.h-fi:not(.is-editing)'); } };
    const clickUndo = async () => { const u = p.locator('.toast.undo .ui-toast-btn').last(); await u.waitFor({timeout: 8000}); await u.click(); await sleep(800); };
    const shot = process.env.FICHE_SHOT || '';
    let dialogPng = null;
    try {
        // une liste FABRIQUÉE : 6 batailles autour de Tulle et ailleurs, chacune avec sa fiche ↗ (thème ⚔️ Guerres et soldats)
        await p.evaluate(() => {
            const rows = [
                {nom: 'Bataille du Pont de Tulle', annee: 1814, lieu: 'Tulle', morts: 120, lat: 45.27, lon: 1.77, u: 'https://example.org/bataille/1'},
                {nom: 'Combat de Naves', annee: 1832, lieu: 'Naves', morts: 12, lat: 45.31, lon: 1.77, u: 'https://example.org/bataille/2'},
                {nom: 'Escarmouche de Treignac', annee: 1795, lieu: 'Treignac', morts: 3, lat: 45.54, lon: 1.80, u: 'https://example.org/bataille/3'},
                {nom: 'Siège de Chamberet', annee: 1870, lieu: 'Chamberet', morts: 40, lat: 45.58, lon: 1.72, u: ''},
                {nom: 'Bataille d’Auch', annee: 1850, lieu: 'Auch', morts: 70, lat: 43.65, lon: 0.59, u: 'https://example.org/bataille/5'},
                {nom: 'Bataille ancienne de Tulle', annee: 1650, lieu: 'Tulle', morts: 9, lat: 45.27, lon: 1.77, u: 'https://example.org/bataille/6'}];
            window.LCNDA_EXT.dataLists.push({id: 'test_batailles', icon: '⚔️', label: 'Batailles inventées', group: 'Le monde', theme: 'guerres', source: 'Jeu d’essai (CC0)', sourceUrl: 'https://example.org/',
                fields: [{key: 'nom', label: 'Bataille'}, {key: 'annee', label: 'Année', type: 'year'}, {key: 'lieu', label: 'Lieu', type: 'place'}, {key: 'morts', label: 'Morts', type: 'number'}, {key: 'u', label: 'Fiche', type: 'url'}],
                load: async () => rows, period: r => [r.annee, r.annee], geo: r => [r.lat, r.lon], familyColumn: true});
        });
        await sleep(300);
        const id = (await post('save_topic_sheet', {title: 'Tulle', icon: '🏘️', subtitle: 'La ville et ses batailles', blocks: [{type: 'text', title: 'En bref', text: 'Tulle, préfecture de la Corrèze.', width: '12'}]})).id;

        await t('« ＋ Ajouter un bloc » propose 📊 Données (avec sa phrase) ; les listes se choisissent par thème, listes réunies comprises', async () => {
            await openSheet(id, true);
            await p.click('.h-fi-addrow [data-fi-add]');
            await p.waitForSelector('dialog[open] input[name="kind"][value="data"]');
            const lab = await p.textContent('dialog[open] label:has(input[value="data"])');
            assert.match(lab, /📊/); assert.match(lab, /Données/); assert.match(lab, /séismes, batailles, Tour de France… avec filtres, ou une question/);
            await p.check('dialog[open] input[name="kind"][value="data"]');
            if (shot) dialogPng = await p.locator('dialog[open]').screenshot();
            await p.click('dialog[open] button[type="submit"]');
            await p.waitForSelector('[data-fi-new] [data-fi-dbox] select[name="list"]', {timeout: 10000});
            const g = await p.evaluate(() => { const s = document.querySelector('[data-fi-dbox] select[name="list"]'), og = [...s.querySelectorAll('optgroup')];
                return {groups: og.map(x => x.label), mine: og.find(x => [...x.children].some(o => o.value === 'test_batailles'))?.label, merged: [...s.options].some(o => o.value.startsWith('reunie_') && o.textContent.startsWith('🔀'))}; });
            assert.ok(g.groups.length >= 10, g.groups.join(' | ')); assert.match(g.mine, /Guerres et soldats/); assert.ok(g.merged, 'les listes réunies (🔀) sont proposées');
        });
        await t('réglages : liste, colonnes, période, autour du sujet de la fiche, 3 lignes ; chaque ligne a son ↗ source ; pied source + licence ; ↶ Annuler', async () => {
            await p.fill('[data-fi-dbox] [data-fi-dfind]', 'inventées');
            assert.strictEqual(await p.evaluate(() => [...document.querySelectorAll('[data-fi-dbox] select[name="list"] option')].filter(o => o.value && !o.hidden).map(o => o.value).join()), 'test_batailles', 'chercher une liste');
            await p.selectOption('[data-fi-dbox] select[name="list"]', 'test_batailles');
            await p.waitForSelector('[data-fi-dcols] input[value="morts"]');
            await p.uncheck('[data-fi-dcols] input[value="morts"]');
            await p.fill('[data-fi-dbox] input[name="from"]', '1700'); await p.fill('[data-fi-dbox] input[name="to"]', '1900');
            await p.selectOption('[data-fi-dbox] select[name="near"]', 'subject'); await p.fill('[data-fi-dbox] input[name="km"]', '40');
            await p.fill('[data-fi-dbox] input[name="limit"]', '3'); await p.selectOption('[data-fi-dbox] select[name="sort"]', 'annee');
            await p.check('[data-fi-dbox] input[name="famcol"]');
            await p.click('[data-fi-new] form button[type="submit"]');
            await p.waitForSelector('.h-fi-dtable tbody tr', {timeout: 15000});
            const r = await p.evaluate(() => { const blk = document.querySelector('.h-fi-data'); return {heads: [...blk.querySelectorAll('thead th')].map(x => x.textContent), rows: [...blk.querySelectorAll('tbody tr')].map(tr => [...tr.cells].map(c => c.textContent.trim())), links: [...blk.querySelectorAll('tbody a.h-fi-dsrc')].map(a => [a.href, a.target, a.rel]), foot: blk.querySelector('.h-fi-dfoot').textContent, crit: blk.querySelector('.h-fi-dcrit').textContent}; });
            assert.deepStrictEqual(r.heads, ['Bataille', 'Année', 'Lieu', 'Distance (km)', '👪 Dans la famille', 'Source']);
            assert.deepStrictEqual(r.rows.map(x => x[0]), ['Escarmouche de Treignac', 'Bataille du Pont de Tulle', 'Combat de Naves'], 'période 1700–1900, à 40 km de Tulle, triées par année, 3 au plus');
            assert.ok(r.rows.every(x => /↗/.test(x.at(-1))), 'chaque ligne : ↗ source');
            assert.deepStrictEqual(r.links[0], ['https://example.org/bataille/3', '_blank', 'noopener noreferrer']);
            assert.ok(r.rows.some(x => x[4]), '👪 Dans la famille calculé : ' + JSON.stringify(r.rows.map(x => x[4])));
            assert.match(r.foot, /Source : Jeu d’essai \(CC0\)/); assert.match(r.foot, /Licence : CC0/); assert.match(r.foot, /🔄 À jour, lu le/); assert.match(r.foot, /3 lignes sur 4/);
            assert.match(r.crit, /40 km autour de Tulle/);
            const s = await sheet(id), b = s.blocks.find(x => x.type === 'data');
            assert.deepStrictEqual([b.mode, b.list, b.near, b.km, b.limit, b.from, b.to, b.cols, b.famcol, b.snap], ['live', 'test_batailles', 'subject', 40, 3, 1700, 1900, ['nom', 'annee', 'lieu'], true, undefined]);
            await clickUndo();
            assert.ok(!(await sheet(id)).blocks.some(x => x.type === 'data'), '↶ Annuler : plus de bloc');
            const s2 = await sheet(id); await post('save_topic_sheet', {...s2, blocks: [...s2.blocks, b]}); // on le remet pour la suite
        });
        await t('une question : « 🔎 Comprendre » (Entrée au clavier) remplit les réglages et dit « Ce que j’ai compris » (pastilles qui mènent au champ)', async () => {
            await openSheet(id, true);
            const i = await p.evaluate(() => [...document.querySelectorAll('[data-fi-block]')].findIndex(x => x.querySelector('.h-fi-data')));
            await p.click(`[data-fi-block="${i}"] [data-fi-edit]`);
            await p.waitForSelector('[data-fi-dbox] input[name="ask"]');
            await p.focus('[data-fi-dbox] input[name="ask"]');
            await p.keyboard.type('les batailles près de Tulle entre 1800 et 1880');
            await p.keyboard.press('Enter');
            await p.waitForFunction(() => /Ce que j’ai compris|pas compris|n’est pas chargée/.test(document.querySelector('[data-fi-dpills]')?.textContent || ''), null, {timeout: 20000});
            const r = await p.evaluate(() => { const box = document.querySelector('[data-fi-dbox]'), v = n => box.querySelector(`[name="${n}"]`).value; return {txt: box.querySelector('[data-fi-dpills]').textContent, pills: [...box.querySelectorAll('[data-fi-dfocus]')].map(x => x.dataset.fiDfocus), from: v('from'), to: v('to'), near: v('near'), place: v('place'), list: v('list')}; });
            assert.match(r.txt, /Ce que j’ai compris/); assert.deepStrictEqual([r.from, r.to], ['1800', '1880']);
            assert.ok(r.pills.includes('from'), r.pills.join());
            if (r.near === 'place') assert.strictEqual(r.place, 'Tulle');
            await p.click('[data-fi-dfocus="from"]');
            assert.strictEqual(await p.evaluate(() => document.activeElement?.name), 'from', 'la pastille mène au champ');
            await p.click('[data-fi-block] form [data-fi-cancel]'); await sleep(400);
        });
        await t('📌 Figé : la copie datée est gardée par le serveur (lignes, sources, licence), et reste quand la liste n’est plus là', async () => {
            const s = await sheet(id), b = s.blocks.find(x => x.type === 'data');
            await openSheet(id, true);
            const i = s.blocks.indexOf(b);
            await p.click(`[data-fi-block="${i}"] [data-fi-edit]`);
            await p.waitForSelector('[data-fi-dbox] input[name="mode"][value="frozen"]');
            await p.check('[data-fi-dbox] input[name="mode"][value="frozen"]');
            await p.click(`[data-fi-block="${i}"] form button[type="submit"]`);
            await p.waitForSelector('.h-fi-data.is-frozen .h-fi-dtable', {timeout: 15000});
            const sb = (await sheet(id)).blocks.find(x => x.type === 'data');
            assert.strictEqual(sb.mode, 'frozen'); assert.strictEqual(sb.snap.rows.length, 3); assert.match(sb.snap.at, /^\d{4}-\d{2}-\d{2}$/);
            assert.strictEqual(sb.snap.licence, 'CC0'); assert.strictEqual(sb.snap.sourceUrl, 'https://example.org/'); assert.deepStrictEqual(sb.snap.rows.map(r => r.u), ['https://example.org/bataille/3', 'https://example.org/bataille/1', 'https://example.org/bataille/2']);
            assert.deepStrictEqual(sb.snap.rows[1].g, [45.27, 1.77]); assert.strictEqual(sb.snap.rows[1].y, 1814);
            assert.match(await p.textContent('.h-fi-data.is-frozen .h-fi-dfoot'), /📌 Figé le/);
            // la liste disparaît (pack retiré) : la copie figée reste ; un bloc « à jour » le dit
            await p.evaluate(() => { const L = window.LCNDA_EXT.dataLists, k = L.findIndex(d => d.id === 'test_batailles'); window.__tb = L[k]; L.splice(k, 1); });
            const s2 = await sheet(id); await post('save_topic_sheet', {...s2, blocks: [...s2.blocks, {...sb, id: 'b_vivant1', mode: 'live', snap: undefined}]});
            await openSheet(id);
            await p.waitForFunction(() => /pas disponible/.test(document.querySelector('.h-fi-data[data-fi-data]')?.textContent || ''), null, {timeout: 10000});
            assert.strictEqual(await p.locator('.h-fi-data.is-frozen tbody tr').count(), 3, 'la copie figée reste');
            await p.evaluate(() => window.LCNDA_EXT.dataLists.push(window.__tb));
            const s3 = await sheet(id); await post('save_topic_sheet', {...s3, blocks: s3.blocks.filter(x => x.id !== 'b_vivant1')});
        });
        await t('« ↻ Refaire la copie » / « 📌 Figer maintenant » sur la fiche, avec ↶ Annuler', async () => {
            const s = await sheet(id), b = s.blocks.find(x => x.type === 'data');
            await post('save_topic_sheet', {...s, blocks: s.blocks.map(x => (x.id === b.id ? {...x, mode: 'live', snap: undefined} : x))});
            await openSheet(id);
            await p.waitForSelector(`[data-fi-dfreeze="${b.id}"]`, {timeout: 15000});
            assert.match(await p.textContent(`[data-fi-dfreeze="${b.id}"]`), /📌 Figer maintenant/);
            await p.click(`[data-fi-dfreeze="${b.id}"]`);
            await p.waitForSelector('.h-fi-data.is-frozen', {timeout: 15000});
            assert.strictEqual((await sheet(id)).blocks.find(x => x.id === b.id).mode, 'frozen');
            await clickUndo();
            assert.strictEqual((await sheet(id)).blocks.find(x => x.id === b.id).mode, 'live', '↶ remet le bloc « à jour »');
        });
        await t('liste compacte, frise (dans l’ordre des années), carte (points + lignes avec ↗ source)', async () => {
            const s = await sheet(id), b = s.blocks.find(x => x.type === 'data');
            for (const [view, sel, check] of [['list', '.h-fi-dlist li', n => n === 3], ['timeline', '.h-fi-dtime li', n => n === 3], ['map', '.h-fi-dmap .h-map-point, .h-fi-dmap [data-mm], .h-fi-dmap svg, .h-fi-dmap .person-map-stage', n => n >= 1]]) {
                await post('save_topic_sheet', {...s, blocks: s.blocks.map(x => (x.id === b.id ? {...x, view} : x))});
                await openSheet(id);
                await p.waitForSelector(`.h-fi-data ${sel.split(',')[0]}, .h-fi-data ${sel.split(',').at(-1).trim()}`, {timeout: 15000});
                const n = await p.locator(sel.split(',').map(x => `.h-fi-data ${x.trim()}`).join(', ')).count();
                assert.ok(check(n), `${view} : ${n}`);
                if (view === 'timeline') assert.deepStrictEqual(await p.evaluate(() => [...document.querySelectorAll('.h-fi-dtime li > span')].map(x => x.textContent)), ['1795', '1814', '1832']);
                if (view === 'map') assert.strictEqual(await p.locator('.h-fi-data .h-fi-dlist a.h-fi-dsrc').count(), 3, 'sous la carte, chaque ligne et sa source');
            }
            await post('save_topic_sheet', {...s, blocks: s.blocks.map(x => (x.id === b.id ? {...x, view: 'table'} : x))});
        });
        await t('⤓ Markdown, page web et 🖨 Imprimer : le tableau, chaque ↗ source, la source et la licence', async () => {
            await openSheet(id); await p.waitForSelector('.h-fi-data .h-fi-dtable tbody tr', {timeout: 15000});
            const r = await p.evaluate(() => { let printed = ''; const UI = window.LCNDA_UI, keep = UI.openPrintDialog; UI.openPrintDialog = o => { printed = o.html({texts: true, people: true, screens: false, quotes: true, data: true}); window.__opts = o.options.map(x => x.key); }; try { document.querySelector('[data-fi-print]').click(); } finally { UI.openPrintDialog = keep; }
                return {md: window.LCNDA_EXT.fiches.exportMarkdown(), html: window.LCNDA_EXT.fiches.exportHtml(), printed, opts: window.__opts}; });
            assert.match(r.md, /\| Bataille \| Année \| Lieu \|/); assert.match(r.md, /\[↗ Jeu d’essai \(CC0\)\]\(https:\/\/example\.org\/bataille\/3\)/); assert.match(r.md, /Licence : CC0/);
            for (const h of [r.html, r.printed]) { assert.match(h, /class="data-table h-fi-dtable"/); assert.match(h, /href="https:\/\/example\.org\/bataille\/1"/); assert.match(h, /Licence : CC0/); assert.match(h, /Escarmouche de Treignac/); assert.doesNotMatch(h, /data-fi-dfreeze/, 'pas de boutons dans un export'); }
            assert.ok(r.opts.includes('data'), 'Imprimer : « 📊 Données » à cocher');
        });
        await t('mode consultation : le bloc se lit, rien ne se modifie (ni ✎ ni 📌)', async () => {
            await p.evaluate(() => document.body.classList.add('is-kiosk'));
            await openSheet(id); await p.waitForSelector('.h-fi-data .h-fi-dtable tbody tr', {timeout: 15000});
            const r = await p.evaluate(() => ({edit: document.querySelectorAll('#workspace [data-fi-edit], #workspace [data-fi-add], #workspace [data-fi-dfreeze]').length, rows: document.querySelectorAll('.h-fi-data tbody tr').length}));
            await p.evaluate(() => document.body.classList.remove('is-kiosk'));
            assert.deepStrictEqual(r, {edit: 0, rows: 3});
        });
        await t('📎 depuis une liste : ☑ lignes → « Insérer… » → « Dans une fiche → nouveau bloc Données (figé) » → la fiche ; ↶ Annuler', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'data_test_batailles'; A.setModule('listes'); });
            await p.waitForSelector('[data-ld-ck="0"]', {timeout: 20000});
            const n0 = (await sheet(id)).blocks.filter(x => x.type === 'data').length;
            await p.click('[data-ld-ck="0"]'); await p.click('[data-ld-ck="1"]');
            await p.click('[data-ldc-ins]');
            const item = p.locator('.ui-actmenu .ui-actmenu-i', {hasText: 'Dans une fiche → nouveau bloc Données (figé)'});
            await item.waitFor({timeout: 5000}); await item.click();
            const target = p.locator('.ui-actmenu .ui-actmenu-i', {hasText: 'Tulle'}); await target.waitFor({timeout: 5000}); await target.click();
            await p.waitForFunction(async ([i, n]) => (await window.LCNDA_APP.api('topic_sheet', {id: i})).blocks.filter(x => x.type === 'data').length === n + 1, [id, n0], {timeout: 10000});
            const all = (await sheet(id)).blocks, nb = all.filter(x => x.type === 'data').at(-1);
            assert.strictEqual(nb.mode, 'frozen', JSON.stringify(all.map(x => [x.id, x.type, x.mode, x.list, x.snap?.rows?.length]))); assert.strictEqual(nb.list, 'test_batailles'); assert.strictEqual(nb.snap.rows.length, 2);
            assert.ok(nb.snap.rows.every(r => /^https:\/\//.test(r.u) && r.s), JSON.stringify(nb.snap.rows));
            assert.ok(nb.snap.cols.some(c => c.l === 'Bataille') && !nb.snap.cols.some(c => c.l === 'Source'), 'les colonnes de la liste (la source est à part, sur chaque ligne)');
            await clickUndo();
            assert.strictEqual((await sheet(id)).blocks.filter(x => x.type === 'data').length, n0, '↶ Annuler : le bloc ajouté s’en va');
            await p.evaluate(() => window.LCNDA_EXT.listesChoix?.clear?.());
        });
        await t('390 px en sombre : la fiche et les réglages du bloc ne débordent pas, rien de collé ; aucune erreur', async () => {
            await p.setViewportSize({width: 390, height: 844});
            await p.evaluate(() => { const cur = JSON.parse(localStorage.getItem('genealogie-design') || '{}'); localStorage.setItem('genealogie-design', JSON.stringify({...cur, preset: 'dark'})); window.LCNDA_APP.applyDesign?.(); });
            await openSheet(id); await p.waitForSelector('.h-fi-data .h-fi-dtable tbody tr', {timeout: 15000}); await sleep(300);
            const over = () => p.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
            assert.ok(await over() <= 1, `déborde de ${await over()} px`);
            let bad = await p.evaluate(detect, {root: '.h-fi-data', min: 4});
            assert.deepStrictEqual(bad.map(b => b.key), [], 'bloc');
            if (shot) await p.screenshot({path: shot.replace(/\.png$/, '-390.png'), fullPage: false});
            await p.click('[data-fi-mode]'); await p.waitForSelector('.h-fi.is-editing');
            const i = await p.evaluate(() => [...document.querySelectorAll('[data-fi-block]')].findIndex(x => x.querySelector('.h-fi-data')));
            await p.click(`[data-fi-block="${i}"] [data-fi-edit]`); await p.waitForSelector('[data-fi-dbox]'); await sleep(300);
            assert.ok(await over() <= 1, `réglages : déborde de ${await over()} px`);
            bad = await p.evaluate(detect, {root: '[data-fi-dbox]', min: 4});
            assert.deepStrictEqual(bad.map(b => b.key), [], 'réglages');
            await p.click('[data-fi-block] form [data-fi-cancel]');
            await p.evaluate(() => { const cur = JSON.parse(localStorage.getItem('genealogie-design') || '{}'); delete cur.preset; localStorage.setItem('genealogie-design', JSON.stringify(cur)); window.LCNDA_APP.applyDesign?.(); });
            await p.setViewportSize({width: 1440, height: 900});
            assert.deepStrictEqual(B.errs, []);
        });
        if (shot) { // la fenêtre « ＋ Ajouter un bloc » et la fiche avec un bloc Données, côte à côte
            const s = await sheet(id), b = s.blocks.find(x => x.type === 'data');
            await post('save_topic_sheet', {...s, blocks: s.blocks.map(x => (x.id === b.id ? {...x, limit: 5, from: null, to: null, near: '', title: 'Les batailles autour de Tulle'} : x))});
            await openSheet(id); await p.waitForSelector('.h-fi-data .h-fi-dtable tbody tr', {timeout: 15000}); await sleep(500);
            await p.evaluate(() => document.querySelectorAll('.toast').forEach(x => x.remove()));
            const sheetPng = await p.locator('#workspace .h-fi').screenshot();
            const q = await B.ctx.newPage(); await q.setViewportSize({width: 1900, height: 1000});
            await q.setContent(`<body style="margin:0;background:#e9e9ef;display:flex;gap:24px;padding:24px;align-items:flex-start"><img style="max-width:640px;box-shadow:0 2px 12px #0003" src="data:image/png;base64,${dialogPng ? dialogPng.toString('base64') : ''}"><img style="max-width:1180px;box-shadow:0 2px 12px #0003" src="data:image/png;base64,${sheetPng.toString('base64')}"></body>`);
            await q.screenshot({path: shot, fullPage: true}); await q.close();
            console.log('  capture : ' + shot);
        }
    } finally { await B.stop(); }
    console.log(fails ? `\n✗ ${fails} essai(s) en échec` : '\n✓ tout est bon');
    process.exit(fails ? 1 : 0);
})();
