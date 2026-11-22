'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 💌 🛡 🖊 🌐 Écrans 9 à 12 de docs/design/successoral-et-plus.html (lib/plus_famille.php) :   node tests/test-plus-famille.js
 *  un vrai « php -S » sur une petite base fictive (MAZAUD, LACOMBE) :
 *   - migration 89 ; 🛡 note de fiabilité (faits, dates estimées, sources, liens), ses raisons, seuil réglable (Seuils du
 *     contrôle), liste des personnes (colonne + filtre « à revoir »), widget, export GEDCOM « Pour partager » qui laisse de côté ;
 *   - 💌 lettre du mois (anniversaires : vivants au prénom et à l'âge, fiche confidentielle jamais ; découvertes ; photo ;
 *     ancêtre), lettre gardée, supprimée (deleted_at) puis remise ;
 *   - 🖊 relecture : demande, repères opaques dans la copie, fichier du cousin lu, import ✓ / ✕ / plus tard, ↶ Annuler,
 *     décision depuis la fiche et son ↶ ;
 *   - 🌐 traduction sans Ollama : message clair ; mode consultation : rien ne s'écrit.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const SEED = String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$t = fn($slug) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$slug' LIMIT 1")->fetchColumn();
$m = date('m'); $Y = (int) date('Y');
// 1 Lucas MAZAUD (vivant, départ) ← 2 André MAZAUD († 2001) + 3 Claire LACOMBE (vivante) ; 2 ← 4 Antoine MAZAUD + 5 Rose BESSE ; 6 Odile VIDAL confidentielle
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,is_start,living_status,is_private,created_at) VALUES
 (1,'Lucas','MAZAUD','male',1,'living',0,'2020-01-01'),(2,'André','MAZAUD','male',0,'deceased',0,'2020-01-01'),(3,'Claire','LACOMBE','female',0,'living',0,'2020-01-01'),
 (4,'Antoine','MAZAUD','male',0,'deceased',0,'2020-01-01'),(5,'Rose','BESSE','female',0,'deceased',0,date('now')),(6,'Odile','VIDAL','female',0,'living',1,'2020-01-01'),
 (7,'Marguerite','BESSE','female',0,'deceased',0,'2020-01-01')");
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,2,3),(2,4,5)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,1),(2,2)");
$ev = $pdo->prepare('INSERT INTO events(id,scope,person_id,family_id,event_type_id,date_text,year,sort_date,fact_confidence) VALUES(?,?,?,?,?,?,?,?,?)');
$ev->execute([1,'person',1,null,$t('BIRT'),'17/'.$m.'/1993',1993,'1993-'.$m.'-17','certain']);
$ev->execute([2,'person',3,null,$t('BIRT'),'03/'.$m.'/1962',1962,'1962-'.$m.'-03','certain']);
$ev->execute([3,'person',2,null,$t('BIRT'),'25/'.$m.'/'.($Y-100),$Y-100,($Y-100).'-'.$m.'-25','certain']);
$ev->execute([4,'person',2,null,$t('DEAT'),'2001',2001,'2001','certain']);
$ev->execute([5,'person',4,null,$t('BIRT'),'4 avril 1802',1802,'1802-04-04','certain']);
$ev->execute([6,'person',4,null,$t('DEAT'),'vers 1871',1871,'1871','doubt']);
$ev->execute([7,'family',null,2,$t('MARR'),'1826',1826,'1826','unknown']);
$ev->execute([8,'person',6,null,$t('BIRT'),'09/'.$m.'/1950',1950,'1950-'.$m.'-09','certain']);
$ev->execute([9,'person',7,null,$t('BIRT'),'vers 1790',1790,'1790','estimated']);
$pdo->exec("INSERT INTO sources(id,title) VALUES(1,'Registre de Malvialle')");
$pdo->exec("INSERT INTO source_links(entity_type,entity_id,source_record_id,page) VALUES('event',5,1,'vue 3'),('event',3,1,'acte 12'),('event',4,1,'')");
$pdo->exec("INSERT INTO media(id,title,media_type,filename,date_text,created_at) VALUES(1,'La noce de Louis et Marie, Malvialle, 1935','image','noce.jpg','1935',date('now')),(2,'Claire au jardin','image','claire.jpg','2010',date('now'))");
$pdo->exec("INSERT INTO media_links(media_id,entity_type,entity_id) VALUES(1,'person',2),(2,'person',3)");
echo 'ok';`;

(async () => {
    const phpPath = findPhp([devBundledPhp()]);
    if (!phpPath) { console.log('— PHP absent : suite sautée'); return done(); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-plusfam-'));
    const dir = path.join(tmp, 'a');
    fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1', LCNDA_OLLAMA_URL: 'http://127.0.0.1:9' });
    // de vraies images (dessinées ici) pour la photo de la lettre
    const png = fs.readFileSync(path.join(appRoot, 'assets/exemple/bourg.jpg'));
    fs.writeFileSync(path.join(dir, 'media', 'noce.jpg'), png); fs.writeFileSync(path.join(dir, 'media', 'claire.jpg'), png);
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', SEED], { cwd: appRoot, encoding: 'utf8', env: envFor(dir), maxBuffer: 1 << 26 });
    if (seed.status !== 0 || !String(seed.stdout).includes('ok')) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const php = code => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require 'lib/paths.php'; require 'lib/bootstrap.php'; require 'lib/gedcom.php'; $pdo = db(); ${code}`], { cwd: appRoot, encoding: 'utf8', env: envFor(dir) }); if (r.status) console.error(r.stderr || r.stdout); return String(r.stdout).trim(); };
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(dir), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let cookie = '';
    const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
    const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
    const getRaw = async (q) => fetch(`${base}api.php?${new URLSearchParams(q)}`, { headers: { Cookie: cookie } });
    const get = async (op, q = {}) => (await getRaw({ action: 'pfam', op, ...q })).json();
    const post = async (action, body, token = csrf) => { const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: JSON.stringify({ ...body, csrf: token }) }); let json = {}; try { json = await r.json(); } catch (_) {} return { status: r.status, json }; };
    const w = (op, body) => post('pfam_write', { op, ...body });
    try {
        await t('structure : migration 89 (family_letters, family_reviews, family_review_items)', async () => {
            assert.equal(php("echo (int) $pdo->query('PRAGMA user_version')->fetchColumn();"), String(Number(fs.readFileSync(path.join(appRoot, 'lib/migrations.php'), 'utf8').match(/const SCHEMA_VERSION = (\d+);/)[1])));
            assert.equal(php("echo (int) $pdo->query(\"SELECT count(*) FROM sqlite_master WHERE name IN ('family_letters','family_reviews','family_review_items')\")->fetchColumn();"), '3');
        });

        /* ─── 10. 🛡 Fiabilité ─── */
        await t('🛡 note de fiabilité : faits, dates estimées, sources, liens et conseils', async () => {
            const a = await get('rel_person', { id: 4 });
            assert.equal(a.facts.n, 3, 'naissance, décès, mariage du couple');
            assert.equal(a.facts.count.certain, 1); assert.equal(a.facts.count.doubt, 1); assert.equal(a.facts.count.unknown, 1);
            assert.equal(a.facts.estimated.length, 1, '« vers 1871 » est une date estimée');
            assert.equal(a.sources.sourced, 1); assert.equal(a.sources.unsourced.length, 2);
            assert.equal(a.links.score, null, 'pas de parents : la part des liens ne compte pas');
            assert.ok(a.score > 0 && a.score < 100);
            assert.ok(a.tips.some(x => x.kind === 'source' && x.event.tag === 'MARR'), 'conseil : la source du mariage');
            assert.ok(a.tips.some(x => x.kind === 'doubt'));
            const b = await get('rel_person', { id: 2 });
            assert.equal(b.links.parents.length, 2); assert.deepEqual(b.links.parents.map(p => p.level).sort(), ['probable', 'proved']); assert.equal(b.links.score, 88);
            assert.equal(b.sources.score, 100);
            const m = await get('rel_person', { id: 7 });
            assert.equal(m.level, 'review', 'Marguerite : estimée, sans source → à revoir');
            assert.equal(m.threshold, 50);
        });
        await t('🛡 seuil réglable dans les Seuils du contrôle ; à revoir sans les vivants ni les fiches confidentielles', async () => {
            const s = await (await getRaw({ action: 'controle_seuils' })).json();
            assert.deepEqual(s.bounds.reliability_min, [50, 20, 90, 5]);
            let sum = await get('rel_summary', { limit: 5 });
            const ids = sum.top.map(x => x.id);
            assert.ok(ids.includes(7)); assert.ok(!ids.includes(1) && !ids.includes(3) && !ids.includes(6), 'jamais les vivants ni la fiche confidentielle');
            const before = sum.count;
            let r = await post('controle_seuils_save', { values: { reliability_min: 30 } }); assert.equal(r.status, 200, JSON.stringify(r.json));
            sum = await get('rel_summary'); assert.ok(sum.count < before); assert.deepEqual(sum.top.map(x => x.id), [7]); assert.equal(sum.threshold, 30);
            r = await post('controle_seuils_save', { values: { reliability_min: 50 } });
            assert.equal((await get('rel_summary')).threshold, 50);
        });
        await t('🛡 liste des personnes : colonne « reliability » et filtre « à revoir avant publication »', async () => {
            const all = await (await getRaw({ action: 'list', type: 'persons' })).json();
            assert.ok(all.rows.every(r => typeof r.reliability === 'number'));
            const rev = await (await getRaw({ action: 'list', type: 'persons', reliability: 'review' })).json();
            assert.ok(rev.rows.length >= 1 && rev.rows.length < all.rows.length);
            assert.ok(rev.rows.every(r => r.reliability < 50));
            assert.ok(rev.rows.some(r => r.id === 7));
        });
        await t('🛡 export GEDCOM « Pour partager » : « Les laisser de côté » retire les fiches à revoir', async () => {
            const full = await (await getRaw({ action: 'export_gedcom', share: '1' })).text();
            const skip = await (await getRaw({ action: 'export_gedcom', share: '1', rel_skip: '1' })).text();
            assert.match(full, /Marguerite/); assert.doesNotMatch(skip, /Marguerite/); assert.match(skip, /André/);
            const noShare = await (await getRaw({ action: 'export_gedcom', share: '0', rel_skip: '1' })).text();
            assert.match(noShare, /Marguerite/, 'sans « Pour partager », rien n’est retiré');
        });

        /* ─── 9. 💌 Lettre de famille ─── */
        const month = new Date().toISOString().slice(0, 7);
        let letterId = 0;
        await t('💌 la lettre du mois se remplit : vivants au prénom et à l’âge, confidentielle jamais', async () => {
            const d = await get('letter_data', { month });
            assert.equal(d.family, 'MAZAUD');
            const liv = d.birthdays.filter(b => b.kind === 'living');
            assert.deepEqual(liv.map(b => b.first).sort(), ['Claire', 'Lucas']);
            assert.ok(liv.every(b => !('name' in b) && !('id' in b)), 'ni nom ni fiche pour un vivant');
            assert.ok(!JSON.stringify(d).includes('Odile') && !JSON.stringify(d).includes('VIDAL'), 'la fiche confidentielle n’apparaît jamais');
            const past = d.birthdays.find(b => b.kind === 'past'); assert.equal(past.first, 'André'); assert.equal(past.years, 100);
            assert.deepEqual(d.discoveries.people.map(p => p.name), ['Rose BESSE']);
            assert.deepEqual(d.discoveries.media.map(m => m.id), [1], 'la photo de Claire (vivante) ne part pas');
            assert.equal(d.photos[0].id, 1);
            assert.ok(d.ancestor && [2, 4, 5].includes(d.ancestor.id));
        });
        await t('💌 lettre gardée, supprimée (deleted_at) puis remise ; texte nettoyé', async () => {
            let r = await w('letter_save', { month, title: 'La lettre des MAZAUD', number: 7, options: { birthdays: true }, body_html: '<h1>La lettre</h1><p onclick="x()">Bonjour<script>alert(1)</script></p><img src="javascript:alert(1)">', photo_media_id: 1, ancestor_id: 4 });
            assert.equal(r.status, 200, JSON.stringify(r.json)); letterId = r.json.id;
            assert.doesNotMatch(r.json.letter.body_html, /script|onclick|javascript/);
            assert.equal((await get('letters')).letters.length, 1);
            r = await w('letter_save', { month, title: '' }); assert.equal(r.status, 422, 'titre obligatoire');
            await w('letter_delete', { id: letterId });
            assert.equal((await get('letters')).letters.length, 0);
            assert.equal(php(`echo $pdo->query("SELECT deleted_at<>'' FROM family_letters WHERE id=${letterId}")->fetchColumn();`), '1');
            await w('letter_restore', { id: letterId });
            assert.equal((await get('letters')).letters[0].title, 'La lettre des MAZAUD');
        });

        /* ─── 11. 🖊 Relecture ─── */
        let rv = null, facts = [];
        await t('🖊 demande de relecture : repères opaques dans la copie, aucun numéro de la base', async () => {
            const r = await w('review_new', { title: 'Branche MAZAUD · à relire', branches: JSON.stringify([{ mode: 'ascendants', person: 2 }]) });
            assert.equal(r.status, 200, JSON.stringify(r.json)); rv = r.json;
            const zip = Buffer.from(await (await getRaw({ action: 'family_share_export', review: rv.token, branches: JSON.stringify([{ mode: 'ascendants', person: 2 }]) })).arrayBuffer());
            const zf = path.join(tmp, 'copie.zip'); fs.writeFileSync(zf, zip);
            const py = spawnSync('python3', ['-I', '-c', 'import sys,zipfile;print(zipfile.ZipFile(sys.argv[1]).read("index.html").decode())', zf], { encoding: 'utf8', maxBuffer: 1 << 26 });
            const page = py.stdout; assert.match(page, /fs-data/);
            const data = JSON.parse(page.match(/<script id="fs-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
            assert.doesNotMatch(page, /"i":\s*[0-9]+,\s*"id"/);
            assert.equal(data.review.t, rv.token);
            const evs = data.people.flatMap(p => (p.ev || []).map(e => ({ ...e, who: p.f }))).concat(data.fams.flatMap(f => f.ev || []));
            assert.ok(evs.length >= 4 && evs.every(e => /^[a-f0-9]{12}$/.test(e.r)), 'chaque fait a son repère');
            facts = evs;
            const pre = await (await getRaw({ action: 'family_share_preview', review: rv.token, branches: JSON.stringify([{ mode: 'ascendants', person: 2 }]) })).json();
            assert.equal(pre.summary.review_facts, evs.length);
            const bad = await (await getRaw({ action: 'family_share_preview', review: 'a'.repeat(20) })).json();
            assert.match(bad.error || '', /n’existe plus/);
        });
        const fileOf = answers => JSON.stringify({ format: 'lcnda-relecture', v: 1, token: rv.token, from: 'Claire', date: '2026-11-18', answers });
        let rvImport = null;
        await t('🖊 le fichier du cousin : lu, puis importé (✓ d’accord → témoignage, ✓ faux → note et doute, ✕, plus tard)', async () => {
            const marr = facts.find(e => e.t === 'Mariage'), birth = facts.find(e => e.d === '4 avril 1802'), death = facts.find(e => e.d === 'vers 1871'), dAndre = facts.find(e => e.d === '2001');
            const file = fileOf([{ r: birth.r, v: 'ok' }, { r: marr.r, v: 'wrong', c: 'Mamie disait 1828, après le service.' }, { r: death.r, v: 'wrong', c: 'Plutôt 1872' }, { r: dAndre.r, v: 'ok' }, { r: 'ffffffffffff', v: 'ok' }]);
            const an = await w('review_analyze', { file });
            assert.equal(an.status, 200, JSON.stringify(an.json));
            assert.equal(an.json.answers.length, 4); assert.equal(an.json.unknown, 1); assert.equal(an.json.from, 'Claire');
            assert.equal(an.json.answers.find(a => a.r === marr.r).fact.label, 'Mariage');
            const r = await w('review_import', { file, choices: [{ r: birth.r, decision: 'accept' }, { r: marr.r, decision: 'accept' }, { r: death.r, decision: 'later' }, { r: dAndre.r, decision: 'refuse' }] });
            assert.equal(r.status, 200, JSON.stringify(r.json)); rvImport = r.json;
            assert.deepEqual([r.json.counts.confirmed, r.json.counts.noted, r.json.counts.later, r.json.counts.refused], [1, 1, 1, 1]);
            assert.equal(php("echo $pdo->query(\"SELECT count(*) FROM family_memories m JOIN family_memory_people p ON p.memory_id=m.id WHERE m.kind='testimony' AND p.person_id=4\")->fetchColumn();"), '1');
            assert.equal(php("echo $pdo->query(\"SELECT fact_confidence FROM events WHERE id=7\")->fetchColumn();"), 'doubt');
            assert.match(php("echo $pdo->query(\"SELECT body FROM notes WHERE entity_type='event' AND entity_id=7\")->fetchColumn();"), /Claire pense que c’est faux.*1828/);
            const list = (await get('reviews')).reviews; assert.equal(list[0].status, 'answered'); assert.equal(list[0].counts.pending, 1);
            const again = await w('review_analyze', { file }); assert.equal(again.json.answers.length, 0, 'déjà importé'); assert.equal(again.json.already, 4);
        });
        await t('🖊 la remarque « plus tard » reste sur le fait (fiche) ; ✓ depuis la fiche puis ↶ Annuler', async () => {
            const p = await get('review_pending', { person_id: 4 });
            assert.equal(p.items.length, 1); assert.equal(p.items[0].event_id, 6); assert.equal(p.items[0].comment, 'Plutôt 1872');
            let r = await w('review_decide', { item_id: p.items[0].id, decision: 'accept' }); assert.equal(r.status, 200);
            assert.equal((await get('review_pending', { person_id: 4 })).items.length, 0);
            assert.equal((await get('reviews')).reviews[0].status, 'filed', 'tout est rangé');
            r = await w('review_undecide', { item_id: p.items[0].id }); assert.equal(r.status, 200);
            assert.equal((await get('review_pending', { person_id: 4 })).items.length, 1);
            assert.equal(php("echo $pdo->query(\"SELECT count(*) FROM notes WHERE entity_type='event' AND entity_id=6\")->fetchColumn();"), '0');
        });
        await t('🖊 ↶ Annuler l’import : témoignage, note et doute défaits', async () => {
            const r = await w('review_undo_import', { id: rvImport.id }); assert.equal(r.status, 200, JSON.stringify(r.json));
            assert.equal(php("echo $pdo->query(\"SELECT fact_confidence FROM events WHERE id=7\")->fetchColumn();"), 'unknown');
            assert.equal(php("echo $pdo->query(\"SELECT count(*) FROM family_memories WHERE kind='testimony'\")->fetchColumn();"), '0');
            assert.equal(php("echo $pdo->query(\"SELECT count(*) FROM family_review_items\")->fetchColumn();"), '0');
            assert.equal((await get('reviews')).reviews[0].status, 'sent');
            const bad = await w('review_analyze', { file: '{"format":"autre"}' }); assert.equal(bad.status, 422);
        });
        await t('🖊 relecture supprimée (deleted_at) puis remise', async () => {
            await w('review_delete', { id: rv.id }); assert.equal((await get('reviews')).reviews.length, 0);
            await w('review_restore', { id: rv.id }); assert.equal((await get('reviews')).reviews.length, 1);
        });

        /* ─── 12. 🌐 ─── */
        await t('🌐 traduction complète sans Ollama : message clair (le niveau 1 marche toujours)', async () => {
            const r = await w('translate_start', { text: 'Anno Domini millesimo septingentesimo' });
            assert.equal(r.status, 422); assert.match(r.json.error, /Ollama ne répond pas/);
        });
        await t('sécurité : CSRF, demande inconnue', async () => {
            const r = await post('pfam_write', { op: 'letter_save', month, title: 'x' }, 'mauvais'); assert.notEqual(r.status, 200);
            assert.ok((await get('nimporte')).error);
        });

        /* ═════ le navigateur (Playwright ; sinon sauté) ═════ */
        let pw = null; try { pw = require('/opt/node22/lib/node_modules/playwright'); } catch (_) { try { pw = require('playwright'); } catch (__) { pw = null; } }
        const SHOTS = process.env.SHOTS || '';
        if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
        if (!pw) console.log('— Playwright absent : partie navigateur sautée');
        else {
            const browser = await pw.chromium.launch();
            const errors = [];
            const watch = (pg, name) => { pg.on('pageerror', e => errors.push(`${name} : ${e.message}`)); pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon|Content Security Policy/.test(m.text())) errors.push(`${name} console : ${m.text()}`); }); };
            const noScroll = async pg => assert.equal(await pg.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false, 'pas de défilement horizontal');
            const shot = async (pg, n) => { if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, `plus-famille-${n}.png`) }); };
            // une relecture en attente sur le décès d'Antoine (pastille 💬 de la fiche)
            const rvw = (await w('review_new', { title: 'Branche MAZAUD', branches: JSON.stringify([{ mode: 'ascendants', person: 2 }]) })).json;
            const key6 = php(`require_once 'lib/plus_famille.php'; echo pfam_fact_key(pfam_review_by_token($pdo, '${rvw.token}')['secret'], 6);`);
            const key7 = php(`require_once 'lib/plus_famille.php'; echo pfam_fact_key(pfam_review_by_token($pdo, '${rvw.token}')['secret'], 7);`);
            const key5 = php(`require_once 'lib/plus_famille.php'; echo pfam_fact_key(pfam_review_by_token($pdo, '${rvw.token}')['secret'], 5);`);
            const reviewFile = JSON.stringify({ format: 'lcnda-relecture', v: 1, token: rvw.token, from: 'Claire', date: '2026-11-18', answers: [{ r: key6, v: 'wrong', c: 'Plutôt 1872' }, { r: key7, v: 'wrong', c: 'Mamie disait 1828, après le service.' }, { r: key5, v: 'ok' }] });
            await w('review_import', { file: JSON.stringify({ format: 'lcnda-relecture', v: 1, token: rvw.token, from: 'Claire', date: '2026-11-18', answers: [{ r: key6, v: 'wrong', c: 'Plutôt 1872' }] }), choices: [{ r: key6, decision: 'later' }] });
            for (const [name, vp, dark] of [['1440', { width: 1440, height: 1000 }, false], ['390', { width: 390, height: 860 }, false], ['sombre', { width: 1440, height: 1000 }, true]].filter(x => !process.env.ONLY || x[0] === process.env.ONLY)) {
                await t(`navigateur ${name} : fiabilité (fiche, liste, widget, export), lettre, relecture, traduction`, async () => {
                    const ctx = await browser.newContext({ viewport: vp, colorScheme: dark ? 'dark' : 'light', deviceScaleFactor: 1, acceptDownloads: true });
                    await ctx.addInitScript(() => { try { localStorage.setItem('genealogie-last-route', '#tableau-de-bord'); localStorage.setItem('genealogie-list-columns', JSON.stringify({persons: {order: [], hidden: [], extra: ['reliability']}})); } catch (_) {} });
                    const pg = await ctx.newPage(); watch(pg, name);
                    await pg.goto(base);
                    await pg.waitForFunction(() => window.LCNDA_APP?.state && window.LCNDA_EXT?.plusFamille && window.LCNDA_EXT?.openDialog && window.LCNDA_EXT?.tresors, null, { timeout: 20000 });
                    if (dark) await pg.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
                    // 🛡 la fiche d'Antoine : la note, ses raisons ; 💬 la remarque en attente sur son décès
                    await pg.evaluate(() => { window.LCNDA_APP.state.currentPersonId = 4; window.LCNDA_APP.setModule('personnes'); });
                    await pg.waitForSelector('[data-pf-rel="4"] .pf-rel-big', { timeout: 20000, state: 'attached' });
                    const txt = await pg.locator('[data-pf-rel="4"]').textContent();
                    assert.match(txt, /sur 100/); assert.match(txt, /À revoir avant publication/i); assert.match(txt, /Pour gagner des points/);
                    await pg.waitForSelector('.event-row[data-event-id="6"] .pf-rv-pill', { timeout: 10000, state: 'attached' });
                    if (await pg.locator('[data-pf-rel="4"]').isVisible()) await pg.locator('[data-pf-rel="4"]').scrollIntoViewIfNeeded(); await shot(pg, `fiche-${name}`);
                    if (!await pg.locator('.event-row[data-event-id="6"] .pf-rv-pill').isVisible()) { await pg.evaluate(() => document.querySelector('.event-row[data-event-id="6"]')?.closest('details')?.setAttribute('open', '')); }
                    await pg.locator('.event-row[data-event-id="6"] .pf-rv-pill').click();
                    await pg.waitForSelector('.ui-actmenu button', { timeout: 5000 });
                    assert.ok(await pg.locator('.ui-actmenu button', { hasText: 'Noter' }).count());
                    await shot(pg, `pastille-${name}`);
                    await pg.keyboard.press('Escape');
                    await noScroll(pg);
                    // 🛡 Listes → Personnes : la colonne et le filtre « À revoir avant publication »
                    await pg.evaluate(() => window.LCNDA_EXT.plusFamille.showReviewList());
                    await pg.waitForSelector('table[data-col-list="persons"] .pf-rel-pill', { timeout: 20000 });
                    const rows = await pg.locator('table[data-col-list="persons"] tbody tr').count();
                    assert.ok(rows >= 1 && rows <= 3, `à revoir : ${rows}`);
                    await shot(pg, `liste-${name}`); await noScroll(pg);
                    // 🛡 le widget
                    await pg.evaluate(async () => { const A = window.LCNDA_APP; A.saveDashboardBlockSettings({widgets: [A.dashboardNewWidget('reliability_widget', {width: '12', limit: 5})]}); if (A.state.module !== 'dashboard') await A.setModule('dashboard'); else A.renderDashboard?.(); });
                    await pg.waitForSelector('.dashboard-widget[data-widget-type="reliability_widget"] .pf-w-row', { timeout: 20000 });
                    await shot(pg, `widget-${name}`); await noScroll(pg);
                    // 🛡 Réglages → Export : le contrôle avant le GEDCOM « Pour partager » et « 🌐 Pour Geneanet »
                    await pg.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'export'; A.setModule('maintenance'); });
                    await pg.waitForSelector('#gedcom-export-form [name=share]', { timeout: 20000 });
                    await pg.locator('#gedcom-export-form [name=share]').check();
                    await pg.locator('#gedcom-export-form button[type=submit]').click();
                    await pg.waitForSelector('#gedcom-export-form .pf-gate', { timeout: 10000 });
                    assert.match(await pg.locator('#gedcom-export-form .pf-gate').innerText(), /à revoir avant publication/);
                    await pg.locator('#gedcom-export-form .pf-gate').scrollIntoViewIfNeeded(); await shot(pg, `export-${name}`);
                    const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 15000 }), pg.locator('#gedcom-export-form [data-pf-g="skip"]').click()]);
                    const ged = fs.readFileSync(await dl.path(), 'utf8'); assert.doesNotMatch(ged, /Marguerite/); assert.match(ged, /André/);
                    await pg.locator('[data-export-plus="geneanet"]').click();
                    await pg.waitForSelector('dialog[open] [name=living]', { timeout: 10000 });
                    await pg.locator('dialog[open] .modal-actions button[type=submit], dialog[open] button[type=submit]').last().click();
                    await pg.waitForSelector('dialog[open] .pf-gate', { timeout: 10000 });
                    await shot(pg, `geneanet-${name}`);
                    await pg.keyboard.press('Escape');
                    // 💌 Trésors → Lettre de famille : à côté de la gazette ; vivants au prénom, confidentielle jamais
                    await pg.evaluate(() => { window.LCNDA_EXT.tresors.open('lettre-famille'); });
                    await pg.waitForSelector('.pf-lt h1', { timeout: 20000 });
                    await pg.waitForFunction(() => /Claire/.test(document.querySelector('.pf-lt')?.innerText || ''), null, { timeout: 10000 });
                    const lt = await pg.locator('.pf-lt').innerText();
                    assert.match(lt, /Lucas, \d+ ans/); assert.doesNotMatch(lt, /Odile|VIDAL|LACOMBE Claire/); assert.match(lt, /il y a 100 ans naissait André/);
                    assert.ok(await pg.locator('[data-tr-head] [data-pf-keep]').count(), '💾 Garder dans l’en-tête');
                    await shot(pg, `lettre-${name}`); await noScroll(pg);
                    const order = await pg.evaluate(() => { const F = window.LCNDA_EXT.tresorFeatures.map(f => f.key); return F.indexOf('lettre-famille') - F.indexOf('gazette'); });
                    assert.equal(order, 1, 'juste après la gazette');
                    // 🖊 « Partager avec la famille » avec la case de relecture ; Questions aux proches : la ligne et l'import
                    await pg.evaluate(() => { window.LCNDA_EXT.openFamilyShare({review: true, branch: {mode: 'descendants', person: 4, personName: 'Antoine MAZAUD'}}); });
                    await pg.waitForSelector('dialog[open] [name=review]:checked', { timeout: 10000 });
                    await shot(pg, `partage-${name}`);
                    await pg.keyboard.press('Escape');
                    await pg.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'family_questions'; A.setModule('listes'); });
                    await pg.waitForSelector('.pf-rv-list .ui-row, .pf-rv-list .ui-card', { timeout: 20000 });
                    await pg.evaluate(f => { window.LCNDA_EXT.familyReview.importAnswers({files: [new File([f], 'remarques-claire.json', {type: 'application/json'})]}); }, reviewFile);
                    await pg.waitForSelector('dialog[open] .pf-rv-ans', { timeout: 15000 });
                    assert.ok(await pg.locator('dialog[open] .pf-rv-ans.is-wrong').count() >= 1);
                    await pg.locator('dialog[open] .pf-rv-ans').first().scrollIntoViewIfNeeded(); await shot(pg, `import-${name}`);
                    await pg.keyboard.press('Escape');
                    await pg.locator('.pf-rv-list').scrollIntoViewIfNeeded(); await shot(pg, `relectures-${name}`); await noScroll(pg);
                    // 🌐 l'atelier de transcription : « 🌐 Traduire » à côté de « Aide à la lecture » (latin), vue côte à côte
                    await pg.evaluate(() => { window.LCNDA_EXT.openActTranscriber({}); });
                    await pg.waitForSelector('dialog.h-tx-dlg [data-tx-body]', { timeout: 15000 });
                    await pg.waitForTimeout(400); if (await pg.locator('dialog.mpk-dialog[open]').count()) { await pg.keyboard.press('Escape'); await pg.waitForTimeout(200); } // la fenêtre des images s'ouvre d'abord
                    await pg.locator('dialog.h-tx-dlg [data-tx-body]').fill('Anno Domini millesimo septingentesimo quinquagesimo secundo, die decima quarta mensis martii, baptizatus est Joannes, filius legitimus Petri MAZAUD et Mariae LACOMBE conjugum hujus parochiae de Malvialle, natus hesterna die. Patrinus fuit Joannes LACOMBE, matrina Antonia BESSE, qui signare nescierunt.');
                    if (process.env.DBG) console.log('DBG', await pg.evaluate(() => { const d = document.querySelector('dialog.h-tx-dlg'); const b = d?.querySelector('[data-pf-translate]'); return JSON.stringify([document.querySelectorAll('dialog.h-tx-dlg').length, [...document.querySelectorAll('dialog.h-tx-dlg [data-tx-body]')].map(x => x.value.length), d?.querySelector('[data-tx-lang]')?.value, !!d, d?.dataset.pfTr, !!d?.querySelector('[data-tx-cmd="aide"]'), !!b, b?.hidden, b?.getBoundingClientRect(), typeof window.LCNDA_LATIN, window.LCNDA_LATIN?.looksLatin(d?.querySelector('[data-tx-body]')?.value)]); }));
                    await pg.waitForSelector('dialog.h-tx-dlg [data-pf-translate]:not([hidden]):visible', { timeout: 5000 });
                    await pg.locator('dialog.h-tx-dlg [data-pf-translate]:visible').first().click();
                    await pg.waitForSelector('dialog.h-tx-dlg .pf-tr-row', { timeout: 5000 });
                    const l1 = await pg.locator('dialog.h-tx-dlg .pf-tr-l1').innerText();
                    assert.match(l1, /1752/); assert.match(l1, /le parrain fut/); assert.match(l1, /14 mars 1752/);
                    await pg.waitForSelector('dialog.h-tx-dlg [data-pf-tr-install]', { timeout: 15000 });
                    await pg.locator('dialog.h-tx-dlg .pf-tr-w.is-formule').nth(2).click();
                    assert.ok(await pg.locator('dialog.h-tx-dlg .pf-tr-row.is-hi').count(), 'le mot cliqué surligne sa ligne');
                    await shot(pg, `traduire-${name}`);
                    await pg.locator('dialog.h-tx-dlg [data-pf-tr-x]').click();
                    assert.equal(await pg.locator('dialog.h-tx-dlg .pf-tr').count(), 0);
                    assert.equal(await pg.locator('dialog.h-tx-dlg .h-tx-editor').isVisible(), true);
                    await ctx.close();
                });
            }
            // 🖊 chez le cousin : la copie ouverte d'un double-clic, les cases, « ⤓ Renvoyer mes remarques »
            await t('copie à relire chez le cousin : cases, commentaire, fichier renvoyé', async () => {
                const zip = Buffer.from(await (await getRaw({ action: 'family_share_export', review: rvw.token, branches: JSON.stringify([{ mode: 'ascendants', person: 2 }]) })).arrayBuffer());
                const zf = path.join(tmp, 'copie2.zip'); fs.writeFileSync(zf, zip);
                const out = path.join(tmp, 'copie2'); fs.mkdirSync(out, { recursive: true });
                spawnSync('python3', ['-I', '-c', 'import sys,zipfile;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', zf, out]);
                const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1, acceptDownloads: true });
                const pg = await ctx.newPage(); watch(pg, 'copie');
                await pg.goto('file://' + path.join(out, 'index.html') + '#p/2');
                await pg.waitForSelector('.fs-rv-bar', { timeout: 10000 });
                await pg.locator('.fs-rv-bar input').fill('Claire');
                await pg.locator('.fs-rv-b.is-ok').first().click();
                await pg.locator('#fs-app a[href^="#p/"]', { hasText: 'Antoine' }).first().click();
                await pg.waitForSelector('.fs-rv-b.is-no', { timeout: 5000 });
                await pg.locator('.fs-rv-b.is-no').first().click();
                await pg.locator('.fs-rv-c:visible').first().fill('Mamie disait 1828');
                await shot(pg, 'copie-cousin');
                const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 10000 }), pg.locator('.fs-rv-bar .fs-btn').click()]);
                const back = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
                assert.equal(back.format, 'lcnda-relecture'); assert.equal(back.from, 'Claire'); assert.equal(back.answers.length, 2);
                assert.ok(back.answers.some(a => a.v === 'wrong' && a.c === 'Mamie disait 1828'));
                const an = await w('review_analyze', { file: JSON.stringify(back) }); assert.equal(an.json.answers.length, 2, JSON.stringify(an.json));
                await ctx.close();
            });
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
