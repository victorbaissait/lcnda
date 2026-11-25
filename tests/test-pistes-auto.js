#!/usr/bin/env node
/* 🔎 Pistes automatiques pour tout l'arbre (lib/pistes_auto.php, assets/js/heritage-pistes-auto.js, assets/css/pistes-branches-celebres.css).
 * Open Archives est remplacé par des réponses enregistrées (tests/fixtures/pistes-auto/, forme réelle de l'API, noms fictifs ;
 * GENEALOGY_TEST=1 + LCNDA_TEST_OPENARCH_DIR, comme tests/test-ou-chercher*.js) ; le fichier des décès INSEE est une table locale.
 *  1. serveur : la recherche pas à pas (une question réseau par pas, attente demandée), la note expliquée (nom, prénom, dates,
 *     lieu, parents lus dans l'acte), rien d'envoyé pour une personne vivante, confidentielle ou « peut-être vivante » ;
 *     ✓ Rattacher (source, événement « à vérifier ») et ↶ ; ✗ Pas lui retenu (ne revient pas) et ↶ ; le cache (relancer = 0 requête) ;
 *  2. écran : Listes → « 🔎 Pistes à vérifier » (lancer, barre d'avancée, ⏸ / ▶, ✗ Pas lui et ↶), bloc de la fiche, widget.
 *   node tests/test-pistes-auto.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const {spawn, spawnSync} = require('child_process');
const root = path.join(__dirname, '..');
let fails = 0;
const ONLY = process.env.PST_ONLY ? new RegExp(process.env.PST_ONLY) : null;
const t = async (name, fn) => { if (ONLY && !ONLY.test(name)) return; const t0 = Date.now(); try { await fn(); console.log('✓ ' + name + (process.env.PST_TIME ? ` (${Date.now() - t0} ms)` : '')); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FX = path.join(__dirname, 'fixtures/pistes-auto');

(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-pst-')), net0 = path.join(tmp, 'net');
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true}); fs.cpSync(FX, net0, {recursive: true});
    const calls = () => { try { return fs.readFileSync(path.join(net0, 'calls.log'), 'utf8').trim().split('\n').filter(Boolean); } catch (_) { return []; } };
    let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
    const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1', LCNDA_TEST_OPENARCH_DIR: net0};
    const php = code => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], {cwd: root, encoding: 'utf8', env}); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout; };
    const q = sql => JSON.parse(php(`$p=new PDO('sqlite:${path.join(tmp, 'genealogy.sqlite')}');echo json_encode($p->query(${JSON.stringify(sql)})->fetchAll(PDO::FETCH_ASSOC));`) || '[]');
    php(String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start,is_private) VALUES
 (1,'Jan','MAZAUD','male','deceased',1,0),(2,'Pieter','MAZAUD','male','deceased',0,0),(3,'Maria','LACOMBE','female','deceased',0,0),(8,'Hendrik','MAZAUD','male','deceased',0,0),
 (4,'Paul','DURAND','male','living',0,0),(5,'Anne','LACOMBE','female','deceased',0,1),(6,'Louis','DURAND','male','unknown',0,0),(7,'Marcel','MAZAUD','male','unknown',0,0)");
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,2,3),(2,8,NULL)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,1),(2,2)");
$pdo->exec("INSERT INTO places(id,name,country) VALUES(1,'Leiden','Pays-Bas'),(2,'Tulle, Corrèze','France')");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES('person',?,?,?,?,?)");
$ins->execute([1,$t('BIRT'),'1850',1850,1]); $ins->execute([2,$t('BIRT'),'1820',1820,1]); $ins->execute([3,$t('BIRT'),'1824',1824,1]); $ins->execute([8,$t('BIRT'),'1790',1790,1]);
$ins->execute([4,$t('BIRT'),'1980',1980,1]); $ins->execute([5,$t('BIRT'),'1850',1850,1]); $ins->execute([5,$t('DEAT'),'1920',1920,1]); $ins->execute([6,$t('BIRT'),'1950',1950,1]);
$ins->execute([7,$t('BIRT'),'12 mars 1905',1905,2]);
$pdo->exec("INSERT INTO insee_deces(nom,prenom,prenoms,sexe,date_naissance,annee_naissance,code_lieu_naissance,commune_naissance,pays_naissance,date_deces,annee_deces,code_lieu_deces,commune_deces,numero_acte_deces)
 VALUES('MAZAUD','MARCEL','MARCEL JEAN','1','19050312',1905,'19272','TULLE','','19800704',1980,'19031','BRIVE-LA-GAILLARDE','512'),
       ('MAZAUD','ROGER','ROGER','1','19050101',1905,'19272','TULLE','','19700101',1970,'19272','TULLE','3')");
echo 'ok';`);
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const p = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultPersonBlocks, null, {timeout: 30000});
        if (!await p.evaluate(() => !!window.LCNDA_EXT?.pistesAuto)) { // index.php ne charge pas encore ces fichiers : on les ajoute (comme le feront les balises)
            await p.addStyleTag({url: base + 'assets/css/pistes-branches-celebres.css'});
            await p.addScriptTag({url: base + 'assets/js/heritage-pistes-auto.js'});
        }
        const api = (x, qq = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, qq]);
        const post = (x, b) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, {}, {method: 'POST', body: z}).then(r => r.result ?? r).catch(e => ({error: e.message})), [x, b]);
        const undo = async re => {
            await p.waitForFunction(src => [...document.querySelectorAll('.ui-toast, .toast')].some(x => new RegExp(src).test(x.textContent)), re.source, {timeout: 10000});
            const h = await p.evaluateHandle(src => { const box = [...document.querySelectorAll('.ui-toast, .toast')].reverse().find(x => new RegExp(src).test(x.textContent)); return [...(box ? box.querySelectorAll('button') : [])].find(b => /Annuler/.test(b.textContent)); }, re.source);
            await h.asElement().click();
        };
        const runAll = async id => { let r, n = 0, waits = []; do { r = await post('pistes_step', {id}); waits.push(r.wait_ms); n++; } while (r.job.status === 'running' && n < 60); return {r, n, waits}; };
        const list = async (qq = {}) => (await api('pistes_list', qq)).rows;

        /* ═════════ 1. le serveur ═════════ */
        let first;
        await t('pistes_start + pistes_step (tout l’arbre) : une question réseau par pas, ~2 s d’attente demandées entre deux', async () => {
            const s = await post('pistes_start', {scope: 'all', sources: ['oa', 'insee', 'mpf', 'leonore', 'annuaire']});
            assert.strictEqual(s.job.total, 8); assert.strictEqual(s.job.status, 'running');
            first = await runAll(s.job.id);
            assert.strictEqual(first.r.job.status, 'done'); assert.strictEqual(first.r.job.pos, 8);
            const net = first.r.job.counts.net;
            assert.ok(net >= 5, `${net} questions`); assert.ok(first.waits.filter(w => w >= 2000).length >= net - 1, `une attente après chaque question réseau : ${JSON.stringify(first.waits)} net=${net}`);
            assert.strictEqual(first.r.job.counts.private, 3, 'Paul (vivant), Anne (confidentielle), Louis (né en 1950, sans décès)');
        });
        await t('rien n’est envoyé pour une personne vivante, confidentielle ou peut-être vivante ; un nom et une période seulement', async () => {
            const c = calls().filter(l => l.startsWith('records/search.json'));
            assert.ok(c.length >= 4);
            assert.ok(!c.some(l => /DURAND|Anne|Louis/.test(decodeURIComponent(l.replace(/\+/g, ' ')))), c.join('\n'));
            assert.ok(c.some(l => decodeURIComponent(l.replace(/\+/g, ' ')).includes('"Jan MAZAUD" 1848-')));
        });
        await t('la note expliquée : naissance de Jan (nom, prénom, année, lieu, père et mère lus dans l’acte) ≥ 90 %', async () => {
            const rows = await list({person_id: 1});
            const b = rows.find(r => r.key === 'ela:0A1B2C3D-0000-4000-8000-000000000001');
            assert.ok(b, JSON.stringify(rows.map(r => r.title)));
            assert.ok(b.score >= 90, String(b.score)); assert.strictEqual(b.src, 'oa'); assert.strictEqual(b.tag, 'BIRT');
            const why = b.why.map(w => w.join(' ')).join(' | ');
            for (const re of [/ok même nom/, /ok même prénom \(Jan\)/, /ok né\(e\) la même année \(1850\)/, /ok même lieu \(Leiden\)/, /ok même père : Pieter Mazaud/, /ok même mère : Maria Lacombe/]) assert.match(why, re);
            assert.strictEqual(b.url, 'https://www.openarchieven.nl/ela:0A1B2C3D-0000-4000-8000-000000000001/fr');
            assert.match(b.archive, /Leyde/); assert.match(b.licence, /CC0/);
            assert.ok(rows.some(r => r.tag === 'DEAT' && r.score >= 70), 'son décès de 1910 (sa fiche n’en a pas)');
            assert.ok(!rows.some(r => /1702|Klaas/.test(r.title)), 'ni le baptême de 1702 (avant sa vie) ni Klaas (autre prénom)');
        });
        await t('les parents lus dans l’acte peuvent aussi faire baisser la note (✗ père : Gerrit, sa fiche : Hendrik)', async () => {
            const m = (await list({person_id: 2})).find(r => r.tag === 'MARR');
            assert.ok(m); const why = m.why.map(w => w.join(' ')).join(' | ');
            assert.match(why, /no père : Gerrit Mazaud \(sa fiche : Hendrik MAZAUD\)/); assert.ok(m.score < 80 && m.score >= 55, String(m.score));
        });
        await t('⚰️ Décès INSEE : Marcel MAZAUD né en 1905 à Tulle (même lieu de naissance) ; pas Roger', async () => {
            const r = await list({person_id: 7});
            assert.strictEqual(r.length, 1); assert.strictEqual(r[0].src, 'insee'); assert.ok(r[0].score >= 90);
            assert.match(r[0].title, /Décès — Marcel Jean MAZAUD, 4\/07\/1980, BRIVE-LA-GAILLARDE/); assert.match(r[0].why.map(w => w[1]).join(' '), /même lieu de naissance \(TULLE\)/);
            assert.match(r[0].url, /^https:\/\/deces\.matchid\.io\/search\?q=/); assert.match(r[0].licence, /Licence Ouverte/);
        });
        await t('✓ Rattacher (source + décès « à vérifier ») puis ↶ : tout est retiré', async () => {
            const d = (await list({person_id: 1})).find(r => r.tag === 'DEAT');
            const a = await post('pistes_accept', {id: d.id, mode: 'event'});
            assert.ok(a.ok, JSON.stringify(a)); assert.match(a.notes.join(' '), /événement ajouté/);
            let ev = q("SELECT e.fact_confidence, e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=1 AND t.gedcom_tag='DEAT'");
            assert.deepStrictEqual(ev, [{fact_confidence: 'doubt', year: 1910}]);
            assert.strictEqual(q("SELECT count(*) n FROM sources WHERE url LIKE '%openarchieven%'")[0].n, 1);
            assert.strictEqual((await list({person_id: 1, status: 'added'})).length, 1);
            await post('pistes_undo', {id: d.id});
            ev = q("SELECT e.id FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=1 AND t.gedcom_tag='DEAT'");
            assert.deepStrictEqual(ev, []); assert.strictEqual(q("SELECT count(*) n FROM sources")[0].n, 0);
            assert.ok((await list({person_id: 1})).some(r => r.id === d.id), 'la piste redevient « à vérifier »');
        });
        await t('⚰️ ✓ Rattacher une piste INSEE avec le décès, puis ↶', async () => {
            const r = (await list({person_id: 7}))[0];
            const a = await post('pistes_accept', {id: r.id, mode: 'event'}); assert.ok(a.ok);
            assert.strictEqual(q("SELECT count(*) n FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=7 AND t.gedcom_tag='DEAT' AND e.fact_confidence='doubt'")[0].n, 1);
            assert.match(q('SELECT text FROM sources')[0].text, /Licence Ouverte 2\.0/);
            await post('pistes_undo', {id: r.id});
            assert.strictEqual(q("SELECT count(*) n FROM events WHERE person_id=7")[0].n, 1, 'seulement sa naissance');
        });
        await t('✗ Pas lui : retenu (et noté dans « Où chercher »), ne revient pas en relançant ; le cache évite toute nouvelle question', async () => {
            const m = (await list({person_id: 2})).find(r => r.tag === 'MARR');
            await post('pistes_reject', {id: m.id});
            assert.strictEqual(q(`SELECT verdict FROM ouc_oa_marks WHERE person_id=2 AND rec_key='${m.key}'`)[0].verdict, 'no');
            const before = calls().length;
            const s = await post('pistes_start', {scope: 'all', sources: ['oa', 'insee']});
            const again = await runAll(s.job.id);
            assert.strictEqual(again.r.job.counts.net, 0, 'tout vient du cache (30 jours)');
            assert.strictEqual(calls().length, before);
            assert.ok(!(await list({person_id: 2})).some(r => r.id === m.id));
            assert.strictEqual((await list({person_id: 2, status: 'no'})).length, 1);
            await post('pistes_unreject', {id: m.id});
            assert.ok((await list({person_id: 2})).some(r => r.id === m.id));
        });
        await t('une personne vivante : pistes_start pour elle seule ne regarde rien', async () => {
            const s = await post('pistes_start', {scope: 'person:4', sources: ['oa', 'insee']});
            const r = await runAll(s.job.id);
            assert.strictEqual(r.r.job.counts.private, 1); assert.strictEqual(r.r.job.counts.net, 0); assert.strictEqual((await list({person_id: 4, status: 'all'})).length, 0);
        });

        /* ═════════ 2. l'écran ═════════ */
        await t('Listes → 🔎 Pistes à vérifier : la liste (note, pourquoi, ↗ voir l’acte), filtre par source', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'data_pistes'; A.setModule('listes'); });
            await p.waitForSelector('[data-pst-list] .pst-row', {timeout: 20000});
            const txt = await p.textContent('[data-pst-list]');
            assert.match(txt, /Jan MAZAUD/); assert.match(txt, /✓ Rattacher comme source/); assert.match(txt, /✗ Pas lui/); assert.match(txt, /même père/);
            assert.ok(await p.$$eval('[data-pst-list] a[target="_blank"][rel*="noopener"]', a => a.some(x => /openarchieven\.nl\/ela:/.test(x.href))));
            assert.match(await p.textContent('[data-pst-pills]'), /À vérifier \(\d+\)/);
            await p.selectOption('[data-pst-fsrc]', 'insee'); await sleep(600);
            assert.strictEqual(await p.$$eval('[data-pst-list] .pst-row', r => r.length), 1);
            await p.selectOption('[data-pst-fsrc]', ''); await sleep(600);
        });
        await t('✗ Pas lui sur l’écran, puis ↶ Annuler', async () => {
            const n0 = await p.$$eval('[data-pst-list] .pst-row', r => r.length);
            const id = await p.getAttribute('[data-pst-list] .pst-row [data-pst-no]', 'data-pst-no');
            await p.click(`[data-pst-no="${id}"]`);
            await p.waitForFunction(i => !document.querySelector(`[data-pst-list] [data-pst-row="${i}"]`), id, {timeout: 10000});
            await undo(/Piste écartée/);
            await p.waitForSelector(`[data-pst-list] [data-pst-row="${id}"]`, {timeout: 10000});
            assert.strictEqual(await p.$$eval('[data-pst-list] .pst-row', r => r.length), n0);
        });
        await t('« 🔎 Chercher des pistes » (ancêtres Sosa) : barre d’avancée, ⏸ Pause, ▶ Reprendre, jusqu’au bout', async () => {
            q('SELECT 1'); php(`$p=new PDO('sqlite:${path.join(tmp, 'genealogy.sqlite')}');$p->exec('DELETE FROM ouc_oa_cache');`); // sans le cache : une question par pas, ~2 s entre deux
            await p.selectOption('[data-pst-scope]', 'sosa');
            await p.click('[data-pst-start]');
            await p.waitForSelector('[data-pst-job] .pst-bar', {timeout: 10000});
            await p.click('[data-pst-job] [data-pst-pause]');
            await p.waitForFunction(() => /en pause/.test(document.querySelector('[data-pst-job]')?.textContent || ''), null, {timeout: 10000});
            assert.strictEqual((await api('pistes_job')).job.status, 'paused');
            await p.click('[data-pst-job] [data-pst-resume]');
            await p.waitForFunction(() => /finie/.test(document.querySelector('[data-pst-job]')?.textContent || ''), null, {timeout: 30000});
            const j = (await api('pistes_job')).job; assert.strictEqual(j.status, 'done'); assert.strictEqual(j.total, 4, 'Jan, ses parents, son grand-père');
        });
        await t('la fiche de Jan : « 🔎 Pistes à vérifier » avec ses actes ; ✓ Rattacher depuis la fiche', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('[data-pst-person-block="1"] .pst-row', {timeout: 20000});
            const txt = await p.textContent('[data-pst-person-block="1"]');
            assert.match(txt, /actes ressemblent à cette personne/); assert.ok(!/Jan MAZAUD ·/.test(txt), 'pas son nom répété sur sa propre fiche');
            const id = await p.getAttribute('[data-pst-person-block="1"] [data-pst-ok]', 'data-pst-ok');
            await p.click(`[data-pst-person-block="1"] [data-pst-ok="${id}"]`);
            await p.waitForFunction(() => /Rattaché à la fiche/.test([...document.querySelectorAll('.ui-toast, .toast')].map(x => x.textContent).join(' ')), null, {timeout: 10000});
            assert.strictEqual((await list({person_id: 1, status: 'added'})).length, 1);
            await undo(/Rattaché à la fiche/); await sleep(800);
            assert.strictEqual((await list({person_id: 1, status: 'added'})).length, 0);
        });
        await t('le widget « N pistes à vérifier » et le registre commun (dataSources)', async () => {
            const html = await p.evaluate(async () => { const w = window.LCNDA_EXT.dashboard.pistes_auto; const d = await w.load(); return w.render('01', {}, 'span-4', d); });
            assert.match(html, /pistes à vérifier/); assert.match(html, /data-pst-go/);
            assert.ok(await p.evaluate(() => window.LCNDA_APP.defaultDashboardBlocks.some(x => x[0] === 'pistes_auto') && window.LCNDA_APP.defaultListTypes.some(x => x[0] === 'data_pistes') && window.LCNDA_EXT.dataSources.some(d => d.id === 'pistes_auto')));
        });
        await t('Réglages → « 🔎 Pistes, branches, célèbres » : licences et règles (Open Archives : 4 requêtes par seconde), éteindre le bloc de la fiche', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'pistes_reglages'; A.setModule('maintenance'); });
            await p.waitForSelector('.pst-settings [data-pst-set="genealogie-pistes-auto|block"]', {timeout: 20000});
            const s = await p.textContent('.pst-settings');
            assert.match(s, /4 requêtes par seconde/); assert.match(s, /CC0 1\.0/); assert.match(s, /Licence Ouverte 2\.0/);
            await p.uncheck('[data-pst-set="genealogie-pistes-auto|block"]');
            assert.strictEqual(JSON.parse(await p.evaluate(() => localStorage.getItem('genealogie-pistes-auto'))).block, false);
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('#workspace [data-pblock]', {timeout: 20000}); await sleep(800);
            await p.evaluate(() => { document.getElementById('workspace').insertAdjacentHTML('beforeend', '<i id="pst-old"></i>'); window.LCNDA_APP.openPersonById(1); });
            await p.waitForFunction(() => !document.getElementById('pst-old') && document.querySelector('#workspace [data-pblock]'), null, {timeout: 20000}); await sleep(800);
            assert.strictEqual(await p.$$eval('[data-pst-person-block="1"]', x => x.length), 0);
            await p.evaluate(() => localStorage.removeItem('genealogie-pistes-auto'));
        });
        await t('pas d’erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
