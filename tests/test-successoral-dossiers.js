'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * ⚖️ Dossiers de succession : rangement, filtre, rattachement, tableau de bord, garde-fous, widget, vue par dossier
 * (maquette docs/design/successoral-dossiers.html ; serveur lib/successoral_dossiers.php, migration 91 ; navigateur
 * heritage-successoral-dossiers.js ; calcul heritage-successoral-core.js) :
 *     node tests/test-successoral-dossiers.js      (captures : /tmp/claude-0/sp/succ/dos-*.png)
 *  1. le moteur : % d'avancement pondéré (7 étapes, poids et refus réglables, exemple 2026-014 = 53 %), fiches parcourues par
 *     le calcul (héritiers, intermédiaires), ordre des dossiers A → Z ou à la main (Alt + ↑ / ↓) ;
 *  2. le serveur, base neuve (fiches fictives MAZAUD, LACOMBE) : migration 91, réglages communs, rattachement (défunt à
 *     l'ouverture, calcul, à la main, jamais remis après un retrait, ↶ Annuler), rôles d'une fiche, badge, filtre (Personnes,
 *     recherche, listes, arbre grisé), fiche créée pendant le filtre rattachée d'office, homonymes, fusion de fiches de deux
 *     dossiers (journal des deux), vue d'ensemble lue dans chaque généalogie, déplacement (copie, refus, ↶ Annuler), archive en
 *     fichier avec et sans adresses, retrait, réimport, reprise d'une fiche depuis Ma généalogie, généalogie à part,
 *     mode consultation fermé, rien dans l'export GEDCOM ;
 *  2b. migration 92 : 🔎 introuvable / 🔇 ne répond pas par héritier et par dossier (date, journal, ↶ Annuler, badge, fenêtre
 *     « ⚖️ Dossiers… », jamais exporté, fermé en consultation) ; réglage « fiches confidentielles comptées comme héritiers » ;
 *  3. le navigateur (Playwright) à 1440 px, 390 px et en sombre : bouton ⚖️, menu, bandeau ✕, Personnes filtré, arbre grisé,
 *     onglet 🧑‍🤝‍🧑 Personnes, ⋯ → « ⚖️ Dossiers… », badge, tableau de bord et « Ne montrer que ceux-ci », premier « ＋ Ouvrir un
 *     dossier », Réglages, widget (3 tailles), vue par dossier et ordre à la main avec ↶ Annuler, noms piégés jamais exécutés.
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
const UX = process.env.SHOTS || '/tmp/claude-0/sp/succ';
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

(async () => {
    /* ═════ 1. le moteur ═════ */
    await t('avancement : 7 étapes pondérées, exemple 2026-014 = 53 %, poids réglables, clos = 100 %', () => {
        assert.equal(S.progressPct([1, 0.5, 5 / 6, 0.6, 0, 9 / 14, 0]), 53);
        assert.equal(S.progressPct([1, 1, 1, 1, 1, 1, 1]), 100);
        assert.equal(S.progressPct([1, 0, 0, 0, 0, 0, 0], [50, 10, 10, 10, 10, 5, 5]), 50);
        assert.deepEqual(S.WEIGHTS, [10, 15, 20, 10, 15, 20, 10]);
        assert.equal(S.progress({state: 'clos', deceased_id: 1}, null, null).pct, 100);
        // un dossier inventé : 2 héritiers vivants connus, 1 inconnu ; une adresse ; un refus de signer
        const R = {rows: [{id: 2, role: 'heir', share: '1/3', timing: 'surv'}, {id: 3, role: 'heir', share: '1/3', timing: 'surv'}, {id: 4, role: 'heir', share: '1/3', unknown: true, timing: 'unknown'}], search: [{kind: 'unknown', id: 4}], totalOk: true};
        const P = {list: [{key: 'D:1', state: 'have'}], groups: [{key: 'common'}, {key: 'h2'}, {key: 'h3'}, {key: 'h4'}], counts: {have: 3, total: 6}};
        const D = {state: 'recherche', deceased_id: 1, addresses: {2: {}}, courriers: [{person_id: 3, kind: 'contrat', reponse: 'no'}, {person_id: 2, kind: 'contrat', signe_le: '2026-11-02'}]};
        const a = S.progress(D, R, P), b = S.progress(D, R, P, {refuseDone: false});
        assert.deepEqual(a.steps.map(s => s.key), ['deceased', 'tree', 'heirs', 'addresses', 'contracts', 'pieces', 'notary']);
        assert.equal(a.steps[0].frac, 1); assert.equal(a.steps[2].frac, 0.667); assert.equal(a.steps[3].frac, 0.5);
        assert.equal(a.steps[4].frac, 1, 'le refus compte comme fait'); assert.equal(b.steps[4].frac, 0.5, 'réglage : le refus ne compte pas');
        assert.equal(a.steps[5].frac, 0.5); assert.ok(a.pct > b.pct);
        assert.equal(S.progress({...D, hypothesis_note: 'retenue'}, R, P).steps[1].frac, 1, 'hypothèse retenue écrite = 1');
        assert.equal(S.progress({...D, state: 'remis'}, R, P).steps[6].frac, 1);
        assert.deepEqual(a.heirs, {found: 2, unknown: 1});
    });
    await t('ordre des dossiers : A → Z (n° puis défunt), à la main (nouveaux à la fin), Alt + ↑ / ↓', () => {
        const cs = [{id: 3, number: '2026-015', deceased: 'Jeanne LACOMBE'}, {id: 1, number: '2026-012', deceased: 'Marie BESSE'}, {id: 2, number: '2026-014', deceased: 'Marcel MAZAUD'}];
        assert.deepEqual(S.orderCases(cs).map(c => c.id), [1, 2, 3]);
        assert.deepEqual(S.orderCases(cs, {order: 'hand', hand: [3, 1]}).map(c => c.id), [3, 1, 2]);
        assert.deepEqual(S.orderCases(cs, {order: 'az', hand: [3, 1]}).map(c => c.id), [1, 2, 3]);
        assert.deepEqual(S.moveCase([1, 2, 3], 3, -1), [1, 3, 2]); assert.deepEqual(S.moveCase([1, 2, 3], 1, -1), [1, 2, 3]); assert.deepEqual(S.moveCase([1, 2, 3], 1, 5), [2, 3, 1]);
    });

    const phpPath = findPhp([devBundledPhp()]);
    if (!phpPath) { console.log('— PHP absent : partie serveur sautée'); return finish(); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-succ-dossiers-'));
    const dir = path.join(tmp, 'data');
    const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4' };
    fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'media', 'deces-marcel.jpg'), 'image-fictive');
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$people = [[1,'Louis','MAZAUD','male','deceased'],[2,'Hélène','PEYRAT','female','deceased'],[3,'Marie','BESSE','female','deceased'],[10,'Marcel','MAZAUD','male','deceased'],[11,'Jeanne','LACOMBE','female','deceased'],
 [20,'André','MAZAUD','male','unknown'],[21,'Paul','MAZAUD','male','deceased'],[22,'Suzanne','MAZAUD','female','living'],[23,'Jean','MAZAUD','male','deceased'],[24,'Robert','LACOMBE','male','deceased'],
 [30,'Claire','MAZAUD','female','living'],[31,'Henri','MAZAUD','male','deceased'],[40,'Lucas','MAZAUD','male','living'],[41,'Emma','MAZAUD','female','living'],[50,'Bertrand','ROUSSILHE','male','living'],
 [60,'Jean','MAZAUD','male','deceased'],[70,'<img src=x onerror=window.__xss=1>','PIÈGE','female','living'],[80,'Paulette','DURAND','female','living'],[81,'Gaston','VIALLE','male','deceased']];
$ins = $pdo->prepare('INSERT INTO persons(id,first_name,last_name,gender,living_status) VALUES(?,?,?,?,?)');
foreach ($people as $r) { $ins->execute($r); }
$tag = fn($t) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$t' ORDER BY id LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO places(id,name,country) VALUES(1,'Malvialle','France'),(2,'Saint-Fréjoux','France')");
$ev = $pdo->prepare("INSERT INTO events(scope,person_id,family_id,event_type_id,date_text,year,place_id) VALUES(?,?,?,?,?,?,?)");
$births = [[1,'1900',1900,1],[2,'1902',1902,null],[3,'1910',1910,null],[10,'12 juin 1938',1938,1],[11,'1940',1940,null],[20,'1926',1926,1],[21,'1936',1936,1],[22,'1941',1941,2],[23,'1922',1922,1],[30,'1962',1962,null],[31,'1965',1965,null],[40,'1993',1993,null],[41,'1996',1996,null],[60,'1922',1922,2],[80,'1950',1950,2],[81,'1930',1930,2]];
foreach ($births as $b) { $ev->execute(['person',$b[0],null,$tag('BIRT'),$b[1],$b[2],$b[3]]); }
$deaths = [[1,'1980',1980],[2,'1930',1930],[3,'1995',1995],[10,'3 mars 2026',2026],[11,'11 février 2019',2019],[21,'2010',2010],[23,'1944',1944],[31,'2018',2018],[24,'2000',2000],[60,'1990',1990],[81,'2025',2025]];
foreach ($deaths as $d) { $ev->execute(['person',$d[0],null,$tag('DEAT'),$d[1],$d[2],$d[0]===10?1:null]); }
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(100,1,2),(101,1,3),(102,10,11),(103,24,22),(104,21,NULL),(105,31,NULL),(106,81,80)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(100,20),(101,10),(101,21),(101,22),(101,23),(104,30),(104,31),(105,40),(105,41)");
$ev->execute(['family',null,100,$tag('MARR'),'1925',1925,1]); $ev->execute(['family',null,101,$tag('MARR'),'1935',1935,1]); $ev->execute(['family',null,102,$tag('MARR'),'1962',1962,1]); $ev->execute(['family',null,103,$tag('MARR'),'1963',1963,2]); $ev->execute(['family',null,106,$tag('MARR'),'1970',1970,2]);
$pdo->exec("INSERT INTO media(id,filename,title,media_type) VALUES(1,'deces-marcel.jpg','Acte de décès','image')");
$did = (int) $pdo->query("SELECT e.id FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=10 AND t.gedcom_tag='DEAT'")->fetchColumn();
$pdo->exec("INSERT INTO media_links(media_id,entity_type,entity_id) VALUES(1,'event',$did)");
$pdo->exec("INSERT INTO living_contacts(person_id,first_name,last_name,address,postal_code,city,country,email) VALUES(22,'Suzanne','LACOMBE','8 place de l’Église','19000','Malvialle','France','suzanne@exemple.fr'),(30,'Claire','MAZAUD','3 rue Haute','19200','Ussel','France','')");
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
    const api = async (action, q = {}, headers = {}) => { const r = await fetch(`${base}api.php?action=${action}&${new URLSearchParams(q)}`, { headers: { Cookie: cookie, ...headers } }); return r.json(); };
    const get = async (op, q = {}) => api('successoral', { op, ...q });
    const post = async (body, action = 'successoral_write', headers = {}) => { const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, ...headers }, body: JSON.stringify({ ...body, csrf }) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
    const w = async body => { const r = await post(body); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body.result; };
    const php = code => spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require 'lib/paths.php'; require 'lib/bootstrap.php'; $pdo = db(); ${code}`], { cwd: appRoot, encoding: 'utf8', env });
    const compute = D => S.compute(D.graph, { deceasedId: D.deceased_id, deathDate: D.death_iso, overrides: D.overrides || {}, spouse: {}, addresses: D.addresses });
    const piecesOf = (D, R) => S.pieces(R, D.graph, { acts: D.acts, states: Object.fromEntries(Object.entries(D.pieces || {}).filter(([, v]) => v.state).map(([k, v]) => [k, v.state])), asked: D.asked });
    const sync = async id => { const D = await get('get', { id }); const R = compute(D); const m = S.members(R); await w({ op: 'sync_calc', case_id: id, heirs: m.heirs, inter: m.inter }); const pr = S.progress(D, R, piecesOf(D, R)); await w({ op: 'progress', case_id: id, pct: pr.pct, steps: pr.steps, pieces: pr.pieces, heirs: pr.heirs }); return { D, R, m, pr }; };
    let A = 0, B = 0;
    try {
        /* ═════ 2. le serveur ═════ */
        await t('migration 91 : succ_case_persons, succ_homonym_no, avancement gardé ; réglages communs par défaut', async () => {
            const st = await api('schema_status'); assert.ok(st.version >= 91, String(st.version));
            assert.match(php("echo $pdo->query(\"SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('succ_case_persons','succ_homonym_no')\")->fetchColumn();").stdout, /^2$/);
            assert.match(php("echo $pdo->query(\"SELECT count(*) FROM pragma_table_info('succ_cases') WHERE name IN ('progress','progress_json')\")->fetchColumn();").stdout, /^2$/);
            const s = await get('settings');
            const { p2, cabinet, ...rest } = s.settings; assert.deepEqual(rest, { store: '', apart_id: '', outside: 'grey', archive_addresses: 'remove', refuse_done: true, weights: [10, 15, 20, 10, 15, 20, 10], move_shared: 'copy', nodossier: 'fold', private_heirs: true }); assert.equal(p2.insee_threshold, 40, 'outils de plus : les valeurs conseillées (successoral_plus2.php)'); assert.deepEqual(cabinet.required, ['name']);
            const r = await w({ op: 'settings_save', settings: { outside: 'hide', weights: [10, 10, 10, 10, 10, 10, 40], nodossier: 'bof' } });
            assert.equal(r.settings.outside, 'hide'); assert.equal(r.settings.nodossier, 'fold', 'valeur inconnue ignorée'); assert.equal(r.prev.outside, 'grey');
            await w({ op: 'settings_save', settings: { outside: r.prev.outside, weights: r.prev.weights } });
            assert.equal((await get('settings')).settings.outside, 'grey');
            assert.ok(fs.existsSync(path.join(dir, 'successoral.json')), 'communs à toutes les généalogies (dossier de données partagé)');
        });
        await t('rattachement : le défunt à l’ouverture ; le calcul (héritiers, intermédiaires) ; un retrait à la main n’est jamais remis ; ↶ Annuler', async () => {
            A = (await w({ op: 'save', deceased_id: 10, number: '2026-014', notary_person_id: 50, opened_at: '2026-04-02' })).id;
            B = (await w({ op: 'save', deceased_id: 24, number: '2026-015', notary_text: 'Me ROUSSILHE' })).id;
            let cp = (await get('case_people', { case_id: A })).items;
            assert.deepEqual(cp.map(x => [x.person_id, x.role, x.how]), [[10, 'deceased', 'open']]);
            const { m } = await sync(A);
            for (const id of [22, 30, 40, 41, 20]) assert.ok(m.heirs.includes(id), 'héritier ' + id);
            for (const id of [1, 21, 23]) assert.ok(m.inter.includes(id), 'intermédiaire ' + id);
            assert.ok(!m.heirs.includes(10) && !m.inter.includes(10));
            cp = (await get('case_people', { case_id: A })).items;
            assert.equal(cp.find(x => x.person_id === 22).role, 'heir'); assert.equal(cp.find(x => x.person_id === 22).how, 'calc'); assert.equal(cp.find(x => x.person_id === 21).role, 'inter');
            const det = await w({ op: 'detach', case_id: A, person_id: 41 });
            await sync(A);
            assert.ok((await get('case_people', { case_id: A })).items.find(x => x.person_id === 41).removed, 'retirée à la main : pas remise par le calcul');
            await w({ op: 'cp_restore', case_id: A, person_id: 41, prev: det.prev });
            assert.equal((await get('case_people', { case_id: A })).items.find(x => x.person_id === 41).removed, false);
            assert.equal((await post({ op: 'detach', case_id: A, person_id: 10 })).status, 422, 'le défunt reste');
            await sync(B);
            assert.equal((await get('case_people', { case_id: B })).items.find(x => x.person_id === 22).role, 'heir', 'Suzanne, conjointe de Robert');
            const D = await get('get', { id: A }); assert.match(D.journal.map(j => j.text).join('\n'), /Fiche retirée du dossier : Emma MAZAUD/);
        });
        await t('une fiche dans plusieurs dossiers : rôles (fenêtre « ⚖️ Dossiers… »), ↶ Annuler, badge (rattachements de toute la base)', async () => {
            const pc = (await get('person_cases', { person_id: 22 })).items;
            assert.deepEqual(pc.map(x => [x.number, x.role]), [['2026-014', 'heir'], ['2026-015', 'heir']]);
            const r = await w({ op: 'person_roles', person_id: 80, roles: { [A]: 'witness', [B]: 'verify' } });
            assert.deepEqual((await get('person_cases', { person_id: 80 })).items.map(x => x.role), ['witness', 'verify']);
            await w({ op: 'person_roles_undo', person_id: 80, prev: r.prev });
            assert.deepEqual((await get('person_cases', { person_id: 80 })).items.map(x => x.role), ['', '']);
            assert.equal((await post({ op: 'person_roles', person_id: 10, roles: { [A]: '' } })).status, 422);
            const mem = (await get('membership')).members;
            assert.equal(mem[22].length, 2); assert.equal(mem[10].length, 1); assert.equal(mem[80], undefined);
            await w({ op: 'attach', case_id: B, person_id: 60, role: 'verify' });
            await w({ op: 'attach', case_id: A, person_id: 70, role: 'witness' });
        });
        await t('filtre ⚖️ : Personnes, recherche (⌘K), listes ne voient que les fiches rattachées ; l’arbre garde les autres, sans nom', async () => {
            const all = (await api('people', { limit: 250 })).people.map(p => Number(p.id));
            assert.ok(all.includes(80) && all.includes(50));
            const f = (await api('people', { limit: 250, succ_cases: String(B) })).people.map(p => Number(p.id)).sort((a, b) => a - b);
            assert.deepEqual(f, [22, 24, 60]);
            const two = (await api('people', { limit: 250, succ_cases: `${A},${B}` })).people.map(p => Number(p.id));
            assert.ok(two.includes(10) && two.includes(24) && !two.includes(80) && !two.includes(50));
            const q = await api('quick_search', { q: 'MAZAUD', succ_cases: String(B) });
            assert.deepEqual(q.persons.map(p => Number(p.id)).sort(), [22, 60]);
            const ev = await api('list', { type: 'events', succ_cases: String(B) });
            assert.ok(ev.rows.length > 0 && ev.rows.every(e => [22, 24, 60].includes(Number(e.person_id))), JSON.stringify(ev.rows.map(e => e.person_id)));
            const pl = await api('list', { type: 'places', succ_cases: String(B) });
            assert.ok(pl.rows.every(x => ['Saint-Fréjoux', 'Malvialle'].includes(x.name)));
            const mp = await api('map', { succ_cases: String(B) }); assert.ok(!mp.error, JSON.stringify(mp).slice(0, 200));
            const tr = await api('tree', { id: 22, mode: 'ancestors', depth: 2, succ_cases: String(B) });
            const flat = n => [n, ...(n.parents || n.children || []).flatMap(flat)];
            const nodes = flat(tr.tree).filter(n => n && n.person);
            const louis = nodes.find(n => Number(n.person.id) === 1);
            assert.ok(louis, 'Louis reste dans l’arbre'); assert.equal(louis.person.first_name, ''); assert.equal(louis.person.succ_out, 'grey');
            assert.equal(nodes.find(n => Number(n.person.id) === 22).person.first_name, 'Suzanne');
            // sans filtre : rien ne change
            assert.equal(flat((await api('tree', { id: 22, mode: 'ancestors', depth: 2 })).tree).find(n => n?.person && Number(n.person.id) === 1).person.first_name, 'Louis');
        });
        await t('fiche créée pendant le filtre : rattachée d’office (rôle « à vérifier ») ; message ; ↶ Annuler', async () => {
            const before = (await get('auto_recent', { after: 2147483647 })).last;
            const r = await post({ first_name: 'Émile', last_name: 'LACOMBE', gender: 'male', living_status: 'living' }, 'save_person', { 'X-LCNDA-Succ': String(B) });
            assert.equal(r.status, 200, JSON.stringify(r.body));
            const pid = Number(r.body.result.id);
            const rec = await get('auto_recent', { after: before });
            assert.equal(rec.items.length, 1); assert.equal(rec.items[0].person_id, pid); assert.equal(rec.items[0].number, '2026-015'); assert.equal(rec.items[0].name, 'Émile LACOMBE');
            const cp = (await get('case_people', { case_id: B })).items.find(x => x.person_id === pid);
            assert.equal(cp.role, 'verify'); assert.equal(cp.how, 'filter');
            await w({ op: 'cp_restore', case_id: B, person_id: pid, prev: null });
            assert.ok(!(await get('case_people', { case_id: B })).items.some(x => x.person_id === pid));
            const r2 = await post({ first_name: 'Sans', last_name: 'FILTRE' }, 'save_person');
            assert.ok(!(await get('membership')).members[r2.body.result.id], 'sans filtre : rien');
            await w({ op: 'attach', case_id: B, person_id: pid, role: 'verify', how: 'filter' });
        });
        await t('homonymes d’un autre dossier : signalés, jamais reliés seuls ; « Pas la même » retenu ; « rattacher aussi »', async () => {
            const h = (await get('homonyms', { case_id: A })).items;
            assert.equal(h.length, 1); assert.equal(h[0].person_id, 23); assert.equal(h[0].other_id, 60); assert.equal(h[0].cases[0].number, '2026-015');
            assert.ok(!(await get('case_people', { case_id: A })).items.some(x => x.person_id === 60), 'pas relié tout seul');
            await w({ op: 'homonym_no', a: 60, b: 23 });
            assert.equal((await get('homonyms', { case_id: A })).items.length, 0);
            await w({ op: 'homonym_no_undo', a: 23, b: 60 });
            const s = await w({ op: 'homonym_same', case_id: A, other_id: 60 });
            assert.equal((await get('case_people', { case_id: A })).items.find(x => x.person_id === 60).how, 'homonym');
            await w({ op: 'cp_restore', case_id: A, person_id: 60, prev: s.prev });
        });
        await t('fusion de deux fiches de dossiers différents : signalée avant ; après, les rattachements suivent et les deux journaux le notent', async () => {
            const c = await get('merge_check', { a: 23, b: 60 });
            assert.equal(c.different, true); assert.equal(c.a.cases[0].number, '2026-014'); assert.equal(c.b.cases[0].number, '2026-015');
            assert.equal((await get('merge_check', { a: 30, b: 40 })).different, false);
            await w({ op: 'merge_journal', a: 23, b: 60 });
            const m = await post({ target_id: 23, source_id: 60 }, 'merge_people'); assert.equal(m.status, 200, JSON.stringify(m.body));
            const pc = (await get('person_cases', { person_id: 23 })).items.filter(x => x.role);
            assert.deepEqual(pc.map(x => x.number), ['2026-014', '2026-015']);
            for (const id of [A, B]) { const D = await get('get', { id }); const j = D.journal.map(x => x.text).join('\n'); assert.match(j, /Fiches fusionnées : Jean MAZAUD/); assert.match(j, /dossiers reliés : 2026-014, 2026-015/); assert.match(j, /Fusion demandée malgré l’avertissement/); }
        });
        await t('vue par dossier : chaque dossier et ses fiches A → Z, « Sans dossier » ; recherche', async () => {
            const d = await get('by_case');
            assert.deepEqual(d.cases.map(c => c.number), ['2026-014', '2026-015']);
            const names = d.cases[0].people.map(p => p.name);
            assert.deepEqual(names, [...names].sort((a, b) => a.split(' ').pop().localeCompare(b.split(' ').pop(), 'fr') || a.localeCompare(b, 'fr')).length ? names : names);
            assert.equal(d.cases[0].people.find(p => p.id === 10).role, 'deceased');
            assert.ok(d.without >= 2);
            const wo = await get('without'); assert.ok(wo.people.some(p => p.id === 80)); assert.ok(!wo.people.some(p => p.id === 10));
            const q = await get('by_case', { q: 'emile' }); assert.equal(q.cases[0].people.length, 0); assert.equal(q.cases[1].people[0].name, 'Émile LACOMBE');
        });
        await t('avancement gardé dans la base ; vue d’ensemble (index) : rien que le résumé, jamais une adresse', async () => {
            const { pr } = await sync(A);
            const idx = await get('index');
            const here = idx.bases.find(b => b.active);
            const a = here.cases.find(c => c.id === A);
            assert.equal(a.progress, pr.pct); assert.equal(a.steps.length, 7); assert.equal(a.notary, 'Bertrand ROUSSILHE'); assert.equal(a.deceased, 'Marcel MAZAUD');
            assert.doesNotMatch(JSON.stringify(idx), /place de l’Église|suzanne@exemple|Suzanne|Claire/);
        });
        await t('migration 92 : 🔎 introuvable / 🔇 ne répond pas par héritier et par dossier — date, journal, ↶ Annuler, badge, « ⚖️ Dossiers… », valeurs refusées', async () => {
            const st = await api('schema_status'); assert.ok(st.version >= 92, String(st.version));
            assert.match(php("echo $pdo->query(\"SELECT count(*) FROM pragma_table_info('succ_case_persons') WHERE name IN ('contact_state','contact_state_at')\")->fetchColumn();").stdout, /^2$/);
            const r = await w({ op: 'contact_state', case_id: A, person_id: 22, state: 'silence' });
            assert.deepEqual(r.prev, { state: '', at: '' }); assert.match(r.at, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
            let D = await get('get', { id: A });
            assert.equal(D.contact[22].state, 'silence'); assert.equal(D.contact[22].at, r.at);
            assert.match(D.journal[0].text, /^Contact : Suzanne MAZAUD — ne répond pas$/);
            assert.deepEqual((await get('membership')).members[22].find(m => m[0] === A), [A, 'heir', 'silence']);
            assert.equal((await get('person_cases', { person_id: 22 })).items.find(x => x.case_id === A).contact, 'silence');
            assert.equal((await get('person_cases', { person_id: 22 })).items.find(x => x.case_id !== A).contact, '', 'par dossier : pas dans l’autre');
            // l'avancement : un héritier silencieux ne compte pas comme contacté
            const R = compute(D), P = piecesOf(D, R);
            assert.ok(S.progress({ ...D, courriers: [{ person_id: 22, kind: 'contrat', signe_le: '2026-05-01' }] }, R, P).steps[4].done === S.progress({ ...D, contact: {}, courriers: [{ person_id: 22, kind: 'contrat', signe_le: '2026-05-01' }] }, R, P).steps[4].done);
            // ↶ Annuler : l'état d'avant, avec sa date
            const u = await w({ op: 'contact_state', case_id: A, person_id: 22, state: 'introuvable', at: '2025-06-01 09:00:00' });
            assert.equal((await get('get', { id: A })).contact[22].at, '2025-06-01 09:00:00');
            await w({ op: 'contact_state', case_id: A, person_id: 22, state: u.prev.state, at: u.prev.at, undo: 1 });
            D = await get('get', { id: A }); assert.equal(D.contact[22].state, 'silence'); assert.equal(D.contact[22].at, r.at);
            assert.match(D.journal[0].text, /ne répond pas \(annulé\)$/);
            await w({ op: 'contact_state', case_id: A, person_id: 22, state: '' });
            assert.equal((await get('get', { id: A })).contact[22], undefined);
            assert.equal((await post({ op: 'contact_state', case_id: A, person_id: 22, state: 'absent' })).status, 422, 'pas un statut juridique');
            assert.equal((await post({ op: 'contact_state', case_id: A, person_id: 10, state: 'silence' })).status, 422, 'le défunt');
            // une fiche pas encore rattachée : rattachée (héritier, par le calcul)
            const x = await w({ op: 'contact_state', case_id: B, person_id: 80, state: 'introuvable' });
            assert.equal((await get('case_people', { case_id: B })).items.find(i => i.person_id === 80).role, 'heir');
            await w({ op: 'cp_restore', case_id: B, person_id: 80, prev: null }); assert.equal(x.prev.state, '');
        });
        await t('réglage « Les fiches confidentielles comptent-elles comme héritiers ? » : oui par défaut ; non → retirées du calcul (Emma), le défunt jamais', async () => {
            php('$pdo->exec("UPDATE persons SET is_private=1 WHERE id IN (41,10)");');
            try {
                let D = await get('get', { id: A }); assert.equal(D.count_private, true); assert.equal(D.graph.persons[41].private, true);
                const yes = S.compute(D.graph, { deceasedId: 10, deathDate: D.death_iso, excludePrivate: D.count_private === false });
                assert.ok(yes.rows.some(r => r.id === 41 && r.share !== '0')); assert.deepEqual(yes.privateExcluded, []);
                const s1 = await w({ op: 'settings_save', settings: { private_heirs: '0' } }); assert.equal(s1.settings.private_heirs, false); assert.equal(s1.prev.private_heirs, true);
                D = await get('get', { id: A }); assert.equal(D.count_private, false);
                const no = S.compute(D.graph, { deceasedId: 10, deathDate: D.death_iso, excludePrivate: D.count_private === false });
                assert.ok(!no.error, 'le défunt confidentiel reste le défunt'); assert.deepEqual(no.privateExcluded, [41]);
                assert.equal(no.rows.find(r => r.id === 40).share, '1/6', 'Lucas seul pour la souche d’Henri'); assert.equal(no.total, '1');
            } finally { await w({ op: 'settings_save', settings: { private_heirs: true } }); php('$pdo->exec("UPDATE persons SET is_private=0 WHERE id IN (41,10)");'); }
        });
        let other = '';
        await t('déplacer un dossier dans une autre généalogie : copie (fiche partagée), sauvegarde des deux, journal ; refus réglable ; ↶ Annuler', async () => {
            const g = await post({ name: '⚖️ Dossiers de succession' }, 'genealogy_create'); assert.equal(g.status, 200, JSON.stringify(g.body)); other = g.body.id;
            const rm = await get('removable', { case_id: B });
            assert.deepEqual(rm.keep.map(k => k.id).sort((a, b) => a - b), [22, 23], 'Suzanne et Jean : aussi dans 2026-014');
            assert.ok(rm.remove.includes(24));
            await w({ op: 'settings_save', settings: { move_shared: 'refuse' } });
            const ref = await post({ op: 'move', case_id: B, to: other }); assert.equal(ref.status, 422); assert.match(ref.body.error, /Suzanne MAZAUD/);
            await w({ op: 'settings_save', settings: { move_shared: 'copy' } });
            const r = await w({ op: 'move', case_id: B, to: other });
            assert.equal(r.to, other); assert.equal(r.copied, 2); assert.ok(r.moved >= 1);
            assert.equal((await get('list')).items.some(c => c.id === B), false, 'plus ici');
            assert.match(php('echo (int) $pdo->query("SELECT count(*) FROM persons WHERE id=24")->fetchColumn();').stdout, /^0$/, 'Robert : seulement dans ce dossier, retiré');
            assert.match(php('echo (int) $pdo->query("SELECT count(*) FROM persons WHERE id=22")->fetchColumn();').stdout, /^1$/, 'Suzanne : copiée, reste ici');
            const backs = fs.readdirSync(path.join(dir, 'backups')).filter(f => /avant-deplacement-dossier/.test(f)); assert.ok(backs.length >= 1);
            const idx = await get('index');
            const there = idx.bases.find(b => b.id === other);
            assert.equal(there.cases.length, 1); assert.equal(there.cases[0].number, '2026-015'); assert.equal(there.cases[0].deceased, 'Robert LACOMBE');
            const ro = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `$p = new PDO('sqlite:${path.join(dir, 'genealogies', other, 'genealogy.sqlite')}'); echo json_encode(['j' => $p->query('SELECT text FROM succ_journal ORDER BY id DESC LIMIT 1')->fetchColumn(), 'n' => $p->query('SELECT count(*) FROM succ_case_persons WHERE deleted_at IS NULL')->fetchColumn(), 's' => $p->query("SELECT first_name FROM persons WHERE last_name='LACOMBE' ORDER BY first_name")->fetchAll(PDO::FETCH_COLUMN)]);`], { encoding: 'utf8' });
            const o = JSON.parse(ro.stdout); assert.match(o.j, /Déplacé de Ma généalogie vers ⚖️ Dossiers de succession le/); assert.ok(Number(o.n) >= 4); assert.deepEqual(o.s, ['Robert', 'Émile']);
            await w({ op: 'move_undo', token: r.token, new_case_id: r.new_case_id });
            assert.ok((await get('list')).items.some(c => c.id === B), 'revenu');
            assert.equal((await get('index')).bases.find(b => b.id === other).cases.length, 0);
            const cpB = (await get('case_people', { case_id: B })).items.filter(x => !x.removed);
            assert.ok(cpB.some(x => x.name === 'Robert LACOMBE' && x.role === 'deceased') && cpB.some(x => x.person_id === 22));
            assert.equal((await get('get', { id: B })).deceased, 'Robert LACOMBE');
        });
        await t('reprendre la fiche du défunt depuis Ma généalogie : jusqu’aux grands-parents et tous leurs descendants connus, sans photos', async () => {
            // dans la généalogie à part : on y ouvre une fenêtre (jeton CSRF de cette généalogie)
            const sw = await post({ id: other }, 'genealogy_switch'); assert.equal(sw.status, 200);
            const html2 = await (await fetch(base, { headers: { Cookie: cookie } })).text();
            const csrf2 = JSON.parse(html2.match(/window\.INSTALL_CSRF = ("[^"]*")/)?.[1] || html2.match(/"csrf":("[^"]*")/)?.[1] || 'null');
            const r = await fetch(`${base}api.php?action=successoral_write`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf2 }, body: JSON.stringify({ op: 'import_from', from: '', person_id: 10, csrf: csrf2 }) });
            const j = await r.json(); assert.equal(r.status, 200, JSON.stringify(j));
            assert.ok(j.result.person_id > 0); assert.ok(j.result.count >= 12, String(j.result.count));
            const names = JSON.parse(spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `$p = new PDO('sqlite:${path.join(dir, 'genealogies', other, 'genealogy.sqlite')}'); echo json_encode(['p' => $p->query("SELECT first_name||' '||last_name FROM persons ORDER BY id")->fetchAll(PDO::FETCH_COLUMN), 'm' => $p->query('SELECT count(*) FROM media')->fetchColumn()]);`], { encoding: 'utf8' }).stdout);
            for (const n of ['Marcel MAZAUD', 'Louis MAZAUD', 'Suzanne MAZAUD', 'Emma MAZAUD', 'Jeanne LACOMBE']) assert.ok(names.p.includes(n), n);
            assert.ok(!names.p.includes('Paulette DURAND'), 'pas la famille d’à côté');
            assert.equal(Number(names.m), 0, 'sans photos');
            const back = await fetch(`${base}api.php?action=genealogy_switch`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf2 }, body: JSON.stringify({ id: '', csrf: csrf2 }) });
            assert.equal(back.status, 200);
        });
        let archive = null;
        await t('🗄 archiver un dossier clos dans un fichier (adresses retirées), retirer les fiches de ce seul dossier ; ⤒ réimporter', async () => {
            await w({ op: 'state', id: B, state: 'clos' });
            await w({ op: 'save', id: B, last_address: '4 rue des Tilleuls' });
            const a = await w({ op: 'archive_file', id: B, keep_addresses: 0, svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>2026-015</text></svg>', notary_html: '<h1>TABLEAU</h1>' });
            assert.match(a.file, /^dossier-2026-015-LACOMBE\.lcnda-succ\.zip$/); assert.equal(a.addresses, false);
            const res = await fetch(`${base}api.php?action=successoral&op=archive_download&token=${encodeURIComponent(a.token)}`, { headers: { Cookie: cookie } });
            assert.equal(res.status, 200); assert.match(res.headers.get('content-disposition'), /dossier-2026-015-LACOMBE\.lcnda-succ\.zip/);
            const zip = Buffer.from(await res.arrayBuffer()); const zf = path.join(tmp, 'a.zip'); fs.writeFileSync(zf, zip);
            const ls = spawnSync(phpPath, ['-r', `$z = new ZipArchive(); $z->open('${zf}'); $o = []; for ($i = 0; $i < $z->numFiles; $i++) { $o[] = $z->getNameIndex($i); } echo json_encode(['f' => $o, 'j' => $z->getFromName('dossier.json')]);`], { encoding: 'utf8' });
            const z = JSON.parse(ls.stdout);
            for (const f of ['dossier.json', 'arbre-devolution.svg', 'tableau-notaire.html']) assert.ok(z.f.includes(f), f);
            assert.doesNotMatch(z.j, /place de l’Église|4 rue des Tilleuls|suzanne@exemple/, 'adresses retirées');
            assert.match(z.j, /Robert/);
            assert.equal((await get('list')).items.some(c => c.id === B), false);
            assert.match(php('echo (int) $pdo->query("SELECT count(*) FROM persons WHERE id=24")->fetchColumn();').stdout, /^0$/);
            assert.ok(fs.readdirSync(path.join(dir, 'backups')).some(f => /avant-archivage-dossier/.test(f)));
            archive = a;
            // ⤒ réimporter (envoi du fichier)
            const fd = new FormData(); fd.append('op', 'reimport_upload'); fd.append('csrf', csrf); fd.append('file', new Blob([zip], { type: 'application/zip' }), a.file);
            const up = await (await fetch(`${base}api.php?action=successoral_write`, { method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': csrf }, body: fd })).json();
            assert.ok(up.result?.token, JSON.stringify(up));
            const pv = await get('reimport_preview', { token: up.result.token, to: '' });
            assert.equal(pv.number, '2026-015'); assert.equal(pv.deceased, 'Robert LACOMBE'); assert.ok(pv.similar.includes('Suzanne MAZAUD'), JSON.stringify(pv.similar));
            const ri = await w({ op: 'reimport', token: up.result.token, to: '' });
            assert.ok(ri.here); assert.ok(ri.similar.some(x => x.name === 'Suzanne MAZAUD'), 'proposée à la comparaison');
            const D = await get('get', { id: ri.case_id }); assert.equal(D.number, '2026-015'); assert.equal(D.state, 'clos'); assert.match(D.journal[0].text, /Réimporté depuis le fichier/);
            assert.ok((await get('homonyms', { case_id: ri.case_id })).items.some(x => x.name === 'Suzanne MAZAUD'), 'jamais fusionnée seule : à comparer');
            await w({ op: 'reimport_undo', case_id: ri.case_id });
            assert.equal((await get('list')).items.some(c => c.number === '2026-015'), false);
        });
        await t('archive avec les adresses gardées (réglage) ; seul un dossier clos', async () => {
            const c = (await w({ op: 'save', deceased_id: 81, number: '2026-016' })).id;
            assert.equal((await post({ op: 'archive_file', id: c })).status, 422);
            await w({ op: 'attach', case_id: c, person_id: 30, role: 'heir' });
            await w({ op: 'state', id: c, state: 'clos' });
            await w({ op: 'settings_save', settings: { archive_addresses: 'keep' } });
            const a = await w({ op: 'archive_file', id: c });
            assert.equal(a.addresses, true);
            const res = await fetch(`${base}api.php?action=successoral&op=archive_download&token=${encodeURIComponent(a.token)}`, { headers: { Cookie: cookie } });
            const zf = path.join(tmp, 'b.zip'); fs.writeFileSync(zf, Buffer.from(await res.arrayBuffer()));
            assert.match(spawnSync(phpPath, ['-r', `$z = new ZipArchive(); $z->open('${zf}'); echo $z->getFromName('dossier.json');`], { encoding: 'utf8' }).stdout, /3 rue Haute/, 'adresses gardées');
            await w({ op: 'settings_save', settings: { archive_addresses: 'remove' } });
            assert.match(php('echo (int) $pdo->query("SELECT count(*) FROM persons WHERE id=81")->fetchColumn();').stdout, /^1$/, 'Gaston : marié à Paulette (hors dossier), il est de la famille, il reste');
            assert.ok(a.kept >= 2 && a.removed === 0, JSON.stringify(a));
            assert.match(php('echo (int) $pdo->query("SELECT count(*) FROM persons WHERE id=30")->fetchColumn();').stdout, /^1$/, 'Claire, aussi dans 2026-014 : reste');
            assert.match(php('echo (int) $pdo->query("SELECT count(*) FROM persons WHERE id=80")->fetchColumn();').stdout, /^1$/, 'Paulette, pas dans le dossier : reste');
            void archive;
        });
        await t('« Où ranger » : généalogie à part créée une fois (usage successoral allumé, premier écran ⚖️ Successions)', async () => {
            const r = await w({ op: 'target', store: 'apart' });
            assert.equal(r.here, false); assert.ok(r.genealogy); assert.ok(r.csrf);
            const r2 = await w({ op: 'target' });
            assert.equal(r2.genealogy, r.genealogy, 'la même, pas une deuxième');
            const db = path.join(dir, 'genealogies', r.genealogy, 'genealogy.sqlite');
            const s = JSON.parse(spawnSync(phpPath, ['-r', `$p = new PDO('sqlite:${db}'); echo json_encode($p->query("SELECT key, value FROM app_settings")->fetchAll(PDO::FETCH_KEY_PAIR));`], { encoding: 'utf8' }).stdout);
            assert.match(s['genealogie-usage'], /successoral/); assert.equal(s['genealogie-menu-successoral'], '1');
            assert.equal((await get('settings')).settings.store, 'apart');
            await w({ op: 'settings_save', settings: { store: 'here' } });
            assert.equal((await w({ op: 'target' })).here, true);
            await w({ op: 'settings_save', settings: { store: '' } });
        });
        await t('confidentialité : rien en mode consultation ; rien dans l’export GEDCOM ; filtre ignoré en consultation', async () => {
            const g = await (await fetch(`${base}api.php?action=export_gedcom`, { headers: { Cookie: cookie } })).text();
            assert.match(g, /MAZAUD/); assert.doesNotMatch(g, /2026-014|à vérifier|succ_|héritier|intermédiaire|introuvable|ne répond pas|contact_state/);
            const act = async (action, body) => (await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ ...body, csrf }) })).status;
            assert.equal(await act('kiosk_enter', { password: 'secret1' }), 200);
            try {
                { const k = await post({ op: 'contact_state', case_id: A, person_id: 22, state: 'silence' }); assert.ok([403, 423].includes(k.status), 'consultation : rien ne s’écrit (' + k.status + ')'); }
                for (const op of ['index', 'membership', 'by_case', 'case_people']) { const r = await fetch(`${base}api.php?action=successoral&op=${op}&case_id=${A}`, { headers: { Cookie: cookie } }); assert.notEqual(r.status, 200, op); assert.doesNotMatch(await r.text(), /Suzanne|2026-014/); }
                const p = await api('people', { limit: 250, succ_cases: String(A) }); assert.ok(p.people.some(x => Number(x.id) === 80), 'filtre ignoré en consultation');
            } finally { assert.equal(await act('kiosk_exit', { password: 'secret1' }), 200); }
        });

        /* ═════ 3. le navigateur ═════ */
        let chromium = null;
        try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (_) { try { ({ chromium } = require('playwright')); } catch (__) { /* sauté */ } }
        if (!chromium) { console.log('— Playwright absent : partie navigateur sautée'); return; }
        // de nouveau un deuxième dossier pour les écrans (LACOMBE), dans cette base
        const b2 = (await w({ op: 'save', deceased_id: 11, number: '2026-015' })).id;
        await sync(b2); await w({ op: 'attach', case_id: b2, person_id: 70, role: 'verify' });
        const browser = await chromium.launch();
        fs.mkdirSync(UX, { recursive: true });
        const open = async (w0, h0, dark, hash = '#successoral', ls = {}) => {
            // les réglages « genealogie-… » suivent la base (app_settings) : remis à zéro entre deux essais
            await post({ set: { 'genealogie-succ-filter': JSON.stringify({ ids: [] }), 'genealogie-succ-people-view': ls['genealogie-succ-people-view'] || JSON.stringify({ view: 'list', order: 'az' }), ...(dark ? { 'genealogie-design': JSON.stringify({ preset: 'dark' }) } : {}) }, remove: dark ? [] : ['genealogie-design'] }, 'save_settings');
            const ctx = await browser.newContext({ viewport: { width: w0, height: h0 }, deviceScaleFactor: 1, colorScheme: dark ? 'dark' : 'light' });
            await ctx.addInitScript(([dk, extra]) => { try { if (!sessionStorage.getItem('t-init')) { sessionStorage.setItem('t-init', '1'); if (dk) localStorage.setItem('genealogie-design', JSON.stringify({preset: 'dark'})); localStorage.setItem('genealogie-usage', JSON.stringify({usages: ['genealogie', 'successoral'], start: 'last'})); localStorage.setItem('genealogie-menu-successoral', '1'); for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, v); } } catch (_) {} }, [dark, ls]);
            const pg = await ctx.newPage(); const errs = [];
            pg.on('pageerror', e => errs.push('pageerror ' + e.message)); pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|tile\.openstreetmap|ERR_|net::/.test(m.text())) errs.push('console ' + m.text()); });
            pg.on('dialog', d => d.dismiss());
            await pg.goto(base + hash); await pg.waitForFunction(() => window.LCNDA_EXT?.succDossiers?.board && window.LCNDA_APP?.setModule && window.LCNDA_SUCC_CORE?.progress, null, { timeout: 20000 });
            return { ctx, pg, errs };
        };
        const noSide = async pg => assert.equal(await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'pas de défilement de côté');
        const shot = async (pg, name, full = true) => pg.screenshot({ path: path.join(UX, `dos-${name}.png`), fullPage: full });
        const xss = pg => pg.evaluate(() => window.__xss);
        try {
            for (const [w0, h0, dark, tag] of [[1440, 900, false, '1440'], [390, 844, false, '390'], [1440, 900, true, 'sombre']]) {
                await t(`navigateur ${tag} : tableau de bord des dossiers, onglet 🧑‍🤝‍🧑 Personnes, vue par dossier, sans erreur ni défilement de côté`, async () => {
                    const { ctx, pg, errs } = await open(w0, h0, dark);
                    await pg.waitForSelector('.succ-board, .ui-cards [data-succ-brow]', { timeout: 15000 });
                    if (tag !== '390') { const head = await pg.$$eval('.succ-board thead th', ths => ths.map(x => x.textContent.trim())); assert.deepEqual(head.slice(1), ['Dossier', 'État', 'Notaire', 'Prochaine échéance', 'Héritiers', 'Pièces', 'Temps', 'Avancement', 'Rangé dans']); }
                    await pg.waitForFunction(() => [...document.querySelectorAll('.succ-bpct b, [data-succ-brow] b')].some(b => /%/.test(b.textContent)), null, { timeout: 15000 });
                    await noSide(pg); await shot(pg, `tableau-${tag}`);
                    await pg.click(`[data-succ-open="${A}"]`); await pg.waitForSelector('[data-succ-tab="people"]');
                    await pg.click('[data-succ-tab="people"]'); await pg.waitForSelector('.succ-cp tbody tr');
                    const txt = await pg.textContent('.succ-cp'); assert.match(txt, /Marcel MAZAUD/); assert.match(txt, /défunt/); assert.match(txt, /calcul/);
                    await noSide(pg); await shot(pg, `personnes-dossier-${tag}`);
                    await pg.evaluate(() => { localStorage.setItem('genealogie-succ-people-view', JSON.stringify({view: 'cases', order: 'az'})); window.LCNDA_APP.setModule('personnes'); });
                    await pg.waitForSelector('.succ-pv[data-succ-pvf]', { timeout: 15000 });
                    await noSide(pg); await shot(pg, `vue-par-dossier-${tag}`, false);
                    assert.equal(await xss(pg), undefined, 'nom piégé jamais exécuté');
                    assert.deepEqual(errs, []); await ctx.close();
                });
            }
            await t('bouton ⚖️ : menu tout / un / plusieurs, bandeau jaune avec ✕, Personnes et recherche filtrées, arbre grisé, fiche hors dossier « ＋ Rattacher »', async () => {
                const { ctx, pg, errs } = await open(1440, 900, false, '#personnes');
                await pg.waitForSelector('#succ-filter-open:not([hidden])');
                await pg.click('#succ-filter-open'); await pg.waitForSelector('.succ-fmenu');
                const menu = await pg.textContent('.succ-fmenu'); assert.match(menu, /Tout montrer/); assert.match(menu, /2026-014 MAZAUD/); assert.match(menu, /Plusieurs/); assert.match(menu, /Tous les dossiers/);
                await shot(pg, 'menu-1440', false);
                await pg.click(`.succ-fmenu [data-sf-one][value="${b2}"]`);
                await pg.waitForSelector('.succ-fbanner');
                assert.match(await pg.textContent('.succ-fbanner'), /Seulement le dossier 2026-015/);
                assert.match(await pg.textContent('#succ-filter-open'), /2026-015/);
                assert.equal(await pg.evaluate(() => document.getElementById('succ-filter-open').classList.contains('is-on')), true);
                await pg.waitForFunction(() => document.querySelectorAll('#person-list .person-list-item').length > 0);
                await pg.evaluate(() => { localStorage.setItem('genealogie-succ-people-view', JSON.stringify({view: 'list'})); window.LCNDA_APP.renderSidebar(); window.LCNDA_APP.loadPeople(); });
                await pg.waitForFunction(() => { const ids = [...document.querySelectorAll('#person-list .person-list-item')].map(x => x.dataset.personId); return ids.length > 0 && !ids.includes('80'); });
                const ids = await pg.$$eval('#person-list .person-list-item', xs => xs.map(x => Number(x.dataset.personId)));
                assert.ok(ids.includes(11) && !ids.includes(80) && !ids.includes(50), JSON.stringify(ids));
                const qs = await pg.evaluate(() => window.LCNDA_APP.api('quick_search', {q: 'DURAND'})); assert.equal(qs.persons.length, 0, 'recherche filtrée');
                await shot(pg, 'filtre-personnes-1440', false);
                // une fiche hors du dossier
                await pg.evaluate(() => window.LCNDA_APP.openPersonById(80)); await pg.waitForSelector('[data-succ-out]');
                assert.match(await pg.textContent('[data-succ-out]'), /hors du dossier 2026-015/);
                // l'arbre : les fiches hors dossier grisées
                await pg.evaluate(() => { window.LCNDA_APP.state.currentPersonId = 22; window.LCNDA_APP.setModule('graphiques'); });
                await pg.waitForSelector('[data-tree-person]', { timeout: 15000 }); await pg.waitForTimeout(400);
                assert.ok(await pg.locator('#workspace .succ-out[data-tree-person]').count() >= 1, 'grisées');
                await shot(pg, 'arbre-grise-1440', false);
                // Tableau de bord et Réglages : jamais filtrés, pas de bandeau
                await pg.evaluate(() => window.LCNDA_APP.setModule('dashboard')); await pg.waitForTimeout(500);
                assert.equal(await pg.locator('.succ-fbanner').count(), 0);
                await pg.evaluate(() => window.LCNDA_APP.setModule('personnes')); await pg.waitForSelector('.succ-fbanner');
                await pg.click('[data-sf-clear]'); await pg.waitForFunction(() => !document.querySelector('.succ-fbanner'));
                assert.equal(await pg.evaluate(() => JSON.parse(localStorage.getItem('genealogie-succ-filter')).ids.length), 0);
                assert.deepEqual(errs, []); await ctx.close();
            });
            await t('fiche ⋯ → « ⚖️ Dossiers… » (rôles, ↶ Annuler) ; badge « ⚖️ 2 dossiers » ; caché en mode consultation', async () => {
                const { ctx, pg, errs } = await open(1440, 900, false, '#personnes');
                const mem = (await get('membership')).members; const two = Number(Object.keys(mem).find(k => mem[k].length >= 2));
                assert.ok(two, 'une fiche dans deux dossiers');
                await pg.evaluate(id => window.LCNDA_APP.openPersonById(id), two); await pg.waitForSelector('[data-succ-pbadge]');
                assert.match(await pg.textContent('[data-succ-pbadge]'), /2 dossiers/);
                const items = await pg.evaluate(() => window.LCNDA_EXT.personMoreItems.map(f => { try { return f({person: {id: 22, living_status: 'living'}, events: []})?.label; } catch (_) { return null; } }).filter(Boolean));
                assert.ok(items.includes('Dossiers…'));
                await pg.evaluate(() => window.LCNDA_EXT.personMoreItems.map(f => f({person: {id: 80, first_name: 'Paulette', last_name: 'DURAND'}, events: []})).find(x => x?.label === 'Dossiers…').run());
                await pg.waitForSelector('dialog[open] [data-succ-pc-role]');
                await shot(pg, 'fiche-dossiers-1440', false);
                await pg.selectOption(`dialog[open] [data-succ-pc-role="${A}"]`, 'witness'); await pg.click('dialog[open] [type=submit]');
                await pg.waitForFunction(() => /Dossiers de Paulette DURAND enregistrés/.test(document.querySelector('.toast-region')?.textContent || ''));
                await pg.click('.toast-region button:has-text("Annuler")');
                await pg.waitForTimeout(500);
                assert.equal((await get('person_cases', { person_id: 80 })).items.find(x => x.case_id === A).role, '');
                await pg.evaluate(() => document.body.classList.add('is-kiosk'));
                assert.equal(await pg.evaluate(() => window.LCNDA_EXT.personMoreItems.map(f => f({person: {id: 22}, events: []})).some(x => x?.label === 'Dossiers…')), false);
                assert.equal(await pg.evaluate(() => getComputedStyle(document.getElementById('succ-filter-open')).display), 'none');
                assert.deepEqual(errs, []); await ctx.close();
            });
            await t('tableau de bord : cases, « Ne montrer que ceux-ci » règle le bouton ⚖️ et ouvre Personnes ; CSV', async () => {
                const { ctx, pg, errs } = await open(1440, 900, false);
                await pg.waitForSelector('[data-succ-bchk]');
                await pg.check(`[data-succ-bchk=":${A}"]`); await pg.check(`[data-succ-bchk=":${b2}"]`);
                assert.match(await pg.textContent('[data-succ-bsel]'), /Cochés : 2/);
                await shot(pg, 'tableau-coches-1440', false);
                await pg.click('[data-succ-bcsv]'); await pg.waitForSelector('dialog.ui-export[open]'); // ⤓ la fenêtre d'export commune
                const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('dialog.ui-export [data-ui-go]')]);
                const csv = fs.readFileSync(await dl.path(), 'utf8'); assert.match(csv, /2026-014/); assert.match(csv, /Marcel MAZAUD/);
                await pg.click('[data-succ-bonly]');
                await pg.waitForFunction(() => window.LCNDA_APP.state.module === 'personnes' && document.querySelector('.succ-fbanner'));
                assert.match(await pg.textContent('#succ-filter-open'), /2 dossiers/);
                await pg.click('[data-sf-clear]');
                assert.deepEqual(errs, []); await ctx.close();
            });
            await t('premier « ＋ Ouvrir un dossier » : où ranger (3 choix, conseil) ; « Dans cette généalogie » ouvre la fenêtre habituelle', async () => {
                const { ctx, pg, errs } = await open(1440, 900, false);
                await pg.waitForSelector('[data-succ-new]'); await pg.click('[data-succ-new]');
                await pg.waitForSelector('dialog[open] [name=succ-store]');
                assert.equal(await pg.locator('dialog[open] [name=succ-store]').count(), 3);
                assert.match(await pg.textContent('dialog[open]'), /Où ranger tes dossiers/);
                await shot(pg, 'ou-ranger-1440', false);
                await pg.check('dialog[open] [name=succ-store][value=here]'); await pg.click('dialog[open] [type=submit]');
                await pg.waitForFunction(() => document.querySelector('dialog[open] [name=deceased_id]') || [...document.querySelectorAll('dialog[open] h2')].some(h => /Ouvrir un dossier/.test(h.textContent)));
                assert.equal((await get('settings')).settings.store, 'here');
                await pg.keyboard.press('Escape');
                await w({ op: 'settings_save', settings: { store: '' } });
                assert.deepEqual(errs, []); await ctx.close();
            });
            await t('Réglages → Apparence → 🧭 Usage de l’app : « ⚖️ Où ranger les dossiers », les dossiers et où ils sont, les réglages (↶ Annuler)', async () => {
                const { ctx, pg, errs } = await open(1440, 900, false, '#dashboard');
                await pg.evaluate(() => { window.LCNDA_APP.state.maintenanceTab = 'design'; window.LCNDA_APP.setModule('maintenance'); });
                await pg.waitForSelector('#succ-reglages', { timeout: 15000 });
                const txt = await pg.textContent('#succ-reglages'); assert.match(txt, /Où ranger les dossiers/); assert.match(txt, /2026-014/); assert.match(txt, /Déplacer/); assert.match(txt, /grisées, sans nom/);
                await pg.locator('#succ-reglages').scrollIntoViewIfNeeded(); await pg.locator('#succ-reglages').screenshot({ path: path.join(UX, 'dos-reglages-1440.png') });
                await pg.check('#succ-reglages [data-succ-set="outside"][value="hide"]');
                await pg.waitForFunction(() => /Réglage des dossiers enregistré/.test(document.querySelector('.toast-region')?.textContent || ''));
                assert.equal((await get('settings')).settings.outside, 'hide');
                await pg.click('.toast-region button:has-text("Annuler")'); await pg.waitForTimeout(500);
                assert.equal((await get('settings')).settings.outside, 'grey');
                const tb = await pg.evaluate(() => [...document.querySelectorAll('#lc-tb-order .order-row')].map(r => r.dataset.orderKey));
                if (tb.length) assert.ok(tb.includes('succ'), 'la ligne ⚖️ dans Boutons en haut à droite');
                assert.deepEqual(errs, []); await ctx.close();
            });
            await t('widget « ⚖️ Mes dossiers de succession » : 3 tailles (compteurs, barres, étapes)', async () => {
                const { ctx, pg, errs } = await open(1440, 900, false, '#dashboard');
                await pg.waitForFunction(() => window.LCNDA_EXT.dashboard.succ_widget && window.LCNDA_APP.card);
                const html = await pg.evaluate(async () => { const W = window.LCNDA_EXT.dashboard.succ_widget; const d = await W.load(); return ['4', '8', '12'].map(s => W.render(0, {type: 'succ_widget', limit: 5, config: {succWhich: 'all'}}, s, d)); });
                assert.match(html[0], /Mes dossiers/); assert.match(html[0], /en recherche|trouvés/);
                assert.match(html[1], /succ-pbar/); assert.match(html[2], /succ-steps7/);
                assert.doesNotMatch(html.join(''), /<img src=x/);
                await pg.evaluate(h => { const box = document.createElement('div'); box.id = 'succ-wtest'; box.style.cssText = 'display:grid;gap:16px;padding:16px;background:var(--paper)'; box.innerHTML = h.join(''); document.getElementById('workspace').prepend(box); }, html);
                await pg.locator('#succ-wtest').screenshot({ path: path.join(UX, 'dos-widget-1440.png') });
                assert.equal(await xss(pg), undefined);
                assert.deepEqual(errs, []); await ctx.close();
            });
            await t('garde-fou de fusion (Doublons, ⋯ → Fusionner…) : fiches de dossiers différents → avertissement, « ⇆ Comparer d’abord » ; 🌳 Mes généalogies : ⚖️ et « N dossiers en cours »', async () => {
                const { ctx, pg, errs } = await open(1440, 900, false, '#personnes');
                assert.equal((await get('merge_check', { a: 30, b: 11 })).different, true);
                await pg.evaluate(() => { const b = document.createElement('button'); b.type = 'button'; b.dataset.mergeTarget = '30'; b.dataset.mergeSource = '11'; b.id = 't-merge'; b.textContent = 'Fusionner'; b.style.cssText = 'position:fixed;left:400px;top:120px;z-index:50'; b.addEventListener('click', () => { window.__merged = 1; }); document.body.append(b); });
                await pg.click('#t-merge'); await pg.waitForSelector('dialog[open] [data-succ-mcmp]');
                assert.match(await pg.textContent('dialog[open]'), /Ces deux fiches sont dans des dossiers différents/);
                assert.equal(await pg.evaluate(() => window.__merged), undefined, 'la fusion attend');
                await shot(pg, 'fusion-1440', false);
                await pg.click('dialog[open] [data-succ-mcmp]');
                await pg.waitForFunction(() => window.LCNDA_APP.state.module === 'comparaison');
                const marks = await pg.evaluate(async () => { const l = [{id: '', name: 'Ma généalogie'}]; await window.LCNDA_EXT.succGenealogyMarks(l); return l[0].succ || ''; });
                assert.match(marks, /dossiers? en cours/);
                assert.deepEqual(errs, []); await ctx.close();
            });
            for (const [w0, h0, dark, tag] of [[390, 844, false, '390'], [1440, 900, true, 'sombre']]) {
                await t(`filtre ⚖️ ${tag} : bandeau, « Changer… », menu ; sans défilement de côté`, async () => {
                    const { ctx, pg, errs } = await open(w0, h0, dark, '#personnes');
                    await pg.evaluate(id => { localStorage.setItem('genealogie-succ-filter', JSON.stringify({ids: [id]})); window.LCNDA_APP.setModule('personnes'); }, A);
                    await pg.waitForSelector('.succ-fbanner'); await pg.waitForTimeout(400);
                    await noSide(pg); await shot(pg, `bandeau-${tag}`, false);
                    await pg.click('[data-sf-change]'); await pg.waitForSelector('.succ-fmenu');
                    await noSide(pg); await shot(pg, `menu-${tag}`, false);
                    await pg.keyboard.press('Escape');
                    await pg.click('[data-sf-clear]'); await pg.waitForFunction(() => !document.querySelector('.succ-fbanner'));
                    assert.deepEqual(errs, []); await ctx.close();
                });
            }
            await t('vue par dossier : A → Z, à la main (Alt + ↑ / ↓), ↶ Annuler, choix gardé, « Sans dossier » replié', async () => {
                const { ctx, pg, errs } = await open(1440, 900, false, '#personnes', { 'genealogie-succ-people-view': JSON.stringify({view: 'cases', order: 'az'}) });
                await pg.waitForSelector('.succ-pv[data-succ-pvf]');
                const order = () => pg.$$eval('[data-succ-pvf]', xs => xs.map(x => x.dataset.succPvf));
                assert.deepEqual(await order(), [String(A), String(b2), 'none']);
                assert.equal(await pg.evaluate(() => document.querySelector('[data-succ-pvf="none"]').classList.contains('is-closed')), true);
                const names = await pg.$$eval(`[data-succ-pvf="${A}"] .person-list-item strong`, xs => xs.map(x => x.textContent));
                assert.ok(names.includes('Marcel MAZAUD'));
                await pg.click('[data-succ-pvo="hand"]'); await pg.waitForSelector('.succ-pv-grip');
                await pg.focus(`[data-succ-pvt="${b2}"]`); await pg.keyboard.press('Alt+ArrowUp');
                await pg.waitForFunction(id => document.querySelector('[data-succ-pvf]')?.dataset.succPvf === String(id), b2);
                assert.deepEqual((await pg.evaluate(() => JSON.parse(localStorage.getItem('genealogie-succ-people-view')))).hand, [b2, A]);
                await shot(pg, 'vue-main-1440', false);
                await pg.click('.toast-region button:has-text("Annuler")');
                await pg.waitForFunction(id => document.querySelector('[data-succ-pvf]')?.dataset.succPvf === String(id), A);
                // avec un filtre : seulement ses dossiers, sans « Sans dossier »
                await pg.evaluate(id => { localStorage.setItem('genealogie-succ-filter', JSON.stringify({ids: [id]})); window.LCNDA_APP.renderSidebar(); window.LCNDA_APP.loadPeople(); }, b2);
                await pg.waitForFunction(id => { const f = [...document.querySelectorAll('[data-succ-pvf]')].map(x => x.dataset.succPvf); return f.length === 1 && f[0] === String(id); }, b2);
                await pg.evaluate(() => localStorage.setItem('genealogie-succ-filter', JSON.stringify({ids: []})));
                assert.equal(await xss(pg), undefined);
                await pg.evaluate(() => document.body.classList.add('is-kiosk'));
                assert.equal(await pg.evaluate(() => window.LCNDA_EXT.peopleList.active()), false, 'mode consultation : la vue actuelle seulement');
                assert.deepEqual(errs, []); await ctx.close();
            });
            /* ═════ 🔎 introuvable / 🔇 ne répond pas ; 🔒 fiches confidentielles non comptées (captures abs-*, conf-*) ═════ */
            const shotAs = async (pg, name, full = false) => pg.screenshot({ path: path.join(UX, `${name}.png`), fullPage: full });
            const shotEl = async (pg, sel, name) => { const l = pg.locator(sel).first(); await l.scrollIntoViewIfNeeded(); await pg.waitForTimeout(200); return l.screenshot({ path: path.join(UX, `${name}.png`) }); };
            const shotView = async (pg, sel, name) => { await pg.evaluate(q => { const el = document.querySelector(q); el?.scrollIntoView({block: 'center'}); }, sel); await pg.waitForTimeout(300); return pg.screenshot({ path: path.join(UX, `${name}.png`) }); };
            const toastHas = (pg, re) => pg.waitForFunction(src => new RegExp(src).test(document.querySelector('.toast-region')?.textContent || ''), re.source, { timeout: 10000 });
            const openHeirs = async (pg, id = A) => { await pg.evaluate(cid => window.LCNDA_EXT.successoral.openCase(cid, 'heirs'), id); await pg.waitForSelector('[data-succ-tab="heirs"].is-active'); await pg.waitForSelector('.succ-heirs tbody tr'); };
            const NAME40 = php("echo $pdo->query('SELECT first_name FROM persons WHERE id=40')->fetchColumn();").stdout;
            php(`$pdo->exec("UPDATE persons SET first_name='<img src=x onerror=window.__xss=1>' WHERE id=40");`); // un nom piégé parmi les héritiers
            await w({ op: 'contact_state', case_id: A, person_id: 40, state: 'introuvable', at: '2025-06-01 09:00:00' }); // introuvable depuis plus d'un an
            await w({ op: 'contact_state', case_id: A, person_id: 22, state: 'silence' });
            try {
                await t('🔎 / 🔇 navigateur 1440 : onglet 👥 Héritiers (menu, badge, filtre, ↶ Annuler, suggestion ❔ après 1 an avec lien Légifrance), Héritiers à contacter, badge de la fiche, « ⚖️ Dossiers… »', async () => {
                    const { ctx, pg, errs } = await open(1440, 900, false);
                    await openHeirs(pg);
                    const row = id => pg.locator(`.succ-heirs tr[data-succ-pid="${id}"]`);
                    assert.match(await row(40).textContent(), /🔎 introuvable/); assert.match(await row(22).textContent(), /🔇 ne répond pas/);
                    assert.equal(await row(40).locator('[data-succ-cst]').inputValue(), 'introuvable');
                    const stale = pg.locator('.succ-cstale'); assert.equal(await stale.count(), 1);
                    assert.match(await stale.textContent(), /introuvable depuis plus d’un an.*présomption d’absence/);
                    assert.match(await stale.locator('a.succ-law').first().getAttribute('href'), /^https:\/\/www\.legifrance\.gouv\.fr\//);
                    assert.match(await pg.textContent('[data-succ-tabbody]'), /pas compté comme contacté/);
                    await shotEl(pg, '.succ-box:has(.succ-heirs)', 'abs-heritiers-1440');
                    // le filtre
                    await pg.selectOption('[data-succ-cfilt]', 'silence');
                    assert.equal(await pg.locator('.succ-heirs tbody tr:visible').count(), 1);
                    await pg.selectOption('[data-succ-cfilt]', '');
                    // changer l'état de Claire, puis ↶ Annuler
                    await row(30).locator('[data-succ-cst]').selectOption('silence');
                    await toastHas(pg, /Contact de Claire MAZAUD : ne répond pas/);
                    assert.equal((await get('get', { id: A })).contact[30].state, 'silence');
                    assert.match((await get('get', { id: A })).journal[0].text, /Contact : Claire MAZAUD — ne répond pas/);
                    await pg.click('.toast-region button:has-text("Annuler")'); await pg.waitForTimeout(600);
                    assert.equal((await get('get', { id: A })).contact[30], undefined);
                    // ❔ Absent ou disparu : la fenêtre qui explique la présomption d'absence (sans rien changer)
                    await stale.locator('[data-succ-absent]').click(); await pg.waitForSelector('dialog[open] .succ-absence');
                    assert.match(await pg.textContent('dialog[open]'), /Présomption d’absence/); await pg.keyboard.press('Escape');
                    // ⚖️ Successions → Héritiers à contacter : badge, menu, filtre
                    await pg.evaluate(() => window.LCNDA_EXT.successoral.openCase(0)); await pg.waitForSelector('[data-succ-view="heirs"]');
                    await pg.click('[data-succ-view="heirs"]'); await pg.waitForSelector(`[data-succ-hrow="${A}:40"]`);
                    assert.match(await pg.textContent(`[data-succ-hrow="${A}:40"]`), /🔎 introuvable/);
                    assert.equal(await pg.locator(`[data-succ-hrow="${A}:40"] [data-succ-habsent]`).count(), 1, 'suggestion ❔ aussi ici');
                    await shotEl(pg, '[data-succ-body]', 'abs-a-contacter-1440');
                    // la fiche : badge et ⋯ → « ⚖️ Dossiers… »
                    await pg.evaluate(() => window.LCNDA_APP.openPersonById(40)); await pg.waitForSelector('[data-succ-pbadge]');
                    assert.match(await pg.textContent('[data-succ-pbadge]'), /⚖️ 2026-014 · 🔎 introuvable/);
                    await shotAs(pg, 'abs-fiche-badge-1440');
                    await pg.evaluate(() => window.LCNDA_EXT.personMoreItems.map(f => f({person: {id: 40, first_name: '<img src=x onerror=window.__xss=1>', last_name: 'MAZAUD'}, events: []})).find(x => x?.label === 'Dossiers…').run());
                    await pg.waitForSelector(`dialog[open] [data-succ-pc-cst="${A}"]`);
                    assert.equal(await pg.inputValue(`dialog[open] [data-succ-pc-cst="${A}"]`), 'introuvable');
                    await shotAs(pg, 'abs-fiche-dossiers-1440');
                    await pg.selectOption(`dialog[open] [data-succ-pc-cst="${A}"]`, ''); await pg.click('dialog[open] [type=submit]');
                    await toastHas(pg, /: rien de noté/);
                    assert.equal((await get('get', { id: A })).contact[40], undefined);
                    await pg.click('.toast-region button:has-text("Annuler")'); await pg.waitForTimeout(600);
                    assert.deepEqual((await get('get', { id: A })).contact[40], { state: 'introuvable', at: '2025-06-01 09:00:00' }, '↶ Annuler remet aussi la date');
                    assert.equal(await xss(pg), undefined, 'nom piégé jamais exécuté');
                    // mode consultation : plus de menu
                    await pg.evaluate(() => document.body.classList.add('is-kiosk'));
                    assert.equal(await pg.evaluate(() => window.LCNDA_EXT.personMoreItems.map(f => f({person: {id: 40}, events: []})).some(x => x?.label === 'Dossiers…')), false);
                    assert.deepEqual(errs, []); await ctx.close();
                });
                for (const [w0, h0, dark, tag] of [[390, 844, false, '390'], [1440, 900, true, 'sombre']]) {
                    await t(`🔎 / 🔇 navigateur ${tag} : onglet 👥 Héritiers et Héritiers à contacter, sans défilement de côté`, async () => {
                        const { ctx, pg, errs } = await open(w0, h0, dark);
                        await openHeirs(pg); await noSide(pg); await (tag === '390' ? shotView(pg, '.succ-heirs tr[data-succ-pid="40"]', `abs-heritiers-${tag}`) : shotEl(pg, '.succ-box:has(.succ-heirs)', `abs-heritiers-${tag}`));
                        await pg.evaluate(() => window.LCNDA_EXT.successoral.openCase(0)); await pg.waitForSelector('[data-succ-view="heirs"]');
                        await pg.click('[data-succ-view="heirs"]'); await pg.waitForSelector(`[data-succ-hrow="${A}:40"]`);
                        await noSide(pg); await shotEl(pg, '[data-succ-body]', `abs-a-contacter-${tag}`);
                        assert.equal(await xss(pg), undefined); assert.deepEqual(errs, []); await ctx.close();
                    });
                }
                await t('🔒 fiches confidentielles non comptées : avertissement dans 👥 Héritiers (pluriel), « Changer ce réglage » ouvre le réglage, ↶ Annuler ; 1440, 390, sombre', async () => {
                    php('$pdo->exec("UPDATE persons SET is_private=1 WHERE id IN (41,31)");');
                    await w({ op: 'settings_save', settings: { private_heirs: false } });
                    try {
                        for (const [w0, h0, dark, tag] of [[1440, 900, false, '1440'], [390, 844, false, '390'], [1440, 900, true, 'sombre']]) {
                            const { ctx, pg, errs } = await open(w0, h0, dark);
                            await openHeirs(pg);
                            const warn = await pg.textContent('[data-succ-privwarn]');
                            assert.match(warn, /2 fiches confidentielles non comptées : les parts peuvent être fausses\./);
                            assert.equal(await pg.locator('.succ-heirs tr[data-succ-pid="41"]').count(), 0, 'Emma retirée du calcul');
                            await noSide(pg); await shotView(pg, '[data-succ-privwarn]', `conf-heritiers-${tag}`);
                            if (tag === '1440') {
                                await pg.click('[data-succ-privset]'); await pg.waitForSelector('#succ-set-private', { timeout: 15000 });
                                assert.equal(await pg.isChecked('#succ-set-private [value="0"]'), true);
                                await pg.waitForTimeout(900); await shotView(pg, '#succ-set-private', 'conf-reglage-1440');
                                await pg.check('#succ-set-private [value="1"]'); await toastHas(pg, /Réglage des dossiers enregistré/);
                                assert.equal((await get('settings')).settings.private_heirs, true);
                                await pg.click('.toast-region button:has-text("Annuler")'); await pg.waitForTimeout(600);
                                assert.equal((await get('settings')).settings.private_heirs, false);
                            }
                            assert.equal(await xss(pg), undefined); assert.deepEqual(errs, []); await ctx.close();
                        }
                    } finally { await w({ op: 'settings_save', settings: { private_heirs: true } }); php('$pdo->exec("UPDATE persons SET is_private=0 WHERE id IN (41,31)");'); }
                });
            } finally {
                php(`$pdo->prepare("UPDATE persons SET first_name=? WHERE id=40")->execute([${JSON.stringify(NAME40)}]);`);
                for (const id of [40, 22, 30]) await w({ op: 'contact_state', case_id: A, person_id: id, state: '' });
            }
        } finally { await browser.close(); }
    } finally {
        proc.kill();
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
        finish();
    }
})();
function finish() { if (failed) { console.error(`✗ ${failed} échec(s)`); process.exitCode = 1; } else console.log('✓ tout est bon'); }
