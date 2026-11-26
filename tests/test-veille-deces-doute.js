#!/usr/bin/env node
/* ⚰️ Décès possibles : 👤 ouvrir la fiche (et revenir au même endroit), 🤔 « J'ai un doute » (reste dans la liste, « Vu le … — à revoir »,
 * note, ↩ Plus de doute, ↶, pastilles Tous · À trancher · 🤔 À revoir), la source INSEE cliquable du décès confirmé (citation_json.view_url,
 * ↗ sur la fiche, « source : INSEE ↗ » dans le message, ↶ l'enlève), la reprise des décès déjà confirmés (une fois, sans doublon).
 * Même petite base INSEE que tests/test-veille-deces.js.   node tests/test-veille-deces-doute.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const {spawn, spawnSync} = require('child_process');
const root = path.join(__dirname, '..');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    /* ═════════ 1. la base de l'essai ═════════ */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-vd-'));
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
    const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$y = (int) date('Y');
// 1 Jeanne LACOMBE, vivante, née le 12 mars 1935 à Tulle · 2 Paul MAZAUD, statut inconnu, né le 2 juin 1950 à Brive · 3 Pierre DURAND, vivant, né en 1980
// 4 Marie DURAND, décédée (décès noté) · 5 Louise LACOMBE née en 1900 (plus de 110 ans) · 6 Jean LACOMBE, vivant, né en 1960
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jeanne','LACOMBE','female','living',1),(2,'Paul','MAZAUD','male','unknown',0),(3,'Pierre','DURAND','male','living',0),(4,'Marie','DURAND','female','deceased',0),(5,'Louise','LACOMBE','female','unknown',0),(6,'Jean','LACOMBE','male','living',0)");
$pdo->exec("INSERT INTO places(id,name,county,country,admin4_code) VALUES(1,'Tulle','Corrèze','France','19272'),(2,'Brive-la-Gaillarde','Corrèze','France','19031')");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$e = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)");
$e->execute([1,$t('BIRT'),'12 mars 1935',1935,'1935-03-12',1]); $e->execute([2,$t('BIRT'),'2 juin 1950',1950,'1950-06-02',2]); $e->execute([3,$t('BIRT'),'1980',1980,'1980',2]);
$e->execute([4,$t('BIRT'),'1940',1940,'1940',1]); $e->execute([4,$t('DEAT'),'2001',2001,'2001',1]); $e->execute([5,$t('BIRT'),'1900',1900,'1900',1]); $e->execute([6,$t('BIRT'),'1960',1960,'1960',1]);
// le fichier INSEE de l'essai : un « fichier » importé, quelques lignes
$pdo->exec("INSERT INTO insee_deces_imports(id,filename,row_count,inserted_count,max_annee_deces,min_annee_deces) VALUES(1,'deces-2026-m09.csv',6,6,2026,2026)");
$i = $pdo->prepare("INSERT INTO insee_deces(nom,prenom,prenoms,sexe,date_naissance,annee_naissance,code_lieu_naissance,commune_naissance,pays_naissance,date_deces,annee_deces,code_lieu_deces,commune_deces,numero_acte_deces,source_file,source_import_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)");
$i->execute(['LACOMBE','JEANNE','JEANNE MARIE','2','19350312',1935,'19272','TULLE','','20260903',2026,'19031','BRIVE-LA-GAILLARDE','512','deces-2026-m09.csv']);
$i->execute(['MAZEAUD','PAUL','PAUL ANDRE','1','19500602',1950,'19031','BRIVE-LA-GAILLARDE','','20260911',2026,'19031','BRIVE-LA-GAILLARDE','77','deces-2026-m09.csv']);
$i->execute(['DURAND','MARIE','MARIE','2','19400101',1940,'19272','TULLE','','20010101',2001,'19272','TULLE','3','deces-2026-m09.csv']);
$i->execute(['LACOMBE','LOUISE','LOUISE','2','19000101',1900,'19272','TULLE','','20260101',2026,'19272','TULLE','4','deces-2026-m09.csv']);
$i->execute(['LACOMBE','JEAN','JEAN','1','19620505',1962,'19272','TULLE','','20260505',2026,'19272','TULLE','5','deces-2026-m09.csv']);
$i->execute(['LACOMBE','JEANNE','JEANNE','2','19350312',1935,'19272','TULLE','','20260903',2026,'75056','PARIS','999','deces-2026-m09.csv']); // une deuxième ligne presque pareille (autre acte, à Paris) : une piste de plus, à trancher
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    function q(sql) { return JSON.parse(spawnSync(phpPath, ['-r', `$p=new PDO('sqlite:${path.join(tmp, 'genealogy.sqlite')}');echo json_encode($p->query(${JSON.stringify(sql)})->fetchAll(PDO::FETCH_ASSOC));`], {encoding: 'utf8'}).stdout || '[]'); }
    function x(sql) { const r = spawnSync(phpPath, ['-r', `$p=new PDO('sqlite:${path.join(tmp, 'genealogy.sqlite')}');$p->exec(${JSON.stringify(sql)});echo 'ok';`], {encoding: 'utf8'}); assert.strictEqual(r.stdout, 'ok', r.stderr); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultMaintenanceTabs, null, {timeout: 30000});
        const api = (a, qq = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [a, qq]);
        const post = (a, b = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, {}, {method: 'POST', body: z}).then(r => r.result || r).catch(e => ({error: e.message})), [a, b]);
        const toasts = () => p.evaluate(() => [...document.querySelectorAll('.ui-toast, .toast')].map(x => x.textContent).join(' | '));
        const openPage = async () => { await p.evaluate(async () => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'veille_deces'; await A.setModule('maintenance'); }); await p.waitForSelector('[data-vd-page]', {timeout: 20000}); await sleep(300); };
        const cardOf = name => p.evaluate(n => [...document.querySelectorAll('[data-vd-page] [data-vd-card]')].find(c => c.textContent.includes(n))?.dataset.vdCard, name);
        await p.evaluate(() => { localStorage.setItem('genealogie-veille-deces', '1'); localStorage.removeItem('lcnda-vd-filter'); localStorage.removeItem('genealogie-cadres'); });

        await t('serveur : vd_doubt pose le doute (date, note), la piste reste à trancher ; note seule ; prev ; off ; refusé sur une piste décidée', async () => {
            const r0 = await post('vd_auto'); assert.ok(r0.ran || r0.pending >= 0);
            const L = await api('vd_list'); const it = L.items.find(i => i.person.name === 'Paul MAZAUD'); assert.ok(it, JSON.stringify(L.items.map(i => i.person.name)));
            assert.strictEqual(it.doubt, null);
            const r = await post('vd_doubt', {id: it.id}); assert.strictEqual(r.ok, true); assert.deepStrictEqual(r.prev, {review: '', at: null, note: ''});
            assert.match(r.doubt.at, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
            const n = await post('vd_doubt', {id: it.id, note: '  le second prénom   diffère '}); assert.strictEqual(n.doubt.note, 'le second prénom diffère'); assert.strictEqual(n.doubt.at, r.doubt.at, 'la date ne bouge pas');
            const L2 = await api('vd_list'); const it2 = L2.items.find(i => i.id === it.id); assert.ok(it2, 'toujours dans la liste'); assert.strictEqual(it2.doubt.note, 'le second prénom diffère');
            assert.strictEqual(L2.pending, L.pending, 'compté dans le total');
            const off = await post('vd_doubt', {id: it.id, off: 1}); assert.strictEqual(off.doubt, null);
            const back = await post('vd_doubt', {id: it.id, prev: off.prev}); assert.strictEqual(back.doubt.note, 'le second prénom diffère'); assert.strictEqual(back.doubt.at, r.doubt.at, '↶ remet la même date');
            assert.match((await post('vd_doubt', {id: it.id, prev: {review: 'nimporte'}})).error || '', /État inconnu/);
            await post('vd_doubt', {id: it.id, off: 1});
            assert.match((await post('vd_doubt', {id: 999999})).error || '', /introuvable/);
        });

        await t('écran : ✓ · 🤔 · ✗ dans cet ordre ; 🤔 → « Vu le JJ/MM/AAAA — à revoir », petite note sur place, reste après rechargement ; pastilles ; ↶ ; ↩ Plus de doute', async () => {
            await openPage();
            const id = await cardOf('Paul MAZAUD'); assert.ok(id);
            const order = await p.$eval(`[data-vd-card="${id}"] .vd-acts`, el => [...el.querySelectorAll('button')].map(b => b.matches('[data-vd-yes]') ? 'yes' : b.matches('[data-vd-doubt]') ? 'doubt' : b.matches('[data-vd-no]') ? 'no' : '?'));
            assert.deepStrictEqual(order, ['yes', 'doubt', 'no']);
            assert.strictEqual(await p.$eval(`[data-vd-card="${id}"] .vd-acts`, el => getComputedStyle(el).columnGap), '9px');
            await p.click(`[data-vd-doubt="${id}"]`);
            await p.waitForSelector(`[data-vd-card="${id}"] .vd-doubt-badge`);
            const d = new Date(), dd = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
            assert.strictEqual((await p.textContent(`[data-vd-card="${id}"] .vd-doubt-badge`)).trim(), `🤔 Vu le ${dd} — à revoir`);
            assert.match(await toasts(), /Notée « à revoir »/);
            await p.waitForSelector(`[data-vd-note="${id}"]`); assert.strictEqual(await p.$$eval('dialog[open]', l => l.length), 0, 'pas de fenêtre : un petit champ');
            await p.fill(`[data-vd-note="${id}"]`, 'prénom à vérifier'); await p.press(`[data-vd-note="${id}"]`, 'Enter');
            await p.waitForFunction(i => document.querySelector(`[data-vd-card="${i}"] .vd-doubt-text`)?.textContent === 'prénom à vérifier', id);
            await p.reload(); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultMaintenanceTabs, null, {timeout: 30000});
            await openPage();
            assert.match(await p.textContent(`[data-vd-card="${id}"]`), /Vu le .* — à revoir.*prénom à vérifier/s, 'toujours là après rechargement');
            // pastilles
            const chips = await p.$$eval('[data-vd-filter]', l => l.map(b => b.textContent.replace(/\s+/g, ' ').trim()));
            const total = await p.$$eval('[data-vd-page] .maintenance-panel:nth-of-type(2) > .ui-person-cards [data-vd-card], [data-vd-page] [data-vd-card]:not(details [data-vd-card])', l => l.length);
            assert.deepStrictEqual(chips, [`Tous (${total})`, `À trancher (${total - 1})`, '🤔 À revoir (1)']);
            await p.click('[data-vd-filter="doubt"]'); await sleep(400);
            assert.deepStrictEqual(await p.$$eval('[data-vd-page] [data-vd-card]:not(details [data-vd-card])', l => l.map(c => c.dataset.vdCard)), [id]);
            await p.click('[data-vd-filter="todo"]'); await sleep(400);
            assert.ok(!(await p.$$eval('[data-vd-page] [data-vd-card]:not(details [data-vd-card])', l => l.map(c => c.dataset.vdCard))).includes(id));
            await p.click('[data-vd-filter="all"]'); await sleep(400);
            // ↩ Plus de doute, puis ↶
            await p.click(`[data-vd-doubt="${id}"][data-vd-doubt-off]`);
            await p.waitForFunction(i => !document.querySelector(`[data-vd-card="${i}"] .vd-doubt-badge`), id);
            await p.locator('.ui-toast, .toast').filter({hasText: 'Plus de doute sur cette piste'}).last().locator('button', {hasText: 'Annuler'}).click();
            for (let i = 0; i < 40 && q(`SELECT review FROM vd_pistes WHERE id=${id}`)[0]?.review !== 'doubt'; i++) await sleep(250);
            assert.strictEqual(q(`SELECT review, review_note FROM vd_pistes WHERE id=${id}`)[0].review_note, 'prénom à vérifier', '↶ remet le doute et sa note');
            await p.waitForFunction(i => /prénom à vérifier/.test(document.querySelector(`[data-vd-card="${i}"] .vd-doubt`)?.textContent || ''), id, {timeout: 10000});
            // re-cliquer enlève aussi
            await p.click(`[data-vd-doubt="${id}"]`); await p.waitForFunction(i => !document.querySelector(`[data-vd-card="${i}"] .vd-doubt-badge`), id);
        });

        await t('👤 Ouvrir la fiche (en tête du cadre) → la fiche ; revenir → même filtre, même position dans la page', async () => {
            await p.setViewportSize({width: 1440, height: 420});
            await openPage();
            await p.click('[data-vd-filter="all"]'); await sleep(300);
            const pid = await p.$eval('[data-vd-page] .ui-person-card [data-vd-fiche]', b => b.dataset.vdFiche);
            assert.strictEqual(await p.$$eval('[data-vd-page] .ui-person-card-head [data-vd-fiche]', l => l.length) > 0, true, 'le bouton est dans l’en-tête du cadre');
            await p.mouse.move(900, 300); await p.mouse.wheel(0, 900); await sleep(700); // on fait défiler soi-même, à la molette
            const y0 = await p.evaluate(() => Math.max(document.scrollingElement.scrollTop, document.getElementById('workspace').scrollTop));
            assert.ok(y0 > 50, 'la page a défilé : ' + y0);
            await p.evaluate(() => { const el = [...document.querySelectorAll('[data-vd-page] [data-vd-fiche]')]; const r = el.find(b => { const x = b.getBoundingClientRect(); return x.top > 0 && x.bottom < innerHeight; }) || el[el.length - 1]; r.click(); });
            await p.waitForFunction(() => window.LCNDA_APP.state.module === 'personnes' && document.querySelector('.person-page h2'), null, {timeout: 20000});
            await p.goBack().catch(() => {});
            let back = await p.waitForFunction(() => document.querySelector('[data-vd-page]'), null, {timeout: 6000}).then(() => true).catch(() => false);
            if (!back) await openPage(); // revenir par le menu
            await p.waitForSelector('[data-vd-page] [data-vd-card]'); await sleep(500);
            await sleep(1500); // l'app remet la place pendant que l'écran se dessine : on regarde une fois posé
            const y1 = await p.evaluate(() => Math.max(document.scrollingElement.scrollTop, document.getElementById('workspace').scrollTop));
            assert.ok(Math.abs(y1 - y0) < 40, `même position : ${y0} → ${y1}`);
            void pid;
            await p.setViewportSize({width: 1440, height: 900});
        });

        await t('✓ C’est lui : « source : INSEE ↗ » dans le message ; la fiche montre la source INSEE et ↗ le lien de la fiche INSEE ; ↶ enlève tout', async () => {
            await openPage();
            const id = await cardOf('Paul MAZAUD');
            await p.click(`[data-vd-yes="${id}"]`);
            await p.waitForSelector('[data-vd-toast-src]', {timeout: 10000});
            const a = await p.$eval('[data-vd-toast-src]', a => ({href: a.href, rel: a.rel, target: a.target, txt: a.closest('.ui-toast, .toast').textContent}));
            assert.match(a.href, /^https:\/\/deces\.matchid\.io\/search\?q=PAUL%20MAZEAUD%201950$/); assert.match(a.rel, /noopener/); assert.strictEqual(a.target, '_blank');
            assert.match(a.txt, /Décès ajouté à la fiche — source : INSEE ↗/);
            const sl = q(`SELECT sl.citation_json FROM vd_pistes v JOIN source_links sl ON sl.id=v.source_link_id WHERE v.id=${id}`)[0];
            assert.deepStrictEqual(JSON.parse(sl.citation_json), {view_url: 'https://deces.matchid.io/search?q=PAUL%20MAZEAUD%201950'});
            await p.evaluate(() => window.LCNDA_APP.openPersonById(2));
            await p.waitForFunction(() => window.LCNDA_APP.state.currentPerson?.person?.id === 2 && document.querySelector('.person-page h2'), null, {timeout: 20000});
            await p.waitForSelector('.source-item .source-view a', {timeout: 10000});
            const s = await p.$$eval('.source-item', l => l.filter(x => /INSEE/.test(x.textContent)).map(x => ({title: x.querySelector('h4 a')?.href, view: x.querySelector('.source-view a')?.href, rel: x.querySelector('.source-view a')?.rel})));
            assert.ok(s.length >= 1, 'la source INSEE est sur la fiche');
            assert.match(s[0].title, /^https:\/\/www\.data\.gouv\.fr\/fr\/datasets\/fichier-des-personnes-decedees\/$/, 'le fichier (data.gouv.fr) sur la source');
            assert.match(s[0].view, /^https:\/\/deces\.matchid\.io\/search\?q=/); assert.match(s[0].rel, /noopener/);
            await p.click('.ui-toast:has-text("Décès ajouté") button:has-text("Annuler"), .toast:has-text("Décès ajouté") button:has-text("Annuler")');
            for (let i = 0; i < 40 && q(`SELECT status FROM vd_pistes WHERE id=${id}`)[0].status !== 'new'; i++) await sleep(250);
            assert.strictEqual(q(`SELECT count(*) n FROM source_links sl JOIN sources s ON s.id=sl.source_record_id WHERE s.title LIKE '%INSEE%'`)[0].n, 0, '↶ : la citation est partie ' + await toasts());
            assert.strictEqual(q(`SELECT status FROM vd_pistes WHERE id=${id}`)[0].status, 'new');
        });

        await t('les décès déjà confirmés avant : citation_json rempli d’après la note, une seule fois, sans toucher une citation déjà remplie', async () => {
            const id = (await api('vd_list')).items.find(i => i.person.name === 'Paul MAZAUD').id;
            const c = await post('vd_confirm', {id}); assert.strictEqual(c.ok, true, JSON.stringify(c));
            const link = q(`SELECT source_link_id FROM vd_pistes WHERE id=${id}`)[0].source_link_id;
            x(`UPDATE source_links SET citation_json='' WHERE id=${link}`); x(`DELETE FROM vd_state WHERE k='citations_v1'`);
            const run = () => spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require 'lib/paths.php'; require 'lib/bootstrap.php'; require_once 'lib/veille_deces.php'; $pdo = db(); vd_tables($pdo); echo json_encode([vd_fill_citations($pdo)]);`], {cwd: root, encoding: 'utf8', env});
            const r1 = run(); assert.strictEqual(r1.status, 0, r1.stderr);
            assert.deepStrictEqual(JSON.parse(q(`SELECT citation_json FROM source_links WHERE id=${link}`)[0].citation_json), {view_url: 'https://deces.matchid.io/search?q=PAUL%20MAZEAUD%201950'});
            assert.deepStrictEqual(JSON.parse(r1.stdout.trim().split('\n').pop()), [0], 'une deuxième fois : rien à faire');
            assert.strictEqual(q(`SELECT v FROM vd_state WHERE k='citations_v1'`)[0].v, '1');
            x(`UPDATE source_links SET citation_json='{"view_url":"https://example.org/a"}' WHERE id=${link}`); x(`DELETE FROM vd_state WHERE k='citations_v1'`);
            run(); assert.strictEqual(JSON.parse(q(`SELECT citation_json FROM source_links WHERE id=${link}`)[0].citation_json).view_url, 'https://example.org/a', 'une citation déjà remplie est gardée');
            await post('vd_undo', {id});
        });

        await t('mode consultation : pas de bouton 🤔 (vd_doubt est une écriture : kiosk_blocks la refuse)', async () => {
            assert.ok(/kiosk_blocks/.test(fs.readFileSync(path.join(root, 'lib/heritage_tools.php'), 'utf8')));
            await openPage();
            await p.evaluate(() => document.body.classList.add('is-kiosk')); await openPage();
            assert.strictEqual(await p.$$eval('[data-vd-page] [data-vd-doubt]', l => l.length), 0);
            await p.evaluate(() => document.body.classList.remove('is-kiosk'));
        });
        await t('pas d’erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
