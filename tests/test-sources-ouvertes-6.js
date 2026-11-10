'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 📚 Archives en ligne, 6e lot (bibliothèques régionales, auteurs, Wikisource, gens de mer, notaires, HisKi, Old Bailey,
 * sites payants) :   node tests/test-sources-ouvertes-6.js
 *  1. calculs purs (app-sources-ouvertes-6-core.js) : chaque adresse construite, encodée, en https ; modèle de la personne ;
 *     « Gratuites seulement » et les payants à la fin ; régions → bibliothèques ; ports → SHD ; cotes du Minutier ;
 *     notices d’auteur (texte, UNIMARC XML, JSON-LD), procès de l’Old Bailey, lignes HisKi, liens collés ;
 *  2. aucune requête vers ces sites (code JS et PHP) ;
 *  3. l’API sur une petite base inventée : contexte (auteur ?), « c’est la même personne ? », imports (auteur → naissance
 *     gardée, décès ajouté, fiche en ligne ; HisKi → lignes cochées, jamais de mariage ; Old Bailey ; document relié à un lieu),
 *     ↶ Annuler (tout s’en va), CSRF, sorte inconnue ;
 *  4. le navigateur (Playwright ; sinon sauté) à 1440 px, 390 px et en sombre : fenêtre de recherche (rubriques, C1,
 *     « Gratuites seulement », pastille PAYANT), adresses ouvertes = adresses montrées, « Adresses des sites » (K2, ⭐ Mes sites),
 *     import d’une notice collée jusqu’à « ↶ Annuler », « Chercher sur internet » (pastille, filtre, réglage), fiche d’un
 *     village (bibliothèque de la région), aucune requête sortante, pas d’erreur, pas de défilement horizontal.
 * Captures : SHOTS=dossier node tests/test-sources-ouvertes-6.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const S6 = require('../assets/js/app-sources-ouvertes-6-core.js');
const SHOTS = process.env.SHOTS || '';
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const finish = () => { if (failed) { console.error(`\n${failed} échec(s)`); process.exit(1); } console.log('\nTout est bon.'); };
const P = {first: 'Jean Marie', last: 'Dupré & Fils', place: 'Brest, Finistère', y1: 1850, y2: 1920, port: 'Saint-Malo'};
const AUTH = 'Victor Hugo (1802-1885)\nNaissance : Besançon, 26-02-1802\nMort : Paris, 22-05-1885\nISNI : 0000 0001 2120 0982';
const UNIMARC = '<?xml version="1.0"?><record><controlfield tag="001">026927608</controlfield><datafield tag="200" ind1=" " ind2="1"><subfield code="a">HUGO</subfield><subfield code="b">Victor</subfield><subfield code="f">1802-1885</subfield></datafield><datafield tag="103"><subfield code="a">18020226</subfield><subfield code="b">18850522</subfield></datafield><datafield tag="340"><subfield code="a">Poète, romancier</subfield></datafield></record>';
const BAILEY = 'JOHN SMITH was indicted for stealing, on the 3rd of June, a silver watch, the goods of Thomas Brown.\nReference Number: t17800628-33\nOffence: Theft > grand larceny\nVerdict: Guilty\nPunishment: Transportation';
const HISKI = 'Kastetut\n12.3.1780 14.3.1780 Kylä Talo Matti Virtanen Liisa Juho\n2.5.1782 4.5.1782 Kylä Talo Pekka Nieminen Maija Anna\nVihityt\n1.11.1805 Juho Virtanen Kaisa\nHaudatut\n1.2.1840 5.2.1840 Juho Virtanen 59 v';

(async () => {
    /* ═════ 1. calculs purs ═════ */
    await t('toutes les adresses : https, encodées, sans espace ni guillemet, rubrique et vérification connues', () => {
        const keys = new Set();
        for (const s of S6.SITES) {
            assert.ok(!keys.has(s.key), `clé en double ${s.key}`); keys.add(s.key);
            assert.ok(S6.groupOf(s.group), `${s.key} : rubrique`); assert.ok(['oui', 'partiel', 'non'].includes(s.verified), `${s.key} : vérification`);
            const u = S6.url(s.key, P); assert.match(u, /^https:\/\//, s.key); assert.ok(!/[\s"<>]/.test(u), `${s.key} : ${u}`); new URL(u);
            assert.match(s.home, /^https:\/\//); assert.ok(s.note && s.note.length > 20, `${s.key} : une phrase claire`);
            if (s.paid) assert.ok(/payant/i.test(s.note), `${s.key} : la phrase dit « payant »`);
            if (!s.copy && !/google\.com/.test(u) && !['scotlandspeople'].includes(s.key)) assert.ok(/Dupr|dupr|Jean|jean|Malo/.test(u), `${s.key} : le nom est dans l’adresse ${u}`);
            if (s.verified !== 'oui' && s.domain) { const g = S6.googleUrl(s.key, P); assert.match(g, /^https:\/\/www\.google\.com\/search\?q=site%3A/); }
        }
        assert.ok(S6.SITES.length >= 18);
        const ws = new URL(S6.url('wikisource', P)); assert.equal(ws.hostname, 'fr.wikisource.org'); assert.equal(ws.searchParams.get('search'), '"Jean Dupré & Fils" Brest'); assert.equal(ws.searchParams.get('fulltext'), '1');
        assert.equal(new URL(S6.url('databnf', P)).searchParams.get('term'), 'Jean Dupré & Fils');
        assert.equal(new URL(S6.url('oldbailey', P)).searchParams.get('text'), 'Jean Dupré & Fils');
        assert.equal(new URL(S6.url('normannia', {place: 'Caen'})).searchParams.get('q'), 'Caen', 'depuis la fiche d’un lieu : le lieu seul');
        const ma = new URL(S6.url('marins_shd', P)); assert.equal(ma.searchParams.get('es_publisher'), '34577'); assert.match(ma.searchParams.get('q'), /inscription maritime Saint-Malo/);
        assert.equal(S6.url('hiski', P), 'https://hiski.genealogia.fi/hiski?fi'); assert.equal(S6.copyText('hiski', P), 'DUPRÉ & FILS Jean');
        assert.equal(S6.url('nope', P), '');
    });
    await t('modèle d’adresse de la personne : rempli et encodé ; une adresse non http(s) est ignorée', () => {
        assert.equal(S6.url('yroise', P, {yroise: 'https://exemple.org/s?n={nom}&p={prénom}&l={lieu}&port={port}'}), 'https://exemple.org/s?n=Dupr%C3%A9%20%26%20Fils&p=Jean&l=Brest&port=Saint-Malo');
        assert.match(S6.url('yroise', P, {yroise: 'javascript:alert(1)//{nom}'}), /^https:\/\/yroise\.biblio\.brest\.fr\//);
    });
    await t('« Gratuites seulement » : payants cachés ; décoché, ils viennent à la fin ; liste des payants de « Chercher sur internet »', () => {
        const free = S6.visible(S6.SITES, true); assert.ok(free.every(s => !s.paid)); assert.ok(free.some(s => s.key === 'geneanet_premium'), 'Geneanet reste (gratuit en partie)');
        const all = S6.visible(S6.SITES, false); const firstPaid = all.findIndex(s => s.paid); assert.ok(firstPaid > 0 && all.slice(firstPaid).every(s => s.paid), 'payants à la fin');
        assert.deepEqual(S6.SITES.filter(s => s.paid).map(s => s.key).sort(), ['ancestry', 'filae', 'myheritage', 'scotlandspeople']);
        ['ancestry', 'myheritage', 'filae', 'so6_scotlandspeople'].forEach(k => assert.ok(S6.isPaidKey(k), k)); assert.ok(!S6.isPaidKey('geneanet')); assert.match(S6.PARTLY_PAID.geneanet, /Premium/);
        const web = S6.webSites(); assert.ok(web.every(w => /^so6_/.test(w[0]) && typeof w[3] === 'function'));
        assert.ok(!web.some(w => ['so6_ancestry', 'so6_idref', 'so6_databnf', 'so6_geneanet_premium'].includes(w[0])), 'pas de doublon des sites déjà là');
        assert.match(web.find(w => w[0] === 'so6_wikisource')[3]({first: 'Jean', last: 'Rossi', place: 'Nice'}), /search=%22Jean%20Rossi%22%20Nice/);
    });
    await t('régions → bibliothèques numériques (département, n°, INSEE, ancienne région) ; rien à l’étranger', () => {
        assert.equal(S6.regionOf({county: 'Calvados'}).key, 'nor'); assert.equal(S6.regionOf({insee: '29019'}).key, 'bre'); assert.equal(S6.regionOf({county: 'Seine-Inférieure'}).key, 'nor');
        assert.equal(S6.regionOf({county: 'Haute-Loire'}).key, 'ara'); assert.equal(S6.regionOf({county: 'Loire'}).key, 'ara'); assert.equal(S6.regionOf({state: 'Midi-Pyrénées'}).key, 'occ');
        assert.equal(S6.regionOf({county: 'Doubs'}).key, 'bfc'); assert.ok(S6.regionOf({county: 'Loire-Atlantique'}).near);
        assert.equal(S6.regionOf({county: 'Corrèze'}), null); assert.equal(S6.regionOf({county: 'Calvados', country: 'Italie'}), null);
        assert.deepEqual(S6.libraryFor({county: 'Rhône'}).mine.map(s => s.key), ['numelyo', 'lectura']);
        assert.deepEqual(S6.libraryFor({county: 'Finistère'}).mine.map(s => s.key), ['yroise']);
        assert.deepEqual(S6.libraryFor({county: 'Haute-Garonne'}).mine.map(s => s.key), ['rosalis']);
        assert.equal(S6.libraryFor({county: 'Corrèze'}).others.length, 6);
    });
    await t('gens de mer : port → arrondissement et SHD ; notaires : cote MC/ET en chiffres romains', () => {
        assert.equal(S6.maritime('Saint-Malo').shd, 'SHD Brest'); assert.equal(S6.maritime('Cette').port, 'Sète'); assert.equal(S6.maritime('Fécamp').centre, 'cherbourg');
        assert.equal(S6.maritime('La Rochelle, Charente-Maritime').dept, '17'); assert.match(S6.maritime('Toulon').text, /indicative/); assert.equal(S6.maritime('Tulle'), null);
        assert.deepEqual([S6.minutierCote('cote MC/ET/XLVIII/312').etude, S6.minutierCote('MC/ET/XLVIII/312').article], [48, '312']);
        assert.equal(S6.minutierCote('mc / et / 23').cote, 'MC/ET/XXIII'); assert.equal(S6.minutierCote('rien'), null); assert.equal(S6.toRoman(48), 'XLVIII'); assert.equal(S6.fromRoman('XCIX'), 99);
    });
    await t('notices d’auteur : texte copié, UNIMARC XML d’IdRef, JSON-LD de data.bnf', () => {
        const a = S6.parseAuthority(AUTH);
        assert.deepEqual([a.first, a.last, a.birth_date, a.birth_place, a.death_date, a.death_place, a.isni], ['Victor', 'Hugo', '26 février 1802', 'Besançon', '22 mai 1885', 'Paris', '0000000121200982']);
        const x = S6.parseAuthority(UNIMARC);
        assert.deepEqual([x.idref, x.last, x.first, x.birth_date, x.death_date, x.note, x.source], ['026927608', 'Hugo', 'Victor', '26 février 1802', '22 mai 1885', 'Poète, romancier', 'idref']);
        const j = S6.parseAuthority(JSON.stringify({'@context': 'x', '@id': 'http://data.bnf.fr/ark:/12148/cb11907966z', 'rdagroup2elements:dateOfBirth': '1802-02-26', 'rdagroup2elements:dateOfDeath': '1885', 'rdagroup2elements:placeOfBirth': 'Besançon'}));
        assert.deepEqual([j.birth_date, j.death_date, j.birth_place, j.ark], ['26 février 1802', '1885', 'Besançon', 'cb11907966z']);
        const n = S6.parseAuthority('Jeanne Martin est née à Lyon le 3 mai 1850 ; morte à Paris en 1920.');
        assert.deepEqual([n.birth_place, n.birth_date, n.death_place, n.death_date], ['Lyon', '3 mai 1850', 'Paris', '1920']);
        assert.deepEqual(S6.parseAuthority('<script>alert(1)</script>'), {source: ''}, 'rien d’inventé');
    });
    await t('Old Bailey et HisKi : lecture du texte copié', () => {
        const b = S6.parseOldBailey(BAILEY);
        assert.deepEqual([b.ref, b.date, b.offence_fr, b.verdict_fr, b.punishment_fr, b.defendant], ['t17800628-33', '28 juin 1780', 'vol simple (grand larceny)', 'coupable', 'déportation (transportation)', 'John Smith']);
        const h = S6.parseHisKi(HISKI); assert.ok(h.ok); assert.deepEqual(h.rows.map(r => r.tag), ['CHR', 'CHR', 'MARR', 'BURI']);
        assert.deepEqual(S6.hiskiEvents(h.rows[0]).map(e => [e.tag, e.date]), [['BIRT', '12 mars 1780'], ['CHR', '14 mars 1780']]);
        assert.deepEqual(S6.hiskiEvents(h.rows[3]).map(e => e.tag), ['DEAT', 'BURI']);
        assert.ok(!S6.parseHisKi('rien ici').ok);
        assert.deepEqual([S6.parseLink('https://www.idref.fr/026927608').idref, S6.parseLink('https://data.bnf.fr/fr/11907966/victor_hugo/').ark, S6.parseLink('https://www.oldbaileyonline.org/record/t17800628-33').date, S6.parseLink('https://fr.wikisource.org/wiki/Les_Mis%C3%A9rables').title, S6.parseLink('javascript:alert(1)').site],
            ['026927608', 'cb11907966', '28 juin 1780', 'Les Misérables', '']);
    });

    /* ═════ 2. aucune requête vers ces sites ═════ */
    await t('aucune requête sortante : le code ne fait que fabriquer des adresses', () => {
        const core = fs.readFileSync(path.join(appRoot, 'assets/js/app-sources-ouvertes-6-core.js'), 'utf8');
        assert.ok(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon|new Image\(|import\(/.test(core), 'core : pas de requête');
        const ui = fs.readFileSync(path.join(appRoot, 'assets/js/heritage-sources-ouvertes-6.js'), 'utf8');
        const fetches = [...ui.matchAll(/fetch\(\s*([^,)]+)/g)].map(m => m[1].trim());
        assert.ok(fetches.every(x => /^'api\.php\?action=so6_import'$/.test(x)), 'seulement api.php : ' + fetches.join(' | '));
        assert.ok(!/XMLHttpRequest|sendBeacon|new Image\(/.test(ui));
        const php = fs.readFileSync(path.join(appRoot, 'lib/sources_ouvertes_6.php'), 'utf8');
        assert.ok(!/curl_|file_get_contents\(\s*['"$]|fopen\(\s*['"]https?:|stream_context|http_get|fsockopen/.test(php), 'lib : pas de requête');
    });

    /* ═════ 3. l'API ═════ */
    const phpPath = findPhp([devBundledPhp()]);
    if (!phpPath) { console.log('— PHP absent : partie serveur sautée'); return finish(); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-so6-'));
    const dir = path.join(tmp, 'a'); fs.mkdirSync(path.join(dir, 'media'), {recursive: true});
    const envFor = d => ({...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1'});
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' AND COALESCE(scope,'person')='person' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,is_start,living_status) VALUES(1,'Victor','HUGO','male',1,'deceased'),(2,'Juho','VIRTANEN','male',0,'deceased'),(3,'John','SMITH','male',0,'deceased')");
$pdo->exec("INSERT INTO places(id,name,county,country) VALUES(1,'Besançon','Doubs','France'),(2,'Caen','Calvados','France')");
$ev = $pdo->prepare('INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES(?,?,?,?,?,?)');
$ev->execute(['person',1,$t('BIRT'),'26 février 1802',1802,1]);
$pdo->exec("INSERT OR IGNORE INTO person_profiles(person_id, profile_key) VALUES(1,'writer')");
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
        const imp = async (data, file = null) => {
            const fd = new FormData(); if (file) fd.append('file', new Blob([file.bytes], {type: file.type}), file.name);
            fd.append('data', JSON.stringify(data)); fd.append('csrf', csrf);
            const x = await fetch(`${base}api.php?action=so6_import`, {method: 'POST', body: fd, headers: {Cookie: cookie, 'X-CSRF-Token': csrf}});
            const j = await x.json().catch(() => ({})); return {status: x.status, body: j, result: j.result};
        };
        const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
        const sql = q => JSON.parse(spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require 'lib/bootstrap.php'; echo json_encode(db()->query(${JSON.stringify(q)})->fetchAll(PDO::FETCH_ASSOC));`], {cwd: appRoot, encoding: 'utf8', env: envFor(dir)}).stdout || '[]');
        const before = await get('person', {id: 1});
        const authF = S6.parseAuthority(AUTH);
        const authEv = [{tag: 'BIRT', label: 'Naissance', date: authF.birth_date, place: authF.birth_place}, {tag: 'DEAT', label: 'Décès', date: authF.death_date, place: authF.death_place}];

        await t('API : so6_context — profil « écrivain » = auteur ; fiche sans profil = non', async () => {
            const c = await get('so6_context', {person_id: 1}); assert.equal(c.is_author, true); assert.ok(c.profiles.includes('writer')); assert.ok(c.depts.length >= 96);
            assert.equal((await get('so6_context', {person_id: 2})).is_author, false);
            assert.ok((await get('so6_context', {person_id: 999})).error);
        });
        await t('API : « c’est la même personne ? » — naissance déjà là, écarts, rien n’est écrit ; CSRF ; sorte inconnue', async () => {
            const pv = await post('so6_preview', {kind: 'auteur', site: 'idref', person_id: 1, fields: {...authF, birth_date: '26 février 1804'}, events: authEv});
            assert.equal(pv.status, 200, JSON.stringify(pv.body));
            const txt = pv.result.ecarts.map(e => e.text).join('\n');
            assert.match(txt, /Né en 1804 d’après le document, en 1802 d’après la fiche/); assert.match(txt, /déjà une naissance \(26 février 1802 à Besançon\)/);
            assert.equal(JSON.stringify((await get('person', {id: 1})).events), JSON.stringify(before.events));
            assert.equal((await post('so6_preview', {kind: 'pirate', person_id: 1})).status, 422);
            assert.ok((await post('so6_preview', {kind: 'auteur', person_id: 1}, 'faux')).status >= 400, 'CSRF');
        });
        let authBatch = '';
        await t('API : import d’une notice d’auteur — naissance gardée, décès ajouté, source avec lien et mention, fiche en ligne', async () => {
            const res = await imp({kind: 'auteur', site: 'idref', person_id: 1, url: 'https://www.idref.fr/026927608', fields: authF, events: authEv, sheet: true, text: AUTH}, {bytes: PNG, type: 'image/png', name: 'notice.png'});
            assert.equal(res.status, 200, JSON.stringify(res.body));
            authBatch = res.result.batch; assert.match(authBatch, /^so6-[0-9a-f]{12}$/);
            assert.equal(res.result.events.length, 1, 'seulement le décès'); assert.equal(res.result.online_sheets.length, 1); assert.match(res.result.summary, /déjà sur la fiche, gardé/);
            const p = await get('person', {id: 1});
            assert.equal(p.events.filter(e => e.gedcom_tag === 'BIRT').length, 1); assert.equal(p.events.find(e => e.gedcom_tag === 'BIRT').date_text, '26 février 1802');
            assert.equal(p.events.find(e => e.gedcom_tag === 'DEAT').date_text, '22 mai 1885');
            const src = (p.sources || []).find(s => /Notice d’autorité/.test(s.title || '')); assert.ok(src); assert.equal(src.url, 'https://www.idref.fr/026927608');
            assert.match(JSON.stringify(p), /à vérifier sur le document/);
            assert.equal(sql("SELECT label, url FROM person_online_sheets WHERE person_id=1")[0].label, 'IdRef');
            const again = await post('so6_preview', {kind: 'auteur', person_id: 1, url: 'https://www.idref.fr/026927608', fields: {}});
            assert.match(again.result.ecarts.map(e => e.text).join(' '), /déjà une source|Fiches en ligne/);
        });
        await t('API : ↶ Annuler — décès, source, média et fiche en ligne s’en vont ; deux fois = refusé', async () => {
            const u = await post('so6_undo', {batch: authBatch}); assert.equal(u.status, 200, JSON.stringify(u.body));
            const p = await get('person', {id: 1});
            assert.equal(JSON.stringify(p.events), JSON.stringify(before.events)); assert.ok(!(p.sources || []).length); assert.ok(!(p.media || []).length);
            assert.equal(sql("SELECT count(*) AS n FROM person_online_sheets")[0].n, 0);
            assert.ok((await post('so6_undo', {batch: authBatch})).status >= 400);
            assert.equal((await post('so6_undo', {batch: '../x'})).status, 422);
        });
        await t('API : HisKi — lignes cochées → naissance, baptême, décès ; mariage jamais créé', async () => {
            const h = S6.parseHisKi(HISKI);
            const evs = [...S6.hiskiEvents(h.rows[0]), ...S6.hiskiEvents(h.rows[2]), ...S6.hiskiEvents(h.rows[3])];
            const res = await imp({kind: 'hiski', site: 'hiski', person_id: 2, fields: {}, events: evs, text: HISKI});
            assert.equal(res.status, 200, JSON.stringify(res.body)); assert.equal(res.result.events.length, 4); assert.match(res.result.summary, /mariage laissé dans la source/);
            const p = await get('person', {id: 2}); const tags = p.events.map(e => e.gedcom_tag).sort();
            assert.ok(tags.includes('BIRT') && tags.includes('DEAT') && tags.includes('BURI') && !tags.includes('MARR'));
            assert.equal((await post('so6_undo', {batch: res.result.batch})).status, 200); assert.equal((await get('person', {id: 2})).events.length, 0);
        });
        await t('API : Old Bailey → événement « Accusé au procès » ; document relié à un lieu ; refus sans fiche ni contenu', async () => {
            const b = S6.parseOldBailey(BAILEY);
            const res = await imp({kind: 'oldbailey', site: 'oldbailey', person_id: 3, url: 'https://www.oldbaileyonline.org/record/t17800628-33', fields: b,
                events: [{tag: 'EVEN', label: 'Accusé au procès à l’Old Bailey', date: b.date, place: 'Londres (Old Bailey)', note: 'Crime : vol'}]});
            assert.equal(res.status, 200, JSON.stringify(res.body));
            const p = await get('person', {id: 3}); assert.ok(p.events.some(e => e.date_text === '28 juin 1780' && /Old Bailey/.test(e.description || '')));
            const doc = await imp({kind: 'document', site: 'normannia', person_id: 0, place_id: 2, url: 'https://www.normannia.info/x', fields: {title: 'Annuaire du Calvados, 1852', page: '12'}, source_title: 'Annuaire du Calvados, 1852'}, {bytes: PNG, type: 'image/png', name: 'page.png'});
            assert.equal(doc.status, 200, JSON.stringify(doc.body));
            assert.equal(sql("SELECT entity_type, entity_id FROM source_links WHERE source_record_id=" + Number(doc.result.source_id))[0].entity_type, 'place');
            assert.equal(sql("SELECT count(*) AS n FROM media_links WHERE entity_type='source' AND entity_id=" + Number(doc.result.source_id))[0].n, 1, 'média relié à la source du lieu');
            const ud = await post('so6_undo', {batch: doc.result.batch}); assert.equal(ud.status, 200, JSON.stringify(ud.body));
            assert.equal(sql("SELECT count(*) AS n FROM source_links WHERE entity_type='place'")[0].n, 0); assert.equal(sql("SELECT count(*) AS n FROM media")[0].n, 0);
            assert.equal((await imp({kind: 'document', person_id: 0, text: 'x'})).status, 422, 'sans fiche ni lieu');
            assert.equal((await imp({kind: 'auteur', person_id: 1})).status, 422, 'sans contenu');
            assert.equal((await imp({kind: 'auteur', person_id: 0, place_id: 2, text: 'x'})).status, 422, 'un auteur ne se relie pas à un lieu');
        });

        /* ═════ 4. le navigateur ═════ */
        let pw = null;
        for (const m of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(m); break; } catch (_) {} }
        if (!pw) { console.log('— navigateur : Playwright absent, partie sautée'); return; }
        const browser = await pw.chromium.launch();
        const errors = [], external = [];
        const shot = async (p, name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, {recursive: true}); await p.screenshot({path: path.join(SHOTS, name), fullPage: false}); };
        try {
            for (const [name, vp, dark] of [['1440', {width: 1440, height: 900}, false], ['390', {width: 390, height: 844}, false], ['sombre', {width: 1440, height: 900}, true]].filter(x => !process.env.ONLY || x[0] === process.env.ONLY)) {
                const ctx = await browser.newContext({viewport: vp, colorScheme: dark ? 'dark' : 'light'});
                await ctx.route(url => !/^http:\/\/127\.0\.0\.1:/.test(url.href) && !/^(data|blob):/.test(url.href), route => { external.push(route.request().url()); route.abort(); });
                await ctx.addInitScript(() => { window.__opened = []; window.open = (u) => { window.__opened.push(String(u)); return null; }; });
                const p = await ctx.newPage(); p.setDefaultTimeout(20000);
                p.on('pageerror', e => errors.push(`${name} : ${e.message}`));
                p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource|ERR_FAILED/.test(m.text())) errors.push(`${name} : ${m.text()}`); });
                p.on('dialog', d => { errors.push(`${name} : dialogue natif ${d.message()}`); d.dismiss(); });
                await p.goto(base);
                await p.waitForFunction(() => window.LCNDA_APP?.state && window.LCNDA_EXT?.sourcesOuvertes6 && window.LCNDA_SOURCES_OUVERTES_6, null, {timeout: 20000});
                if (dark) await p.evaluate(() => { const A = window.LCNDA_APP; localStorage.setItem('genealogie-design', JSON.stringify({...A.readDesignSettings(), preset: 'dark'})); A.applyDesign(); });
                const noScroll = async () => { const sw = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert.ok(sw <= 0, `défilement horizontal : ${sw}`); };
                await t(`${name} : 📚 fenêtre de recherche — rubriques, C1, Gratuites seulement, PAYANT, adresses montrées = adresses ouvertes`, async () => {
                    await p.evaluate(() => window.LCNDA_EXT.sourcesOuvertes6.openSearch({personId: 1}));
                    await p.waitForSelector('dialog.so6-search[open] [data-so6-links] .so6-link');
                    assert.equal(await p.inputValue('dialog.so6-search [name=last]'), 'HUGO');
                    const links = await p.$$eval('dialog.so6-search a[data-so6-go]', as => as.map(a => [a.getAttribute('href'), a.closest('.so-link').querySelector('.so-url').textContent, a.target]));
                    assert.ok(links.length >= 8); links.forEach(([h, shown, tg]) => { assert.equal(h, shown); assert.equal(tg, '_blank'); });
                    assert.equal(await p.$$eval('dialog.so6-search .so6-link.is-paid', l => l.length), 0, 'payants cachés au départ');
                    assert.ok(await p.isChecked('dialog.so6-search [data-so6-free]'));
                    assert.ok(await p.$('dialog.so6-search .so6-link[data-so6-site="geneanet_premium"] .so6-paid'), 'Geneanet : EN PARTIE PAYANT');
                    await p.click('dialog.so6-search .so6-free');
                    assert.equal(await p.$$eval('dialog.so6-search .so6-link.is-paid', l => l.length), 4);
                    assert.match(await p.textContent('dialog.so6-search .so6-link[data-so6-site="ancestry"] .so6-paid'), /payant/i);
                    const order = await p.$$eval('dialog.so6-search .so6-link', l => l.map(x => x.classList.contains('is-paid')));
                    assert.ok(!order[0], 'jamais un payant en premier');
                    await p.click('dialog.so6-search .so6-free');
                    await p.fill('dialog.so6-search [data-so6-q]', 'londres');
                    assert.deepEqual(await p.$$eval('dialog.so6-search .so6-link', l => l.map(x => x.dataset.so6Site)), ['oldbailey']);
                    await p.fill('dialog.so6-search [data-so6-q]', '');
                    await p.click('dialog.so6-search [data-so6-group="fi"]');
                    await p.click('dialog.so6-search [data-so6-copy="hiski"]');
                    assert.deepEqual(await p.evaluate(() => window.__opened), ['https://hiski.genealogia.fi/hiski?fi']);
                    await p.click('dialog.so6-search [data-so6-group="fr_mer"]');
                    await p.fill('dialog.so6-search [name=port]', 'Saint-Malo');
                    await p.waitForSelector('dialog.so6-search .so6-port');
                    assert.match(await p.textContent('dialog.so6-search .so6-port'), /SHD Brest/);
                    await p.click('dialog.so6-search [data-so6-group=""]');
                    await noScroll(); await shot(p, `so6-chercher-${name}.png`);
                });
                await t(`${name} : ⚙️ Adresses des sites — rubriques, C1, gardé tout de suite (K2), ⭐ Mes sites`, async () => {
                    await p.click('dialog.so6-search [data-so6-settings]');
                    await p.waitForSelector('dialog.so6-settings[open] details.so6-rub');
                    assert.equal(await p.$$eval('dialog.so6-settings [data-so-set] details.so6-rub:not([hidden])', d => d.length), 7);
                    assert.equal(await p.$$eval('dialog.so6-settings .so-set-row.is-paid:not([hidden])', d => d.length), 0, 'payants cachés');
                    assert.equal(await p.$$eval('dialog.so6-settings .so-set-row.is-paid', d => d.length), 4);
                    await p.fill('dialog.so6-settings [data-so6-sq]', 'normannia');
                    assert.equal(await p.$$eval('dialog.so6-settings [data-so-set] details.so6-rub:not([hidden])', d => d.length), 1);
                    await p.fill('dialog.so6-settings input[name=normannia]', 'https://www.normannia.info/search?text={requête}');
                    await p.waitForTimeout(700);
                    assert.match(await p.evaluate(() => localStorage.getItem('genealogie-sources-ouvertes-6-sites') || ''), /text=\{requête\}/);
                    await p.fill('dialog.so6-settings [data-so6-sq]', '');
                    await p.click('dialog.so6-settings [data-so6-mine-add]');
                    assert.ok(await p.$('dialog.so6-settings .is-invalid, dialog.so6-settings [aria-invalid="true"]'), 'K1 : champ fautif');
                    await p.fill('dialog.so6-settings [data-so6-mine-label]', 'Cercle du Finistère');
                    await p.fill('dialog.so6-settings [data-so6-mine-url]', 'https://cgf.example/recherche?nom={nom}');
                    await p.click('dialog.so6-settings [data-so6-mine-add]');
                    await p.waitForSelector('dialog.so6-settings .so6-mine li');
                    assert.ok(await p.evaluate(() => window.LCNDA_APP.webSearchAllSites().some(s => s[1].includes('Cercle du Finistère'))), 'aussi dans « Chercher sur internet »');
                    await shot(p, `so6-adresses-${name}.png`);
                    await p.click('dialog.so6-settings [data-so6-mine-del]');
                    await p.waitForTimeout(200);
                    assert.equal(await p.$$eval('dialog.so6-settings .so6-mine li', l => l.length), 0);
                    await p.click('dialog.so6-settings [data-ui-reset]'); await p.waitForTimeout(300);
                    await p.click('dialog.so6-settings .modal-actions [data-ui-x]');
                    await p.click('dialog.so6-search .modal-head [data-x]');
                });
                await t(`${name} : 📋 coller une notice d’auteur → import (cases, naissance gardée, même personne ?) → « ↶ Annuler »`, async () => {
                    await p.evaluate(() => window.LCNDA_EXT.sourcesOuvertes6.openPasteText({personId: 1}));
                    await p.fill('dialog.so6-paste [name=link]', 'https://www.idref.fr/026927608');
                    await p.fill('dialog.so6-paste [name=text]', 'Victor Hugo (1802-1885)\nNaissance : Besançon, 26-02-1802\nMort : Paris, 22-05-1885');
                    await p.click('dialog.so6-paste button[type=submit]');
                    await p.waitForSelector('dialog.k-import [data-so6-imp] .so-fields');
                    assert.equal(await p.inputValue('dialog.k-import .so-fields [name=death_date]'), '22 mai 1885');
                    assert.equal(await p.inputValue('dialog.k-import .so-fields [name=idref]'), '026927608', await p.inputValue('dialog.k-import [name=so6_link]'));
                    assert.ok(!(await p.isChecked('dialog.k-import [data-so6-ev="0"]')), 'naissance déjà là : non cochée');
                    assert.ok(await p.isChecked('dialog.k-import [data-so6-ev="1"]'));
                    await p.waitForSelector('dialog.k-import .so-ecart');
                    await noScroll(); await shot(p, `so6-import-${name}.png`);
                    await p.click('dialog.k-import [data-k-go]');
                    await p.waitForSelector('dialog.k-import', {state: 'detached'});
                    await p.waitForFunction(() => /Notice d’autorité/.test(document.body.textContent) && /Annuler/.test(document.body.textContent));
                    const undo = p.locator('button', {hasText: 'Annuler'}).last(); await undo.click();
                    await p.waitForTimeout(800);
                    assert.equal(sql("SELECT count(*) AS n FROM person_online_sheets")[0].n, 0, 'annulé');
                });
                await t(`${name} : « Chercher sur internet » — pastille PAYANT, Gratuites seulement, réglage`, async () => {
                    const r2 = await p.evaluate(() => { const A = window.LCNDA_APP; const all = A.webSearchAllSites(); return {n: all.filter(x => x[0].startsWith('so6_')).length, groups: A.webSearchGroups.slice()}; });
                    assert.ok(r2.n >= 10); assert.ok(r2.groups.includes('France · Bibliothèques numériques régionales')); assert.ok(r2.groups.indexOf('Royaume-Uni · Justice et registres') < r2.groups.indexOf('Autres'));
                    await p.evaluate(() => { const A = window.LCNDA_APP; const box = document.createElement('div'); box.id = 'so6-test-ws';
                        box.innerHTML = A.webSearchPanelHtml({person: {id: 1, first_name: 'Victor', last_name: 'Hugo'}, events: [], partners: []}, A.webSearchSettings(), 'so6-t') + A.webSearchSitesEditor('so6-ed-list', 'Toutes les fiches', A.webSearchSettings());
                        document.body.prepend(box); });
                    await p.waitForSelector('#so6-test-ws .web-search-panel [data-so6-free]');
                    assert.ok(await p.$('#so6-test-ws .web-search-site.is-paid [data-ws-site="ancestry"]'));
                    assert.ok(await p.$eval('#so6-test-ws .web-search-site.is-paid', s => s.hidden), 'payant caché');
                    assert.ok(await p.$('#so6-test-ws .web-search-site [data-ws-site="geneanet"] ~ .so6-paid'), 'Geneanet : en partie payant');
                    assert.equal(await p.$$eval('#so6-test-ws .web-search-panel .is-paid [data-ws-pick]', l => l.length), 0, 'pas ouvert par « Ouvrir les sites cochés »');
                    await p.click('#so6-test-ws .web-search-panel .so6-free');
                    assert.ok(!(await p.$eval('#so6-test-ws .web-search-site.is-paid', s => s.hidden)), 'montré une fois décoché');
                    assert.equal(await p.evaluate(() => localStorage.getItem('genealogie-sources-gratuites')), '0');
                    assert.ok(!(await p.isChecked('#so6-test-ws .web-search-editor [data-so6-free]')), 'même réglage partout');
                    assert.ok(await p.$('#so6-test-ws .web-search-editor .order-row.is-paid .so6-paid'));
                    await shot(p, `so6-chercher-sur-internet-${name}.png`);
                    await p.click('#so6-test-ws .web-search-editor .so6-free');
                    assert.ok(await p.$eval('#so6-test-ws .web-search-editor .order-row.is-paid', s => s.hidden));
                    await p.evaluate(() => document.getElementById('so6-test-ws').remove());
                });
                await t(`${name} : fiche d’un lieu — la bibliothèque de sa région`, async () => {
                    const row = await p.evaluate(() => { const box = document.createElement('div'); box.id = 'so6-test-pl'; box.innerHTML = window.LCNDA_EXT.sourcesOuvertes6.placeRow({name: 'Caen', placeId: 2, county: 'Calvados', country: 'France'}); document.body.prepend(box);
                        return {region: box.querySelector('[data-so6-region]').dataset.so6Region, links: [...box.querySelectorAll('a[data-so6-go]')].map(a => a.href)}; });
                    assert.equal(row.region, 'nor'); assert.equal(row.links.length, 1); assert.match(row.links[0], /^https:\/\/www\.normannia\.info\/.*Caen/);
                    await p.click('#so6-test-pl [data-so6-search]');
                    await p.waitForSelector('dialog.so6-search[open] .so6-link');
                    assert.equal(await p.inputValue('dialog.so6-search [name=place]'), 'Caen'); assert.equal(await p.inputValue('dialog.so6-search [name=last]'), '');
                    assert.ok(await p.$('dialog.so6-search .so6-link[data-so6-site="normannia"] .ui-badge.is-blue'), 'Ta région');
                    await noScroll(); await shot(p, `so6-lieu-${name}.png`);
                    await p.click('dialog.so6-search .modal-head [data-x]');
                    await p.evaluate(() => document.getElementById('so6-test-pl').remove());
                });
                await ctx.close();
            }
            await t('navigateur : aucune erreur, aucune requête vers un autre site', () => {
                assert.deepEqual(errors, []);
                const hosts = new Set(S6.SITES.flatMap(x => [x.home, S6.url(x.key, P)].filter(Boolean).map(u => new URL(u).hostname)));
                assert.deepEqual(external.filter(u => hosts.has(new URL(u).hostname) || /google\.com\/search/.test(u)), [], 'aucune requête vers ces sites');
            });
        } finally { await browser.close(); }
    } finally {
        proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
        finish();
    }
})();
