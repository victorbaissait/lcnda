'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * H10 — la barre commune des listes (lot B : familles « Médias et documents » et « Archives et sources » de docs/design/h10-listes.html) :
 *   node tests/test-h10-lot-b.js
 * Papiers de famille, Cartes d’électeur, Passeports, Inventaires après décès, Armoiries, Objets de famille, Mémoire familiale,
 * Recensements : tous les foyers, Visites d’archives.
 *  - statique : chaque liste passe par UI.listBar (jamais une barre faite main), plus d’ancienne case / menu / onglets ;
 *  - navigateur (1440 clair, 390 sombre) : liste tout à fait vide → la grande boîte K10 seule (pas de barre) ;
 *    avec des données : 🔍 Chercher, chaque rubrique de Filtrer (pastilles bleues, ×, Tout effacer), chaque tri,
 *    Liste | Fiches (Fiches au départ là où la maquette le dit), titre de colonne → « Trier », réglages retenus au rechargement,
 *    sans erreur JavaScript, sans réponse 4xx / 5xx, sans défilement de côté.
 * SHOTS=dossier pour garder des captures.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(appRoot, f), 'utf8');
const SHOTS = process.env.SHOTS || '';
let failed = 0, passed = 0;
const t = async (name, fn) => { try { await fn(); passed++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.message || e); } };
const finish = () => { if (failed) { process.exitCode = 1; console.log(`Échec : ${failed} vérification(s) en erreur, ${passed} bonnes`); } else console.log(`✓ H10 lot B : ${passed} vérifications`); };

/* chaque liste : [type, fichier, clé de la barre, Fiches au départ ?, rubriques de Filtrer, tris] */
const LISTS = [
    ['family_papers', 'assets/js/heritage.js', 'listes:family_papers', false, ['kind', 'box', 'holder', 'person', 'scan', 'label'], ['num', 'recent', 'old', 'az', 'za', 'date']],
    ['voter_cards', 'assets/js/heritage-voters.js', 'listes:voter_cards', null, ['commune', 'from', 'to', 'photo'], ['recent', 'old', 'az', 'za', 'votes', 'first']],
    ['passports', 'assets/js/heritage-tresors-papiers.js', 'listes:passports', null, ['sorte', 'person', 'place', 'from', 'to'], ['recent', 'old', 'az', 'za', 'issued']],
    ['probate', 'assets/js/heritage.js', 'listes:probate', null, ['person', 'place', 'from', 'to', 'currency', 'label'], ['recent', 'old', 'az', 'za', 'date', 'rich', 'days']],
    ['coats_of_arms', 'assets/js/heritage.js', 'listes:coats_of_arms', true, ['person', 'img', 'label'], ['recent', 'old', 'az', 'za']],
    ['family_objects', 'assets/js/app.js', 'listes:family_objects', true, ['holder', 'passed', 'photo', 'label'], ['recent', 'old', 'az', 'za']],
    ['family_memories', 'assets/js/app.js', 'listes:family_memories', true, ['kind', 'by', 'label'], ['recent', 'old', 'az', 'za']],
    ['census_households', 'assets/js/heritage-more.js', 'listes:census_households', null, ['commune', 'year', 'status', 'special'], ['year', 'place', 'members']],
    ['archive_visits', 'assets/js/app-listes.js', 'listes:archive_visits', true, ['state', 'center', 'from', 'to'], ['near', 'recent', 'old', 'az', 'za']],
];

(async () => {
    await t('statique : les 9 listes passent par la barre commune (UI.listBar), avec leur clé retenue', async () => {
        for (const [type, file, key] of LISTS) assert.ok(read(file).includes(`'${key}'`), `${type} : clé « ${key} » dans ${file}`);
        const h = read('assets/js/heritage.js'), a = read('assets/js/app.js'), m = read('assets/js/heritage-more.js'), l = read('assets/js/app-listes.js'), pp = read('assets/js/heritage-tresors-papiers.js');
        assert.ok(!/id="h-coats-q"|id="h-papers-q"/.test(h), 'plus de case de recherche faite main (Armoiries, Papiers)');
        assert.ok(!/Imprimer les étiquettes<\/button>|Imprimer l’inventaire<\/button>/.test(h), 'Papiers : « 🖨 Imprimer ▾ » dans l’en-tête');
        assert.ok(!/id="objects-q"|id="memories-q"|id="memories-kind"/.test(a), 'plus de case ni de menu faits main (Objets, Mémoire)');
        assert.ok(!/data-hc="village"|data-hc-csv/.test(m), 'Recensements : plus de menus Commune / Année ni de lien « Exporter en CSV »');
        assert.match(m, /data-hc-export[^>]*>⤓ Exporter ▾/, 'Recensements : « ⤓ Exporter ▾ » dans l’en-tête');
        assert.ok(!/archive-visit-tabs/.test(l), 'Visites d’archives : plus d’onglets À venir / Passés / Tous');
        assert.ok(!/h-pp-filter|data-pp-f=/.test(pp), 'Passeports : plus de boutons Tous / Intérieurs / Étranger');
    });
    await t('statique : le composant commun a sortColumns et listMatch (petites retouches compatibles)', async () => {
        const ui = read('assets/js/app-ui.js');
        assert.match(ui, /w\.sortColumns = \(table, map = \{\}\) =>/);
        assert.match(ui, /UI\.listMatch = \{/);
    });

    const phpPath = findPhp([devBundledPhp()]);
    let chromium = null;
    try { ({ chromium } = require('playwright')); } catch (_) { try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    if (!phpPath || !chromium) { console.log('— PHP ou Playwright absent : partie navigateur sautée'); return finish(); }

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-h10b-'));
    const dir = path.join(tmp, 'a'); fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,is_start) VALUES (1,'Antoine','BORIE','male',1),(2,'Louise','BESSE','female',0),(3,'François','BORIE','male',0),(4,'Henri','BORIE','male',0)");
$pdo->exec("INSERT INTO labels(id,name,color) VALUES (1,'Branche Martin','#0066cc'),(2,'Naves','#1aa34a')");
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env, maxBuffer: 1 << 26 });
    if (seed.status !== 0 || !String(seed.stdout).includes('ok')) { console.error(seed.stderr || seed.stdout); process.exitCode = 1; return; }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: { ...env, PHP_CLI_SERVER_WORKERS: '4' }, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    const browser = await chromium.launch();
    const newPage = async (w, dark) => {
        const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
        await ctx.addInitScript(d => {
            if (!d) return;
            let v; Object.defineProperty(window, 'LCNDA_SETTINGS', { configurable: true, get: () => v, set: x => { try { if (x && typeof x === 'object') { const g = JSON.parse(x['genealogie-design'] || '{}'); g.preset = 'dark'; x['genealogie-design'] = JSON.stringify(g); } } catch (_) {} v = x; } });
            try { const g = JSON.parse(localStorage.getItem('genealogie-design') || '{}'); g.preset = 'dark'; localStorage.setItem('genealogie-design', JSON.stringify(g)); } catch (_) {}
        }, dark);
        await ctx.route(u => !u.href.startsWith(base), r => r.abort());
        const page = await ctx.newPage(), errs = [];
        page.on('pageerror', e => errs.push('pageerror ' + e.message));
        page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console.error ' + m.text().slice(0, 300)); });
        page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) errs.push(`HTTP ${r.status()} ${r.url().slice(base.length)}`); });
        page.on('dialog', d => { errs.push('fenêtre du navigateur ' + d.message().slice(0, 80)); d.dismiss().catch(() => {}); });
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_APP?.state?.csrf, null, { timeout: 30000 });
        return { ctx, page, errs };
    };
    const open = async (page, type) => {
        await page.evaluate(tp => { const A = window.LCNDA_APP; document.querySelector('#workspace').innerHTML = ''; A.state.listType = tp; A.state.precisePlaceKey = ''; A.setModule('listes'); }, type);
        await page.waitForFunction(() => document.querySelector('#workspace .ui-listbar, #workspace .empty-box') && !document.querySelector('#workspace .ui-spinner, #workspace .loading-block'), null, { timeout: 20000 }).catch(() => {});
        await page.waitForTimeout(400);
    };
    const barInfo = page => page.evaluate(() => {
        const bar = document.querySelector('#workspace .ui-listbar');
        return { bar: !!bar, count: bar?.querySelector('.ui-listbar-count')?.textContent || '', chips: [...(bar?.querySelectorAll('.ui-listbar-chip') || [])].map(c => c.textContent.replace('×', '').trim()),
            sort: bar?.querySelector('.ui-listbar-sort select')?.value || '', sorts: [...(bar?.querySelectorAll('.ui-listbar-sort option') || [])].map(o => o.value), view: bar?.querySelector('.ui-viewtoggle .is-active')?.dataset.view || '',
            filters: [...new Set([...(bar?.querySelectorAll('[data-lb-f]') || [])].map(i => i.dataset.lbF))], empty: !!document.querySelector('#workspace .empty-box'), emptyBtn: !!document.querySelector('#workspace .empty-box button'),
            sw: document.documentElement.scrollWidth, iw: innerWidth, text: document.querySelector('#workspace').innerText };
    });
    const N = s => Number((String(s).match(/^[\d\s ]+/) || ['0'])[0].replace(/\s| /g, ''));
    try {
        /* ─── 1. tout est vide : la grande boîte K10 seule ─── */
        await t('liste tout à fait vide : pas de barre, la grande boîte K10 avec son bouton', async () => {
            const { ctx, page, errs } = await newPage(1440, false);
            for (const [type] of LISTS) {
                if (type === 'census_households') continue; // vide dans cette base aussi, vérifié plus bas
                await open(page, type);
                const r = await barInfo(page);
                assert.equal(r.bar, false, `${type} : la barre est cachée`);
                assert.ok(r.empty, `${type} : la grande boîte K10`);
                if (!['voter_cards', 'census_households'].includes(type)) assert.ok(r.emptyBtn, `${type} : le bouton pour commencer`);
            }
            await open(page, 'census_households'); assert.equal((await barInfo(page)).bar, false, 'census_households : la barre est cachée');
            assert.deepEqual(errs, []);
            await ctx.close();
        });

        /* ─── 2. des données ─── */
        {
            const { ctx, page } = await newPage(1440, false);
            const out = await page.evaluate(async () => {
                const A = window.LCNDA_APP, post = (a, body) => A.api(a, {}, { method: 'POST', body }), r = [];
                const go = async (n, pr) => { try { const x = await pr; return x; } catch (e) { r.push(n + ' : ' + e.message); return null; } };
                await go('coat1', post('save_coat_of_arms', { title: 'Armes des Borie', blazon: 'd’azur à trois fleurs de lys d’or', motto: 'Toujours droit', people: [{ person_id: 1, note: '' }, { person_id: 3, note: '' }], pending_labels: [1] }));
                await go('coat2', post('save_coat_of_arms', { title: 'Armes de Naves', blazon: 'de gueules au lion d’argent', title_of_nobility: 'Seigneur', people: [{ person_id: 2, note: '' }], pending_labels: [2] }));
                await go('coat3', post('save_coat_of_arms', { title: 'Blason Besse', people: [] }));
                await go('prob1', post('save_probate_inventory', { person_id: 1, date_text: '12 mars 1782', notary: 'Me Dubois', place_text: 'Tulle', currency: 'livre', items: [{ room: 'Cuisine', category: 'meubles', description: 'Table', quantity: '1', value_text: '12 l' }], pending_labels: [1] }));
                await go('prob2', post('save_probate_inventory', { person_id: 3, date_text: '1850', notary: 'Me Lacombe', place_text: 'Brive', currency: 'franc', items: [{ room: 'Chambre', category: 'meubles', description: 'Lit', quantity: '1', value_text: '250' }] }));
                await go('prob3', post('save_probate_inventory', { person_id: 2, date_text: '1799', notary: 'Me Peyre', place_text: 'Naves', currency: 'livre', items: [{ room: 'Étable', category: 'betail', description: 'Vache', quantity: '2', value_text: '80 l' }] }));
                await go('pap1', post('save_family_paper', { class_number: 'P-0001', title: 'Livret de famille Borie-Besse', kind: 'Livret de famille', date_text: '1923', storage_location: 'Boîte 1', holder_text: 'Chez moi', people: [1, 2], pending_labels: [1] }));
                await go('pap2', post('save_family_paper', { class_number: 'P-0002', title: 'Lettre de Jean', kind: 'Lettre', date_text: '1916', storage_location: 'Boîte 1', holder_text: 'Chez moi', people: [3] }));
                await go('pap3', post('save_family_paper', { class_number: 'P-0003', title: 'Acte de vente', kind: 'Acte notarié', date_text: '1788', storage_location: 'Classeur bleu', holder_text: 'Tante Monique', people: [] }));
                const o1 = await go('obj1', post('save_family_object', { title: 'Horloge comtoise', kind: 'Meuble', holder_person_id: 1, transfers: [{ from_person_id: 3, to_person_id: 1, date_text: '1920' }] }));
                await go('obj2', post('save_family_object', { title: 'Bague de fiançailles', kind: 'Bijou', holder_text: 'Cousine Anne', transfers: [{ from_person_id: 2, to_text: 'Cousine Anne', date_text: '1960' }] }));
                if (o1?.result?.id) await go('objlab', post('set_label_links', { entity_type: 'family_object', entity_id: o1.result.id, label_ids: [2] }));
                await go('mem1', post('save_family_memory', { kind: 'recipe', title: 'La tarte aux pommes de mémé', content: 'Six pommes, du beurre.', people: [{ person_id: 2, role: 'transmitted' }] }));
                await go('mem2', post('save_family_memory', { kind: 'expression', title: 'Il pleut des cordes', content: 'Dit par le grand-père.', people: [{ person_id: 1, role: 'transmitted' }] }));
                await go('vot1', post('save_voter_cards', { person_id: 1, cards: [{ commune: 'Tulle', issued: '1919' }], votes: [{ date_text: '1919', election: 'legislatives' }, { date_text: '1924', election: 'legislatives' }] }));
                await go('vot2', post('save_voter_cards', { person_id: 2, cards: [{ commune: 'Naves', issued: '1945' }], votes: [{ date_text: '1945', election: 'municipales' }] }));
                await go('pp1', post('tresor_write', { op: 'save', item: { kind: 'passport', person_id: 1, title: 'Passeport d’Antoine', data: { sorte: 'interieur', date: '1823', commune: 'Tulle', destination: 'Paris' } } }));
                await go('pp2', post('tresor_write', { op: 'save', item: { kind: 'passport', person_id: 3, title: 'Passeport de François', data: { sorte: 'interieur', date: '1841', commune: 'Brive', destination: 'Lyon' } } }));
                await go('pp3', post('tresor_write', { op: 'save', item: { kind: 'passport', person_id: 4, title: 'Passeport d’Henri', data: { sorte: 'etranger', date: '1856', commune: 'Tulle', destination: 'Buenos Aires' } } }));
                await go('av1', post('save_archive_visit_plan', { title: 'AD Corrèze', archive_center: 'Archives départementales de la Corrèze', visit_date: '2099-03-12' }));
                await go('av2', post('save_archive_visit_plan', { title: 'AM Brive', archive_center: 'Archives municipales de Brive', visit_date: '2001-05-02' }));
                const v3 = await go('av3', post('save_archive_visit_plan', { title: 'AD Cantal', archive_center: 'Archives départementales du Cantal', visit_date: '2002-06-10' }));
                if (v3?.result?.id) await go('av3done', post('save_archive_visit_done', { visit_id: v3.result.id, done_at: '2002-06-10' }));
                return r;
            });
            await ctx.close();
            await t('données d’essai enregistrées', async () => assert.deepEqual(out, []));
            const php = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`require 'lib/paths.php'; require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO census_records(id,year,status,address,is_special) VALUES (1,1906,'found','rue du Moulin',0),(2,1911,'todo','',1),(3,1906,'found','place de l''église',0)");
$pdo->exec("INSERT INTO census_members(census_id,person_id,display_name,occupation,is_primary) VALUES (1,1,'Antoine BORIE','cultivateur',1),(1,2,'Louise BESSE','ménagère',0),(3,3,'François BORIE','maçon',1)"); echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
            await t('recensements d’essai enregistrés', async () => assert.match(String(php.stdout), /ok/, php.stderr));
        }

        /* ─── 3. chaque liste : chercher, filtrer, trier, Liste | Fiches, colonnes, retenu ─── */
        const SEARCH = { family_papers: ['lettre', 1], voter_cards: ['naves', 1], passports: ['buenos', 1], probate: ['lacombe', 1], coats_of_arms: ['lion', 1], family_objects: ['horloge', 1], family_memories: ['pommes', 1], census_households: ['maçon', 1], archive_visits: ['cantal', 1] };
        const ONE = { // une rubrique de Filtrer à cocher dans le menu (→ nombre attendu) ; une autre posée par setFilter (menu de choix)
            family_papers: [['box', 'Classeur bleu', 1], ['person', { id: 3, title: 'François BORIE' }, 1]],
            voter_cards: [['photo', 'no', 2], ['commune', 'txt:Tulle', 1]],
            passports: [['sorte', 'etranger', 1], ['person', { id: 1, title: 'Antoine BORIE' }, 1]],
            probate: [['currency', 'franc', 1], ['place', 'txt:Naves', 1]],
            coats_of_arms: [['img', 'no', 3], ['label', { id: 2, title: 'Naves' }, 1]],
            family_objects: [['photo', 'no', 2], ['passed', { id: 2, title: 'Louise BESSE' }, 1]],
            family_memories: [['kind', 'recipe', 1], ['by', { id: 1, title: 'Antoine BORIE' }, 1]],
            census_households: [['year', '1906', 2], ['special', true, 1]],
            archive_visits: [['state', 'done', 1], ['center', 'txt:Brive', 1]],
        };
        for (const [w, dark] of [[1440, false], [390, true]]) {
            const tag = `${w} px ${dark ? 'sombre' : 'clair'}`;
            const { ctx, page, errs } = await newPage(w, dark);
            for (const [type, , key, cards, filters, sorts] of LISTS) {
                await t(`${tag} · ${type} : barre, chercher, filtrer, trier, présentation, retenu`, async () => {
                    errs.length = 0;
                    await page.evaluate(k => { try { localStorage.removeItem('lcnda-listbar:' + k); localStorage.removeItem('lcnda-view:' + k); localStorage.removeItem('lcnda-sort:' + k); } catch (_) {} }, key);
                    await open(page, type);
                    let r = await barInfo(page);
                    assert.ok(r.bar, 'la barre est là');
                    assert.ok(r.sw <= r.iw, `pas de défilement de côté (${r.sw} > ${r.iw})`);
                    assert.deepEqual(r.sorts, sorts, 'les tris de la maquette');
                    assert.equal(r.view, cards === null ? '' : cards ? 'cards' : 'list', '« Liste | Fiches » et sa présentation de départ');
                    if (SHOTS) await (w > 500 ? page.screenshot({ path: path.join(SHOTS, `${type}-${w}${dark ? '-sombre' : ''}.png`), fullPage: true }) : page.locator('#workspace').screenshot({ path: path.join(SHOTS, `${type}-${w}${dark ? '-sombre' : ''}.png`) }));
                    // la rubrique « État » des visites est cochée au départ (« À venir ») : on part de tout
                    if (type === 'archive_visits') { assert.deepEqual(r.chips, ['À venir'], 'Visites : « À venir » au départ, en pastille'); await page.evaluate(() => document.querySelector('#workspace .ui-listbar').clear()); r = await barInfo(page); }
                    const total = N(r.count);
                    assert.ok(total >= 2, `${type} : ${r.count}`);
                    // Filtrer : les rubriques de la maquette
                    await page.click('#workspace .ui-listbar-fbtn');
                    const inMenu = await page.evaluate(() => [...new Set([...document.querySelectorAll('.ui-listbar-menu [data-lb-f], .ui-listbar-menu [data-lb-row]')].map(i => i.dataset.lbF || i.dataset.lbRow))]);
                    for (const f of filters) assert.ok(inMenu.includes(f), `rubrique « ${f} » dans Filtrer (${inMenu.join(', ')})`);
                    // 1) une case du menu
                    const [fid, fval, fn] = ONE[type][0];
                    if (fval === true) await page.check(`.ui-listbar-menu [data-lb-f="${fid}"]`);
                    else await page.check(`.ui-listbar-menu [data-lb-f="${fid}"][value="${fval}"]`);
                    await page.click('.ui-listbar-menu [data-lb-done]');
                    r = await barInfo(page);
                    assert.equal(N(r.count), fn, `filtre ${fid} : ${r.count}`);
                    assert.equal(r.chips.length, 1, 'une pastille bleue');
                    const firstChip = r.chips[0];
                    // 2) une autre rubrique (menu de choix ou valeur) → 2 pastilles + « Tout effacer »
                    const [gid, gval, gn] = ONE[type][1];
                    await page.evaluate(([id, v]) => document.querySelector('#workspace .ui-listbar').setFilter(id, v), [gid, gval]);
                    r = await barInfo(page);
                    assert.equal(r.chips.length, 2, `deux pastilles (${r.chips.join(' | ')})`);
                    assert.ok(await page.$('#workspace .ui-listbar-clearall'), '« Tout effacer »');
                    // × sur la première pastille → il reste la seconde
                    await page.locator('#workspace .ui-listbar-chip', { hasText: firstChip }).first().click();
                    r = await barInfo(page);
                    assert.equal(r.chips.length, 1, 'une pastille retirée par ×');
                    assert.equal(N(r.count), gn, `filtre ${gid} seul : ${r.count}`);
                    await page.evaluate(() => document.querySelector('#workspace .ui-listbar').clear(true));
                    r = await barInfo(page); assert.equal(N(r.count), total, 'Tout effacer : tout revient'); assert.equal(r.chips.length, 0);
                    // 🔍 Chercher
                    const [q, qn] = SEARCH[type];
                    await page.fill('#workspace .ui-listbar-q input', q); await page.waitForTimeout(450);
                    r = await barInfo(page);
                    assert.equal(N(r.count), qn, `chercher « ${q} » : ${r.count}`);
                    await page.fill('#workspace .ui-listbar-q input', 'zzzqqq'); await page.waitForTimeout(450);
                    r = await barInfo(page);
                    assert.match(r.text, /ne correspond/, 'rien trouvé : la boîte « … ne correspond »');
                    assert.equal(r.bar, true, 'la barre reste quand la recherche ne trouve rien');
                    await page.fill('#workspace .ui-listbar-q input', ''); await page.waitForTimeout(450);
                    // chaque tri
                    for (const s of sorts) { await page.selectOption('#workspace .ui-listbar-sort select', s); await page.waitForTimeout(80); assert.equal(N((await barInfo(page)).count), total, `tri ${s}`); }
                    // titre de colonne → « Trier » (listes en tableau)
                    const colSort = { probate: ['person', 'az', 'za'], passports: ['who', 'az', 'za'], voter_cards: ['name', 'az', 'za'], family_papers: ['title', 'az', 'za'] }[type];
                    if (colSort) {
                        await page.click(`#workspace [data-sort-key="${colSort[0]}"]`); assert.equal((await barInfo(page)).sort, colSort[1], 'clic sur le titre → Trier A → Z');
                        await page.click(`#workspace [data-sort-key="${colSort[0]}"]`); assert.equal((await barInfo(page)).sort, colSort[2], 'second clic → Z → A');
                    }
                    // Liste | Fiches
                    if (cards !== null) {
                        const other = cards ? 'list' : 'cards';
                        await page.click(`#workspace .ui-viewtoggle [data-view="${other}"]`);
                        assert.equal((await barInfo(page)).view, other);
                        assert.ok(await page.$(other === 'cards' ? '#workspace .ui-cards, #workspace .archive-visit-plans' : '#workspace .ui-rows, #workspace .data-table'), `présentation ${other}`);
                    }
                    // réglages retenus au rechargement
                    await page.fill('#workspace .ui-listbar-q input', q); await page.waitForTimeout(450);
                    const before = await barInfo(page);
                    await page.reload(); await page.waitForFunction(() => window.LCNDA_APP?.state?.csrf, null, { timeout: 30000 });
                    await open(page, type);
                    const after = await barInfo(page);
                    assert.equal(await page.inputValue('#workspace .ui-listbar-q input'), q, 'la recherche est retenue');
                    assert.equal(after.sort, before.sort, 'le tri est retenu'); assert.equal(after.view, before.view, 'la présentation est retenue');
                    assert.equal(after.count, before.count);
                    assert.ok(after.sw <= after.iw, 'pas de défilement de côté');
                    assert.deepEqual(errs, []);
                });
            }
            await ctx.close();
        }
    } finally {
        await browser.close();
        proc.kill();
        fs.rmSync(tmp, { recursive: true, force: true });
    }
    finish();
})().catch(e => { console.error(e); process.exitCode = 1; });
