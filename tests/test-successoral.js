'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * ⚖️ Généalogiste successoral — serveur (lib/successoral.php, migration 90) et navigateur (heritage-successoral.js) :
 *     node tests/test-successoral.js          (captures : SHOTS=/tmp/claude-0/sp/succ node tests/test-successoral.js)
 *  1. le serveur, base neuve (fiches fictives MAZAUD, LACOMBE) : ouvrir le dossier de Marcel depuis sa fiche (date et lieu du
 *     décès repris, n° fait tout seul, échéance des 6 mois), doublon refusé, CSRF ; le graphe envoyé donne au moteur la bonne
 *     dévolution ; statut retenu à la main et ↶ Annuler ; pièces (en main d'après la preuve de la fiche, demandé, forcé) ;
 *     courriers aux héritiers rangés dans le Registre (réponse, signé le, ↶ Annuler) ; journal qu'on ne peut ni modifier ni
 *     effacer ; « Remis au notaire » demande la liste de contrôle ; archivage (adresses retirées) ; 🗓 Ma semaine ;
 *     mode consultation fermé ; jamais dans l'export GEDCOM ;
 *  2. le navigateur (Playwright ; sinon sauté) à 1440 px, 390 px et en sombre : l'usage (10e carte, interrupteur), la liste,
 *     le dossier et ses 8 onglets, l'arbre, le tableau pour le notaire, aucune erreur JavaScript, pas de défilement de côté.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
const S = require('../assets/js/heritage-successoral-core.js');

const appRoot = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || '';
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

(async () => {
    const phpPath = findPhp([devBundledPhp()]);
    if (!phpPath) { console.log('— PHP absent : test sauté'); return; }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-successoral-'));
    const dir = path.join(tmp, 'data');
    const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
    fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$people = [[1,'Louis','MAZAUD','male','deceased'],[2,'Hélène','PEYRAT','female','deceased'],[3,'Marie','BESSE','female','deceased'],[10,'Marcel','MAZAUD','male','deceased'],[11,'Jeanne','LACOMBE','female','deceased'],
 [20,'André','MAZAUD','male','unknown'],[21,'Paul','MAZAUD','male','deceased'],[22,'Suzanne','MAZAUD','female','living'],[23,'Jean','MAZAUD','male','deceased'],[24,'Robert','LACOMBE','male','deceased'],
 [30,'Claire','MAZAUD','female','living'],[31,'Henri','MAZAUD','male','deceased'],[40,'Lucas','MAZAUD','male','living'],[41,'Emma','MAZAUD','female','living'],[50,'Bertrand','ROUSSILHE','male','living']];
$ins = $pdo->prepare('INSERT INTO persons(id,first_name,last_name,gender,living_status) VALUES(?,?,?,?,?)');
foreach ($people as $r) { $ins->execute($r); }
$tag = fn($t) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$t' ORDER BY id LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO places(id,name,country) VALUES(1,'Malvialle','France'),(2,'Saint-Fréjoux','France')");
$ev = $pdo->prepare("INSERT INTO events(scope,person_id,family_id,event_type_id,date_text,year,place_id) VALUES(?,?,?,?,?,?,?)");
$births = [[1,'1900',1900,1],[2,'1902',1902,null],[3,'1910',1910,null],[10,'12 juin 1938',1938,1],[11,'1940',1940,null],[20,'1926',1926,1],[21,'1936',1936,1],[22,'1941',1941,2],[23,'1922',1922,1],[30,'1962',1962,null],[31,'1965',1965,null],[40,'1993',1993,null],[41,'1996',1996,null]];
foreach ($births as $b) { $ev->execute(['person',$b[0],null,$tag('BIRT'),$b[1],$b[2],$b[3]]); }
$deaths = [[1,'1980',1980],[2,'1930',1930],[3,'1995',1995],[10,'3 mars 2026',2026],[11,'11 février 2019',2019],[21,'2010',2010],[23,'1944',1944],[31,'2018',2018],[24,'2000',2000]];
foreach ($deaths as $d) { $ev->execute(['person',$d[0],null,$tag('DEAT'),$d[1],$d[2],$d[0]===10?1:null]); }
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(100,1,2),(101,1,3),(102,10,11),(103,24,22),(104,21,NULL),(105,31,NULL)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(100,20),(101,10),(101,21),(101,22),(101,23),(104,30),(104,31),(105,40),(105,41)");
$ev->execute(['family',null,100,$tag('MARR'),'1925',1925,1]); $ev->execute(['family',null,101,$tag('MARR'),'1935',1935,1]); $ev->execute(['family',null,102,$tag('MARR'),'1962',1962,1]); $ev->execute(['family',null,103,$tag('MARR'),'1963',1963,2]);
// la preuve : l'acte de décès de Marcel est attaché (média)
$pdo->exec("INSERT INTO media(id,filename,title,media_type) VALUES(1,'deces-marcel.jpg','Acte de décès','image')");
$did = (int) $pdo->query("SELECT e.id FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=10 AND t.gedcom_tag='DEAT'")->fetchColumn();
$pdo->exec("INSERT INTO media_links(media_id,entity_type,entity_id) VALUES(1,'event',$did)");
$pdo->exec("INSERT INTO sources(id,title) VALUES(1,'AD Malvialle, état civil 1938')");
$bid = (int) $pdo->query("SELECT e.id FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=10 AND t.gedcom_tag='BIRT'")->fetchColumn();
$pdo->exec("INSERT INTO source_links(entity_type,entity_id,source_record_id,page) VALUES('event',$bid,1,'acte n° 12')");
$pdo->exec("INSERT INTO living_contacts(person_id,first_name,last_name,address,postal_code,city,country,email) VALUES(22,'Suzanne','LACOMBE','8 place de l’Église','19000','Malvialle','France','suzanne@exemple.fr'),(30,'Claire','MAZAUD','3 rue Haute','19200','Ussel','France',''),(40,'Lucas','MAZAUD','12 avenue Foch','69003','Lyon','France','')");
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
    if (seed.status !== 0 || !String(seed.stdout).includes('ok')) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const port = Number(process.env.PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let cookie = '';
    const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
    const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
    const get = async (op, q = {}) => { const r = await fetch(`${base}api.php?action=successoral&${new URLSearchParams({op, ...q})}`, { headers: { Cookie: cookie } }); return r.json(); };
    const post = async (body, token = csrf, action = 'successoral_write') => { const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: JSON.stringify({ ...body, csrf: token }) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
    const w = async body => { const r = await post(body); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body.result; };
    const php = code => spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require 'lib/paths.php'; require 'lib/bootstrap.php'; $pdo = db(); ${code}`], { cwd: appRoot, encoding: 'utf8', env });
    const compute = D => S.compute(D.graph, { deceasedId: D.deceased_id, deathDate: D.death_iso, overrides: Object.fromEntries(Object.entries(D.overrides || {}).map(([k, v]) => [k, v])), spouse: {}, addresses: D.addresses });
    let cid = 0, D = null;
    try {
        await t('migration 90 : les tables du dossier et les colonnes du Registre de courriers', async () => {
            const st = await (await fetch(`${base}api.php?action=schema_status`, { headers: { Cookie: cookie } })).json(); assert.ok(st.version >= 90, String(st.version));
            assert.match(php("echo $pdo->query(\"SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('succ_cases','succ_deadlines','succ_pieces','succ_journal','succ_fees')\")->fetchColumn();").stdout, /^5$/);
            assert.match(php("echo $pdo->query(\"SELECT count(*) FROM pragma_table_info('courriers') WHERE name IN ('succ_case_id','reponse','signe_le','succ_kind')\")->fetchColumn();").stdout, /^4$/);
        });
        await t('ouvrir le dossier de Marcel : date et lieu du décès repris de la fiche, n° fait tout seul, échéance des 6 mois, journal ; doublon refusé ; CSRF', async () => {
            assert.ok((await post({ op: 'save', deceased_id: 10 }, 'faux')).status >= 400);
            assert.equal((await post({ op: 'save', deceased_id: 0 })).status, 422);
            const r = await w({ op: 'save', deceased_id: 10, notary_person_id: 50, notary_ref: 'BR/26/0412', opened_at: '2026-04-02' });
            cid = r.id; assert.ok(r.created);
            assert.equal((await post({ op: 'save', deceased_id: 10 })).status, 422, 'un seul dossier par défunt');
            D = await get('get', { id: cid });
            assert.equal(D.number, '2026-001'); assert.equal(D.title, 'Succession de Marcel MAZAUD');
            assert.equal(D.death_date_text, '3 mars 2026'); assert.equal(D.death_iso, '2026-03-03'); assert.equal(D.death_place_text, 'Malvialle');
            assert.equal(D.notary, 'Bertrand ROUSSILHE');
            assert.equal(D.deadlines[0].due, '2026-09-03'); assert.match(D.deadlines[0].label, /Déclaration de succession/);
            assert.match(D.journal[0].text, /Dossier ouvert, mandant : Bertrand ROUSSILHE/);
            assert.equal((await get('by_person', { person_id: 10 })).id, cid);
        });
        await t('le graphe envoyé : le moteur trouve Suzanne, André (inconnu), Claire, Lucas, Emma — parts égales entre lits (droit actuel)', async () => {
            const R = compute(D);
            assert.equal(R.order, 2);
            const sh = Object.fromEntries(R.rows.filter(r => r.role === 'heir').map(r => [r.name, r.share]));
            assert.deepEqual(sh, { 'André MAZAUD': '1/3', 'Suzanne MAZAUD': '1/3', 'Claire MAZAUD': '1/6', 'Lucas MAZAUD': '1/12', 'Emma MAZAUD': '1/12' });
            assert.equal(R.total, '1'); assert.equal(R.hypotheses.length, 1);
            assert.ok(R.search.some(s => s.kind === 'address' && s.id === 41), 'Emma : pas d’adresse');
            assert.ok(!R.search.some(s => s.kind === 'address' && s.id === 22));
            assert.equal(D.acts['D:10'].media, true, 'l’acte de décès est attaché à la fiche'); assert.deepEqual(D.acts['N:10'].sources, ['AD Malvialle, état civil 1938, acte n° 12']);
            assert.deepEqual(D.addresses[22].lines, ['8 place de l’Église', '19000 Malvialle']);
            const P = S.pieces(R, D.graph, { acts: D.acts, states: {}, asked: D.asked });
            assert.equal(P.list.find(i => i.key === 'D:10').state, 'have'); assert.equal(P.list.find(i => i.key === 'N:22').state, 'missing');
            const snap = S.snapshot(R);
            await w({ op: 'snapshot', case_id: cid, snapshot: snap, lines: [], first: 1 });
            D = await get('get', { id: cid }); assert.match(D.journal[0].text, /Dévolution calculée : 5 héritier/);
        });
        await t('statut retenu à la main (André mort avant) puis ↶ Annuler ; valeur inconnue refusée', async () => {
            const r = await w({ op: 'override', case_id: cid, person_id: 20, field: 'status', value: 'dead_before' });
            D = await get('get', { id: cid }); assert.equal(D.overrides[20].status, 'dead_before');
            const sh = Object.fromEntries(compute(D).rows.filter(x => x.role === 'heir').map(x => [x.name, x.share]));
            assert.equal(sh['Suzanne MAZAUD'], '1/2'); assert.equal(sh['André MAZAUD'], undefined);
            assert.equal((await post({ op: 'override', case_id: cid, person_id: 20, field: 'status', value: 'bof' })).status, 422);
            await w({ op: 'override', case_id: cid, person_id: 20, field: 'status', value: r.prev });
            D = await get('get', { id: cid }); assert.equal(D.overrides[20], undefined);
        });
        await t('pièces : forcer « en main », ↶ Annuler ; relier un courrier « demande d’acte » → « demandé »', async () => {
            const r = await w({ op: 'piece', case_id: cid, key: 'N:30', state: 'have', what: 'Claire, fille de Paul' });
            assert.equal(r.prev, null);
            assert.equal((await post({ op: 'piece', case_id: cid, key: 'X:1', state: 'have' })).status, 422);
            D = await get('get', { id: cid }); assert.equal(D.pieces['N:30'].state, 'have'); assert.match(D.journal[0].text, /Claire, fille de Paul : en main/);
            await w({ op: 'piece', case_id: cid, key: 'N:30', state: '', quiet: 1 });
            const k = php("$pdo->exec(\"INSERT INTO courriers(organisme,destinataire,objet,date_envoi,statut) VALUES('mairie','Mairie de Saint-Fréjoux','Copie intégrale : naissance de Suzanne','2026-10-21','en_attente')\"); echo $pdo->lastInsertId();").stdout.trim();
            await w({ op: 'link_courrier', case_id: cid, courrier_id: Number(k), piece_key: 'N:22', person_id: 22, kind: 'acte' });
            D = await get('get', { id: cid });
            assert.equal(D.pieces['N:22'].state, 'asked'); assert.equal(D.courriers[0].kind, 'acte'); assert.match(D.journal[0].text, /📮 Acte demandé/);
            const P = S.pieces(compute(D), D.graph, { acts: D.acts, states: Object.fromEntries(Object.entries(D.pieces).filter(([, v]) => v.state).map(([k2, v]) => [k2, v.state])), asked: D.asked });
            assert.equal(P.list.find(i => i.key === 'N:22').state, 'asked');
        });
        await t('courriers aux héritiers : rangés dans le Registre (lié au dossier et à la fiche), réponse, signé le, ↶ Annuler', async () => {
            const a = await w({ op: 'file_letter', case_id: cid, person_id: 22, kind: 'contrat', letter: 'CONTRAT…', date_envoi: '2026-10-12', relance_jours: 30, recipient_address: '8 place de l’Église\n19000 Malvialle' });
            const c = php(`echo json_encode($pdo->query('SELECT destinataire, statut, relance_date, person_id, succ_case_id, succ_kind, letter_json FROM courriers WHERE id=${a.courrier_id}')->fetch(PDO::FETCH_ASSOC));`).stdout;
            const row = JSON.parse(c); assert.equal(row.destinataire, 'Suzanne MAZAUD'); assert.equal(row.relance_date, '2026-11-11'); assert.equal(Number(row.succ_case_id), cid); assert.equal(row.succ_kind, 'contrat');
            assert.match(row.letter_json, /19000 Malvialle/);
            const r1 = await w({ op: 'courrier_set', courrier_id: a.courrier_id, reponse: 'yes' });
            const r2 = await w({ op: 'courrier_set', courrier_id: a.courrier_id, signe_le: '2026-11-02' });
            D = await get('get', { id: cid }); const cc = D.courriers.find(x => x.id === a.courrier_id);
            assert.equal(cc.reponse, 'yes'); assert.equal(cc.signe_le, '2026-11-02'); assert.equal(cc.statut, 'reponse_recue');
            assert.match(D.journal[0].text, /Contrat signé reçu : Suzanne MAZAUD/);
            await w({ op: 'courrier_set', courrier_id: a.courrier_id, undo: 1, ...r2.prev });
            assert.equal((await post({ op: 'courrier_set', courrier_id: a.courrier_id, reponse: 'peut-être' })).status, 422);
            const b = await w({ op: 'file_letter', case_id: cid, person_id: 30, kind: 'contact', letter: 'Bonjour', date_envoi: '2026-10-12' });
            await w({ op: 'unfile_letter', case_id: cid, courrier_id: b.courrier_id });
            assert.match(php(`echo $pdo->query('SELECT count(*) FROM courriers WHERE id=${b.courrier_id}')->fetchColumn();`).stdout, /^0$/);
            const reg = await get('courriers'); assert.ok(reg.items.some(x => x.id === a.courrier_id && x.number === '2026-001'));
            void r1;
        });
        await t('journal : aucune opération pour le modifier ou l’effacer ; noté par le navigateur (PDF)', async () => {
            await w({ op: 'journal', case_id: cid, kind: 'pdf', text: 'Tableau pour le notaire : PDF créé (3 pages)' });
            for (const op of ['journal_delete', 'journal_update', 'journal_edit']) assert.equal((await post({ op, case_id: cid, id: 1, text: 'x' })).status, 422, op);
            assert.doesNotMatch(fs.readFileSync(path.join(appRoot, 'lib/successoral.php'), 'utf8'), /(UPDATE|DELETE FROM)\s+succ_journal/, 'aucune requête ne modifie ou n’efface le journal');
            D = await get('get', { id: cid }); assert.ok(D.journal.length >= 6);
        });
        await t('échéances : dans 🗓 Ma semaine, « fait » puis ↶ Annuler ; état « Remis au notaire » seulement après la liste de contrôle', async () => {
            const soon = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
            const dl = await w({ op: 'deadline_save', case_id: cid, due: soon, label: 'Remettre le tableau généalogique au notaire', kind: 'remise' });
            const sem = await (await fetch(`${base}api.php?action=semaine`, { headers: { Cookie: cookie } })).json();
            const item = (sem.items || []).find(x => x.key === 'succ:' + dl.id); assert.ok(item, JSON.stringify((sem.items || []).map(x => x.key)));
            assert.match(item.detail, /Dossier 2026-001/);
            const m = await post({ op: 'done', key: 'succ:' + dl.id }, csrf, 'semaine_mark'); assert.equal(m.status, 200, JSON.stringify(m.body));
            D = await get('get', { id: cid }); assert.equal(D.deadlines.find(x => x.id === dl.id).done, true);
            const prev = m.body.prev || m.body.result?.prev;
            await post({ op: 'restore', key: 'succ:' + dl.id, prev }, csrf, 'semaine_mark');
            D = await get('get', { id: cid }); assert.equal(D.deadlines.find(x => x.id === dl.id).done, false);
            assert.equal((await post({ op: 'state', id: cid, state: 'remis' })).status, 422);
            await w({ op: 'state', id: cid, state: 'recherche' });
            await w({ op: 'state', id: cid, state: 'remis', checked: 'forced' });
            D = await get('get', { id: cid }); assert.equal(D.state, 'remis'); assert.match(D.journal[0].text, /remis quand même/);
        });
        await t('temps et frais ; archiver un dossier clos retire les adresses (dossier et courriers), garde le journal', async () => {
            await w({ op: 'fee_save', case_id: cid, kind: 'time', minutes: 95, label: 'AD de Malvialle' });
            await w({ op: 'fee_save', case_id: cid, kind: 'cost', amount_cents: 1250, label: 'Copie d’acte' });
            assert.equal((await post({ op: 'fee_save', case_id: cid, kind: 'percent', percent: 140 })).status, 422);
            D = await get('get', { id: cid }); const F = S.fees(D.fees); assert.equal(F.minutes, 95); assert.equal(F.cents, 1250);
            assert.equal((await post({ op: 'archive', id: cid })).status, 422, 'seulement un dossier clos');
            await w({ op: 'save', id: cid, last_address: '4 rue des Tilleuls, Malvialle' });
            await w({ op: 'state', id: cid, state: 'clos' });
            await w({ op: 'archive', id: cid });
            D = await get('get', { id: cid });
            assert.equal(D.state, 'archive'); assert.equal(D.last_address, ''); assert.deepEqual(D.addresses, {}, 'plus aucune adresse lue');
            assert.doesNotMatch(php("echo $pdo->query(\"SELECT group_concat(letter_json) FROM courriers WHERE succ_case_id IS NOT NULL\")->fetchColumn();").stdout, /Malvialle/);
            assert.match(D.journal[0].text, /archivé/);
            assert.equal((await post({ op: 'file_letter', case_id: cid, person_id: 22, letter: 'x' })).status, 422);
        });
        await t('jamais exporté : l’export GEDCOM ne contient ni le dossier ni la réf. du notaire', async () => {
            const g = await (await fetch(`${base}api.php?action=export_gedcom`, { headers: { Cookie: cookie } })).text();
            assert.match(g, /MAZAUD/); assert.doesNotMatch(g, /BR\/26\/0412|2026-001|succ_/);
        });
        await t('supprimer puis rétablir ; mode consultation : rien ne se lit, rien ne s’écrit', async () => {
            await w({ op: 'delete', id: cid }); assert.equal((await get('list')).items.length, 0);
            await w({ op: 'restore', id: cid }); assert.equal((await get('list')).items.length, 1);
            const act = async (action, body) => (await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ ...body, csrf }) })).status;
            assert.equal(await act('kiosk_enter', { password: 'secret1' }), 200);
            try {
                const r = await fetch(`${base}api.php?action=successoral&op=get&id=${cid}`, { headers: { Cookie: cookie } }); assert.notEqual(r.status, 200);
                assert.doesNotMatch(await r.text(), /Suzanne/);
                assert.notEqual((await post({ op: 'save', deceased_id: 21 })).status, 200);
            } finally { assert.equal(await act('kiosk_exit', { password: 'secret1' }), 200); }
        });

        /* ═════ 2. le navigateur ═════ */
        let chromium = null;
        try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (_) { try { ({ chromium } = require('playwright')); } catch (__) { /* sauté */ } }
        if (!chromium) { console.log('— Playwright absent : partie navigateur sautée'); return; }
        // un deuxième dossier, vivant (pas archivé), pour les écrans
        php("$pdo->exec(\"UPDATE succ_cases SET deceased_id=NULL, deleted_at=CURRENT_TIMESTAMP\");");
        const c2 = await w({ op: 'save', deceased_id: 10, notary_person_id: 50, notary_ref: 'BR/26/0412', opened_at: '2026-04-02', number: '2026-014', last_address: '4 rue des Tilleuls, Malvialle' });
        await w({ op: 'file_letter', case_id: c2.id, person_id: 22, kind: 'contrat', letter: 'CONTRAT…', date_envoi: '2026-10-12' });
        const browser = await chromium.launch();
        const shot = async (pg, name, full = false) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await pg.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: full }); } };
        const open = async (w0, h0, dark, hash = '#listes', usage = true) => {
            const ctx = await browser.newContext({ viewport: { width: w0, height: h0 }, deviceScaleFactor: 1, colorScheme: dark ? 'dark' : 'light' });
            await ctx.addInitScript(([dk, us]) => { try { if (dk) localStorage.setItem('genealogie-design', JSON.stringify({preset: 'dark'})); if (us && !localStorage.getItem('genealogie-usage')) { localStorage.setItem('genealogie-usage', JSON.stringify({usages: ['genealogie', 'successoral'], start: 'last'})); localStorage.setItem('genealogie-menu-successoral', '1'); } } catch (_) {} }, [dark, usage]);
            const pg = await ctx.newPage(); const errs = [];
            pg.on('pageerror', e => errs.push('pageerror ' + e.message)); pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|tile\.openstreetmap|ERR_|net::/.test(m.text())) errs.push('console ' + m.text()); });
            await pg.goto(base + hash); await pg.waitForFunction(() => window.LCNDA_EXT?.successoral && window.LCNDA_APP?.setModule && window.LCNDA_SUCC_CORE, null, { timeout: 15000 });
            return { ctx, pg, errs };
        };
        const noSide = async pg => assert.equal(await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'pas de défilement de côté');
        try {
            await t('usage : 10e carte « ⚖️ Généalogiste successoral », interrupteur dans 🧭 Usage de l’app ; l’onglet ⚖️ Successions apparaît et disparaît', async () => {
                const { ctx, pg, errs } = await open(1440, 900, false, '#dashboard', false);
                const u = await pg.evaluate(() => window.LCNDA_EXT.premierLancement.usages().map(x => x.k));
                assert.equal(u.length, 10); assert.equal(u[9], 'successoral');
                const ch = await pg.evaluate(() => window.LCNDA_EXT.premierLancement.usageChanges(['genealogie'], ['genealogie', 'successoral'], k => localStorage.getItem(k)));
                assert.equal(ch['genealogie-menu-successoral'], '1'); assert.ok(!JSON.parse(ch['genealogie-menu-hidden']).includes('successoral'));
                assert.match(ch['genealogie-custom-tabs'], /list:living_contacts/); assert.match(ch['genealogie-custom-tabs'], /list:courriers/);
                assert.equal(await pg.evaluate(() => getComputedStyle(document.querySelector('.main-nav [data-module="successoral"]')).display), 'none', 'caché sans l’usage');
                await pg.evaluate(() => window.LCNDA_EXT.premierLancement.applyUsages(['genealogie', 'successoral']));
                assert.notEqual(await pg.evaluate(() => document.querySelector('.main-nav [data-module="successoral"]').style.display), 'none');
                await pg.evaluate(() => { window.LCNDA_APP.state.maintenanceTab = 'design'; window.LCNDA_APP.setModule('maintenance'); });
                await pg.waitForSelector('#lc-usage [data-pl-use="successoral"]', { timeout: 15000, state: 'attached' }); await shot(pg, 'usage-reglages');
                assert.equal(await pg.isChecked('#lc-usage [data-pl-use="successoral"]'), true);
                assert.deepEqual(errs, []); await ctx.close();
            });
            for (const [w0, h0, dark, tag] of [[1440, 900, false, '1440'], [390, 844, false, '390'], [1440, 900, true, 'sombre']]) {
                await t(`navigateur ${tag} : liste, dossier et ses 8 onglets, sans erreur ni défilement de côté`, async () => {
                    const { ctx, pg, errs } = await open(w0, h0, dark, '#successoral');
                    await pg.waitForSelector('[data-succ-open]'); await noSide(pg); await shot(pg, `liste-${tag}`);
                    await pg.click('[data-succ-open]'); await pg.waitForSelector('.succ-tabs');
                    for (const tab of ['dossier', 'heirs', 'tree', 'pieces', 'contacts', 'notary', 'journal', 'fees']) {
                        await pg.click(`[data-succ-tab="${tab}"]`); await pg.waitForTimeout(350); await noSide(pg); await shot(pg, `${tab}-${tag}`, true);
                    }
                    assert.deepEqual(errs, []); await ctx.close();
                });
            }
            await t('héritiers : parts, total 1, autre hypothèse, liens Légifrance ; arbre ; notaire ; ⋯ de la fiche ; modèles du traitement de texte seulement en usage successoral', async () => {
                const { ctx, pg, errs } = await open(1440, 900, false, '#successoral');
                await pg.evaluate(() => { localStorage.setItem('lcnda-succ-tab', JSON.stringify('heirs')); });
                await pg.waitForSelector('[data-succ-open]'); await pg.click('[data-succ-open]'); await pg.click('[data-succ-tab="heirs"]'); await pg.waitForSelector('.succ-table');
                const txt = await pg.textContent('.succ-table'); assert.match(txt, /1\/3/); assert.match(txt, /1\/12/);
                assert.match(await pg.textContent('tfoot'), /1/);
                assert.match(await pg.textContent('.succ-hyp'), /André MAZAUD/);
                const links = await pg.$$eval('a.succ-law', as => as.map(a => [a.href, a.target]));
                assert.ok(links.length >= 8); assert.ok(links.every(([h, tg]) => /^https:\/\/www\.legifrance\.gouv\.fr\//.test(h) && tg === '_blank'));
                await pg.click('[data-succ-tab="tree"]'); await pg.waitForSelector('svg.succ-tree');
                assert.ok(await pg.locator('[data-succ-node]').count() >= 10);
                await pg.click('[data-succ-tab="notary"]'); await pg.waitForSelector('.succ-npreview');
                const np = await pg.textContent('.succ-npreview'); assert.match(np, /TABLEAU GÉNÉALOGIQUE/); assert.match(np, /Suzanne MAZAUD/); assert.doesNotMatch(np, /place de l’Église/, 'pas d’adresse sans la case');
                await pg.check('[data-succ-naddr]'); assert.match(await pg.textContent('.succ-npreview'), /place de l’Église/);
                await pg.click('[data-succ-tab="contacts"]'); await pg.click('[data-succ-letter="contrat"]'); await pg.waitForSelector('dialog[open] textarea[name=letter]');
                const letter = await pg.inputValue('dialog[open] textarea[name=letter]'); assert.match(letter, /CONTRAT DE RÉVÉLATION/); assert.doesNotMatch(letter, /Marcel/, 'le défunt n’est pas révélé');
                await shot(pg, 'contrat'); await pg.keyboard.press('Escape');
                const items = await pg.evaluate(() => window.LCNDA_EXT.personMoreItems.map(f => { try { return f({person: {id: 10, living_status: 'deceased'}, events: []})?.label; } catch (_) { return null; } }).filter(Boolean));
                assert.ok(items.includes('Rechercher les héritiers…'));
                const alive = await pg.evaluate(() => window.LCNDA_EXT.personMoreItems.map(f => { try { return f({person: {id: 22, living_status: 'living'}, events: []})?.label; } catch (_) { return null; } }).filter(Boolean));
                assert.ok(!alive.includes('Rechercher les héritiers…'));
                const tpl = await pg.evaluate(() => (window.LCNDA_EXT.textDocTools?.TEMPLATES || []).filter(x => !x.when || x.when()).map(x => x.key));
                assert.ok(tpl.includes('succ_contrat') && tpl.includes('succ_lettre'));
                await pg.evaluate(() => localStorage.setItem('genealogie-usage', JSON.stringify({usages: ['genealogie'], start: 'last'})));
                const tpl2 = await pg.evaluate(() => (window.LCNDA_EXT.textDocTools?.TEMPLATES || []).filter(x => !x.when || x.when()).map(x => x.key));
                assert.ok(!tpl2.includes('succ_contrat'));
                assert.deepEqual(errs, []); await ctx.close();
            });
            await t('Listes → Recherche et organisation : « ⚖️ Dossiers de succession » après les Cousinades ; caché en mode consultation', async () => {
                const { ctx, pg, errs } = await open(1440, 900, false, '#listes');
                const keys = await pg.evaluate(() => window.LCNDA_APP.orderedListTypes(true).map(r => r[0]));
                assert.ok(keys.includes('successoral'));
                await pg.evaluate(() => { window.LCNDA_APP.state.listType = 'successoral'; window.LCNDA_APP.setModule('listes'); }); await pg.waitForSelector('[data-succ-open]');
                await pg.evaluate(() => document.body.classList.add('is-kiosk'));
                assert.equal(await pg.evaluate(() => window.LCNDA_EXT.listShown('successoral')), false);
                assert.deepEqual(errs, []); await ctx.close();
            });
        } finally { await browser.close(); }
    } finally {
        proc.kill();
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
        if (failed) { console.error(`✗ ${failed} échec(s)`); process.exitCode = 1; } else console.log('✓ tout est bon');
    }
})();
