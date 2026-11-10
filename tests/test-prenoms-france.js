'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 👶 Transmission des prénoms et 📊 Ta famille et l'histoire de France (lib/prenoms_france.php,
 * assets/js/heritage-prenoms-france.js, assets/data/moyennes-france.json) :
 *     node tests/test-prenoms-france.js            (PF_SHOTS=dossier pour garder les captures)
 *     node tests/test-prenoms-france.js --seed DIR (remplit seulement une base d'essai dans DIR, pour regarder à la main)
 * Un vrai « php -S » sur une base neuve, puis un navigateur (Playwright ; sinon sauté) :
 *  1. parrain : Jean (1752) a pour parrain son grand-père Jean → « son parrain (son grand-père paternel) », confiance forte ;
 *  2. grand-parent : Marie (1758) porte le prénom de sa grand-mère paternelle Marie, sans parrain noté ;
 *  3. frère mort : Louis (1756) après Louis (1754-1755) → « prénom relevé » ; saint du jour : Joseph né le 19 mars ;
 *  4. jamais une personne en vie ou confidentielle : ni l'enfant, ni la piste ;
 *  5. correction à la main : « ce n'est pas ça » écarte la piste, « choisir la personne » la remplace, ↶ Annuler remet ;
 *     données de mauvaise forme refusées (422), GET n'écrit rien ;
 *  6. moyennes : l'âge au premier mariage, les signatures, la mortalité infantile de la famille à côté des chiffres
 *     de référence (Henry et Houdaille, Maggiolo…), chaque ligne avec sa source ; période et groupe de personnes ;
 *  7. navigateur 1440 / 390 / sombre : Graphiques → Statistiques → les deux pages, la ligne « Prénom reçu de… » de la
 *     fiche et son ⋯, sans erreur dans la console.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });

const SEED = String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$tag = fn($t) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$t' ORDER BY id LIMIT 1")->fetchColumn();
$P = function ($f, $l, $g, $st = 'deceased', $priv = 0) use ($pdo) { $pdo->prepare('INSERT INTO persons(first_name,last_name,gender,living_status,is_private) VALUES(?,?,?,?,?)')->execute([$f, $l, $g, $st, $priv]); return (int) $pdo->lastInsertId(); };
$E = function ($pid, $t, $iso) use ($pdo, $tag) { $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date) VALUES('person',?,?,?,?,?)")->execute([$pid, $tag($t), $iso, (int) substr($iso, 0, 4), $iso]); return (int) $pdo->lastInsertId(); };
$F = function ($a, $b, $kids, $marr = null, $s1 = null, $s2 = null) use ($pdo, $tag) {
    $pdo->prepare('INSERT INTO families(partner1_id,partner2_id) VALUES(?,?)')->execute([$a, $b]); $f = (int) $pdo->lastInsertId();
    foreach ($kids as $i => $k) { $pdo->prepare('INSERT INTO family_children(family_id,child_id,position) VALUES(?,?,?)')->execute([$f, $k, $i]); }
    if ($marr) { $pdo->prepare("INSERT INTO events(scope,family_id,event_type_id,date_text,year,sort_date,signed1,signed2) VALUES('family',?,?,?,?,?,?,?)")->execute([$f, $tag('MARR'), $marr, (int) substr($marr, 0, 4), $marr, $s1, $s2]); }
    return $f; };
$W = function ($ev, $pid, $note) use ($pdo) { $pdo->prepare('INSERT INTO event_witnesses(event_id,person_id,note) VALUES(?,?,?)')->execute([$ev, $pid, $note]); };
$ids = [];
// grands-parents paternels et maternels
$ids['gpJean'] = $P('Jean', 'MARTIN', 'male'); $E($ids['gpJean'], 'BIRT', '1700-02-03'); $E($ids['gpJean'], 'DEAT', '1770-05-01');
$ids['gmMarie'] = $P('Marie', 'DUVAL', 'female'); $E($ids['gmMarie'], 'BIRT', '1704-06-10'); $E($ids['gmMarie'], 'DEAT', '1772-01-01');
$ids['gpFrancois'] = $P('François', 'LEROY', 'male'); $E($ids['gpFrancois'], 'BIRT', '1698-01-01'); $E($ids['gpFrancois'], 'DEAT', '1760-01-01');
$ids['gmJeanne'] = $P('Jeanne', 'BLANC', 'female'); $E($ids['gmJeanne'], 'BIRT', '1702-01-01'); $E($ids['gmJeanne'], 'DEAT', '1765-01-01');
// parents
$ids['pierre'] = $P('Pierre', 'MARTIN', 'male'); $E($ids['pierre'], 'BIRT', '1725-04-02'); $E($ids['pierre'], 'DEAT', '1790-01-01');
$ids['anne'] = $P('Anne', 'LEROY', 'female'); $E($ids['anne'], 'BIRT', '1729-08-15'); $E($ids['anne'], 'DEAT', '1795-01-01');
$ids['oncleFrancois'] = $P('François', 'LEROY', 'male'); $E($ids['oncleFrancois'], 'BIRT', '1727-01-01'); $E($ids['oncleFrancois'], 'DEAT', '1780-01-01');
$F($ids['gpJean'], $ids['gmMarie'], [$ids['pierre']], '1724-01-15', 0, 0);
$F($ids['gpFrancois'], $ids['gmJeanne'], [$ids['oncleFrancois'], $ids['anne']], '1726-02-10', 1, 0);
// enfants
$ids['jean'] = $P('Jean', 'MARTIN', 'male'); $b = $E($ids['jean'], 'BIRT', '1752-03-12'); $E($ids['jean'], 'DEAT', '1820-01-01');
$W($b, $ids['gpJean'], 'parrain'); $W($b, $ids['gmJeanne'], 'marraine');
$ids['louis1'] = $P('Louis', 'MARTIN', 'male'); $E($ids['louis1'], 'BIRT', '1754-05-01'); $E($ids['louis1'], 'DEAT', '1755-02-01');
$ids['louis2'] = $P('Louis', 'MARTIN', 'male'); $E($ids['louis2'], 'BIRT', '1756-07-07'); $E($ids['louis2'], 'DEAT', '1830-01-01');
$ids['marie'] = $P('Marie', 'MARTIN', 'female'); $E($ids['marie'], 'BIRT', '1758-11-02'); $E($ids['marie'], 'DEAT', '1759-03-01');
$ids['joseph'] = $P('Joseph', 'MARTIN', 'male'); $E($ids['joseph'], 'BIRT', '1760-03-19'); $E($ids['joseph'], 'DEAT', '1801-01-01');
$ids['francoise'] = $P('Françoise', 'MARTIN', 'female'); $b = $E($ids['francoise'], 'CHR', '1762-09-09'); $E($ids['francoise'], 'DEAT', '1840-01-01');
$W($b, $ids['oncleFrancois'], 'parrain');
$ids['secret'] = $P('Pierre', 'MARTIN', 'male', 'deceased', 1); $E($ids['secret'], 'BIRT', '1764-01-01'); $E($ids['secret'], 'DEAT', '1800-01-01');
$F($ids['pierre'], $ids['anne'], [$ids['jean'], $ids['louis1'], $ids['louis2'], $ids['marie'], $ids['joseph'], $ids['francoise'], $ids['secret']], '1751-06-20', 1, 0);
// une famille d'aujourd'hui : personne en vie, jamais nommée
$ids['vivant'] = $P('Jean', 'MARTIN', 'male', 'living'); $E($ids['vivant'], 'BIRT', '1990-03-12');
$ids['papa'] = $P('Jean', 'MARTIN', 'male', 'living'); $E($ids['papa'], 'BIRT', '1960-01-01');
$F($ids['papa'], null, [$ids['vivant']]);
// des métiers
$pdo->prepare("UPDATE persons SET occupation='laboureur' WHERE id IN (?,?)")->execute([$ids['pierre'], $ids['gpJean']]);
$pdo->prepare("UPDATE persons SET occupation='tisserand' WHERE id=?")->execute([$ids['oncleFrancois']]);
echo json_encode($ids);`;

function seed(dir) {
    fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', SEED], { cwd: appRoot, encoding: 'utf8', env: envFor(dir) });
    if (r.status !== 0 || !/^\{/.test(r.stdout.trim())) { console.error(r.stderr || r.stdout); process.exit(1); }
    return JSON.parse(r.stdout.trim());
}

if (process.argv[2] === '--seed') { const d = path.resolve(process.argv[3]); console.log(JSON.stringify(seed(d))); process.exit(0); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-prenoms-'));
const dir = path.join(tmp, 'a');
const ids = seed(dir);
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const shots = process.env.PF_SHOTS || path.join(tmp, 'shots');
fs.mkdirSync(shots, { recursive: true });
let failed = 0;
const ok = (name, fn) => Promise.resolve().then(fn).then(() => console.log('  ✓ ' + name), e => { failed++; console.log('  ✗ ' + name + '\n    ' + (e && e.stack || e)); });

(async () => {
    const port = Number(process.env.PF_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(dir), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let cookie = '';
    const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
    const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
    const get = async (action, q = {}) => { const r = await fetch(base + 'api.php?' + new URLSearchParams({ action, ...q }), { headers: { cookie } }); return { status: r.status, body: await r.json() }; };
    const post = async (action, body) => { const r = await fetch(base + 'api.php?action=' + action, { method: 'POST', headers: { cookie, 'content-type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify({ ...body, csrf }) }); return { status: r.status, body: await r.json() }; };
    const one = async id => (await get('prenoms_transmis', { person: id })).body;
    try {
        await ok('parrain : Jean tient son prénom de son parrain, qui est aussi son grand-père', async () => {
            const r = await one(ids.jean);
            assert.equal(r.origin.id, ids.gpJean); assert.equal(r.origin.kind, 'godparent');
            assert.match(r.origin.rule, /même prénom que son parrain/); assert.match(r.origin.rel, /grand-père paternel/);
            assert.equal(r.origin.level, 'forte'); assert.ok(r.origin.score >= 90, 'parrain + grand-père : plus sûr');
        });
        await ok('marraine (oncle côté mère) : Françoise reçoit le prénom de son parrain François, au féminin', async () => {
            const r = await one(ids.francoise);
            assert.equal(r.origin.id, ids.oncleFrancois); assert.match(r.origin.rule, /féminin/);
        });
        await ok('grand-parent : Marie tient son prénom de sa grand-mère paternelle', async () => {
            const r = await one(ids.marie);
            assert.equal(r.origin.id, ids.gmMarie); assert.equal(r.origin.kind, 'grandparent'); assert.match(r.origin.rel, /grand-mère paternelle/);
        });
        await ok('frère mort avant : Louis (1756) relève le prénom de Louis (1754-1755)', async () => {
            const r = await one(ids.louis2);
            assert.equal(r.origin.id, ids.louis1); assert.equal(r.origin.kind, 'sibling'); assert.match(r.origin.rel, /prénom relevé/);
            const r1 = await one(ids.louis1); assert.ok(!r1.origin || r1.origin.id !== ids.louis2, 'le frère né après ne compte pas');
        });
        await ok('saint du jour : Joseph né le 19 mars', async () => {
            const r = await one(ids.joseph);
            assert.equal(r.origin.kind, 'saint'); assert.equal(r.origin.level, 'faible'); assert.match(r.origin.rule, /Joseph/);
        });
        await ok('jamais une fiche en vie ou confidentielle', async () => {
            assert.equal((await one(ids.vivant)).origin, null);
            assert.equal((await one(ids.secret)).origin, null);
            const all = (await get('prenoms_transmis')).body;
            const seen = new Set(all.rows.flatMap(r => [r.child, r.source]));
            assert.ok(!seen.has(ids.vivant) && !seen.has(ids.papa) && !seen.has(ids.secret), 'personne en vie ou confidentielle nommée');
            assert.ok(all.found >= 5, 'au moins 5 prénoms expliqués');
            assert.ok(all.with_godparents >= 2 && all.named_godparent >= 2);
            assert.ok(all.periods.some(p => p.total >= 5 && p.named_godparent >= 2));
            const f = (await get('prenoms_transmis', { name: 'louis' })).body;
            assert.ok(f.rows.length && f.rows.every(r => r.first === 'Louis'), 'filtre par prénom');
        });
        await ok('correction à la main : ce n’est pas ça, choisir la personne, ↶ Annuler', async () => {
            const before = await one(ids.marie);
            let r = await post('name_origin_set', { child: ids.marie, source: ids.gmMarie, verdict: 'no' });
            assert.equal(r.status, 200, JSON.stringify(r.body));
            const res = r.body.result || r.body;
            let a = await one(ids.marie);
            assert.ok(!a.origin || a.origin.id !== ids.gmMarie); assert.ok(a.rejected.some(x => x.id === ids.gmMarie));
            r = await post('name_origin_set', { child: ids.marie, source: ids.anne, verdict: 'yes' });
            a = await one(ids.marie);
            assert.equal(a.origin.id, ids.anne); assert.equal(a.origin.manual, 'chosen'); assert.equal(a.origin.score, 100); assert.match(a.origin.rel, /mère/);
            // ↶ Annuler : on remet l'état d'avant la première correction
            r = await post('name_origin_set', { child: ids.marie, source: 0, verdict: 'reset', rows: res.before || [] });
            a = await one(ids.marie);
            assert.equal(a.origin.id, before.origin.id);
            // de mauvaise forme
            for (const bad of [{ child: 'x', source: 1, verdict: 'no' }, { child: ids.marie, source: '1 OR 1', verdict: 'no' }, { child: ids.marie, source: ids.anne, verdict: 'peut-être' }, { child: ids.marie, source: 0, verdict: 'yes' }, { child: 999999, source: 1, verdict: 'no' }]) {
                const x = await post('name_origin_set', bad); assert.ok(x.status >= 400 && x.status < 500, JSON.stringify(bad) + ' → ' + x.status);
            }
            assert.equal((await get('prenoms_transmis', { person: 'abc' })).status, 422);
            // sans jeton CSRF
            const nc = await fetch(base + 'api.php?action=name_origin_set', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ child: ids.marie, source: ids.anne, verdict: 'yes' }) });
            assert.ok(nc.status >= 400);
        });
        await ok('ta famille et la France : moyennes sourcées, période et groupe', async () => {
            const r = (await get('famille_france')).body;
            const ind = k => r.indicators.find(i => i.key === k);
            const marr = ind('age_marriage').rows.find(x => x.label === '1740-1789');
            assert.ok(marr.family.h !== null && marr.family.f !== null, 'âge au mariage de la famille');
            assert.deepEqual(marr.france.h, [27, 28.5]); assert.equal(marr.source, 'henry_houdaille_1979');
            assert.ok(r.sources.henry_houdaille_1979.label.includes('Henry'));
            const sign = ind('sign').rows.find(x => x.label === '1786-1790');
            assert.deepEqual(sign.france.h, [47, 47]); assert.equal(sign.source, 'maggiolo');
            const inf = ind('infant').rows.find(x => x.label === '1740-1789');
            assert.ok(inf.family.all > 0 && inf.ids.all.includes(ids.louis1) === false || inf.family.all > 0); // Louis (1754-1755) a vécu 9 mois
            assert.ok(inf.ids.all.includes(ids.marie) || inf.ids.all.includes(ids.louis1));
            for (const i of r.indicators) for (const row of i.rows) {
                assert.ok(r.sources[row.source], 'source connue : ' + row.source);
                for (const s of ['h', 'f', 'all']) assert.ok(!row.ids[s].includes(ids.vivant) && !row.ids[s].includes(ids.secret));
            }
            const p = (await get('famille_france', { dg_from: '1900', dg_to: '1960' })).body;
            assert.ok(!p.indicators.some(i => i.rows.some(x => x.label === '1740-1789')), 'période');
            assert.equal((await get('famille_france', { dg_pop: 'n’importe quoi' })).status, 422);
        });
        await ok('le fichier de référence : chaque chiffre a sa source, des fourchettes dans le bon ordre', async () => {
            const ref = JSON.parse(fs.readFileSync(path.join(appRoot, 'assets/data/moyennes-france.json'), 'utf8'));
            for (const i of ref.indicators) for (const row of i.rows) {
                assert.ok(ref.sources[row.source], row.source);
                for (const s of ['h', 'f', 'all']) if (row[s]) { assert.equal(row[s].length, 2); assert.ok(row[s][0] <= row[s][1]); }
                assert.ok(row.from <= row.to);
            }
        });

        // ─── navigateur ───
        let pw = null;
        for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
        if (!pw) { console.log('  – navigateur : sauté (Playwright absent)'); return; }
        const browser = await pw.chromium.launch();
        try {
            for (const [w, h, dark, tag] of [[1440, 950, false, '1440'], [390, 844, false, '390'], [1440, 950, true, 'sombre']]) {
                await ok(`navigateur ${tag} : statistiques et fiche`, async () => {
                    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: dark ? 'dark' : 'light' });
                    const page = await ctx.newPage(); const errors = [];
                    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
                    page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
                    await page.goto(base, { waitUntil: 'domcontentloaded' });
                    await page.waitForFunction(() => window.LCNDA_APP && window.LCNDA_EXT?.graphStats?.name_transmission, null, { timeout: 30000 });
                    if (dark) { await page.evaluate(() => { const A = window.LCNDA_APP; localStorage.setItem('genealogie-design', JSON.stringify({ ...A.readDesignSettings(), preset: 'dark' })); A.applyDesign(); }); assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark'); }
                    // la page des transmissions
                    await page.evaluate(() => { const A = window.LCNDA_APP; A.state.graphMode = 'stats'; A.state.graphStatsType = 'name_transmission'; A.setModule('graphiques'); });
                    await page.waitForSelector('.pf-page .pf-chains svg', { timeout: 20000 });
                    assert.ok(await page.$('.pf-page .stats-stage'));
                    const txt = await page.textContent('.pf-page');
                    assert.match(txt, /parrain/); assert.ok(!/undefined|NaN/.test(txt), 'undefined ou NaN à l’écran');
                    await page.evaluate(() => document.querySelector('.pf-page').scrollIntoView());
                    await page.screenshot({ path: path.join(shots, `transmission-${tag}.png`), fullPage: false });
                    // filtre par prénom
                    await page.selectOption('[data-pf-name]', 'Louis');
                    await page.waitForFunction(() => document.querySelectorAll('.pf-page [data-pf-row]').length >= 1 && [...document.querySelectorAll('.pf-page [data-pf-row]')].every(r => /Louis/.test(r.textContent)));
                    const nowide = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
                    assert.ok(nowide, 'pas de défilement de côté');
                    // la page des moyennes
                    await page.evaluate(() => { const A = window.LCNDA_APP; A.state.graphStatsType = 'family_vs_france'; A.renderGraphStats(); });
                    await page.waitForSelector('.ff-page .ff-ind svg', { timeout: 20000 });
                    const t2 = await page.textContent('.ff-page');
                    assert.match(t2, /Maggiolo/); assert.match(t2, /≈/); assert.ok(!/undefined|NaN/.test(t2));
                    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'pas de défilement de côté (moyennes)');
                    await page.evaluate(() => document.querySelector('.ff-page').scrollIntoView());
                    await page.screenshot({ path: path.join(shots, `famille-france-${tag}.png`), fullPage: false });
                    // clic → les personnes
                    const who = await page.$('.ff-page [data-ff-who]');
                    if (who) { await who.click(); await page.waitForSelector('#h-cw-who-dialog[open]', { timeout: 10000 }); await page.keyboard.press('Escape'); }
                    // la fiche : « Prénom reçu de… »
                    await page.evaluate(id => window.LCNDA_APP.openPersonById(id), ids.jean);
                    await page.waitForSelector('.pf-line', { timeout: 20000 });
                    assert.match(await page.textContent('.pf-line'), /Prénom reçu de/);
                    await page.waitForTimeout(800); // la fiche peut se redessiner une fois (designs, sections)
                    await page.waitForSelector('.pf-line');
                    { const el = await page.$('.pf-line'); await el.scrollIntoViewIfNeeded(); await el.screenshot({ path: path.join(shots, `fiche-ligne-${tag}.png`) }); }
                    await page.click('.pf-line [data-pf-more]');
                    await page.waitForSelector('.ui-actmenu[role="menu"]', { timeout: 5000 });
                    await page.screenshot({ path: path.join(shots, `fiche-${tag}.png`), fullPage: false });
                    await page.keyboard.press('Escape');
                    assert.deepEqual(errors, []);
                    await ctx.close();
                });
            }
        } finally { await browser.close(); }
    } finally {
        proc.kill();
        if (!process.env.PF_SHOTS) fs.rmSync(tmp, { recursive: true, force: true });
        console.log(failed ? `\n${failed} échec(s)` : '\nTout est bon.');
        process.exit(failed ? 1 : 0);
    }
})();
