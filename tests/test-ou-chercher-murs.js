'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🌍 Où chercher ? et 🧩 Murs de brique (lib/ou_chercher.php, assets/js/app-ou-chercher-core.js, heritage-ou-chercher.js) :
 *     node tests/test-ou-chercher-murs.js
 *  1. le moteur seul (Node) : soldat de 14-18 → Mémoire des hommes en tête ; émigré → Ellis Island ; Italie → Antenati ;
 *     « Gratuites seulement » cache les payants (sinon jamais en tête) ; déjà cherché → à part ; règle ajoutée par un lot (addRules) ;
 *  2. un vrai « php -S » : ce que la fiche dit (pays, département, profils, manques), murs calculés (parent manquant, deux
 *     parents), mur marqué à la main, statut + ↶ Annuler, mur résolu tout seul quand le parent arrive (félicitations),
 *     ✓ déjà cherché noté dans le Journal des recherches, ＋ piste (enquête créée une fois), « Ma semaine » (mur de la semaine,
 *     ✓ puis ↶), clés forgées, CSRF ;
 *  3. le navigateur (Playwright ; sinon sauté) à 1440 px, 390 px et en sombre : registre lu en entier (lots compris), bloc de la
 *     fiche, ⋯ de la fiche, page « 🌍 Où chercher ? » (✓ Trouvé → Journal, ↶ Annuler), page « 🧩 Murs de brique » (H10, fenêtre,
 *     statut Résolu → 🎉), widget ; aucune erreur JavaScript, pas de défilement horizontal.
 * Captures : SHOTS=dossier node tests/test-ou-chercher-murs.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const C = require('../assets/js/app-ou-chercher-core.js');
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

(async () => {
    /* ═════ 1. le moteur ═════ */
    const S = keys => keys.map(k => ({key: k, label: k}));
    const reg = S(['google', 'geneanet', 'familysearch', 'memoiredeshommes', 'so_mdh_mpf1418', 'so2_ellis', 'so5_castle_garden', 'so3_antenati_nom', 'ancestry', 'myheritage', 'matchid', 'socface', 'so_matricules_ad', 'yadvashem', 'so2_shd_marins']);
    const soldier = C.context({person: {id: 2, name: 'Jean MARTIN', gender: 'male', birth_year: 1890}, events: [{tag: 'BIRT', year: 1890, place: 'Tulle', country: 'France', dept: {code: '19', name: 'Corrèze'}}, {tag: 'MISE', year: 1910, place: 'Tulle', country: 'France'}], profiles: ['soldier'], missing: ['death', 'mother']});
    await t('moteur : soldat de 14-18 → Mémoire des hommes en tête, avec la raison', async () => {
        const r = C.rank(reg, soldier, {freeOnly: true});
        assert.match(r.list[0].site.key, /memoiredeshommes|mdh_mpf1418/, r.list.map(x => x.site.key).join(','));
        assert.match(r.list[0].reasons[0], /Né en 1890 en Corrèze : il a fait la guerre de 14/);
        assert.ok(!r.list.some(x => x.site.key === 'yadvashem'), 'rien sur la Shoah sans raison');
        assert.ok(r.out.some(o => o.site.key === 'so2_shd_marins' && /marin/.test(o.why)), 'marins : seulement pour un marin');
    });
    await t('moteur : né en 1890 sans profil → « sans doute fait la guerre de 14 » ; une femme → pas de MdH', async () => {
        const c = C.context({person: {gender: 'male', birth_year: 1890}, events: [{tag: 'BIRT', year: 1890, place: 'Tulle', country: 'France', dept: {code: '19', name: 'Corrèze'}}], profiles: [], missing: []});
        assert.match(C.rank(reg, c).list.find(x => x.site.key === 'memoiredeshommes').reasons[0], /sans doute fait la guerre de 14/);
        const f = C.context({person: {gender: 'female', birth_year: 1890}, events: [{tag: 'BIRT', year: 1890, place: 'Tulle', country: 'France', dept: {code: '19', name: 'Corrèze'}}]});
        assert.ok(!C.rank(reg, f).list.some(x => x.site.key === 'memoiredeshommes'));
    });
    const emig = C.context({person: {gender: 'male', birth_year: 1880}, events: [{tag: 'BIRT', year: 1880, place: 'Torino', country: 'Italia'}, {tag: 'EMIG', year: 1902, place: 'Le Havre', country: 'France'}], profiles: ['emigrant'], missing: ['parents']});
    await t('moteur : émigré → Ellis Island ; Italie → Antenati', async () => {
        const r = C.rank(reg, emig, {freeOnly: true});
        const keys = r.list.map(x => x.site.key);
        assert.ok(keys.indexOf('so2_ellis') >= 0 && keys.indexOf('so2_ellis') < 3, keys.join(','));
        assert.ok(keys.indexOf('so3_antenati_nom') >= 0 && keys.indexOf('so3_antenati_nom') < 3, keys.join(','));
        assert.match(r.list.find(x => x.site.key === 'so3_antenati_nom').reasons[0], /Italie/);
        assert.ok(!keys.includes('memoiredeshommes'), 'pas de lieu en France à l’âge : pas de MdH');
    });
    await t('moteur : « Gratuites seulement » cache les payants ; sinon jamais en tête', async () => {
        const free = C.rank(reg, emig, {freeOnly: true});
        assert.ok(!free.list.some(x => x.paid === 'paid') && free.hidden >= 1);
        const all = C.rank([{key: 'pay', label: 'Pay', rel: {base: 20, paid: true}}, ...reg], emig, {freeOnly: false});
        assert.notEqual(all.list[0].paid, 'paid', 'un payant n’est jamais en premier');
        assert.ok(all.list.some(x => x.paid === 'paid'));
    });
    await t('moteur : déjà cherché → rangé à part (« à revoir » reste proposé) ; règle d’un lot ajoutée plus tard', async () => {
        const c = C.context({person: {gender: 'male', birth_year: 1890}, events: [{tag: 'BIRT', year: 1890, place: 'Tulle', country: 'France', dept: {code: '19', name: 'Corrèze'}}], profiles: ['soldier'],
            searched: {memoiredeshommes: {status: 'done', result: 'none', date: '2026-11-01'}, so_matricules_ad: {status: 'review', result: '', date: '2026-11-02'}}});
        const r = C.rank(reg, c);
        assert.ok(r.searched.some(x => x.site.key === 'memoiredeshommes') && !r.list.some(x => x.site.key === 'memoiredeshommes'));
        assert.ok(r.list.some(x => x.site.key === 'so_matricules_ad' && x.searched?.status === 'review'));
        C.addRules({so9_lot_futur: {profiles: ['soldier'], require: ['profile'], base: 1, why: () => 'Règle venue d’un lot'}});
        assert.equal(C.rank([...reg, {key: 'so9_lot_futur', label: 'Futur'}], c).list.find(x => x.site.key === 'so9_lot_futur').reasons[0], 'Règle venue d’un lot');
        // une règle écrite dans la définition d'un site (champ rel) suffit aussi
        assert.ok(C.rank([{key: 'x', label: 'X', rel: {countries: ['it'], base: 3}}], emig).list.length === 1);
        assert.ok(C.rank([{key: 'x', label: 'X', country: 'Italie'}], soldier).out.length === 1, 'champ « country » d’un lot lu tel quel');
        assert.equal(C.canonCountry('Torino, Piemonte, ITALIA'), 'it'); assert.equal(C.canonCountry('États-Unis'), 'us'); assert.equal(C.canonCountry('International'), '*');
    });

    /* ═════ 2. le serveur ═════ */
    const phpPath = findPhp([devBundledPhp()]);
    if (!phpPath) { console.log('— PHP absent : suite sautée'); return done(); }
    const SHOTS = process.env.SHOTS || '';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-ouc-'));
    const dir = path.join(tmp, 'a');
    fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,is_start,living_status) VALUES(1,'Luc','MARTIN','male',1,'living'),(2,'Jean','MARTIN','male',0,'deceased'),(3,'Marie','BORIE','female',0,'deceased'),(4,'Pierre','MARTIN','male',0,'deceased'),(5,'Antonio','ROSSI','male',0,'deceased'),(6,'Jeanne','MARTIN','female',0,'deceased'),(7,'Rose','LAVAL','female',0,'deceased')");
$pdo->exec("INSERT INTO places(id,name,county,state,country,admin2_code) VALUES(1,'Tulle','Corrèze','Nouvelle-Aquitaine','France','19'),(2,'Naves','Corrèze','Nouvelle-Aquitaine','France','19'),(3,'Torino','Piemonte','','Italia',''),(4,'New York','New York','','USA','')");
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,2,3),(2,4,NULL)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,1),(2,2)");
$ev = $pdo->prepare('INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES(?,?,?,?,?,?)');
foreach ([[1,'BIRT','1 juin 1950',1950,1],[2,'BIRT','3 mars 1890',1890,1],[2,'MISE','1910',1910,1],[2,'DEAT','5 mai 1960',1960,1],[3,'BIRT','2 avril 1895',1895,2],[4,'BIRT','1860',1860,2],[5,'BIRT','1880',1880,3],[5,'EMIG','1902',1902,4],[6,'BIRT','1862',1862,2]] as [$pid,$tag,$dt,$y,$pl]) { $ev->execute(['person',$pid,$t($tag),$dt,$y,$pl]); }
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env: envFor(dir), maxBuffer: 1 << 26 });
    if (seed.status !== 0 || !String(seed.stdout).includes('ok')) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const php = code => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require 'lib/paths.php'; require 'lib/bootstrap.php'; $pdo = db(); ${code}`], { cwd: appRoot, encoding: 'utf8', env: envFor(dir) }); return String(r.stdout).trim(); };
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(dir), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let cookie = '';
    const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
    const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
    const get = async (action, q = {}) => (await fetch(`${base}api.php?action=${action}&${new URLSearchParams(q)}`, { headers: { Cookie: cookie } })).json();
    const post = async (action, body, token = csrf) => { const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: JSON.stringify({ ...body, csrf: token }) }); let json = {}; try { json = await r.json(); } catch (_) {} return { status: r.status, json, res: json.result || json }; };
    try {
        await t('ce que la fiche dit : département, profil soldat, manques', async () => {
            const d = await get('ou_chercher_person', { id: 2 });
            assert.ok(!d.error, d.error);
            assert.equal(d.events[0].dept.code, '19'); assert.match(d.events[0].dept.service, /Corrèze/);
            assert.ok(d.profiles.includes('soldier'), d.profiles.join(','));
            assert.deepEqual(d.missing, ['mother', 'marriage'], 'un conjoint, pas de mariage');
            assert.equal(d.person.sosa, 2);
            const e = await get('ou_chercher_person', { id: 5 });
            assert.ok(e.profiles.includes('emigrant')); assert.ok(e.missing.includes('parents') && e.missing.includes('death'));
            assert.equal(C.context(e).countries.has('it'), true); assert.equal(C.context(e).countries.has('us'), true);
            assert.ok((await get('ou_chercher_person', { id: 999 })).error, 'fiche absente');
        });
        await t('murs calculés : parent manquant ou les deux, triés par génération puis Sosa', async () => {
            const d = await get('murs_de_brique');
            const ids = d.items.map(w => w.person_id);
            assert.deepEqual(ids, [2, 3, 4], JSON.stringify(d.items.map(w => [w.person_id, w.sosa, w.missing])));
            assert.equal(d.items[0].missing, 'mother'); assert.equal(d.items[1].missing, 'both'); assert.equal(d.items[2].sosa, 4);
            assert.ok(!ids.includes(1), 'la racine a ses deux parents');
        });
        await t('mur marqué à la main (hors lignée), statut, ↶ Annuler', async () => {
            let r = await post('mur_save', { person_id: 5, manual: 1 });
            assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.res.prev, null);
            let d = await get('murs_de_brique');
            const w = d.items.find(x => x.person_id === 5); assert.ok(w && w.manual && !w.computed && w.sosa === null);
            r = await post('mur_save', { person_id: 3, status: 'progress', note: 'Chercher à Naves' });
            assert.equal(r.res.wall.status, 'progress');
            const prev = (await post('mur_save', { person_id: 3, status: 'abandoned' })).res.prev;
            assert.equal(prev.status, 'progress');
            await post('mur_restore', { person_id: 3, prev });
            d = await get('murs_de_brique'); assert.equal(d.items.find(x => x.person_id === 3).status, 'progress'); assert.equal(d.items.find(x => x.person_id === 3).note, 'Chercher à Naves');
            assert.ok((await post('mur_save', { person_id: 3, status: 'nimportequoi' })).json.error, 'statut forgé refusé');
            assert.ok((await post('mur_save', { person_id: 9999, manual: 1 })).json.error, 'fiche absente');
            const bad = await post('mur_save', { person_id: 4, manual: 1 }, 'mauvais-jeton');
            assert.ok(bad.status >= 400 || bad.json.error, 'CSRF');
            assert.equal(php("echo (int) $pdo->query('SELECT count(*) FROM brick_walls WHERE person_id=4')->fetchColumn();"), '0');
        });
        await t('mur résolu : marqué « Résolu », et tout seul quand le parent arrive', async () => {
            await post('mur_save', { person_id: 2, status: 'progress' });
            php("$pdo->exec(\"UPDATE families SET partner2_id=6 WHERE id=2\");");
            const d = await get('murs_de_brique');
            assert.deepEqual(d.newly_solved.map(x => x.person_id), [2], JSON.stringify(d.newly_solved));
            assert.equal(d.items.find(x => x.person_id === 2).status, 'solved');
            assert.equal((await get('murs_de_brique')).newly_solved.length, 0, 'félicité une seule fois');
            assert.ok(d.items.some(x => x.person_id === 6 && x.missing === 'both'), 'la nouvelle ancêtre devient un mur');
        });
        await t('✓ déjà cherché → Journal des recherches ; relu par « Où chercher ? »', async () => {
            const r = await post('save_archive_digest', { id: 0, archive_service: 'Mémoire des hommes', archive_url: 'https://www.google.com/search?q=site%3Amemoiredeshommes', template_key: 'ouc:memoiredeshommes', record_type: 'autre', status: 'done', result: 'none', searched: 'Jean MARTIN — proposé par « Où chercher ? »', sought_ids: [2] });
            assert.ok(r.res.id, JSON.stringify(r.json));
            const d = await get('ou_chercher_person', { id: 2 });
            assert.equal(d.searched.memoiredeshommes.result, 'none');
            const j = await get('research_journal', { person_id: 2 });
            assert.ok((j.rows || []).some(x => /Mémoire des hommes|proposé par/.test(`${x.title} ${x.detail || ''} ${JSON.stringify(x)}`)), JSON.stringify(j.rows || j).slice(0, 400));
            const w = await get('mur_de_brique', { id: 3 });
            assert.ok(Array.isArray(w.hints) && Array.isArray(w.journal));
        });
        await t('＋ En faire une piste : l’enquête est créée une fois, puis réutilisée', async () => {
            const a = await post('ou_chercher_piste', { person_id: 3, title: 'Chercher sur Geneanet', url: 'https://www.geneanet.org/fonds/individus/?nom=BORIE', notes: 'Parents inconnus' });
            assert.ok(a.res.item_id && a.res.investigation_id && a.res.created, JSON.stringify(a.json));
            const b = await post('ou_chercher_piste', { person_id: 3, title: 'Chercher sur FamilySearch', url: 'https://www.familysearch.org/' });
            assert.equal(b.res.investigation_id, a.res.investigation_id); assert.equal(b.res.created, false);
            assert.ok((await post('ou_chercher_piste', { person_id: 3, title: 'x', url: 'javascript:alert(1)' })).json.error, 'adresse refusée');
            const d = await get('ou_chercher_person', { id: 3 });
            assert.equal(d.leads.length, 2);
            assert.equal((await get('murs_de_brique')).items.find(x => x.person_id === 3).leads, 2);
        });
        await t('Ma semaine de recherche : un mur par semaine, ✓ puis ↶ Annuler ; clé forgée refusée', async () => {
            const d = await get('semaine');
            const row = d.items.find(i => i.key.startsWith('mur:'));
            assert.ok(row, d.items.map(i => i.key).join(',')); assert.equal(row.open.kind, 'murs'); assert.equal(row.sort, 'piste');
            const r = await post('semaine_mark', { op: 'done', key: row.key, title: row.title, open: row.open });
            assert.ok(r.json.ok || r.res.ok, JSON.stringify(r.json));
            assert.ok(!(await get('semaine')).items.some(i => i.key === row.key));
            await post('semaine_mark', { op: 'restore', key: row.key, prev: (r.res.prev || r.json.prev) });
            assert.ok((await get('semaine')).items.some(i => i.key === row.key));
            assert.ok((await post('semaine_mark', { op: 'done', key: 'mur:1:abc' })).json.error, 'clé forgée');
        });

        /* ═════ 3. le navigateur ═════ */
        let pw = null; try { pw = require('/opt/node22/lib/node_modules/playwright'); } catch (_) { try { pw = require('playwright'); } catch (__) { pw = null; } }
        if (!pw) console.log('— Playwright absent : partie navigateur sautée');
        else {
            const browser = await pw.chromium.launch();
            const errors = [];
            const watch = (p, name) => { p.on('pageerror', e => errors.push(`${name} : ${e.message}`)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errors.push(`${name} console : ${m.text()}`); }); };
            const noScroll = async p => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false, 'pas de défilement horizontal');
            for (const [name, vp, dark] of [['1440', { width: 1440, height: 1000 }, false], ['390', { width: 390, height: 860 }, false], ['sombre', { width: 1440, height: 1000 }, true]]) {
                await t(`navigateur ${name} : registre, bloc, ⋯, Où chercher ?, Murs de brique, widget`, async () => {
                    const ctx = await browser.newContext({ viewport: vp, colorScheme: dark ? 'dark' : 'light' });
                    await ctx.addInitScript(() => { try { localStorage.setItem('genealogie-last-route', '#tableau-de-bord'); } catch (_) {} });
                    const p = await ctx.newPage(); watch(p, name);
                    await p.goto(base);
                    await p.waitForFunction(() => window.LCNDA_APP?.state && window.LCNDA_EXT?.ouChercher && window.LCNDA_OU_CHERCHER, null, { timeout: 20000 });
                    if (dark) await p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
                    // le registre : celui de « Chercher sur internet » + tous les lots présents (lus dynamiquement)
                    const reg = await p.evaluate(() => { const l = window.LCNDA_EXT.ouChercher.allSites(); return {n: l.length, keys: l.map(s => s.key), lots: window.LCNDA_EXT.ouChercher.lots().map(x => x.n), app: window.LCNDA_APP.webSearchAllSites().length}; });
                    assert.ok(reg.n >= reg.app, `${reg.n} ≥ ${reg.app}`);
                    assert.ok(reg.lots.length >= 1, 'lots lus');
                    assert.equal(new Set(reg.keys).size, reg.keys.length, 'pas de doublon de clé');
                    // pertinence dans la vraie app
                    const top = await p.evaluate(async () => { const O = window.LCNDA_EXT.ouChercher; const s = O.suggest(await O.loadPerson(2, {fresh: true}), {free: true}); return {first: s.list[0].site.key, why: s.list[0].reasons[0], paid: s.list.filter(x => x.paid === 'paid').length, done: s.searched.map(x => x.site.key)}; });
                    assert.match(top.first, /mdh|memoiredeshommes|matricules/, JSON.stringify(top));
                    assert.equal(top.paid, 0, 'gratuites seulement');
                    assert.ok(top.done.includes('memoiredeshommes'), 'déjà cherché');
                    const emi = await p.evaluate(async () => { const O = window.LCNDA_EXT.ouChercher; const s = O.suggest(await O.loadPerson(5, {fresh: true}), {free: false}); return {keys: s.list.map(x => x.site.key), firstPaid: s.list[0].paid}; });
                    assert.ok(emi.keys.slice(0, 6).includes('so2_ellis'), emi.keys.slice(0, 8).join(','));
                    if (emi.keys.includes('so3_antenati_nom')) assert.ok(emi.keys.indexOf('so3_antenati_nom') < 6, emi.keys.slice(0, 8).join(','));
                    assert.notEqual(emi.firstPaid, 'paid');
                    // le bloc de la fiche et le ⋯
                    await p.evaluate(() => { window.LCNDA_APP.state.currentPersonId = 3; window.LCNDA_APP.setModule('personnes'); });
                    await p.waitForSelector('[data-ouc-block] .ouc-row', { timeout: 20000 });
                    assert.ok(await p.locator('[data-ouc-block] .ouc-row').count() <= 5);
                    assert.match(await p.locator('[data-ouc-block] .ouc-row .ouc-why').first().innerText(), /\S/);
                    const href = await p.locator('[data-ouc-block] [data-ouc-go]').first().getAttribute('href');
                    assert.match(href, /^https?:\/\//);
                    if (SHOTS) { await p.locator('[data-ouc-block]').scrollIntoViewIfNeeded(); await p.screenshot({ path: path.join(SHOTS, `ouc-bloc-${name}.png`) }); }
                    const more = p.locator('#workspace [data-fsec-hero-more]');
                    if (await more.count()) {
                        await more.first().click();
                        assert.ok(await p.locator('.ui-actmenu button', { hasText: 'Où chercher ?' }).count(), 'menu ⋯');
                        await p.keyboard.press('Escape');
                    }
                    // la page « Où chercher ? » : ✓ Trouvé → Journal, ↶ Annuler
                    await p.evaluate(() => window.LCNDA_EXT.ouChercher.openPerson(3));
                    await p.waitForSelector('.ouc-page .ouc-row', { timeout: 20000 });
                    assert.ok(await p.locator('.ouc-facts .ouc-fact').count() >= 2);
                    const key = await p.locator('.ouc-page .ouc-row').first().getAttribute('data-ouc-key');
                    await p.locator('.ouc-page .ouc-row [data-ouc-done]').first().click();
                    await p.locator('.ui-actmenu button', { hasText: 'Trouvé' }).first().click();
                    await p.waitForFunction(k => !document.querySelector(`.ouc-page .ouc-list [data-ouc-key="${k}"]`), key, { timeout: 10000 });
                    assert.equal(php(`echo (int) $pdo->query("SELECT count(*) FROM archive_digest_entries WHERE template_key='ouc:${key}' AND result='found'")->fetchColumn();`), '1');
                    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `ouc-page-${name}.png`) });
                    await noScroll(p);
                    await p.locator('#toast-region button', { hasText: 'Annuler' }).first().click();
                    await p.waitForSelector(`.ouc-page .ouc-list [data-ouc-key="${key}"]`, { timeout: 10000 });
                    assert.equal(php(`echo (int) $pdo->query("SELECT count(*) FROM archive_digest_entries WHERE template_key='ouc:${key}'")->fetchColumn();`), '0');
                    // « Gratuites seulement » : le même réglage que les lots
                    const before = await p.evaluate(() => window.LCNDA_EXT.ouChercher.freeOnly());
                    await p.locator('.ouc-page [data-ouc-free]').evaluate(i => { i.checked = !i.checked; i.dispatchEvent(new Event('change', {bubbles: true})); });
                    assert.equal(await p.evaluate(() => window.LCNDA_EXT.ouChercher.freeOnly()), !before);
                    await p.locator('.ouc-page [data-ouc-free]').evaluate(i => { i.checked = !i.checked; i.dispatchEvent(new Event('change', {bubbles: true})); });
                    // les murs de brique : H10, fenêtre, statut Résolu → 🎉
                    await p.evaluate(() => window.LCNDA_EXT.ouChercher.openPerson(0, 'murs'));
                    await p.waitForSelector('.ouc-walls .ui-listbar', { timeout: 20000 });
                    await p.waitForSelector('.ouc-walls [data-ouc-wall-row]', { timeout: 20000 });
                    assert.ok(await p.locator('.ouc-walls [data-ouc-wall-row="3"]').count());
                    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `ouc-murs-${name}.png`) });
                    await noScroll(p);
                    await p.locator('.ouc-walls [data-ouc-wall-row="4"] [data-ouc-wall]').first().click();
                    await p.waitForSelector('dialog .ouc-wall .ouc-wall-grid', { timeout: 20000 });
                    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `ouc-mur-fenetre-${name}.png`) });
                    await p.locator('dialog .ouc-wall [data-ouc-st="solved"]').click();
                    await p.waitForSelector('#toast-region :text("Bravo")', { timeout: 10000 });
                    assert.equal(php("echo $pdo->query('SELECT status FROM brick_walls WHERE person_id=4')->fetchColumn();"), 'solved');
                    await p.locator('#toast-region button', { hasText: 'Annuler' }).first().click();
                    await p.waitForFunction(() => true);
                    await new Promise(r => setTimeout(r, 600));
                    assert.notEqual(php("echo (string) $pdo->query('SELECT status FROM brick_walls WHERE person_id=4')->fetchColumn();"), 'solved');
                    await p.keyboard.press('Escape');
                    // le widget
                    await p.evaluate(async () => { const A = window.LCNDA_APP; A.saveDashboardBlockSettings({widgets: [A.dashboardNewWidget('brick_walls', {width: '12', limit: 3})]}); if (A.state.module !== 'dashboard') await A.setModule('dashboard'); else await A.renderDashboard(); });
                    await p.waitForSelector('.dashboard-widget[data-widget-type="brick_walls"] .ouc-w-row', { timeout: 20000 });
                    assert.match(await p.locator('.dashboard-widget[data-widget-type="brick_walls"] h3').innerText(), /Murs de brique/);
                    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `ouc-widget-${name}.png`) });
                    await noScroll(p);
                    await ctx.close();
                });
            }
            await browser.close();
            await t('aucune erreur JavaScript', async () => { assert.deepEqual(errors, []); });
        }
    } finally {
        proc.kill();
        fs.rmSync(tmp, { recursive: true, force: true });
    }
    done();
})();
function done() {
    if (failed) { console.error(`\n${failed} échec(s)`); process.exit(1); }
    console.log('\nTout est bon.');
}
