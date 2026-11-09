'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Test du 🧭 premier lancement et de la 🧪 base d'exemple (lib/premier.php, lib/exemple.php, assets/js/app-premier.js) :
 *     node tests/test-premier-lancement.js        (SHOTS=/un/dossier pour garder les captures)
 * 1. La base d'exemple fabriquée par scripts/exemple-base.php : 35 à 50 personnes sur 5 générations, AUCUNE naissance
 *    après 1950, aucun vivant, tout le monde a son décès, lieux réels avec coordonnées, photos, sources, notes,
 *    un recensement ; deux fabrications donnent la même base.
 * 2. Base vide (vrai « php -S ») : l'écran montre « Je veux faire autre chose ▾ », 9 usages au clavier, Échap replie ;
 *    « 🎨 Catalogue » + « Commencer avec une base vide » → les onglets de l'usage, le premier écran, la visite proposée ;
 *    plus jamais l'écran ensuite ; Réglages → Apparence → « 🧭 Usage de l'app » (combiner, le dernier ne s'éteint pas) ;
 *    « 🧪 Essayer avec une base d'exemple » → une généalogie à part avec son bandeau, rien d'écrit dans la vraie base,
 *    « Revenir à ma généalogie ».
 * 3. Autre base vide : base d'exemple depuis l'écran, puis « Repartir d'une base vide ».
 * 4. Base qui a déjà des fiches : jamais l'écran, premier_start refusé, rien d'écrit. Usage « 🐾 lignée » : le premier animal.
 * 5. 390 px et mode sombre : pas de débordement, aucune erreur JavaScript.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const appRoot = path.resolve(__dirname, '..');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
const phpPath = findPhp([devBundledPhp()]);
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + '\n    ' + (e.stack || e).toString().split('\n').slice(0, 6).join('\n    ')); } };
const php = (code, env = {}) => spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], {cwd: appRoot, encoding: 'utf8', env: {...process.env, ...env}});
const tmp = name => fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-premier-' + name + '-'));
const procs = [], dirs = [];
const q = (db, sql) => { const r = php(`$p=new PDO('sqlite:'.getenv('DB'));echo json_encode($p->query(getenv('SQL'))->fetchAll(PDO::FETCH_ASSOC));`, {DB: db, SQL: sql}); return JSON.parse(r.stdout || 'null'); };

async function server(dir) {
    fs.mkdirSync(path.join(dir, 'media'), {recursive: true});
    const env = {...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], {cwd: appRoot, env, stdio: 'ignore'});
    procs.push(proc);
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    return base;
}

(async () => {
    console.log('Base d’exemple (scripts/exemple-base.php)');
    const ex1 = tmp('ex1'), ex2 = tmp('ex2'); dirs.push(ex1, ex2);
    const build = d => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), 'scripts/exemple-base.php', d], {cwd: appRoot, encoding: 'utf8'}); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))); };
    let stats;
    await t('fabriquée : 35 à 50 personnes, familles, événements, lieux, sources, notes, photos, un recensement', () => {
        stats = build(ex1);
        assert.ok(stats.persons >= 35 && stats.persons <= 50, `personnes : ${stats.persons}`);
        assert.ok(stats.families >= 15 && stats.events > 100 && stats.places >= 8 && stats.sources >= 3 && stats.notes >= 3 && stats.media >= 6 && stats.census === 1, JSON.stringify(stats));
    });
    const db1 = path.join(ex1, 'genealogy.sqlite');
    await t('RÈGLE : aucune naissance après 1950, aucun vivant, un décès pour chacun', () => {
        const born = q(db1, "SELECT p.first_name, e.year FROM persons p JOIN events e ON e.person_id=p.id JOIN event_types t ON t.id=e.event_type_id AND t.slug='birth'");
        assert.equal(born.length, stats.persons, 'chaque personne a sa naissance');
        born.forEach(b => assert.ok(b.year && b.year <= 1950, `${b.first_name} né(e) en ${b.year}`));
        assert.equal(q(db1, "SELECT count(*) n FROM persons WHERE living_status<>'deceased'")[0].n, 0, 'aucun vivant');
        assert.equal(q(db1, "SELECT count(*) n FROM persons p WHERE NOT EXISTS (SELECT 1 FROM events e JOIN event_types t ON t.id=e.event_type_id AND t.slug='death' WHERE e.person_id=p.id)")[0].n, 0, 'un décès pour chacun');
        assert.ok(q(db1, "SELECT count(*) n FROM events WHERE date_text LIKE 'vers %'")[0].n >= 3, 'quelques dates « vers »');
    });
    await t('5 générations depuis Jean (Sosa 1), vraies communes avec coordonnées, photos présentes', () => {
        const start = q(db1, 'SELECT id FROM persons WHERE is_start=1');
        assert.equal(start.length, 1);
        let gen = [start[0].id], depth = 0;
        while (gen.length) { depth++; gen = q(db1, `SELECT f.partner1_id a, f.partner2_id b FROM family_children c JOIN families f ON f.id=c.family_id WHERE c.child_id IN (${gen.join(',')})`).flatMap(r => [r.a, r.b]).filter(Boolean); }
        assert.equal(depth, 5, 'générations');
        const places = q(db1, 'SELECT name, latitude, longitude, admin4_code FROM places');
        places.forEach(p => assert.ok(p.latitude > 41 && p.latitude < 51.5 && p.longitude > -5.5 && p.longitude < 9.6 && /^\d[\dAB]\d{3}$/.test(p.admin4_code), p.name));
        q(db1, 'SELECT filename FROM media').forEach(m => assert.ok(fs.statSync(path.join(ex1, 'media', m.filename)).size > 20000, m.filename));
        assert.ok(q(db1, "SELECT count(*) n FROM persons WHERE occupation<>''")[0].n >= 30, 'métiers');
    });
    await t('reproductible : deux fabrications donnent les mêmes personnes et les mêmes dates', () => {
        build(ex2);
        const sig = db => JSON.stringify(q(db, 'SELECT p.first_name, p.last_name, e.date_text FROM persons p JOIN events e ON e.person_id=p.id ORDER BY p.id, e.id'));
        assert.equal(sig(db1), sig(path.join(ex2, 'genealogy.sqlite')));
        const again = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), 'scripts/exemple-base.php', ex2], {cwd: appRoot, encoding: 'utf8'});
        assert.notEqual(again.status, 0, 'une base déjà là n’est jamais écrasée');
    });

    let pw; try { pw = require('/opt/node22/lib/node_modules/playwright'); } catch (_) { try { pw = require('playwright'); } catch (__) { pw = null; } }
    if (!pw) { console.log('  (navigateur absent : partie navigateur sautée)'); return done(); }
    const shots = process.env.SHOTS || '';
    const browser = await pw.chromium.launch();
    const errors = [];
    const newPage = async (base, {width = 1440, dark = false} = {}) => {
        const ctx = await browser.newContext({viewport: {width, height: 950}, colorScheme: dark ? 'dark' : 'light'});
        await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, rt => rt.abort());
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(String(e.message)));
        page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) errors.push(m.text()); });
        await page.goto(base);
        return page;
    };
    const booted = page => page.waitForFunction(() => window.LCNDA_APP?.state?.bootstrap && window.LCNDA_APP.state.module, null, {timeout: 30000});
    const visibleTabs = page => page.evaluate(() => [...document.querySelectorAll('.main-nav .nav-item')].filter(b => getComputedStyle(b).display !== 'none').map(b => b.dataset.board || b.dataset.module));

    console.log('Base vide : l’écran du premier lancement');
    const d1 = tmp('vide'); dirs.push(d1);
    const b1 = await server(d1);
    const page = await newPage(b1);
    await t('écran d’installation : lien discret replié, 9 usages, « 🌳 Ma généalogie » choisie d’office', async () => {
        await page.waitForSelector('.pl-other');
        assert.equal(await page.evaluate(() => window.GENEALOGY_READY), false);
        assert.equal(await page.isVisible('#pl-fold'), false);
        assert.match(await page.textContent('#install-import-form button[type=submit]'), /⤒ Importer/);
        assert.equal(await page.getAttribute('#install-import-form', 'data-k-import'), '');
        await page.click('.pl-other');
        assert.equal(await page.locator('[data-pl-usage]').count(), 9);
        assert.equal(await page.getAttribute('[data-pl-usage].is-on', 'data-pl-usage'), 'genealogie');
        assert.ok(await page.isVisible('[data-pl-example]') && await page.isVisible('[data-pl-empty-any]'));
        if (shots) await page.screenshot({path: path.join(shots, 'premier-1440.png'), fullPage: true});
    });
    await t('clavier : → puis Entrée choisit, la carte de droite change ; Échap replie et remet « Ma généalogie »', async () => {
        await page.focus('[data-pl-usage="genealogie"]');
        await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
        assert.equal(await page.getAttribute('[data-pl-usage].is-on', 'data-pl-usage'), 'lignee');
        assert.ok(await page.isVisible('[data-pl-animal]'), 'formulaire « Créer le premier animal »');
        assert.equal(await page.isVisible('#install-person-form'), false);
        await page.keyboard.press('Escape');
        assert.equal(await page.isVisible('#pl-fold'), false);
        assert.ok(await page.isVisible('#install-person-form'));
    });
    await t('« 🎨 Catalogue » + « Commencer avec une base vide » : onglets de l’usage, premier écran, visite proposée', async () => {
        await page.click('.pl-other'); await page.click('[data-pl-usage="artiste"]');
        assert.ok(await page.isVisible('[data-pl-empty]'));
        await Promise.all([page.waitForNavigation(), page.click('[data-pl-empty]')]);
        await booted(page); await page.waitForTimeout(1200);
        const tabs = await visibleTabs(page);
        assert.ok(tabs.includes('catalogue') && tabs.includes('personnes') && !tabs.includes('animaux'), tabs.join(','));
        assert.equal(await page.evaluate(() => window.LCNDA_APP.state.module), 'catalogue');
        const tour = await page.evaluate(() => typeof window.LCNDA_APP.offerTour);
        if (tour === 'function') assert.match(await page.textContent('body'), /petite visite/i, 'la visite est proposée à la fin du premier lancement');
        else console.log('    (visite guidée absente : branchement non vérifié)');
        const set = q(path.join(d1, 'genealogy.sqlite'), "SELECT key FROM app_settings WHERE key IN ('genealogie-premier','genealogie-menu-catalogue','genealogie-usage')");
        assert.equal(set.length, 3);
    });
    await t('rechargée : plus jamais l’écran, ni la visite ; premier_start refusé', async () => {
        await page.evaluate(() => { try { localStorage.setItem('lcnda-tour-done', '1'); } catch (_) {} });
        await page.reload(); await booted(page);
        assert.equal(await page.locator('#install-screen').count(), 0);
        const r = await page.evaluate(async () => { const s = window.LCNDA_APP.state; const x = await fetch('api.php?action=premier_start', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-CSRF-Token': s.csrf}, body: JSON.stringify({csrf: s.csrf, usages: ['lignee']})}); return x.json(); });
        assert.match(r.error || '', /déjà des données/);
    });
    await t('Réglages → Apparence → « 🧭 Usage de l’app » : combiner, éteindre, le dernier ne s’éteint pas', async () => {
        await page.evaluate(() => { window.LCNDA_APP.state.maintenanceTab = 'nav_menus'; return window.LCNDA_APP.setModule('maintenance'); });
        await page.waitForSelector('#lc-usage', {state: 'attached'});
        await page.evaluate(() => document.querySelector('.reg-a-tabs [data-reg-a-tab="0"]')?.click());
        await page.waitForSelector('#lc-usage [data-pl-use="lignee"]', {state: 'attached'});
        await page.evaluate(() => { const i = document.querySelector('#lc-usage [data-pl-use="lignee"]'); i.checked = true; i.dispatchEvent(new Event('change', {bubbles: true})); });
        await page.waitForTimeout(300);
        let tabs = await visibleTabs(page);
        assert.ok(tabs.includes('animaux') && tabs.includes('personnes') && tabs.includes('catalogue'), tabs.join(','));
        if (shots) await page.screenshot({path: path.join(shots, 'usage-reglages.png'), fullPage: false});
        for (const k of ['artiste', 'genealogie']) await page.evaluate(k => { const i = document.querySelector(`#lc-usage [data-pl-use="${k}"]`); i.checked = false; i.dispatchEvent(new Event('change', {bubbles: true})); }, k);
        await page.waitForTimeout(300);
        tabs = await visibleTabs(page);
        assert.ok(tabs.includes('animaux') && !tabs.includes('personnes') && !tabs.includes('catalogue'), tabs.join(','));
        assert.equal(await page.evaluate(() => document.querySelector('#lc-usage [data-pl-use="lignee"]').disabled), true, 'le dernier allumé est grisé');
        await page.evaluate(() => document.querySelector('#lc-usage [data-pl-use-reset]').click());
        await page.waitForTimeout(300);
        tabs = await visibleTabs(page);
        assert.ok(tabs.includes('personnes') && !tabs.includes('animaux'), tabs.join(','));
    });
    await t('« 🧭 Revoir le premier lancement » : la fenêtre, ses 9 usages, « Enregistrer » avec ↶ Annuler', async () => {
        await page.evaluate(() => window.LCNDA_EXT.premierLancement.open());
        await page.waitForSelector('#pl-dialog [data-pl-usage]');
        assert.equal(await page.locator('#pl-dialog [data-pl-usage]').count(), 9);
        await page.click('#pl-dialog [data-pl-usage="souvenirs"]');
        await page.click('#pl-dialog button[type=submit]');
        await page.waitForTimeout(400);
        assert.ok((await visibleTabs(page)).includes('tresors'));
        assert.match(await page.textContent('#toast-region'), /Annuler/);
    });
    await t('« 🧪 Essayer avec une base d’exemple » : une généalogie à part, bandeau, la vraie base intacte', async () => {
        const before = q(path.join(d1, 'genealogy.sqlite'), 'SELECT (SELECT count(*) FROM persons) p, (SELECT count(*) FROM events) e')[0];
        await Promise.all([page.waitForNavigation({timeout: 30000}), page.evaluate(() => window.LCNDA_EXT.premierLancement.openExample())]);
        await booted(page);
        assert.equal(await page.evaluate(() => window.LCNDA_APP.state.module), 'dashboard', 'la base d’exemple s’ouvre sur le tableau de bord');
        await page.waitForSelector('#example-banner', {timeout: 15000});
        assert.match(await page.textContent('#example-banner'), /Base d’exemple/);
        assert.ok(await page.isVisible('[data-pl-leave="back"]'), '« Revenir à ma généalogie »');
        const reg = JSON.parse(fs.readFileSync(path.join(d1, 'genealogies.json'), 'utf8'));
        const ex = reg.list.find(g => g.example);
        assert.ok(ex && reg.active === ex.id && ex.from === '');
        const exDb = path.join(d1, 'genealogies', ex.id, 'genealogy.sqlite');
        assert.equal(q(exDb, 'SELECT count(*) n FROM persons')[0].n, stats.persons);
        assert.equal(q(exDb, "SELECT count(*) n FROM events e JOIN event_types t ON t.id=e.event_type_id AND t.slug='birth' WHERE e.year>1950")[0].n, 0);
        assert.deepEqual(q(path.join(d1, 'genealogy.sqlite'), 'SELECT (SELECT count(*) FROM persons) p, (SELECT count(*) FROM events) e')[0], before, 'rien d’écrit dans la vraie base');
        assert.ok(fs.existsSync(path.join(d1, 'genealogies', ex.id, 'media', 'exemple-maison.jpg')));
        assert.equal(fs.readdirSync(path.join(d1, 'media')).filter(f => f.startsWith('exemple-')).length, 0, 'aucune image dans les médias de la vraie base');
        if (shots) await page.screenshot({path: path.join(shots, 'exemple-1440.png')});
    });
    await t('« Revenir à ma généalogie » : retour, plus de bandeau', async () => {
        await Promise.all([page.waitForNavigation({timeout: 30000}), page.click('[data-pl-leave="back"]')]);
        await booted(page); await page.waitForTimeout(800);
        assert.equal(await page.locator('#example-banner').count(), 0);
        assert.equal(JSON.parse(fs.readFileSync(path.join(d1, 'genealogies.json'), 'utf8')).active, '');
    });

    console.log('Autre base vide : l’exemple tout de suite, puis « Repartir d’une base vide »');
    const d2 = tmp('vide2'); dirs.push(d2);
    const b2 = await server(d2);
    const p2 = await newPage(b2, {width: 390});
    await t('390 px : écran déplié sans débordement, base d’exemple depuis l’écran', async () => {
        await p2.waitForSelector('.pl-other'); await p2.click('.pl-other');
        const over = await p2.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(over <= 1, `débordement ${over}px`);
        if (shots) await p2.screenshot({path: path.join(shots, 'premier-390.png'), fullPage: true});
        await Promise.all([p2.waitForNavigation({timeout: 30000}), p2.click('[data-pl-example]')]);
        await p2.waitForSelector('#example-banner', {timeout: 30000});
        if (await p2.evaluate(() => typeof window.LCNDA_APP.offerTour) === 'function') { // venu de l'écran : la visite est proposée
            await p2.waitForSelector('[data-vg="later"]', {timeout: 8000}); await p2.click('[data-vg="later"]');
        }
        assert.ok(await p2.isVisible('[data-pl-leave="empty"]'), '« Repartir d’une base vide »');
        assert.equal(fs.existsSync(path.join(d2, 'genealogy.sqlite')), false, 'la vraie base n’existe même pas');
    });
    await t('« Repartir d’une base vide » : la vraie base est créée vide et s’ouvre', async () => {
        await Promise.all([p2.waitForNavigation({timeout: 30000}), p2.click('[data-pl-leave="empty"]')]);
        await booted(p2);
        assert.equal(await p2.locator('#install-screen').count(), 0);
        assert.equal(await p2.locator('#example-banner').count(), 0);
        assert.equal(q(path.join(d2, 'genealogy.sqlite'), 'SELECT count(*) n FROM persons')[0].n, 0);
    });

    console.log('Base qui a déjà des fiches ; premier animal');
    const d3 = tmp('pleine'); dirs.push(d3);
    php(String.raw`require 'lib/bootstrap.php'; init_empty_database(); db()->exec("INSERT INTO persons(first_name,last_name) VALUES('Ancienne','Fiche')"); echo 'ok';`, {GENEALOGY_DATA_DIR: d3, GENEALOGY_MEDIA_DIR: path.join(d3, 'media')});
    const b3 = await server(d3);
    await t('base d’avant avec des fiches : jamais l’écran, rien d’écrit', async () => {
        const p3 = await newPage(b3); await booted(p3);
        assert.equal(await p3.locator('#install-screen').count(), 0);
        assert.equal(await p3.locator('#example-banner').count(), 0);
        assert.equal(q(path.join(d3, 'genealogy.sqlite'), "SELECT count(*) n FROM app_settings WHERE key='genealogie-premier'")[0].n, 0);
        const tabs = await visibleTabs(p3);
        assert.ok(tabs.includes('personnes') && !tabs.includes('animaux'), 'onglets inchangés');
        await p3.evaluate(() => document.body.classList.add('is-kiosk'));
        await p3.evaluate(() => window.LCNDA_EXT.premierLancement.open());
        assert.equal(await p3.locator('#pl-dialog').count(), 0, 'pas en mode consultation');
        await p3.context().close();
    });
    const d4 = tmp('animal'); dirs.push(d4);
    const b4 = await server(d4);
    await t('« 🐾 Une lignée d’animaux » : nom manquant (K1), puis le premier animal et 🐾 Animaux à la place de Personnes', async () => {
        const p4 = await newPage(b4, {dark: true});
        await p4.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
        await p4.click('.pl-other'); await p4.click('[data-pl-usage="lignee"]');
        if (shots) await p4.screenshot({path: path.join(shots, 'premier-sombre.png'), fullPage: true});
        await p4.click('[data-pl-animal] button[type=submit]');
        assert.match(await p4.textContent('.pl-alt'), /Donne un nom à ton animal/);
        await p4.fill('[data-pl-animal] [name=name]', 'Ulysse'); await p4.fill('[data-pl-animal] [name=breed]', 'Berger australien');
        await Promise.all([p4.waitForNavigation(), p4.click('[data-pl-animal] button[type=submit]')]);
        await booted(p4); await p4.waitForTimeout(1000);
        const tabs = await visibleTabs(p4);
        assert.ok(tabs.includes('animaux') && !tabs.includes('personnes'), tabs.join(','));
        const db = path.join(d4, 'genealogy.sqlite');
        assert.equal(q(db, "SELECT first_name FROM persons WHERE kind='animal'")[0].first_name, 'Ulysse');
        assert.match(q(db, 'SELECT data_json FROM pets')[0].data_json, /Berger australien/);
        await p4.context().close();
    });

    await t('aucune erreur JavaScript', () => assert.deepEqual(errors, []));
    await browser.close();
    done();
})().catch(e => { console.error(e); fail++; done(); });

function done() {
    procs.forEach(p => { try { p.kill(); } catch (_) {} });
    dirs.forEach(d => { try { fs.rmSync(d, {recursive: true, force: true}); } catch (_) {} });
    console.log(`\n${pass} réussi(s), ${fail} échec(s)`);
    process.exit(fail ? 1 : 0);
}
