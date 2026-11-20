'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * ⚖️ Successoral, quinze outils de plus et cinq idées (maquette validée docs/design/successoral-plus-2.html) :
 *     node tests/test-successoral-plus2.js      (captures : /tmp/claude-0/sp/succ/sp2b-*.png)
 *  1. sans serveur : chaque réglage et ses options (la valeur conseillée par défaut) ; 🧾 totaux au centime, taux tapé ;
 *     💶 fonds (reste dû, trop reversé, commission proposée) ; 🔗 double preuve ; 📮 numéro, lien de suivi ; une lettre par
 *     service ; 🗓 rappels ; 🙈 masques ; 📋 page hors ligne (jamais le défunt), somme de contrôle ; 🤝 chiffrement aller-retour ;
 *  2. le serveur : migration 97 ; réglages (options permises, refusées) ; ⚰️ INSEE sous le nom de naissance (jamais le nom
 *     d'épouse), seuil, « pas la même personne » retenu même après un nouvel import, ✓ sur la fiche ou seulement le dossier,
 *     ↶ ; 📞 échanges ; 📮 recommandés et cloche ; 🗓 dates importantes ; 🧾 numérotation continue sans trou, facture émise
 *     non modifiable ni supprimable, avoir, devis, compteur unique, registre dans la généalogie, CSV ; 💶 fonds ; 📋
 *     questionnaire (fichier modifié refusé, écriture et ↶) ; 🔗 « une pièce me suffit » ; 📮 une lettre par service ;
 *     📅 délivrance et cloche ; 👥 fusion (deux défunts / liés, ↶ 30 jours ou « tant que rien d'ajouté ») ; 🔗 dossier lié ;
 *     🤝 liste des copies et registre ; 📦 archive chiffrée (mot de passe obligatoire, réimport) ; 🕵️ ; 🗺 ; 📈 ; ⏳ ;
 *     mode consultation ; 📜 registre « Qui a vu quoi » sans montant ;
 *  3. le navigateur (Playwright) à 1440, 390 et en sombre : chaque outil s'ouvre, un nom piégé n'est jamais exécuté.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
const C = require('../assets/js/heritage-successoral-plus2-core.js');

const appRoot = path.resolve(__dirname, '..');
const UX = process.env.SHOTS || '/tmp/claude-0/sp/succ';
const XSS = '<img src=x onerror=window.__xss=1>';
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

(async () => {
    /* ═════ 1. sans serveur ═════ */
    await t('réglages : un par décision de la maquette, groupés par outil, l’option conseillée par défaut, une phrase d’aide chacun', () => {
        const want = {insee_write: 'both', insee_threshold: 40, insee_auto: 'auto', q_format: 'json', q_prefill: 'yes', calls_place: 'tab', calls_mail: 'grey', rec_relance: 15, rec_link: 'yes', inv_register: 'cabinet', inv_numbering: 'yearly',
            inv_time: 'unchecked', act_period: 'year', act_amounts: 'ttc', nc_password: 'yes', nc_addresses: 'no', map_precision: 'commune', map_notaries: 'known', contract_builtin: 'removed', contract_versions: 'all', funds_commission: 'calc',
            funds_print: 'print', proof_min: '2', proof_block: 'review', dates_reminders: '30,7,1', dates_place: 'same', merge_mode: 'two', merge_undo: '30d', research_join: 'no', archive_password: 'proposed',
            linked_attach: 'descendants', group_scope: 'missing', delay_stat: 'mean', delay_min: 3, validity_warn: 15, share_names: 'initials', share_amounts: 'yes'};
        for (const [k, v] of Object.entries(want)) assert.equal(C.DEFAULTS[k], v, k);
        const items = C.SPEC.flatMap(g => g.items);
        assert.ok(C.SPEC.length >= 16, 'un groupe par outil');
        for (const it of items) { assert.ok(it.help && it.help.length > 10, `${it.key} : aide`); if (it.options) { assert.equal(String(it.options[0][0]), String(it.def), `${it.key} : la conseillée d’abord`); assert.ok(it.options.length >= 2, `${it.key} : au moins deux options`); } }
        // les options demandées
        const opt = k => items.find(i => i.key === k).options.map(o => String(o[0]));
        assert.deepEqual(opt('insee_threshold'), ['40', '60']); assert.ok(items.find(i => i.key === 'insee_threshold').custom, 'seuil réglable');
        assert.deepEqual(opt('rec_relance'), ['15', '8', '21']); assert.ok(items.find(i => i.key === 'rec_relance').custom, 'relance : autre');
        assert.deepEqual(opt('act_amounts'), ['ttc', 'ht', 'choice']); assert.deepEqual(opt('archive_password'), ['proposed', 'required', 'none']); assert.deepEqual(opt('contract_builtin'), ['removed', 'example']);
        assert.equal(C.settings({insee_write: 'case'}).insee_write, 'case'); assert.equal(C.settings({}).merge_mode, 'two');
    });
    await t('🧾 totaux en centimes (la maquette : 2 246,00 HT, 449,20 de TVA à 20 %, 2 695,20 TTC), taux tapé, jamais deviné', () => {
        const T = C.totals([{qty: 1, unit_cents: 220800}, {qty: 1, unit_cents: 3800}], C.rate('20'));
        assert.deepEqual([T.ht, T.vat, T.ttc], [224600, 44920, 269520]);
        assert.equal(C.rate('5,5'), 550); assert.equal(C.rate('0'), 0); assert.equal(C.rate(''), null); assert.equal(C.rate('abc'), null); assert.equal(C.rate('120'), null);
        assert.equal(C.totals([{qty: 1, unit_cents: 100}], null).vat, 0, 'sans taux : pas de TVA calculée');
        assert.equal(C.totals([{qty: '14,33', unit_cents: 6000}], C.rate('0')).ht, 85980);
        const neg = C.totals([{qty: 1, unit_cents: -12000}], 2000); assert.deepEqual([neg.ht, neg.vat], [-12000, -2400], 'avoir : symétrique');
        assert.equal(C.totals([{qty: 1, unit_cents: 5}], 1000).vat, 1, 'demi-centime : vers le haut (loin de zéro)');
        assert.equal(C.money(269520), '2\u202f695,20'); assert.equal(C.cents('2 695,20'), 269520); assert.equal(C.cents('18400'), 1840000); assert.equal(C.cents('x'), null);
    });
    await t('💶 fonds : reste dû = reçu − commission − frais − reversé ; trop reversé en rouge ; commission proposée = % × reçu', () => {
        const F = C.funds([{person_id: 1, sens: 'recu', cents: 1840000}, {person_id: 1, sens: 'commission', cents: 220800}, {person_id: 1, sens: 'reverse', cents: 1619200}, {person_id: 2, sens: 'recu', cents: 1840000}, {person_id: 2, sens: 'commission', cents: 220800}, {person_id: 2, sens: 'frais', cents: 3800}, {person_id: 2, sens: 'reverse', cents: 1000000}, {person_id: 3, sens: 'recu', cents: 100}, {person_id: 3, sens: 'reverse', cents: 220}]);
        assert.equal(F[1].rest, 0); assert.equal(F[1].settled, true); assert.equal(F[2].rest, 615400); assert.equal(F[3].over, true); assert.equal(F[3].rest, -120);
        assert.equal(C.commission(1840000, 12), 220800); assert.equal(C.commission(1840000, '12,5'), 230000); assert.equal(C.commission(333, 33.33), 111);
    });
    await t('🔗 double preuve : sources distinctes, deux copies du même acte = une, dossier de preuve « prouvé » = une de plus, « une pièce me suffit »', () => {
        const D = {graph: {parents: [{child: 20, parent: 11}, {child: 23, parent: 11}]}, acts: {'N:20': {sources: ['AD 19, 4E 272', 'ad 19, 4e 272']}, 'N:21': {sources: ['Livret', 'Acte intégral']}, 'N:22': {sources: []}, 'N:23': {sources: ['X']}},
            p2: {proofs: [{child: 23, parent: 11}], one_piece_ok: {}}};
        const P = {list: [{key: 'N:20', kind: 'N', what: 'Jeanne, fille de Louise', state: 'have', person_id: 20}, {key: 'N:21', kind: 'N', what: 'Marc', state: 'have', person_id: 21}, {key: 'N:22', kind: 'N', what: 'Sylvie', state: 'missing', person_id: 22}, {key: 'N:23', kind: 'N', what: 'X', state: 'have', person_id: 23}, {key: 'D:10', kind: 'D', what: 'décès', state: 'have'}], perHeir: {}, groups: []};
        let pl = C.proofLinks(D, {rows: []}, P, {min: 2});
        const by = Object.fromEntries(pl.links.map(x => [x.key, x])); assert.equal(by['N:20'].n, 1, 'deux copies du même acte = une'); assert.equal(by['N:21'].level, 'ok'); assert.equal(by['N:22'].level, 'none'); assert.equal(by['N:23'].n, 2, 'dossier de preuve « prouvé »');
        assert.equal(pl.links[0].level, 'none', 'les plus fragiles d’abord'); assert.ok(!by['D:10'], 'seulement les liens de filiation');
        D.p2.one_piece_ok = {'N:20': {at: '2026-11-20'}}; pl = C.proofLinks(D, {rows: []}, P, {min: 2}); assert.equal(pl.links.find(x => x.key === 'N:20').level, 'ok');
        assert.equal(C.proofCheck(pl, {block: false}).level, 'warn', '« à revoir »'); assert.equal(C.proofCheck(pl, {block: true}).level, 'miss', 'bloquant (réglage)');
        assert.equal(C.proofCheck(C.proofLinks(D, {rows: []}, P, {min: 1}), {min: 1}).detail, 'Sylvie', 'une seule pièce : on ne signale que « aucune »');
    });
    await t('📮 numéro de recommandé (13 caractères, sinon « inhabituel », jamais refusé), lien de suivi https:// avec {numero} ; une lettre par service', () => {
        assert.equal(C.recNumOk('1A 234 567 8901 2'), true); assert.equal(C.recNumOk('12345'), false);
        assert.equal(C.trackUrl('https://www.laposte.fr/outils/suivre-vos-envois?code={numero}', '1A 234'), 'https://www.laposte.fr/outils/suivre-vos-envois?code=1A234');
        assert.equal(C.trackUrl('http://x/{numero}', '1'), ''); assert.equal(C.trackUrl('javascript:alert(1)//{numero}', '1'), ''); assert.equal(C.trackUrl('https://a.fr/x', '1'), '', 'sans {numero}');
        const g = C.groupMissing({acts: {'N:1': {place: 'Naves, Corrèze'}, 'N:2': {place: 'Naves'}, 'D:3': {place: 'Tulle (19)'}}}, {list: [{key: 'N:1', state: 'missing'}, {key: 'N:2', state: 'missing'}, {key: 'D:3', state: 'asked'}, {key: 'N:4', state: 'missing'}]}, {scope: 'missing'});
        assert.deepEqual(g.map(x => [x.service, x.keys.length]), [['Mairie de Naves', 2], ['Service à préciser', 1]]);
        assert.equal(C.groupMissing({acts: {'D:3': {place: 'Tulle (19)'}}}, {list: [{key: 'D:3', state: 'asked'}]}, {scope: 'missing_asked'})[0].service, 'Mairie de Tulle');
    });
    await t('🗓 rappels J−30, J−7, J−1 (ceux déjà vus ne reviennent pas) ; 🙈 initiales ou numéros, montants masqués', () => {
        const r = C.reminders('2027-01-12', '30,7,1', '', '2026-11-20'); assert.equal(r.days, 53); assert.equal(r.now, null); assert.deepEqual(r.list.map(x => x.day), ['2026-12-13', '2027-01-05', '2027-01-11']);
        assert.equal(C.reminders('2026-12-03', '30,7,1', '', '2026-11-20').now, 30); assert.equal(C.reminders('2026-12-03', '30,7,1', '30', '2026-11-20').now, null); assert.equal(C.reminders('2026-11-19', '7', '', '2026-11-20').late, true);
        assert.equal(C.maskName('Luc MAZAUD'), 'L. M.'); assert.equal(C.maskName('Jean-Pierre DE LA TOUR', 'initials'), 'J. P. D. L. T.'); assert.equal(C.maskName('Luc', 'numbers', 3), '#3');
        assert.equal(C.maskAmounts('Reste 6 154,00 € · 18 400 €'), 'Reste ••• € · ••• €');
    });
    await t('📋 questionnaire hors ligne : jamais le défunt ni un montant, pré-rempli seulement ce qui concerne l’héritier, échappé ; réponses lues (.json ou .html)', async () => {
        const T = new Proxy({docList: ['livret de famille', 'acte de mariage']}, {get: (o, k) => o[k] ?? `[${String(k)}]`});
        const html = C.questionnaireHtml({token: 'abc', number: '2026-014', prefill: {last: XSS, first: 'Luc', birth: '1972'}, fields: ['civil', 'spouses', 'children', 'contact', 'documents'], question: ''}, T, {cabinet: 'Cabinet DUPRAT'});
        assert.ok(!html.includes('<img src=x'), 'nom piégé échappé'); assert.ok(html.includes('&lt;img src=x'), 'échappé'); assert.ok(!/MAZAUD Paul|défunt|€/.test(html));
        assert.match(html, /Cabinet DUPRAT/); assert.match(html, /"token":"abc"/);
        const ans = {last: 'MAZAUD', documents: ['livret de famille']};
        const sum = await C.qSum('abc', ans); assert.match(sum, /^[0-9a-f]{64}$/);
        assert.deepEqual(C.readAnswers(JSON.stringify({token: 'abc', answers: ans})).answers, ans);
        assert.deepEqual(C.readAnswers('<html><script type="application/json" id="q-answers">{"token":"t","answers":{"a":"\\u003cb"}}</script>').answers, {a: '<b'});
        assert.equal(C.readAnswers('pas un fichier'), null);
    });
    await t('🤝 copie pour le notaire : chiffrée (AES-256-GCM, PBKDF2) aller-retour, mauvais mot de passe refusé, page qui demande le mot de passe', async () => {
        const env = await C.encrypt('<p>Héritiers ✓</p>', 'secret-du-notaire');
        assert.equal(env.kdf, 'pbkdf2-sha256'); assert.ok(env.iter >= 300000); assert.ok(!JSON.stringify(env).includes('Héritiers'));
        assert.equal(await C.decrypt(env, 'secret-du-notaire'), '<p>Héritiers ✓</p>');
        await assert.rejects(() => C.decrypt(env, 'faux'));
        const pg = C.notaryPage({title: `2026-014 · ${XSS}`, foot: 'Copie v1', tabs: [{label: 'Héritiers', html: '<table></table>'}], T: {locked: 'Protégée', password: 'Mot de passe', open: 'Ouvrir', wrong: 'Non'}});
        const out = pg.wrap(pg.lockScript(env)); assert.ok(!out.includes('<img src=x')); assert.match(out, /id="pw"/); assert.ok(!out.includes('<table></table>'), 'le contenu n’est pas en clair');
    });

    /* ═════ 2. le serveur ═════ */
    const phpPath = findPhp([devBundledPhp()]);
    if (!phpPath) { console.log('— PHP absent : partie serveur sautée'); return finish(); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-succ-plus2-'));
    const dir = path.join(tmp, 'data');
    const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
    fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$ins = $pdo->prepare('INSERT INTO persons(id,first_name,last_name,gender,living_status) VALUES(?,?,?,?,?)');
foreach ([[1,'Jean','MAZAUD','male','deceased'],[2,'Marie','PEYRAT','female','deceased'],[10,'Paul','MAZAUD','male','deceased'],[11,'Jeanne','MAZAUD','female','living'],[12,'André','MAZAUD','male','living'],[13,'Pierre','MAZAUD','male','deceased'],
  [20,'Hélène','MAZAUD','female','living'],[21,'Luc','MAZAUD','male','living'],[22,'<img src=x onerror=window.__xss=1>','MAZAUD','female','living'],[30,'Henri','ROUSSILHE','male','deceased'],[31,'Marie','ROUSSILHE','female','deceased'],[32,'Simone','LACOMBE','female','living'],[40,'Emma','MAZAUD','female','living']] as $r) { $ins->execute($r); }
$pdo->exec("INSERT INTO name_variants(person_id,type,last_name) VALUES(11,'historical','ROUSSILHE')");
$tag = fn($t) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$t' ORDER BY id LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO places(id,name,latitude,longitude) VALUES(1,'Tulle (19)',45.2667,1.7667),(2,'Brive',45.1589,1.5331),(3,'Naves',45.31,1.77),(4,'Alger, Algérie',null,null)");
$ev = $pdo->prepare("INSERT INTO events(scope,person_id,family_id,event_type_id,date_text,year,sort_date,place_id) VALUES(?,?,?,?,?,?,?,?)");
foreach ([[1,'BIRT','1905',null,1],[1,'DEAT','1980',null,1],[2,'DEAT','1990',null,1],[10,'BIRT','1936',null,1],[10,'DEAT','12 mars 2026','2026-03-12',1],[11,'BIRT','1941',null,1],[12,'BIRT','4 mai 1938','1938-05-04',1],[13,'BIRT','1943',null,1],[13,'DEAT','2015',null,1],
  [20,'BIRT','1969',null,2],[21,'BIRT','1972',null,4],[22,'BIRT','1975',null,2],[30,'DEAT','2 janvier 2026','2026-01-02',1],[31,'DEAT','5 avril 2026','2026-04-05',1],[40,'BIRT','2004',null,2]] as [$p,$t,$d,$s,$pl]) { $ev->execute(['person',$p,null,$tag($t),$d,(int) substr($d,-4),$s,$pl]); }
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(100,1,2),(101,13,null),(102,30,31)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(100,10),(100,11),(100,12),(100,13),(101,20),(101,21),(101,22),(102,32)");
$lc = $pdo->prepare('INSERT INTO living_contacts(person_id,first_name,last_name,address,postal_code,city,country,relationship) VALUES(?,?,?,?,?,?,?,?)');
$lc->execute([21,'Luc','MAZAUD','12 rue Haute','19100','Brive','France','']); $lc->execute([20,'Hélène','MAZAUD','3 place','19100','Brive','France','']); $lc->execute([null,'Me','VIALLE','1 quai','19000','Tulle (19)','France','notaire']);
// le fichier INSEE : André (né le 4 mai 1938 à Tulle, † 17 août 2026), un homonyme de Brive ; Jeanne sous son nom de naissance et sous son nom d'épouse
$pdo->exec("INSERT INTO insee_deces_imports(filename,row_count,inserted_count,max_annee_deces,min_annee_deces) VALUES('deces-2026.csv',4,4,2026,1970)");
$i = $pdo->prepare("INSERT INTO insee_deces(nom,prenom,prenoms,sexe,date_naissance,annee_naissance,code_lieu_naissance,commune_naissance,pays_naissance,date_deces,annee_deces,code_lieu_deces,commune_deces,numero_acte_deces) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
$i->execute(['MAZAUD','ANDRE','ANDRE LOUIS MARCEL','1','19380504',1938,'19272','TULLE','','20260817',2026,'69383','LYON 3E ARRONDISSEMENT','1842']);
$i->execute(['MAZAUD','ANDRE','ANDRE','1','19370202',1937,'19031','BRIVE-LA-GAILLARDE','','20040101',2004,'19031','BRIVE-LA-GAILLARDE','12']);
$i->execute(['MAZAUD','JEANNE','JEANNE MARIE','2','19410310',1941,'19146','NAVES','','20250202',2025,'19146','NAVES','4']);
$i->execute(['ROUSSILHE','JEANNE','JEANNE','2','19410310',1941,'19272','TULLE','','20230505',2023,'19272','TULLE','9']);
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
    const api = async (action, q = {}) => { const r = await fetch(`${base}api.php?action=${action}&${new URLSearchParams(q)}`, { headers: { Cookie: cookie } }); const txt = new TextDecoder('utf-8', { ignoreBOM: true }).decode(await r.arrayBuffer()); try { return JSON.parse(txt); } catch (_) { return { _raw: txt, _status: r.status, _type: r.headers.get('content-type') }; } };
    const get = async (op, q = {}) => api('successoral', { op, ...q });
    const post = async (body, action = 'successoral_write') => { const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ ...body, csrf }) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
    const w = async body => { const r = await post(body); assert.equal(r.status, 200, `${body.op} : ${JSON.stringify(r.body)}`); return r.body.result; };
    const bad = async (body, re) => { const r = await post(body); assert.equal(r.status, 422, `${body.op} devait être refusé : ${JSON.stringify(r.body)}`); if (re) assert.match(r.body.error || '', re); return r.body; };
    const php = code => spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require 'lib/paths.php'; require 'lib/bootstrap.php'; $pdo = db(); ${code}`], { cwd: appRoot, encoding: 'utf8', env });
    const set = async p2 => w({ op: 'settings_save', settings: { p2 } });
    const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    const Y = String(new Date().getFullYear());
    let A = 0, B = 0, CC = 0;
    const accessLog = () => JSON.parse(php(`echo json_encode($pdo->query('SELECT kind, what, obj_label FROM access_log ORDER BY id')->fetchAll(PDO::FETCH_ASSOC));`).stdout);
    try {
        await t('serveur : migration 97 — tables et colonnes des outils de plus ; 96 laissé à l’autre chantier', async () => {
            const r = php(`echo json_encode([(int) $pdo->query('PRAGMA user_version')->fetchColumn(), array_map(fn($t) => (int) $pdo->query("SELECT count(*) FROM sqlite_master WHERE name='$t'")->fetchColumn(), ['succ_insee_checks','succ_calls','succ_funds','succ_questionnaires','succ_template_versions','succ_invoices','succ_invoice_lines','succ_invoice_counters']),
                array_map(fn($c) => (int) $pdo->query("SELECT count(*) FROM pragma_table_info('$c[0]') WHERE name='$c[1]'")->fetchColumn(), [['courriers','recommande_num'],['courriers','ar_date'],['courriers','template_version'],['courriers','reponse_le'],['succ_deadlines','origin'],['succ_deadlines','reminders'],['succ_deadlines','important'],['succ_cases','merged_into'],['succ_pieces','issued_on'],['succ_pieces','valid_months'],['succ_calls','origin_case_id']])]);`);
            const [v, tables, cols] = JSON.parse(r.stdout); assert.equal(v, 97); assert.ok(tables.every(x => x === 1), JSON.stringify(tables)); assert.ok(cols.every(x => x === 1), JSON.stringify(cols));
            const src = fs.readFileSync(path.join(appRoot, 'lib/migrations.php'), 'utf8'); assert.match(src, /\/\/ 96 : recherche à la française/); assert.match(src, /97 => 'schema_v97'/);
        });
        await t('serveur : réglages — les valeurs conseillées au départ, toutes les options permises, une valeur inconnue ignorée, seuil et relance réglables', async () => {
            let s = await get('p2_settings'); assert.equal(s.p2.insee_threshold, 40); assert.equal(s.p2.archive_password, 'proposed'); assert.deepEqual(s.cabinet.required, ['name']);
            for (const g of C.SPEC) for (const it of g.items) for (const [v] of it.options || []) { const r = await set({ [it.key]: v }); assert.equal(String(r.settings.p2[it.key]), String(v), `${it.key}=${v}`); }
            const r1 = await set({ insee_write: 'n_importe', insee_threshold: 55, rec_relance: 30, delay_min: 99, rec_url: 'http://pas-https/{numero}', inv_prefix_f: 'fac' });
            assert.equal(r1.settings.p2.insee_threshold, 55, 'seuil réglable'); assert.equal(r1.settings.p2.rec_relance, 30, 'relance réglable'); assert.equal(r1.settings.p2.delay_min, 5, 'hors bornes ignoré');
            assert.notEqual(r1.settings.p2.insee_write, 'n_importe'); assert.match(r1.settings.p2.rec_url, /^https:\/\//); assert.equal(r1.settings.p2.inv_prefix_f, 'FAC');
            // remettre les conseillés
            await set(C.DEFAULTS);
            s = await get('p2_settings'); for (const [k, v] of Object.entries(C.DEFAULTS)) assert.equal(String(s.p2[k]), String(v), k);
            const c = await w({ op: 'settings_save', settings: { cabinet: { name: 'Cabinet DUPRAT', address: '12 place Martial-Brigouleix, 19000 Tulle', siret: '000 000 000 00000', required: ['name', 'siret', 'pas_un_champ'] } } });
            assert.deepEqual(c.settings.cabinet.required, ['name', 'siret']);
        });
        await t('serveur : ⚰️ INSEE — sous le nom de naissance (jamais le nom d’épouse), score, seuil, « rien trouvé » ≠ vivant', async () => {
            A = (await w({ op: 'save', deceased_id: 10, number: '2026-014', notary_text: 'Me VIALLE' })).id;
            await w({ op: 'snapshot', case_id: A, snapshot: { order: 2, shares: { 11: '1/3', 12: '1/3', 20: '1/9', 21: '1/9', 22: '1/9' }, unknown: [] }, first: 1 });
            const r = await w({ op: 'p2_insee_check', case_id: A });
            assert.deepEqual([r.stats.from, r.stats.to], [2004, 2026]);
            const H = Object.fromEntries(r.heirs.map(h => [h.person_id, h]));
            assert.equal(H[12].pistes[0].score, 100); assert.equal(H[12].pistes[0].deces, '2026-08-17'); assert.equal(H[12].pistes[0].acte, '1842');
            assert.ok(H[12].pistes.some(p => p.code_naissance === '19031' && p.score < 80), 'l’homonyme de Brive, plus bas');
            assert.equal(H[11].birth_name, 'MAZAUD'); assert.equal(H[11].married_only, false);
            assert.ok(H[11].pistes.length === 1 && H[11].pistes[0].nom === 'MAZAUD', 'jamais cherchée sous ROUSSILHE (nom d’épouse)');
            assert.equal(H[20].pistes.length, 0, 'Hélène : rien trouvé');
            const D = await get('get', { id: A }); assert.ok(D.p2.insee_last['20'], 'vérifiée (date gardée)');
            assert.match(D.journal[0].text, /⚰️ Décès vérifiés dans le fichier INSEE/);
            await set({ insee_threshold: 60 }); const r2 = await w({ op: 'p2_insee_check', case_id: A }); assert.ok(r2.heirs.find(h => h.person_id === 12).pistes.every(p => p.score >= 60), 'seuil 60'); await set({ insee_threshold: 40 });
        });
        await t('serveur : ⚰️ « pas la même personne » retenu, même après un nouvel import (autre n° de ligne) ; ↶ le remet', async () => {
            const r = await w({ op: 'p2_insee_check', case_id: A }); const p = r.heirs.find(h => h.person_id === 12).pistes.find(x => x.code_naissance === '19031');
            const no = await w({ op: 'p2_insee_not_same', case_id: A, person_id: 12, insee_id: p.insee_id, score: p.score });
            php(`$pdo->exec("INSERT INTO insee_deces(nom,prenom,prenoms,sexe,date_naissance,annee_naissance,code_lieu_naissance,commune_naissance,pays_naissance,date_deces,annee_deces,code_lieu_deces,commune_deces,numero_acte_deces) SELECT nom,prenom,prenoms,sexe,date_naissance,annee_naissance,code_lieu_naissance,commune_naissance,pays_naissance,date_deces,annee_deces,code_lieu_deces,commune_deces,numero_acte_deces FROM insee_deces WHERE code_lieu_naissance='19031'"); $pdo->exec("INSERT INTO insee_deces_imports(filename) VALUES('nouvel import')");`);
            const again = await w({ op: 'p2_insee_check', case_id: A }); assert.ok(!again.heirs.find(h => h.person_id === 12).pistes.some(x => x.code_naissance === '19031'), 'ne revient plus');
            assert.equal((await get('get', { id: A })).p2.insee_dismissed.length, 1, 'liste « pistes écartées »');
            await w({ op: 'p2_insee_undo', case_id: A, check_id: no.check_id });
            assert.ok((await w({ op: 'p2_insee_check', case_id: A })).heirs.find(h => h.person_id === 12).pistes.some(x => x.code_naissance === '19031'), '↶ : revient');
        });
        await t('serveur : ⚰️ « ✓ C’est lui » — le décès sur la fiche (source INSEE) et « mort après » d’après la date ; ↶ ; réglage « dossier seul »', async () => {
            const r = await w({ op: 'p2_insee_check', case_id: A }); const p = r.heirs.find(h => h.person_id === 12).pistes[0];
            const c = await w({ op: 'p2_insee_confirm', case_id: A, person_id: 12, insee_id: p.insee_id, score: p.score });
            assert.equal(c.status, 'dead_after'); assert.ok(c.event_id);
            let D = await get('get', { id: A }); assert.equal(D.overrides['12'].status, 'dead_after');
            const ev = JSON.parse(php(`echo json_encode($pdo->query('SELECT date_text, description, (SELECT living_status FROM persons WHERE id=12) AS st FROM events WHERE id=${c.event_id}')->fetch(PDO::FETCH_ASSOC));`).stdout);
            assert.equal(ev.date_text, '17 août 2026'); assert.match(ev.description, /Fichier des personnes décédées \(INSEE\), acte n° 1842/); assert.equal(ev.st, 'deceased');
            await w({ op: 'p2_insee_undo', case_id: A, check_id: c.check_id });
            D = await get('get', { id: A }); assert.equal(D.overrides['12'], undefined, '↶ : statut comme avant');
            assert.equal(php(`echo (int) $pdo->query('SELECT count(*) FROM events WHERE id=${c.event_id}')->fetchColumn(), '|', $pdo->query('SELECT living_status FROM persons WHERE id=12')->fetchColumn();`).stdout, '0|living');
            await set({ insee_write: 'case' });
            const c2 = await w({ op: 'p2_insee_confirm', case_id: A, person_id: 11, insee_id: r.heirs.find(h => h.person_id === 11).pistes[0].insee_id, score: 70 });
            assert.equal(c2.event_id, null, 'la fiche reste intacte'); assert.equal(c2.status, 'dead_before', 'décès avant le défunt : ses enfants viennent à sa place');
            await w({ op: 'p2_insee_undo', case_id: A, check_id: c2.check_id }); await set({ insee_write: 'both' });
        });
        await t('serveur : 📞 échanges — échéance liée (dans la cloche, sans résumé), durée dans 💶 Temps, corbeille et ↶, « ne répond pas » ×3', async () => {
            const r = await w({ op: 'p2_call_save', case_id: A, at: day(0) + 'T10:12', person_id: 21, means: 'phone', summary: 'Accepte de signer ; veut relire le contrat avec sa femme.', next: 'Rappeler pour la signature', due: day(7), minutes: 14, count_time: 1 });
            let D = await get('get', { id: A }); const c = D.p2.calls[0]; assert.equal(c.summary.slice(0, 16), 'Accepte de signe'); assert.ok(c.deadline_id);
            assert.ok(D.deadlines.some(x => x.label === '📞 Rappeler pour la signature' && x.due === day(7))); assert.ok(D.fees.some(f => f.minutes === 14 && f.source === 'call'));
            const items = (await get('index')).bases.find(b => b.active).cases.find(x => x.id === A).due_items; assert.ok(items.some(x => /Rappeler/.test(x.label))); assert.doesNotMatch(JSON.stringify(items), /relire le contrat/, 'jamais le résumé');
            await w({ op: 'p2_call_delete', case_id: A, id: r.id }); D = await get('get', { id: A }); assert.equal(D.p2.calls.length, 0); assert.ok(!D.deadlines.some(x => x.id === c.deadline_id), 'l’échéance part avec lui');
            await w({ op: 'p2_call_restore', case_id: A, id: r.id }); D = await get('get', { id: A }); assert.equal(D.p2.calls.length, 1); assert.ok(D.deadlines.some(x => x.id === c.deadline_id));
            await bad({ op: 'p2_call_save', case_id: A, at: day(0), means: 'phone' }, /Avec qui/);
            let last; for (let i = 0; i < 3; i++) last = await w({ op: 'p2_call_save', case_id: A, at: `${day(0)} 1${i}:00`, person_id: 20, means: 'phone', summary: 'pas de réponse', noanswer: 1 });
            assert.equal(last.propose_silence, true);
            const ed = await w({ op: 'p2_call_save', case_id: A, id: r.id, at: `${day(0)} 10:12`, person_id: 21, means: 'mail', summary: XSS }); assert.equal(ed.prev.means, 'phone');
            assert.match((await get('get', { id: A })).journal.find(j => /corrigé/.test(j.text)).text, /📞 Échange du .* corrigé/);
        });
        await t('serveur : 📮 recommandés — n° inhabituel gardé, AR attendu dans la cloche après N jours (réglage), ⏭ et ↶ ; jamais de requête vers La Poste', async () => {
            const L = await w({ op: 'file_letter', case_id: A, person_id: 21, kind: 'contrat', letter: 'Monsieur,', date_envoi: day(-16), relance_jours: 30 });
            const r = await w({ op: 'p2_rec_set', courrier_id: L.courrier_id, kind: 'ar', num: '12-34' }); assert.equal(r.num_ok, false, 'inhabituel, gardé tel quel');
            let items = (await get('index')).bases.find(b => b.active).cases.find(x => x.id === A).due_items;
            const ar = items.find(x => x.kind === 'p2ar'); assert.ok(ar, 'AR attendu (15 jours)'); assert.equal(ar.label, `📮 AR attendu · courrier n° ${L.courrier_id}`);
            const m = await w({ op: 'due_mark', kind: 'p2ar', id: String(L.courrier_id), act: 'snooze', to: day(2) });
            items = (await get('index')).bases.find(b => b.active).cases.find(x => x.id === A).due_items; assert.equal(items.find(x => x.kind === 'p2ar').due, day(2));
            await w({ op: 'due_mark', kind: 'p2ar', id: String(L.courrier_id), act: 'undo', prev: m.prev });
            await w({ op: 'p2_rec_set', courrier_id: L.courrier_id, ar_date: day(0) });
            items = (await get('index')).bases.find(b => b.active).cases.find(x => x.id === A).due_items; assert.ok(!items.some(x => x.kind === 'p2ar'), 'AR reçu : la relance « AR » s’arrête');
            const lib = fs.readFileSync(path.join(appRoot, 'lib/successoral_plus2.php'), 'utf8'); assert.doesNotMatch(lib, /laposte\.fr\/[^'"]*['"]\s*\.\s*|file_get_contents\(\s*['"]https|curl_init/, 'aucune requête');
        });
        await t('serveur : 🗓 dates importantes — « d’où vient » obligatoire, rappels J−30, date déplacée gardée et notée, ✓ du rappel et ↶', async () => {
            await bad({ op: 'p2_imp_save', case_id: A, due: day(53), label: 'Date limite de remise' }, /D’où vient/);
            const r = await w({ op: 'p2_imp_save', case_id: A, due: day(20), label: 'Rendez-vous signature à l’étude', origin: 'téléphone du 18 nov.', reminders: '30,7,1' });
            let it = (await get('index')).bases.find(b => b.active).cases.find(x => x.id === A).due_items.find(x => x.kind === 'p2imp'); assert.ok(it, 'rappel J−30'); assert.match(it.label, /rappel J−30/);
            const m = await w({ op: 'due_mark', kind: 'p2imp', id: it.id, act: 'done' });
            assert.ok(!(await get('index')).bases.find(b => b.active).cases.find(x => x.id === A).due_items.some(x => x.kind === 'p2imp'), 'vu : ne revient pas');
            await w({ op: 'due_mark', kind: 'p2imp', id: it.id, act: 'undo', prev: m.prev });
            const e = await w({ op: 'p2_imp_save', case_id: A, id: r.id, due: day(25), label: 'Rendez-vous signature à l’étude', origin: 'téléphone du 18 nov.', reminders: '7' });
            const D = await get('get', { id: A }); assert.equal(D.p2.imp[r.id].prev_due, day(20)); assert.match(D.journal.find(j => /déplacée/.test(j.text)).text, /était le/);
            await w({ op: 'p2_imp_undo', case_id: A, id: r.id, prev: e.prev }); assert.equal((await get('get', { id: A })).deadlines.find(x => x.id === r.id).due, day(20));
            const src = fs.readFileSync(path.join(appRoot, 'lib/successoral_plus2.php'), 'utf8'); assert.doesNotMatch(src.slice(src.indexOf('12. 🗓'), src.indexOf('🔔 La cloche')), /\+6 months|délai légal = /, 'aucun délai calculé');
        });
        await t('serveur : 🧾 numérotation continue sans trou (un brouillon effacé ne consomme rien), facture émise non modifiable ni supprimable, avoir, paiement ↶', async () => {
            await w({ op: 'settings_save', settings: { cabinet: { siret: '' } } });
            const d1 = await w({ op: 'p2_inv_save', kind: 'facture', day: `${Y}-11-20`, client_name: 'Luc MAZAUD', case_number: '2026-014', rate_text: '20', lines: [{ label: 'Commission du contrat de révélation', qty: 1, unit_cents: 220800 }, { label: 'Copies d’actes', qty: 1, unit_cents: 3800 }] });
            await bad({ op: 'p2_inv_emit', id: d1.id }, /obligatoire est vide/);
            await w({ op: 'settings_save', settings: { cabinet: { siret: '000 000 000 00000', mentions: 'Mes mentions, écrites avec mon comptable.' } } });
            const nr = await w({ op: 'p2_inv_save', kind: 'facture', day: `${Y}-11-20`, client_name: 'X', rate_text: '', lines: [{ label: 'a', qty: 1, unit_cents: 100 }] });
            await bad({ op: 'p2_inv_emit', id: nr.id }, /taux de TVA/); await w({ op: 'p2_inv_delete', id: nr.id });
            const e1 = await w({ op: 'p2_inv_emit', id: d1.id }); assert.equal(e1.number, `F-${Y}-0001`);
            const draft = await w({ op: 'p2_inv_save', kind: 'facture', day: `${Y}-11-21`, client_name: 'Brouillon effacé', rate_text: '20', lines: [{ label: 'x', qty: 1, unit_cents: 100 }] });
            await w({ op: 'p2_inv_delete', id: draft.id });
            const d2 = await w({ op: 'p2_inv_save', kind: 'facture', day: `${Y}-11-22`, client_name: 'Hélène MAZAUD', rate_text: '5,5', lines: [{ label: 'y', qty: 2, unit_cents: 1000 }] });
            const d3 = await w({ op: 'p2_inv_save', kind: 'facture', day: `${Y}-11-22`, client_name: 'Simone LACOMBE', rate_text: '0', lines: [{ label: 'z', qty: 1, unit_cents: 12000 }] });
            assert.equal((await w({ op: 'p2_inv_emit', id: d2.id })).number, `F-${Y}-0002`, 'le brouillon effacé n’a pas pris de numéro');
            assert.equal((await w({ op: 'p2_inv_emit', id: d3.id })).number, `F-${Y}-0003`);
            await bad({ op: 'p2_inv_save', id: d1.id, client_name: 'Autre', rate_text: '20', lines: [{ label: 'a', qty: 1, unit_cents: 1 }] }, /ne peut plus être modifiée/);
            await bad({ op: 'p2_inv_delete', id: d1.id }, /ne peut plus être modifiée ni supprimée/);
            await bad({ op: 'p2_inv_emit', id: d1.id }, /Déjà émise/);
            const av = await w({ op: 'p2_inv_avoir', id: d3.id }); assert.equal(av.number, `A-${Y}-0001`);
            await bad({ op: 'p2_inv_avoir', id: d3.id }, /déjà un avoir/);
            const L = (await get('p2_invoices')).items; const f1 = L.find(x => x.id === d1.id), a1 = L.find(x => x.id === av.id);
            assert.deepEqual([f1.ht, f1.vat, f1.ttc], [224600, 44920, 269520]); assert.equal(f1.mentions, 'Mes mentions, écrites avec mon comptable.', 'mentions figées à l’émission'); assert.equal(f1.cabinet.name, 'Cabinet DUPRAT');
            assert.deepEqual([a1.ht, a1.ttc, a1.ref_id], [-12000, -12000, d3.id]);
            const nums = L.filter(x => x.kind === 'facture' && x.number).map(x => x.number).sort(); assert.deepEqual(nums, [1, 2, 3].map(n => `F-${Y}-000${n}`), 'sans trou');
            const p = await w({ op: 'p2_inv_paid', id: d1.id, paid_on: `${Y}-11-25`, paid_how: 'virement' }); await w({ op: 'p2_inv_paid', id: d1.id, ...p.prev });
            assert.equal((await get('p2_invoices')).items.find(x => x.id === d1.id).paid_on, '', '↶ sur ce seul point');
            await bad({ op: 'p2_inv_save', kind: 'facture', rate_text: 'vingt', lines: [{ label: 'x', qty: 1, unit_cents: 1 }] }, /Taux de TVA incorrect/);
            // le registre du cabinet : hors des généalogies
            assert.ok(fs.existsSync(path.join(dir, 'factures-cabinet.sqlite')), 'un seul registre pour le cabinet');
            assert.equal(php(`echo (int) $pdo->query("SELECT count(*) FROM succ_invoices")->fetchColumn();`).stdout, '0', 'rien dans la généalogie');
        });
        await t('serveur : 🧾 devis (D-…, modifiable tant qu’il n’est pas accepté, transformé en facture), compteur unique, registre dans la généalogie, CSV', async () => {
            const q = await w({ op: 'p2_inv_save', kind: 'devis', day: `${Y}-11-20`, client_name: 'Luc', rate_text: '20', lines: [{ label: 'Recherche', qty: 1, unit_cents: 50000 }] });
            assert.equal((await w({ op: 'p2_inv_emit', id: q.id })).number, `D-${Y}-0001`);
            await w({ op: 'p2_inv_save', id: q.id, client_name: 'Luc MAZAUD', rate_text: '20', lines: [{ label: 'Recherche', qty: 1, unit_cents: 60000 }] });
            await w({ op: 'p2_inv_accept', id: q.id }); await bad({ op: 'p2_inv_save', id: q.id, rate_text: '20', lines: [] }, /accepté/);
            const f = await w({ op: 'p2_inv_from_quote', id: q.id }); assert.equal((await get('p2_invoices')).items.find(x => x.id === f.id).ttc, 72000);
            await w({ op: 'p2_inv_delete', id: f.id });
            await set({ inv_numbering: 'single' });
            const s1 = await w({ op: 'p2_inv_save', kind: 'facture', day: `${Y}-12-01`, client_name: 'S', rate_text: '20', lines: [{ label: 'x', qty: 1, unit_cents: 100 }] });
            assert.equal((await w({ op: 'p2_inv_emit', id: s1.id })).number, 'F-0001', 'compteur unique');
            await set({ inv_numbering: 'yearly', inv_register: 'genealogy' });
            const g1 = await w({ op: 'p2_inv_save', kind: 'facture', day: `${Y}-12-02`, client_name: 'G', rate_text: '20', lines: [{ label: 'x', qty: 1, unit_cents: 100 }] });
            assert.equal((await w({ op: 'p2_inv_emit', id: g1.id })).number, `F-${Y}-0001`, 'registre de la généalogie : son propre compteur');
            assert.equal(php(`echo (int) $pdo->query("SELECT count(*) FROM succ_invoices WHERE number<>''")->fetchColumn();`).stdout, '1');
            await set({ inv_register: 'cabinet' });
            const csv = await api('successoral', { op: 'p2_invoice_csv', year: Y });
            assert.match(csv._type || '', /text\/csv/); assert.match(csv._raw, /^\ufeff"n°";"date";"client"/); assert.match(csv._raw, new RegExp(`"F-${Y}-0001";"${Y}-11-20";"Luc MAZAUD";"2026-014";"[^"]*";"2246,00";"20";"449,20";"2695,20"`)); assert.match(csv._raw, /"-120,00"/);
            const log = accessLog(); assert.ok(log.some(x => x.what === 'succ_invoice_csv')); assert.ok(log.some(x => x.what === 'succ_invoice')); assert.doesNotMatch(JSON.stringify(log), /2695|2 695|449/, 'jamais un montant au registre');
        });
        await t('serveur : 💶 fonds — seulement des mouvements tapés (aucun actif net), corrigés avec ↶, rappel « reversement en attente » sans nom ni montant', async () => {
            await w({ op: 'fee_save', case_id: A, kind: 'percent', percent: 12, person_id: 21, label: 'Contrat signé' });
            const r1 = await w({ op: 'p2_fund_save', case_id: A, person_id: 21, sens: 'recu', day: day(-40), cents: 1840000, moyen: 'virement' });
            await w({ op: 'p2_fund_save', case_id: A, person_id: 21, sens: 'commission', day: day(-38), cents: 220800 });
            await bad({ op: 'p2_fund_save', case_id: A, person_id: 21, sens: 'recu', day: day(0), cents: 0 }, /Montant/);
            await bad({ op: 'p2_fund_save', case_id: A, person_id: 21, sens: 'actif_net', day: day(0), cents: 5 });
            let items = (await get('index')).bases.find(b => b.active).cases.find(x => x.id === A).due_items; const f = items.find(x => x.kind === 'p2funds');
            assert.ok(f); assert.equal(f.label, '💶 Un reversement en attente'); assert.doesNotMatch(JSON.stringify(f), /MAZAUD|18400|1840000/);
            const e = await w({ op: 'p2_fund_save', case_id: A, id: r1.id, person_id: 21, sens: 'recu', day: day(-40), cents: 1840001 }); await w({ op: 'p2_fund_undo_edit', case_id: A, prev: e.prev });
            const D = await get('get', { id: A }); const F = C.funds(D.p2.funds)[21]; assert.equal(F.rest, 1840000 - 220800);
            assert.doesNotMatch(D.journal.map(j => j.text).join('\n'), /18 ?400|1840000/, 'le journal ne garde pas de montant');
            const cols = php(`echo implode(',', $pdo->query("SELECT name FROM pragma_table_info('succ_funds')")->fetchAll(PDO::FETCH_COLUMN));`).stdout; assert.doesNotMatch(cols, /actif|net/);
        });
        await t('serveur : 📋 questionnaire — fichier vérifié (somme de contrôle), fichier modifié refusé, revue puis écriture des cases cochées, ↶ tout retiré', async () => {
            const m = await w({ op: 'p2_q_make', case_id: A, person_ids: [21], fields: ['civil', 'spouses', 'children', 'contact', 'family', 'documents'], prefill: 'yes', register: 1 });
            const it = m.items[0]; assert.equal(it.prefill.last, 'MAZAUD'); assert.equal(m.courriers.length, 1, 'une ligne au Registre');
            const answers = { last: 'MAZAUD', first: 'Luc', birth: '3 juin 1972', birth_place: 'Alger', spouses: [{ name: 'Sophie LACOMBE', date: '8 septembre 2001', place: 'Brive' }], children: [{ name: 'Emma', birth: '2004', dead: '' }, { name: XSS, birth: '2007', dead: '' }], address: '4 allée des Tilleuls', postal_code: '19100', city: 'Brive', phone: '', email: '', family: 'Ma tante Jeanne vit à Naves, je crois', documents: ['livret de famille', 'acte de mariage'] };
            const file = { format: 'lcnda-succ-questionnaire', version: 1, token: it.token, number: '2026-014', answers, sum: await C.qSum(it.token, answers) };
            const ck = await w({ op: 'p2_q_check', case_id: A, file });
            assert.deepEqual(ck.rows.map(r => r.key), ['birth', 'spouse:0', 'children', 'address', 'family', 'documents']); assert.equal(ck.rows.find(r => r.key === 'family').check, false, '« Famille connue » décochée');
            await bad({ op: 'p2_q_check', case_id: A, file: { ...file, answers: { ...answers, city: 'Paris' } } }, /ne vient pas d’un questionnaire de ce dossier/);
            await bad({ op: 'p2_q_check', case_id: A, file: { ...file, token: 'autre' } }, /ne vient pas/);
            const ap = await w({ op: 'p2_q_apply', case_id: A, file, keys: ['children', 'address', 'documents'] });
            assert.equal(ap.persons, 2); assert.equal(ap.changes, 4);
            const kids = JSON.parse(php(`echo json_encode($pdo->query("SELECT p.first_name FROM persons p JOIN family_children fc ON fc.child_id=p.id JOIN families f ON f.id=fc.family_id WHERE f.partner1_id=21 OR f.partner2_id=21")->fetchAll(PDO::FETCH_COLUMN));`).stdout);
            assert.deepEqual(kids.sort(), [XSS, 'Emma'].sort());
            assert.match(php(`echo $pdo->query("SELECT address || '|' || notes FROM living_contacts WHERE person_id=21")->fetchColumn();`).stdout, /^4 allée des Tilleuls\|Source : déclaration de l’héritier/);
            const D = await get('get', { id: A }); assert.ok(D.deadlines.some(x => /Documents promis/.test(x.label))); assert.ok(!/Ma tante/.test(D.hypothesis_note), 'non coché : pas écrit');
            await w({ op: 'p2_q_undo_apply', case_id: A, made: ap.made, token: it.token });
            assert.equal(php(`echo (int) $pdo->query("SELECT count(*) FROM persons WHERE first_name='Emma' AND id<>40")->fetchColumn(), '|', $pdo->query("SELECT address FROM living_contacts WHERE person_id=21")->fetchColumn();`).stdout, '0|12 rue Haute');
            const paper = await w({ op: 'p2_q_check', case_id: A, paper: 1, person_id: 20, answers: { birth: '1969', city: 'Brive', address: '3 place' } }); assert.equal(paper.paper, true); assert.equal(paper.token, '');
            assert.ok(accessLog().some(x => /^succ_questionnaire\|1$/.test(x.what)));
        });
        await t('serveur : 🔗 « ✓ Une pièce me suffit ici » retenu (date, journal) ; 📅 date de délivrance et validité (tapée, aucune par défaut) → cloche', async () => {
            await w({ op: 'p2_proof_ok', case_id: A, key: 'N:21', on: 1, what: 'Luc, fils de Pierre' });
            let D = await get('get', { id: A }); assert.ok(D.p2.one_piece_ok['N:21'].at); assert.match(D.journal[0].text, /Une pièce jugée suffisante/);
            await w({ op: 'p2_proof_ok', case_id: A, key: 'N:21', on: 0 }); assert.equal((await get('get', { id: A })).p2.one_piece_ok['N:21'], undefined);
            const r = await w({ op: 'p2_piece_issued', case_id: A, key: 'N:20', issued_on: day(-80), valid_months: 3, what: 'naissance d’Hélène' });
            D = await get('get', { id: A }); assert.deepEqual(D.p2.issued['N:20'], { on: day(-80), months: 3 });
            const it = (await get('index')).bases.find(b => b.active).cases.find(x => x.id === A).due_items.find(x => x.kind === 'p2valid'); assert.ok(it, 'la cloche prévient avant');
            await w({ op: 'p2_piece_issued', case_id: A, key: 'N:20', issued_on: '', valid_months: '' }); assert.ok(!(await get('index')).bases.find(b => b.active).cases.find(x => x.id === A).due_items.some(x => x.kind === 'p2valid'), 'sans durée : rien');
            assert.equal(r.prev.issued_on, '');
        });
        await t('serveur : 📮 une lettre par service (pièces « demandé »), ↶ ; ⏳ délai par organisme (moyenne / médiane, minimum réglable)', async () => {
            const g = await w({ op: 'p2_group_letters', case_id: A, date_envoi: day(-30), relance_jours: 30, groups: [{ service: 'Mairie de Naves', keys: ['N:11', 'D:13'], letter: 'Madame, Monsieur,\n– naissance\n– décès' }, { service: '', keys: ['N:12'], letter: 'x' }] });
            assert.equal(g.ids.length, 1, 'un groupe sans destinataire est ignoré');
            let D = await get('get', { id: A }); assert.equal(D.pieces['N:11'].state, 'asked'); assert.equal(D.pieces['D:13'].courrier_id, g.ids[0]);
            await w({ op: 'p2_rec_set', courrier_id: g.ids[0], reponse_le: day(-6) });
            await set({ delay_min: 1 }); let dl = (await get('p2_delays')).items.find(x => x.who === 'Mairie de Naves'); assert.deepEqual([dl.days, dl.enough], [24, true]);
            await set({ delay_min: 3 }); dl = (await get('p2_delays')).items.find(x => x.who === 'Mairie de Naves'); assert.equal(dl.enough, false, 'pas assez de courriers');
            await w({ op: 'p2_group_undo', case_id: A, ids: g.ids }); D = await get('get', { id: A }); assert.equal(D.pieces['N:11'].state, '');
        });
        await t('serveur : 👥 fusion — deux défunts, deux calculs ; lignes rattachées avec leur dossier d’origine ; numéro jamais réutilisé ; ↶ (30 jours / tant que rien d’ajouté) ; dossiers liés', async () => {
            B = (await w({ op: 'save', deceased_id: 30, number: '2026-012' })).id; CC = (await w({ op: 'save', deceased_id: 31, number: '2026-016' })).id;
            await w({ op: 'p2_call_save', case_id: CC, at: day(0), who: 'Mairie de Tulle', means: 'visit', summary: 'acte' });
            await w({ op: 'p2_imp_save', case_id: CC, due: day(40), label: 'Signature', origin: 'Me PEYRAT' });
            const pv = await get('p2_merge_preview', { into: B, from: CC }); assert.equal(pv.rows.calls, 1);
            await w({ op: 'p2_merge', into: B, from: CC, mode: 'two' });
            let D = await get('get', { id: B }); assert.equal(D.p2.second.deceased_id, 31); assert.ok(D.p2.second.graph.persons['31']); assert.equal(D.p2.calls[0].origin, CC);
            assert.ok(D.p2.merged_journal.some(j => j.from === '2026-016'), 'journaux mis bout à bout');
            assert.ok((await get('get', { id: CC })).error, 'le dossier réuni ne s’ouvre plus seul');
            const nextNum = (await w({ op: 'save', deceased_id: 32 })).id; const n = (await get('get', { id: nextNum })).number; assert.ok(!['2026-016', '2026-012'].includes(n), 'jamais réutilisé'); await w({ op: 'delete', id: nextNum });
            await w({ op: 'p2_merge_undo', into: B });
            D = await get('get', { id: CC }); assert.equal(D.number, '2026-016'); assert.equal(D.p2.calls.length, 1); assert.equal((await get('get', { id: B })).p2.second, null);
            await set({ merge_undo: 'untouched' }); await w({ op: 'p2_merge', into: B, from: CC, mode: 'two' });
            await w({ op: 'journal', case_id: B, kind: 'other', text: 'quelque chose d’ajouté' });
            await bad({ op: 'p2_merge_undo', into: B }, /ajouté depuis la fusion/); await set({ merge_undo: '30d' });
            await w({ op: 'p2_merge_undo', into: B });
            const lk = await w({ op: 'p2_merge', into: B, from: CC, mode: 'linked' }); assert.equal(lk.mode, 'linked');
            assert.deepEqual((await get('get', { id: B })).p2.linked.map(x => x.id), [CC]); assert.deepEqual((await get('get', { id: CC })).p2.linked.map(x => x.id), [B]);
            await w({ op: 'p2_merge_undo', into: B }); assert.equal((await get('get', { id: B })).p2.linked.length, 0);
            assert.ok(accessLog().some(x => x.what === 'succ_merge|two'));
        });
        await t('serveur : 🔗 dossier lié pour un héritier mort après le défunt — ses descendants rattachés (réglage), les deux dossiers se renvoient ; ↶', async () => {
            php(`$pdo->exec("INSERT INTO families(id,partner1_id) VALUES(110,12)"); $pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(110,40)");`);
            const r = await w({ op: 'p2_link_case', case_id: A, person_id: 12 }); assert.equal(r.created, true); assert.equal(r.attached, 1);
            const N = await get('get', { id: r.id }); assert.equal(N.deceased_id, 12); assert.deepEqual(N.p2.linked.map(x => x.id), [A]); assert.deepEqual((await get('get', { id: A })).p2.linked.map(x => x.id), [r.id]);
            await w({ op: 'p2_link_undo', case_id: A, id: r.id, created: 1 }); assert.equal((await get('get', { id: A })).p2.linked.length, 0);
            await set({ linked_attach: 'none' }); const r2 = await w({ op: 'p2_link_case', case_id: A, person_id: 12 }); assert.equal(r2.attached, 0); await w({ op: 'p2_link_undo', case_id: A, id: r2.id, created: 1 }); await set({ linked_attach: 'descendants' });
        });
        await t('serveur : 🤝 copie pour le notaire — v1, v2 gardées (pas les fichiers), registre « chiffrée / sans adresse » jamais le mot de passe ; 🕵️ recherches ; 🗺 carte', async () => {
            const v1 = await w({ op: 'p2_notary_copy', case_id: A, addresses: 0, encrypted: 1, pieces: 0 }); const v2 = await w({ op: 'p2_notary_copy', case_id: A, addresses: 1, encrypted: 0, pieces: 3, password: 'jamais-garde' });
            assert.deepEqual([v1.v, v2.v], [1, 2]); assert.equal((await get('get', { id: A })).p2.notary_copies.length, 2);
            const log = accessLog(); assert.ok(log.some(x => x.what === 'succ_notary_copy|v1|noaddr|enc')); assert.ok(log.some(x => x.what === 'succ_notary_copy|v2|addr|plain')); assert.doesNotMatch(JSON.stringify(log), /jamais-garde/);
            await w({ op: 'p2_research_add', case_id: A, person_id: 20, where: 'AD 19, tables décennales', commune: 'Naves', years: '1993-2002', what: 'décès', result: 'none' });
            const rs = await get('p2_research', { case_id: A, person_id: 20 }); assert.ok(rs.rows.some(x => x.where.includes('AD 19') && x.negative)); assert.ok(rs.rows.some(x => x.where === 'Fichier INSEE des décès')); assert.ok(rs.negative >= 1);
            const mp = await get('p2_map', { case_id: A }); assert.ok(mp.points.some(p => p.city === 'Brive' && Math.abs(p.lat - 45.1589) < 0.01), 'la commune de l’adresse, déjà placée dans la base');
            assert.ok(mp.off.some(p => p.why === 'noaddr')); assert.ok(mp.notaries.some(n => /VIALLE/.test(n.name)), 'notaire connu (Répertoire)');
            await set({ map_notaries: 'none' }); assert.equal((await get('p2_map', { case_id: A })).notaries.length, 0); await set({ map_notaries: 'known' });
        });
        await t('serveur : 📈 activité (lecture seule, sans nom d’héritier) ; ⚰️ cloche après un nouvel import (seulement le nombre)', async () => {
            const a = await get('p2_activity', { period: 'year' }); assert.ok(a.opened >= 1); assert.equal(a.delay, null, 'pas assez de dossiers pour une moyenne'); assert.ok(a.invoices.count >= 2, JSON.stringify(a.invoices)); assert.doesNotMatch(JSON.stringify(a.time), /Luc|Hélène|Jeanne/);
            php(`$pdo->exec("INSERT INTO insee_deces_imports(filename) VALUES('oct')");`);
            const it = (await get('index')).bases.find(b => b.active).cases.find(x => x.id === A).due_items.find(x => x.kind === 'p2insee'); assert.ok(it); assert.match(it.label, /^⚰️ \d+ nouvelle\(s\) piste\(s\) INSEE \(score \d+\)$/); assert.doesNotMatch(it.label, /MAZAUD|André/);
            await w({ op: 'due_mark', kind: 'p2insee', id: String(A), act: 'done' }); assert.ok(!(await get('index')).bases.find(b => b.active).cases.find(x => x.id === A).due_items.some(x => x.kind === 'p2insee'));
            await set({ insee_auto: 'manual' }); php(`$pdo->exec("INSERT INTO insee_deces_imports(filename) VALUES('nov')");`); assert.ok(!(await get('index')).bases.find(b => b.active).cases.find(x => x.id === A).due_items.some(x => x.kind === 'p2insee'), 'à la main : rien'); await set({ insee_auto: 'auto' });
        });
        await t('serveur : 📦 archive chiffrée — mot de passe obligatoire (réglage), fichier illisible sans lui, réimport avec le mot de passe, mauvais refusé', async () => {
            await w({ op: 'state', id: B, state: 'clos' });
            await set({ archive_password: 'required' }); await bad({ op: 'archive_file', id: B }, /obligatoire/);
            await set({ archive_password: 'proposed' }); await bad({ op: 'archive_file', id: B, password: 'court' }, /trop court/);
            const r = await w({ op: 'archive_file', id: B, password: 'mot-de-passe-long' }); assert.equal(r.encrypted, true);
            const f = fs.readdirSync(path.join(dir, 'backups', 'succ-archives')).find(x => x === r.token); const head = fs.readFileSync(path.join(dir, 'backups', 'succ-archives', f)).subarray(0, 15).toString();
            assert.equal(head, 'LCNDA-COFFRE-2\n', 'enveloppe des sauvegardes protégées');
            assert.match((await get('reimport_preview', { token: r.token })).error, /^🔐/);
            await bad({ op: 'p2_reimport_preview', token: r.token, password: 'faux-mot-de-passe' }, /Mot de passe incorrect/);
            const pv = await w({ op: 'p2_reimport_preview', token: r.token, password: 'mot-de-passe-long' }); assert.equal(pv.number, '2026-012');
            const re = await w({ op: 'reimport', token: r.token, password: 'mot-de-passe-long' }); assert.ok(re.case_id);
            assert.ok(accessLog().some(x => x.what === 'succ_archive|enc')); assert.doesNotMatch(JSON.stringify(accessLog()), /mot-de-passe-long/);
            B = re.case_id;
        });
        await t('serveur : 📦 un reversement pas soldé : « archiver quand même ? » ; 📝 versions de ton contrat (toutes / la dernière), .docx lu en texte', async () => {
            await w({ op: 'state', id: A, state: 'clos' }); await bad({ op: 'archive_file', id: A }, /^💶/); await w({ op: 'state', id: A, state: 'recherche' });
            const c1 = await w({ op: 'p2_contract_save', name: 'Mon contrat', body: 'Entre {civilité} {nom} et {expéditeur}, SIRET {siret} — {pourcentage}' });
            const c2 = await w({ op: 'p2_contract_save', id: c1.id, name: 'Mon contrat', body: 'v2 {nom}' }); assert.equal(c2.version, 2);
            assert.deepEqual((await get('p2_tpl_versions', { id: c1.id })).items.map(x => x.version), [2, 1]);
            await set({ contract_versions: 'last' }); await w({ op: 'p2_contract_save', id: c1.id, name: 'Mon contrat', body: 'v3' }); assert.deepEqual((await get('p2_tpl_versions', { id: c1.id })).items.map(x => x.version), [3]); await set({ contract_versions: 'all' });
            const zip = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `$z = new ZipArchive(); $f = tempnam(sys_get_temp_dir(), 'd'); $z->open($f, ZipArchive::OVERWRITE); $z->addFromString('word/document.xml', '<w:document><w:body><w:p><w:r><w:t>Entre {civilité} {nom}</w:t></w:r></w:p><w:p><w:r><w:t>Fait le {date}</w:t></w:r></w:p></w:body></w:document>'); $z->close(); echo base64_encode(file_get_contents($f));`], { encoding: 'utf8' });
            assert.equal((await w({ op: 'p2_docx_text', data: zip.stdout })).text, 'Entre {civilité} {nom}\n\nFait le {date}');
            await bad({ op: 'p2_docx_text', data: 'pas un docx' });
            const L = await w({ op: 'file_letter', case_id: A, person_id: 20, kind: 'contrat', letter: 'v2', date_envoi: day(0) });
            await w({ op: 'p2_courrier_tpl', ids: [L.courrier_id], tpl: `${c1.id}:2` }); assert.equal((await get('get', { id: A })).p2.rec[L.courrier_id].tpl, `${c1.id}:2`, 'on sait ce que l’héritier a signé');
        });
        await t('serveur : mode consultation — aucun outil de plus ne lit ni n’écrit', async () => {
            const act = async (action, body) => (await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ ...body, csrf }) })).status;
            assert.equal(await act('kiosk_enter', { password: 'secret1' }), 200);
            try {
                for (const op of ['p2_settings', 'p2_invoices', 'p2_activity', 'p2_map', 'p2_delays']) assert.ok((await get(op)).error, op);
                for (const b of [{ op: 'p2_insee_check', case_id: A }, { op: 'p2_call_save', case_id: A }, { op: 'p2_inv_save', lines: [] }, { op: 'p2_fund_save', case_id: A }, { op: 'p2_merge', into: A, from: CC }]) { const k = await post(b); assert.ok([403, 423].includes(k.status), `${b.op} : ${k.status}`); }
            } finally { assert.equal(await act('kiosk_exit', { password: 'secret1' }), 200); }
        });

        /* ═════ 3. le navigateur ═════ */
        let chromium = null;
        try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (_) { try { ({ chromium } = require('playwright')); } catch (__) { /* sauté */ } }
        if (!chromium) { console.log('— Playwright absent : partie navigateur sautée'); return; }
        await w({ op: 'p2_call_save', case_id: A, at: `${day(-2)} 15:40`, who: 'Mairie de Naves', means: 'phone', summary: 'Acte de décès de Jeanne MAZAUD : demande à faire par écrit.', next: 'Envoyer la demande d’acte', due: day(-1) });
        await w({ op: 'p2_imp_save', case_id: A, due: day(53), label: 'Date limite donnée par l’étude pour la remise', origin: 'Me VIALLE, courriel du 4 nov.' });
        const d4 = await w({ op: 'p2_inv_save', kind: 'facture', day: `${Y}-11-20`, client_name: XSS, case_number: '2026-014', rate_text: '20', lines: [{ label: XSS, qty: 1, unit_cents: 1000 }] });
        await w({ op: 'p2_fund_save', case_id: A, person_id: 20, sens: 'recu', day: day(-3), cents: 1840000 });
        await w({ op: 'fee_save', case_id: A, kind: 'percent', percent: 12, person_id: 20, label: 'Contrat signé' });
        const browser = await chromium.launch();
        fs.mkdirSync(UX, { recursive: true });
        const open = async (w0, h0, dark, hash = '#successoral') => {
            await post({ set: { 'genealogie-usage': JSON.stringify({ usages: ['genealogie', 'successoral'], start: 'last' }), 'genealogie-menu-hidden': '[]', 'genealogie-menu-successoral': '1', ...(dark ? { 'genealogie-design': JSON.stringify({ preset: 'dark' }) } : {}) }, remove: [...(dark ? [] : ['genealogie-design'])] }, 'save_settings');
            const ctx = await browser.newContext({ viewport: { width: w0, height: h0 }, deviceScaleFactor: 1, colorScheme: dark ? 'dark' : 'light', acceptDownloads: true });
            await ctx.addInitScript(([dk]) => { try { if (!sessionStorage.getItem('t-init')) { sessionStorage.setItem('t-init', '1'); if (dk) localStorage.setItem('genealogie-design', JSON.stringify({preset: 'dark'})); localStorage.setItem('genealogie-usage', JSON.stringify({usages: ['genealogie', 'successoral'], start: 'last'})); localStorage.setItem('genealogie-menu-successoral', '1'); localStorage.setItem('genealogie-menu-hidden', '[]'); localStorage.setItem('lcnda-succ-view', '"cases"'); } } catch (_) {} }, [dark]);
            const pg = await ctx.newPage(); const errs = [];
            pg.on('pageerror', e => errs.push('pageerror ' + e.message)); pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|tile\.openstreetmap|ERR_|net::/.test(m.text())) errs.push('console ' + m.text()); });
            await pg.goto(base + hash); await pg.waitForFunction(() => window.LCNDA_EXT?.successoral?.openCase && window.LCNDA_EXT?.succPlus2?.tabs && window.LCNDA_APP?.setModule, null, { timeout: 20000 });
            return { ctx, pg, errs };
        };
        const noSide = async pg => assert.equal(await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'pas de défilement de côté');
        const shot = async (pg, name) => { await pg.waitForTimeout(350); return pg.screenshot({ path: path.join(UX, `sp2b-${name}.png`) }); };
        const xss = pg => pg.evaluate(() => window.__xss);
        const tab = async (pg, k) => { await pg.evaluate(([id, kk]) => window.LCNDA_EXT.successoral.openCase(id, kk), [A, k]); await pg.waitForSelector(`.succ-tabs [data-succ-tab="${k}"].is-active`); await pg.waitForTimeout(250); };
        try {
            for (const [W, Hh, dark, tag] of [[1440, 900, false, '1440'], [390, 844, false, '390'], [1440, 900, true, 'sombre']]) {
                await t(`navigateur ${tag} : 👥 Héritiers (⚰️, 🗺, 🕵️, 📞), ⚰️ la fenêtre des pistes, 📞 Échanges, 📑 Pièces (🔗), 💶 fonds et 🧾, 🗓 dates, 📈 Activité, réglages — rien d’exécuté`, async () => {
                    const { ctx, pg, errs } = await open(W, Hh, dark);
                    await tab(pg, 'heirs'); await pg.waitForSelector('[data-sp2-insee]'); await noSide(pg); await pg.locator('.succ-heirs').scrollIntoViewIfNeeded(); await shot(pg, `heritiers-${tag}`); assert.ok(await pg.isVisible('.succ-page [data-succ-loi="case"]'), '« ⚖️ Un doute ? » reste visible');
                    await pg.click('[data-sp2-insee]'); await pg.waitForSelector('dialog[open] .sp2-insee-heir');
                    assert.match(await pg.textContent('dialog[open]'), /fichier importé : décès 2004 → 2026/); assert.ok(await pg.$('dialog[open] [data-sp2-insee-yes]'));
                    await shot(pg, `insee-${tag}`); await pg.keyboard.press('Escape');
                    await tab(pg, 'calls'); await pg.waitForSelector('.sp2-calls'); assert.match(await pg.textContent('.sp2-calls'), /Mairie de Naves/); await noSide(pg); await shot(pg, `echanges-${tag}`);
                    await pg.click('[data-sp2-call-new]'); await pg.waitForSelector('dialog[open] [name=summary]'); await shot(pg, `echange-noter-${tag}`); await pg.keyboard.press('Escape');
                    await tab(pg, 'pieces'); await pg.waitForSelector('.sp2-proof-band'); await shot(pg, `pieces-${tag}`);
                    await pg.click('[data-sp2-proof]'); await pg.waitForSelector('dialog[open] .succ-table'); await shot(pg, `double-preuve-${tag}`); await pg.keyboard.press('Escape');
                    await tab(pg, 'dossier'); await pg.waitForSelector('[data-sp2-imp-add]'); assert.match(await pg.textContent('.succ-page'), /Me VIALLE, courriel du 4 nov\./); await shot(pg, `dates-${tag}`);
                    await tab(pg, 'fees'); await pg.waitForSelector('.sp2-funds'); await pg.waitForSelector('.sp2-invlist'); await pg.locator('.sp2-funds').scrollIntoViewIfNeeded(); await noSide(pg); await shot(pg, `fonds-${tag}`);
                    await pg.click('[data-sp2-inv-new="facture"]'); await pg.waitForSelector('dialog[open] [data-sp2-lines] tr'); assert.match(await pg.textContent('dialog[open]'), /Ce que l’app ne fait pas/); await shot(pg, `facture-${tag}`); await pg.keyboard.press('Escape');
                    await pg.click('.sp2-after [data-sp2-registry]'); await pg.waitForSelector('dialog[open] [data-sp2-reg] table'); await shot(pg, `registre-${tag}`); await pg.keyboard.press('Escape');
                    await tab(pg, 'notary'); await pg.click('[data-sp2-ncopy]'); await pg.waitForSelector('dialog[open] [name=pw_on]'); assert.equal(await pg.isChecked('dialog[open] [name=pw_on]'), true, 'mot de passe coché (réglage)'); assert.equal(await pg.isChecked('dialog[open] [name=addresses]'), false); await shot(pg, `copie-notaire-${tag}`); await pg.keyboard.press('Escape');
                    await tab(pg, 'contacts'); await pg.click('.succ-box-head [data-sp2-q]'); await pg.waitForSelector('dialog[open] [data-sp2-qf]'); await shot(pg, `questionnaire-${tag}`); await pg.keyboard.press('Escape');
                    await pg.evaluate(() => window.LCNDA_EXT.successoral.openCase(0)); await pg.waitForSelector('[data-succ-view="activite"]'); await pg.click('[data-succ-view="activite"]'); await pg.waitForSelector('.sp2-tiles'); await noSide(pg); await shot(pg, `activite-${tag}`);
                    await pg.click('[data-succ-view="cases"]').catch(() => {});
                    assert.equal(await xss(pg), undefined, 'nom piégé jamais exécuté');
                    assert.deepEqual(errs, []); await ctx.close();
                });
            }
            await t('navigateur 1440 : 🙈 écran partagé (initiales, montants masqués), 🗺 carte, ⚙️ réglages des outils (↶), contrat retiré par défaut', async () => {
                const { ctx, pg, errs } = await open(1440, 900, false);
                await tab(pg, 'fees'); await pg.waitForSelector('.sp2-funds');
                await pg.evaluate(() => document.querySelector('[data-sp2-share]').click()); await pg.waitForTimeout(900);
                const txt = await pg.textContent('.sp2-funds'); assert.doesNotMatch(txt, /18\s?400,00/); assert.match(txt, /••• €/);
                await tab(pg, 'heirs'); await pg.waitForTimeout(500); assert.doesNotMatch(await pg.textContent('.succ-heirs tbody'), /Hélène MAZAUD/); await shot(pg, 'ecran-partage-1440');
                await pg.evaluate(() => document.querySelector('[data-sp2-share]').click()); await pg.waitForTimeout(900);
                await pg.click('[data-sp2-map]'); await pg.waitForSelector('dialog[open] svg.sp2-map'); await shot(pg, 'carte-1440'); await pg.keyboard.press('Escape');
                const c = await pg.evaluate(() => window.LCNDA_EXT.succPlus2.contractText(() => 'TEXTE DE L’APP'));
                assert.doesNotMatch(c, /TEXTE DE L’APP/, 'retiré par défaut'); assert.match(c, /\{siret\}/);
                await post({ op: 'settings_save', settings: { p2: { contract_builtin: 'example' } } }); await pg.evaluate(() => window.LCNDA_EXT.succPlus2.loadSettings(true));
                assert.match(await pg.evaluate(() => window.LCNDA_EXT.succPlus2.contractText(() => 'TEXTE DE L’APP')), /^⚠️ EXEMPLE NON JURIDIQUE[\s\S]*TEXTE DE L’APP/); await post({ op: 'settings_save', settings: { p2: { contract_builtin: 'removed' } } });
                await pg.evaluate(() => { window.LCNDA_APP.state.maintenanceTab = 'design'; window.LCNDA_APP.setModule('maintenance'); }); await pg.waitForSelector('#sp2-reglages', { timeout: 15000 });
                await pg.evaluate(() => document.querySelectorAll('#sp2-reglages details').forEach(d => { d.open = true; })); await pg.locator('#sp2-reglages').scrollIntoViewIfNeeded(); await shot(pg, 'reglages-1440');
                await pg.check('#sp2-reglages input[name="sp2-set-calls_place"][value="heirs"]'); await pg.waitForFunction(() => /Réglage enregistré/.test(document.querySelector('.toast-region')?.textContent || ''));
                assert.equal((await get('p2_settings')).p2.calls_place, 'heirs');
                await pg.locator('.toast-region button:has-text("Annuler")').last().click(); await pg.waitForTimeout(700); assert.equal((await get('p2_settings')).p2.calls_place, 'tab', '↶ Annuler');
                assert.equal(await xss(pg), undefined); assert.deepEqual(errs, []); await ctx.close();
            });
        } finally { await browser.close(); }
    } finally { proc.kill(); }
    finish();
})().catch(e => { console.error(e); process.exit(1); });

function finish() { if (failed) { console.error(`✗ ${failed} échec(s)`); process.exitCode = 1; } else console.log('✓ tout est bon'); }
