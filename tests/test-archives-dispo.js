'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🏛 Cet acte est-il en ligne aux archives ? (lib/archives_dispo.php, assets/js/heritage-archives-dispo.js ;
 * docs/design/archives-en-ligne.html). Table d'essai FICTIVE : tests/fixtures/archives-en-ligne-essai.json.
 *     node tests/test-archives-dispo.js        (captures : SHOTS=dossier node tests/test-archives-dispo.js)
 * (Le nom tests/test-archives-en-ligne.js est déjà pris par la fenêtre « 🔍 Archives en ligne » des lots.)
 *  1. le calcul (PHP) : 🟢 seulement avec une limite vérifiée (verified: true ET « officielle »), 🟡 sinon (« année lue dans
 *     un extrait de recherche », source secondaire), ligne sans source ignorée, « vers » = ± 5 ans, 🔒 jusqu'en <année>
 *     (75 ans), 📮 et À QUI (mairie, AD, SCEC, ANOM, diocèse), étranger, Paris avant 1860, baptême et sépulture ; ✓ de la
 *     personne → 🟢 (tout le département, ou seulement la commune), ✗, « pas trouvé », ↶ Annuler, ＋ limite (adresse
 *     obligatoire) ; table absente → rien d'« en ligne », aucune erreur ; « Actes à demander » sans « +100 » deviné ;
 *     destinataires SHD et ANOM de la lettre ;
 *  2. le serveur (php -S) et le navigateur (Playwright, sinon sauté) à 1440, 390 et en sombre : pastilles de la fiche,
 *     « Pourquoi cette pastille ? » (source, date de vérification, Légifrance), ✓ puis ↶ Annuler, table des limites,
 *     Chronologie, widget, mode consultation (rien), lieu piégé jamais exécuté, aucune erreur JavaScript.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');
const {findPhp, devBundledPhp, phpRuntimeArgs} = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const FIX = path.join(appRoot, 'tests/fixtures/archives-en-ligne-essai.json');
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const XSS = '<img src=x onerror=window.__xss=1>';

(async () => {
    const phpPath = findPhp([devBundledPhp()]);
    if (!phpPath) { console.log('— PHP absent : test sauté'); return done(); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-ad-'));
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', LCNDA_ARCHIVES_EN_LIGNE: FIX, XSS};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,is_start,living_status) VALUES(1,'Louis','PEYRAT','male',1,'deceased'),(2,'Jeanne','MAZAUD','female',0,'deceased'),(3,'Pierre','LACOMBE','male',0,'deceased'),(4,'Rose','ROUSSILHE','female',0,'deceased')");
$pdo->prepare("INSERT INTO places(id,name,county,state,country,admin2_code) VALUES(1,'Meymac','Corrèze','','France','19'),(2,'Ussel','Corrèze','','France','19'),(3,'Tulle','Corrèze','','France','19'),(4,'Aurillac','Cantal','','France','15'),(5,'Auch','Gers','','France','32'),(6,'Brive','Corrèze','','France','19'),(7,?,'Corrèze','','France','19')")->execute([getenv('XSS')]);
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,3,2)");
$ev = $pdo->prepare('INSERT INTO events(id,scope,person_id,family_id,event_type_id,date_text,year,place_id) VALUES(?,?,?,?,?,?,?,?)');
foreach ([[1,'person',2,null,'BIRT','12 mars 1904',1904,1],[2,'family',null,1,'MARR','vers 1925',1925,2],[3,'person',2,null,'DEAT','3 février 1987',1987,3],[4,'person',2,null,'BURI','1987',1987,null],
          [5,'person',3,null,'BIRT','8 juin 1952',1952,4],[6,'person',1,null,'BIRT','1905',1905,5],[7,'person',4,null,'CHR','1781',1781,2],[8,'person',4,null,'BIRT','1913',1913,6],[9,'person',4,null,'DEAT','1912',1912,7]] as $r) {
    [$id,$sc,$pid,$fid,$tag,$dt,$y,$pl] = $r; $ev->execute([$id,$sc,$pid,$fid,$t($tag),$dt,$y,$pl]); }
echo 'ok';`], {cwd: appRoot, encoding: 'utf8', env});
    if (seed.status !== 0 || !String(seed.stdout).includes('ok')) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const php = (code, extra = {}) => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require 'lib/paths.php'; require 'lib/bootstrap.php'; $pdo = db(); ${code}`], {cwd: appRoot, encoding: 'utf8', env: {...env, ...extra}}); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return String(r.stdout).trim(); };
    const status = (e, extra) => JSON.parse(php(`echo json_encode(ad_status($pdo, json_decode(getenv('EV'), true), '2026-11-20'));`, {EV: JSON.stringify(e), ...(extra || {})}));
    const S = (tag, date_text, year, place, county, admin2_code, country = '') => status({id: 0, tag, date_text, year, place, county, admin2_code, country});

    /* ═════ 1. le calcul ═════ */
    await t('🟢 seulement avec une limite vérifiée et officielle ; vers = ± 5 ans ; 2 ans après la limite = 🟡', () => {
        let s = S('BIRT', '12 mars 1904', 1904, 'Meymac', 'Corrèze', '19');
        assert.equal(s.status, 'online'); assert.equal(s.limit.until, 1912); assert.equal(s.limit.checked, '2026-11-14'); assert.match(s.limit.source, /^https:\/\/exemple\.invalid/);
        assert.deepEqual(s.range, [1904, 1904, false]);
        s = S('MARR', 'vers 1928', 1928, 'Ussel', 'Corrèze', '19'); assert.equal(s.status, 'maybe'); assert.equal(s.reason, 'straddle'); assert.deepEqual(s.range, [1923, 1933, true]);
        s = S('MARR', 'vers 1925', 1925, 'Ussel', 'Corrèze', '19'); assert.equal(s.status, 'online', 'toute la fourchette 1920-1930 avant 1932');
        s = S('BIRT', '1913', 1913, 'Meymac', 'Corrèze', '19'); assert.equal(s.status, 'maybe'); assert.equal(s.reason, 'near');
        s = S('BAPM', '1781', 1781, 'Ussel', 'Corrèze', '19'); assert.equal(s.status, 'online'); assert.equal(s.key, 'BMS');
    });
    await t('verified: false → 🟡 « à confirmer » ; source secondaire → 🟡 ; ligne sans source ignorée', () => {
        let s = S('BIRT', '1905', 1905, 'Auch', 'Gers', '32');
        assert.equal(s.status, 'maybe'); assert.equal(s.reason, 'unconfirmed'); assert.equal(s.limit.verified, false); assert.equal(s.limit.confirmed, null);
        s = S('DEAT', '1920', 1920, 'Auch', 'Gers', '32'); assert.equal(s.status, 'maybe'); assert.equal(s.limit.confidence, 'secondaire');
        s = S('BIRT', '1900', 1900, 'Cahors', 'Lot', '46'); assert.equal(s.status, 'maybe'); assert.equal(s.reason, 'nolimit', 'la ligne du Lot n’a pas de source : elle n’existe pas');
        assert.equal(s.limit, null);
    });
    await t('🔒 réservé jusqu’en 2027 (75 ans), 📮 à demander et à QUI', () => {
        let s = S('BIRT', '8 juin 1952', 1952, 'Aurillac', 'Cantal', '15');
        assert.equal(s.status, 'restricted'); assert.equal(s.open_year, 2027); assert.equal(s.open_at, '2027-06-08'); assert.equal(s.who, 'mairie');
        s = S('DEAT', '3 février 1987', 1987, 'Tulle', 'Corrèze', '19'); assert.equal(s.status, 'ask'); assert.equal(s.who, 'mairie'); assert.equal(s.commune, 'Tulle');
        s = S('BIRT', '1900', 1900, 'Liège', '', '', 'Belgique'); assert.equal(s.status, 'verify'); assert.equal(s.reason, 'abroad'); assert.equal(s.who, 'scec');
        s = S('BIRT', '1900', 1900, 'Alger', '', '', 'Algérie'); assert.equal(s.who, 'anom'); assert.equal(s.status, 'ask');
        s = S('BIRT', '1777', 1777, 'Pologne', '', ''); assert.equal(s.reason, 'abroad', 'un lieu « Pologne » : à l’étranger');
        s = S('BAPM', '1850', 1850, 'Ussel', 'Corrèze', '19'); assert.equal(s.status, 'ask'); assert.equal(s.who, 'diocese'); assert.equal(s.reason, 'religious');
        s = S('BIRT', '1850', 1850, 'Paris', 'Paris', '75'); assert.equal(s.status, 'maybe'); assert.equal(s.reason, 'paris1860');
        s = S('BURI', '1987', 1987, '', '', ''); assert.equal(s.status, 'verify'); assert.equal(s.reason, 'noplace');
        s = S('BIRT', '', null, 'Meymac', 'Corrèze', '19'); assert.equal(s.status, 'verify'); assert.equal(s.reason, 'nodate');
        s = S('BIRT', '1940', 1940, 'Meymac', 'Corrèze', '19'); assert.equal(s.status, 'ask'); assert.equal(s.reason, 'after'); assert.equal(s.who, 'mairie');
        s = S('DEAT', '1880', 1880, 'Aurillac', 'Cantal', '15'); assert.equal(s.status, 'maybe', 'plus de 100 ans sans limite : 🟡, jamais 🟢');
    });
    await t('table absente : rien n’est « en ligne », aucune erreur', () => {
        const s = status({id: 0, tag: 'BIRT', date_text: '1904', year: 1904, place: 'Meymac', county: 'Corrèze', admin2_code: '19'}, {LCNDA_ARCHIVES_EN_LIGNE: path.join(tmp, 'absent.json')});
        assert.equal(s.status, 'maybe'); assert.equal(s.reason, 'nolimit');
        assert.equal(php("echo json_encode(ad_config()['present']);", {LCNDA_ARCHIVES_EN_LIGNE: path.join(tmp, 'absent.json')}), 'false');
        fs.writeFileSync(path.join(tmp, 'bad.json'), '{pas du json');
        assert.equal(php("echo json_encode(ad_config()['present']);", {LCNDA_ARCHIVES_EN_LIGNE: path.join(tmp, 'bad.json')}), 'false');
    });
    await t('✓ de la personne : verified:false → 🟢 ; ↶ Annuler ; ✗ seulement cette commune ; « pas trouvé » ne bouge rien ; ＋ limite (adresse obligatoire)', () => {
        assert.equal(JSON.parse(php('echo json_encode(ad_events($pdo, [6])[6]);')).status, 'maybe');
        const r = JSON.parse(php("echo json_encode(ad_write($pdo, ['op' => 'correct', 'event_id' => 6, 'verdict' => 'yes', 'url' => 'https://exemple.invalid/vue143', 'page' => 'vue 143', 'add_source' => 1, 'about' => 'Naissance de Louis PEYRAT']));"));
        assert.equal(r.status.status, 'online', '✓ : le Gers passe en 🟢 pour 1905');
        assert.ok(r.source_id > 0);
        assert.equal(php('echo (int) $pdo->query("SELECT count(*) FROM source_links WHERE entity_type=\'event\' AND entity_id=6")->fetchColumn();'), '1');
        assert.equal(JSON.parse(php('echo json_encode(ad_events($pdo, [6])[6]);')).linked, true);
        // une autre naissance du Gers plus ancienne : 🟢 aussi (au moins jusqu'en 1905, d'après toi)
        assert.equal(S('BIRT', '1899', 1899, 'Mirande', 'Gers', '32').status, 'online');
        php(`ad_write($pdo, ['op' => 'undo', 'id' => ${r.id}]);`);
        assert.equal(JSON.parse(php('echo json_encode(ad_events($pdo, [6])[6]);')).status, 'maybe', '↶ : la ligne livrée revient');
        assert.equal(php('echo (int) $pdo->query("SELECT count(*) FROM source_links WHERE entity_id=6")->fetchColumn() + (int) $pdo->query("SELECT count(*) FROM sources")->fetchColumn();'), '0');
        // ✗ seulement Brive : la limite du département ne bouge pas
        const no = JSON.parse(php("echo json_encode(ad_write($pdo, ['op' => 'correct', 'event_id' => 8, 'verdict' => 'no', 'scope' => 'commune']));"));
        assert.equal(no.status.status, 'ask');
        assert.equal(S('BIRT', '1914', 1914, 'Brive', 'Corrèze', '19').status, 'ask', 'Brive : pas en ligne après 1912, d’après toi');
        assert.equal(S('BIRT', '1913', 1913, 'Meymac', 'Corrèze', '19').status, 'maybe', 'Meymac : toujours la limite du département (à 2 ans)');
        assert.equal(php("echo (string) $pdo->query('SELECT commune_label FROM archives_dispo_corr WHERE id=" + no.id + "')->fetchColumn();"), 'Brive');
        const nf = JSON.parse(php("echo json_encode(ad_write($pdo, ['op' => 'correct', 'event_id' => 1, 'verdict' => 'notfound']));"));
        assert.equal(nf.status.status, 'online');
        assert.throws(() => php("ad_write($pdo, ['op' => 'limit', 'dept' => '15', 'act' => 'N', 'year' => 1925, 'url' => '']);"), /adresse de la page qui le dit est obligatoire/);
        php("ad_write($pdo, ['op' => 'limit', 'dept' => '15', 'act' => 'D', 'year' => 1925, 'url' => 'https://exemple.invalid/ad15']);");
        assert.equal(S('DEAT', '1920', 1920, 'Aurillac', 'Cantal', '15').status, 'online');
        assert.throws(() => php("ad_write($pdo, ['op' => 'correct', 'event_id' => 4, 'verdict' => 'yes']);"), /précise d’abord le lieu/);
    });
    await t('lettre : destinataires SHD et ANOM, et celui choisi par la pastille', () => {
        const b = JSON.parse(php("require_once 'lib/courriers_actes.php'; echo json_encode(cl_build($pdo, ['event_id' => 3, 'recipient' => 'anom', 'what' => 'recherche']));"));
        assert.equal(b.recipient_kind, 'anom'); assert.match(b.recipient.address, /Aix-en-Provence/);
        assert.ok(b.recipients.shd && /Vincennes/.test(b.recipients.shd.address));
        assert.ok(b.recipient_kinds.notaire);
    });
    await t('compteur du widget : actes 🟢 pas encore liés', () => {
        const c = JSON.parse(php("echo json_encode(ad_counts($pdo, false, '2026-11-20'));"));
        assert.ok(c.todo >= 2, JSON.stringify(c)); assert.ok(c.by.N >= 1 && c.by.M >= 1);
        assert.equal(c.table, true);
    });

    /* ═════ 2. le serveur et le navigateur ═════ */
    let pw = null; try { pw = require('/opt/node22/lib/node_modules/playwright'); } catch (_) { try { pw = require('playwright'); } catch (__) { pw = null; } }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], {cwd: appRoot, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    const SHOTS = process.env.SHOTS || '';
    try {
        await t('API : ad_person, ad_table, ad_write refusé sans jeton CSRF', async () => {
            const d = await (await fetch(`${base}api.php?action=ad_person&id=2`)).json();
            assert.ok(d.ok && d.items.length === 4, JSON.stringify(d).slice(0, 300));
            assert.deepEqual(d.items.map(x => x.status), ['online', 'online', 'ask', 'verify']);
            const tb = await (await fetch(`${base}api.php?action=ad_table`)).json();
            assert.equal(tb.rows.length, 101); assert.ok(tb.rows.find(r => r.code === '19').acts.N);
            const w = await fetch(`${base}api.php?action=ad_write`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({op: 'undo', id: 1})});
            assert.ok(w.status >= 400);
        });
    await t('« Actes à demander » : plus de « online_from » deviné ; la pastille à la place ; un acte 🟢 sort de la liste', async () => {
        const acts = (await (await fetch(`${base}api.php?action=recent_acts`)).json()).acts;
        assert.ok(acts.length >= 2); assert.ok(acts.every(a => !('online_from' in a) && a.archives && a.archives.status));
        const page = await (await fetch(`${base}api.php?action=recent_acts&limit=50&all=0`)).json();
        assert.ok(!page.acts.some(a => a.archives.status === 'online'), 'un acte en ligne n’est pas « à demander »');
        assert.ok(page.acts.some(a => a.event_id === 5 && a.archives.status === 'restricted'));
    });
        if (!pw) { console.log('— Playwright absent : partie navigateur sautée'); return; }
        const browser = await pw.chromium.launch();
        const errors = [];
        for (const [name, vp, dark] of [['1440', {width: 1440, height: 1000}, false], ['390', {width: 390, height: 860}, false], ['sombre', {width: 1440, height: 1000}, true]]) {
            await t(`navigateur ${name} : fiche, « Pourquoi ? », ✓ puis ↶, table, Chronologie, widget, Où chercher`, async () => {
                const ctx = await browser.newContext({viewport: vp, colorScheme: dark ? 'dark' : 'light'});
                await ctx.addInitScript(() => { try { localStorage.setItem('genealogie-last-route', '#tableau-de-bord'); localStorage.setItem('lcnda-archives-dispo', JSON.stringify({chrono: true, lists: true})); } catch (_) {} });
                const p = await ctx.newPage();
                p.on('pageerror', e => errors.push(`${name} : ${e.message}`)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errors.push(`${name} : ${m.text()}`); });
                await p.goto(base);
                await p.waitForFunction(() => window.LCNDA_APP?.state && window.LCNDA_EXT?.archivesDispo, null, {timeout: 30000});
                if (dark) await p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
                const noScroll = async () => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false, 'pas de défilement horizontal');
                await p.evaluate(() => { window.LCNDA_APP.state.currentPersonId = 2; window.LCNDA_APP.setModule('personnes'); });
                await p.waitForSelector('.event-row .ad-badge', {timeout: 20000});
                const texts = await p.$$eval('.event-row .ad-badge', bs => bs.map(b => b.textContent.trim()));
                assert.ok(texts.some(x => /🟢 En ligne/.test(x)) && texts.some(x => /📮 À demander · Mairie de Tulle/.test(x)) && texts.some(x => /❔ À vérifier/.test(x)), texts.join(' | '));
                await p.locator('.event-row .ad-badge').first().scrollIntoViewIfNeeded();
                if (SHOTS) await p.screenshot({path: path.join(SHOTS, `arch2-fiche-${name}.png`)});
                await noScroll();
                await p.locator('.event-row[data-event-id="1"] .ad-badge').click();
                await p.waitForSelector('.ad-why');
                const why = await p.locator('.ad-why').innerText();
                assert.match(why, /Limite des naissances \(Corrèze\) : en ligne jusqu’en 1912/); assert.match(why, /vérifié le 14 nov/); assert.doesNotMatch(why, /1 912/);
                assert.ok(await p.locator('.ad-why a[href^="https://www.legifrance.gouv.fr/"]').count() >= 1, 'lien Légifrance');
                if (SHOTS) await p.screenshot({path: path.join(SHOTS, `arch2-pourquoi-${name}.png`)});
                await p.keyboard.press('Escape');
                await p.waitForSelector('.ad-why', {state: 'detached', timeout: 5000});
                if (name === '1440') {
                    // ✓ sur la naissance du Gers (verified:false → 🟡), puis ↶ Annuler
                    await p.evaluate(() => { window.LCNDA_APP.state.currentPersonId = 1; window.LCNDA_APP.setModule('personnes'); });
                    await p.waitForSelector('.event-row[data-event-id="6"] .ad-badge.is-maybe', {timeout: 20000});
                    await p.locator('.event-row[data-event-id="6"] .ad-badge').click();
                    assert.match(await p.locator('.ad-why').innerText(), /année lue dans un extrait de recherche, pas encore confirmée/);
                    await p.locator('.ad-why [data-ad-yes]').click();
                    await p.waitForSelector('dialog[open] input[name="url"]');
                    if (SHOTS) await p.screenshot({path: path.join(SHOTS, 'arch2-trouve-1440.png')});
                    await p.locator('dialog[open] input[name="url"]').fill('https://exemple.invalid/vue143');
                    await p.locator('dialog[open] button[type="submit"]').click();
                    await p.waitForSelector('.event-row[data-event-id="6"] .ad-badge.is-online', {timeout: 20000});
                    await p.locator('#toast-region button', {hasText: 'Annuler'}).first().click();
                    await p.waitForSelector('.event-row[data-event-id="6"] .ad-badge.is-maybe', {timeout: 20000});
                    // la lettre s'ouvre avec le bon destinataire (mairie de Tulle)
                    await p.evaluate(() => { window.LCNDA_APP.state.currentPersonId = 2; window.LCNDA_APP.setModule('personnes'); });
                    await p.waitForSelector('.event-row[data-event-id="3"] .ad-badge', {timeout: 20000});
                    await p.locator('.event-row[data-event-id="3"] .ad-badge').click();
                    await p.locator('.ad-why [data-ad-letter]').click();
                    await p.waitForSelector('dialog[open] select[name="recipient"]', {timeout: 20000});
                    assert.equal(await p.locator('dialog[open] select[name="recipient"]').inputValue(), 'mairie');
                    assert.ok(await p.locator('dialog[open] select[name="recipient"] option[value="shd"]').count());
                    assert.ok(await p.locator('dialog[open] .cl-rule a[href*="legifrance"]').count(), 'L213-2 : lien Légifrance');
                    await p.keyboard.press('Escape');
                }
                // la table des limites (Réglages)
                await p.evaluate(() => window.LCNDA_EXT.archivesDispo.openTable());
                await p.waitForSelector('.ad-page .ad-table tbody tr', {timeout: 20000});
                assert.match(await p.locator('.ad-page').innerText(), /19 · Corrèze/);
                if (SHOTS) await p.screenshot({path: path.join(SHOTS, `arch2-table-${name}.png`)});
                await noScroll();
                // la Chronologie (cochée)
                await p.evaluate(() => { window.LCNDA_APP.state.currentPersonId = 2; window.LCNDA_APP.setModule('chronologie'); });
                await p.waitForSelector('#workspace [data-event-id] .ad-badge', {timeout: 20000}).catch(() => {});
                if (SHOTS) await p.screenshot({path: path.join(SHOTS, `arch2-chronologie-${name}.png`)});
                // le widget
                await p.evaluate(async () => { const A = window.LCNDA_APP; A.saveDashboardBlockSettings({widgets: [A.dashboardNewWidget('archives_online', {width: '12'})]}); if (A.state.module !== 'dashboard') await A.setModule('dashboard'); else await A.renderDashboard(); });
                await p.waitForSelector('.dashboard-widget[data-widget-type="archives_online"] .ad-widget', {timeout: 20000});
                assert.match(await p.locator('.dashboard-widget[data-widget-type="archives_online"]').innerText(), /en ligne et pas encore liés à une source/);
                if (SHOTS) await p.screenshot({path: path.join(SHOTS, `arch2-widget-${name}.png`)});
                await noScroll();
                // 🌍 Où chercher ? : « Ses actes aux archives »
                await p.evaluate(() => window.LCNDA_EXT.ouChercher.openPerson(2));
                await p.waitForSelector('.ouc-page .ad-ouc li', {timeout: 20000});
                if (SHOTS) await p.screenshot({path: path.join(SHOTS, `arch2-ou-chercher-${name}.png`)});
                // le lieu piégé (Rose ROUSSILHE, décès 1912) : affiché, jamais exécuté
                await p.evaluate(() => { window.LCNDA_APP.state.currentPersonId = 4; window.LCNDA_APP.setModule('personnes'); });
                await p.waitForSelector('.event-row[data-event-id="9"] .ad-badge', {timeout: 20000});
                await p.locator('.event-row[data-event-id="9"] .ad-badge').click();
                await p.waitForSelector('.ad-why');
                assert.equal(await p.evaluate(() => window.__xss), undefined);
                await p.keyboard.press('Escape');
                await p.waitForSelector('.ad-why', {state: 'detached', timeout: 5000});
                // mode consultation : aucune pastille
                await p.evaluate(() => { document.body.classList.add('is-kiosk'); window.LCNDA_APP.setModule('personnes'); });
                await p.waitForTimeout(800);
                assert.equal(await p.locator('.event-row .ad-badge:visible').count(), 0);
                await ctx.close();
            });
        }
        await browser.close();
        await t('aucune erreur JavaScript', () => assert.deepEqual(errors, []));
    } finally {
        proc.kill();
        fs.rmSync(tmp, {recursive: true, force: true});
    }
    done();
})();
function done() {
    if (failed) { console.error(`\n${failed} échec(s)`); process.exit(1); }
    console.log('\nTout est bon.');
}
