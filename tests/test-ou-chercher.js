'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🌍 Où chercher ? — le monde, le plan de recherche et 🇳🇱🇧🇪 Open Archives :
 *     node tests/test-ou-chercher.js
 *  1. Node : plan de recherche (tips) rangé du plus probable (décès inconnu → INSEE ; homme né 1847-1921 → matricule ;
 *     protestant → registres pastoraux ; émigré aux États-Unis → passagers et recensements ; Québec → PRDH ; Pays-Bas → Open
 *     Archives), guides par pays (périodes, en ligne / sur place, ceux de sa vie d'abord), sites du monde (adresse https, règle,
 *     sorte), décès inconnu : le fichier INSEE n'est plus écarté pour un homme né en 1890 ; Open Archives : actes rangés pour
 *     la personne (même prénom, même lieu, son année).
 *  2. un vrai « php -S » (GENEALOGY_TEST=1 + LCNDA_TEST_OPENARCH_DIR : un dossier à la place du site) : recherche (nom exact,
 *     années, conjoint dans le même acte), réponse gardée (pas de 2ᵉ appel), vivant refusé, acte lu (personnes, référence),
 *     ＋ source (attribution), ＋ événement « doute » (seulement si la personne est le sujet), ↶ Annuler, ✗ Pas lui et ↶, CSRF.
 *  3. le navigateur (Playwright ; sinon sauté) à 1440 px, 390 px et en sombre : plan, registres, Open Archives (chercher,
 *     personnes de l'acte, ＋ Ajouter, ↶ Annuler) ; aucune erreur JavaScript, pas de défilement horizontal.
 * Noms fictifs : MAZAUD, LACOMBE, DURAND.
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
const M = require('../assets/js/app-ou-chercher-monde.js');
const O = require('../assets/js/app-ou-chercher-openarch.js');
const SO = require('../assets/js/app-ou-chercher-sortes.js');
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const ctxOf = (country, by, extra = {}) => C.context({person: {gender: extra.gender || 'male', birth_year: by, living: extra.living || ''}, events: [{tag: 'BIRT', year: by, place: extra.place || 'X', country, dept: extra.dept || null}, ...(extra.events || [])], profiles: extra.profiles || [], missing: extra.missing || []});

(async () => {
    /* ═════ 1. Node ═════ */
    await t('plan : décès inconnu (né en 1890) → INSEE en tête ; le matricule (classe 1910) ; parents inconnus et mariage connu → son acte de mariage', () => {
        const c = ctxOf('France', 1890, {dept: {code: '19', name: 'Corrèze'}, place: 'Tulle', missing: ['death', 'parents'], events: [{tag: 'MARR', year: 1920, place: 'Tulle', country: 'France'}]});
        const tips = M.tips(c);
        assert.equal(tips[0].id, 'insee', tips.map(x => x.id).join(','));
        assert.match(tips[0].why, /Né en 1890 et décès inconnu : s’il est mort après 1970/);
        assert.equal(tips[0].site, 'matchid'); assert.equal(tips[0].access, 'online'); assert.match(tips[0].period, /^1970–/);
        const mat = tips.find(x => x.id === 'matricule'); assert.ok(mat && /classe 1910/.test(mat.title), JSON.stringify(mat));
        assert.ok(tips.findIndex(x => x.id === 'mariage_parents') < tips.findIndex(x => x.id === 'recensements'));
        const f = M.tips(ctxOf('France', 1890, {gender: 'female', missing: ['death']}));
        assert.ok(!f.some(x => ['matricule', 'mdh'].includes(x.id)), 'une femme : pas de matricule');
        assert.ok(!M.tips(ctxOf('France', 1700, {missing: ['death']})).some(x => x.id === 'insee'), 'né en 1700 : pas l’INSEE');
        assert.ok(!M.tips(ctxOf('France', 1950, {missing: ['death'], living: 'living'})).some(x => x.id === 'insee'), 'vivant : rien');
    });
    await t('plan : protestant, noble, émigré aux États-Unis, Québec avant 1850, Pays-Bas, Algérie', () => {
        assert.ok(M.tips(ctxOf('France', 1750, {profiles: ['protestant']})).some(x => x.id === 'protestant' && /registres des pasteurs/.test(x.why) && x.site === 'ocm_shpf'));
        assert.ok(M.tips(ctxOf('France', 1700, {profiles: ['noble']})).some(x => x.id === 'noblesse'));
        const us = M.tips(ctxOf('France', 1870, {profiles: ['emigrant'], events: [{tag: 'IMMI', year: 1900, place: 'New York', country: 'USA'}]}));
        assert.ok(us.some(x => x.id === 'us_passagers') && us.some(x => x.id === 'us_census' && x.site === 'ocm_fs_us'), us.map(x => x.id).join(','));
        const qc = M.tips(ctxOf('France', 1700, {profiles: ['emigrant'], events: [{tag: 'IMMI', year: 1730, place: 'Québec', country: 'Canada'}]}));
        assert.ok(qc.some(x => x.id === 'quebec' && x.site === 'ocm_prdh'));
        assert.ok(M.tips(ctxOf('Nederland', 1850, {missing: ['parents']})).some(x => x.id === 'openarch' && x.oa));
        assert.equal(M.tips(ctxOf('Algérie', 1880, {missing: ['birth']}))[0].id, 'anom');
    });
    await t('registres des pays : périodes, en ligne ou sur place, ceux de sa vie d’abord', () => {
        const g = M.guide(ctxOf('Italia', 1840, {events: [{tag: 'DEAT', year: 1900, place: 'Torino', country: 'Italia'}]}));
        assert.equal(g[0].code, 'it'); assert.match(g[0].wiki, /^https:\/\/www\.familysearch\.org\/en\/wiki\/Italy_Genealogy$/);
        const names = g[0].items.map(i => `${i.name}|${i.period}|${i.inLife}`);
        assert.ok(names[0].includes('true'), names.join(' ; '));
        assert.ok(g[0].items.some(i => /Restauration/.test(i.name) && i.period === '1816–1865' && i.access === 'online'));
        const fr = M.guide(ctxOf('France', 1890, {gender: 'female'}))[0];
        assert.ok(!fr.items.some(i => /matricules/.test(i.name)), 'une femme : pas de registres matricules');
        for (const [c, G] of Object.entries(M.GUIDES)) { assert.match(G.url, /^https?:\/\//, c); for (const it of G.items) { assert.ok(it.name && it.from && ['online', 'onsite', 'both'].includes(it.access) && it.where, `${c} ${it.name}`); } }
    });
    await t('sites du monde : adresse https, règle, sorte ; FamilySearch Belgique pour un Belge, écarté pour un Corrézien', () => {
        for (const s of M.SITES) {
            const u = s.url({first: 'Jan', last: 'MAZAUD', birthYear: 1850});
            assert.match(u, /^https:\/\/[^\s<>"'`]+$/, s.key); assert.ok(s.rel && s.cats?.length && s.label && s.icon, s.key);
            assert.ok(SO.catsOf({...s}).every(c => SO.SORT[c]), s.key);
        }
        assert.match(M.SITE.ocm_fs_be.url({first: 'Jan', last: 'MAZAUD', birthYear: 1850}), /q\.surname=MAZAUD.*birthLikeDate\.from=1845.*f\.recordCountry=Belgium/);
        const be = C.rank(M.SITES, ctxOf('Belgique', 1850, {missing: ['parents']}));
        assert.equal(be.list[0].site.key, 'ocm_fs_be', be.list.map(x => x.site.key).join(','));
        assert.match(be.list[0].reasons[0], /Il a vécu en Belgique/);
        const fr = C.rank(M.SITES, ctxOf('France', 1850, {dept: {code: '19', name: 'Corrèze'}}));
        assert.ok(fr.out.some(o => o.site.key === 'ocm_fs_be') && !fr.list.some(x => /^ocm_fs_/.test(x.site.key)));
        assert.ok(!fr.list.some(x => x.site.key === 'ocm_shpf'), 'pas protestant : pas la SHPF');
        assert.ok(C.rank(M.SITES, ctxOf('France', 1750, {profiles: ['protestant']})).list.some(x => x.site.key === 'ocm_shpf'));
    });
    await t('moteur : décès inconnu, né en 1890 → le fichier INSEE n’est plus écarté ; né en 1700 → écarté', () => {
        const r = C.rank([{key: 'matchid', label: 'INSEE'}], ctxOf('France', 1890, {missing: ['death']}));
        assert.ok(r.list.some(x => x.site.key === 'matchid'), JSON.stringify(r.out));
        assert.ok(C.rank([{key: 'matchid', label: 'INSEE'}], ctxOf('France', 1700, {missing: ['death']})).out.length === 1);
        assert.ok(C.rank([{key: 'matchid', label: 'INSEE'}], ctxOf('France', 1890, {events: [{tag: 'DEAT', year: 1950, place: 'X', country: 'France'}]})).out.length === 1, 'mort en 1950 : écarté');
    });
    const rows = [
        {key: 'aaa:1', name: 'Jan MAZAUD', role: 'Enfant', role_nl: 'Kind', type: 'Naissance', type_nl: 'Geboorte', year: 1850, place: 'Leuven', pid: 'Person11'},
        {key: 'aaa:2', name: 'Jan MAZAUD', role: 'Marié', role_nl: 'Bruidegom', type: 'Mariage', type_nl: 'Huwelijk', year: 1876, place: 'Brussel', pid: 'Person21'},
        {key: 'aaa:3', name: 'Johannes Petrus MAZAUD', role: 'Enfant', role_nl: 'Kind', type: 'Naissance', type_nl: 'Geboorte', year: 1812, place: 'Gent', pid: 'Person31'},
        {key: 'aaa:4', name: 'Jan MAZAUD', role: 'Père', role_nl: 'Vader', type: 'Naissance', type_nl: 'Geboorte', year: 1880, place: 'Leuven', pid: 'Person41'},
    ];
    const person = {first: 'Jan', last: 'MAZAUD', birth_year: 1850, death_year: null, places: ['Leuven', 'Brussel']};
    await t('Open Archives : rangés pour la personne (même prénom, même lieu, son année) ; « Pas lui » à part', () => {
        const r = O.rank(rows, person, {'aaa:2': {verdict: 'added'}, 'aaa:3': {verdict: 'no'}});
        assert.equal(r.list[0].key, 'aaa:1'); assert.equal(r.list[0].level, 'high');
        assert.ok(r.list[0].reasons.some(x => /Leuven/.test(x)) && r.list[0].reasons.some(x => /son année/.test(x)), r.list[0].reasons.join(' | '));
        assert.deepEqual(r.no.map(x => x.key), ['aaa:3']); assert.equal(r.added, 1);
        assert.equal(O.score(rows[2], person).level, 'low', 'né en 1812 : peu probable');
        assert.match(O.score(rows[3], person).reasons.join(' '), /un de ses enfants/);
        assert.equal(O.dateText({year: 1781, month: 9, day: 4}), '4 septembre 1781');
    });

    /* ═════ 2. le serveur ═════ */
    const phpPath = findPhp([devBundledPhp()]);
    if (!phpPath) { console.log('— PHP absent : suite sautée'); return done(); }
    const SHOTS = process.env.SHOTS || '';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-ouc-oa-'));
    const dir = path.join(tmp, 'a'), site = path.join(tmp, 'oa');
    fs.mkdirSync(path.join(dir, 'media'), { recursive: true }); fs.mkdirSync(site);
    // le « site » Open Archives : une réponse de recherche et un acte, au format de l'API (records/search.json, records/show.json)
    const doc = (id, name, rel, relNl, ev, evNl, y, place, pid) => ({pid, identifier: id, archive_code: 'tst', archive_org: 'Archives de test', archive: 'Archives de test', personname: name, relationtype: rel, _relationtype: relNl, eventtype: ev, _eventtype: evNl, eventdate: {year: y}, eventplace: [place], sourcetype: 'Registre de test', url: `https://www.openarchieven.nl/tst:${id}/fr`});
    fs.writeFileSync(path.join(site, 'search.json'), JSON.stringify({query: {}, response: {number_found: 3, docs: [
        doc('A1', 'Jan MAZAUD', 'Enfant', 'Kind', 'Naissance', 'Geboorte', 1850, 'Leuven', 'Person11'),
        doc('A2', 'Jan MAZAUD', 'Père', 'Vader', 'Naissance', 'Geboorte', 1880, 'Leuven', 'Person21'),
        doc('A3', 'Pieter DURAND', 'Défunt', 'Overledene', 'Décès', 'Overlijden', 1801, 'Gent', 'Person31'),
    ]}}));
    const show = (id, persons, rels, ev) => ({Person: persons, Event: {'@eid': 'Event1', EventType: ev, EventDate: {Year: '1850', Month: '03', Day: '02'}, EventPlace: {Place: 'Leuven'}}, RelationEP: rels,
        Source: {SourceType: 'BS Geboorte', SourceReference: {InstitutionName: 'Archives de test', Archive: '12', Book: 'Registre 1850', DocumentNumber: '34'}, SourceAvailableScans: {Scan: {UriViewer: 'https://example.org/scan/1'}}}});
    fs.writeFileSync(path.join(site, 'show-tst-A1.json'), JSON.stringify(show('A1', [
        {'@pid': 'Person11', PersonName: {PersonNameFirstName: 'Jan', PersonNameLastName: 'MAZAUD'}, Gender: 'Man'},
        {'@pid': 'Person12', PersonName: {PersonNameFirstName: 'Pieter', PersonNameLastName: 'MAZAUD'}, Profession: 'tisserand', Age: {PersonAgeLiteral: '31'}},
        {'@pid': 'Person13', PersonName: {PersonNameFirstName: 'Anna', PersonNameLastName: 'LACOMBE'}}],
        [{PersonKeyRef: 'Person11', EventKeyRef: 'Event1', RelationType: 'Kind'}, {PersonKeyRef: 'Person12', EventKeyRef: 'Event1', RelationType: 'Vader'}, {PersonKeyRef: 'Person13', EventKeyRef: 'Event1', RelationType: 'Moeder'}], 'Geboorte')));
    fs.writeFileSync(path.join(site, 'show-tst-A2.json'), JSON.stringify(show('A2', [
        {'@pid': 'Person20', PersonName: {PersonNameFirstName: 'Karel', PersonNameLastName: 'MAZAUD'}},
        {'@pid': 'Person21', PersonName: {PersonNameFirstName: 'Jan', PersonNameLastName: 'MAZAUD'}}],
        [{PersonKeyRef: 'Person20', EventKeyRef: 'Event1', RelationType: 'Kind'}, {PersonKeyRef: 'Person21', EventKeyRef: 'Event1', RelationType: 'Vader'}], 'Geboorte')));
    const calls = () => (fs.existsSync(path.join(site, 'calls.log')) ? fs.readFileSync(path.join(site, 'calls.log'), 'utf8').trim().split('\n').filter(Boolean) : []);
    const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1', GENEALOGY_TEST: '1', LCNDA_TEST_OPENARCH_DIR: site });
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,is_start,living_status) VALUES(1,'Jan Pieter','MAZAUD','male',1,'deceased'),(2,'Marie','LACOMBE','female',0,'deceased'),(3,'Paul','DURAND','male',0,'living'),(4,'Karel','MAZAUD','male',0,'deceased')");
$pdo->exec("INSERT INTO places(id,name,county,state,country,admin2_code) VALUES(1,'Leuven','Brabant','','Belgique',''),(2,'Brussel','Brabant','','Belgique','')");
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,1,2)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,4)");
$ev = $pdo->prepare('INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES(?,?,?,?,?,?)');
foreach ([[1,'MARR','1876',1876,2],[1,'RESI','1880',1880,1],[3,'BIRT','1990',1990,2],[4,'BIRT','1880',1880,1]] as [$pid,$tag,$dt,$y,$pl]) { $ev->execute(['person',$pid,$t($tag),$dt,$y,$pl]); }
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
        await t('recherche : nom exact + années + conjoint dans le même acte ; réponse gardée (pas de 2ᵉ appel) ; vivant refusé', async () => {
            const r = await get('ou_chercher_openarch', { id: 1, with: 'spouse', type: 'birth' });
            assert.ok(!r.error, r.error);
            assert.equal(r.found, 3); assert.equal(r.rows.length, 3); assert.equal(r.cached, false);
            assert.equal(r.query.sent, '"Jan MAZAUD" & "Marie LACOMBE" 1846-1946', 'prénom usuel, conjoint ; naissance estimée (mariage − 25) − 5 à + 95');
            assert.equal(r.person.kin.spouse, 'Marie LACOMBE'); assert.equal(r.rows[0].url, 'https://www.openarchieven.nl/tst:A1/fr');
            assert.match(r.attribution, /Open Archives/);
            const log = calls(); assert.equal(log.length, 1); assert.match(log[0], /eventtype=Geboorte/); assert.match(log[0], /lang=fr/);
            const again = await get('ou_chercher_openarch', { id: 1, with: 'spouse', type: 'birth' });
            assert.equal(again.cached, true); assert.equal(calls().length, 1, 'la même question : aucune requête');
            assert.ok(again.history.length >= 1 && /MAZAUD/.test(again.history[0].query), '✓ déjà cherché');
            const fresh = await get('ou_chercher_openarch', { id: 1, with: 'spouse', type: 'birth', fresh: 1 });
            assert.equal(fresh.cached, false); assert.equal(calls().length, 2);
            const sound = await get('ou_chercher_openarch', { id: 1, how: 'sound', y1: 1840, y2: 1860, place: 'Leuven' });
            assert.equal(sound.query.sent, 'Jan ~MAZAUD 1840-1860'); assert.match(calls().pop(), /eventplace=Leuven/);
            assert.match((await get('ou_chercher_openarch', { id: 3 })).error || '', /vivante/);
            assert.match((await get('ou_chercher_person', { id: 1 })).oa_kin.spouse, /LACOMBE/);
        });
        await t('acte lu : personnes et rôles en français, référence, image', async () => {
            const r = await get('ou_chercher_openarch_record', { archive: 'tst', identifier: 'A1' });
            assert.ok(!r.error, r.error);
            assert.equal(r.event.type, 'Naissance'); assert.equal(r.event.date, '2 mars 1850'); assert.equal(r.event.tag, 'BIRT');
            assert.deepEqual(r.persons.map(p => `${p.name}|${p.role}|${p.main}`), ['Jan MAZAUD|Enfant|true', 'Pieter MAZAUD|Père|false', 'Anna LACOMBE|Mère|false']);
            assert.equal(r.persons[1].profession, 'tisserand'); assert.equal(r.persons[1].age, 31);
            assert.match(r.source.reference, /Archives de test.*Registre 1850.*acte 34/); assert.equal(r.source.scan, 'https://example.org/scan/1');
            assert.ok((await get('ou_chercher_openarch_record', { archive: '../x', identifier: '' })).error);
        });
        await t('＋ source et événement « à vérifier » (doute) ; ↶ Annuler retire tout', async () => {
            const r = await post('ou_chercher_openarch_add', { person_id: 1, archive: 'tst', identifier: 'A1', pid: 'Person11', mode: 'event' });
            assert.equal(r.status, 200, JSON.stringify(r.json));
            assert.equal(r.res.event_ids.length, 1);
            const ev = JSON.parse(php(`echo json_encode($pdo->query("SELECT e.fact_confidence, e.date_text, e.research_note, t.gedcom_tag FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.id=${r.res.event_ids[0]}")->fetch(PDO::FETCH_ASSOC));`));
            assert.equal(ev.fact_confidence, 'doubt'); assert.equal(ev.gedcom_tag, 'BIRT'); assert.equal(ev.date_text, '2 mars 1850'); assert.match(ev.research_note, /À vérifier/);
            const src = JSON.parse(php(`echo json_encode($pdo->query("SELECT * FROM sources WHERE id=${r.res.source_id}")->fetch(PDO::FETCH_ASSOC));`));
            assert.equal(src.url, 'https://www.openarchieven.nl/tst:A1/fr'); assert.match(src.text, /Données : Archives de test, via Open Archives/); assert.match(src.text, /Pieter MAZAUD — Père/); assert.match(src.text, /À VÉRIFIER/);
            assert.equal(php(`echo (int) $pdo->query("SELECT count(*) FROM source_links WHERE source_record_id=${r.res.source_id}")->fetchColumn();`), '2', 'la fiche et l’événement');
            assert.equal((await get('ou_chercher_openarch', { id: 1, with: 'spouse', type: 'birth' })).marks['tst:A1'].verdict, 'added');
            assert.ok((await post('ou_chercher_openarch_mark', { person_id: 1, key: 'tst:A1', verdict: 'no' })).json.error, 'déjà ajouté : pas « pas lui »');
            const u = await post('ou_chercher_openarch_undo', { batch: r.res.batch });
            assert.equal(u.status, 200, JSON.stringify(u.json));
            assert.equal(php(`echo (int) $pdo->query("SELECT count(*) FROM events WHERE id=${r.res.event_ids[0]}")->fetchColumn() + (int) $pdo->query("SELECT count(*) FROM sources WHERE id=${r.res.source_id}")->fetchColumn();`), '0');
            assert.ok(!(await get('ou_chercher_openarch', { id: 1, with: 'spouse', type: 'birth' })).marks['tst:A1']);
            assert.ok((await post('ou_chercher_openarch_undo', { batch: r.res.batch })).json.error, 'pas deux fois');
        });
        await t('il n’est pas le sujet de l’acte (le père) : la source seulement, jamais d’événement', async () => {
            const r = await post('ou_chercher_openarch_add', { person_id: 1, archive: 'tst', identifier: 'A2', pid: 'Person21', mode: 'event' });
            assert.equal(r.status, 200, JSON.stringify(r.json)); assert.deepEqual(r.res.event_ids, []); assert.match(r.res.notes.join(' '), /pas le sujet/);
            await post('ou_chercher_openarch_undo', { batch: r.res.batch });
            // une naissance déjà sur la fiche : gardée telle quelle
            const k = await post('ou_chercher_openarch_add', { person_id: 4, archive: 'tst', identifier: 'A2', pid: 'Person20', mode: 'event' });
            assert.deepEqual(k.res.event_ids, []); assert.match(k.res.notes.join(' '), /déjà cet événement/);
            await post('ou_chercher_openarch_undo', { batch: k.res.batch });
        });
        await t('✗ Pas lui, puis ↶ ; clé forgée et CSRF refusés', async () => {
            let r = await post('ou_chercher_openarch_mark', { person_id: 1, key: 'tst:A3', verdict: 'no' });
            assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.res.prev, '');
            assert.equal((await get('ou_chercher_openarch', { id: 1, with: 'spouse', type: 'birth' })).marks['tst:A3'].verdict, 'no');
            r = await post('ou_chercher_openarch_mark', { person_id: 1, key: 'tst:A3', verdict: '' }); assert.equal(r.res.prev, 'no');
            assert.ok(!(await get('ou_chercher_openarch', { id: 1, with: 'spouse', type: 'birth' })).marks['tst:A3']);
            assert.ok((await post('ou_chercher_openarch_mark', { person_id: 1, key: "x'; DROP", verdict: 'no' })).json.error);
            assert.notEqual((await post('ou_chercher_openarch_add', { person_id: 1, archive: 'tst', identifier: 'A1', pid: 'Person11' }, 'faux')).status, 200, 'CSRF');
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
                await t(`navigateur ${name} : plan, registres, Open Archives (chercher, personnes, ＋ Ajouter, ↶)`, async () => {
                    const ctx = await browser.newContext({ viewport: vp, colorScheme: dark ? 'dark' : 'light' });
                    await ctx.addInitScript(() => { try { localStorage.setItem('genealogie-last-route', '#tableau-de-bord'); } catch (_) {} });
                    const p = await ctx.newPage(); watch(p, name);
                    await p.goto(base);
                    await p.waitForFunction(() => window.LCNDA_APP?.state && window.LCNDA_EXT?.ouChercher && window.LCNDA_OU_CHERCHER, null, { timeout: 20000 });
                    if (dark) await p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
                    // les fichiers à brancher dans index.php (s'ils n'y sont pas encore)
                    if (!(await p.evaluate(() => !!window.LCNDA_OUC_MONDE))) {
                        for (const f of ['app-ou-chercher-monde.js', 'app-ou-chercher-openarch.js', 'heritage-ou-chercher-plus.js']) await p.addScriptTag({ url: `${base}assets/js/${f}` });
                        await p.addStyleTag({ url: `${base}assets/css/ou-chercher-monde.css` });
                    }
                    await p.evaluate(() => window.LCNDA_EXT.ouChercher.openPerson(1));
                    await p.waitForSelector('.ouc-page .ouc-plan .ouc-tip', { timeout: 20000 });
                    assert.ok(await p.locator('.ouc-page .ouc-guides').count() === 1, 'registres de ses pays');
                    assert.match(await p.locator('.ouc-page .ouc-guides summary').innerText(), /Belgique/);
                    assert.ok(await p.evaluate(() => window.LCNDA_EXT.ouChercher.allSites().some(s => s.key === 'ocm_fs_be')), 'les sites du monde sont dans le registre');
                    const oa = p.locator('.ouc-page [data-ouc-oa]');
                    assert.equal(await oa.evaluate(d => d.open), true, 'a vécu en Belgique : Open Archives ouvert');
                    await oa.locator('select[name="with"]').selectOption('spouse');
                    await oa.locator('[data-oa-go]').click();
                    await p.waitForSelector('.ouc-page [data-oa-key="tst:A1"]', { timeout: 15000 });
                    assert.match(await p.locator('.ouc-page [data-oa-key="tst:A1"]').innerText(), /Très probable/i);
                    await p.locator('.ouc-page [data-oa-key="tst:A1"] [data-oa-persons]').click();
                    await p.waitForSelector('.ouc-page [data-oa-key="tst:A1"] .ouc-oa-rec table', { timeout: 15000 });
                    assert.match(await p.locator('.ouc-page [data-oa-key="tst:A1"] .ouc-oa-rec').innerText(), /Pieter MAZAUD[\s\S]*Père/);
                    await p.locator('.ouc-page [data-oa-key="tst:A1"] [data-oa-add]').click();
                    await p.locator('.ui-actmenu button', { hasText: 'événement' }).first().click();
                    await p.waitForSelector('.ouc-page [data-oa-key="tst:A1"].is-done', { timeout: 15000 });
                    assert.equal(php(`echo (int) $pdo->query("SELECT count(*) FROM events WHERE person_id=1 AND fact_confidence='doubt'")->fetchColumn();`), '1');
                    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `ouc-monde-${name}.png`), fullPage: true });
                    await noScroll(p);
                    await p.locator('#toast-region button', { hasText: 'Annuler' }).first().click();
                    await p.waitForFunction(() => !document.querySelector('.ouc-page [data-oa-key="tst:A1"].is-done'), null, { timeout: 15000 });
                    assert.equal(php(`echo (int) $pdo->query("SELECT count(*) FROM events WHERE person_id=1 AND fact_confidence='doubt'")->fetchColumn();`), '0');
                    // ✗ Pas lui → rangé à part, puis ↶
                    await p.locator('.ouc-page [data-oa-key="tst:A3"] [data-oa-no]').click();
                    await p.waitForSelector('.ouc-page [data-oa-nolist] [data-oa-key="tst:A3"]', { state: 'attached', timeout: 15000 });
                    await p.locator('#toast-region button', { hasText: 'Annuler' }).first().click();
                    await p.waitForFunction(() => !document.querySelector('.ouc-page [data-oa-nolist]'), null, { timeout: 15000 });
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
