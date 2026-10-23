'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🗂 Sections des fiches et 🐾 fiche animal unique (assets/js/app-sections.js, sections.css, app-apparence.js, heritage-pets.js,
 * heritage-suivi-fiche.js, lib/pets.php, migration 67) :   node tests/test-sections-fiches.js   (SHOTS=dossier pour les captures)
 *  1. sans navigateur : sections calculées sans changer l'ordre des blocs, sections de départ des animaux, options nettoyées
 *     (« Espace entre sections » ignoré), numéros I, II, III ;
 *  2. les fichiers : script et feuille dans index.php, clés du défaut du site et des réglages enregistrés, migration 67, FAQ, CLAUDE.md ;
 *  3. le serveur : un animal qui n'avait que la page simple reçoit sa fiche complète (migration 67), rien n'est perdu (photos,
 *     notes, données) ; « ＋ Nouvel animal » crée la fiche complète ;
 *  4. le navigateur : sections et styles, onglets et leur place, « ▦ Tout voir », repli retenu, numéros ; ancien réglage repris sans
 *     changement visible ; éditeur « Comme avant » et « Nouveau » (largeur, 👁, Déplacer vers, nouvelle section, supprimer +
 *     ↶ Annuler, glisser, Alt + ↑ / ↓) ; exception par fiche ; A4 déplacé et toujours appliqué ; fiche animal unique (anciens liens,
 *     blocs du suivi) ; ＋ Nouvelle observation dans chaque place + touche O ; Vu la dernière fois (4 pastilles, seuils) ;
 *     390 px ; sombre ; mode consultation en lecture seule ; aucune erreur JavaScript.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const vm = require('node:vm');
const { spawn, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const SHOTS = process.env.SHOTS || '';
const J = v => JSON.parse(JSON.stringify(v)); // les tableaux du petit navigateur (vm) viennent d'un autre « monde »

/* ── le moteur des sections dans un petit navigateur (sans DOM) ── */
function engine(store = {}) {
    const localStorage = {getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }, key: i => Object.keys(store)[i], get length() { return Object.keys(store).length; }};
    const ORDER = ['identity', 'animal', 'web_search', 'events', 'ascendants', 'descendants', 'media', 'notes', 'sources', 'event_map', 'bio', 'meteo', 'animal_marks', 'animal_obs'];
    const app = {ANIMAL_BLOCKS: ['animal', 'animal_marks', 'animal_obs'], blockBaseKey: k => (k === 'animal' ? 'genealogie-animal-blocks' : 'genealogie-person-blocks'),
        personBlockSettings: (pid, kind) => { let s = {order: ORDER, hidden: [], widths: {}}; try { s = {...s, ...JSON.parse(store[app.blockBaseKey(kind)] || '{}')}; } catch (_) {} s.order = [...s.order, ...ORDER.filter(k => !s.order.includes(k))]; return s; }, plural: (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`};
    const document = {readyState: 'complete', addEventListener() {}, body: {classList: {contains: () => false}}, documentElement: {classList: {contains: () => false}}, querySelector: () => null, querySelectorAll: () => []};
    const window = {LCNDA_APP: app, LCNDA_EXT: {}, addEventListener() {}};
    const ctx = {window, document, localStorage, console, setTimeout, matchMedia: () => ({matches: false}), CSS: {escape: s => s}};
    vm.createContext(ctx); vm.runInContext(read('assets/js/app-sections.js'), ctx);
    return {S: window.LCNDA_SECTIONS, store, ORDER};
}

(async () => {
    /* ═════ 1. sans navigateur ═════ */
    await t('personnes : les sections calculées suivent l’ordre gardé (la fiche ne change pas, les titres en plus)', () => {
        const {S, ORDER} = engine();
        const m = S.model('human', 0), g = S.groups(m);
        assert.deepEqual(J(g.secs.flatMap(s => s.keys)), ORDER.filter(k => !k.startsWith('animal')), 'mêmes blocs, même ordre');
        assert.deepEqual(J(m.sections.map(s => s.name)), ['Identité', 'Famille', 'Documents', 'Vie']);
        assert.equal(g.loose.length, 0, 'rien sans section');
        assert.equal(m.derived, true);
    });
    await t('animaux : les six sections de l’ancienne page, chaque bloc du suivi dans la sienne', () => {
        const {S} = engine();
        const m = S.model('animal', 0), g = S.groups(m);
        assert.deepEqual(J(m.sections.map(s => s.name)), ['Fiche', 'Bagues et marques', 'Observations', 'Santé', 'Groupe', 'Carte']);
        assert.deepEqual(J(g.secs.find(s => s.id === 's_marks').keys), ['animal_marks']);
        assert.deepEqual(J(g.secs.find(s => s.id === 's_obs').keys), ['animal_obs']);
    });
    await t('options nettoyées : « Espace entre sections » ignoré, valeurs inconnues remises, numéros I II III / A B C', () => {
        const {S} = engine();
        const o = S.cleanOpts({style: 'xxx', gap: 24, place: 'full', all: 'none', empty: 'hide', editor: 'new'});
        assert.equal(o.style, 'line'); assert.equal(o.place, 'full'); assert.equal(o.all, 'none'); assert.equal(o.empty, 'hide'); assert.equal(o.editor, 'new');
        assert.ok(!('gap' in o)); assert.equal(S.cleanOpts({}).editor, 'avant', '« Comme avant » au départ');
        assert.equal(S.numText(3, 'I'), 'III'); assert.equal(S.numText(4, 'I'), 'IV'); assert.equal(S.numText(2, 'A'), 'B'); assert.equal(S.numText(7, '1'), '7');
    });
    await t('ranger une fois : les sections et les blocs sont gardés avec l’ordre, les largeurs et les cases d’avant', () => {
        const {S, store} = engine({'genealogie-person-blocks': JSON.stringify({order: ['notes', 'identity', 'events'], hidden: ['events'], widths: {notes: '6'}})});
        const m = S.model('human', 0); m.sections.push({id: 's_new', name: 'Métier', icon: '🧩'}); m.assign.notes = 's_new'; S.save(m);
        const v = JSON.parse(store['genealogie-person-blocks']);
        assert.deepEqual(v.hidden, ['events']); assert.equal(v.widths.notes, '6'); assert.equal(v.assign.notes, 's_new'); assert.ok(v.sections.some(s => s.name === 'Métier'));
        assert.ok(v.order.includes('animal_marks'), 'les blocs des animaux restent dans l’ordre gardé');
    });
    await t('l’ancien « ordre des parties » de la page simple est repris dans les blocs des animaux', () => {
        const {S, store} = engine({'genealogie-pet-sections': JSON.stringify({order: ['photos', 'identity', 'notes'], hidden: ['notes']})});
        S.migratePetLayout();
        const v = JSON.parse(store['genealogie-animal-blocks']);
        assert.ok(v.order.indexOf('media') < v.order.indexOf('animal') && v.order.indexOf('animal') < v.order.indexOf('notes'), v.order.join());
        assert.ok(v.hidden.includes('notes')); assert.equal(v.petLayout, 1);
    });

    /* ═════ 2. les fichiers ═════ */
    await t('fichiers : index.php, défaut du site, réglages enregistrés, migration 67, FAQ, CLAUDE.md, UI.md', () => {
        const idx = read('index.php'); assert.match(idx, /assets\/js\/app-sections\.js\?v=\d+/); assert.match(idx, /assets\/css\/sections\.css\?v=\d+/);
        const app = read('assets/js/app.js'), sd = app.match(/const SITE_DEFAULT_KEYS = \[([\s\S]*?)\];/)[1], api = read('api.php');
        ['genealogie-animal-blocks', 'genealogie-sheet-sections', 'genealogie-sheet-head'].forEach(k => { assert.ok(sd.includes(`'${k}'`), k); assert.ok(api.includes(`'${k}'`), k); assert.ok(read('assets/js/heritage-studio.js').includes(`'${k}'`), k); });
        const mig = read('lib/migrations.php'); assert.match(mig, /const SCHEMA_VERSION = 6[7-9];/); assert.match(mig, /67 => 'schema_v67'/);
        const faq = read('assets/js/heritage-more.js'); assert.match(faq, /Un animal a-t-il encore deux fiches/); assert.match(faq, /Comment changer l’ordre des sections et des blocs de la fiche/);
        assert.match(read('CLAUDE.md'), /Sections des fiches et fiche animal unique/); assert.match(read('docs/UI.md'), /Sections des fiches/);
        assert.doesNotMatch(read('assets/js/heritage-pets.js'), /class="page h-pet"/, 'plus de page simple');
    });

    /* ═════ 3 et 4. le serveur et le navigateur ═════ */
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    let phpPath = null;
    try { const {findPhp, devBundledPhp} = require('../electron/php-server'); phpPath = findPhp([devBundledPhp()]); } catch (_) { phpPath = null; }
    if (!phpPath) { console.log('— serveur : PHP absent, partie sautée'); return finish(); }
    const {phpRuntimeArgs} = require('../electron/php-server');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-sections-'));
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
    const php = code => spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], {cwd: root, encoding: 'utf8', env});
    // une base faite comme avant la mise à jour (structure 66) : deux animaux qui n'ont que leur « fiche d'animal » (page simple)
    let r = php(String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Jeanne','MARTIN','female','deceased'),('Antoine','LEROY','male','living'),('<img src=x onerror=window.__xss=1>','PIÈGE','unknown','unknown')");
$p = null; require 'lib/bootstrap.php'; $pdo = db();
file_put_contents(MEDIA_DIR . '/minette.png', base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='));
$pdo->exec("INSERT INTO media(id,title,media_type,filename,source_type) VALUES(801,'Minette au soleil','image','minette.png','local')");
$d1 = json_encode(['name' => 'Minette', 'species' => 'chat', 'breed' => 'Chartreux', 'sex' => 'F', 'microchip' => '250269812345678', 'tattoo' => '2KLM45', 'breeder' => 'Chatterie du Clos', 'notes' => 'Aime le soleil', 'birth_date' => '03/04/2019', 'titles' => [['date' => '2021', 'event' => 'Expo féline', 'title' => 'Championne']], 'owners' => [], 'vaccines' => [], 'tests' => [], 'measures' => [['date' => '2024-01-01', 'weight' => '4,1'], ['date' => '2025-01-01', 'weight' => '4,3']], 'events' => []], JSON_UNESCAPED_UNICODE);
$d2 = json_encode(['name' => 'Gaston', 'species' => 'oiseau', 'sex' => 'M', 'color' => 'Noire', 'owners' => [], 'titles' => [], 'vaccines' => [], 'tests' => [], 'measures' => [], 'events' => []], JSON_UNESCAPED_UNICODE);
$pdo->prepare('INSERT INTO pets(id,data_json) VALUES(501,?),(502,?)')->execute([$d1, $d2]);
$pdo->exec("INSERT INTO family_collection_media(collection_type,collection_id,media_id,position) VALUES('pet',501,801,1)");
$pdo->exec('PRAGMA user_version = 66');
echo 'ok';`);
    if (r.status !== 0 || !String(r.stdout).includes('ok')) { console.error(r.stderr || r.stdout); process.exit(1); }
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const port = Number(process.env.SECTIONS_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    let cookie = '';
    const html = await (await fetch(base).then(x => { cookie = (x.headers.get('set-cookie') || '').split(';')[0]; return x; })).text();
    const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
    const get = async (action, q = {}) => (await fetch(`${base}api.php?action=${action}&${new URLSearchParams(q)}`, {headers: {Cookie: cookie}})).json();
    const post = async (action, body) => (await fetch(`${base}api.php?action=${action}`, {method: 'POST', headers: {Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf}, body: JSON.stringify({...body, csrf})})).json();
    const ids = {};
    try {
        await t('migration 67 : chaque animal a reçu sa fiche complète, rien n’est perdu, message unique', async () => {
            const pets = (await get('pets')).pets;
            assert.equal(pets.length, 2);
            pets.forEach(p => assert.ok(p.person_id > 0, `${p.title} a sa fiche complète`));
            const minette = await get('pet', {id: 501}); ids.minette = minette.person_id; ids.gaston = pets.find(p => p.id === 502).person_id;
            assert.equal(minette.data.microchip, '250269812345678'); assert.equal(minette.data.breed, 'Chartreux'); assert.equal(minette.data.titles.length, 1);
            const det = await get('person', {id: ids.minette});
            assert.equal(det.person.kind, 'animal'); assert.equal(det.person.first_name, 'Minette');
            assert.ok(det.media.some(m => Number(m.id) === 801), 'la photo est dans les Médias de la fiche');
            assert.ok((det.notes || []).some(n => /soleil/.test(n.body || '')), 'les notes sont dans les Notes de la fiche');
            assert.ok(det.events.some(e => e.gedcom_tag === 'BIRT'), 'la naissance est un événement');
            const n = php(String.raw`require 'lib/bootstrap.php'; echo db()->query("SELECT value FROM app_settings WHERE key='genealogie-pets-merged'")->fetchColumn();`).stdout;
            assert.equal(JSON.parse(n).n, 2);
        });
        await t('« ＋ Nouvel animal » crée directement la fiche complète', async () => {
            const sv = await post('save_pet', {id: 0, data: {name: 'Pacha', species: 'chat', sex: 'M', owners: [], titles: [], vaccines: [], tests: [], measures: [], events: []}});
            assert.ok(Number(sv.result?.person_id || sv.person_id) > 0);
            const an = await post('suivi_write', {op: 'create_animal', name: 'Plume', species: 'oiseau', profile: 'oiseau'});
            assert.ok(Number((await get('pet', {id: an.result.id})).person_id) > 0, 'aussi depuis le suivi');
        });
        // le suivi de Gaston : bagues, une observation d'hier
        const y = new Date(Date.now() - 864e5), yFr = `${String(y.getDate()).padStart(2, '0')}/${String(y.getMonth() + 1).padStart(2, '0')}/${y.getFullYear()}`;
        await post('suivi_write', {op: 'save_profile', pet_id: 502, taxon: 'Corneille noire', profile: 'oiseau', ringed_date: '12/05/2025', status: 'suivi'});
        await post('suivi_write', {op: 'save_mark', pet_id: 502, kind: 'color_rings', colors: {L: [{color: '#1a8a3a', name: 'vert'}, null], R: [{color: '#d7262e', name: 'rouge', code: '7K'}, null]}, start_date: '12/05/2025'});
        const obs = await post('suivi_write', {op: 'save_obs', pet_id: 502, date: yFr, time: '17:40', place_text: 'Buttes-Chaumont', observer_txt: 'Antoine LEROY', reliability: 'full'});
        ids.obs = obs.result?.id;

        if (!chromium) { console.log('— navigateur : Playwright absent, partie sautée'); return; }
        const browser = await chromium.launch();
        const errs = [];
        const open = async (w = 1440, extra = {}) => {
            const page = await browser.newPage({viewport: {width: w, height: 1000}, ...extra});
            page.on('pageerror', e => errs.push(`${w}px : ${e.message}`)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(`${w}px console : ${m.text()}`); });
            page.on('dialog', d => d.dismiss().catch(() => {}));
            await page.route(u => !u.toString().startsWith(base), rt => rt.abort());
            await page.goto(base, {waitUntil: 'load'}); await page.waitForTimeout(1200);
            return page;
        };
        const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, {recursive: true}); await page.screenshot({path: path.join(SHOTS, name + '.png')}); } };
        const toPerson = (page, id) => page.evaluate(async i => { const A = window.LCNDA_APP; A.state.currentPersonId = i; await A.setModule('personnes'); await A.selectPerson(i, false); }, id);
        const toSheets = page => page.evaluate(async () => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'design_sheets'; await A.setModule('maintenance'); });
        const setLS = (page, k, v) => page.evaluate(([k, v]) => { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, [k, v]);
        const getLS = (page, k) => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
        const pblocks = page => page.$$eval('#workspace .person-page [data-pblock]', els => els.map(e => e.dataset.pblock));
        try {
            const page = await open();
            await t('fiche d’une personne : 4 sections de départ, mêmes blocs dans le même ordre qu’avant', async () => {
                await toPerson(page, 1); await page.waitForSelector('.fsec-wrap.is-line .fsec');
                const titles = await page.$$eval('.fsec .fsec-name', e => e.map(x => x.textContent));
                assert.deepEqual([...titles].sort(), ['Documents', 'Famille', 'Identité', 'Vie']);
                const order = await pblocks(page);
                const flat = await page.evaluate(() => { const A = window.LCNDA_APP, s = A.personBlockSettings(1, 'human'); return s.order.filter(k => !s.hidden.includes(k)); });
                assert.deepEqual(order, flat.filter(k => order.includes(k)), 'l’ordre des blocs n’a pas bougé');
                assert.match(await page.textContent('.fsec .fsec-num'), /^1$/);
                await shot(page, 'fiche-sections-1440');
            });
            await t('ancien réglage (ordre, blocs cachés, largeurs) repris sans changement visible', async () => {
                await setLS(page, 'genealogie-person-blocks', {order: ['notes', 'identity', 'events', 'media', 'sources'], hidden: ['web_search', 'ascendants'], widths: {notes: '6', identity: '6'}});
                await toPerson(page, 1); await page.waitForSelector('.fsec');
                const order = await pblocks(page);
                assert.deepEqual(order.slice(0, 5), ['notes', 'identity', 'events', 'media', 'sources']);
                assert.ok(!order.includes('ascendants') && !order.includes('web_search'));
                assert.ok(await page.$eval('[data-pblock="notes"]', e => e.classList.contains('span-6')));
                assert.equal(await page.locator('.fsec.is-loose').count(), 0, 'rien sans section');
                await setLS(page, 'genealogie-person-blocks', null);
            });
            await t('les styles : trait, encadrée, grand titre, bandeau, centré (même fiche, autre titre)', async () => {
                for (const st of ['box', 'big', 'band', 'center', 'line']) {
                    await setLS(page, 'genealogie-sheet-sections', {style: st}); await toPerson(page, 1);
                    await page.waitForSelector(`.fsec-wrap.is-${st} .fsec-head`);
                    if (st === 'band') { const bg = await page.$eval('.fsec-head', e => getComputedStyle(e).backgroundColor); const blue = await page.evaluate(() => { const d = document.createElement('i'); d.style.color = 'var(--blue)'; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; }); assert.equal(bg, blue, 'le bandeau a la couleur principale'); }
                    if (st === 'box') await shot(page, 'style-encadree');
                }
            });
            await t('onglets en haut : un onglet par section, place des onglets, « ▦ Tout voir », retenu, ← →', async () => {
                await setLS(page, 'genealogie-sheet-sections', {style: 'tabs', place: 'right', all: 'left'}); await toPerson(page, 1);
                await page.waitForSelector('.fsec-tabs-wrap.is-place-right .fsec-tab');
                assert.equal(await page.$eval('.fsec-tabs .fsec-tab', e => e.dataset.fsecTab), '__all', 'Tout voir à gauche');
                assert.equal(await page.locator('.fsec:not(.is-loose):not([hidden])').count(), 1, 'une section à la fois');
                const second = await page.$$eval('.fsec-tab:not(.is-all)', e => e[1].dataset.fsecTab);
                await page.click(`.fsec-tab[data-fsec-tab="${second}"]`);
                assert.equal(await page.$eval('.fsec:not(.is-loose):not([hidden])', e => e.dataset.fsec), second);
                await toPerson(page, 1); await page.waitForSelector('.fsec-tab.is-active');
                assert.equal(await page.$eval('.fsec-tab.is-active', e => e.dataset.fsecTab), second, 'onglet retenu');
                await page.focus('.fsec-tab.is-active'); await page.keyboard.press('ArrowRight');
                assert.notEqual(await page.$eval('.fsec-tab.is-active', e => e.dataset.fsecTab), second, '→ passe à l’onglet suivant');
                await page.click('.fsec-tab.is-all'); assert.ok(await page.locator('.fsec-wrap.is-all').count());
                assert.ok(await page.locator('.fsec:not(.is-loose):not([hidden])').count() >= 4, 'tout voir');
                for (const pl of ['left', 'center', 'full', 'avant']) { await setLS(page, 'genealogie-sheet-sections', {style: 'tabs', place: pl}); await toPerson(page, 1); await page.waitForSelector(`.fsec-tabs-wrap.is-place-${pl}`); }
                await page.click('.fsec-tab:not(.is-all)'); await shot(page, 'onglets-1440');
                await setLS(page, 'genealogie-sheet-sections', {style: 'tabs', all: 'none'}); await toPerson(page, 1); await page.waitForSelector('.fsec-tab');
                assert.equal(await page.locator('.fsec-tab.is-all').count(), 0, 'Tout voir caché');
            });
            await t('replier une section : retenu d’une fiche à l’autre ; numéros des blocs par section, romains', async () => {
                await setLS(page, 'genealogie-sheet-sections', {style: 'line', numW: 'I', blockNums: 'sec'}); await toPerson(page, 1);
                await page.waitForSelector('.fsec [data-fsec-fold]');
                assert.equal(await page.textContent('.fsec .fsec-num'), 'I');
                assert.match(await page.$eval('.fsec .card-index', e => e.textContent), /^I\.1$/);
                const id = await page.$eval('.fsec', e => e.dataset.fsec);
                await page.click(`.fsec[data-fsec="${id}"] [data-fsec-fold]`);
                assert.ok(await page.$eval(`.fsec[data-fsec="${id}"]`, e => e.classList.contains('is-folded')));
                await toPerson(page, 2); await page.waitForSelector('.fsec');
                assert.ok(await page.$eval(`.fsec[data-fsec="${id}"]`, e => e.classList.contains('is-folded')), 'retenu sur une autre fiche');
                await page.click(`.fsec[data-fsec="${id}"] [data-fsec-fold]`);
                await setLS(page, 'genealogie-sheet-sections', null);
            });
            await t('éditeur « Comme avant » (départ) : largeur, case, Déplacer vers, nouvelle section, supprimer + ↶ Annuler', async () => {
                await toPerson(page, 1); await toSheets(page); await page.waitForSelector('#fsec-blocks .fsed.is-avant [data-fsed-block]');
                assert.equal(await page.locator('#fsec-pres .is-active').textContent(), 'Comme avant');
                assert.equal(await page.locator('[data-order-save^="person-blocks"]').count(), 0, 'plus de bouton « Enregistrer ces blocs »');
                const ed = '#fsec-blocks [data-fsec-editor="0"]';
                await page.click(`${ed} [data-fsed-block="notes"] [data-fsed-width="6"]`);
                await page.waitForFunction(() => JSON.parse(localStorage.getItem('genealogie-person-blocks') || '{}').widths?.notes === '6');
                await page.click(`${ed} [data-fsed-block="sources"] [data-fsed-bshow]`);
                await page.waitForFunction(() => (JSON.parse(localStorage.getItem('genealogie-person-blocks') || '{}').hidden || []).includes('sources'));
                await page.click(`${ed} [data-fsed-block="notes"] [data-fsed-bmore]`); await page.click('.ui-actmenu button:has-text("Déplacer vers")');
                await page.click('.ui-actmenu button:has-text("Famille")');
                await page.waitForFunction(() => JSON.parse(localStorage.getItem('genealogie-person-blocks') || '{}').assign?.notes === 's_family');
                assert.ok(await page.locator(`${ed} [data-fsed-sec="s_family"] [data-fsed-block="notes"]`).count());
                await page.click(`${ed} [data-fsed-add]`); await page.fill(`${ed} [data-fsed-addname]`, 'Métier'); await page.click(`${ed} [data-fsed-addok]`);
                await page.waitForFunction(() => (JSON.parse(localStorage.getItem('genealogie-person-blocks') || '{}').sections || []).some(s => s.name === 'Métier'));
                const sid = await page.evaluate(() => JSON.parse(localStorage.getItem('genealogie-person-blocks')).sections.find(s => s.name === 'Métier').id);
                await page.click(`${ed} [data-fsed-block="notes"] [data-fsed-bmore]`); await page.click('.ui-actmenu button:has-text("Déplacer vers")'); await page.click('.ui-actmenu button:has-text("Métier")');
                await page.waitForFunction(s => JSON.parse(localStorage.getItem('genealogie-person-blocks')).assign.notes === s, sid);
                await page.click(`${ed} [data-fsed-sec="${sid}"] [data-fsed-smore]`); await page.click('.ui-actmenu button:has-text("Supprimer la section")');
                const msg = page.locator('.toast', {hasText: 'Section « Métier » supprimée'}).last(); await msg.waitFor();
                assert.match(await msg.textContent(), /son bloc va dans « Sans section »/);
                assert.ok(await page.locator(`${ed} [data-fsed-sec="__loose"] [data-fsed-block="notes"]`).count(), 'le bloc est dans « Sans section »');
                await msg.locator('button', {hasText: 'Annuler'}).click();
                await page.waitForFunction(s => (JSON.parse(localStorage.getItem('genealogie-person-blocks')).sections || []).some(x => x.id === s), sid);
                await page.waitForSelector('.ui-ph-saved'); await shot(page, 'editeur-comme-avant');
            });
            await t('glisser ⠿ un bloc vers une autre section ; Alt + ↑ / ↓ au clavier', async () => {
                const ed = '#fsec-blocks [data-fsec-editor="0"]';
                await page.waitForSelector(`${ed} [data-fsed-block="events"]`);
                await page.$eval(`${ed} [data-fsed-block="events"]`, e => e.scrollIntoView({block: 'center'}));
                const g = await page.$(`${ed} [data-fsed-block="events"] [data-fsed-grip]`), target = await page.$(`${ed} [data-fsed-sec="s_family"] [data-fsed-block]`);
                const a = await g.boundingBox(), b = await target.boundingBox();
                await page.mouse.move(a.x + 5, a.y + 5); await page.mouse.down(); await page.mouse.move(b.x + 20, b.y + 4, {steps: 8}); await page.mouse.up();
                await page.waitForFunction(() => JSON.parse(localStorage.getItem('genealogie-person-blocks')).assign.events === 's_family');
                const before = await page.evaluate(() => { const v = JSON.parse(localStorage.getItem('genealogie-person-blocks')); return v.order.filter(k => v.assign[k] === 's_family'); });
                await page.focus(`${ed} [data-fsed-block="events"] [data-fsed-grip]`); await page.keyboard.press('Alt+ArrowDown');
                await page.waitForFunction(b0 => { const v = JSON.parse(localStorage.getItem('genealogie-person-blocks')); const l = v.order.filter(k => v.assign[k] === 's_family'); return l.indexOf('events') === b0.indexOf('events') + 1; }, before);
                const secs0 = await page.evaluate(() => JSON.parse(localStorage.getItem('genealogie-person-blocks')).sections.map(s => s.id));
                await page.focus(`${ed} [data-fsed-sec="${secs0[1]}"] > .fsed-secrow [data-fsed-grip]`); await page.keyboard.press('Alt+ArrowUp');
                await page.waitForFunction(s => JSON.parse(localStorage.getItem('genealogie-person-blocks')).sections[0].id === s, secs0[1]);
            });
            await t('éditeur « Nouveau » : la même liste en bandes, ⠿ et 👁 ; le choix ne change que l’écran de réglage', async () => {
                const before = await page.evaluate(() => localStorage.getItem('genealogie-person-blocks'));
                await page.click('#fsec-pres [data-fsec-opt="editor"][data-v="new"]');
                await page.waitForSelector('#fsec-blocks .fsed.is-new button[data-fsed-bshow]');
                assert.equal(await page.evaluate(() => localStorage.getItem('genealogie-person-blocks')), before, 'rien ne change dans les fiches');
                await shot(page, 'editeur-nouveau');
                await page.click('#fsec-pres [data-fsec-opt="editor"][data-v="avant"]'); await page.waitForSelector('#fsec-blocks .fsed.is-avant');
                await setLS(page, 'genealogie-person-blocks', null);
            });
            await t('exception par fiche : « ⚙️ Ranger les sections » depuis la fiche, point bleu, « ↺ Reprendre celui de toutes les fiches »', async () => {
                await toPerson(page, 1); await page.waitForSelector('[data-fsec-hero-more]');
                await page.click('[data-fsec-hero-more]'); await page.click('.ui-actmenu button:has-text("Ranger les sections")');
                await page.waitForSelector('dialog[open] [data-fsec-scope]');
                await page.click('dialog[open] [data-fsec-scope] [data-v="one"]');
                await page.click('dialog[open] [data-fsed-block="identity"] [data-fsed-width="12"]');
                await page.waitForFunction(() => localStorage.getItem('genealogie-person-blocks-1') !== null);
                await page.click('dialog[open] .modal-actions button[type=submit]');
                await page.waitForSelector('.fsec-own [data-fsec-unown]');
                assert.ok(await page.$eval('[data-pblock="identity"]', e => e.classList.contains('span-12')));
                await toPerson(page, 2); await page.waitForSelector('.fsec'); assert.equal(await page.locator('.fsec-own').count(), 0, 'les autres fiches ne bougent pas');
                await toPerson(page, 1); await page.click('[data-fsec-unown]');
                await page.waitForFunction(() => localStorage.getItem('genealogie-person-blocks-1') === null);
            });
            await t('A4 a déménagé : petite ligne dans Designs au choix, cadre « Forme de l’en-tête » dans Fiches, toujours appliqué', async () => {
                await page.evaluate(async () => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'designs'; await A.setModule('maintenance'); });
                await page.waitForSelector('.lcd-page .lcd-toc');
                assert.equal(await page.locator('#lcd-a4').count(), 0); assert.equal(await page.locator('[data-lcd-go="a4"]').count(), 0);
                await page.click('[data-lcd-fiches]');
                await page.waitForSelector('#lc-person-header #lcd-a4-emb [data-lcd-v="acte"]', {timeout: 15000});
                assert.equal(await page.locator('#lcd-a4-emb [data-lcd-v]').count(), 4);
                const pos = await page.evaluate(() => { const a = document.getElementById('lcd-a4-emb'), o = [...document.querySelectorAll('#lc-person-header h3')].find(h => /Ordre et visibilité des boutons/.test(h.textContent)); return !!(a.compareDocumentPosition(o) & Node.DOCUMENT_POSITION_FOLLOWING); });
                assert.ok(pos, 'juste avant « Ordre et visibilité des boutons »');
                await page.click('#lcd-a4-emb [data-lcd-v="acte"]');
                await page.waitForFunction(() => JSON.parse(localStorage.getItem('genealogie-designs') || '{}').a4?.v === 'acte');
                await toPerson(page, 1); await page.waitForSelector('.person-hero.lc-hero-acte');
                await setLS(page, 'genealogie-designs', null); await page.evaluate(() => window.LCNDA_DESIGNS.apply());
            });
            await t('sommaire « Sur cette page » et ordre des cadres (P1)', async () => {
                await toSheets(page); await page.waitForSelector('.fsec-toc [data-fsec-toc]');
                const ids2 = await page.$$eval('#workspace > .page > .fsec-part:not([hidden])', e => e.map(x => x.id));
                ['fsec-pres', 'lc-person-header', 'lc-head-elems', 'lc-obs-place', 'fsec-cfg', 'fsec-blocks', 'h-flag-config', 'lineage-config', 'web-search-config'].reduce((prev, id) => { const i = ids2.indexOf(id); assert.ok(i > prev, `${id} à sa place (${ids2.join(', ')})`); return i; }, -1);
                assert.ok(await page.locator('#fsec-cfg [data-fsec-go-designs]').count(), 'lien vers Designs au choix (D3)');
                assert.equal(await page.locator('#fsec-cfg input[type=range], #fsec-cfg [data-fsec-gap]').count(), 0, 'pas de curseur « Espace entre sections »');
                await page.click('#fsec-cfg [data-fsec-opt="style"][data-v="band"]');
                await page.waitForFunction(() => JSON.parse(localStorage.getItem('genealogie-sheet-sections') || '{}').style === 'band');
                await page.waitForSelector('.ui-ph-saved'); await setLS(page, 'genealogie-sheet-sections', null);
                await shot(page, 'reglages-fiches-1440');
            });
            await t('fiche animal unique : anciens liens, sections de l’animal, blocs du suivi, plus de page simple', async () => {
                await page.evaluate(() => window.LCNDA_EXT.openPet(502));
                await page.waitForSelector('.person-page .fsec[data-fsec="s_marks"] .sv-pet-panel .card', {timeout: 10000});
                assert.equal(await page.evaluate(() => window.LCNDA_APP.state.currentPersonId), ids.gaston);
                assert.equal(await page.locator('.page.h-pet').count(), 0);
                const secs = await page.$$eval('.fsec:not(.is-loose) .fsec-name', e => e.map(x => x.textContent));
                assert.deepEqual(secs, ['Fiche', 'Bagues et marques', 'Observations', 'Santé', 'Groupe', 'Carte']);
                assert.match(await page.textContent('[data-pblock="animal_marks"] h3'), /Bagues et marques/);
                assert.match(await page.textContent('[data-pblock="animal_obs"] h3'), /Observations\s*\(1\)/);
                await page.waitForSelector('[data-pblock="animal_obs"] .sv-obs-table, [data-pblock="animal_obs"] .ui-row, [data-pblock="animal_obs"] tr');
                assert.ok(await page.locator('[data-pblock="animal"] h3:has-text("Caractéristiques")').count());
                assert.equal(await page.locator('[data-pblock="animal"] [data-pet-goto]').count(), 0, 'plus de bouton « 🐾 Fiche d’animal »');
                await page.evaluate(() => window.LCNDA_EXT.openPet(501));
                await page.waitForSelector('[data-pblock="animal"] dd:has-text("250269812345678")');
                assert.ok(await page.locator('[data-pblock="animal_parents"] h3:has-text("Pedigree")').count());
                assert.ok(await page.locator('[data-pblock="animal_titles"]').count(), 'titres et concours');
                assert.ok(await page.locator('[data-pblock="animal_health"] .h-pet-chart').count(), 'la courbe du poids d’avant est dans 🩺 Santé');
                assert.match(await page.textContent('[data-pblock="animal_marks"] h3'), /Marques/);
                // les anciens chemins : liste des animaux, #pet/…/sante, le suivi « ↗ Santé »
                await page.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'pets'; A.state.hPet = 0; return A.setModule('listes'); });
                await page.waitForSelector('[data-pet-open]'); assert.ok(await page.locator('.h-pets-merged').count(), 'message « 2 animaux ont reçu leur fiche complète »');
                assert.match(await page.textContent('.h-pets-merged'), /2 animaux ont reçu leur fiche complète/);
                await page.click('[data-pet-open="501"]'); await page.waitForFunction(i => window.LCNDA_APP.state.currentPersonId === i && document.querySelector('.person-page'), ids.minette);
                await page.evaluate(() => { location.hash = '#pet/502/sante'; });
                await page.waitForFunction(i => window.LCNDA_APP.state.currentPersonId === i && document.querySelector('[data-pblock="animal_health"]'), ids.gaston);
                await setLS(page, 'genealogie-sheet-sections', {style: 'tabs'});
                await page.evaluate(() => window.LCNDA_EXT.suivi.openPet(502, 'health'));
                await page.waitForFunction(() => document.querySelector('.fsec-tab.is-active')?.dataset.fsecTab === 's_health');
                await shot(page, 'animal-onglets');
                await setLS(page, 'genealogie-sheet-sections', null);
            });
            await t('＋ Nouvelle observation : carré 👁＋ en premier, chaque place, touche O', async () => {
                await page.evaluate(() => window.LCNDA_EXT.openPet(502)); await page.waitForSelector('.person-hero-actions > .lc-obs-btn');
                assert.ok(await page.$eval('.person-hero-actions', e => e.firstElementChild.classList.contains('lc-obs-btn')), 'en premier');
                assert.equal(await page.$eval('.lc-obs-btn', e => e.dataset.shortcut), 'O');
                await page.keyboard.press('Escape'); await page.click('.person-page h2'); await page.keyboard.press('o');
                await page.waitForSelector('dialog[open]'); assert.match(await page.textContent('dialog[open]'), /observation/i);
                await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
                const sel = {blue: '.lc-obs-blue', pill: '.lc-obs-pill', strip: '.lc-obs-strip', fab: '.lc-obs-fab'};
                for (const [k, s] of Object.entries(sel)) { await setLS(page, 'genealogie-sheet-head', {obsPlace: k}); await page.evaluate(() => window.LCNDA_APP.rerenderPerson()); await page.waitForSelector(s); assert.equal(await page.locator('.lc-obs-btn').count(), 0, k); if (k === 'strip') await shot(page, 'obs-bande'); }
                await setLS(page, 'genealogie-sheet-head', {obsPlace: 'hidden', obsKey: false}); await page.evaluate(() => window.LCNDA_APP.rerenderPerson()); await page.waitForTimeout(200);
                assert.equal(await page.locator('[data-sv-new-obs].lc-obs-btn, .lc-obs-blue, .lc-obs-pill, .lc-obs-strip, .lc-obs-fab').count(), 0, 'caché');
                await page.click('.person-page h2'); await page.keyboard.press('o'); await page.waitForTimeout(300);
                assert.equal(await page.locator('dialog[open]').count(), 0, 'touche O éteinte');
                await toPerson(page, 1); await page.waitForSelector('.person-hero'); assert.equal(await page.locator('.lc-obs-btn').count(), 0, 'pas sur une personne');
                await setLS(page, 'genealogie-sheet-head', null);
            });
            await t('👁 Vu la dernière fois : vert, jaune, rouge (seuils), gris ; place et version compacte', async () => {
                await page.evaluate(() => window.LCNDA_EXT.openPet(502));
                await page.waitForSelector('[data-lc-seen] .ui-badge.is-green');
                assert.match(await page.textContent('[data-lc-seen]'), /Vu hier/); assert.match(await page.textContent('[data-lc-seen]'), /Buttes-Chaumont/);
                assert.ok(await page.$eval('[data-lc-seen] time', e => !!e.title), 'date complète au survol');
                await setLS(page, 'genealogie-sheet-head', {green: 1, red: 30}); await page.evaluate(() => window.LCNDA_APP.rerenderPerson());
                await page.waitForSelector('[data-lc-seen] .ui-badge.is-yellow');
                await setLS(page, 'genealogie-sheet-head', {green: 1, red: 2, seenDetail: false, seenPlace: 'badges'}); await page.evaluate(() => window.LCNDA_APP.rerenderPerson());
                await page.waitForSelector('.person-hero-status [data-lc-seen].is-compact .ui-badge.is-yellow');
                const old = await page.evaluate(() => window.LCNDA_EXT.suivi.seenBadge(new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10), {green: 7, red: 30}));
                assert.equal(old.kind, 'red'); assert.equal(old.text, 'Pas revu depuis 45 jours');
                assert.doesNotMatch(await page.textContent('[data-lc-seen]'), /Buttes/);
                await page.evaluate(() => window.LCNDA_EXT.suivi.seenBadge('', {green: 7, red: 30})).then(b => assert.equal(b.kind, 'grey'));
                assert.equal((await page.evaluate(() => window.LCNDA_EXT.suivi.seenBadge('', {green: 7, red: 30}))).text, 'Jamais vu depuis le baguage');
                await setLS(page, 'genealogie-sheet-head', {seenPlace: 'bottom'}); await page.evaluate(() => window.LCNDA_APP.rerenderPerson()); await page.waitForSelector('.person-hero > [data-lc-seen].is-bottom');
                await setLS(page, 'genealogie-sheet-head', null);
                await page.evaluate(() => window.LCNDA_EXT.openPet(501)); await page.waitForSelector('[data-pblock="animal_obs"]'); await page.waitForTimeout(600);
                assert.equal(await page.locator('[data-lc-seen]:not([hidden])').count(), 0, 'pas pour un animal sans suivi');
            });
            await t('réglages : éléments de l’en-tête (K2) et un seul seuil pour « Animaux à retrouver »', async () => {
                await toSheets(page); await page.waitForSelector('#lc-head-elems [data-sh-num="red"]');
                await page.fill('#lc-head-elems [data-sh-num="red"]', '45'); await page.press('#lc-head-elems [data-sh-num="red"]', 'Tab');
                await page.waitForFunction(() => JSON.parse(localStorage.getItem('genealogie-sheet-head') || '{}').red === 45);
                assert.equal(await page.evaluate(() => window.LCNDA_EXT.sheetHead().red), 45);
                await page.click('#lc-obs-place input[value="strip"]'); await page.waitForFunction(() => JSON.parse(localStorage.getItem('genealogie-sheet-head')).obsPlace === 'strip');
                await setLS(page, 'genealogie-sheet-head', null);
            });
            await t('390 px : fiche et réglages sans débordement, la 1re section ouverte', async () => {
                const p = await open(390);
                const over = () => p.evaluate(() => { const ws = document.getElementById('workspace'); return ws.scrollWidth - ws.clientWidth; });
                await toPerson(p, 1); await p.waitForSelector('.fsec');
                assert.ok(await over() <= 1, `fiche : ${await over()} px`);
                const folded = await p.$$eval('.fsec:not(.is-loose)', e => e.map(x => x.classList.contains('is-folded')));
                assert.equal(folded[0], false); assert.ok(folded.slice(1).every(Boolean), 'les autres repliées');
                await shot(p, 'fiche-390');
                await p.evaluate(() => window.LCNDA_EXT.openPet(502)); await p.waitForSelector('.fsec'); assert.ok(await over() <= 1, 'fiche animal');
                await toSheets(p); await p.waitForSelector('#fsec-blocks .fsed'); assert.ok(await over() <= 1, `réglages : ${await over()} px`);
                await shot(p, 'reglages-390');
                await p.close();
            });
            await t('sombre : sections lisibles, éditeur, aucune erreur', async () => {
                const p = await open(1440);
                await p.evaluate(() => { localStorage.setItem('genealogie-design', JSON.stringify({preset: 'dark'})); window.LCNDA_APP.applyDesign(); });
                await toPerson(p, 1); await p.waitForSelector('.fsec-head');
                const [fg, bg] = await p.$eval('.fsec-name', e => [getComputedStyle(e).color, getComputedStyle(document.querySelector('.person-page')).backgroundColor]);
                assert.notEqual(fg, bg);
                await shot(p, 'fiche-sombre');
                await toSheets(p); await p.waitForSelector('#fsec-blocks .fsed'); await shot(p, 'reglages-sombre');
                await p.evaluate(() => { localStorage.removeItem('genealogie-design'); window.LCNDA_APP.applyDesign(); });
                await p.close();
            });
            await t('mode consultation : lecture seule (pas de ⋯, pas de ＋ Nouvelle observation, aucune écriture)', async () => {
                const p = await open(1440);
                await p.evaluate(() => window.LCNDA_EXT.openPet(502)); await p.waitForSelector('.lc-obs-btn');
                await p.evaluate(() => document.body.classList.add('is-kiosk'));
                const posts = []; p.on('request', q => { if (q.method() !== 'GET' && !/save_settings|kiosk/.test(q.url())) posts.push(q.url()); });
                await p.evaluate(() => window.LCNDA_APP.rerenderPerson()); await p.waitForSelector('.fsec');
                assert.equal(await p.locator('.fsec-more, [data-fsec-hero-more], .lc-obs-btn').count(), 0);
                await p.click('.fsec [data-fsec-fold]'); await p.keyboard.press('o'); await p.waitForTimeout(400);
                assert.deepEqual(posts, []);
                await p.close();
            });
            await t('aucune erreur JavaScript ; nom piégé échappé', async () => { assert.equal(await page.evaluate(() => window.__xss), undefined); assert.deepEqual(errs, []); });
        } finally { await browser.close(); }
    } finally {
        proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    finish();
})();
function finish() { console.log(`${failed ? '✗' : '✓'} sections des fiches et fiche animal unique : ${count} vérifications${failed ? `, ${failed} en échec` : ''}`); process.exit(failed ? 1 : 0); }
