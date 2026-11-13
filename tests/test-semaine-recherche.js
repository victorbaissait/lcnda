'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🗓 Ma semaine de recherche (lib/semaine.php, assets/js/heritage-semaine.js) :   node tests/test-semaine-recherche.js
 *  1. un vrai « php -S » sur une petite base qui a une ligne de chaque sorte : rappels (en retard, du jour, de la semaine ;
 *     celui du mois prochain n'y est pas), courriers (relance dépassée, en attente depuis N jours ; réponse reçue absente),
 *     visites (dans 2 jours, dans 20 jours ; faite absente), pistes et hypothèse, « Que manque-t-il ? » (dont « Recensement de
 *     1906 à Tulle : chercher sur SocFace » quand lib/socface.php est là), à vérifier (foyer SocFace, alerte 🔴 du contrôle),
 *     entraide (réponse reçue = aujourd'hui), fait cette semaine (Journal, demande résolue) ;
 *     ✓ fait (vraie action ou marque), ⏭ reporter (vraie date ou marque), ↶ Annuler (restore) pour chaque sorte ; clés forgées
 *     refusées, CSRF ;
 *  2. le navigateur (Playwright ; sinon sauté) à 1440 px, 390 px et en sombre : le widget dans le tableau de bord, ✓ puis
 *     ↶ Annuler, ⏭ À demain, ⛶ en grand (filtres), réglage K2 (Aujourd'hui, Par sorte, une sorte cachée), 🧩 une chose à la
 *     fois, le même widget sur la page du Suivi ; aucune erreur JavaScript, pas de défilement horizontal.
 * Captures : SHOTS=dossier node tests/test-semaine-recherche.js
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
if (!phpPath) { console.log('— PHP absent : test sauté'); process.exit(0); }
const SHOTS = process.env.SHOTS || '';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-semaine-'));
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

const dir = path.join(tmp, 'a');
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$d = fn($n) => date('Y-m-d', strtotime(($n >= 0 ? '+' : '') . $n . ' days'));
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,is_start) VALUES(1,'Luc','MARTIN','male',1),(2,'Joseph','MARTIN','male',0),(3,'Marie','BORIE','female',0),(4,'Henri','VIDAL','male',0)");
$pdo->exec("INSERT INTO places(id,name,county,country,admin2_code) VALUES(1,'Tulle','Corrèze','France','19'),(2,'Naves','Corrèze','France','19')");
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,2,3)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,1)");
$ev = $pdo->prepare('INSERT INTO events(scope,person_id,family_id,event_type_id,date_text,year,place_id) VALUES(?,?,?,?,?,?,?)');
foreach ([['person',1,null,'BIRT','1 juin 1950',1950,1], ['person',2,null,'BIRT','3 mars 1903',1903,1], ['person',2,null,'DEAT','5 mai 1975',1975,1], ['person',3,null,'BIRT','2 avril 1910',1910,2],
          ['person',4,null,'BIRT','1 janvier 1900',1900,1], ['person',4,null,'DEAT','10 mai 1890',1890,1]] as [$sc,$pid,$fid,$tag,$dt,$y,$pl]) { $ev->execute([$sc,$pid,$fid,$t($tag),$dt,$y,$pl]); }
// 🔔 rappels
$r = $pdo->prepare("INSERT INTO standalone_reminders(id,title,reminder_mode,reminder_due_at) VALUES(?,?,?,?)");
$r->execute([1,'Relire l’acte de 1823','on',$d(-3)]); $r->execute([2,'Écrire à la mairie de Naves','on',$d(0)]); $r->execute([3,'Commander la copie','before',$d(3)]); $r->execute([4,'Rappel du mois prochain','on',$d(25)]);
// 🔍 enquête, pistes, rappel de piste
$pdo->exec("INSERT INTO investigations(id,person_id,title,status) VALUES(1,2,'Où est né Joseph ?','open')");
$pdo->prepare("INSERT INTO investigation_items(id,investigation_id,kind,title,status,reminder_mode,reminder_due_at) VALUES(1,1,'lead','Registres de Naves 1900-1905','to_explore_priority','on',?)")->execute([$d(0)]);
$pdo->exec("INSERT INTO investigation_items(id,investigation_id,kind,title,status) VALUES(2,1,'source','Tables décennales 1903','to_explore')");
$pdo->exec("INSERT INTO hypotheses(id,person_id,title,statement,confidence,status) VALUES(1,2,'Joseph est le fils de Pierre','Même métier, même village','medium','open')");
// ✉️ courriers
$c = $pdo->prepare("INSERT INTO courriers(id,organisme,destinataire,objet,date_envoi,statut,relance_delai_jours,relance_date) VALUES(?,?,?,?,?,?,?,?)");
$c->execute([1,'mairie','Mairie de Naves','Copie intégrale de naissance',$d(-40),'en_attente',30,$d(-10)]);
$c->execute([2,'archives','AD Corrèze','Recherche matricule',$d(-12),'envoye',60,$d(48)]);
$c->execute([3,'notaire','Maître Dupuy','Inventaire après décès',$d(-60),'reponse_recue',30,'']);
// 🏛 visites
$v = $pdo->prepare("INSERT INTO archive_visit_plans(id,title,visit_date,archive_center,done_at) VALUES(?,?,?,?,?)");
$v->execute([1,'Registres paroissiaux',$d(2),'AD de la Corrèze','']); $v->execute([2,'Minutes notariales',$d(20),'AD du Cantal','']); $v->execute([3,'Visite faite',$d(-1),'AD de la Creuse',$d(-1)]);
$pdo->exec("INSERT INTO archive_visit_items(visit_id,archive_reference,title) VALUES(1,'3 E 12/4','Baptêmes 1780-1792'),(1,'3 E 12/5','Mariages')");
// 🤝 entraide
$h = $pdo->prepare("INSERT INTO help_requests(id,person_id,target,question,status,posted_where) VALUES(?,?,?,?,?,?)");
$h->execute([1,2,'forum','Qui a l’acte de naissance de Joseph Martin ?','answered','Forum Corrèze']); $h->execute([2,3,'geneanet','Où s’est marié Marie Borie ?','posted','Geneanet']); $h->execute([3,2,'facebook','Photo de la maison de Tulle','solved','Facebook']);
// 📜 journal : un dépouillement trouvé aujourd'hui
$pdo->exec("INSERT INTO archive_digest_entries(id,city_name,archive_service,archive_reference,year_text,record_type,status,result,found) VALUES(1,'Naves','AD Corrèze','4 E 150','1903','naissance','done','found','Acte n° 12')");
// 🧾 SocFace : un foyer importé pas encore vérifié
if (function_exists('socface_schema')) {
    socface_schema($pdo);
    $pdo->exec("INSERT INTO census_records(id,year,place_id,origin,verified,image_url) VALUES(1,1906,1,'socface',0,'https://francearchives.gouv.fr/fr/basedenoms/exemple')");
    $pdo->exec("INSERT INTO census_members(census_id,first_name,display_name,is_primary) VALUES(1,'Jean','MARTIN',1),(1,'Rose','MARTIN',0)");
}
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env: envFor(dir), maxBuffer: 1 << 26 });
if (seed.status !== 0 || !String(seed.stdout).includes('ok')) { console.error(seed.stderr || seed.stdout); process.exit(1); }

let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const startServer = async () => {
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(dir), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let cookie = '';
    const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
    const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
    const get = async (action, q = {}) => (await fetch(`${base}api.php?action=${action}&${new URLSearchParams(q)}`, { headers: { Cookie: cookie } })).json();
    const post = async (action, body, token = csrf) => { const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: JSON.stringify({ ...body, csrf: token }) }); const j = await r.json(); return { status: r.status, json: j && j.result && typeof j.result === 'object' ? { ...j.result, ok: j.ok } : j }; };
    return { proc, base, get, post };
};
const php = code => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require 'lib/paths.php'; require 'lib/bootstrap.php'; $pdo = db(); ${code}`], { cwd: appRoot, encoding: 'utf8', env: envFor(dir) }); return String(r.stdout).trim(); };

(async () => {
    const S = await startServer();
    const { get, post } = S;
    const find = (d, key) => d.items.find(i => i.key === key);
    const hasSocface = php("echo function_exists('socface_gap_items') ? 1 : 0;") === '1';
    try {
        await t('chaque sorte a ses lignes, rangées par urgence', async () => {
            const d = await get('semaine');
            assert.ok(!d.error, d.error);
            const u = k => find(d, k)?.urgency;
            assert.equal(u('rappel:s:1'), 'late'); assert.equal(u('rappel:s:2'), 'today'); assert.equal(u('rappel:s:3'), 'week');
            assert.ok(!find(d, 'rappel:s:4'), 'le rappel du mois prochain attend');
            assert.equal(u('rappel:i:1'), 'today', 'rappel d’une piste');
            assert.equal(u('courrier:1'), 'late'); assert.equal(u('courrier:2'), 'later');
            assert.match(find(d, 'courrier:2').detail, /Réponse attendue depuis 12 jours/);
            assert.ok(!find(d, 'courrier:3'), 'réponse reçue : plus dans la liste');
            assert.equal(u('visite:1'), 'week'); assert.equal(u('visite:2'), 'later'); assert.ok(!find(d, 'visite:3'));
            assert.match(find(d, 'visite:1').detail, /2 cotes à consulter/);
            assert.equal(u('piste:1'), 'week'); assert.equal(u('piste:2'), 'later'); assert.equal(u('hypo:1'), 'later');
            assert.equal(u('entraide:1'), 'today'); assert.equal(u('entraide:2'), 'later'); assert.ok(!find(d, 'entraide:3'));
            assert.ok(d.items.some(i => i.sort === 'manque'), 'Que manque-t-il ?');
            assert.ok(d.items.some(i => i.key.startsWith('controle:') && i.urgency === 'week'), 'alerte 🔴 du contrôle (mort avant naissance)');
            if (hasSocface) {
                assert.ok(d.items.some(i => i.title === 'Recensement de 1906 à Tulle : chercher sur SocFace' && i.sf?.year === 1906), d.items.filter(i => i.sort === 'manque').map(i => i.title).join(' | '));
                assert.equal(u('socface:1'), 'later');
            }
            const order = d.items.map(i => ['late', 'today', 'week', 'later'].indexOf(i.urgency));
            assert.deepEqual(order, [...order].sort((a, b) => a - b), 'rangé par urgence');
            assert.ok(d.done.some(x => x.key === 'fait:digest:1'), 'Journal : dépouillement trouvé');
            assert.ok(d.done.some(x => x.key === 'fait:entraide:3'), 'demande résolue cette semaine');
            assert.equal(d.counts.late, d.items.filter(i => i.urgency === 'late').length);
        });
        const cycle = async (key, check) => {
            const r = await post('semaine_mark', { op: 'done', key, title: 'x' });
            assert.equal(r.status, 200, JSON.stringify(r.json)); assert.ok(r.json.ok, JSON.stringify(r.json));
            let d = await get('semaine'); assert.ok(!find(d, key), `${key} disparaît après ✓`);
            await check?.('done');
            const u = await post('semaine_mark', { op: 'restore', key, prev: r.json.prev });
            assert.ok(u.json.ok, JSON.stringify(u.json));
            d = await get('semaine'); assert.ok(find(d, key), `${key} revient après ↶ Annuler`);
            await check?.('undo');
        };
        await t('✓ fait puis ↶ Annuler : la vraie action de chaque sorte', async () => {
            await cycle('rappel:s:1', s => assert.equal(php("echo $pdo->query('SELECT reminder_done FROM standalone_reminders WHERE id=1')->fetchColumn();"), s === 'done' ? '1' : '0'));
            await cycle('rappel:i:1', s => assert.equal(php("echo $pdo->query('SELECT reminder_done FROM investigation_items WHERE id=1')->fetchColumn();"), s === 'done' ? '1' : '0'));
            await cycle('courrier:1', s => assert.equal(php("echo $pdo->query('SELECT statut FROM courriers WHERE id=1')->fetchColumn();"), s === 'done' ? 'reponse_recue' : 'en_attente'));
            await cycle('visite:1', s => assert.equal(php("echo $pdo->query('SELECT done_at FROM archive_visit_plans WHERE id=1')->fetchColumn();") !== '', s === 'done'));
            await cycle('piste:2', s => assert.equal(php("echo $pdo->query('SELECT status FROM investigation_items WHERE id=2')->fetchColumn();"), s === 'done' ? 'explored' : 'to_explore'));
            await cycle('entraide:2', s => assert.equal(php("echo $pdo->query('SELECT status FROM help_requests WHERE id=2')->fetchColumn();"), s === 'done' ? 'solved' : 'posted'));
            if (hasSocface) await cycle('socface:1', s => assert.equal(php("echo $pdo->query('SELECT verified FROM census_records WHERE id=1')->fetchColumn();"), s === 'done' ? '1' : '0'));
        });
        await t('✓ fait par une marque (hypothèse, recherche proposée, contrôle) : dans « Fait cette semaine »', async () => {
            const d0 = await get('semaine');
            const gap = d0.items.find(i => i.sort === 'manque'), ctl = d0.items.find(i => i.key.startsWith('controle:'));
            for (const it of [{ key: 'hypo:1', title: 'Hypothèse : Joseph est le fils de Pierre' }, gap, ctl]) {
                await cycle(it.key);
                const r = await post('semaine_mark', { op: 'done', key: it.key, title: it.title, open: it.open || null });
                const d = await get('semaine');
                assert.ok(d.done.some(x => x.key === 'fait:' + it.key && x.title === it.title), `${it.key} dans Fait cette semaine`);
                await post('semaine_mark', { op: 'restore', key: it.key, prev: r.json.prev });
            }
            assert.equal(php("echo $pdo->query(\"SELECT count(*) FROM app_settings WHERE key='genealogie-semaine-marks'\")->fetchColumn();"), '0', 'marques jamais dans une clé envoyée au navigateur');
        });
        await t('⏭ reporter : la vraie date (rappel, courrier) ou une marque, puis ↶ Annuler', async () => {
            const tomorrow = php("echo date('Y-m-d', strtotime('+1 day'));");
            let r = await post('semaine_mark', { op: 'snooze', key: 'rappel:s:2', until: 'tomorrow' });
            assert.ok(r.json.ok); assert.equal(php("echo $pdo->query('SELECT reminder_due_at FROM standalone_reminders WHERE id=2')->fetchColumn();"), tomorrow);
            let d = await get('semaine'); assert.equal(find(d, 'rappel:s:2').urgency, 'week', 'demain = cette semaine');
            await post('semaine_mark', { op: 'restore', key: 'rappel:s:2', prev: r.json.prev });
            d = await get('semaine'); assert.equal(find(d, 'rappel:s:2').urgency, 'today');
            r = await post('semaine_mark', { op: 'snooze', key: 'courrier:1', until: 'nextweek' });
            d = await get('semaine'); assert.equal(find(d, 'courrier:1').urgency, 'week', 'relance la semaine prochaine');
            await post('semaine_mark', { op: 'restore', key: 'courrier:1', prev: r.json.prev });
            d = await get('semaine'); assert.equal(find(d, 'courrier:1').urgency, 'late');
            r = await post('semaine_mark', { op: 'snooze', key: 'hypo:1', until: 'tomorrow', title: 'h' });
            d = await get('semaine'); assert.ok(!find(d, 'hypo:1')); assert.equal(d.counts.snoozed, 1);
            await post('semaine_mark', { op: 'restore', key: 'hypo:1', prev: r.json.prev });
            d = await get('semaine'); assert.ok(find(d, 'hypo:1')); assert.equal(d.counts.snoozed, 0);
        });
        await t('clés forgées, report inconnu, valeurs d’annulation forgées, CSRF : refusés', async () => {
            for (const key of ['rappel:x:1', 'courrier:abc', "piste:1;DROP TABLE persons", 'autre:1', '']) {
                const r = await post('semaine_mark', { op: 'done', key });
                assert.ok(r.json.error, `${key} : ${JSON.stringify(r.json)}`);
            }
            assert.ok((await post('semaine_mark', { op: 'snooze', key: 'piste:1', until: 'jamais' })).json.error);
            await post('semaine_mark', { op: 'restore', key: 'piste:1', prev: { status: "x' OR 1=1" } });
            assert.equal(php("echo $pdo->query('SELECT status FROM investigation_items WHERE id=1')->fetchColumn();"), 'to_explore_priority');
            await post('semaine_mark', { op: 'restore', key: 'rappel:s:3', prev: { due: 'pas une date' } });
            assert.notEqual(php("echo $pdo->query('SELECT reminder_due_at FROM standalone_reminders WHERE id=3')->fetchColumn();"), 'pas une date');
            const bad = await post('semaine_mark', { op: 'done', key: 'rappel:s:3' }, 'mauvais-jeton');
            assert.ok(bad.status >= 400 || bad.json.error, 'CSRF');
            assert.equal(php("echo $pdo->query('SELECT reminder_done FROM standalone_reminders WHERE id=3')->fetchColumn();"), '0');
        });

        // ── navigateur ──
        let pw = null; try { pw = require('/opt/node22/lib/node_modules/playwright'); } catch (_) { try { pw = require('playwright'); } catch (__) { pw = null; } }
        if (!pw) { console.log('— Playwright absent : partie navigateur sautée'); }
        else {
            const browser = await pw.chromium.launch();
            const errors = [];
            const watch = (p, name) => { p.on('pageerror', e => errors.push(`${name} : ${e.message}`)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errors.push(`${name} console : ${m.text()}`); }); };
            const widgets = JSON.stringify({ widgets: [{ id: 'w_sem', type: 'daily_research', width: '12', limit: 3, config: {} }] });
            for (const [name, vp, dark] of [['1440', { width: 1440, height: 1000 }, false], ['390', { width: 390, height: 860 }, false], ['sombre', { width: 1440, height: 1000 }, true]]) {
                await t(`navigateur ${name} : le widget, ✓ + ↶ Annuler, ⏭, ⛶, K2`, async () => {
                    const ctx = await browser.newContext({ viewport: vp, colorScheme: dark ? 'dark' : 'light' });
                    await ctx.addInitScript(w => { try { localStorage.setItem('genealogie-dashboard-blocks', w); localStorage.setItem('genealogie-last-route', '#tableau-de-bord'); } catch (_) {} }, widgets);
                    const p = await ctx.newPage(); watch(p, name);
                    await p.goto(S.base);
                    await p.waitForFunction(() => window.LCNDA_APP?.state && window.LCNDA_EXT?.semaine, null, { timeout: 20000 });
                    if (dark) await p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
                    await p.evaluate(async w => { const A = window.LCNDA_APP; A.saveDashboardBlockSettings(JSON.parse(w)); if (A.state.module !== 'dashboard') await A.setModule('dashboard'); else await A.renderDashboard(); }, widgets);
                    await p.waitForSelector('.dashboard-widget[data-widget-type="daily_research"] .msr-row', { timeout: 20000 });
                    const card = p.locator('.dashboard-widget[data-widget-type="daily_research"]');
                    assert.match(await card.locator('h3').innerText(), /Ma semaine de recherche/);
                    const secs = await card.locator('.msr-sec').evaluateAll(els => els.map(e => e.dataset.msrSec));
                    assert.deepEqual(secs.slice(0, 4), ['late', 'today', 'week', 'later'], secs.join(','));
                    assert.ok(await card.locator('.msr-counts .ui-badge').count() >= 4, 'compteurs');
                    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `semaine-widget-${name}.png`), fullPage: false });
                    // ✓ fait puis ↶ Annuler
                    const row = card.locator('.msr-row[data-msr-key="rappel:s:1"]');
                    await row.locator('[data-msr-done]').click();
                    await p.waitForSelector('.msr-row[data-msr-key="rappel:s:1"]', { state: 'detached' });
                    await p.locator('#toast-region button', { hasText: 'Annuler' }).first().click();
                    await p.waitForSelector('.dashboard-widget .msr-row[data-msr-key="rappel:s:1"]', { timeout: 10000 });
                    // ⏭ À demain puis ↶ Annuler
                    await card.locator('.msr-row[data-msr-key="hypo:1"]').evaluate(r => { r.hidden = false; });
                    await card.locator('.msr-row[data-msr-key="hypo:1"] [data-msr-snooze]').click();
                    await p.locator('.ui-actmenu button', { hasText: 'À demain' }).first().click();
                    await p.waitForSelector('.dashboard-widget .msr-row[data-msr-key="hypo:1"]', { state: 'detached' });
                    await p.locator('#toast-region button', { hasText: 'Annuler' }).first().click();
                    await p.waitForFunction(() => window.LCNDA_EXT.semaine && document.querySelector('.dashboard-widget .msr-row[data-msr-key="hypo:1"]'), null, { timeout: 10000 });
                    // Voir les suivants
                    const more = card.locator('.msr-more').first();
                    if (await more.count()) { const before = await card.locator('.msr-row:not([hidden])').count(); await more.click(); assert.ok(await card.locator('.msr-row:not([hidden])').count() > before); }
                    // ⛶ en grand
                    await card.locator('[data-msr-big]').click();
                    await p.waitForSelector('dialog.msr-big .msr-row');
                    const pills = await p.locator('dialog.msr-big [data-msr-filter]').allInnerTexts();
                    assert.ok(pills[0].startsWith('Tout ('), pills.join(' | '));
                    await p.locator('dialog.msr-big [data-msr-filter="courrier"]').click();
                    assert.equal(await p.locator('dialog.msr-big .msr-row').evaluateAll(r => r.every(x => /^courrier:/.test(x.dataset.msrKey))), true);
                    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `semaine-grand-${name}.png`) });
                    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
                    assert.equal(overflow, false, 'pas de défilement horizontal');
                    await p.locator('dialog.msr-big .modal-actions [data-x]').click();
                    // réglage K2 : Aujourd'hui, Par sorte, sans « À chercher »
                    await card.locator('[data-edit-dashboard-widget]').click();
                    const ed = p.locator('.dashboard-widget[data-widget-type="daily_research"] [data-dashboard-widget-editor]');
                    await ed.locator('label', { hasText: 'Aujourd’hui' }).click();
                    await ed.locator('label', { hasText: 'Par sorte' }).click();
                    await ed.locator('[data-msr-sort="manque"]').uncheck();
                    await ed.locator('[data-msr-sort-row="verifier"] [data-msr-up]').evaluate(b => b.click()); // à la souris : ⠿ (les flèches restent au doigt, K20)
                    const cfg = await p.evaluate(() => window.LCNDA_APP.dashboardBlockSettings().widgets.find(w => w.id === 'w_sem').config);
                    assert.equal(cfg.horizon, 'today'); assert.equal(cfg.group, 'sorte'); assert.deepEqual(cfg.hiddenSorts, ['manque']);
                    assert.ok(cfg.sortOrder.indexOf('verifier') < cfg.sortOrder.indexOf('manque'), cfg.sortOrder.join(','));
                    assert.equal(await ed.locator('.msr-saved').isVisible(), true, '✓ Enregistré');
                    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `semaine-reglage-${name}.png`) });
                    await ed.locator('[data-msr-cfg-close]').click();
                    await p.waitForSelector('.dashboard-widget[data-widget-type="daily_research"] .msr-sec[data-msr-sec="rappel"]');
                    const secs2 = await card.locator('.msr-sec').evaluateAll(els => els.map(e => e.dataset.msrSec));
                    assert.ok(!secs2.includes('manque') && !secs2.includes('late'), secs2.join(','));
                    assert.equal(await card.locator('.msr-row.is-week').count(), 0, 'aujourd’hui : rien de « cette semaine »');
                    // ↺ Remettre comme au départ
                    await card.locator('[data-edit-dashboard-widget]').click();
                    await ed.locator('[data-msr-cfg-reset]').click();
                    await p.waitForFunction(() => !Object.keys(window.LCNDA_APP.dashboardBlockSettings().widgets.find(w => w.id === 'w_sem').config || {}).length);
                    await p.locator('.dashboard-widget[data-widget-type="daily_research"] [data-msr-cfg-close]').click();
                    await p.waitForSelector('.dashboard-widget[data-widget-type="daily_research"]:not(.is-editing) .msr-sec[data-msr-sec="late"]');
                    // 🧩 une chose à la fois
                    await p.evaluate(() => document.documentElement.classList.add('a11y-simple'));
                    await p.evaluate(() => window.LCNDA_EXT.semaine.refresh());
                    await p.waitForSelector('.dashboard-widget .msr-focus');
                    assert.equal(await p.locator('.dashboard-widget .msr-focus').getAttribute('data-msr-key'), 'courrier:1', 'la plus urgente d’abord');
                    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `semaine-une-chose-${name}.png`) });
                    await p.evaluate(() => document.documentElement.classList.remove('a11y-simple'));
                    // le même widget sur la page du Suivi
                    if (name === '1440') {
                        await p.evaluate(() => { const A = window.LCNDA_APP; A.dashboardSpaceDo('suivi', () => { const s = A.dashboardBlockSettings(); s.widgets = [A.dashboardNewWidget('daily_research', {width: '12'})]; A.saveDashboardBlockSettings(s); }); A.setModule('suivi'); });
                        await p.waitForSelector('.sv-page .dashboard-widget[data-widget-type="daily_research"] .msr-row', { timeout: 20000 });
                        if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'semaine-suivi-1440.png') });
                    }
                    await ctx.close();
                });
            }
            await browser.close();
            await t('aucune erreur JavaScript', async () => { assert.deepEqual(errors, []); });
        }
    } finally {
        S.proc.kill();
        fs.rmSync(tmp, { recursive: true, force: true });
    }
    if (failed) { console.error(`\n${failed} échec(s)`); process.exit(1); }
    console.log('\nTout est bon.');
})();
