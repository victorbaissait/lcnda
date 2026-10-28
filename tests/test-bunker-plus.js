'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * ☢ Le bunker, dans le navigateur : 📜 scénarios historiques (les ancêtres qui vivaient à la date, jamais un vivant ni une fiche
 * confidentielle), 🏆 succès et records (gardés sur cet ordinateur, jamais en base), ⏪ reprendre au matin d'avant (avec « ↶ Annuler »).
 *     node tests/test-bunker-plus.js        (SHOTS=dossier pour les captures)
 * Le moteur est vérifié à part : tests/test-bunker.js.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

let failures = 0;
async function t(name, fn) { try { await fn(); console.log('  ✓ ' + name); } catch (e) { failures++; console.log('  ✗ ' + name + '\n    ' + (e && e.stack || e).toString().split('\n').slice(0, 6).join('\n    ')); } }

(async () => {
    let pw; try { pw = require('/opt/node22/lib/node_modules/playwright'); } catch (_) { try { pw = require('playwright'); } catch (__) { console.log('  (Playwright absent : test sauté)'); return; } }
    const appRoot = path.resolve(__dirname, '..'), phpPath = findPhp([devBundledPhp()]);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-bunker-')), env = {...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
    fs.mkdirSync(path.join(dir, 'media'), {recursive: true});
    // 6 Parisiens et 3 Lyonnais qui vivaient en 1870, un vivant et une fiche confidentielle de la même époque (jamais dans le jeu), 3 ancêtres de 1700
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $p = db();
$tag = function ($t) use ($p) { $s = $p->prepare('SELECT id FROM event_types WHERE gedcom_tag=? LIMIT 1'); $s->execute([$t]); $id = (int) $s->fetchColumn();
    if (!$id) { $p->prepare('INSERT INTO event_types(name, gedcom_tag) VALUES(?, ?)')->execute([$t, $t]); $id = (int) $p->lastInsertId(); } return $id; };
$place = function ($n) use ($p) { $s = $p->prepare('SELECT id FROM places WHERE name=?'); $s->execute([$n]); $id = (int) $s->fetchColumn(); if (!$id) { $p->prepare('INSERT INTO places(name) VALUES(?)')->execute([$n]); $id = (int) $p->lastInsertId(); } return $id; };
$add = function ($first, $last, $g, $by, $dy, $town, $status = 'deceased', $priv = 0) use ($p, $tag, $place) {
    $p->prepare("INSERT INTO persons(first_name,last_name,gender,occupation,living_status,is_private) VALUES(?,?,?,?,?,?)")->execute([$first, $last, $g, 'menuisier', $status, $priv]);
    $id = (int) $p->lastInsertId();
    $p->prepare('INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES(?,?,?,?,?,?)')->execute(['person', $id, $tag('BIRT'), (string) $by, $by, $place($town)]);
    if ($dy) { $p->prepare('INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES(?,?,?,?,?,?)')->execute(['person', $id, $tag('DEAT'), (string) $dy, $dy, $place($town)]); }
};
foreach (['Jules', 'Eugénie', 'Auguste', 'Clémence', 'Émile', 'Berthe'] as $i => $f) { $add($f, 'PARISIEN', $i % 2 ? 'female' : 'male', 1820 + 8 * $i, 1880 + 5 * $i, 'Paris, Seine, Île-de-France'); }
foreach (['Claude', 'Benoîte', 'Antoine'] as $i => $f) { $add($f, 'LYONNAIS', $i % 2 ? 'female' : 'male', 1830 + $i, 1890, 'Lyon, Rhône'); }
$add('Vivant', 'TOUJOURS', 'male', 1850, 0, 'Paris, Seine, Île-de-France', 'living');
$add('Cachée', 'SECRÈTE', 'female', 1840, 1900, 'Paris, Seine, Île-de-France', 'deceased', 1);
foreach (['Jean', 'Marie', 'Pierre'] as $i => $f) { $add($f, 'ANCIEN', $i % 2 ? 'female' : 'male', 1680 + $i, 1740, 'Marseille, Bouches-du-Rhône'); }
echo 'ok';`], {cwd: appRoot, encoding: 'utf8', env});
    if (r.status !== 0 || !/ok$/.test(r.stdout.trim())) { console.log('  ✗ base de test\n' + (r.stderr || r.stdout)); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], {cwd: appRoot, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const shots = process.env.SHOTS || ''; if (shots) fs.mkdirSync(shots, {recursive: true});
    const shot = async (page, name) => { if (shots) await page.screenshot({path: path.join(shots, name + '.png')}); };
    const browser = await pw.chromium.launch();
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 950}});
        await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, rt => rt.abort());
        const page = await ctx.newPage();
        const errors = [], leaks = [];
        page.on('pageerror', e => errors.push(String(e.message)));
        page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) errors.push(m.text()); });
        page.on('request', q => { if (q.method() !== 'GET' && /bunker/i.test(q.postData() || '')) leaks.push(q.url()); }); // jamais rien du bunker vers le serveur
        await page.goto(base);
        await page.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.openBunker && window.LCNDA_BUNKER, null, {timeout: 30000});
        const G = fn => page.evaluate(fn);
        const advance = (min, prep = '') => page.evaluate(([m, p]) => { const D = window.LCNDA_EXT.bunkerDebug, g = D.game(); g.speed = 0; if (p) (new Function('g', p))(g); window.LCNDA_BUNKER.run(g, m); D.redraw(); }, [min, prep]);

        console.log('Navigateur');
        await t('📜 Nouvelle partie : le scénario historique dit combien d’ancêtres y vivaient (ni vivant ni fiche confidentielle)', async () => {
            await G(() => window.LCNDA_EXT.openBunker()); await page.waitForSelector('[data-bk-new]');
            await page.waitForFunction(() => /ancêtre/.test(document.querySelector('select[name="bk_scen"] option[value="h1870"]')?.textContent || ''), null, {timeout: 15000});
            assert.match(await page.$eval('select[name="bk_scen"] option[value="h1870"]', o => o.textContent), /9 ancêtres de ta famille/);
            assert.match(await page.$eval('select[name="bk_scen"] option[value="h1720"]', o => o.textContent), /3 ancêtres de ta famille/);
            await page.selectOption('select[name="bk_scen"]', 'h1870');
            const line = await page.$eval('[data-bk-histline]', e => e.textContent); assert.match(line, /9 ancêtres de ta famille/); assert.match(line, /dont 6 en Île-de-France/);
            assert.equal(await page.$eval('[data-bk-modern]', e => e.hidden), true, 'pas de choix de l’équipe : elle vient de la date');
            await shot(page, 'bunker-accueil-1870');
        });
        await t('📜 le siège de Paris : la date, le crieur, l’abri sans électricité ; l’équipe vient de Paris, sans le vivant ni la fiche confidentielle', async () => {
            await page.selectOption('select[name="bk_hn"]', '5'); await page.click('[data-bk-new] [type=submit]'); await page.waitForSelector('.bk-game');
            const info = await G(() => { const g = window.LCNDA_EXT.bunkerDebug.game(); return {names: g.people.map(p => p.name), scen: g.scen, slots: g.floors[0].slots.slice(0, 3)}; });
            assert.equal(info.scen, 'h1870'); assert.equal(info.names.length, 5); assert.ok(info.names.every(n => /PARISIEN/.test(n)), info.names.join());
            assert.ok(!info.names.some(n => /TOUJOURS|SECRÈTE/.test(n))); assert.deepEqual(info.slots, ['crieur', 'cheminee', 'atelier']);
            assert.match(await page.$eval('[data-bk-clock]', e => e.textContent), /19 septembre 1870/);
            assert.match(await page.$eval('[data-bk="tab"][data-v="radio"]', e => e.textContent), /Crieur/);
            assert.ok(await page.$eval('[data-bk-state]', e => e.textContent.includes('🕯️')));
            await shot(page, 'bunker-partie-1870');
        });
        await t('🏆 un succès gagné : message en bas à gauche, gardé sur cet ordinateur avec sa date', async () => {
            await advance(60, 'g.stats.raidsWon = 3;');
            await page.waitForFunction(() => [...document.querySelectorAll('body *')].some(e => e.children.length === 0 && /🏆 Succès : 🛡️ Repousser 3 pillages/.test(e.textContent)), null, {timeout: 5000});
            const rec = await G(() => JSON.parse(localStorage.getItem('lcnda-bunker-records') || '{}')); assert.ok(rec.ach?.pill3?.at, JSON.stringify(rec));
            assert.equal(await G(() => Object.keys(localStorage).filter(k => /^genealogie-.*bunker/.test(k)).length), 0, 'pas une clé recopiée dans la base');
        });
        await t('⏪ défaite : « Reprendre au matin du jour N… », la liste des matins, reprendre sans question puis « ↶ Annuler »', async () => {
            await advance(1440 * 2 + 60);
            assert.ok((await G(() => window.LCNDA_EXT.bunkerDebug.game().mornings.length)) >= 3);
            await advance(600, 'g.res.eau = 0; g.res.eausale = 0; g.res.nourriture = 0; g.people.forEach(p => { p.hp = 1; p.needs.soif = 0; p.needs.faim = 0; });');
            await page.waitForSelector('.bk-over [data-bk="rewind"]'); await shot(page, 'bunker-defaite');
            await page.click('.bk-over [data-bk="rewind"]'); await page.waitForSelector('.bk-morns');
            const rows = await page.$$eval('.bk-morns li', l => l.map(x => x.textContent)); assert.ok(rows.length >= 3); assert.match(rows[0], /habitant/); assert.match(rows.join(' '), /septembre 1870/);
            await shot(page, 'bunker-matins');
            const d = Number(await page.$eval('.bk-morns li:nth-child(2) [data-bk="rewindgo"]', b => b.dataset.d));
            await page.click('.bk-morns li:nth-child(2) [data-bk="rewindgo"]'); await page.waitForTimeout(300);
            const after = await G(() => { const g = window.LCNDA_EXT.bunkerDebug.game(), B = window.LCNDA_BUNKER; return {over: g.over, day: B.dayOf(g.t), alive: B.alive(g).length, rew: g.rewound}; });
            assert.deepEqual(after, {over: false, day: d, alive: 5, rew: 1});
            await page.click('text=↶ Annuler'); await page.waitForTimeout(300);
            assert.equal(await G(() => window.LCNDA_EXT.bunkerDebug.game().over), true, '« ↶ Annuler » ramène où on était');
        });
        await t('🏆 la page « Succès et records » : gagnés avec la date, les autres grisés ou « ? », les meilleures parties', async () => {
            await page.click('.bk-over [data-bk="records"]'); await page.waitForSelector('.bk-badges');
            assert.ok(await page.$('.bk-badge.is-got')); assert.ok(await page.$('.bk-badge.is-off')); assert.ok(await page.$('.bk-badge.is-hidden'));
            assert.match(await page.$eval('.bk-badge.is-got', e => e.textContent), /Repousser 3 pillages.*✓/s);
            assert.match(await page.$eval('.bk-rec-table tbody', e => e.textContent), /Le siège de Paris/);
            await shot(page, 'bunker-succes-1440');
            await page.click('.bk-panel [data-bk="gzclose"]');
        });
        await t('⋯ dans la partie : reprendre au matin, succès, livre, exporter', async () => {
            await page.click('[data-bk="more"]'); await page.waitForTimeout(200);
            const txt = await G(() => document.querySelector('.ui-actmenu')?.textContent || ''); assert.match(txt, /Reprendre au matin/); assert.match(txt, /Succès et records/); assert.match(txt, /Exporter/);
            await page.keyboard.press('Escape');
        });
        await t('🗺️ l’onglet Région : la carte dessinée par le jeu, un convoi qui part (provisions, poids) et revient ; les groupes et leur réputation', async () => {
            await advance(10, 'g.over = false; g.people.forEach(p => { p.hp = 100; Object.keys(p.needs).forEach(k => { p.needs[k] = 90; }); }); window.LCNDA_BUNKER.RES_KEYS.forEach(r => { g.res[r] = Math.min(60, window.LCNDA_BUNKER.cap(g, r)); });');
            await page.click('[data-bk="tab"][data-v="region"]'); await page.waitForSelector('svg.bk-region');
            assert.equal(await page.$$eval('svg.bk-region image, .bk-regionwrap img', l => l.length), 0, 'aucun fond de carte en ligne');
            const n = await page.$$eval('.bk-rnode[data-id]:not(.is-fog)', l => l.length); assert.ok(n >= 2, `${n} lieux connus`);
            assert.ok(await page.$$eval('.bk-group', l => l.length) >= 3); assert.match(await page.$eval('.bk-groups', e => e.textContent), /Bande rivale/);
            await page.click('.bk-rnode[data-id]:not(.is-fog)'); await page.click('[data-bk="cform"]'); await page.waitForSelector('[data-bk-cw]');
            await page.click('[data-bk-cw]'); await page.click('[data-bk="cneed"]'); await page.waitForTimeout(100);
            assert.match(await page.$eval('.bk-load', e => e.textContent), /Chargement/);
            await shot(page, 'bunker-region-1440');
            await page.click('[data-bk="cgo"]'); await page.waitForTimeout(150);
            assert.equal(await G(() => window.LCNDA_EXT.bunkerDebug.game().convoys.length), 1, 'le convoi est parti');
            assert.ok(await page.$('.bk-rconv'), 'le convoi sur la carte');
            for (let i = 0; i < 10 && await G(() => window.LCNDA_EXT.bunkerDebug.game().convoys.length); i++) await advance(600, 'g.visit = null; g.people.forEach(p => { if (p.hp > 0) { p.hp = Math.max(p.hp, 80); Object.keys(p.needs).forEach(k => { p.needs[k] = Math.max(p.needs[k], 60); }); } });');
            assert.equal(await G(() => window.LCNDA_EXT.bunkerDebug.game().convoys.length), 0, 'le convoi est rentré');
            assert.ok(await G(() => window.LCNDA_EXT.bunkerDebug.game().log.some(l => /Le convoi est rentré/.test(l.txt))));
        });
        await t('🏚️ un bâtiment de la ville : sur le plan, sa fiche, on lance le chantier', async () => {
            await page.click('[data-bk="tab"][data-v="ville"]'); await page.waitForSelector('.bk-cell.is-site');
            await page.click('.bk-cell.is-site'); await page.waitForSelector('.bk-site');
            assert.match(await page.$eval('.bk-site', e => e.textContent), /RUINE/);
            await G(() => { const g = window.LCNDA_EXT.bunkerDebug.game(); window.LCNDA_BUNKER.RES_KEYS.forEach(r => { g.res[r] = Math.min(60, window.LCNDA_BUNKER.cap(g, r)); }); });
            await page.click('[data-bk="sstart"]'); await page.waitForTimeout(100);
            assert.match(await page.$eval('.bk-site', e => e.textContent), /CHANTIER/); await shot(page, 'bunker-batiment-1440');
        });
        await t('🧓 souvenirs des ancêtres : interrupteur dans les réglages, une anecdote vraie en bulle et dans le journal (jamais le vivant ni la fiche confidentielle)', async () => {
            const info = await G(() => { const g = window.LCNDA_EXT.bunkerDebug.game(); return {on: !!g.opt.souvenirs, mem: g.people.filter(p => p.mem).length, bank: JSON.stringify(g.memBank)}; });
            assert.ok(info.on, 'allumée au départ'); assert.ok(info.mem >= 1); assert.ok(!/TOUJOURS|SECRÈTE/.test(info.bank));
            await advance(10, "const B = window.LCNDA_BUNKER, p = g.people.find(x => x.mem && x.hp > 0); p.memSaid = []; for (let i = 0; i < 30 && !g.bubbles.length; i++) { p.memSaid = []; B.souvenirAt(g, p, {kind: 'city', place: {id: 'zz', kind: 'mairie', name: 'x'}}); }");
            await page.waitForSelector('.bk-bubble'); await page.waitForTimeout(500); assert.match(await page.$eval('.bk-bubble', e => e.textContent), /Paris|menuisier|né·e/);
            await shot(page, 'bunker-souvenir-1440');
            await page.click('[data-bk="tab"][data-v="regl"]'); await page.waitForSelector('[data-bk-opt="souvenirs"]');
            assert.ok(await page.$eval('[data-bk-opt="souvenirs"]', e => e.checked && !!e.closest('.ui-toggle')), 'un interrupteur (K16)');
        });
        await t('🎓 💞 un habitant : former un apprenti, ses liens', async () => {
            await G(() => { const g = window.LCNDA_EXT.bunkerDebug.game(); g.people.forEach(p => { p.sk.construire = 1; }); g.people[0].sk.construire = 2; window.LCNDA_EXT.bunkerDebug.redraw(); });
            await page.click('[data-bk="tab"][data-v="gens"]'); await page.waitForSelector('[data-bk="appr"]'); await page.click('[data-bk="appr"]'); await page.waitForSelector('.ui-actmenu');
            await page.click('.ui-actmenu button.ui-actmenu-i:not([disabled]) >> nth=0'); await page.waitForTimeout(150);
            assert.equal(await G(() => window.LCNDA_EXT.bunkerDebug.game().appr.length), 1); assert.ok(await page.$('.bk-chip.is-appr'));
            await page.click('[data-bk="diary"][data-id]'); await page.waitForSelector('.bk-links'); await shot(page, 'bunker-liens-1440');
            await page.click('[data-bk="diary"][data-id=""]');
        });
        await t('390 px et sombre : accueil, partie, succès sans débordement', async () => {
            await page.setViewportSize({width: 390, height: 844});
            await G(() => { const A = window.LCNDA_APP; localStorage.setItem('genealogie-design', JSON.stringify({...A.readDesignSettings(), preset: 'dark'})); A.applyDesign(); });
            assert.equal(await G(() => document.documentElement.dataset.theme), 'dark');
            const over = () => G(() => { const d = document.querySelector('.bk-dlg'); return Math.max(document.documentElement.scrollWidth - innerWidth, (d.firstElementChild?.scrollWidth || 0) - d.clientWidth); });
            await page.click('[data-bk="menu"]'); await page.waitForSelector('[data-bk-new]'); await page.selectOption('select[name="bk_scen"]', 'h1709');
            assert.ok(await over() <= 1, `accueil : ${await over()}px de trop`); await shot(page, 'bunker-accueil-390-sombre');
            await page.click('[data-bk-new] [type=submit]'); await page.waitForSelector('.bk-game');
            assert.ok(await over() <= 1, `partie : ${await over()}px de trop`); await shot(page, 'bunker-partie-390-sombre');
            await page.click('[data-bk="tab"][data-v="region"]'); await page.waitForSelector('svg.bk-region'); assert.ok(await over() <= 1, `région : ${await over()}px de trop`); await shot(page, 'bunker-region-390-sombre');
            await page.click('[data-bk="more"]'); await page.waitForSelector('.ui-actmenu'); await page.click('.ui-actmenu >> text=Succès et records'); await page.waitForSelector('.bk-badges');
            const bg = await page.$eval('.bk-panel', e => getComputedStyle(e).backgroundColor); assert.notEqual(bg, 'rgb(255, 255, 255)', 'le panneau suit le mode sombre');
            await shot(page, 'bunker-succes-390-sombre');
        });
        await t('jamais rien du bunker envoyé au serveur', () => assert.deepEqual(leaks, []));
        await t('aucune erreur JavaScript', () => assert.deepEqual(errors, []));
    } finally { await browser.close(); proc.kill(); fs.rmSync(dir, {recursive: true, force: true}); }
    console.log(failures ? `✗ ${failures} échec(s)` : '✓ bunker (navigateur) : tout va bien');
    process.exit(failures ? 1 : 0);
})();
