'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🗂 Archives en ligne (suite) :   node tests/test-sources-ouvertes-2.js
 *  1. calculs purs (app-sources-ouvertes-2-core.js) : adresses construites et encodées (FranceArchives filtré par service,
 *     Gallica, POP, Belgique, cantons suisses, modèle à soi, adresses dangereuses refusées), lecture du texte copié
 *     (décret, acte notarié, convoi, notice POP, Journal officiel), ajouts proposés (rien d'écrasé, respect) ;
 *  2. aucune requête sortante de l'app : ni dans le code (JS, PHP), ni depuis le navigateur ;
 *  3. l'API sur une petite base inventée : « c'est la même personne ? », imports → médias / sources / événements /
 *     inventaire / départ / bloc militaire / lieu / maison / objet, « Pas sûr » (rien sur la fiche), ↶ Annuler (tout revient),
 *     types refusés, CSRF ; exclusion des jeux (mode_simple_data, tresor_tree) pour les fiches de déportés ou fusillés ;
 *  4. le navigateur (Playwright ; sinon sauté) à 1440 px, 390 px et en sombre : fenêtre de recherche, réglage des sites,
 *     import d'une notice avec ↶ Annuler, boutons des blocs, sans erreur ni défilement horizontal.
 * Captures : SHOTS=dossier node tests/test-sources-ouvertes-2.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const S2 = require('../assets/js/app-sources-ouvertes-2-core.js');
const SHOTS = process.env.SHOTS || '';
// un PNG de 1 × 1 px
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const finish = () => { if (failed) { console.error(`\n${failed} échec(s)`); process.exit(1); } console.log('\nTout est bon.'); };

(async () => {
    /* ═════ 1. calculs purs ═════ */
    const P = {first: 'Jean Marie', last: 'Dupré & Fils', place: 'Saint-Étienne, Loire', y1: 1930, y2: 1900};
    await t('FranceArchives (adresses vérifiées) : Archives nationales, ANOM, SHD — nom encodé, filtre du service', () => {
        const u = new URL(S2.url('an_naturalisation', P));
        assert.equal(u.origin + u.pathname, 'https://francearchives.gouv.fr/fr/search');
        assert.equal(u.searchParams.get('q'), 'Dupré & Fils Jean naturalisation');
        assert.equal(u.searchParams.get('es_publisher'), '34633');
        assert.ok(/q=Dupr%C3%A9%20%26%20Fils/.test(S2.url('an_naturalisation', P)), 'é, & et espaces encodés');
        assert.equal(new URL(S2.url('an_minutier', P)).searchParams.get('q'), 'Dupré & Fils Jean minutier central');
        assert.equal(new URL(S2.url('anom_bagnards', P)).searchParams.get('es_publisher'), '34641');
        assert.equal(new URL(S2.url('shd_marins', P)).searchParams.get('es_publisher'), '34577');
        assert.equal(new URL(S2.url('shd_officiers', P)).searchParams.get('es_publisher'), '34577');
        for (const k of ['an_naturalisation', 'an_minutier', 'anom_fa', 'anom_bagnards', 'shd_marins', 'shd_officiers']) assert.equal(S2.site(k).verified, true, k);
    });
    await t('Gallica (Journal officiel, annuaires), POP, Belgique, Suisse, Maitron, Ellis : formes connues, années dans l’ordre', () => {
        const jo = decodeURIComponent(new URL(S2.url('jo_gallica', P)).searchParams.get('query'));
        assert.match(jo, /\(gallica all "Jean Dupré & Fils"\) and \(dc\.title all "Journal officiel de la République française"\)/);
        assert.match(jo, /gallicapublication_date>="1900\/01\/01" and gallicapublication_date<="1930\/12\/31"/, 'années remises dans l’ordre');
        const an = decodeURIComponent(new URL(S2.url('annuaires_gallica', P)).searchParams.get('query'));
        assert.match(an, /\(gallica all "Dupré & Fils"\) and \(dc\.title all "annuaire"\) and \(gallica all "Saint-Étienne"\)/, 'nom de famille seul + commune');
        const pop = new URL(S2.url('pop_merimee', {what: 'église Saint-Martin', place: 'Auch, Gers'}));
        assert.equal(pop.hostname, 'pop.culture.gouv.fr');
        assert.deepEqual(JSON.parse(pop.searchParams.get('base')), ['Patrimoine architectural (Mérimée)']);
        assert.equal(JSON.parse(pop.searchParams.get('mainSearch')), 'église Saint-Martin Auch');
        assert.deepEqual(JSON.parse(new URL(S2.url('pop_palissy', {q: 'cloche'})).searchParams.get('base')), ['Patrimoine mobilier (Palissy)']);
        assert.equal(S2.url('be_arch', {last: 'Van den Berg', first: 'Anna Maria'}), 'https://search.arch.be/fr/rechercher-des-personnes/resultats/q/persoon_achternaam_t_0/Van%20den%20Berg/persoon_voornaam_t_0/Anna');
        assert.match(decodeURIComponent(S2.url('ch_canton', {last: 'Rochat', canton: 'VD'})), /site:vd\.ch "Rochat" archives/);
        assert.equal(S2.url('ch_canton', {last: 'Rochat'}), 'https://www.archives-online.org/', 'sans canton : la recherche dans toutes les archives suisses');
        assert.equal(S2.url('maitron_fusilles', {first: 'Guy', last: 'Môquet'}), 'https://fusilles-40-44.maitron.fr/?s=Guy%20M%C3%B4quet');
        assert.equal(S2.site('ellis').account, true, 'Ellis Island : compte gratuit signalé');
        assert.equal(S2.CANTONS.length, 26);
        for (const s of S2.SITES) { const u = S2.url(s.key, P); assert.ok(/^https:\/\/|^http:\/\/www\.bddm\.org/.test(u) && !/[\s<>"]/.test(u), `${s.key} : ${u}`); }
    });
    await t('« ⚙️ Adresses des sites » : modèle à soi rempli et encodé ; javascript: et adresses cassées refusées', () => {
        assert.equal(S2.url('an_naturalisation', {last: 'Lévy', first: 'Anne'}, {an_naturalisation: 'https://exemple.org/r?n={nom}&p={prénom}'}), 'https://exemple.org/r?n=L%C3%A9vy&p=Anne');
        assert.match(S2.url('an_naturalisation', {last: 'X'}, {an_naturalisation: 'javascript:alert(1)'}), /^https:\/\/francearchives/, 'modèle dangereux : l’adresse de l’app');
        assert.ok(!/[<>"\s]/.test(S2.url('maitron_fusilles', {last: '<script>"x y'})));
        assert.equal(S2.cleanUrl('javascript:alert(1)'), '');
        assert.equal(S2.url('inconnu', P), '');
    });
    await t('lecture du texte copié : décret, acte notarié, convoi, notice POP, Journal officiel, liens reconnus', () => {
        const n = S2.parseFields('Dupont, Raymond\nDécret du 12 mars 1925\nNuméro de dossier : 1234 X 25\nCote : BB/11/8123\nNationalité : italienne', 'naturalisation');
        assert.deepEqual([n.date, n.number, n.cote, n.origin], ['12 mars 1925', '1234 X 25', 'BB/11/8123', 'italienne']);
        const m = S2.parseFields('Inventaire après décès de Jean Dupont, 3 mai 1785, étude LXXXVIII, MC/ET/LXXXVIII/812', 'minutier');
        assert.equal(m.act, 'inventaire'); assert.equal(m.cote, 'MC/ET/LXXXVIII/812'); assert.equal(m.date, '3 mai 1785');
        const d = S2.parseFields('Convoi n° 57 parti de Drancy le 18 juillet 1943 vers Auschwitz. Décédée le 23 juillet 1943', 'deportation');
        assert.deepEqual([d.convoy, d.from, d.camp, d.date, d.death_date], ['57', 'Drancy', 'Auschwitz', '18 juillet 1943', '23 juillet 1943']);
        const p = S2.parseFields('Église Saint-Martin\nRéférence : PA00094325\nProtection : classé MH (1840)\nHistorique : construite au XIIe siècle.', 'patrimoine');
        assert.deepEqual([p.ref, p.protection, p.summary], ['PA00094325', 'classé MH (1840)', 'construite au XIIe siècle.']);
        assert.equal(S2.parseFields('Par décret, M. Dupont est autorisé à substituer à son nom celui de Durand', 'jo').act, 'nom');
        assert.equal(S2.parseLink('https://pop.culture.gouv.fr/notice/merimee/PA00094325').ref, 'PA00094325');
        assert.equal(S2.kindFromLink('https://fusilles-40-44.maitron.fr/spip.php?article1'), 'fusille');
        assert.equal(S2.kindFromLink('https://heritage.statueofliberty.org/passenger-details/x'), 'ellis');
        assert.equal(S2.parseLink('javascript:alert(1)').url, '');
    });
    await t('ajouts proposés : rien d’écrasé (déjà sur la fiche → décoché), union nécessaire, respect', () => {
        const fiche = {events: [{type_slug: 'naturalisation', gedcom_tag: 'NATU', label: 'Naturalisation', date_text: '1925', year: 1925}], hasSpouse: false};
        const nat = S2.proposals('naturalisation', {date: '12 mars 1925'}, fiche);
        assert.equal(nat[0].checked, false); assert.match(nat[0].exists, /Naturalisation · 1925/);
        assert.equal(S2.proposals('naturalisation', {date: '12 mars 1931'}, fiche)[0].checked, true, 'autre année : proposée');
        const ct = S2.proposals('minutier', {act: 'contrat', date: '1780'}, fiche)[0];
        assert.equal(ct.scope, 'family'); assert.equal(ct.checked, false, 'pas d’union : décoché');
        assert.equal(S2.proposals('minutier', {act: 'inventaire'}, fiche)[0].what, 'probate');
        const dep = S2.proposals('deportation', {date: '18 juillet 1943', death_date: '23 juillet 1943'}, {events: []});
        assert.deepEqual(dep.map(x => x.type), ['deportation', 'deces-en-deportation', 'deces']);
        assert.equal(dep[2].checked, false, 'le décès « officiel » reste à cocher soi-même');
        assert.ok(S2.isRespectKind('deportation') && S2.isRespectKind('fusille') && !S2.isRespectKind('jo'));
        assert.deepEqual(S2.RESPECT.slugs, ['deportation', 'deces-en-deportation', 'fusille']);
        assert.equal(S2.proposals('shd_marin', {quarter: 'Granville', number: '512'}, {events: []})[0].what, 'military');
        assert.equal(S2.proposals('ellis', {date: '3 mai 1907', ship: 'La Lorraine'}, {events: []}).find(x => x.what === 'voyage').title, 'La Lorraine');
    });

    /* ═════ 2. aucune requête sortante ═════ */
    await t('aucune requête de l’app vers ces sites : JS (seulement api.php) et PHP', () => {
        for (const f of ['assets/js/app-sources-ouvertes-2-core.js', 'assets/js/heritage-sources-ouvertes-2.js']) {
            const s = fs.readFileSync(path.join(appRoot, f), 'utf8');
            assert.ok(!/XMLHttpRequest|sendBeacon|new Image\(|import\(/.test(s), `${f} : pas de requête`);
            for (const m of s.matchAll(/\bfetch\s*\(\s*([^,)]+)/g)) assert.match(m[1], /^'api\.php\?action=so2_import'$/, `${f} : fetch vers ${m[1]}`);
        }
        const php = fs.readFileSync(path.join(appRoot, 'lib/sources_ouvertes_2.php'), 'utf8');
        assert.ok(!/curl_|file_get_contents\(\s*['"$]|fopen\(\s*['"]https?:|stream_context|http_get|fsockopen/.test(php), 'lib/sources_ouvertes_2.php : pas de requête');
    });

    /* ═════ 3. l'API ═════ */
    const phpPath = findPhp([devBundledPhp()]);
    if (!phpPath) { console.log('— PHP absent : partie serveur sautée'); return finish(); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-so2-'));
    const dir = path.join(tmp, 'a'); fs.mkdirSync(path.join(dir, 'media'), {recursive: true});
    const envFor = d => ({...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1'});
    // une famille inventée : Jean DUPONT (1890, marié à Marie), Rachel LÉVY (1910), Pierre MARTIN (parti en 1905), un lieu, une maison, un objet
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db(); houses_ensure($pdo);
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,is_start,living_status) VALUES(1,'Jean','DUPONT','male',1,'deceased'),(2,'Marie','DURAND','female',0,'deceased'),(3,'Rachel','LÉVY','female',0,'deceased'),(4,'Pierre','MARTIN','male',0,'deceased')");
$pdo->exec("INSERT INTO places(id,name,county,country,description) VALUES(1,'Auch','Gers','France','Chef-lieu du Gers.')");
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,1,2)");
$ev = $pdo->prepare('INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES(?,?,?,?,?,?)');
foreach ([[1,'BIRT','2 février 1890',1890],[3,'BIRT','4 avril 1910',1910],[4,'BIRT','1 juin 1880',1880]] as [$pid,$tag,$d,$y]) { $ev->execute(['person',$pid,$t($tag),$d,$y,1]); }
$pdo->exec("INSERT INTO person_voyages(person_id,departure_year,departure_port,ship_name,destination) VALUES(1,1912,'Le Havre','La Savoie','New York')");
$pdo->exec("INSERT INTO houses(id,name,place_id,place_text,data_json) VALUES(1,'Maison du bourg',1,'Auch','{\"meta\":{\"people\":[],\"note\":\"Achetée en 1850.\"},\"floors\":[]}')");
$pdo->exec("INSERT INTO family_objects(id,title,kind,description) VALUES(1,'Cloche de la chapelle','objet','Donnée par l’arrière-grand-père.')");
echo 'ok';`], {cwd: appRoot, encoding: 'utf8', env: envFor(dir)});
    if (r.status !== 0 || !String(r.stdout).includes('ok')) { console.error(r.stderr || r.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], {cwd: appRoot, env: envFor(dir), stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    const sql = q => { const x = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `$p=new PDO('sqlite:'.getenv('GENEALOGY_DATA_DIR').'/genealogy.sqlite');echo json_encode($p->query(${JSON.stringify(q)})->fetchAll(PDO::FETCH_ASSOC));`], {cwd: appRoot, encoding: 'utf8', env: envFor(dir)}); return JSON.parse(x.stdout || '[]'); };
    try {
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
        let cookie = '';
        const html = await (await fetch(base).then(x => { cookie = (x.headers.get('set-cookie') || '').split(';')[0]; return x; })).text();
        const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
        const get = async (action, q = {}) => (await fetch(`${base}api.php?action=${action}&${new URLSearchParams(q)}`, {headers: {Cookie: cookie}})).json();
        const post = async (action, body, token = csrf) => { const x = await fetch(`${base}api.php?action=${action}`, {method: 'POST', headers: {Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': token}, body: JSON.stringify({...body, csrf: token})}); const j = await x.json().catch(() => ({})); return {status: x.status, body: j, result: j.result}; };
        const imp = async (data, file = null, token = csrf) => {
            const fd = new FormData(); if (file) fd.append('file', new Blob([file.data], {type: file.type}), file.name);
            fd.append('data', JSON.stringify(data)); fd.append('csrf', token);
            const x = await fetch(`${base}api.php?action=so2_import`, {method: 'POST', headers: {Cookie: cookie, 'X-CSRF-Token': token}, body: fd}); const j = await x.json().catch(() => ({})); return {status: x.status, body: j, result: j.result};
        };
        const count = q => Number(sql(q)[0]?.n || 0);

        await t('migration 77 : les types Déportation, Décès en déportation, Fusillé… existent, une seule fois', () => {
            for (const l of ['Déportation', 'Décès en déportation', 'Fusillé', 'Condamnation', 'Arrivée au bagne', 'Décoration', 'Changement de nom']) assert.equal(count(`SELECT count(*) n FROM event_types WHERE label='${l}'`), 1, l);
        });
        await t('API : « c’est la même personne ? » — la fiche, ses événements, les écarts ; rien n’est écrit', async () => {
            const n0 = count('SELECT count(*) n FROM events');
            const pv = await post('so2_preview', {kind: 'naturalisation', person_id: 1, fields: {last: 'Dupond', first: 'Pierre', birth: '1870', date: '1885'}});
            assert.equal(pv.status, 200, JSON.stringify(pv.body));
            assert.equal(pv.result.person.last, 'DUPONT'); assert.equal(pv.result.person.hasSpouse, true); assert.equal(pv.result.person.hasVoyage, true);
            const txt = pv.result.ecarts.map(e => e.text).join(' | ');
            assert.match(txt, /« Dupond », la fiche « DUPONT »/); assert.match(txt, /Prénom lu « Pierre »/); assert.match(txt, /Né\(e\) en 1870/); assert.match(txt, /avant la naissance/);
            assert.equal((await post('so2_preview', {kind: 'naturalisation', person_id: 1, fields: {last: 'Dupont', first: 'Jean'}})).result.ecarts.length, 0);
            assert.equal(count('SELECT count(*) n FROM events'), n0);
        });
        let natBatch = '';
        await t('API : décret de naturalisation (image) → média relié, source avec le lien et la mention, événement, départ complété', async () => {
            const url = 'https://francearchives.gouv.fr/fr/facomponent/f42b4a0697866edaab6c25db410b3dba87a92183';
            const fields = {last: 'Dupont', first: 'Jean', date: '12 mars 1925', number: '1234 X 25', cote: 'BB/11/8123', origin: 'italienne'};
            const adds = S2.proposals('naturalisation', fields, {events: [], hasVoyage: true});
            const x = await imp({kind: 'naturalisation', person_id: 1, url, fields, adds}, {data: PNG, type: 'image/png', name: 'decret.png'});
            assert.equal(x.status, 200, JSON.stringify(x.body));
            natBatch = x.result.batch; assert.match(natBatch, /^so2-/);
            const m = sql(`SELECT * FROM media WHERE id=${x.result.media_id}`)[0];
            assert.match(m.description, /à vérifier sur le document/); assert.equal(m.document_url, url); assert.equal(m.document_reference, 'BB/11/8123');
            assert.ok(fs.existsSync(path.join(dir, 'media', m.filename)), 'fichier rangé');
            assert.equal(count(`SELECT count(*) n FROM media_links WHERE media_id=${m.id} AND entity_type='person' AND entity_id=1`), 1);
            const s = sql(`SELECT * FROM sources WHERE id=${x.result.source_id}`)[0];
            assert.equal(s.url, url); assert.match(s.title, /Décret de naturalisation — Jean DUPONT \(BB\/11\/8123\)/); assert.match(s.text, /à vérifier/);
            const ev = sql(`SELECT e.*, t.label FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.id=${x.result.event_ids[0]}`)[0];
            assert.equal(ev.label, 'Naturalisation'); assert.equal(ev.date_text, '12 mars 1925'); assert.match(ev.description, /Dossier 1234 X 25/);
            assert.equal(count(`SELECT count(*) n FROM source_links WHERE source_record_id=${s.id} AND entity_type='event' AND entity_id=${ev.id}`), 1, 'source reliée à l’événement');
            assert.equal(sql('SELECT naturalization_date d FROM person_voyages WHERE person_id=1')[0].d, '12 mars 1925');
            const again = await post('so2_preview', {kind: 'naturalisation', person_id: 1, url, fields});
            assert.ok(again.result.ecarts.some(e => /déjà une source/.test(e.text)), 'doublon signalé');
        });
        await t('API : ↶ Annuler — l’événement, la source, le média (et son fichier) partent ; le départ redevient vide', async () => {
            const m = sql(`SELECT filename FROM media WHERE document_reference='BB/11/8123'`)[0];
            const u = await post('so2_undo', {batch: natBatch});
            assert.equal(u.status, 200, JSON.stringify(u.body));
            assert.equal(count(`SELECT count(*) n FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE t.label='Naturalisation'`), 0);
            assert.equal(count(`SELECT count(*) n FROM media WHERE document_reference='BB/11/8123'`), 0);
            assert.ok(!fs.existsSync(path.join(dir, 'media', m.filename)), 'fichier retiré');
            assert.equal(count(`SELECT count(*) n FROM sources WHERE url LIKE '%f42b4a06%'`), 0);
            assert.equal(sql('SELECT naturalization_date d FROM person_voyages WHERE person_id=1')[0].d, '');
            assert.ok((await post('so2_undo', {batch: natBatch})).status >= 400, 'déjà annulé');
            assert.ok((await post('so2_undo', {batch: 'so-123'})).status >= 400, 'pas un import de cet outil');
        });
        await t('API : Minutier central → inventaire après décès (liste existante) et contrat de mariage sur l’union', async () => {
            const a = await imp({kind: 'minutier', person_id: 1, url: 'https://francearchives.gouv.fr/fr/facomponent/aaaa', fields: {act: 'inventaire', date: '3 mai 1785', notary: 'Me Dubois', cote: 'MC/ET/LXXXVIII/812'},
                adds: S2.proposals('minutier', {act: 'inventaire', date: '3 mai 1785', notary: 'Me Dubois', cote: 'MC/ET/LXXXVIII/812'}, {events: []})});
            assert.equal(a.status, 200, JSON.stringify(a.body));
            const inv = sql('SELECT * FROM probate_inventories WHERE person_id=1')[0];
            assert.equal(inv.notary, 'Me Dubois'); assert.equal(inv.reference, 'MC/ET/LXXXVIII/812'); assert.equal(Number(inv.year), 1785);
            const c = await imp({kind: 'minutier', person_id: 1, url: 'https://francearchives.gouv.fr/fr/facomponent/bbbb', fields: {act: 'contrat', date: '1 juin 1913'},
                adds: S2.proposals('minutier', {act: 'contrat', date: '1 juin 1913'}, {events: [], hasSpouse: true})});
            assert.equal(c.status, 200, JSON.stringify(c.body));
            assert.equal(count(`SELECT count(*) n FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.family_id=1 AND t.gedcom_tag='MARC'`), 1);
            await post('so2_undo', {batch: c.result.batch}); await post('so2_undo', {batch: a.result.batch});
            assert.equal(count('SELECT count(*) n FROM probate_inventories'), 0); assert.equal(count(`SELECT count(*) n FROM events WHERE family_id=1`), 0);
        });
        await t('API : inscrit maritime → notes du bloc militaire complétées (rien remplacé), document dans le bloc ; ↶ remet', async () => {
            sql(`UPDATE persons SET military_data='{"matricule":"512","notes_militaires":"Notes d’avant."}' WHERE id=1`);
            const f = {quarter: 'Granville', number: '512', cote: 'SHD 3 P 12'};
            const x = await imp({kind: 'shd_marin', person_id: 1, url: 'https://francearchives.gouv.fr/fr/facomponent/cccc', fields: f, adds: S2.proposals('shd_marin', f, {events: []})}, {data: PNG, type: 'image/png', name: 'marin.png'});
            assert.equal(x.status, 200, JSON.stringify(x.body));
            const mil = JSON.parse(sql('SELECT military_data m FROM persons WHERE id=1')[0].m);
            assert.equal(mil.matricule, '512'); assert.match(mil.notes_militaires, /^Notes d’avant\.\n\nInscrit maritime · quartier de Granville · folio 512 · Cote SHD 3 P 12$/);
            assert.equal(count(`SELECT count(*) n FROM media_links WHERE entity_type='military' AND entity_id=1`), 1);
            await post('so2_undo', {batch: x.result.batch});
            assert.equal(JSON.parse(sql('SELECT military_data m FROM persons WHERE id=1')[0].m).notes_militaires, 'Notes d’avant.');
        });
        let depBatch = '';
        await t('API : notice de déportation → « Déportation » et « Décès en déportation » ; la fiche sort des jeux (mode simple, Trésors)', async () => {
            const f = S2.parseFields('Convoi n° 57 parti de Drancy le 18 juillet 1943 vers Auschwitz. Décédée le 23 juillet 1943', 'deportation');
            const x = await imp({kind: 'deportation', person_id: 3, url: 'https://www.memorialdelashoah.org/exemple', fields: {...f, last: 'Lévy', first: 'Rachel'}, adds: S2.proposals('deportation', f, {events: []})});
            assert.equal(x.status, 200, JSON.stringify(x.body)); depBatch = x.result.batch;
            const labels = sql('SELECT t.label l FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=3 ORDER BY e.id').map(e => e.l);
            assert.deepEqual(labels, ['Naissance', 'Déportation', 'Décès en déportation'], 'le décès « officiel » non coché n’est pas ajouté');
            const ms = await get('mode_simple_data');
            const rachel = (ms.persons || []).find(p => p.id === 3), jean = (ms.persons || []).find(p => p.id === 1);
            assert.equal(rachel.mem, 1); assert.equal(jean.mem, 0);
            const tr = await get('tresor_tree');
            assert.equal(tr.people.find(p => p.id === 3).mem, true);
            const games = ['app-jeu-famille-logique.js', 'app-jeu-plateau.js', 'app-jeu-naval.js', 'app-jeu-cables.js', 'app-labyrinthe.js', 'heritage-tresors-jeux.js', 'heritage-tresors-histoires.js', 'heritage-bunker.js', 'heritage-bunker-moteur.js'];
            for (const g of games) assert.match(fs.readFileSync(path.join(appRoot, 'assets/js', g), 'utf8'), /[!|] ?[a-z]\.mem\b|\|\| p\.mem/, `${g} écarte « mem »`);
            const L = require('../assets/js/app-jeu-famille-logique.js');
            const pool = (L.pool || window?.LCNDA_JEU_LOGIQUE?.pool)?.({persons: [{id: 1, first: 'Jean', last: 'D'}, {id: 3, first: 'Rachel', last: 'L', mem: 1}], families: []}, {scope: 'all'});
            if (pool) assert.deepEqual(pool.map(p => p.id), [1], 'le jeu ne la tire jamais');
        });
        await t('API : ↶ Annuler la notice — la fiche revient dans les jeux', async () => {
            await post('so2_undo', {batch: depBatch});
            assert.equal(((await get('mode_simple_data')).persons || []).find(p => p.id === 3).mem, 0);
        });
        await t('API : « Pas sûr que ce soit la même personne » → le document et la source sont gardés, rien sur la fiche', async () => {
            const n0 = count('SELECT count(*) n FROM events');
            const x = await imp({kind: 'fusille', person_id: 4, same: 'no', url: 'https://fusilles-40-44.maitron.fr/spip.php?article9', fields: {date: '15 décembre 1941', place: 'Mont-Valérien'}, adds: S2.proposals('fusille', {date: '15 décembre 1941'}, {events: []})}, {data: PNG, type: 'image/png', name: 'notice.png'});
            assert.equal(x.status, 200, JSON.stringify(x.body));
            assert.equal(count('SELECT count(*) n FROM events'), n0);
            assert.equal(count(`SELECT count(*) n FROM media_links WHERE media_id=${x.result.media_id} AND entity_type='person'`), 0);
            assert.equal(count(`SELECT count(*) n FROM media_links WHERE media_id=${x.result.media_id} AND entity_type='source'`), 1);
            assert.match(x.result.summary, /rien ajouté à la fiche/);
            await post('so2_undo', {batch: x.result.batch});
        });
        await t('API : Ellis Island → un départ dans « Départs et émigration » + Immigration ; annuaire → résidence et profession', async () => {
            const f = {date: '3 mai 1907', ship: 'La Lorraine', from: 'Le Havre', age: '27', dest: 'Chicago'};
            const x = await imp({kind: 'ellis', person_id: 4, url: 'https://heritage.statueofliberty.org/passenger-details/x', fields: f, adds: S2.proposals('ellis', f, {events: []})});
            assert.equal(x.status, 200, JSON.stringify(x.body));
            const v = sql('SELECT * FROM person_voyages WHERE person_id=4')[0];
            assert.equal(v.ship_name, 'La Lorraine'); assert.equal(v.arrival_port, 'New York (Ellis Island)'); assert.equal(v.departure_port, 'Le Havre'); assert.match(v.passenger_list_url, /statueofliberty/);
            assert.equal(Number(sql('SELECT show_voyage_block s FROM persons WHERE id=4')[0].s), 1);
            await post('so2_undo', {batch: x.result.batch});
            assert.equal(count('SELECT count(*) n FROM person_voyages WHERE person_id=4'), 0);
            assert.equal(Number(sql('SELECT COALESCE(show_voyage_block,0) s FROM persons WHERE id=4')[0].s), 0);
            const a = {year: '1898', trade: 'boulanger', address: '12 rue Haute', place: 'Auch'};
            const y = await imp({kind: 'annuaire', person_id: 4, url: 'https://gallica.bnf.fr/ark:/12148/bpt6k123', fields: a, adds: S2.proposals('annuaire', a, {events: []})});
            assert.equal(y.status, 200, JSON.stringify(y.body));
            assert.deepEqual(sql(`SELECT t.gedcom_tag g, e.title, e.description FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=4 AND t.gedcom_tag IN ('RESI','OCCU') ORDER BY t.gedcom_tag`).map(e => e.g), ['OCCU', 'RESI']);
            await post('so2_undo', {batch: y.result.batch});
        });
        await t('API : notice Mérimée / Palissy → texte ajouté au lieu, à la maison, à l’objet (rien remplacé) ; ↶ remet', async () => {
            const f = {ref: 'PA00094325', title: 'Église Saint-Martin', protection: 'classé MH', summary: 'Construite au XIIe siècle.'};
            const adds = S2.proposals('patrimoine', f, {});
            const pl = await imp({kind: 'patrimoine', person_id: 0, url: 'https://pop.culture.gouv.fr/notice/merimee/PA00094325', fields: f, adds, target: {type: 'place', id: 1}}, {data: PNG, type: 'image/png', name: 'eglise.png'});
            assert.equal(pl.status, 200, JSON.stringify(pl.body));
            const d = sql('SELECT description d FROM places WHERE id=1')[0].d;
            assert.match(d, /^Chef-lieu du Gers\.\n\nÉglise Saint-Martin\nNotice PA00094325/); assert.match(d, /à vérifier/);
            assert.match(d, /Image rangée dans les médias/, 'l’image est nommée (un lieu n’a pas de liste de médias)');
            assert.equal(count(`SELECT count(*) n FROM source_links WHERE entity_type='place' AND entity_id=1`), 1, 'source reliée au lieu');
            const mono = await get('place_monograph', {place_id: 1});
            assert.match(mono.place.description || '', /PA00094325/, 'la monographie montre la notice');
            const ob = await imp({kind: 'patrimoine', url: 'https://pop.culture.gouv.fr/notice/palissy/PM32000123', fields: {ref: 'PM32000123', title: 'Cloche'}, adds: S2.proposals('patrimoine', {ref: 'PM32000123', title: 'Cloche'}, {}), target: {type: 'object', id: 1}}, {data: PNG, type: 'image/png', name: 'cloche.png'});
            assert.equal(ob.status, 200, JSON.stringify(ob.body));
            assert.match(sql('SELECT description d FROM family_objects WHERE id=1')[0].d, /^Donnée par l’arrière-grand-père\.\n\nCloche\nNotice PM32000123/);
            assert.equal(count(`SELECT count(*) n FROM family_collection_media WHERE collection_type='family_object' AND collection_id=1`), 1);
            const ho = await imp({kind: 'patrimoine', url: 'https://pop.culture.gouv.fr/notice/merimee/IA32000001', fields: {ref: 'IA32000001', summary: 'Maison de maître.'}, adds: S2.proposals('patrimoine', {ref: 'IA32000001', summary: 'Maison de maître.'}, {}), target: {type: 'house', id: 1}});
            assert.equal(ho.status, 200, JSON.stringify(ho.body));
            assert.match(JSON.parse(sql('SELECT data_json j FROM houses WHERE id=1')[0].j).meta.note, /^Achetée en 1850\.\n\nNotice IA32000001/);
            for (const b of [ho, ob, pl]) assert.equal((await post('so2_undo', {batch: b.result.batch})).status, 200);
            assert.equal(sql('SELECT description d FROM places WHERE id=1')[0].d, 'Chef-lieu du Gers.');
            assert.equal(sql('SELECT description d FROM family_objects WHERE id=1')[0].d, 'Donnée par l’arrière-grand-père.');
            assert.equal(JSON.parse(sql('SELECT data_json j FROM houses WHERE id=1')[0].j).meta.note, 'Achetée en 1850.');
            assert.equal(count(`SELECT count(*) n FROM family_collection_media`), 0);
        });
        await t('API : refus — sorte inconnue, ajout d’un autre type, sans fiche, sans rien, lien javascript:, CSRF', async () => {
            assert.equal((await imp({kind: 'pirate', person_id: 1, url: 'https://x.org/'})).status, 422);
            assert.equal((await imp({kind: 'jo', person_id: 1, url: 'https://x.org/', adds: [{what: 'event', type: 'fusille', checked: true}]})).status, 422, 'Fusillé n’est pas un ajout du Journal officiel');
            assert.equal((await imp({kind: 'jo', person_id: 1, url: 'https://x.org/', adds: [{what: 'probate', checked: true}]})).status, 422);
            assert.ok((await imp({kind: 'jo', person_id: 0, url: 'https://x.org/'})).status >= 400, 'sans fiche');
            assert.ok((await imp({kind: 'patrimoine', person_id: 0, url: 'https://x.org/', target: {type: 'place', id: 999}})).status >= 400, 'lieu inexistant');
            assert.equal((await imp({kind: 'jo', person_id: 1})).status, 422, 'ni fichier, ni lien, ni texte');
            const js = await imp({kind: 'jo', person_id: 1, url: 'javascript:alert(1)', fields: {text: 'x'}, adds: []});
            if (js.status === 200) { assert.equal(sql(`SELECT url FROM sources WHERE id=${js.result.source_id}`)[0].url, '', 'lien dangereux non gardé'); await post('so2_undo', {batch: js.result.batch}); }
            const bad = await imp({kind: 'jo', person_id: 1, url: 'https://x.org/'}, null, 'mauvais-jeton');
            assert.ok(bad.status === 403 || bad.status === 400 || bad.status === 419, `CSRF : ${bad.status}`);
            assert.ok((await imp({kind: 'jo', person_id: 1, url: 'https://x.org/'}, {data: Buffer.from('<?php echo 1;'), type: 'text/plain', name: 'x.php'})).status >= 400, 'fichier .php refusé');
            assert.equal((await fetch(`${base}api.php?action=so2_import`, {headers: {Cookie: cookie}})).status, 400, 'GET refusé');
        });

        /* ═════ 4. le navigateur ═════ */
        let pw = null;
        for (const m of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(m); break; } catch (_) {} }
        if (!pw) { console.log('— navigateur : Playwright absent, partie sautée'); return; }
        const browser = await pw.chromium.launch();
        const errors = [], external = [];
        const shot = async (p, name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, {recursive: true}); await p.screenshot({path: path.join(SHOTS, name), fullPage: false}); };
        try {
            for (const [name, vp, dark] of [['1440', {width: 1440, height: 900}, false], ['390', {width: 390, height: 844}, false], ['sombre', {width: 1440, height: 900}, true]]) {
                const ctx = await browser.newContext({viewport: vp, colorScheme: dark ? 'dark' : 'light'});
                await ctx.route(url => !url.href.startsWith(base), route => { external.push(route.request().url()); route.abort(); });
                const p = await ctx.newPage(); p.setDefaultTimeout(20000);
                p.on('pageerror', e => errors.push(`${name} : ${e.message}`));
                p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource|net::ERR_FAILED/.test(m.text())) errors.push(`${name} : ${m.text()}`); });
                p.on('dialog', d => { errors.push(`${name} : dialogue natif ${d.message()}`); d.dismiss(); });
                await p.goto(base);
                await p.waitForFunction(() => window.LCNDA_APP?.state && window.LCNDA_EXT?.sourcesOuvertes2 && window.LCNDA_SOURCES_OUVERTES_2, null, {timeout: 20000});
                if (dark) await p.evaluate(() => { const A = window.LCNDA_APP; localStorage.setItem('genealogie-design', JSON.stringify({...A.readDesignSettings(), preset: 'dark'})); A.applyDesign(); });
                const noScroll = async () => { const sw = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert.ok(sw <= 0, `défilement horizontal : ${sw}`); };
                await t(`${name} : fiche → bloc Militaire et « Chercher sur internet » portent les boutons ; 🔍 ouvre la fenêtre`, async () => {
                    await p.evaluate(() => window.LCNDA_APP.openPersonById(1));
                    await p.waitForSelector('[data-so2-search="shd"]', {state: 'attached', timeout: 15000});
                    await p.$eval('[data-so2-search="shd"]', el => el.click()); // à 390 px, les boutons d’un bloc sont rangés dans son menu
                    await p.waitForSelector('dialog.so2-search[open] [data-so2-url]');
                    const tab = await p.getAttribute('dialog.so2-search [data-so2-tab].is-active', 'data-so2-tab'); assert.equal(tab, 'shd');
                    const shown = await p.textContent('[data-so2-url="shd_marins"]'), href = await p.getAttribute('[data-so2-go="shd_marins"]', 'href');
                    assert.equal(shown, href); assert.match(href, /es_publisher=34577/); assert.match(href, /DUPONT%20Jean/);
                    assert.equal(await p.getAttribute('[data-so2-go="shd_marins"]', 'target'), '_blank');
                    await noScroll(); await shot(p, `so2-chercher-shd-${name}.png`);
                });
                await t(`${name} : onglet 🕯 — phrase de contexte sobre ; ⚙️ Adresses des sites (non vérifiées signalées)`, async () => {
                    await p.click('[data-so2-tab="memoire"]');
                    assert.match(await p.textContent('dialog.so2-search .so2-respect'), /pour que l’on se souvienne/);
                    await p.fill('dialog.so2-search [name=last]', 'Lévy');
                    assert.match(await p.getAttribute('[data-so2-go="maitron_fusilles"]', 'href'), /\?s=Jean%20L%C3%A9vy$/);
                    await shot(p, `so2-chercher-memoire-${name}.png`);
                    await p.click('[data-so2-tab="etranger"]');
                    assert.match(await p.textContent('dialog.so2-search'), /Compte gratuit/);
                    await p.selectOption('dialog.so2-search [name=canton]', 'GE');
                    assert.match(decodeURIComponent(await p.getAttribute('[data-so2-go="ch_canton"]', 'href')), /site:ge\.ch/);
                    await p.click('[data-so2-settings]');
                    await p.waitForSelector('dialog.so-settings[open] [data-so2-set]');
                    assert.match(await p.textContent('dialog.so-settings'), /adresse non vérifiée/);
                    await p.fill('dialog.so-settings input[name=maitron_fusilles]', 'https://exemple.org/?q={nom}');
                    await p.waitForTimeout(400);
                    await shot(p, `so2-reglages-${name}.png`);
                    await p.click('dialog.so-settings .modal-actions [data-ui-x]');
                    await p.click('[data-so2-tab="memoire"]');
                    assert.match(await p.getAttribute('[data-so2-go="maitron_fusilles"]', 'href'), /^https:\/\/exemple\.org\/\?q=L%C3%A9vy$/, 'adresse à soi appliquée');
                    await p.evaluate(() => localStorage.removeItem('genealogie-sources-ouvertes-2-sites'));
                    await noScroll();
                    await p.click('dialog.so2-search .modal-head [data-x]');
                });
                await t(`${name} : ⤒ Importer une notice (image) → « c’est la même personne ? », ajouts cochés, H7 ↶ Annuler`, async () => {
                    await p.evaluate(b64 => { const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); window.LCNDA_EXT.sourcesOuvertes2.openImport({personId: 3, kind: 'deportation', files: [new File([bin], 'notice.png', {type: 'image/png'})]}); }, PNG.toString('base64'));
                    await p.waitForSelector('dialog.so2-import[open] [data-so2-imp] .so2-f');
                    assert.match(await p.textContent('dialog.so2-import .so2-respect'), /n’apparaît plus dans les jeux/);
                    await p.fill('dialog.so2-import [name=convoy]', '57'); await p.fill('dialog.so2-import [name=date]', '18 juillet 1943');
                    await p.fill('dialog.so2-import [name=from]', 'Drancy'); await p.fill('dialog.so2-import [name=camp]', 'Auschwitz');
                    await p.fill('dialog.so2-import [name=last]', 'Lévi');
                    await p.waitForFunction(() => /Lévi/.test(document.querySelector('[data-so2-ecarts]')?.textContent || ''));
                    await p.waitForSelector('[data-so2-add="dep"]:checked');
                    await p.fill('dialog.so2-import [name=so2_link]', 'https://www.memorialdelashoah.org/exemple-navigateur');
                    await noScroll(); await shot(p, `so2-import-${name}.png`);
                    await p.click('dialog.so2-import [data-k-go]');
                    await p.waitForSelector('dialog.so2-import', {state: 'detached'});
                    await p.waitForFunction(() => /Notice de déportation/.test(document.body.textContent));
                    assert.equal(count(`SELECT count(*) n FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=3 AND t.label='Déportation'`), 1);
                    await shot(p, `so2-import-fait-${name}.png`);
                    await p.locator('button', {hasText: '↶ Annuler'}).last().click();
                    for (let i = 0; i < 40 && count(`SELECT count(*) n FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=3 AND t.label='Déportation'`); i++) await p.waitForTimeout(150);
                    assert.equal(count(`SELECT count(*) n FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=3 AND t.label='Déportation'`), 0, '↶ Annuler a tout retiré');
                });
                await t(`${name} : monographie du lieu (📜 notices, 🏰 Mérimée) et fiche d’objet (🏺 Palissy)`, async () => {
                    await p.evaluate(() => { const A = window.LCNDA_APP; A.state.graphPlaceMonograph = {...(A.state.graphPlaceMonograph || {}), id: 1, name: 'Auch', showEvents: true}; A.state.graphTab = 'place'; });
                    const html = await p.evaluate(() => window.LCNDA_EXT.sourcesOuvertes2.placeHtml({id: 1, name: 'Auch', description: 'Chef-lieu du Gers.'}));
                    assert.match(html, /data-so2-pop="place"/); assert.match(html, /📜 Description et notices/);
                    await p.evaluate(h => { const d = document.createElement('div'); d.id = 'so2-test-host'; d.innerHTML = h; document.body.appendChild(d); }, html);
                    await p.$eval('#so2-test-host [data-so2-pop="place"]', el => el.click());
                    await p.waitForSelector('dialog.so2-search[open] [data-so2-go="pop_merimee"]');
                    assert.match(await p.textContent('dialog.so2-search .so2-target'), /Auch/);
                    assert.match(decodeURIComponent(await p.getAttribute('[data-so2-go="pop_merimee"]', 'href')), /mainSearch="Auch Auch"|mainSearch="Auch"/);
                    await shot(p, `so2-patrimoine-${name}.png`);
                    await p.click('dialog.so2-search .modal-head [data-x]');
                    await p.evaluate(() => document.getElementById('so2-test-host')?.remove());
                    const ob = await p.evaluate(() => window.LCNDA_APP.familyObjectCardHtml({id: 1, title: 'Cloche', media: [], transfers: [], labels: []}));
                    assert.match(ob, /data-so2-pop="object"/);
                });
                await ctx.close();
            }
        } finally { await browser.close(); }
        await t('navigateur : aucune erreur, aucune requête vers un autre site', () => {
            assert.deepEqual(errors, []);
            assert.deepEqual(external.filter(u => /francearchives|memorialdelashoah|bddm|maitron|gallica|pop\.culture|arch\.be|statueofliberty|google|archives-online|siv\.archives|anom|servicehistorique/.test(u)), []);
        });
    } finally { proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    finish();
})().catch(e => { console.error(e); process.exit(1); });
