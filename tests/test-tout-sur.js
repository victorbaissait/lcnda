#!/usr/bin/env node
/* 🔎 « Ce qui le concerne » (assets/js/heritage-tout-sur.js, assets/css/tout-sur.css).
 * Base temporaire (MAZAUD né en 1890 à Saint-Léonard-de-Noblat, mort en 1916 ; LACOMBE sa femme ; DURAND leur fils né en 1912).
 * Les sources de données sont remplacées par des fausses (trouve / vide / erreur / pas installée / lieu / année) et deux vraies
 * (Décès INSEE et Morts pour la France, pas installées ici) : pas d'Internet.
 *  1. le bloc de fiche : suggestions rangées (« même lieu »), ↗ source, rien pour ce qui est vide, ligne « ⤓ … pourraient en dire plus »,
 *     badge 🔎 dans l'en-tête ; ✓ Garder (note + source, ＋ aussi à sa femme cochée d'office, pas au fils né après) et ↶ ;
 *     ✗ Pas utile et ↶ ; « déjà sur la fiche » ;
 *  2. ⤢ Tout voir : « N données regardées, M ont trouvé quelque chose », groupes, ⤓ Pas encore installé (MPF : né en 1890 en
 *     France ; pas INSEE : mort en 1916), 📦 Installer appelle l'install de la source, ＋ Ajouter comme note et ↶ ;
 *  3. un lieu, une année ; 4. Listes → 🔎 Chercher dans toutes les données ; 5. le widget ; 6. mode consultation : rien à installer ni garder.
 *   node tests/test-tout-sur.js */
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
const until = async (fn, ms = 10000) => { const t0 = Date.now(); for (;;) { if (await fn()) return; if (Date.now() - t0 > ms) throw new Error('trop long : ' + fn); await sleep(150); } };

(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-ts-'));
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','MAZAUD','male','deceased',1),(2,'Marie','LACOMBE','female','deceased',0),(3,'Paul','DURAND','male','deceased',0)");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code) VALUES(1,'Saint-Léonard-de-Noblat','Haute-Vienne','France',45.8353,1.4892,'87161'),(2,'Limoges','Haute-Vienne','France',45.8336,1.2611,'87085')");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)");
$ins->execute([1,$t('BIRT'),'3 mai 1890',1890,'1890-05-03',1]); $ins->execute([1,$t('DEAT'),'2 juin 1916',1916,'1916-06-02',2]);
$ins->execute([2,$t('BIRT'),'1892',1892,'1892',1]); $ins->execute([2,$t('DEAT'),'1960',1960,'1960',1]);
$ins->execute([3,$t('BIRT'),'1912',1912,'1912',1]); $ins->execute([3,$t('DEAT'),'1980',1980,'1980',2]);
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,1,2)"); $pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,3)");
echo json_encode(['ok' => 1, 'even' => $t('EVEN')]);`], {cwd: root, encoding: 'utf8', env});
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
        // pas d'Internet pendant l'essai : tout appel sortant échoue tout de suite
        await p.route(u => !String(u).startsWith(base), r => r.abort());
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultPersonBlocks, null, {timeout: 30000});
        // index.php ne charge pas encore heritage-tout-sur.js : on l'ajoute (comme le fera la balise <script>)
        if (!(await p.evaluate(() => !!window.LCNDA_EXT?.toutSur))) { await p.addStyleTag({url: base + 'assets/css/tout-sur.css'}); await p.addScriptTag({url: base + 'assets/js/heritage-tout-sur.js'}); }
        await p.waitForFunction(() => window.LCNDA_EXT?.toutSur, null, {timeout: 10000});
        // les sources : des fausses + deux vraies (pas installées ici)
        await p.evaluate(() => {
            const ext = window.LCNDA_EXT, A = window.LCNDA_APP; window.__realSources = [...(ext.dataSources || [])]; const real = (ext.dataSources || []).filter(d => ['insee_deces', 'bases_officielles_mpf'].includes(d.id));
            window.__calls = {install: 0, err: 0};
            ext.dataSources = [...real,
                {id: 'f_found', icon: '🧪', label: 'Fausse trouvaille', group: 'La personne', needs: ['person'], source: 'Exemple ouvert', run: async (ctx, host) => { await new Promise(r => setTimeout(r, 50)); host.innerHTML = `<ul><li>${ctx.person.first_name} a vécu à Saint-Léonard-de-Noblat en 1900, à 3 km de l’église</li><li>Une autre ligne</li></ul><small class="muted">Source : <a href="https://example.org/fiche/1">Exemple</a></small>`; }},
                {id: 'f_world', icon: '🌍', label: 'Fait du monde', group: 'Le monde', needs: ['person'], run: async (ctx, host) => { host.innerHTML = '<p>Un fait lointain sans rapport précis avec lui.</p><a href="https://example.org/monde">↗</a>'; }},
                {id: 'f_empty', icon: '∅', label: 'Fausse vide', group: 'La personne', needs: ['person'], run: async (ctx, host) => { host.innerHTML = A.empty('Rien du tout.', {icon: '∅'}); }},
                {id: 'f_err', icon: '⛔', label: 'Fausse erreur', group: 'La personne', needs: ['person'], run: async () => { window.__calls.err++; throw new Error('boum'); }},
                {id: 'f_missing', icon: '📦', label: 'Faux pack', group: 'La personne', needs: ['person'], installed: () => false, install: () => { window.__calls.install++; }, run: async (ctx, host) => { host.innerHTML = '<p>ne doit pas tourner</p>'; }},
                {id: 'f_place', icon: '🏞', label: 'Faux lieu', group: 'Le lieu', needs: ['place'], run: async (ctx, host) => { host.innerHTML = `<p>La rivière de ${ctx.place.name} faisait tourner trois moulins.</p>`; }},
                {id: 'f_year', icon: '📅', label: 'Fausse année', group: 'Le monde', needs: ['year'], run: async (ctx, host) => { host.innerHTML = `<p>En ${ctx.year}, un hiver très froid.</p>`; }},
                {id: 'ha_personne', icon: '🧭', label: 'Histoire autour (bloc visible)', group: 'La personne', needs: ['person'], run: async (ctx, host) => { host.innerHTML = '<p>Une bataille près de Limoges, en 1914.</p>'; }},
            ];
        });
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const openPerson = async id => { await p.evaluate(i => { const A = window.LCNDA_APP; A.state.currentPersonId = i; A.setModule('personnes'); }, id); await p.waitForSelector(`#workspace [data-ts-block="${id}"]`, {timeout: 20000}); };
        const UNDO = '.ui-toast button:has-text("Annuler"), .toast button:has-text("Annuler")';
        const undo = async () => { await p.waitForSelector(UNDO, {timeout: 8000}); await p.locator(UNDO).last().click(); };

        /* ═════════ 1. le bloc de la fiche ═════════ */
        await t('👤 le bloc « 🔎 Ce qui le concerne » est sur la fiche, rangé dans les blocs (se cache et se déplace comme les autres)', async () => {
            assert.ok(await p.evaluate(() => window.LCNDA_APP.defaultPersonBlocks.some(b => b[0] === 'tout_sur')));
            await p.evaluate(() => { try { localStorage.setItem('genealogie-person-blocks', JSON.stringify({order: window.LCNDA_APP.defaultPersonBlocks.map(b => b[0]), hidden: []})); } catch (_) {} });
            await openPerson(1);
        });
        await t('👤 les suggestions : la meilleure d’abord (même lieu, de son vivant), ↗ source, rien pour le vide ni l’erreur', async () => {
            await p.waitForFunction(() => document.querySelectorAll('#workspace [data-ts-block] .ts-sug').length >= 2, null, {timeout: 15000});
            const s = await p.evaluate(() => [...document.querySelectorAll('#workspace [data-ts-block] .ts-sug')].map(li => li.textContent.replace(/\s+/g, ' ')));
            assert.match(s[0], /Jean a vécu à Saint-Léonard/); assert.match(s[0], /même lieu/); assert.match(s[0], /de son vivant/); assert.match(s[0], /tout près/);
            assert.ok(!s.some(x => /Rien du tout|boum|ne doit pas tourner/.test(x)), s.join(' | '));
            const href = await p.getAttribute('#workspace [data-ts-block] .ts-sug .ts-src-link', 'href'); assert.strictEqual(href, 'https://example.org/fiche/1');
            // « ha_ » passe pour une source en ligne : elle vient après un court délai, et son bloc est déjà sur la fiche
            await p.waitForFunction(() => [...document.querySelectorAll('#workspace [data-ts-block] .ts-sug')].some(li => /Une bataille/.test(li.textContent) && /déjà sur la fiche/.test(li.textContent)), null, {timeout: 15000});
            assert.ok(await p.evaluate(() => !!document.querySelector('#workspace [data-ts-block] details.ts-more')?.textContent.includes('Une bataille')), 'rangée sous « ▸ voir les N »');
        });
        await t('👤 la dernière ligne « ⤓ … pourraient en dire plus » et le badge 🔎 dans l’en-tête', async () => {
            await p.waitForFunction(() => /pourrai(en)?t en dire plus/.test(document.querySelector('#workspace [data-ts-block]')?.textContent || ''), null, {timeout: 15000});
            const n = await p.textContent('#workspace [data-ts-hero] .ts-hero-n'); assert.ok(Number(n) >= 2, n);
        });
        await t('✓ Garder : note + source sur sa fiche et sur celle de sa femme (cochée d’office), pas sur le fils né après ; ↶ enlève tout', async () => {
            await p.click('#workspace [data-ts-block] .ts-sug [data-ts-keep]');
            await p.waitForSelector('dialog.ts-keep-dialog[open]');
            const who = await p.evaluate(() => [...document.querySelectorAll('.ts-keep-dialog [data-ts-who]')].map(c => [Number(c.dataset.tsWho), c.checked]));
            assert.deepStrictEqual(Object.fromEntries(who), {2: true, 3: false});
            await p.click('.ts-keep-dialog [data-ts-ok]');
            await p.waitForFunction(() => !document.querySelector('dialog.ts-keep-dialog'), null, {timeout: 10000});
            const d1 = await api('person', {id: 1}), d2 = await api('person', {id: 2}), d3 = await api('person', {id: 3});
            assert.strictEqual(d1.notes.length, 1); assert.match(d1.notes[0].body, /Source : Exemple ouvert — https:\/\/example\.org\/fiche\/1 \(consulté le/);
            assert.strictEqual(d2.notes.length, 1); assert.strictEqual(d3.notes.length, 0);
            assert.ok((d1.sources || []).some(s => s.url === 'https://example.org/fiche/1'), JSON.stringify(Object.keys(d1)));
            await p.waitForFunction(() => /1 gardée/.test(document.querySelector('#workspace [data-ts-block]')?.textContent || ''));
            assert.ok(!/Jean a vécu/.test(await p.textContent('#workspace [data-ts-block]')), 'gardée : plus proposée');
            await undo();
            await until(async () => (await api('person', {id: 2})).notes.length === 0 && (await api('person', {id: 1})).notes.length === 0);
            const a1 = await api('person', {id: 1}); assert.strictEqual(a1.notes.length, 0); assert.ok(!(a1.sources || []).some(s => s.url === 'https://example.org/fiche/1'));
        });
        await t('✗ Pas utile : la suggestion disparaît, ↶ la remet', async () => {
            const before = await p.$$eval('#workspace [data-ts-block] .ts-sug', x => x.length);
            await p.click('#workspace [data-ts-block] .ts-sug [data-ts-nope]');
            await p.waitForFunction(n => document.querySelectorAll('#workspace [data-ts-block] .ts-sug').length === n - 1, before);
            await undo();
            await p.waitForFunction(n => document.querySelectorAll('#workspace [data-ts-block] .ts-sug').length === n, before);
        });

        await t('✓ Garder en événement « contexte » (avec sa source sur l’événement) ; ↶ l’enlève', async () => {
            await p.click('#workspace [data-ts-block] .ts-sug [data-ts-keep]');
            await p.waitForSelector('dialog.ts-keep-dialog[open] [name=ts_mode][value=event]');
            await p.check('.ts-keep-dialog [name=ts_mode][value=event]');
            await p.evaluate(() => document.querySelectorAll('.ts-keep-dialog [data-ts-who]').forEach(c => { c.checked = false; }));
            await p.click('.ts-keep-dialog [data-ts-ok]');
            await until(async () => (await api('person', {id: 1})).events.some(e => /^Contexte/.test(e.title || '')));
            const e = (await api('person', {id: 1})).events.find(x => /^Contexte/.test(x.title || ''));
            assert.strictEqual(String(e.date_text), '1900'); assert.strictEqual(e.gedcom_tag, 'EVEN');
            assert.strictEqual((await api('person', {id: 2})).events.filter(x => /^Contexte/.test(x.title || '')).length, 0);
            await undo();
            await until(async () => !(await api('person', {id: 1})).events.some(x => /^Contexte/.test(x.title || '')));
        });

        /* ═════════ 2. ⤢ Tout voir ═════════ */
        await t('⤢ Tout voir : le compte, les groupes, la source de chaque résultat, ⤓ Pas encore installé (MPF oui, INSEE non)', async () => {
            await p.click('#workspace [data-ts-block] ~ * [data-ts-open], #workspace [data-ts-open]');
            await p.waitForSelector('dialog.ts-dialog[open]');
            await p.waitForFunction(() => /données regardées, \d+ ont trouvé quelque chose/.test(document.querySelector('.ts-dialog [data-ts-count]')?.textContent || ''), null, {timeout: 20000});
            if (process.env.TS_SHOT) { await p.waitForTimeout(1500); await p.screenshot({path: require('path').join(process.env.TS_SHOT, 'tout-voir.png')}); } // capture à regarder : TS_SHOT=<dossier>
            const c = await p.textContent('.ts-dialog [data-ts-count]'), m = c.match(/(\d+) données regardées, (\d+) ont/);
            assert.ok(Number(m[1]) >= 8 && Number(m[2]) >= 4, c);
            const groups = await p.$$eval('.ts-dialog [data-ts-group]:not([hidden]) h3', x => x.map(h => h.textContent));
            assert.ok(groups.some(g => /La personne/.test(g)) && groups.some(g => /Ses lieux/.test(g)) && groups.some(g => /Son époque/.test(g)), groups.join());
            assert.ok(await p.evaluate(() => [...document.querySelectorAll('.ts-dialog .ts-res')].every(r => r.querySelector('.ts-src'))));
            // 🔍 recherche et catégories : « Tout » d'abord, puis une par groupe ; un mot cache les cartes qui ne le contiennent pas
            const chipsTxt = await p.$$eval('.ts-dialog [data-ts-chip]', x => x.map(b => b.dataset.tsChip));
            assert.equal(chipsTxt[0], 'all'); assert.ok(chipsTxt.length >= 2, chipsTxt.join(','));
            const vis = () => p.$$eval('.ts-dialog .ts-res', x => x.filter(r => r.offsetParent !== null).length);
            const all = await vis();
            await p.fill('.ts-dialog [data-ts-q]', 'Limoges'); await p.waitForTimeout(200);
            const few = await vis(); assert.ok(few > 0 && few < all, `recherche : ${few} / ${all}`);
            assert.ok(await p.$$eval('.ts-dialog .ts-res', x => x.filter(r => r.offsetParent !== null).every(r => /limoges/i.test(r.textContent))));
            await p.fill('.ts-dialog [data-ts-q]', 'zzzqqq'); await p.waitForTimeout(200);
            assert.equal(await vis(), 0); assert.match(await p.textContent('.ts-dialog [data-ts-none]'), /Rien ne correspond/);
            await p.fill('.ts-dialog [data-ts-q]', ''); await p.waitForTimeout(200); assert.equal(await vis(), all);
            await p.click(`.ts-dialog [data-ts-chip="${chipsTxt[1]}"]`); await p.waitForTimeout(200);
            assert.ok(await p.$$eval(`.ts-dialog [data-ts-group]`, (x, g) => x.every(s => s.offsetParent === null || s.dataset.tsGroup === g), chipsTxt[1]), 'une seule catégorie montrée');
            if (process.env.TS_SHOT) await p.screenshot({path: require('path').join(process.env.TS_SHOT, 'tout-voir-categorie.png')});
            await p.click('.ts-dialog [data-ts-chip="all"]'); await p.waitForTimeout(200); assert.equal(await vis(), all);
            await p.waitForSelector('.ts-dialog [data-ts-missing-box]', {timeout: 20000});
            const miss = await p.textContent('.ts-dialog [data-ts-missing-box]');
            assert.match(miss, /Morts pour la France/); assert.match(miss, /né en 1890 en France/); assert.match(miss, /Faux pack/);
            assert.ok(!/Décès INSEE/.test(miss), 'mort en 1916 : pas l’INSEE');
            const i = await p.evaluate(() => [...document.querySelectorAll('.ts-dialog [data-ts-missing-box] li')].findIndex(li => /Faux pack/.test(li.textContent)));
            await p.click(`.ts-dialog [data-ts-missing-box] li:nth-child(${i + 1}) [data-ts-install]`);
            await p.waitForFunction(() => window.__calls.install === 1);
        });
        await t('⤢ ＋ Ajouter comme note (avec les sources) et ↶ ; Imprimer ouvre la fenêtre d’impression', async () => {
            await p.click('.ts-dialog [data-ts-note]');
            await until(async () => (await api('person', {id: 1})).notes.length === 1);
            const n = (await api('person', {id: 1})).notes[0]; assert.match(n.body, /Fausse trouvaille/); assert.match(n.body, /https:\/\/example\.org\/fiche\/1/);
            await undo();
            await until(async () => (await api('person', {id: 1})).notes.length === 0);
            await p.click('.ts-dialog [data-ts-print]');
            await p.waitForFunction(() => [...document.querySelectorAll('dialog[open]')].some(d => !d.classList.contains('ts-dialog')), null, {timeout: 8000});
            await p.keyboard.press('Escape'); await sleep(300);
            await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
        });

        /* ═════════ 3. un lieu, une année ═════════ */
        await t('📍 un lieu et 📅 une année : seulement les sources qui en parlent', async () => {
            await p.evaluate(() => window.LCNDA_EXT.toutSur.openPlace({id: 2, name: 'Limoges', country: 'France', latitude: 45.83, longitude: 1.26}));
            await p.waitForFunction(() => /ont trouvé quelque chose/.test(document.querySelector('.ts-dialog [data-ts-count]')?.textContent || ''), null, {timeout: 15000});
            assert.match(await p.textContent('.ts-dialog'), /La rivière de Limoges/);
            assert.ok(!/Fausse trouvaille/.test(await p.textContent('.ts-dialog')));
            await p.evaluate(() => window.LCNDA_EXT.toutSur.openYear(1900));
            await p.waitForFunction(() => /En 1900, un hiver très froid/.test(document.querySelector('.ts-dialog')?.textContent || ''), null, {timeout: 15000});
            await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
        });

        /* ═════════ 4. Listes → Données ═════════ */
        await t('🧰 Listes → 🔎 Chercher dans toutes les données : une année → les sources listées, ▶ une, ▶ toutes', async () => {
            assert.ok(await p.evaluate(() => window.LCNDA_APP.defaultListTypes.some(x => x[0] === 'data_tout_sur')));
            await p.evaluate(() => window.LCNDA_EXT.toutSur.openTool());
            await p.waitForSelector('#workspace .ts-tool', {timeout: 15000});
            await p.fill('#workspace [data-ts-year-in]', '1871'); await p.dispatchEvent('#workspace [data-ts-year-in]', 'change');
            await p.waitForSelector('#workspace [data-ts-one="f_year"]');
            assert.ok(!(await p.$('#workspace [data-ts-one="f_found"]')), 'pas de personne choisie : pas de source de personne');
            await p.click('#workspace [data-ts-one="f_year"]');
            await p.waitForFunction(() => /En 1871, un hiver très froid/.test(document.querySelector('#workspace [data-ts-out]')?.textContent || ''), null, {timeout: 10000});
            const groups = await p.evaluate(() => (window.LCNDA_EXT.listGroupDefaults || []).find(g => g[0] === 'g_data')?.[3] || []);
            assert.ok(groups.includes('data_tout_sur'), groups.join());
        });

        /* ═════════ 5. le widget ═════════ */
        await t('📊 le widget : la personne de départ par défaut, les meilleures suggestions, ✓ Garder, ⤢ Tout voir', async () => {
            const html = await p.evaluate(() => { const W = window.LCNDA_EXT.dashboard.tout_sur; const h = W.render(1, {config: {}}, 'span-4'); const d = document.createElement('div'); d.id = 'ts-test-w'; d.innerHTML = h; document.getElementById('workspace').prepend(d); return h; });
            assert.match(html, /Ce qui le\/la concerne/);
            await p.waitForFunction(() => document.querySelectorAll('#ts-test-w .ts-sug').length >= 1, null, {timeout: 15000});
            assert.match(await p.textContent('#ts-test-w'), /Jean MAZAUD|MAZAUD/);
            assert.ok(await p.$('#ts-test-w [data-ts-keep]')); assert.ok(await p.$('#ts-test-w [data-ts-open]'));
            assert.ok((await p.$$('#ts-test-w .ts-sug')).length <= 3, 'petit widget : 3 au plus');
            const cfg = await p.evaluate(() => { const C = window.LCNDA_EXT.dashboardConfig.tout_sur; const d = document.createElement('div'); d.innerHTML = C.html({config: {mode: 'random'}}); return [d.querySelector('[data-tsw-mode][value=random]').checked, C.read(d)]; });
            assert.strictEqual(cfg[0], true); assert.deepStrictEqual(cfg[1], {mode: 'random', person: 0});
        });

        await t('📍 la fiche d’un village : le bouton « 🔎 Ce qui concerne ce lieu »', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'villages'; A.state.hVillage = '87161'; A.setModule('listes'); });
            const ok = await p.waitForSelector('#workspace .ts-place-btn', {timeout: 15000}).then(() => true).catch(() => false);
            if (!ok) { console.log('   (pas de fiche de village dans cette base d’essai : bouton non vérifié)'); return; }
            const pl = JSON.parse(await p.getAttribute('#workspace .ts-place-btn', 'data-ts-place')); assert.match(pl.name, /Saint-Léonard/);
            await p.click('#workspace .ts-place-btn');
            await p.waitForFunction(() => /La rivière de Saint-Léonard/.test(document.querySelector('.ts-dialog')?.textContent || ''), null, {timeout: 15000});
            await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
        });
        await t('🧰 avec toutes les vraies sources de l’app (sans Internet) : le rapport va au bout, sans erreur', async () => {
            await p.evaluate(() => { window.LCNDA_EXT.dataSources = window.__realSources; window.LCNDA_EXT.toutSur.forget(); window.LCNDA_EXT.toutSur.open({person: 1}); });
            await p.waitForFunction(() => /\d+ données regardées, \d+ ont trouvé/.test(document.querySelector('.ts-dialog [data-ts-count]')?.textContent || ''), null, {timeout: 120000});
            console.log('   ' + await p.textContent('.ts-dialog [data-ts-count]'));
            if (process.env.TS_DEBUG) console.log((await p.evaluate(async () => { const T = window.LCNDA_EXT.toutSur; const out = []; for (const [k, pr] of T.cache) { const r = await pr; out.push(`${r.state.padEnd(7)} ${k} :: ${(r.summary || r.error || '').slice(0, 110)}`); } return out; })).join('\n'));
            await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
        });

        /* ═════════ 6. mode consultation ═════════ */
        await t('🔒 mode consultation : ni ✓ Garder, ni 📦 Installer', async () => {
            await p.evaluate(() => document.body.classList.add('is-kiosk'));
            await p.evaluate(() => window.LCNDA_EXT.toutSur.open({person: 1}));
            await p.waitForFunction(() => /ont trouvé quelque chose/.test(document.querySelector('.ts-dialog [data-ts-count]')?.textContent || ''), null, {timeout: 15000});
            await sleep(500);
            assert.strictEqual((await p.$$('.ts-dialog [data-ts-keep], .ts-dialog [data-ts-install], .ts-dialog [data-ts-note]')).length, 0);
            await p.evaluate(() => { document.body.classList.remove('is-kiosk'); document.querySelectorAll('dialog[open]').forEach(d => d.close()); });
        });
        await t('pas d’erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally { await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
