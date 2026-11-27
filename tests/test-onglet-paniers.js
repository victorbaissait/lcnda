#!/usr/bin/env node
/* 🧺 L'onglet « Paniers » (maquette validée docs/design/onglet-paniers.html ; assets/js/app-paniers.js, app-paniers-core.js, lib/paniers.php).
 * Base : tests/prendre-depuis-seed.js (noms inventés MAZAUD, LACOMBE, DURAND), plus des naissances LACOMBE à Treignac, une cousine vivante
 * et une personne confidentielle ; des listes d'essai FABRIQUÉES (château de Rochefière, batailles, comètes) branchées par LCNDA_EXT.paniersSources.
 *  logique (node) : 6 statuts, « ↕ Ranger » (chaque mode, groupes, l'ordre à la main intact), la phrase comprise (3 exemples), l'âge → les dates ;
 *  écran : onglet caché au départ puis allumé (catalogue « 1 · Des parties de l'app, cachées au départ ») ; arbre 📁/🧺 et glisser (panier → dossier,
 *    élément → panier) ; statuts ; Ranger (retenu par panier, ordre à la main gardé) ; recherche qui crée un panier : militaire à 4 km du château,
 *    ce qu'a pu voir Jean MAZAUD à 10–12 ans, naissances LACOMBE à Treignac 1780–1800 (✓/✗ puis créer / ajouter à un panier existant,
 *    « ↻ Refaire » : doublons sautés) ; panier vivant (« Me demander d'abord », +N) ; partager (public seul, personnel coché un à un, vivants jamais) ;
 *    récupérer (aperçu ✓/✗, doublons, fichier vérifié) ; dupliquer une partie ; chercher dedans puis agir sur les cochés ; le dernier panier d'un
 *    dossier (supprimer / « À trier » / annuler, ↶) ; export CSV ; fiche de sortie imprimable ; 390 px, sombre, rien de collé ; aucune erreur.
 *   node tests/test-onglet-paniers.js */
'use strict';
const assert = require('assert');
const path = require('path');
const {spawnSync} = require('child_process');
const {start, sleep} = require('./prendre-depuis-seed.js');
const {detect} = require('./test-rien-de-colle.js');
const C = require('../assets/js/app-paniers-core.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 10).join('\n  ')); } };

/* ═════ la logique, sans écran ═════ */
async function unit() {
    await t('statuts : 6, dans l’ordre, un clic = le suivant ; un nouvel élément est « trouvé » ; « utilisé » = l’ancienne case ✓', async () => {
        assert.deepStrictEqual(C.STATUSES.map(s => s[0]), ['chercher', 'demander', 'trouve', 'verifie', 'utilise', 'revoir']);
        assert.strictEqual(C.statusOf({}), 'trouve'); assert.strictEqual(C.statusOf({done: 1}), 'utilise'); assert.strictEqual(C.statusOf({status: 'demander', done: 0}), 'demander');
        assert.strictEqual(C.nextStatus('trouve'), 'verifie'); assert.strictEqual(C.nextStatus('revoir'), 'chercher');
    });
    const items = [
        {id: 1, position: 1, kind: 'act', title: 'Acte de mariage', value: 'Treignac, 14 juin 1826', data: {place: 'Treignac'}, origin: {label: 'AD Corrèze'}, created_at: '2026-01-03'},
        {id: 2, position: 2, kind: 'person', title: 'Jean MAZAUD', value: '1801–1871', data: {place: 'Treignac'}, origin: {label: 'Ton arbre'}, status: 'utilise', created_at: '2026-01-01'},
        {id: 3, position: 3, kind: 'row', title: 'Prix du blé à Limoges', value: '1826', data: {place: 'Limoges', km: 75, rows: [[1], [2]]}, origin: {label: 'Wikipédia'}, created_at: '2026-01-02'},
        {id: 4, position: 4, kind: 'note', title: 'Note sans date', value: '', created_at: '2026-01-04'},
    ];
    await t('↕ Ranger : chaque mode ; Catégorie, Lieu, Personne, Source, Utilisé font des groupes ; « puis par » ; ↓ ; l’ordre à la main n’est jamais touché', async () => {
        const before = JSON.stringify(items);
        const ids = s => C.arrange(items, s).flatMap(g => g.items.map(x => x.id));
        assert.deepStrictEqual(ids({k: 'main'}), [1, 2, 3, 4]);
        assert.deepStrictEqual(ids({k: 'nom'}), [1, 2, 4, 3]);
        assert.deepStrictEqual(ids({k: 'date'}), [2, 1, 3, 4], 'les dates : 1801, 1826, 1826, sans date');
        assert.strictEqual(ids({k: 'date'}).at(-1), 4, 'sans date : en bas');
        assert.strictEqual(ids({k: 'date', dir: -1}).at(-1), 4, 'sans date : en bas, même ↓');
        assert.deepStrictEqual(ids({k: 'ajout'}), [2, 3, 1, 4]);
        assert.deepStrictEqual(ids({k: 'dist'}).slice(0, 1), [3]);
        assert.deepStrictEqual(ids({k: 'taille'}).slice(0, 1), [3]);
        assert.deepStrictEqual(ids({k: 'used'}).slice(0, 1), [2]);
        for (const k of ['cat', 'lieu', 'pers', 'src', 'used']) assert.ok(C.arrange(items, {k}).every(g => g.key), k + ' : des groupes');
        assert.deepStrictEqual(C.arrange(items, {k: 'lieu'}).map(g => g.key), ['📍 Limoges', '📍 Treignac', 'Sans lieu']);
        assert.deepStrictEqual(C.arrange(items, {k: 'lieu', then: 'nom'}).find(g => g.key === '📍 Treignac').items.map(x => x.id), [1, 2]);
        assert.deepStrictEqual(C.arrange(items, {k: 'cat'}).map(g => g.key), ['📜 Actes', '👤 Personnes', '📋 Données', '📝 Notes']);
        assert.strictEqual(JSON.stringify(items), before, 'rien de changé dans les éléments');
        assert.deepStrictEqual(C.SORTS.map(s => s[0]), ['main', 'nom', 'cat', 'date', 'ajout', 'lieu', 'pers', 'src', 'dist', 'used', 'taille']);
        assert.match(C.sortLabel({k: 'cat', then: 'date', dir: 1}), /Catégorie, puis Date de l’élément ↑/);
    });
    await t('la phrase comprise : militaire à 4 km du château · Jean MAZAUD à 10–12 ans (ciel, mer, terre) · naissances LACOMBE à Treignac 1780–1800', async () => {
        const a = C.parseSmart('les événements militaires à 4 km autour du château de Rochefière');
        assert.strictEqual(a.km, 4); assert.strictEqual(a.around.name, 'château de Rochefière'); assert.deepStrictEqual(a.cats, ['bat', 'reg', 'cas', 'mon']);
        assert.ok(a.nope.some(x => /centre/.test(x)));
        const b = C.parseSmart('ce qu’a pu voir Jean MAZAUD entre 10 et 12 ans dans le ciel, la mer ou sur terre');
        assert.strictEqual(b.who.name, 'Jean MAZAUD'); assert.deepStrictEqual(b.age, [10, 12]);
        for (const k of ['com', 'aur', 'ecl', 'cie', 'sei', 'vol', 'inn', 'mar', 'tem']) assert.ok(b.cats.includes(k), k);
        assert.ok(b.nope.some(x => /tempêtes/.test(x)), 'les tempêtes : pas de liste, dit honnêtement');
        const c = C.parseSmart('les naissances de la famille LACOMBE à Treignac entre 1780 et 1800');
        assert.strictEqual(c.surname, 'LACOMBE'); assert.strictEqual(c.place.name, 'Treignac'); assert.deepStrictEqual(c.years, [1780, 1800]); assert.strictEqual(c.tree.k, 'nai'); assert.strictEqual(c.who, null);
        assert.deepStrictEqual(C.ageSpan('1801-10-12', [10, 12]), {from: '1811-10-12', to: '1814-10-11', y1: 1811, y2: 1814}, 'du jour de ses 10 ans à la veille de ses 13 ans');
        assert.ok(C.nameMatch('LACOMBES', 'LACOMBE') && C.nameMatch('LA COMBE', 'LACOMBE') && !C.nameMatch('DURAND', 'LACOMBE'));
    });
    await t('comparer, doublons, résumé, « Qu’est-ce qui manque ? »', async () => {
        const c = C.compare(items.slice(0, 3), [items[1], {kind: 'datum', title: 'Autre', value: ''}]);
        assert.deepStrictEqual([c.onlyA.length, c.both.length, c.onlyB.length], [2, 1, 1]);
        assert.match(C.summary(items), /4 éléments · 1801–1826 · 2 lieux · 3 sources · 1 utilisés/);
        const m = C.missing(items, {name: 'Mariage 1826', dests: []});
        assert.ok(m.some(x => x.k === 'contrat') && m.some(x => x.k === 'dest') && m.some(x => x.k === 'date') && m.some(x => x.k === 'bans'), JSON.stringify(m));
    });
}

/* ═════ l'écran ═════ */
function php(B, code) {
    const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
    const bin = findPhp([devBundledPhp()]) || 'php';
    const r = spawnSync(bin, [...phpRuntimeArgs(bin), '-r', `require 'lib/paths.php'; $pdo = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); ${code}`], {cwd: path.join(__dirname, '..'), encoding: 'utf8', env: {...process.env, GENEALOGY_DATA_DIR: B.tmp}});
    if (r.status !== 0) throw new Error(r.stderr || r.stdout);
    return r.stdout;
}
const FIXTURES = () => {
    const ext = window.LCNDA_EXT;
    const L = (id, label, rows, o = {}) => ({id, icon: o.icon || '📋', label, group: 'Le monde', source: 'Essai (fabriqué)', load: async () => rows,
        fields: [{key: 'name', label: 'Nom', type: 'text'}, {key: 'year', label: 'Année', type: 'year'}, {key: 'place', label: 'Lieu', type: 'text'}, {key: 'kind', label: 'Sorte', type: 'text'}],
        period: r => [r.year, r.year], geo: r => (r.lat != null ? [r.lat, r.lon] : null)});
    (ext.dataLists = ext.dataLists || []).push(
        L('test_chateaux', 'Châteaux (essai)', [{name: 'Château de Rochefière', place: 'Treignac', lat: 45.5450, lon: 1.8000, year: 1450}]),
        L('test_batailles', 'Batailles (essai)', [{name: 'Siège de Rochefière (1569)', year: 1569, place: 'Treignac', lat: 45.5452, lon: 1.8003}, {name: 'Combat du pont de Treignac (1652)', year: 1652, place: 'Treignac', lat: 45.5367, lon: 1.7958},
            {name: 'Bataille lointaine de Tulle (1944)', year: 1944, place: 'Tulle', lat: 45.2675, lon: 1.7711}]),
        L('test_monuments', 'Monuments aux morts (essai)', [{name: 'Monument aux morts de Treignac (1921)', year: 1921, place: 'Treignac', lat: 45.5370, lon: 1.7960}]),
        L('test_cometes', 'Comètes (essai)', [{name: 'Grande comète de 1790', year: 1790, kind: 'comète'}, {name: 'Comète de 1792', year: 1792, kind: 'comète'}, {name: 'Comète trop tôt (1785)', year: 1785, kind: 'comète'}, {name: 'Aurore de 1791', year: 1791, kind: 'aurore'}]),
        L('test_crues', 'Crues (essai)', [{name: 'Crue de la Vézère à Treignac (1791)', year: 1791, place: 'Treignac', lat: 45.5367, lon: 1.7958}]));
    ext.paniersSources = [{cat: 'chat', list: 'test_chateaux'}, {cat: 'bat', list: 'test_batailles'}, {cat: 'mon', list: 'test_monuments'}, {cat: 'com', list: 'test_cometes'}, {cat: 'aur', list: 'test_cometes'}, {cat: 'inn', list: 'test_crues'}];
};

(async () => {
    await unit();
    const B = await start();
    const p = B.page;
    const cx = (op, body = {}) => p.evaluate(([o, b]) => window.LCNDA_APP.api('cx_write', {}, {method: 'POST', body: {op: o, ...b}}).then(r => r?.result ?? r), [op, body]);
    const tree = () => B.api('cx_basket', {all: 1});
    const bBy = async n => (await tree()).baskets.find(x => x.name === n);
    const fBy = async n => (await tree()).folders.find(x => x.name === n);
    const itemsOf = async id => (await B.api('cx_basket', {basket_id: id})).items;
    const dlg = '.pn-dlg[open]';
    const closeAll = () => p.evaluate(() => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); document.querySelectorAll('.ui-actmenu').forEach(x => x.remove()); });
    const openTab = async () => { await closeAll(); await B.go('paniers'); await p.waitForSelector('[data-pn] [data-pn-tree] .pn-tr', {timeout: 20000}); await sleep(300); };
    const openBasket = async n => { await openTab(); await p.locator('[data-pn-tree] .pn-tr[data-pn-b]', {hasText: n}).first().click(); await p.waitForFunction(x => document.querySelector('[data-pn-main] .pn-bn')?.textContent === x, n, {timeout: 10000}); };
    const menu = async (anchor, label) => { await p.click(anchor); await p.waitForSelector('.ui-actmenu'); await p.locator('.ui-actmenu button', {hasText: label}).first().click(); };
    const clickUndo = async () => { const u = p.locator('.toast button', {hasText: '↶'}).last(); await u.waitFor({timeout: 10000}); await u.click(); await sleep(1200); };
    const search = async q => { await p.click('[data-pn-a="search"]'); await p.fill('[data-pn-q]', q); await p.keyboard.press('Enter'); await p.waitForFunction(() => document.querySelector('[data-pn-main] .pn-res, [data-pn-main] .pn-und') && !/Je cherche/.test(document.querySelector('[data-pn-sform] button[type="submit"]')?.textContent || ''), null, {timeout: 60000}); await sleep(300); };
    const resultTitles = () => p.$$eval('[data-pn-main] .pn-rr:not(.is-ex) .pn-rtx b', l => l.map(x => x.textContent));
    try {
        // des naissances LACOMBE à Treignac (dont une variante, une hors période, une ailleurs), une cousine vivante, une personne confidentielle
        php(B, `$B = (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='BIRT'")->fetchColumn(); $per = $pdo->prepare("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_private) VALUES(?,?,?,?,?,?)"); $ev = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)");
            foreach ([[901,'Pierre','LACOMBE',1784,'1784-02-02',1],[902,'Marie','LACOMBE',1786,'1786-05-09',1],[903,'Jeanne','LACOMBES',1791,'1791-08-14',1],[904,'Léonard','LACOMBE',1802,'1802-03-21',1],[905,'Antoine','LACOMBE',1790,'1790-04-01',2]] as $x) { $per->execute([$x[0],$x[1],$x[2],'male','deceased',0]); $ev->execute([$x[0],$B,$x[4],$x[3],$x[4],$x[5]]); }
            $per->execute([910,'Sophie','DURAND','female','living',0]); $ev->execute([910,$B,'1962',1962,'1962-03-01',1]); $per->execute([911,'Paul','DURAND','male','deceased',1]); echo 'ok';`);
        await p.evaluate(FIXTURES);

        await t('l’onglet est caché au départ ; on l’allume dans « 1 · Des parties de l’app, cachées au départ » (catalogue + repère) ; la pastille 🧺 reste', async () => {
            const hid = await p.evaluate(() => { const b = document.querySelector('.main-nav [data-module="paniers"]'); return !!b && (b.hidden || getComputedStyle(b).display === 'none') && window.LCNDA_APP.menuHiddenKeys().includes('paniers'); });
            assert.ok(hid, 'caché au départ');
            const cat = await p.evaluate(() => window.LCNDA_EXT.tabsPlus.catalog().find(x => x.k === 'paniers'));
            assert.ok(cat && cat.g === 1 && cat.module === 'paniers' && cat.icon === '🧺', JSON.stringify(cat));
            await p.evaluate(() => window.LCNDA_EXT.tabsPlus.open()); await p.waitForSelector('[data-tp-item="paniers"]');
            assert.match(await p.textContent('[data-tp-card="paniers"]'), /Paniers.*La pastille 🧺 reste là/s);
            await p.click('[data-tp-card="paniers"]');
            await p.waitForFunction(() => { const b = document.querySelector('.main-nav [data-module="paniers"]'); return b && !b.hidden && getComputedStyle(b).display !== 'none'; }, null, {timeout: 8000});
            assert.strictEqual(await p.evaluate(() => localStorage.getItem('genealogie-menu-paniers')), '1');
            await closeAll();
            await p.click('.main-nav [data-module="paniers"]'); await p.waitForSelector('[data-pn]');
            assert.ok(await p.evaluate(() => window.LCNDA_EXT.connexions.enabled() && typeof window.LCNDA_EXT.connexions.openBasket === 'function'), 'la pastille 🧺 et « Prendre depuis… » restent');
        });

        let fam, mar, cad, tem, solo, soloF;
        await t('l’arbre : 📁 Famille MAZAUD › 📁 Mariage 1826 › 🧺 Témoins ; glisser un panier sur un dossier, un élément sur un panier (↶)', async () => {
            const f1 = await cx('folder_new', {name: 'Famille MAZAUD', basket_name: 'Cadastre'}); fam = f1.id; cad = f1.basket_id;
            const f2 = await cx('folder_new', {name: 'Mariage 1826', parent_id: fam, basket_name: 'Témoins'}); mar = f2.id; tem = f2.basket_id;
            await cx('basket_add', {basket_id: tem, items: [{kind: 'person', ref_id: 12, title: 'Jean MAZAUD', value: '1780–1840'}, {kind: 'datum', title: 'Date du mariage', value: '8 février 1813'},
                {kind: 'act', title: 'Publication des bans, mai 1826', value: '5 Mi 123, vue 45', origin: {label: 'AD Corrèze, registres paroissiaux'}}, {kind: 'row', title: 'Prix du blé à Limoges, 1826', value: 'liste « Prix et mesures »', data: {place: 'Limoges'}, origin: {kind: 'list', label: 'Wikipédia', url: 'https://fr.wikipedia.org/'}}]});
            const lone = await cx('basket_new', {name: 'Pêle-mêle'}); solo = lone.id;
            await openTab();
            await p.click(`[data-pn-tw="${fam}"]`).catch(() => {}); // (déplié par défaut : un clic replie, un autre déplie)
            if (!(await p.$(`[data-pn-f="${mar}"]`))) await p.click(`[data-pn-tw="${fam}"]`);
            assert.ok(await p.$(`.pn-tr[data-pn-b="${tem}"]`), 'Témoins visible sous Mariage 1826');
            await p.dragAndDrop(`.pn-tr[data-pn-b="${solo}"]`, `.pn-tr[data-pn-f="${fam}"]`); await sleep(1500);
            assert.strictEqual((await bBy('Pêle-mêle')).folder_id, fam, 'le panier glissé est rangé dans le dossier');
            await clickUndo(); assert.strictEqual((await bBy('Pêle-mêle')).folder_id, 0, '↶ : remis tout en haut');
            await p.locator('[data-pn-tree] .pn-tr[data-pn-b]', {hasText: 'Témoins'}).first().click(); await p.waitForSelector('[data-pn-items] [data-pn-i]');
            const dated = (await itemsOf(tem)).find(x => x.title === 'Date du mariage');
            await p.dragAndDrop(`[data-pn-i="${dated.id}"] .pn-itx b`, `.pn-tr[data-pn-b="${cad}"]`); await sleep(1500);
            assert.ok((await itemsOf(cad)).some(x => x.title === 'Date du mariage'), 'l’élément glissé est dans « Cadastre »');
            await clickUndo(); assert.ok((await itemsOf(tem)).some(x => x.title === 'Date du mariage'), '↶ : revenu');
        });

        await t('statuts : un nouvel élément arrive « trouvé » ; un clic = le suivant (vérifié) ; « à demander » ; enregistré, ↶ dans l’historique', async () => {
            await openBasket('Témoins');
            const it = (await itemsOf(tem)).find(x => x.title.startsWith('Publication'));
            assert.match(await p.textContent(`[data-pn-i="${it.id}"] .pn-stt`), /trouvé/);
            await p.click(`[data-pn-i="${it.id}"] .pn-stt`); await p.waitForFunction(id => /vérifié/.test(document.querySelector(`[data-pn-i="${id}"] .pn-stt`)?.textContent), it.id);
            assert.strictEqual((await itemsOf(tem)).find(x => x.id === it.id).status, 'verifie');
            for (let k = 0; k < 4; k++) { await p.click(`[data-pn-i="${it.id}"] .pn-stt`); await sleep(400); } // utilisé → à revoir → à chercher → à demander
            assert.strictEqual((await itemsOf(tem)).find(x => x.id === it.id).status, 'demander');
            const log = (await B.api('cx_basket', {basket_id: tem, log: 1})).log; assert.ok(log.some(l => /statut « à demander »/.test(l.label) && Number(l.can_undo)), JSON.stringify(log.slice(0, 3)));
            await menu('[data-pn-a="more"]', 'Historique'); await p.waitForSelector(`${dlg} [data-pn-undo]`);
            await p.click(`${dlg} [data-pn-undo]`); await sleep(1200);
            assert.strictEqual((await itemsOf(tem)).find(x => x.id === it.id).status, 'chercher', '↶ depuis l’historique : le statut d’avant');
            await closeAll(); await cx('item_set', {id: it.id, status: 'demander'});
        });

        await t('↕ Ranger : Catégorie (groupes repliables), puis Nom ; « ↶ Mon ordre à la main » ; retenu par panier ; l’ordre à la main jamais perdu', async () => {
            await openBasket('Témoins');
            const order0 = (await itemsOf(tem)).map(x => x.id);
            await menu('[data-pn-a="sort"]', 'Catégorie'); await p.waitForSelector('.pn-ghd');
            const heads = await p.$$eval('.pn-ghd button', l => l.map(x => x.textContent.trim()));
            assert.ok(heads.some(h => /Personnes/.test(h)) && heads.some(h => /Actes/.test(h)), heads.join(' | '));
            await p.locator('.pn-ghd button', {hasText: 'Personnes'}).click(); await sleep(800);
            assert.ok(!(await p.$('[data-pn-items] .pn-it .pn-itx b >> text=Jean MAZAUD')), 'groupe replié');
            assert.deepStrictEqual((await bBy('Témoins')).sort.closed, ['👤 Personnes']);
            await menu('[data-pn-a="sort"]', 'Nom A→Z'); await sleep(800);
            assert.strictEqual((await bBy('Témoins')).sort.k, 'nom');
            assert.ok(!(await p.$('.pn-ghd')), 'Nom : pas de groupes');
            assert.ok(!(await p.$('.pn-grip')), 'rangé : pas de ⋮⋮');
            await p.click('[data-pn-a="sort-main"]'); await sleep(800);
            assert.strictEqual((await bBy('Témoins')).sort.k, 'main');
            assert.deepStrictEqual((await itemsOf(tem)).map(x => x.id), order0, 'l’ordre à la main est intact');
            assert.deepStrictEqual(await p.$$eval('[data-pn-items] [data-pn-i]', l => l.map(x => Number(x.dataset.pnI))), order0);
            await menu('[data-pn-a="sort"]', 'Lieu'); await sleep(600); await openBasket('Cadastre'); assert.ok(!(await p.$('.pn-ghd')), 'un autre panier garde son rangement à lui');
            await openBasket('Témoins'); assert.match(await p.textContent('[data-pn-a="sort"]'), /Lieu/); await p.click('[data-pn-a="sort-main"]'); await sleep(600);
        });

        await t('🔍 « militaire à 4 km autour du château » : centre = le château, rayon 4 km ; ✓/✗ ; « Créer le panier » dans un dossier, sa recherche gardée', async () => {
            await openTab(); await search('les événements militaires à 4 km autour du château de Rochefière');
            assert.match(await p.textContent('.pn-und'), /centre : Château de Rochefière/);
            assert.match(await p.textContent('.pn-und .pn-rad'), /4 km/);
            const got = await resultTitles();
            assert.ok(got.includes('Siège de Rochefière (1569)') && got.includes('Combat du pont de Treignac (1652)') && got.some(x => /Monument aux morts de Treignac/.test(x)), got.join(' | '));
            assert.ok(!got.some(x => /lointaine/.test(x)), 'à plus de 4 km : pas pris');
            assert.match(await p.textContent('.pn-nope'), /centre/);
            const row = p.locator('.pn-rr', {hasText: 'Combat du pont'}); await row.locator('[data-pn-rn]').click(); await sleep(200);
            assert.ok(await row.evaluate(x => x.classList.contains('is-ex')), '✗ : écarté');
            await p.selectOption('[data-pn-sfolder]', String(fam));
            await p.fill('[data-pn-sname]', 'Militaire autour de Rochefière'); await p.press('[data-pn-sname]', 'Tab'); await sleep(200);
            const kept = got.length - 1;
            assert.match(await p.textContent('[data-pn-a="s-create"]'), new RegExp(`Créer le panier « Militaire autour de Rochefière » \\(${kept}\\)`));
            await p.click('[data-pn-a="s-create"]'); await sleep(1500);
            const b = await bBy('Militaire autour de Rochefière');
            assert.ok(b && b.folder_id === fam && b.count === kept, JSON.stringify(b)); assert.strictEqual(b.query.text, 'les événements militaires à 4 km autour du château de Rochefière');
            assert.ok(!(await itemsOf(b.id)).some(x => /Combat du pont/.test(x.title)));
            assert.match(await p.textContent('.pn-qline'), /Créé par la recherche/);
        });

        await t('↻ Refaire (panier figé, garde sa recherche) : seulement les nouveautés, « déjà dedans » sautés, ajoutées à ce panier-là', async () => {
            const b = await bBy('Militaire autour de Rochefière');
            await p.click('[data-pn-a="redo"]');
            await p.waitForFunction(() => document.querySelector('[data-pn-main] .pn-res') && !/Je cherche/.test(document.querySelector('[data-pn-sform] button[type="submit"]')?.textContent || ''), null, {timeout: 60000});
            assert.ok((await p.$$('.pn-rr .pn-dup')).length >= 2, 'ce qui est déjà dedans est dit');
            assert.deepStrictEqual(await resultTitles(), ['Combat du pont de Treignac (1652)'], 'seulement la nouveauté (celle écartée la première fois)');
            await p.click('[data-pn-a="s-add"]'); await sleep(1500);
            assert.strictEqual((await bBy('Militaire autour de Rochefière')).count, b.count + 1);
        });

        await t('🔍 « ce qu’a pu voir Jean MAZAUD entre 10 et 12 ans » : sa naissance (1780) → 1790–1793 ; ciel, terre, eau ; « ＋ Ajouter à un panier existant »', async () => {
            await openTab(); await search('ce qu’a pu voir Jean MAZAUD entre 10 et 12 ans dans le ciel, la mer ou sur terre');
            assert.match(await p.textContent('.pn-und'), /Jean MAZAUD, né le 13 janvier 1780 à Treignac/);
            assert.strictEqual(await p.inputValue('[data-pn-u="y1"]'), '1790'); assert.strictEqual(await p.inputValue('[data-pn-u="y2"]'), '1793');
            const got = await resultTitles();
            assert.ok(got.includes('Grande comète de 1790') && got.includes('Comète de 1792') && got.includes('Aurore de 1791') && got.some(x => /Crue de la Vézère/.test(x)), got.join(' | '));
            assert.ok(!got.includes('Comète trop tôt (1785)') && got.filter(x => /^Aurore/.test(x)).length === 1, 'comètes et aurores séparées, hors période écartée');
            assert.match(await p.textContent('.pn-nope'), /tempêtes/);
            await p.locator('.pn-grp', {hasText: 'aurores'}).locator('[data-pn-gn]').click(); await sleep(200);
            await p.selectOption('[data-pn-sto]', String(tem));
            const n0 = (await itemsOf(tem)).length;
            await p.click('[data-pn-a="s-add"]'); await sleep(1500);
            const its = await itemsOf(tem);
            assert.ok(its.length > n0 && its.some(x => x.title === 'Grande comète de 1790') && !its.some(x => x.title === 'Aurore de 1791'), its.map(x => x.title).join(' | '));
            // une deuxième fois : tout est déjà dedans
            await search('ce qu’a pu voir Jean MAZAUD entre 10 et 12 ans dans le ciel, la mer ou sur terre');
            await p.locator('.pn-grp', {hasText: 'aurores'}).locator('[data-pn-gn]').click(); await sleep(200);
            await p.selectOption('[data-pn-sto]', String(tem)); await p.click('[data-pn-a="s-add"]'); await sleep(1500);
            assert.strictEqual((await itemsOf(tem)).length, its.length, 'doublons sautés');
            assert.match(await p.textContent('.toast:last-of-type, #toast-region'), /déjà dedans/);
        });

        await t('🔍 « naissances LACOMBE à Treignac 1780–1800 » : l’arbre (variante LACOMBES comprise, 1802 et Chamberet écartés) ; Créer', async () => {
            await openTab(); await search('les naissances de la famille LACOMBE à Treignac entre 1780 et 1800');
            const got = await resultTitles();
            for (const n of ['Pierre LACOMBE', 'Marie LACOMBE', 'Jeanne LACOMBES']) assert.ok(got.some(x => x.includes(n)), n + ' : ' + got.join(' | '));
            assert.ok(!got.some(x => /Léonard LACOMBE|Antoine LACOMBE/.test(x)) || !got.some(x => /1802|Chamberet/.test(x)), got.join(' | '));
            const evs = await p.$$eval('[data-pn-main] .pn-rr:not(.is-ex) .pn-rtx small', l => l.map(x => x.textContent));
            assert.ok(evs.every(x => /Treignac/.test(x) && /17[89]\d|1800/.test(x)), evs.join(' | '));
            assert.match(await p.inputValue('[data-pn-sname]'), /Naissances LACOMBE à Treignac 1780–1800/);
            await p.click('[data-pn-a="s-create"]'); await sleep(1500);
            const b = await bBy('Naissances LACOMBE à Treignac 1780–1800'); assert.ok(b && b.count === got.length, JSON.stringify(b));
            assert.ok((await itemsOf(b.id)).every(x => x.kind === 'event' && x.ref_id > 0 && (x.status === '' || x.status === 'trouve')), 'des événements de l’arbre, « trouvé »');
        });

        await t('🔄 panier vivant : « Me demander d’abord » par défaut ; une nouveauté → « +1 » dans l’arbre et une liste ✓/✗ ; « Ajouter tout seul » au choix', async () => {
            await openBasket('Militaire autour de Rochefière');
            await p.click('[data-pn-a="live-on"]'); await p.waitForSelector('.pn-live');
            assert.strictEqual(await p.getAttribute('[data-pn-live="ask"]', 'aria-pressed'), 'true');
            await p.evaluate(() => { const ext = window.LCNDA_EXT, L = ext.dataLists.find(x => x.id === 'test_batailles'); ext.dataLists.push({...L, id: 'test_batailles2', load: async () => [...await L.load(), {name: 'Escarmouche du moulin (1590)', year: 1590, place: 'Treignac', lat: 45.540, lon: 1.799}]}); ext.paniersSources.unshift({cat: 'bat', list: 'test_batailles2'}); }); // une liste mise à jour (nouvelle version)
            await p.click('[data-pn-a="live-run"]'); await p.waitForSelector('.pn-news', {timeout: 60000});
            assert.match(await p.textContent('.pn-news'), /\+1 nouveaux à valider.*Escarmouche du moulin/s);
            const b = await bBy('Militaire autour de Rochefière');
            assert.match(await p.textContent(`.pn-tr[data-pn-b="${b.id}"]`), /\+1/);
            assert.ok(!(await itemsOf(b.id)).some(x => /Escarmouche/.test(x.title)), 'rien n’entre sans ton clic');
            await p.click('[data-pn-a="news-ok"]'); await sleep(1500);
            assert.ok((await itemsOf(b.id)).some(x => /Escarmouche/.test(x.title)));
            await p.click('[data-pn-live="auto"]'); await sleep(800);
            assert.strictEqual((await bBy('Militaire autour de Rochefière')).live.mode, 'auto');
        });

        let shareFile;
        await t('⇪ partager : le public d’office, l’arbre coché un à un, vivants et confidentiels jamais ; pas de notes, pas de numéros de la base', async () => {
            const sb = await cx('basket_new', {name: 'À partager'});
            await cx('basket_add', {basket_id: sb.id, items: [{kind: 'row', title: 'Monument aux morts de Treignac (1921)', value: '42 noms', data: {columns: ['Nom'], row: ['Monument'], list: 'pm_monuments'}, origin: {kind: 'list', label: 'Monuments aux morts — Wikidata (CC0)', url: 'https://www.wikidata.org/'}},
                {kind: 'person', ref_id: 12, title: 'Jean MAZAUD', value: '1780–1840'}, {kind: 'person', ref_id: 910, title: 'Sophie DURAND', value: 'cousine vivante'}, {kind: 'person', ref_id: 911, title: 'Paul DURAND', value: 'confidentiel'},
                {kind: 'note', ref_id: 1, title: 'Souvenir de la grand-mère', value: 'Jean MAZAUD tenait le moulin'}]});
            const it = await itemsOf(sb.id); await cx('item_set', {id: it[0].id, note: 'ma note perso'});
            await openBasket('À partager');
            await p.click('[data-pn-a="share"]'); await p.waitForSelector(`${dlg} .pn-sum`);
            assert.match(await p.textContent(`${dlg} .pn-sum`), /1 publics.*2 de ton arbre.*2 bloqués/s);
            assert.strictEqual(await p.$$eval(`${dlg} [name="inc"]:checked`, l => l.length), 0, 'l’arbre : décoché par défaut');
            await p.locator(`${dlg} li`, {hasText: 'Jean MAZAUD'}).locator('[name="inc"]').check();
            assert.ok(!(await p.$(`${dlg} [name="inc"][aria-label="Sophie DURAND"]`)), 'la vivante ne se coche pas');
            const dl = p.waitForEvent('download'); await p.click(`${dlg} [data-pn-dk="file"]`); const d = await dl;
            assert.match(d.suggestedFilename(), /\.lcnda-panier$/);
            shareFile = await p.evaluate(() => window.LCNDA_EXT.paniers._st.lastShare);
            const titles = shareFile.items.map(x => x.title);
            assert.deepStrictEqual(titles, ['Monument aux morts de Treignac (1921)', 'Jean MAZAUD'], titles.join(' | '));
            assert.ok(!JSON.stringify(shareFile).includes('ma note perso') && !JSON.stringify(shareFile).includes('ref_id') && shareFile.format === 'lcnda-panier', 'ni note ni numéro');
            const forced = await cx('pn_share_build', {basket_id: sb.id, include: it.map(x => x.id)});
            assert.ok(!forced.share.items.some(x => /Sophie|Paul/.test(x.title)) && forced.counts.blocked === 2, 'même demandé : jamais les vivants ni les confidentiels');
            const acc = await cx('pn_share_accounts', {}); assert.deepStrictEqual(acc.accounts, [], 'pas de compte du site familial : pas de bouton');
            assert.ok(!(await p.$(`${dlg} [data-pn-dk="send"]`)));
        });

        await t('⇩ récupérer : aperçu ✓/✗, doublons écartés d’avance, dossier au choix ; fichier vérifié (format, taille, pas de HTML ni de script)', async () => {
            const evil = {...shareFile, name: 'Panier de cousin', items: [...shareFile.items, {kind: 'row', title: '<img src=x onerror=alert(1)>Moulin de Treignac<script>alert(2)</script>', value: 'javascript:alert(3)', url: 'javascript:alert(4)'}]};
            await openTab();
            await p.evaluate(x => { window.LCNDA_EXT.paniers.importText(JSON.stringify(x), 'cousin.lcnda-panier'); }, evil); await p.waitForSelector(`${dlg} [data-pn-irows]`);
            const rows = await p.$$eval(`${dlg} [data-pn-irows] .pn-rr`, l => l.map(x => [x.classList.contains('is-ex'), x.querySelector('b').textContent]));
            assert.deepStrictEqual(rows, [[true, 'Monument aux morts de Treignac (1921)'], [true, 'Jean MAZAUD'], [false, 'Moulin de Treignac']], JSON.stringify(rows));
            assert.ok(!(await p.$(`${dlg} img, ${dlg} script`)));
            await p.locator(`${dlg} .pn-rr`, {hasText: 'Jean MAZAUD'}).locator('[data-pn-iy]').click(); // en garder un quand même (déjà dans un autre panier : il ira, ce panier-ci ne l'a pas)
            await p.selectOption(`${dlg} [name="folder"]`, String(fam)); await p.click(`${dlg} [data-pn-dk="ok"]`); await sleep(1500);
            const b = await bBy('Panier de cousin'); assert.ok(b && b.folder_id === fam && b.count === 2, JSON.stringify(b));
            const its = await itemsOf(b.id);
            assert.ok(its.every(x => !/[<>]|alert/.test(x.title) && !/javascript/i.test(x.value) && !x.origin?.url?.startsWith('javascript')), JSON.stringify(its));
            // dans un panier qui a déjà tout : tout sauté
            const r = await cx('pn_share_import', {body: JSON.stringify(shareFile), basket_id: b.id}); assert.strictEqual(r.ids.length, 1); assert.strictEqual(r.skipped, 1);
            const bad = await p.evaluate(() => Promise.all([JSON.stringify({format: 'autre', items: []}), JSON.stringify({format: 'lcnda-panier', version: 1, items: [{title: 'x'.repeat(2100000)}]})].map(body => window.LCNDA_APP.api('cx_write', {}, {method: 'POST', body: {op: 'pn_share_preview', body}}).then(() => 'ok', e => e.message))));
            assert.match(bad[0], /pas un panier LCNDA/); assert.match(bad[1], /trop gros/);
        });

        await t('⧉ dupliquer une partie ; 🔎 chercher dans un panier puis agir sur les cochés (statut) et sur les trouvés', async () => {
            await openBasket('Témoins');
            await p.fill('[data-pn-find]', 'comète'); await p.waitForFunction(() => /trouvés sur/.test(document.querySelector('.pn-found')?.textContent || ''));
            const found = await p.$$eval('[data-pn-items] [data-pn-i]', l => l.map(x => Number(x.dataset.pnI)));
            assert.ok(found.length >= 2, String(found.length));
            // la barre de sélection commune : rien de coché → les actions portent sur « Les N trouvés » (dit dans la barre) ; une case → « 1 coché »
            assert.match(await p.textContent('[data-pn-foot] .sel-bar'), new RegExp(`Les ${found.length} trouvés`));
            assert.ok(await p.$('[data-pn-foot] .sel-bar [data-pn-a="sel-status"]'), 'les actions sont là, sur les trouvés');
            await p.check(`[data-pn-pick="${found[0]}"]`);
            assert.match(await p.textContent('[data-pn-foot] .sel-bar'), /1 coché(?!s)/);
            assert.doesNotMatch(await p.textContent('[data-pn-foot] .sel-bar'), /trouvés/);
            await menu('[data-pn-a="sel-status"]', 'vérifié'); await sleep(1200);
            const its = await itemsOf(tem);
            assert.strictEqual(its.find(x => x.id === found[0]).status, 'verifie'); assert.notStrictEqual(its.find(x => x.id === found[1]).status, 'verifie', 'seulement le coché');
            await p.fill('[data-pn-find]', 'comète'); await sleep(500);
            await p.check(`[data-pn-pick="${found[0]}"]`); await p.check(`[data-pn-pick="${found[1]}"]`);
            await p.click('[data-pn-a="sel-dup"]'); await p.waitForSelector(`${dlg} input[name="v"]`); await p.fill(`${dlg} input[name="v"]`, 'Deux comètes'); await p.click(`${dlg} [data-pn-dk="ok"]`); await sleep(1500);
            const d = await bBy('Deux comètes'); assert.ok(d && d.count === 2 && d.folder_id === mar, JSON.stringify(d));
            await openBasket('Témoins');
            await p.click('[data-pn-a="dup"]'); await p.waitForSelector(`${dlg} input[name="v"]`); await p.click(`${dlg} [data-pn-dk="ok"]`); await sleep(1500);
            assert.strictEqual((await bBy('Témoins (copie)')).count, its.length, 'tout le panier (rien de coché)');
        });

        await t('⚠ le dernier panier d’un dossier : on demande (supprimer le dossier ↶ · laisser « À trier » · annuler)', async () => {
            const f = await cx('folder_new', {name: 'Service militaire', basket_name: 'Conscription 1821'}); soloF = f.id;
            await openBasket('Conscription 1821');
            await menu('[data-pn-a="more"]', 'Supprimer le panier'); await p.waitForSelector(`${dlg} [data-pn-dk="del"]`);
            assert.match(await p.textContent(dlg), /« Service militaire » n’a plus de panier/);
            assert.deepStrictEqual(await p.$$eval(`${dlg} .modal-actions button`, l => l.map(x => x.dataset.pnDk)), ['keep', 'cancel', 'del']); // la fenêtre commune : les autres choix, puis « Annuler », puis le bouton bleu
            await p.click(`${dlg} [data-pn-dk="cancel"]`); await sleep(1500);
            assert.ok(await bBy('Conscription 1821') && await fBy('Service militaire'), 'Annuler : rien n’a changé');
            await openBasket('Conscription 1821');
            await menu('[data-pn-a="more"]', 'Supprimer le panier'); await p.waitForSelector(`${dlg} [data-pn-dk="keep"]`); await p.click(`${dlg} [data-pn-dk="keep"]`); await sleep(1500);
            assert.strictEqual((await bBy('À trier'))?.folder_id, soloF, 'un panier vide « À trier »');
            await openBasket('À trier');
            await menu('[data-pn-a="more"]', 'Supprimer le panier'); await p.waitForSelector(`${dlg} [data-pn-dk="del"]`); await p.click(`${dlg} [data-pn-dk="del"]`); await sleep(1500);
            assert.ok(!(await fBy('Service militaire')), 'le dossier est supprimé');
            await clickUndo(); assert.ok(await fBy('Service militaire') && await bBy('À trier'), '↶ : dossier et panier revenus');
        });

        await t('⤓ export tableur (CSV) ; 🏛 fiche de sortie aux archives imprimable (cotes par série, cases) ; ✉ lettres de demande ; enquête', async () => {
            await openBasket('Témoins');
            await menu('[data-pn-a="more"]', 'Tableur'); await p.waitForSelector('dialog.ui-export[open]'); // ⤓ la fenêtre d'export commune (CSV choisi d'office)
            const dl = p.waitForEvent('download'); await p.click('dialog.ui-export [data-ui-go]');
            const d = await dl; const csv = require('fs').readFileSync(await d.path(), 'utf8');
            assert.match(csv, /"Titre";"Détail";"Statut"/); assert.match(csv, /Publication des bans/);
            await p.evaluate(() => { window.__pr = null; window.LCNDA_UI.openPrintDialog = o => { window.__pr = o; return Promise.resolve(); }; });
            await menu('[data-pn-a="more"]', 'Fiche de sortie'); await sleep(300);
            const pr = await p.evaluate(() => window.__pr);
            assert.ok(pr && /Fiche de sortie aux archives/.test(pr.html) && /5 Mi 123/.test(pr.html) && /Série MI/.test(pr.html) && /☐/.test(pr.html) && /Horaires/.test(pr.html), pr && pr.html.slice(0, 400));
            await menu('[data-pn-a="more"]', 'Lettres de demande'); await p.waitForSelector(`${dlg} [data-pn-letter]`);
            assert.match(await p.textContent(dlg), /Publication des bans/); await closeAll();
            await menu('[data-pn-a="more"]', 'Créer une enquête'); await p.waitForSelector(`${dlg} [data-pn-dk="ok"]`); await p.click(`${dlg} [data-pn-dk="ok"]`); await sleep(1500);
            const inv = await p.evaluate(() => window.LCNDA_APP.api('investigations').then(r => (r.investigations || r.items || r || []).map ? (r.investigations || r.items || r).map(x => x.title) : []));
            assert.ok(inv.includes('Témoins'), JSON.stringify(inv).slice(0, 300));
        });

        await t('390 px, sombre : rien de collé au bord d’un cadre, rien qui déborde, pas de défilement de côté ; l’arbre se déroule par-dessus', async () => {
            const page2 = await B.ctx.newPage();
            const errs2 = []; page2.on('pageerror', e => errs2.push(e.message));
            await page2.setViewportSize({width: 390, height: 860});
            await page2.addInitScript(() => { const cur = JSON.parse(localStorage.getItem('genealogie-design') || '{}'); localStorage.setItem('genealogie-design', JSON.stringify({...cur, preset: 'dark'})); });
            await page2.goto(B.base + '#paniers'); await page2.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.paniers, null, {timeout: 60000});
            await page2.evaluate(() => { window.LCNDA_APP.applyDesign?.(); window.LCNDA_APP.setModule('paniers'); }); await page2.waitForSelector('[data-pn] .pn-it', {timeout: 20000}).catch(() => {});
            await page2.evaluate(n => { const b = window.LCNDA_EXT.paniers._st.baskets.find(x => x.name === n); window.LCNDA_EXT.paniers._st.sel = {t: 'b', id: b.id}; return window.LCNDA_EXT.paniers.refresh(); }, 'Témoins'); await sleep(800);
            assert.strictEqual(await page2.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark');
            const scan = async what => { const f = await page2.evaluate(detect, {root: '[data-pn]', min: 4}); assert.deepStrictEqual(f.map(x => `${what} : ${x.bad.map(b => `${b.kind} ${b.side} ${b.gap}px`).join(', ')} — ${x.kind} « ${x.label} » dans ${x.box}`), []); };
            const noSide = async () => assert.ok(await page2.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && [...document.querySelectorAll('[data-pn] *')].every(e => e.getBoundingClientRect().right <= window.innerWidth + 1 || e.closest('.pn-tree:not(:visible)'))), 'rien ne dépasse à droite');
            assert.ok(!(await page2.isVisible('[data-pn-tree]')), 'l’arbre est replié'); assert.ok(await page2.isVisible('.pn-crumbbtn'));
            await scan('le panier'); await noSide();
            await page2.click('.pn-crumbbtn'); await page2.waitForSelector('[data-pn-tree]', {state: 'visible'}); await scan('l’arbre ouvert');
            await page2.click('.pn-tclose');
            await page2.click('[data-pn-a="search"]'); await page2.fill('[data-pn-q]', 'les naissances de la famille LACOMBE à Treignac entre 1780 et 1800'); await page2.keyboard.press('Enter');
            await page2.waitForSelector('.pn-res', {timeout: 60000}); await sleep(400); await scan('la recherche'); await noSide();
            const bg = await page2.evaluate(() => getComputedStyle(document.querySelector('[data-pn]')).backgroundColor); assert.match(bg, /rgb\(28, 31, 36\)/, 'fond sombre : ' + bg);
            await page2.click('[data-pn-a="search-close"]'); await page2.click('[data-pn-a="share"]'); await page2.waitForSelector('.pn-dlg[open]'); await sleep(300);
            const fd = await page2.evaluate(detect, {root: '.pn-dlg[open]', min: 4}); assert.deepStrictEqual(fd.map(x => `${x.kind} « ${x.label} »`), [], 'la fenêtre Partager');
            assert.deepStrictEqual(errs2, []); await page2.close();
        });

        await t('📥 « Prendre depuis… » comprend « à N km autour du château de… » et « entre 10 et 12 ans » (l’âge de la personne nommée)', async () => {
            const r = await p.evaluate(async () => { const lists = window.LCNDA_EXT.connexions.kit.listsAll(); const a = await window.LCNDA_EXT.connexions.parseAsk('les éclipses qu’a vues Jean MAZAUD entre 10 et 12 ans', lists); const b = await window.LCNDA_EXT.connexions.parseAsk('les batailles à 4 km autour du château de Rochefière', lists); return {a, b}; });
            assert.strictEqual(r.a?.id, 'eclipses', JSON.stringify(r.a)); assert.deepStrictEqual([r.a.preset.period.from, r.a.preset.period.to], [1790, 1793], JSON.stringify(r.a.preset));
            assert.strictEqual(r.b?.id, 'ha_batailles', JSON.stringify(r.b));
        });

        await t('aucune erreur dans la page', async () => { assert.deepStrictEqual(B.errs, []); });
    } finally { await B.stop(); }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
