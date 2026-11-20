'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * ⚖️🔐 Successoral, outils de plus : les corrections de sécurité et de justesse   node tests/test-successoral-plus2-securite.js
 *  1. sans serveur (php -r) :
 *     - copie pour le notaire : les actes d'une fiche confidentielle ne partent pas quand le réglage les laisse hors du calcul ;
 *     - questionnaire : ↶ ne défait que ce que le serveur a noté (jamais une liste venue du navigateur), corbeille, fiche verrouillée
 *       respectée (écriture et ↶) ; une réponse sans date garde la date de la fiche ;
 *     - ⚰️ INSEE : décès le même jour ou date partielle → statut « inconnu » ; « 19850000 » → « 1985 », sans erreur ; fiche verrouillée ;
 *     - 🔔 cloche : « ✓ fait » / « ⏭ reporter » des reversements et des copies d'actes sont retenus ;
 *     - 🧾 préfixes identiques refusés ; émission datée du jour (numéros et dates dans le même ordre) ; un devis, une facture ;
 *  2. le serveur : registre « cabinet » commun — une autre généalogie ne lit ni ne modifie les factures d'une généalogie verrouillée
 *     (liste, CSV, tableau de bord, avoir, payée) ; registre et numérotation figés dès la première facture.
 * Données fictives.
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
let failed = 0, checks = 0;
const t = async (name, fn) => { try { await fn(); checks++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-succ-p2-secu-'));

/** une base neuve dans son dossier, puis le code PHP donné ; rend la dernière ligne (JSON) */
const phpIn = (name, code) => {
    const dir = path.join(tmp, name); fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
if (!is_file(DATA_DIR.'/genealogy.sqlite')) { (new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'))->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); }
require 'lib/bootstrap.php'; require 'tests/api_functions.php';
$pdo = db(); succ_dossiers_ensure($pdo); succ_p2_ensure($pdo);
$tag = fn($t) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$t' ORDER BY id LIMIT 1")->fetchColumn();
$err = static function (callable $f): string { try { $f(); return ''; } catch (Throwable $e) { return $e->getMessage(); } };
` + code], { cwd: appRoot, env, encoding: 'utf8', maxBuffer: 1 << 26 });
    if (r.status !== 0) throw new Error(r.stderr || r.stdout);
    return JSON.parse(r.stdout.trim().split('\n').pop());
};

(async () => {
    /* ═════ 1. sans serveur ═════ */
    await t('S2 copie pour le notaire : l’acte d’une fiche confidentielle ne part pas (réglage « confidentielles hors du calcul ») ; il part sinon', () => {
        const o = phpIn('s2', String.raw`
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_private) VALUES(1,'Jean','DEFUNT','male','deceased',0),(2,'Paul','PUBLIC','male','living',0),(3,'Claire','CONFIDENTIELLE','female','living',1)");
$pdo->exec("INSERT INTO families(id,partner1_id) VALUES(1,1)"); $pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,2),(1,3)");
$pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year) VALUES('person',1,?,'1 mars 2020',2020)")->execute([$tag('DEAT')]);
$media = [];
foreach ([2 => 'paul', 3 => 'claire'] as $pid => $n) {
  $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year) VALUES('person',?,?,'1990',1990)")->execute([$pid, $tag('BIRT')]); $ev = (int) $pdo->lastInsertId();
  file_put_contents(MEDIA_DIR."/acte-$n.jpg", 'JPEG');
  $pdo->prepare("INSERT INTO media(filename,media_type,title) VALUES(?,?,?)")->execute(["acte-$n.jpg", 'image', "Acte de $n"]); $mid = (int) $pdo->lastInsertId();
  $pdo->exec("INSERT INTO media_links(media_id,entity_type,entity_id) VALUES($mid,'event',$ev)");
}
$cid = (int) succ_save($pdo, ['deceased_id' => 1])['id'];
succ_settings_save(['private_heirs' => false]); $off = array_column(succ_p2_piece_media($pdo, $cid), 'filename');
succ_settings_save(['private_heirs' => true]); $on = array_column(succ_p2_piece_media($pdo, $cid), 'filename');
echo json_encode(['off' => $off, 'on' => $on]);`);
        assert.deepEqual(o.off, ['acte-paul.jpg'], 'la fiche confidentielle reste hors de la copie');
        assert.deepEqual([...o.on].sort(), ['acte-claire.jpg', 'acte-paul.jpg']);
    });

    await t('S3 questionnaire : ↶ relu côté serveur (une liste forgée ne supprime rien), corbeille, fiche verrouillée respectée ; date de naissance gardée', () => {
        const o = phpIn('s3', String.raw`
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status) VALUES(1,'Jean','DEFUNT','male','deceased'),(2,'Luc','HERITIER','male','living'),(3,'Autre','FICHE','female','living')");
$pdo->exec("INSERT INTO families(id,partner1_id) VALUES(1,1)"); $pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,2)");
$pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year) VALUES('person',1,?,'1 mars 2020',2020)")->execute([$tag('DEAT')]);
$pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date) VALUES('person',2,?,'3 juin 1972',1972,'1972-06-03')")->execute([$tag('BIRT')]); $bev = (int) $pdo->lastInsertId();
$cid = (int) succ_save($pdo, ['deceased_id' => 1])['id'];
$q = ['case_id' => $cid, 'paper' => 1, 'person_id' => 2, 'answers' => ['birth_place' => 'Brive', 'children' => [['name' => 'Emma', 'birth' => '2004']]]];
$ap = succ_p2_q_apply($pdo, $q + ['keys' => ['birth', 'children']]);
$birth = $pdo->query("SELECT date_text, sort_date FROM events WHERE id=$bev")->fetch(PDO::FETCH_ASSOC);
$kid = (int) $ap['made']['persons'][0];
$forged = $err(fn() => succ_p2_q_undo_apply($pdo, ['case_id' => $cid, 'token' => 'inventé', 'made' => ['persons' => [3]]]));
$pdo->exec("UPDATE persons SET is_locked=1 WHERE id=$kid");
$lockedUndo = $err(fn() => succ_p2_q_undo_apply($pdo, ['case_id' => $cid, 'token' => $ap['undo_token'], 'made' => ['persons' => [3]]]));
$pdo->exec("UPDATE persons SET is_locked=0 WHERE id=$kid");
succ_p2_q_undo_apply($pdo, ['case_id' => $cid, 'token' => $ap['undo_token'], 'made' => ['persons' => [3]]]);
$again = $err(fn() => succ_p2_q_undo_apply($pdo, ['case_id' => $cid, 'token' => $ap['undo_token']]));
$trash = (int) $pdo->query("SELECT count(*) FROM change_log WHERE entity_type='person' AND entity_id=$kid AND action='delete'")->fetchColumn();
$pdo->exec("UPDATE persons SET is_locked=1 WHERE id=2");
$lockedApply = $err(fn() => succ_p2_q_apply($pdo, $q + ['keys' => ['children']]));
echo json_encode(['birth' => $birth, 'forged' => $forged, 'lockedUndo' => $lockedUndo, 'again' => $again, 'kid' => (int) $pdo->query("SELECT count(*) FROM persons WHERE id=$kid")->fetchColumn(),
  'other' => (int) $pdo->query('SELECT count(*) FROM persons WHERE id=3')->fetchColumn(), 'trash' => $trash, 'lockedApply' => $lockedApply], JSON_UNESCAPED_UNICODE);`);
        assert.equal(o.birth.date_text, '3 juin 1972', 'une réponse sans date garde la date de la fiche'); assert.equal(o.birth.sort_date, '1972-06-03');
        assert.match(o.forged, /Rien à annuler/, 'un jeton inventé ne défait rien');
        assert.match(o.lockedUndo, /Fiche verrouillée/, 'une fiche créée puis verrouillée : rien n’est défait');
        assert.equal(o.kid, 0, '↶ : la fiche créée par les réponses est retirée'); assert.equal(o.other, 1, 'la fiche citée par le navigateur reste');
        assert.ok(o.trash >= 1, 'retirée par la suppression ordinaire (Historique → Restaurer)'); assert.match(o.again, /Rien à annuler/, 'pas deux fois');
        assert.match(o.lockedApply, /Fiche verrouillée/, 'l’héritier verrouillé : rien n’est écrit');
    });

    await t('⚰️ INSEE : décès le même jour ou date partielle → « inconnu » (jamais « mort après ») ; « 19850000 » → « 1985 » sans erreur ; fiche verrouillée refusée', () => {
        const o = phpIn('insee', String.raw`
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status) VALUES(1,'Jean','DEFUNT','male','deceased'),(2,'Luc','DEFUNT','male','living'),(3,'Anne','DEFUNT','female','living'),(4,'Rose','DEFUNT','female','living'),(5,'Paul','DEFUNT','male','living')");
$pdo->exec("INSERT INTO families(id,partner1_id) VALUES(1,1)"); $pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,2),(1,3),(1,4),(1,5)");
$pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date) VALUES('person',1,?,'12 mars 2020',2020,'2020-03-12')")->execute([$tag('DEAT')]);
$cid = (int) succ_save($pdo, ['deceased_id' => 1])['id'];
$i = $pdo->prepare("INSERT INTO insee_deces(nom,prenom,prenoms,sexe,date_naissance,annee_naissance,date_deces,annee_deces,commune_deces,numero_acte_deces) VALUES('DEFUNT',?,?,?,'19500101',1950,?,?,'TULLE','1')");
$ids = []; foreach ([['LUC', '1', '20200312'], ['ANNE', '2', '19850000'], ['ROSE', '2', '20200400'], ['PAUL', '1', '20210101']] as [$p, $s, $d]) { $i->execute([$p, $p, $s, $d, (int) substr($d, 0, 4)]); $ids[$p] = (int) $pdo->lastInsertId(); }
set_error_handler(static function ($no, $str) { throw new ErrorException($str); });
$st = []; foreach ([2 => 'LUC', 3 => 'ANNE', 4 => 'ROSE', 5 => 'PAUL'] as $pid => $p) { $st[$p] = succ_p2_insee_confirm($pdo, ['case_id' => $cid, 'person_id' => $pid, 'insee_id' => $ids[$p], 'mode' => 'both'])['status']; }
$txt = $pdo->query("SELECT date_text, year, sort_date FROM events WHERE person_id=3 AND description LIKE '%INSEE%'")->fetch(PDO::FETCH_ASSOC);
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_locked) VALUES(6,'Marc','DEFUNT','male','living',1)"); $pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,6)");
$i->execute(['MARC', 'MARC', '1', '20210101', 2021]); $mid = (int) $pdo->lastInsertId();
$locked = $err(fn() => succ_p2_insee_confirm($pdo, ['case_id' => $cid, 'person_id' => 6, 'insee_id' => $mid, 'mode' => 'both']));
echo json_encode(['st' => $st, 'txt' => $txt, 'fr' => [succ_p2_fr_date('1985-00-00'), succ_p2_fr_date('1985-03-00'), succ_p2_fr_date('1985-03-12')], 'locked' => $locked], JSON_UNESCAPED_UNICODE);`);
        assert.deepEqual(o.st, { LUC: 'unknown', ANNE: 'unknown', ROSE: 'unknown', PAUL: 'dead_after' });
        assert.deepEqual(o.txt, { date_text: '1985', year: 1985, sort_date: null }, 'l’année seule, comme ailleurs');
        assert.deepEqual(o.fr, ['1985', 'mars 1985', '12 mars 1985']);
        assert.match(o.locked, /Fiche verrouillée/);
    });

    await t('🔔 cloche : « ✓ fait » et « ⏭ reporter » des reversements et des copies d’actes sont retenus (et reviennent si la situation change)', () => {
        const o = phpIn('bell', String.raw`
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status) VALUES(1,'Jean','DEFUNT','male','deceased'),(2,'Luc','HERITIER','male','living')");
$pdo->exec("INSERT INTO families(id,partner1_id) VALUES(1,1)"); $pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,2)");
$cid = (int) succ_save($pdo, ['deceased_id' => 1])['id'];
$pdo->prepare("INSERT INTO succ_funds(case_id, person_id, day, sens, amount_cents) VALUES(?,2,?,'recu',100000)")->execute([$cid, date('Y-m-d', strtotime('-40 days'))]);
$pdo->prepare("INSERT INTO succ_pieces(case_id, piece_key, state, issued_on, valid_months) VALUES(?, 'N:2', 'ok', ?, 3)")->execute([$cid, date('Y-m-d', strtotime('-80 days'))]);
$kinds = fn() => array_values(array_unique(array_column(succ_p2_due_items($pdo, $cid, '2099-12-31'), 'kind')));
$a = $kinds();
succ_p2_due_mark($pdo, ['kind' => 'p2funds', 'id' => (string) $cid, 'act' => 'done']);
$m = succ_p2_due_mark($pdo, ['kind' => 'p2valid', 'id' => $cid . ':N:2', 'act' => 'snooze', 'to' => date('Y-m-d', strtotime('+5 days'))]);
$b = $kinds();
$pdo->prepare("INSERT INTO succ_funds(case_id, person_id, day, sens, amount_cents) VALUES(?,2,?,'recu',5000)")->execute([$cid, date('Y-m-d', strtotime('-35 days'))]);
succ_p2_due_mark($pdo, ['kind' => 'p2valid', 'id' => $cid . ':N:2', 'act' => 'undo', 'prev' => $m['prev']]);
$c = $kinds();
echo json_encode(['a' => $a, 'b' => $b, 'c' => $c]);`);
        assert.ok(o.a.includes('p2funds') && o.a.includes('p2valid'), JSON.stringify(o.a));
        assert.ok(!o.b.includes('p2funds') && !o.b.includes('p2valid'), '✓ fait et ⏭ reporter retenus : ' + JSON.stringify(o.b));
        assert.ok(o.c.includes('p2funds') && o.c.includes('p2valid'), 'un nouveau reçu, ↶ : de retour');
    });

    await t('🧾 préfixes identiques refusés (l’ancien gardé), émission datée du jour (numéros et dates dans le même ordre), un devis → une seule facture', () => {
        const o = phpIn('inv', String.raw`
succ_settings_save(['p2' => ['inv_register' => 'genealogy'], 'cabinet' => ['name' => 'Cabinet']]);
$p = succ_settings_save(['p2' => ['inv_prefix_a' => 'F']])['settings']['p2'];
$p2 = succ_settings_save(['p2' => ['inv_prefix_a' => 'AV']])['settings']['p2']; $p3 = succ_settings_save(['p2' => ['inv_prefix_d' => 'AV']])['settings']['p2'];
$mk = fn($day, $kind = 'facture') => succ_inv_save($pdo, ['kind' => $kind, 'day' => $day, 'rate_text' => '20', 'lines' => [['label' => 'x', 'qty' => 1, 'unit_cents' => 1000]]])['id'];
$a = $mk('2020-01-10'); $b = $mk('2020-02-10');
$eb = succ_inv_emit($pdo, ['id' => $b]); $ea = succ_inv_emit($pdo, ['id' => $a, 'today' => '1999-01-01']);
$av = succ_inv_avoir($pdo, ['id' => $a]);
$d = $mk('2020-01-01', 'devis'); succ_inv_emit($pdo, ['id' => $d]); succ_inv_quote($pdo, ['id' => $d], 'transform');
$twice = $err(fn() => succ_inv_quote($pdo, ['id' => $d], 'transform'));
$change = $err(fn() => succ_settings_save(['p2' => ['inv_numbering' => 'single']], $pdo));
echo json_encode(['p' => [$p['inv_prefix_f'], $p['inv_prefix_a']], 'p2' => $p2['inv_prefix_a'], 'p3' => $p3['inv_prefix_d'], 'eb' => $eb, 'ea' => $ea, 'av' => $av, 'today' => date('Y-m-d'), 'twice' => $twice, 'change' => $change], JSON_UNESCAPED_UNICODE);`);
        assert.deepEqual(o.p, ['F', 'A'], 'avoirs et factures : jamais le même préfixe'); assert.equal(o.p2, 'AV'); assert.equal(o.p3, 'D', 'les devis gardent le leur');
        assert.equal(o.eb.day, o.today); assert.equal(o.ea.day, o.today, 'une date du navigateur trop loin : celle du serveur');
        assert.ok(o.eb.number < o.ea.number, 'émise d’abord, numéro d’abord'); assert.match(o.av.number, /^AV-/, 'l’avoir est émis (préfixe à lui)');
        assert.match(o.twice, /déjà sa facture/); assert.match(o.change, /déjà émise dans ce registre/);
    });

    /* ═════ 2. le serveur : le registre du cabinet et les généalogies verrouillées ═════ */
    const dir = path.join(tmp, 'srv'); fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SESSION_DIR: path.join(dir, 'sess'), GENEALOGY_SKIP_REFERENCE: '1', GENEALOGY_TEST: '1' };
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`require 'lib/paths.php'; (new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'))->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status) VALUES(1,'Jean','SECRET','male','deceased')"); echo 'ok';`], { cwd: appRoot, env, encoding: 'utf8' });
    assert.equal(seed.status, 0, seed.stderr);
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    try {
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
        let cookie = '', csrf = '', g = null;
        const hdr = () => ({ Cookie: cookie, ...(g !== null ? { 'X-Genealogy': g } : {}) });
        const keep = r => { const c = r.headers.get('set-cookie'); if (c) cookie = c.split(';')[0]; return r; };
        const page = async () => { const html = await (await fetch(base, { headers: hdr() }).then(keep)).text(); const m = html.match(/window\.INSTALL_CSRF = ("[^"]*")/); if (m) csrf = JSON.parse(m[1]); };
        const call = async (action, q = {}, body = null) => {
            const r = await fetch(`${base}api.php?action=${action}&${new URLSearchParams(q)}`, body ? { method: 'POST', headers: { ...hdr(), 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ ...body, csrf }) } : { headers: hdr() }).then(keep);
            const txt = new TextDecoder('utf-8', { ignoreBOM: true }).decode(await r.arrayBuffer()); let j; try { j = JSON.parse(txt); } catch (_) { j = { _raw: txt }; }
            return { status: r.status, body: j };
        };
        await page();
        const w = async (action, body) => { const r = await call(action, {}, body); assert.equal(r.status, 200, `${action} ${body.op || ''} : ${JSON.stringify(r.body).slice(0, 300)}`); return r.body.result ?? r.body; };
        let id = 0;
        await t('S1 registre du cabinet : la généalogie B ne lit ni ne modifie les factures de la généalogie A verrouillée (liste, CSV, tableau de bord, avoir, payée)', async () => {
            const other = await w('genealogy_create', { name: 'Autre' }); await w('genealogy_switch', { id: '' }); await page();
            await w('successoral_write', { op: 'settings_save', settings: { cabinet: { name: 'Cabinet X' } } });
            await w('successoral_write', { op: 'save', deceased_id: 1 });
            const inv = await w('successoral_write', { op: 'p2_inv_save', kind: 'facture', client_name: 'HÉRITIER SECRET', client_address: '12 rue Cachée', case_number: '2026-001', rate_text: '20', lines: [{ label: 'Honoraires', qty: 1, unit_cents: 123456 }] });
            id = inv.id; await w('successoral_write', { op: 'p2_inv_emit', id });
            await w('glock_set', { password: 'Motdepasse-secret-1', password2: 'Motdepasse-secret-1', ack: 1 }); await w('glock_lock_now', {});
            await w('genealogy_switch', { id: other.id }); g = other.id; await page();
            await w('save_person', { first_name: 'A', last_name: 'B', init_if_missing: 1 }); await page();
            const L = await call('successoral', { op: 'p2_invoices' }); assert.equal(L.status, 200, JSON.stringify(L.body));
            assert.equal(L.body.items.length, 0, 'aucune facture de la généalogie verrouillée'); assert.equal(L.body.locked, 1, 'seulement comptée');
            assert.doesNotMatch(JSON.stringify(L.body), /SECRET|Cachée|123456/);
            const csv = await call('successoral', { op: 'p2_invoice_csv', year: new Date().getFullYear() }); assert.doesNotMatch(csv.body._raw || '', /SECRET|1234,56/, 'ni dans le CSV');
            const act = await call('successoral', { op: 'p2_activity' }); assert.equal(act.body.invoices.count, 0, 'ni dans le tableau de bord'); assert.equal(act.body.invoices.ht, 0);
            for (const body of [{ op: 'p2_inv_avoir', id }, { op: 'p2_inv_paid', id, paid_on: '2026-01-01' }, { op: 'p2_inv_delete', id }]) {
                const r = await call('successoral_write', {}, body); assert.equal(r.status, 422, `${body.op} refusé`); assert.match(r.body.error, /généalogie verrouillée/);
            }
        });
    } finally { proc.kill(); }

    if (!process.env.KEEP) fs.rmSync(tmp, { recursive: true, force: true });
    console.log(failed ? `✗ ${failed} échec(s)` : `✓ tout est bon (${checks} vérifications)`);
    process.exit(failed ? 1 : 0);
})();
