'use strict';
/* Harmonisation K2 (réglages enregistrés tout seuls), K5 (un seul en-tête de page), K9 (une seule vignette en mode « Fiches »).
 *     node tests/test-harmo-pages.js        (HARMO_PAGES_SHOTS=dossier pour garder des captures)
 * 1. Les composants (bac à sable) : UI.pageHeader (sur-titre, icône, phrase, bouton bleu, ⋯), le texte échappé.
 * 2. Plus de variante dans le code : ni bouton « Enregistrer » sur les pages de réglages, ni en-tête fait à la main par les petites
 *    fonctions header(), ni nombre en titre, ni carte faite à la main en mode « Fiches » (.list-card, .h-pet-card, .h-hs-card,
 *    .h-rc-card, .investigation-card, .external-link-card, .ar-card…).
 * 3. Navigateur (Playwright, si présent) : toutes les listes et toutes les pages des Réglages (1440 px) : en-tête rangé
 *    (sur-titre « Listes · … » / « Réglages · … », titre 38 px qui n’est pas un nombre, 1 bouton bleu + 2 au plus avant ⋯, ⭐ en dernier) ;
 *    K2 : un réglage changé → « ✓ Enregistré » + « ↶ Annuler » qui le remet ; K9 : Personnes, Animaux, Liens utiles en « Fiches » = UI.cardsHtml ;
 *    390 px en mode sombre : pas de défilement de côté ; aucune erreur JavaScript.
 */
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const vm = require('node:vm');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const root = path.resolve(__dirname, '..');
const js = f => fs.readFileSync(path.join(root, 'assets/js', f), 'utf8');
let failed = 0, count = 0;
const t = async (name, fn) => { try { await fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

(async () => {
    /* ── 1. composants ── */
    const sandbox = {window: {}, document: {addEventListener() {}, readyState: 'complete', getElementById: () => null, querySelector: () => null, querySelectorAll: () => []},
        setTimeout: () => 0, clearTimeout() {}, MutationObserver: class { observe() {} }, requestAnimationFrame: () => 0, performance: {now: () => 0}, console};
    vm.createContext(sandbox);
    vm.runInContext(js('app-pages.js'), sandbox, {filename: 'app-pages.js'});
    const UI = sandbox.window.LCNDA_UI;
    await t('K5 UI.pageHeader : sur-titre, icône, titre, phrase, bouton bleu, boutons, ⋯', () => {
        const h = UI.pageHeader({where: 'Listes · Médias et documents', icon: '🖼️', title: 'Médias <b>', help: 'Photos, actes.', primary: '<button class="button" data-x>＋ Ajouter</button>', actions: ['<button class="button secondary" data-y>📚 Recueils</button>'], more: ['<button data-z>Visages</button>']});
        assert.match(h, /^<header class="page-header ui-ph" data-ph-where="Listes · Médias et documents">/);
        assert.ok(h.includes('<span class="eyebrow">Listes · Médias et documents</span>'));
        assert.ok(h.includes('<h2><span class="ui-ph-ico" aria-hidden="true">🖼️</span>Médias &lt;b&gt;</h2>'), 'titre échappé, icône à part');
        assert.ok(h.includes('<p>Photos, actes.</p>'));
        assert.match(h, /<div class="page-actions ui-ph-actions"><button class="button" data-x>＋ Ajouter<\/button><button class="button secondary" data-y>📚 Recueils<\/button><details class="ui-ph-more"><summary[^>]*>⋯<\/summary><div class="ui-ph-menu" role="menu"><button data-z>Visages<\/button><\/div><\/details><\/div><\/header>$/);
        const s = UI.pageHeader({title: 'Réglages des tableaux', saved: true});
        assert.ok(s.includes('<span class="ui-ph-saved" data-ui-saved role="status">✓ Enregistré</span>'), 'K2 « ✓ Enregistré » à droite du titre');
        assert.ok(s.includes('<span class="eyebrow"></span>') && !s.includes('data-ph-where'), 'sur-titre calculé d’après le menu quand il n’est pas donné');
        assert.ok(UI.pageHeader({title: 'X', detail: true}).includes('data-ph-detail'));
        assert.equal(typeof UI.harmonizePageHeader, 'function'); assert.equal(typeof UI.autoSave, 'function'); assert.equal(typeof UI.pageSaved, 'function'); assert.equal(typeof UI.pagePlace, 'function');
    });
    const ui = js('app-ui.js');
    await t('K9 UI.cardsHtml : image, titre, 2 lignes, pastilles, date, « Ouvrir » et ⋯', () => {
        const fn = ui.match(/    const itemLine = [\s\S]*?UI\.cardsHtml = [\s\S]*?\.join\(''\)\}<\/div>`;\n/);
        assert.ok(fn, 'cardsHtml trouvé');
        const ctx = {UI: {}, esc: v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]))};
        vm.createContext(ctx); vm.runInContext(fn[0], ctx);
        const h = ctx.UI.cardsHtml([{thumb: '<img src="a.jpg">', name: 'Ferme <des> Borie', open: 'data-hs-open="3"', lines: ['Tulle', 'XIXe siècle', 'en trop'], badges: [{text: 'En cours', kind: 'blue'}], date: '1906', menu: ['<button data-r>✎ Renommer</button>'], actions: '<button data-d>🗑</button>'}]);
        assert.ok(h.startsWith('<div class="ui-cards"><article class="ui-card">'));
        assert.ok(h.includes('<button type="button" class="ui-card-thumb" data-hs-open="3"'), 'image cliquable');
        assert.ok(h.includes('Ferme &lt;des&gt; Borie'));
        assert.equal((h.match(/<small class="muted">/g) || []).length, 2, '2 lignes grises au plus');
        assert.ok(h.includes('<span class="ui-card-badges"><span class="ui-badge is-blue">En cours</span></span>'), 'pastille');
        assert.ok(h.includes('<small class="muted ui-card-date">1906</small>'));
        assert.match(h, /<div class="ui-card-act"><button type="button" class="button small ui-card-open" data-hs-open="3">Ouvrir<\/button><span class="ui-card-sp"><\/span><details class="ui-more ui-card-more">.*<button data-r>✎ Renommer<\/button><button data-d>🗑<\/button><\/div><\/details><\/div>/, '« Ouvrir » puis ⋯ (menu + anciennes actions)');
        const l = ctx.UI.cardsHtml([{name: 'Geneanet', href: 'https://www.geneanet.org/'}]);
        assert.ok(l.includes('<a class="button small ui-card-open" href="https://www.geneanet.org/" target="_blank" rel="noopener">Ouvrir ↗</a>'), 'un lien s’ouvre dans un nouvel onglet');
        assert.ok(ctx.UI.cardsHtml([{name: 'x'}], {size: 's'}).startsWith('<div class="ui-cards is-small">'), 'petites vignettes');
    });

    /* ── 2. plus de variante ── */
    const files = fs.readdirSync(path.join(root, 'assets/js')).filter(f => f.endsWith('.js'));
    const all = Object.fromEntries(files.map(f => [f, js(f)]));
    const hits = (re, skip = []) => files.filter(f => !skip.includes(f)).flatMap(f => [...all[f].matchAll(re)].map(m => `${f}: ${m[0].slice(0, 90)}`));
    await t('K2 plus de bouton « Enregistrer » sur les pages de réglages (tableaux, animaux, montage, ADN, apparence)', () => {
        const h = hits(/data-(bp|pp|mtp)-save|data-dna-psave|type="submit">Appliquer<\/button><button class="button secondary" type="button" id="reset-design"|form="design-form">Enregistrer/g);
        assert.deepEqual(h, []);
        for (const [f, re] of [['heritage-board-kit.js', /autoSave\?\.\(ws, \{save:/], ['heritage-pets.js', /autoSave\?\.\(ws, \{save:/], ['heritage-studio-av.js', /autoSave\?\.\(ws, \{save: saveNow/], ['heritage-dna.js', /autoSave\?\.\(root, \{save: saveNow/], ['app-access.js', /autoSave\?\.\(page, \{redraw:/], ['app.js', /autoSave\?\.\(\$\('#workspace'\),\{save:/]])
            assert.match(all[f], re, f + ' garde tout de suite (UI.autoSave)');
        assert.deepEqual(hits(/n’oublie pas « Enregistrer »/g), [], 'plus de « n’oublie pas « Enregistrer » »');
        assert.deepEqual(hits(/>Tout réinitialiser<|↺ Tout remettre comme avant</g), [], '« ↺ Remettre comme au départ » partout');
        assert.ok(!/confirmBox\('Revenir aux réglages d’origine/.test(all['heritage-board-kit.js'] + all['heritage-dna.js']), '« Remettre comme au départ » sans question (↶ Annuler)');
    });
    await t('K5 les petites fonctions header() passent par UI.pageHeader ; plus de nombre en titre', () => {
        for (const f of ['heritage-dna.js', 'heritage-links.js', 'heritage-more.js', 'heritage-records.js', 'heritage-tabs.js', 'heritage-tools.js', 'heritage-voters.js', 'heritage-widgets.js'])
            assert.match(all[f], /const header = \(eyebrow, title, intro[^)]*\) => window\.LCNDA_UI\.pageHeader\(/, f);
        assert.match(all['heritage.js'], /function pageHeader\(eyebrow, title, intro, actions = ''\) \{\n\s*return window\.LCNDA_UI\.pageHeader\(/);
        assert.deepEqual(hits(/<h2>\$\{plural\(|<h2>\$\{Number\([^)]*\)\.toLocaleString|<h2>\$\{count\.toLocaleString/g), [], 'nombre en titre');
        assert.ok(!/<div class="page-head">/.test(all['heritage-blocs.js']), 'Revue de presse, Palmarès : le même en-tête');
        assert.ok(!/LISTE DYNAMIQUE/.test(all['app-listes.js']) && /LCNDA_UI\.pageHeader\(\{title:labels\[type\]/.test(all['app-listes.js']), 'listes : UI.pageHeader');
        assert.ok(/LCNDA_UI\.pageHeader\(\{title:'Enquêtes'/.test(all['app-enquetes.js']) && /LCNDA_UI\.pageHeader\(\{title:'Battues'/.test(all['app-enquetes.js']), 'Enquêtes, Battues : le nom en titre');
        assert.ok(/pageHeader\(\{title:'Recherche'/.test(all['app-recherche.js']) && /pageHeader\(\{title:'Listes'/.test(all['app-listes.js']), 'Recherche et Listes vides reçoivent un en-tête');
        assert.ok(!/⭐ Raccourci<\/button>/.test(all['heritage-shortcuts.js']) && /placeStar, load/.test(all['heritage-shortcuts.js']), '⭐ seul, posé en dernier');
        const css = fs.readFileSync(path.join(root, 'assets/css/app.css'), 'utf8');
        assert.match(css, /#workspace \.page-header\.ui-ph h2 \{[^}]*font-size: 38px/, 'titre 38 px partout');
    });
    await t('K9 plus de vignette faite à la main en mode « Fiches »', () => {
        // (la grille des signatures d’une fiche et du tableau de bord n’est pas une liste « Fiches » : app.js et app-tableau-de-bord.js à part pour .list-card)
        const h = hits(/class="(list-card|h-pet-card|h-hs-card|h-rc-card|investigation-card battue-card|external-link-card|h-fi-card h-pr-fcard)[ "]|<article class="investigation-card"><div><span class="ui-badge investigation-status \$\{item\.status\}">\$\{item\.status===|<div class="ar-card" data-ar-row-open/g, ['app-maintenance.js']).filter(x => !/^(app|app-tableau-de-bord)\.js: class="list-card"/.test(x));
        assert.deepEqual(h, []);
        for (const f of ['app-listes.js', 'app-enquetes.js', 'heritage-pets.js', 'heritage-house.js', 'heritage-recueils.js', 'heritage-depouillements.js', 'heritage-artist-list.js', 'heritage-scene-list.js', 'heritage-periodicals.js', 'heritage-creations.js', 'heritage-edittools.js'])
            assert.match(all[f], /cardsHtml\(/, f + ' : UI.cardsHtml');
    });
    const idx = fs.readFileSync(path.join(root, 'index.php'), 'utf8');
    await t('index.php charge app-pages.js juste après app-ui.js', () => {
        const a = idx.indexOf('assets/js/app-ui.js?v='), b = idx.indexOf('assets/js/app-pages.js?v='), c = idx.indexOf('assets/js/app-listes.js?v=');
        assert.ok(a > 0 && b > a && b < c, 'après app-ui.js, avant les écrans');
    });

    /* ── 3. navigateur ── */
    let chromium = null;
    try { ({chromium} = require('playwright')); } catch (_) { try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    const phpPath = findPhp([devBundledPhp()]);
    if (!chromium || !phpPath) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); console.log(`${failed ? '✗' : '✓'} harmonisation K2 / K5 / K9 : ${count} vérifications`); process.exit(failed ? 1 : 0); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-harmo-pages-'));
    const shots = process.env.HARMO_PAGES_SHOTS || '';
    const envFor = d => ({...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1'});
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Joseph','Martin','male','deceased'),('Marie','Durand','female','living'),('<img src=x onerror=window.__xss=1>','Piège','unknown','unknown')"); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
foreach (["INSERT INTO investigations(title,status,person_id) VALUES('Qui était Jean ?','open',1)", "INSERT INTO battues(title,status,start_insee_code) VALUES('Les Martin du Gers','open','32013')"] as $sql) { try { $pdo->exec($sql); } catch (Throwable $e) { fwrite(STDERR, $e->getMessage() . "\n"); } }
echo 'ok';`], {cwd: root, encoding: 'utf8', env: envFor(tmp)});
    if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const port = Number(process.env.HARMO_PAGES_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env: envFor(tmp), stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch();
    const errs = [];
    const open = async (w, dark = false) => {
        const page = await browser.newPage({viewport: {width: w, height: 900}, colorScheme: dark ? 'dark' : 'light'});
        page.on('pageerror', e => errs.push(`${w}px : ${e.message}`)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(`${w}px console : ${m.text()}`); });
        page.on('dialog', d => d.dismiss());
        if (dark) await page.addInitScript(() => { try { if (!sessionStorage.getItem('t-dark')) { sessionStorage.setItem('t-dark', '1'); localStorage.setItem('genealogie-design', JSON.stringify({preset: 'dark'})); } } catch (_) {} });
        await page.goto(base, {waitUntil: 'load'}); await page.waitForTimeout(1800);
        if (dark) assert.equal(await page.evaluate(() => { const A = window.LCNDA_APP; localStorage.setItem('genealogie-design', JSON.stringify({...A.readDesignSettings(), preset: 'dark'})); A.applyDesign(); return document.documentElement.dataset.theme; }), 'dark', 'mode sombre');
        return page;
    };
    const go = (page, kind, id) => page.evaluate(async ([kind, id]) => { const A = window.LCNDA_APP; document.querySelectorAll('dialog[open]').forEach(d => d.close());
        if (kind === 'list') { A.state.listType = id; await A.setModule('listes'); } else if (kind === 'maint') { A.state.maintenanceTab = id; await A.setModule('maintenance'); } else await A.setModule(id); }, [kind, id]);
    const headOf = page => page.evaluate(() => { const h = document.querySelector('#workspace .page-header'); if (!h) return null; const t = h.querySelector('h2'), acts = h.querySelector(':scope > .page-actions');
        const kids = acts ? [...acts.children].filter(x => x.getClientRects().length) : [];
        return {ui: h.classList.contains('ui-ph'), eyebrow: h.querySelector('.eyebrow')?.textContent.trim() || '', title: (t?.textContent || '').replace(/^\P{L}+/u, '').trim(), fs: t ? getComputedStyle(t).fontSize : '',
            kinds: kids.map(x => x.matches('.ui-ph-saved') ? 'saved' : x.matches('details.ui-ph-more') ? 'more' : x.matches('[data-sc-star]') ? 'star' : x.matches('.button:not(.secondary):not(label)') ? 'primary' : 'other')}; });
    try {
        const page = await open(1440);
        const lists = await page.evaluate(() => window.LCNDA_APP.orderedListTypes(true).map(x => x[0]));
        const maint = await page.evaluate(() => window.LCNDA_APP.orderedMaintenanceTabs().map(x => x[0]));
        await t(`K5 ${lists.length} listes et ${maint.length} pages des Réglages : un seul en-tête`, async () => {
            const bad = [];
            for (const [kind, ids] of [['list', lists], ['maint', maint]]) for (const id of ids) {
                await go(page, kind, id); await page.waitForTimeout(500);
                const h = await headOf(page); const w = `${kind}:${id}`;
                if (!h) { if (!(kind === 'list' && id === 'places')) bad.push(`${w} sans en-tête`); continue; }
                if (!h.ui) bad.push(`${w} pas rangé`);
                if (!new RegExp(`^${kind === 'list' ? 'Listes' : 'Réglages'}( · |$)`).test(h.eyebrow)) bad.push(`${w} sur-titre « ${h.eyebrow} »`);
                if (h.fs !== '38px') bad.push(`${w} titre ${h.fs}`);
                if (/^\d/.test(h.title) || !h.title) bad.push(`${w} titre « ${h.title} »`);
                const k = h.kinds.filter(x => x !== 'saved'), more = k.indexOf('more'), star = k.indexOf('star');
                if (k.filter(x => x === 'primary').length > 1) bad.push(`${w} ${k.filter(x => x === 'primary').length} boutons bleus`);
                if (k.filter(x => x === 'other').length > 2) bad.push(`${w} ${k.filter(x => x === 'other').length} boutons hors ⋯`);
                if (star >= 0 && star !== k.length - 1) bad.push(`${w} ⭐ pas en dernier`);
                if (more >= 0 && k.slice(0, more).some(x => x === 'more' || x === 'star')) bad.push(`${w} ⋯ mal placé`);
                if (k.includes('primary') && k.indexOf('primary') !== 0) bad.push(`${w} bouton bleu pas en premier`);
            }
            assert.deepEqual(bad, []);
        });
        await t('K5 ⋯ ouvre les boutons en trop (Médias), Échap le ferme', async () => {
            await go(page, 'list', 'media'); await page.waitForTimeout(700);
            const n = await page.evaluate(() => document.querySelectorAll('#workspace .page-header .ui-ph-menu > *').length);
            assert.ok(n >= 2, 'boutons dans ⋯ : ' + n);
            await page.click('#workspace .page-header .ui-ph-more > summary'); await page.waitForTimeout(150);
            const shown = () => page.evaluate(() => !!document.querySelector('#workspace .ui-ph-more[open]') || [...document.querySelectorAll('.ui-actmenu')].some(m => m.getClientRects().length));
            assert.ok(await shown(), 'menu ouvert (le <details> ou le menu commun K14)');
            await page.keyboard.press('Escape'); await page.waitForTimeout(150);
            assert.ok(!(await shown()), 'Échap le ferme');
            if (shots) await page.screenshot({path: path.join(shots, 'harmo-k5-medias.png')});
        });
        await t('K2 Réglages des tableaux : gardé tout de suite, « ✓ Enregistré », « ↶ Annuler » le remet', async () => {
            await go(page, 'maint', 'board_prefs'); await page.waitForTimeout(800);
            assert.equal(await page.locator('[data-bp-save]').count(), 0);
            assert.equal(await page.evaluate(() => document.querySelector('#workspace .page-header .ui-ph-saved')?.textContent), '✓ Enregistré');
            await page.click('[data-bp-tab="menus"]'); await page.waitForTimeout(500);
            const was = await page.evaluate(() => document.querySelector('[data-bp-layout="size"]').value);
            await page.selectOption('[data-bp-layout="size"]', was === 'l' ? 's' : 'l'); await page.waitForTimeout(900);
            const stored = await page.evaluate(() => Object.values(localStorage).some(v => /"size":"[ls]"/.test(v)));
            assert.ok(stored, 'enregistré sans bouton');
            const toast = page.locator('.toast', {hasText: 'Taille des boutons'}).last();
            assert.ok(await toast.count(), 'message « Réglage changé »');
            await toast.locator('button', {hasText: 'Annuler'}).click(); await page.waitForTimeout(900);
            assert.equal(await page.evaluate(() => document.querySelector('[data-bp-layout="size"]').value), was, '↶ Annuler remet l’ancienne valeur');
            if (shots) await page.screenshot({path: path.join(shots, 'harmo-k2-tableaux.png')});
        });
        await t('K2 Accessibilité : « ↺ Remettre comme au départ » sans question, puis ↶ Annuler', async () => {
            await go(page, 'maint', 'accessibilite'); await page.waitForTimeout(800);
            await page.locator('.a11y-page label.ui-toggle').first().click(); await page.waitForTimeout(900);
            const on = await page.evaluate(() => localStorage.getItem('genealogie-accessibilite') || Object.keys(localStorage).filter(k => /a11y|access/.test(k)).map(k => localStorage.getItem(k)).join(''));
            assert.ok(on, 'gardé');
            await page.click('[data-a11y-reset]'); await page.waitForTimeout(900);
            assert.equal(await page.evaluate(() => !!document.querySelector('dialog[open]')), false, 'pas de question');
            assert.ok(await page.locator('.toast', {hasText: 'Réglages remis comme au départ'}).count(), 'message avec ↶ Annuler');
        });
        await t('K9 « Fiches » : Personnes, Animaux, Liens utiles, Enquêtes = la vignette unique', async () => {
            for (const id of ['persons', 'external_links', 'investigations_list']) {
                await go(page, 'list', id); await page.waitForTimeout(800);
                const b = page.locator('#workspace .ui-viewtoggle button', {hasText: 'Fiches'}); if (await b.count()) { await b.click(); await page.waitForTimeout(800); }
                const c = await page.evaluate(() => ({cards: document.querySelectorAll('#workspace .ui-card').length, open: document.querySelectorAll('#workspace .ui-card .ui-card-open').length, old: document.querySelectorAll('#workspace .list-card, #workspace .external-link-card, #workspace .investigation-card').length}));
                assert.ok(c.cards > 0 && c.old === 0, `${id} : ${JSON.stringify(c)}`);
                assert.ok(c.open > 0, `${id} : « Ouvrir »`);
            }
            if (shots) await page.screenshot({path: path.join(shots, 'harmo-k9-fiches.png')});
            assert.equal(await page.evaluate(() => window.__xss), undefined, 'aucun texte piégé exécuté');
        });
        await page.close();
        const small = await open(390, true);
        await t('390 px en mode sombre : en-tête en colonne, pas de défilement de côté', async () => {
            for (const [k, id] of [['list', 'media'], ['list', 'persons'], ['maint', 'board_prefs'], ['maint', 'issues']]) {
                await go(small, k, id); await small.waitForTimeout(700);
                const m = await small.evaluate(() => ({over: document.documentElement.scrollWidth - innerWidth, dir: getComputedStyle(document.querySelector('#workspace .page-header')).flexDirection, fs: getComputedStyle(document.querySelector('#workspace .page-header h2')).fontSize}));
                assert.ok(m.over <= 1 && m.dir === 'column' && m.fs === '30px', `${id} : ${JSON.stringify(m)}`);
            }
            if (shots) await small.screenshot({path: path.join(shots, 'harmo-390-sombre.png')});
        });
        await small.close();
        await t('aucune erreur JavaScript', () => { assert.deepEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(`${failed ? '✗' : '✓'} harmonisation K2 / K5 / K9 : ${count} vérifications`);
    process.exit(failed ? 1 : 0);
})();
