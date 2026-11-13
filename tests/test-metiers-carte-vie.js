'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🧬 Arbre des métiers et 🗺 Carte de la vie :   node tests/test-metiers-carte-vie.js   (MC_SHOTS=dossier pour les captures)
 *  1. noyau (Node, sans écran : app-metiers-carte-core.js) : transmission parent → enfant, cases et liens d'un arbre
 *     (ascendants, descendants), statistiques par siècle, ordre des étapes d'une vie, étapes sans position ;
 *  2. serveur (base de test : tests/fixtures/diagram-more-seed.php + recensement, voyage, guerre, lieu sans position) :
 *     classement des métiers (dictionnaire des métiers anciens → grands secteurs), transmission dans toute la base,
 *     carte_vie dans l'ordre (recensement, voyage, armée), famille, vivants exclus de la vidéo, paramètres forgés ;
 *  3. navigateur (Playwright) : Graphiques → Arbre des métiers (cases, traits « même métier », filtres, statistiques, clic →
 *     fiche, ⤓ Exporter en SVG), ⋯ de la fiche, Carte de la vie (étapes, lieux sans position, lecture ▶, vitesse,
 *     famille), 🎬 vidéo exportée et rangée dans les médias, 1440 / 390 px, mode sombre, aucune erreur.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const appRoot = path.resolve(__dirname, '..');
let failed = 0;
const SHOTS = process.env.MC_SHOTS || '';
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const core = require(path.join(appRoot, 'assets/js/app-metiers-carte-core.js'));

/* ── 1. Noyau ── */
const J = (key, sector = 'agri') => ({ key, sector, text: key });
const tree = { person: { id: 1, gender: 'male', birth_year: 1900 }, children: [
    { person: { id: 2, gender: 'male', birth_year: 1870 }, children: [{ person: { id: 4, gender: 'male', birth_year: 1840 }, children: [] }, { person: { id: 5, gender: 'female', birth_year: 1842 }, children: [] }] },
    { person: { id: 3, gender: 'female', birth_year: 1872 }, children: [] }] };
const jobs = { 1: [J('laboureur')], 2: [J('laboureur'), J('cabaretier', 'comm')], 3: [J('couturiere', 'arti')], 4: [J('tisserand', 'arti')], 5: [] };

(async () => {
    await t('noyau : même métier, changement, inconnu', () => {
        assert.equal(core.link([J('laboureur')], [J('vigneron'), J('laboureur')]), 'same');
        assert.equal(core.link([J('tisserand')], [J('laboureur')]), 'change');
        assert.equal(core.link([], [J('laboureur')]), 'unknown');
        assert.equal(core.link(null, undefined), 'unknown');
    });
    await t('noyau : cases et liens d’un arbre des ascendants (le parent est sous l’enfant)', () => {
        const w = core.walk(tree, 'ancestors');
        assert.deepEqual(w.nodes.map(n => n.id), [1, 2, 4, 5, 3]);
        assert.deepEqual(w.links.map(l => `${l.parent}>${l.child}`), ['2>1', '4>2', '5>2', '3>1']);
        const d = core.walk({ person: { id: 4, gender: 'male' }, children: [{ person: { id: 2, gender: 'male', birth_year: 1870 }, children: [] }] }, 'descendants');
        assert.deepEqual(d.links.map(l => `${l.parent}>${l.child}`), ['4>2']);
    });
    await t('noyau : part des fils qui reprennent le métier du père, par siècle', () => {
        const s = core.stats(core.walk(tree, 'ancestors').links, jobs);
        assert.equal(s.male.pairs, 2); assert.equal(s.male.same, 1); // 2→1 : laboureur repris ; 4→2 : tisserand → changé
        assert.deepEqual(s.male.by.map(b => [b.century, b.same, b.pairs]), [[19, 0, 1], [20, 1, 1]]);
        assert.equal(s.female.pairs, 0, 'mère → fils ne compte pas, mère sans métier non plus');
        assert.equal(core.centuryLabel(19), '19e siècle'); assert.equal(core.centuryLabel(1), '1er siècle'); assert.equal(core.pct(1, 3), 33);
    });
    await t('noyau : étapes d’une vie dans l’ordre, lieux sans position à part', () => {
        const st = core.orderSteps([{ year: 1900, k: 'a' }, { year: null, k: 'z' }, { year: 1850, k: 'b' }, { year: 1900, k: 'c' }, { year: '1870', k: 'd' }]);
        assert.deepEqual(st.map(x => x.k), ['b', 'd', 'a', 'c', 'z']);
        const sp = core.splitSteps([{ place: 'Rennes', lat: 48.1, lon: -1.6 }, { place: 'Ailleurs', lat: null, lon: null }, { place: '' }, { place: 'Zéro', lat: 'x', lon: 2 }]);
        assert.equal(sp.located.length, 1); assert.equal(sp.missing.length, 2); assert.equal(sp.noPlace.length, 1);
    });

    /* ── 2 et 3. Serveur et navigateur ── */
    let chromium = null;
    for (const p of ['playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright']) { try { ({ chromium } = require(p)); break; } catch (_) { chromium = null; } }
    const php = spawnSync('php', ['-v'], { encoding: 'utf8' }).status === 0 ? 'php' : null;
    if (!php) { console.log('— serveur : PHP absent, partie sautée'); process.exit(failed ? 1 : 0); }
    const tmp = fs.mkdtempSync(path.join(process.env.MC_TMP || os.tmpdir(), 'lcnda-mc-'));
    const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    fs.mkdirSync(path.join(tmp, 'media'), { recursive: true });
    const init = spawnSync(php, ['-r', 'require "lib/paths.php"; (new PDO("sqlite:".DATA_DIR."/genealogy.sqlite"))->exec(file_get_contents(APP_ROOT."/data/schema.sql")); require "lib/bootstrap.php"; db();'], { cwd: appRoot, encoding: 'utf8', env: envFor(tmp) });
    if (init.status !== 0) { console.error(init.stderr || init.stdout); process.exit(1); }
    // la vie du n° 2 : un recensement (métier), un voyage, un fait de guerre, une résidence dans un lieu sans position ; un ouvrier d'usine
    const SEED = String.raw`<?php
require $argv[1];
$p2 = $sosa[2];
$tagId = static function (string $t) use ($pdo): int { $s = $pdo->prepare('SELECT id FROM event_types WHERE gedcom_tag=? LIMIT 1'); $s->execute([$t]); return (int) $s->fetchColumn(); };
$pdo->prepare("INSERT INTO census_records(year,date_text,place_id) VALUES(1906,'1906',?)")->execute([$pid[0]]); $cr = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO census_members(census_id,person_id,display_name,occupation) VALUES(?,?,?,?)")->execute([$cr, $p2, 'n° 2', 'tisserand']);
$pdo->prepare("INSERT INTO person_voyages(person_id,departure_date,departure_year,departure_port,ship_name,destination,arrival_date,dep_lat,dep_lon,dest_lat,dest_lon) VALUES(?,?,?,?,?,?,?,?,?,?,?)")->execute([$p2, '3 mai 1952', 1952, 'Le Havre', 'Normandie <b>x</b>', 'New York', '9 mai 1952', 49.4944, 0.1079, 40.7128, -74.006]);
$pdo->prepare("INSERT INTO poilu_events(person_id,event_date,kind,place_text,note) VALUES(?,?,?,?,?)")->execute([$p2, '12 mars 1945', 'blessure', 'Caen', 'éclat']);
$pdo->prepare("INSERT INTO places(name,county,country) VALUES('Qwzlieu-Imaginaire','Nulle-Part','Atlantide')")->execute(); $nowhere = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)")->execute([$p2, $tagId('RESI') ?: $tagId('BIRT'), '1950', 1950, '1950-01-01', $nowhere]);
$pdo->prepare("UPDATE persons SET occupation='ouvrier d’usine' WHERE id=?")->execute([$sosa[3]]);
echo "ok mc $p2\n";`;
    const seedFile = path.join(tmp, 'seed.php'); fs.writeFileSync(seedFile, SEED);
    const r = spawnSync(php, [seedFile, path.join(appRoot, 'tests/fixtures/diagram-more-seed.php')], { cwd: appRoot, encoding: 'utf8', env: envFor(tmp) });
    if (r.status !== 0 || !/^ok mc \d+/m.test(r.stdout)) { console.error(r.stderr || r.stdout); process.exit(1); }
    const P2 = Number(r.stdout.match(/^ok mc (\d+)/m)[1]);
    const port = Number(process.env.MC_PORT) || await freePort();
    const proc = spawn(php, ['-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(tmp), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const mediaCount = () => Number(spawnSync(php, ['-r', `$p=new PDO('sqlite:${path.join(tmp, 'genealogy.sqlite')}');echo $p->query('SELECT COUNT(*) FROM media')->fetchColumn();`], { encoding: 'utf8' }).stdout.trim());
    const get = async q => { const res = await fetch(base + 'api.php?' + new URLSearchParams(q)); return { status: res.status, body: await res.json().catch(() => null) }; };
    try {
        await t('serveur : métiers classés par grand secteur (dictionnaire des métiers anciens)', async () => {
            const all = await get({ action: 'person_names' });
            const ids = (all.body.persons || all.body || []).map(x => x.id).slice(0, 400);
            const { body } = await get({ action: 'metiers_arbre', ids: ids.join(','), base: 1 });
            const flat = Object.values(body.jobs).flat();
            const sec = k => flat.find(j => j.key === k)?.sector;
            assert.equal(sec('laboureur'), 'agri'); assert.equal(sec('tisserand'), 'arti'); assert.equal(sec('marchand'), 'comm');
            assert.equal(flat.find(j => /ouvrier/.test(j.text))?.sector, 'indu', 'métier hors dictionnaire : par les mots');
            assert.ok(body.sectors.length >= 10 && body.sectors.every(s => /^#[0-9a-f]{6}$/.test(s[3])));
            assert.ok(body.base.male.pairs > 0 && body.base.male.same > 0, 'transmission père → fils dans la base : ' + JSON.stringify(body.base.male));
            assert.ok(body.hidden.length >= 1, 'les vivants sont signalés');
        });
        await t('serveur : carte_vie dans l’ordre, recensement, voyage, armée, lieu sans position, famille, vivants exclus', async () => {
            const { body: v } = await get({ action: 'carte_vie', person: P2 });
            const ys = v.steps.map(s => s.year).filter(y => y !== null);
            assert.deepEqual(ys, [...ys].sort((a, b) => a - b), 'dans l’ordre des années');
            const src = new Set(v.steps.map(s => s.src));
            for (const k of ['event', 'census', 'voyage', 'military']) assert.ok(src.has(k), k);
            const voy = v.steps.filter(s => s.src === 'voyage'); assert.equal(voy.length, 2); assert.equal(voy[1].place, 'New York'); assert.equal(voy[1].lat, 40.7128);
            assert.ok(v.steps.some(s => s.place === 'Qwzlieu-Imaginaire' && s.lat === null), 'lieu sans position'); assert.ok(v.missing >= 1);
            const { body: f } = await get({ action: 'carte_vie', person: P2, family: 1 });
            assert.ok(f.steps.some(s => s.src === 'child') && f.steps.length > v.steps.length, 'avec la famille');
            const { body: sh } = await get({ action: 'carte_vie', person: P2, family: 1, share: 1 });
            assert.ok(sh.steps.filter(s => s.src === 'child').length < f.steps.filter(s => s.src === 'child').length, 'vivants retirés de la vidéo');
            const root = (await get({ action: 'carte_vie', person: 0 })).body.id;
            const { body: pr } = await get({ action: 'carte_vie', person: root, share: 1 }); assert.equal(pr.private, true, 'la racine est vivante');
            for (const q of [{ action: 'carte_vie', 'person[]': 1 }, { action: 'metiers_arbre', 'ids[]': 1 }, { action: 'metiers_arbre', ids: 'a,-3,1e9,' + 'x'.repeat(30000) }]) assert.equal((await get(q)).status, 200, JSON.stringify(q).slice(0, 60));
        });
        if (!chromium) { console.log('— navigateur : Playwright absent, partie sautée'); process.exitCode = failed ? 1 : 0; return; }
        const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
        const browser = await chromium.launch(exe ? { executablePath: exe } : {});
        const errors = [];
        const watch = p => { p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource|tile/.test(m.text())) errors.push(m.text()); }); p.on('dialog', d => { errors.push('dialogue : ' + d.message()); d.dismiss(); }); };
        const ready = async p => { await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.bootstrap && window.LCNDA_EXT?.occTree && window.LCNDA_EXT?.lifeMap && window.LCNDA_EXT?.storyMap, null, { timeout: 30000 }); await p.waitForTimeout(400); };
        const shot = async (p, name, sel) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); if (sel) { const el = await p.$(sel); if (el) await el.screenshot({ path: path.join(SHOTS, name + '.png') }); } else await p.screenshot({ path: path.join(SHOTS, name + '.png') }); };
        const openTree = async (p, id) => { await p.evaluate(id => { localStorage.removeItem('genealogie-occtree'); window.LCNDA_APP.state.graphDepth = 5; window.LCNDA_EXT.occTree.open(id); }, id); await p.waitForSelector('[data-occ-view] .occ-card', { timeout: 20000 }); };
        try {
            const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, acceptDownloads: true });
            const p = await ctx.newPage(); watch(p); await ready(p);
            await t('Graphiques → Arbre des métiers : cases colorées, « même métier », légende, statistiques', async () => {
                await openTree(p, P2);
                assert.equal(await p.evaluate(() => window.LCNDA_APP.state.graphMode), 'occtree');
                assert.ok(await p.locator('.occ-card').count() >= 15);
                assert.ok(await p.locator('li.occ-li.is-same').count() >= 1, 'au moins un fils a repris le métier de son père');
                assert.ok(await p.locator('li.occ-li.is-change').count() >= 1);
                assert.ok(await p.locator('.occ-card .occ-job').count() > 5);
                assert.match(await p.locator('.occ-legend').innerText(), /Agriculture/);
                assert.match(await p.locator('.occ-stats').innerText(), /Fils qui reprennent le métier de leur père[\s\S]*Dans toute ta base[\s\S]*En tout/);
                const side = await p.locator('#sidebar-content').innerText(); assert.match(side, /Arbre des métiers/);
                await shot(p, 'arbre-metiers-1440');
            });
            await t('filtres : un secteur, un métier ; « Sans les vivants » cache les vivants', async () => {
                await p.locator('[data-occ-sector="arti"]').click();
                const dim = await p.locator('.occ-card.is-dim').count(); assert.ok(dim > 0);
                assert.ok(await p.locator('.occ-card:not(.is-dim) .occ-job', { hasText: /tisserand/i }).count() > 0);
                await p.locator('[data-occ-sector=""]').click(); assert.equal(await p.locator('.occ-card.is-dim').count(), 0);
                await p.locator('.occ-controls input[type=search]').fill('meunier'); await p.waitForTimeout(400);
                const shown = await p.locator('.occ-card:not(.is-dim)').allInnerTexts(); assert.ok(shown.length && shown.every(x => /meunier/i.test(x)), shown.join('|'));
                await p.locator('.occ-controls input[type=search]').fill(''); await p.waitForTimeout(400);
                await openTree(p, await p.evaluate(() => window.LCNDA_APP.state.bootstrap.startPersonId));
                await p.locator('[data-occ-priv]').check({ force: true }); await p.waitForSelector('.occ-card strong:text("Personne vivante ou confidentielle")');
                await p.locator('[data-occ-priv]').uncheck({ force: true }); await p.waitForTimeout(600);
            });
            await t('⤓ Exporter : SVG proposé et téléchargé', async () => {
                await p.locator('[data-graph-export="dialog"]').click(); await p.waitForSelector('dialog.ui-export .ui-export-fmt[data-fmt="svg"]');
                await p.click('dialog.ui-export .ui-export-fmt[data-fmt="svg"]');
                const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 15000 }), p.click('dialog.ui-export [data-ui-go]')]);
                assert.ok(dl.suggestedFilename().endsWith('.svg')); const body = fs.readFileSync(await dl.path(), 'utf8');
                assert.match(body, /^<svg[\s\S]*foreignObject[\s\S]*occ-card/); assert.ok(body.length > 5000);
            });
            await t('clic sur une case → la fiche ; ⋯ de la fiche propose les deux outils', async () => {
                const id = Number(await p.locator('.occ-card').nth(1).getAttribute('data-occ-person'));
                await p.locator('.occ-card').nth(1).click();
                await p.waitForFunction(id => window.LCNDA_APP.state.module === 'personnes' && Number(window.LCNDA_APP.state.currentPersonId) === id, id, { timeout: 15000 });
                await p.waitForSelector('#workspace [data-fsec-hero-more]', { timeout: 15000 });
                await p.click('#workspace [data-fsec-hero-more]'); await p.waitForTimeout(300);
                const menu = await p.evaluate(() => document.body.innerText); assert.match(menu, /Arbre des métiers/); assert.match(menu, /Carte de sa vie/);
                await p.keyboard.press('Escape');
            });
            await t('Carte de la vie : étapes dans l’ordre, lieu sans position à part, lecture ▶ et vitesse, famille', async () => {
                await p.evaluate(() => localStorage.removeItem('genealogie-carte-vie'));
                await p.evaluate(id => window.LCNDA_EXT.lifeMap.open(id), P2);
                await p.waitForSelector('dialog.lv-dlg [data-c2-story]', { timeout: 30000 }); await p.waitForFunction(() => !document.querySelector('dialog.lv-dlg [data-geo-wait]'), null, { timeout: 20000 });
                const n = await p.locator('.lv-step').count(); assert.ok(n >= 6, `${n} étapes`);
                const txt = await p.locator('.lv-side').innerText(); assert.match(txt, /Recensement/); assert.match(txt, /Départ en voyage/); assert.match(txt, /Service militaire/);
                assert.match(txt, /Lieux sans position[\s\S]*Qwzlieu-Imaginaire/);
                assert.ok(await p.locator('.lv-step.is-noplace').count() >= 1);
                await p.waitForSelector('dialog.lv-dlg .c2-tools [data-c2-t="play"]'); assert.equal(await p.locator('dialog.lv-dlg [data-c2-speed] option').count(), 3);
                await p.selectOption('dialog.lv-dlg [data-c2-speed]', '900');
                await p.click('dialog.lv-dlg [data-c2-t="play"]'); await p.waitForTimeout(2200);
                const cur = Number(await p.getAttribute('dialog.lv-dlg [data-c2-story]', 'data-c2-cur')); assert.ok(cur >= 1, 'la lecture avance : ' + cur);
                assert.equal(await p.locator('.lv-step.is-active').count(), 1);
                await p.click('dialog.lv-dlg [data-c2-t="play"]');
                await p.locator('.lv-step').nth(2).click(); await p.waitForTimeout(300);
                assert.equal(await p.getAttribute('dialog.lv-dlg [data-c2-story]', 'data-c2-cur'), '2', 'étape cliquée');
                await shot(p, 'carte-vie-1440', 'dialog.lv-dlg');
                await p.locator('[data-lv-family]').check({ force: true }); await p.waitForFunction(n => document.querySelectorAll('.lv-step').length > n, n, { timeout: 20000 });
                assert.match(await p.locator('.lv-side').innerText(), /son fils|sa fille/);
            });
            await t('🎬 vidéo exportée (moteur des diagrammes) et rangée dans les médias', async () => {
                const nb = mediaCount();
                await p.click('dialog.lv-dlg [data-lv-video]'); await p.waitForSelector('dialog.ui-export [data-ui-copy]');
                assert.equal(await p.isChecked('dialog.ui-export [data-ui-copy]'), true);
                await p.selectOption('dialog.ui-export [data-ui-fsel="per"]', '1200');
                const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 120000 }), p.click('dialog.ui-export [data-ui-go]')]);
                assert.match(dl.suggestedFilename(), /^la-vie-de-.*\.(mp4|webm)$/);
                const size = fs.statSync(await dl.path()).size; assert.ok(size > 2000, `${size} octets`);
                const last = await p.evaluate(() => window.LCNDA_EXT.lifeMap._lastVideo()); assert.ok(last.frames >= 3);
                await p.waitForFunction(() => /rangée dans les médias|pas rangée/.test(document.body.innerText), null, { timeout: 20000 });
                assert.doesNotMatch(await p.evaluate(() => document.body.innerText), /pas rangée dans les médias/);
                const na = mediaCount(); assert.equal(na, nb + 1, `médias : ${nb} → ${na}`);
                assert.equal(spawnSync(php, ['-r', `$p=new PDO('sqlite:${path.join(tmp, 'genealogy.sqlite')}');echo $p->query("SELECT media_type FROM media ORDER BY id DESC LIMIT 1")->fetchColumn();`], { encoding: 'utf8' }).stdout.trim(), 'video');
                await p.click('dialog.lv-dlg [data-lv-x]');
            });
            await t('la Carte : « 🗺 Carte de la vie » dans la colonne de gauche', async () => {
                await p.evaluate(() => window.LCNDA_APP.setModule('carte')); await p.waitForSelector('#sidebar-content [data-open-life-map]', { timeout: 15000 });
                await p.click('#sidebar-content [data-open-life-map]'); await p.waitForSelector('dialog.lv-dlg', { timeout: 15000 });
                await p.click('dialog.lv-dlg [data-lv-x]');
            });
            for (const [w, dark] of [[390, false], [390, true], [1440, true]]) {
                await t(`${w} px${dark ? ', mode sombre' : ''} : rien ne déborde, fonds lisibles`, async () => {
                    const m = await ctx.newPage(); await m.setViewportSize({ width: w, height: 860 }); if (dark) await m.emulateMedia({ colorScheme: 'dark' }); watch(m); await ready(m);
                    if (dark) { // le vrai mode sombre de l'app : Apparence → thème « dark »
                        await m.evaluate(() => { let d = {}; try { d = JSON.parse(localStorage.getItem('genealogie-design') || '{}') || {}; } catch (_) {} localStorage.setItem('genealogie-design', JSON.stringify({...d, preset: 'dark'})); });
                        await m.reload(); await ready(m); assert.equal(await m.evaluate(() => document.documentElement.dataset.theme), 'dark'); }
                    await openTree(m, P2);
                    const ov = await m.evaluate(() => ({ doc: document.documentElement.scrollWidth, ctl: document.querySelector('.occ-controls').getBoundingClientRect().right }));
                    assert.ok(ov.doc <= w + 1 && ov.ctl <= w + 1, JSON.stringify(ov));
                    if (dark) { const bg = await m.evaluate(() => getComputedStyle(document.querySelector('.occ-controls')).backgroundColor); assert.notEqual(bg, 'rgb(255, 255, 255)'); }
                    await m.evaluate(() => document.querySelector('.occ-controls').scrollIntoView()); await m.waitForTimeout(200);
                    await shot(m, `arbre-metiers-${w}${dark ? '-sombre' : ''}`);
                    await m.evaluate(id => window.LCNDA_EXT.lifeMap.open(id), P2); await m.waitForSelector('dialog.lv-dlg [data-c2-story]', { timeout: 30000 }); await m.waitForTimeout(600);
                    const lv = await m.evaluate(() => { const d = document.querySelector('dialog.lv-dlg'); return { dlg: d.getBoundingClientRect().right, svg: d.querySelector('[data-lv-map] svg').getBoundingClientRect().right, map: getComputedStyle(d.querySelector('[data-lv-map]')).backgroundColor }; });
                    assert.ok(lv.dlg <= w + 1 && lv.svg <= w + 1, JSON.stringify(lv)); assert.notEqual(lv.map, 'rgba(0, 0, 0, 0)');
                    await shot(m, `carte-vie-${w}${dark ? '-sombre' : ''}`, 'dialog.lv-dlg');
                    await m.close();
                });
            }
            await t('aucune erreur JavaScript', async () => assert.deepEqual(errors, []));
        } finally { await browser.close(); }
    } finally { proc.kill(); fs.rmSync(tmp, { recursive: true, force: true }); }
    process.exit(failed ? 1 : 0);
})();
