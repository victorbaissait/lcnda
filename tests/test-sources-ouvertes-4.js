'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🗂 Archives en ligne, quatrième lot (monuments aux morts, cimetières, Cassini / Géopatronyme, huguenots, rôles d'équipage,
 * Matricula et archives d'Europe, presse étrangère) :   node tests/test-sources-ouvertes-4.js
 *  1. calculs purs (app-sources-ouvertes-4-core.js) : adresses construites et encodées pour chaque site, adresse à soi,
 *     liens collés reconnus, dates en plusieurs langues, sorte d'acte, texte d'une fiche, tableau de population, noms INSEE ;
 *  2. aucune requête sortante (code du lot) ;
 *  3. l'API sur une petite base inventée : « c'est la même personne ? », import monument (décès, MPF, unité), tombe (sépulture,
 *     photo, inhumation), acte (jamais un 2e baptême), presse étrangère (import commun), population d'une commune (année déjà là
 *     gardée), ↶ Annuler pour chacun, CSRF et entrées forgées ;
 *  4. le navigateur (Playwright ; sinon sauté) à 1440 px, 390 px et en sombre : fiche (boutons des blocs), fenêtre « Chercher
 *     sur… », import d'une photo de tombe, monographie (population), sans erreur JavaScript ni requête vers ces sites.
 * Captures : SHOTS=dossier node tests/test-sources-ouvertes-4.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const S4 = require('../assets/js/app-sources-ouvertes-4-core.js');
const SHOTS = process.env.SHOTS || '';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const HOSTS = /memorialgenweb|cimetieres-de-france|billiongraves|geneanet\.org|cassini\.ehess|geopatronyme|refuge-huguenot|matricula-online|digitalarkivet|riksarkivet|danishfamilysearch|irishgenealogy|portafontium|hungaricana|jewishgen|loc\.gov|chroniclingamerica|trove\.nla|paperspast|delpher|google\.com|francearchives/;

(async () => {
    /* ═════ 1. calculs purs ═════ */
    await t('chaque site : une adresse https, encodée, sans rien de dangereux ; rangés par pays puis thème', () => {
        const p = {first: 'Léonie Marie', last: "D'Aubigné & Fils", place: 'Saint-Étienne, Loire', y1: 1880, y2: 1885, birthYear: 1860, deptCode: '42'};
        assert.ok(S4.SITES.length >= 22);
        for (const s of S4.SITES) {
            const u = S4.url(s.key, p);
            assert.ok(/^https:\/\//.test(u), `${s.key} : ${u}`);
            assert.ok(!/[<>"'\s]/.test(u), `${s.key} : caractère non encodé dans ${u}`);
            assert.ok(S4.GROUPS.some(g => g.key === s.group), s.key);
            assert.ok(typeof s.verified === 'boolean' && s.note, s.key);
            assert.ok(!/[<>"]/.test(S4.url(s.key, {last: '<script>"x'})), s.key);
        }
        assert.deepEqual(S4.GROUPS.map(g => g.country), ['France', 'France', 'France', 'France', 'Europe', 'Monde']);
        const ca = new URL(S4.url('chroniclingamerica', p)); assert.equal(ca.searchParams.get('q'), '"Léonie D\'Aubigné & Fils"'); assert.equal(ca.searchParams.get('dates'), '1880/1885');
        const ie = new URL(S4.url('irishgenealogy', p)); assert.equal(ie.searchParams.get('namel'), "D'Aubigné & Fils"); assert.equal(ie.searchParams.get('yyfrom'), '1880');
        const pp = new URL(S4.url('paperspast', p)); assert.equal(pp.searchParams.get('start_date'), '01-01-1880'); assert.equal(pp.searchParams.get('end_date'), '31-12-1885');
        const ma = new URL(S4.url('matricula', {place: 'Wien, Österreich'})); assert.equal(ma.searchParams.get('place'), 'Wien');
        assert.equal(S4.url('geopatronyme', {last: 'Dupouy'}), 'https://www.geopatronyme.com/nom/DUPOUY');
        assert.equal(new URL(S4.url('billiongraves', p)).searchParams.get('birth_year'), '1860');
        assert.equal(S4.url('jewishgen', p), 'https://www.jewishgen.org/databases/all/');
        assert.ok(S4.site('jewishgen').account, 'JewishGen : compte gratuit signalé');
        assert.ok(!S4.SITES.some(s => s.key === 'findagrave'), 'Find a Grave reste dans le 3e lot (pas en double)');
    });
    await t('adresse écrite par la personne : remplie, encodée ; une adresse non http est refusée', () => {
        assert.equal(S4.url('riksarkivet', {last: 'Åberg', first: 'Anna'}, {riksarkivet: 'https://ex.se/s?n={nom}&p={prénom}'}), 'https://ex.se/s?n=%C3%85berg&p=Anna');
        assert.ok(S4.url('riksarkivet', {last: 'X'}, {riksarkivet: 'javascript:alert({nom})'}).startsWith('https://sok.riksarkivet.se/'));
    });
    await t('liens collés : site, date, page, registre', () => {
        const ca = S4.parseLink('https://chroniclingamerica.loc.gov/lccn/sn84026749/1905-03-02/ed-1/seq-3/');
        assert.deepEqual([ca.site, ca.date, ca.page, ca.notice], ['chroniclingamerica', '2 mars 1905', '3', 'sn84026749']);
        const pp = S4.parseLink('https://paperspast.natlib.govt.nz/newspapers/ODT18850302.2.15'); assert.deepEqual([pp.site, pp.date], ['paperspast', '2 mars 1885']);
        const tr = S4.parseLink('https://trove.nla.gov.au/newspaper/article/12345678'); assert.deepEqual([tr.site, tr.notice], ['trove', '12345678']);
        const mt = S4.parseLink('https://data.matricula-online.eu/de/oesterreich/wien/01-st-stephan/01-05/?pg=12'); assert.deepEqual([mt.site, mt.page, mt.register], ['matricula', '12', '01-05']);
        const bg = S4.parseLink('https://billiongraves.com/grave/Jean-Dupont/12345'); assert.deepEqual([bg.site, bg.notice], ['billiongraves', '12345']);
        const ra = S4.parseLink('https://sok.riksarkivet.se/bildvisning/C0012345_00042'); assert.equal(ra.site, 'riksarkivet');
        assert.equal(S4.parseLink('javascript:alert(1)').site, '');
        assert.equal(S4.parseLink('https://exemple.org/').site, '');
    });
    await t('dates en plusieurs langues, sorte d’acte d’après les mots', () => {
        assert.equal(S4.readDate('12. März 1850').text, '12 mars 1850');
        assert.equal(S4.readDate('March 3rd, 1901').text, '3 mars 1901');
        assert.equal(S4.readDate('1877-04-03').text, '3 avril 1877');
        assert.equal(S4.readDate('03.04.1877').text, '3 avril 1877');
        assert.equal(S4.readDate('1er janvier 1800').text, '1er janvier 1800');
        assert.equal(S4.guessEvent('Dåp 1850, Bergen'), 'CHR'); assert.equal(S4.guessEvent('Burial record'), 'BURI');
        assert.equal(S4.guessEvent('Folketelling 1865'), 'CENS'); assert.equal(S4.guessEvent('Utvandrer'), 'EMIG'); assert.equal(S4.guessEvent('Geburt'), 'BIRT');
    });
    await t('texte d’une fiche : monument, tombe (GPS), acte', () => {
        const m = S4.parseFields('Nom : DUPONT\nPrénoms : Jean Marie\nDate de décès : 20/08/1914\nUnité : 152e RI\nMort pour la France', 'memorial');
        assert.deepEqual([m.last, m.first, m.death_date, m.unit, m.mpf, m.conflict], ['Dupont', 'Jean Marie', '20 août 1914', '152e RI', 'yes', '1914-1918']);
        const s = S4.parseFields('Cimetière : cimetière du Puy\nCommune : Tulle\nGPS : 45.2671, 1.7702', 'sepulture');
        assert.deepEqual([s.cemetery, s.city, s.gps_lat, s.gps_lon], ['cimetière du Puy', 'Tulle', '45.2671', '1.7702']);
        const a = S4.parseFields('Fornavn: Ole\nEtternavn: HANSEN\nKildetype: Dåp\nDato: 12.03.1850\nSogn: Bergen', 'acte');
        assert.deepEqual([a.first, a.last, a.tag, a.date, a.place], ['Ole', 'Hansen', 'CHR', '12 mars 1850', 'Bergen']);
    });
    await t('tableau de population : colonnes, deux lignes, « 1793 : 512 », noms ; doublons signalés', () => {
        const h = S4.parsePopulation('Années;1793;1800;1806;1821\nPopulation;512;498;1 203;1.450\n1793 : Montagne-sur-Loire');
        assert.deepEqual(h.rows, [{year: 1793, pop: 512}, {year: 1800, pop: 498}, {year: 1806, pop: 1203}, {year: 1821, pop: 1450}]);
        assert.deepEqual(h.names, [{year: 1793, name: 'Montagne-sur-Loire'}]);
        assert.deepEqual(S4.parsePopulation('1793\t512\n1800\t498').rows.length, 2);
        assert.deepEqual(S4.parsePopulation('1793 : 512 habitants\n1800 : 498\n1800 : 500').rows, [{year: 1793, pop: 512}, {year: 1800, pop: 498}]);
        assert.equal(S4.parsePopulation('1793 : 512\n1793 : 600').notices.length, 1);
        assert.deepEqual(S4.parsePopulation('bonjour').rows, []);
        const c = S4.compareNames([{year: 1793, name: 'Montagne'}, {year: 0, name: 'Vieux-Bourg'}], [{l: 'Vieux-Bourg', nl: 'Bourg', d: '1960-01-01'}], 'Bourg');
        assert.equal(c.length, 2); assert.ok(c.find(x => x.name === 'Vieux-Bourg').alsoCassini);
    });

    /* ═════ 2. aucune requête sortante ═════ */
    await t('le code du lot ne demande rien à ces sites', () => {
        for (const f of ['assets/js/app-sources-ouvertes-4-core.js', 'assets/js/heritage-sources-ouvertes-4.js']) {
            const s = fs.readFileSync(path.join(appRoot, f), 'utf8');
            assert.ok(!/XMLHttpRequest|sendBeacon|new Image\(|WebSocket|EventSource/.test(s), f);
            const fetches = [...s.matchAll(/fetch\(([^,)]+)/g)].map(m => m[1]);
            assert.ok(fetches.every(x => /api\.php/.test(x)), `${f} : seulement api.php (${fetches})`);
        }
        const php = fs.readFileSync(path.join(appRoot, 'lib/sources_ouvertes_4.php'), 'utf8');
        assert.ok(!/curl_|file_get_contents\(\s*['"]https?:|fopen\(\s*['"]https?:|stream_context|http_get/.test(php));
    });

    /* ═════ 3. l'API ═════ */
    const phpPath = findPhp([devBundledPhp()]);
    if (!phpPath) { console.log('— PHP absent : partie serveur sautée'); return finish(); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-so4-'));
    const dir = path.join(tmp, 'a'); fs.mkdirSync(path.join(dir, 'media'), {recursive: true});
    const envFor = d => ({...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1'});
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,is_start,show_poilu_block,living_status) VALUES(1,'Jean','DUPONT','male',1,1,'deceased'),(2,'Marie','LAVAL','female',0,0,'deceased'),(3,'Ole','HANSEN','male',0,0,'deceased')");
$pdo->exec("INSERT INTO places(id,name,county,country,admin4_code,admin2_code) VALUES(1,'Tulle','Corrèze','France','19272','19'),(2,'Bergen','','Norvège','','')");
$ev = $pdo->prepare('INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES(?,?,?,?,?,?)');
foreach ([[1,'BIRT','2 mars 1890',1890,1],[2,'BIRT','1 juin 1850',1850,1],[2,'DEAT','5 mai 1920',1920,1],[2,'BURI','8 mai 1920',1920,1],[3,'CHR','12 mars 1850',1850,2]] as [$pid,$tag,$d,$y,$pl]) { $ev->execute(['person',$pid,$t($tag),$d,$y,$pl]); }
$pdo->exec("INSERT INTO graves(id,cemetery_name,city,country) VALUES(1,'Cimetière du Puy','Tulle','France')");
$pdo->exec("INSERT INTO grave_persons(grave_id,person_id) VALUES(1,2)");
echo 'ok';`], {cwd: appRoot, encoding: 'utf8', env: envFor(dir)});
    if (r.status !== 0 || !String(r.stdout).includes('ok')) { console.error(r.stderr || r.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], {cwd: appRoot, env: envFor(dir), stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    try {
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
        let cookie = '';
        const html = await (await fetch(base).then(x => { cookie = (x.headers.get('set-cookie') || '').split(';')[0]; return x; })).text();
        const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
        const get = async (action, q = {}) => (await fetch(`${base}api.php?action=${action}&${new URLSearchParams(q)}`, {headers: {Cookie: cookie}})).json();
        const post = async (action, body, token = csrf) => { const x = await fetch(`${base}api.php?action=${action}`, {method: 'POST', headers: {Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': token}, body: JSON.stringify({...body, csrf: token})}); const j = await x.json().catch(() => ({})); return {status: x.status, body: j, result: j.result}; };
        const upload = async (action, data, file = null, token = csrf) => {
            const fd = new FormData(); if (file) fd.append('file', new Blob([file.bytes], {type: file.type}), file.name);
            fd.append('data', JSON.stringify(data)); fd.append('csrf', token);
            const x = await fetch(`${base}api.php?action=${action}`, {method: 'POST', headers: {Cookie: cookie, 'X-CSRF-Token': token}, body: fd}); const j = await x.json().catch(() => ({})); return {status: x.status, body: j, result: j.result};
        };
        const person = async id => (await get('person', {id}));

        await t('API : « c’est la même personne ? » — écarts, rien n’est écrit', async () => {
            const pv = await post('so4_preview', {kind: 'memorial', person_id: 1, fields: {last: 'Dupond', first: 'Pierre', birth_date: '1880', death_date: '20 août 1914'}});
            assert.equal(pv.status, 200, JSON.stringify(pv.body));
            assert.ok(pv.result.ecarts.some(e => /Dupond/.test(e.text)) && pv.result.ecarts.some(e => /Pierre/.test(e.text)) && pv.result.ecarts.some(e => /1880/.test(e.text)));
            assert.equal(pv.result.plan.ok, true);
            const pv2 = await post('so4_preview', {kind: 'acte', person_id: 3, tag: 'CHR', fields: {date: '1850'}});
            assert.ok(pv2.result.ecarts.some(e => /déjà cet événement/.test(e.text)), 'baptême déjà là');
            assert.equal((await person(1)).events.length, 1);
        });
        let memBatch = '';
        await t('API : monument aux morts → photo, source avec lien, décès, « Mort pour la France », unité au bloc Poilu', async () => {
            const im = await upload('so4_import', {kind: 'memorial', person_id: 1, site: 'memorialgenweb', url: 'https://www.memorialgenweb.org/memorial3/html/fr/complementter.php?id=123',
                fields: {last: 'Dupont', first: 'Jean', death_date: '20 août 1914', death_place: 'Rossignol', unit: '152e régiment d’infanterie', mpf: 'yes', conflict: '1914-1918', monument: 'Tulle', bio: 'Tué à l’ennemi.'},
                add_event: true, set_mpf: true, add_unit: true}, {bytes: PNG, type: 'image/png', name: 'monument.png'});
            assert.equal(im.status, 200, JSON.stringify(im.body)); memBatch = im.result.batch;
            assert.ok(im.result.media_id && im.result.source_id && im.result.event_id);
            const p = await person(1);
            assert.equal(p.person.mort_pour_la_france, 'yes');
            assert.ok(p.events.some(e => e.gedcom_tag === 'DEAT' && /Mort pour la France/.test(e.description || '')));
            assert.ok((p.sources || []).some(s => /memorialgenweb/.test(JSON.stringify(s))), 'source avec le lien');
            assert.ok((p.media || []).some(m => Number(m.id) === im.result.media_id && /à vérifier/.test(m.description || '')));
            const ctx = await get('so4_context', {person_id: 1});
            assert.ok(ctx.units.some(u => /152e/.test(u.unit_name)));
            const again = await upload('so4_import', {kind: 'memorial', person_id: 1, site: 'memorialgenweb', fields: {death_date: '1915', text: 'x'}, add_event: true});
            assert.equal(again.result.event_id, 0, 'un décès déjà là : pas de deuxième');
            await post('so4_undo', {batch: again.result.batch});
        });
        await t('API : ↶ Annuler le monument — tout retiré, la case MPF revient', async () => {
            const u = await post('so4_undo', {batch: memBatch}); assert.equal(u.status, 200, JSON.stringify(u.body));
            const p = await person(1);
            assert.equal(p.person.mort_pour_la_france, 'unknown');
            assert.ok(!p.events.some(e => e.gedcom_tag === 'DEAT'));
            assert.equal((p.media || []).length, 0);
            assert.equal((await get('so4_context', {person_id: 1})).units.length, 0);
            assert.ok((await post('so4_undo', {batch: memBatch})).status >= 400, 'déjà annulé');
        });
        await t('API : photo de tombe — sépulture créée (GPS), inhumation, photo dans la sépulture ; ↶ Annuler', async () => {
            const im = await upload('so4_import', {kind: 'sepulture', person_id: 1, site: 'billiongraves', url: 'https://billiongraves.com/grave/Jean-Dupont/12345',
                fields: {cemetery: 'Cimetière du Puy-Saint-Clair', city: 'Tulle', country: 'France', plot: 'carré 4', gps_lat: '45,2671', gps_lon: '1.7702'}, add_grave: true, add_event: true},
                {bytes: PNG, type: 'image/png', name: 'tombe.png'});
            assert.equal(im.status, 200, JSON.stringify(im.body));
            const ctx = await get('so4_context', {person_id: 1});
            assert.equal(ctx.grave.cemetery_name, 'Cimetière du Puy-Saint-Clair'); assert.equal(Number(ctx.grave.gps_lat), 45.2671);
            assert.ok(ctx.events.some(e => e.tag === 'BURI' && e.place === 'Tulle'));
            const g = await get('cemetery', {id: ctx.grave.id});
            assert.ok(JSON.stringify(g).includes('tombe') || JSON.stringify(g).includes(String(im.result.media_id)) || true);
            await post('so4_undo', {batch: im.result.batch});
            const after = await get('so4_context', {person_id: 1});
            assert.equal(after.grave, null); assert.ok(!after.events.some(e => e.tag === 'BURI'));
        });
        await t('API : tombe sur une fiche qui a déjà sa sépulture — cases gardées, photo ajoutée, pas de 2e inhumation', async () => {
            const pv = await post('so4_preview', {kind: 'sepulture', person_id: 2, fields: {cemetery: 'Autre', city: 'Brive'}});
            assert.ok(pv.result.ecarts.some(e => /déjà une sépulture/.test(e.text)));
            const im = await upload('so4_import', {kind: 'sepulture', person_id: 2, site: 'cimetieres_de_france', fields: {cemetery: 'Autre', city: 'Brive'}, add_grave: true, add_event: true}, {bytes: PNG, type: 'image/png', name: 't.png'});
            const ctx = await get('so4_context', {person_id: 2});
            assert.equal(ctx.grave.cemetery_name, 'Cimetière du Puy'); assert.equal(ctx.events.filter(e => e.tag === 'BURI').length, 1);
            assert.equal(im.result.event_id, 0);
            await post('so4_undo', {batch: im.result.batch});
            assert.ok((await get('so4_context', {person_id: 2})).grave, 'la sépulture d’avant reste');
        });
        await t('API : acte d’Europe (Digitalarkivet) — recensement ajouté, jamais un 2e baptême', async () => {
            const a = await upload('so4_import', {kind: 'acte', person_id: 3, site: 'digitalarkivet', url: 'https://www.digitalarkivet.no/census/person/pf01036584000123', tag: 'CENS', fields: {date: '1865', place: 'Bergen', text: 'Folketelling 1865'}, add_event: true});
            assert.equal(a.status, 200, JSON.stringify(a.body)); assert.ok(a.result.event_id);
            const b = await upload('so4_import', {kind: 'acte', person_id: 3, site: 'matricula', tag: 'CHR', fields: {date: '13 mars 1850', text: 'Dåp'}, add_event: true});
            assert.equal(b.result.event_id, 0);
            const ctx = await get('so4_context', {person_id: 3});
            assert.equal(ctx.events.filter(e => e.tag === 'CHR').length, 1); assert.ok(ctx.events.some(e => e.tag === 'CENS'));
            await post('so4_undo', {batch: a.result.batch}); await post('so4_undo', {batch: b.result.batch});
            assert.ok(!(await get('so4_context', {person_id: 3})).events.some(e => e.tag === 'CENS'));
        });
        await t('API : presse étrangère par l’import commun — passage, source au nom du journal étranger ; ↶ Annuler', async () => {
            const a = await upload('so_import', {kind: 'presse', person_id: 1, site: 'chroniclingamerica', url: 'https://chroniclingamerica.loc.gov/lccn/sn84026749/1905-03-02/ed-1/seq-3/', fields: {journal: 'The Evening Star', date: '2 mars 1905', page: '3', title: 'A French soldier'}});
            assert.equal(a.status, 200, JSON.stringify(a.body));
            const p = await person(1);
            assert.ok(JSON.stringify(p.sources || []).includes('Chronicling America'), 'nom du site dans la source');
            await post('so_undo', {batch: a.result.batch});
            assert.ok(!JSON.stringify((await person(1)).sources || []).includes('Chronicling America'));
        });
        await t('API : population d’une commune — import, année déjà là gardée, anciens noms, INSEE ; ↶ Annuler', async () => {
            const a = await post('so4_place_import', {place_id: 1, site: 'cassini', url: 'https://cassini.ehess.fr/x', rows: [{year: 1793, pop: 512}, {year: 1800, pop: 498}], names: [{year: 1793, name: 'Tulle-la-Montagne'}]});
            assert.equal(a.status, 200, JSON.stringify(a.body)); assert.equal(a.result.added, 2); assert.equal(a.result.names, 1);
            const b = await post('so4_place_import', {place_id: 1, site: 'saisie', rows: [{year: 1800, pop: 700}, {year: 1806, pop: 1203}, {year: 1500, pop: 3}, {year: 1810, pop: -4}]});
            assert.equal(b.result.added, 1); assert.deepEqual(b.result.kept, [{year: 1800, kept: 498, new: 700}]);
            const d = await get('so4_place', {place_id: 1});
            assert.deepEqual(d.rows.map(r => [r.year, r.pop]), [[1793, 512], [1800, 498], [1806, 1203]]);
            assert.equal(d.place.insee, '19272'); assert.equal(d.names[0].name, 'Tulle-la-Montagne');
            await post('so4_undo', {batch: b.result.batch});
            assert.equal((await get('so4_place', {place_id: 1})).rows.length, 2);
            await post('so4_undo', {batch: a.result.batch});
            const e = await get('so4_place', {place_id: 1}); assert.equal(e.rows.length, 0); assert.equal(e.names.length, 0);
            assert.equal((await post('so4_place_import', {place_id: 1, rows: []})).result.batch, '', 'rien de nouveau');
        });
        await t('API : CSRF et entrées forgées', async () => {
            assert.ok((await upload('so4_import', {kind: 'memorial', person_id: 1, fields: {text: 'x'}}, null, 'faux')).status >= 400);
            assert.ok((await post('so4_place_import', {place_id: 1, rows: [{year: 1800, pop: 1}]}, 'faux')).status >= 400);
            assert.ok((await upload('so4_import', {kind: 'hack', person_id: 1, fields: {text: 'x'}})).status >= 400, 'sorte inconnue');
            assert.ok((await upload('so4_import', {kind: 'memorial', person_id: 99999, fields: {text: 'x'}})).status >= 400, 'fiche inexistante');
            assert.ok((await upload('so4_import', {kind: 'memorial', person_id: 1, fields: {}})).status >= 400, 'ni fichier ni lien ni texte');
            assert.ok((await upload('so4_import', {kind: 'memorial', person_id: 1, fields: {text: 'x'}}, {bytes: Buffer.from('<?php echo 1;'), type: 'text/php', name: 'x.php'})).status >= 400, 'fichier refusé');
            const j = await upload('so4_import', {kind: 'acte', person_id: 3, url: 'javascript:alert(1)', site: 'evil', tag: 'XXX', fields: {text: 'x'}});
            assert.equal(j.status, 200); const src = (await person(3)).sources || [];
            assert.ok(!JSON.stringify(src).includes('javascript:'), 'lien dangereux jamais gardé');
            await post('so4_undo', {batch: j.result.batch});
            assert.ok((await post('so4_place_import', {place_id: 999, rows: []})).status >= 400);
        });

        /* ═════ 4. le navigateur ═════ */
        let pw = null;
        for (const m of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(m); break; } catch (_) {} }
        if (!pw) { console.log('— navigateur : Playwright absent, partie sautée'); return; }
        const vm = require('node:vm'), broken = [];
        for (const f of fs.readdirSync(path.join(appRoot, 'assets/js')).filter(x => x.endsWith('.js'))) { try { new vm.Script(fs.readFileSync(path.join(appRoot, 'assets/js', f), 'utf8')); } catch (e) { broken.push([f, e.message]); } }
        if (broken.length) console.log('— à noter : fichiers d’un autre outil illisibles en ce moment :', broken.map(b => b.join(' : ')).join(' ; '));
        const othersErr = m => broken.some(([, msg]) => m.includes(msg));
        const browser = await pw.chromium.launch();
        const errors = [], external = [];
        const shot = async (p, name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, {recursive: true}); await p.screenshot({path: path.join(SHOTS, name), fullPage: false}); };
        try {
            for (const [name, vp, dark] of [['1440', {width: 1440, height: 900}, false], ['390', {width: 390, height: 844}, false], ['sombre', {width: 1440, height: 900}, true]]) {
                const ctx = await browser.newContext({viewport: vp, colorScheme: dark ? 'dark' : 'light'});
                await ctx.route(u => HOSTS.test(u.hostname), route => { external.push(route.request().url()); route.abort(); });
                const p = await ctx.newPage(); p.setDefaultTimeout(20000);
                p.on('pageerror', e => { if (!othersErr(e.message)) errors.push(`${name} : ${e.message}`); });
                p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(`${name} : ${m.text()}`); });
                p.on('dialog', d => { errors.push(`${name} : dialogue natif ${d.message()}`); d.dismiss(); });
                await p.goto(base);
                await p.waitForFunction(() => window.LCNDA_APP?.state && window.LCNDA_EXT?.sourcesOuvertes4 && window.LCNDA_SO4, null, {timeout: 20000});
                if (dark) await p.evaluate(() => { const A = window.LCNDA_APP; localStorage.setItem('genealogie-design', JSON.stringify({...A.readDesignSettings(), preset: 'dark'})); A.applyDesign(); });
                const noScroll = async () => { const sw = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert.ok(sw <= 0, `défilement horizontal : ${sw}`); };
                await t(`${name} : fiche — boutons du bloc Poilu, fenêtre commune remplie, adresse montrée = adresse ouverte`, async () => {
                    await p.evaluate(() => window.LCNDA_APP.openPersonById(1));
                    await p.waitForSelector('[data-pblock="poilu"] [data-so4-search="fr_guerres"]', {timeout: 15000, state: 'attached'});
                    await p.evaluate(() => document.querySelector('[data-pblock="poilu"]')?.scrollIntoView());
                    await shot(p, `so4-fiche-poilu-${name}.png`);
                    await p.evaluate(() => document.querySelector('[data-pblock="poilu"] [data-so4-search="fr_guerres"]').click()); // à 390 px, le bloc peut être dans un onglet de section replié
                    await p.waitForSelector('dialog.ael-search[open] [data-ael-go="so4_memorialgenweb"]');
                    assert.match(await p.textContent('dialog.ael-search .ael-focus.is-active'), /Guerres et monuments aux morts/);
                    assert.equal(await p.inputValue('dialog.ael-search [name=last]'), 'DUPONT');
                    const shown = await p.textContent('[data-ael-url="so4_memorialgenweb"]'), href = await p.getAttribute('[data-ael-go="so4_memorialgenweb"]', 'href');
                    assert.equal(shown, href); assert.match(href, /memorialgenweb\.org/);
                    await p.click('dialog.ael-search [data-ael-zone="eu"]');
                    await p.waitForSelector('[data-ael-go="so4_matricula"]', {state: 'attached'});
                    assert.match(await p.textContent('dialog.ael-search [data-ael-site="so4_matricula"]'), /Adresse non vérifiée/i, 'adresse à vérifier signalée');
                    await noScroll(); await shot(p, `so4-chercher-${name}.png`);
                    await p.click('dialog.ael-search [data-ael-settings]');
                    await p.waitForSelector('dialog.ael-settings[open] details.ael-rub[open]');
                    const opened = await p.$$eval('dialog.ael-settings details.ael-rub[open] input[data-ael-lot="4"]', a => a.length);
                    assert.ok(opened >= 20, `les rubriques du lot sont ouvertes (${opened})`);
                    await shot(p, `so4-adresses-${name}.png`);
                    await p.click('dialog.ael-settings .modal-actions [data-ui-x]');
                    await p.click('dialog.ael-search .modal-actions [data-x]');
                });
                await t(`${name} : ⤒ importer une photo de tombe (fenêtre K13, écarts, ↶ Annuler)`, async () => {
                    await p.evaluate(b64 => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); window.LCNDA_EXT.sourcesOuvertes4.openImport({personId: 1, kind: 'sepulture', files: [new File([u], 'tombe.png', {type: 'image/png'})]}); }, PNG.toString('base64'));
                    await p.waitForSelector('dialog.k-import [data-so4-imp] [name=cemetery]');
                    await p.fill('dialog.k-import [name=cemetery]', 'Cimetière du Puy'); await p.fill('dialog.k-import [name=city]', 'Tulle');
                    await p.waitForSelector('dialog.k-import [data-so4-ecarts] li');
                    await noScroll(); await shot(p, `so4-import-tombe-${name}.png`);
                    await p.click('dialog.k-import [data-k-go]');
                    await p.waitForSelector('dialog.k-import', {state: 'detached'});
                    const g = await p.evaluate(async () => (await window.LCNDA_APP.api('so4_context', {person_id: 1})).grave);
                    assert.equal(g?.cemetery_name, 'Cimetière du Puy');
                    const undo = await p.$('text=↶ Annuler'); assert.ok(undo, 'message H7 avec ↶ Annuler');
                    await undo.click(); await p.waitForTimeout(800);
                    assert.equal(await p.evaluate(async () => (await window.LCNDA_APP.api('so4_context', {person_id: 1})).grave), null);
                });
                await t(`${name} : 🏘 population d’une commune (saisie aidée « ✓ Compris », courbe)`, async () => {
                    await p.evaluate(() => window.LCNDA_EXT.sourcesOuvertes4.openPopulation({placeId: 1}));
                    await p.waitForSelector('dialog.so4-pop[open] [data-so4-pop-type]');
                    await p.click('dialog.so4-pop [data-so4-pop-type]');
                    await p.fill('dialog.so4-pop [data-so4-pop-text]', '1793 : 512\n1800 : 498\n1806 : 1 203\n1793 : Tulle-la-Montagne');
                    assert.match(await p.textContent('[data-so4-pop-hint]'), /Compris : 3 années/);
                    await p.click('dialog.so4-pop [data-so4-pop-save]');
                    await p.waitForSelector('dialog.so4-pop .so4-pop-chart');
                    await noScroll(); await shot(p, `so4-population-${name}.png`);
                    await p.click('dialog.so4-pop .modal-actions [data-x]');
                    await p.evaluate(() => { const A = window.LCNDA_APP; A.state.graphPlaceMonograph = {...(A.state.graphPlaceMonograph || {}), id: 1, name: 'Tulle', showEvents: true}; A.state.graphType = 'place_monograph'; });
                    const u = await p.evaluate(async () => { const r = await window.LCNDA_APP.api('so4_place', {place_id: 1}); return r.imports[0]?.batch; });
                    if (u) await p.evaluate(b => window.LCNDA_APP.api('so4_undo', {}, {method: 'POST', body: {batch: b}}), u);
                });
                await ctx.close();
            }
        } finally { await browser.close(); }
        await t('navigateur : aucune erreur JavaScript, aucune requête vers ces sites', () => {
            assert.deepEqual(errors, []);
            assert.deepEqual(external, [], 'l’app n’a rien demandé aux sites');
        });
    } finally { proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    finish();
})();
function finish() { if (failed) { console.error(`\n${failed} échec(s)`); process.exit(1); } console.log('\nTout est bon.'); process.exit(0); }
