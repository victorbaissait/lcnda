'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🌍 Archives de France et d’ailleurs (3e lot des archives en ligne) :   node tests/test-sources-ouvertes-3.js
 *  1. calculs purs (app-sources-ouvertes-3-core.js) : chaque adresse construite, encodée, en https, sans rien de dangereux ;
 *     sites « copier le nom » ; modèle d’adresse de la personne (sûr) ; sites proposés selon l’endroit, les années, le pays ;
 *     lecture d’Open Archives (JSON de l’API et CSV), de FreeBMD (texte copié), des fiches copiées (CICR, Find a Grave,
 *     Sycomore, brevet), la sorte devinée, les ajouts proposés ;
 *  2. aucune requête vers ces sites (code JS et PHP) ;
 *  3. l’API sur une petite base inventée : « c’est la même personne ? », import (média, source avec lien et mention,
 *     événements cochés, rien d’écrasé, blocs : unité Poilu, invention + profil inventeur, diplôme, Juste parmi les nations),
 *     lignes d’Open Archives, ↶ Annuler (tout s’en va, profil décoché), Arolsen jamais dans un jeu, CSRF, sorte inconnue ;
 *  4. le navigateur (Playwright ; sinon sauté) à 1440 px, 390 px et en sombre : fenêtre de recherche (rubriques, C1,
 *     pastilles), adresses ouvertes = adresses montrées, « Adresses des sites » (rubriques repliables, C1), import d’un texte
 *     collé jusqu’au message « ↶ Annuler », « Chercher sur internet » (sites ajoutés, réglage avec C1 et rubriques),
 *     aucune requête sortante, pas d’erreur, pas de défilement horizontal.
 * Captures : SHOTS=dossier node tests/test-sources-ouvertes-3.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const S3 = require('../assets/js/app-sources-ouvertes-3-core.js');
const SHOTS = process.env.SHOTS || '';
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const finish = () => { if (failed) { console.error(`\n${failed} échec(s)`); process.exit(1); } console.log('\nTout est bon.'); };
const P = {first: 'Jean Marie', last: 'Dupré & Fils', place: 'Saint-Étienne, Loire', y1: 1880, y2: 1950};

(async () => {
    /* ═════ 1. calculs purs ═════ */
    await t('toutes les adresses : https, encodées, sans espace ni guillemet, rubrique et vérification connues', () => {
        const keys = new Set();
        for (const s of S3.SITES) {
            assert.ok(!keys.has(s.key), `clé en double ${s.key}`); keys.add(s.key);
            assert.ok(S3.groupOf(s.group), `${s.key} : rubrique`); assert.ok(['oui', 'partiel', 'non'].includes(s.verified), `${s.key} : vérification`);
            const u = S3.url(s.key, P); assert.match(u, /^https:\/\//, s.key); assert.ok(!/[\s"<>]/.test(u), `${s.key} : ${u}`);
            new URL(u); assert.match(s.home, /^https:\/\//); assert.ok(Array.isArray(s.where) && s.where.length);
            if (!s.copy && !s.byPlace && !/google\.com/.test(u) && s.key !== 'joconde') assert.ok(/Dupr%C3%A9|Jean/.test(u), `${s.key} : le nom est dans l’adresse`);
            if (s.copy) assert.equal(S3.copyText(s.key, P), 'DUPRÉ & FILS Jean');
        }
        assert.ok(S3.SITES.length >= 25);
        // quelques adresses exactes
        const ant = new URL(S3.url('antenati_nom', P)); assert.equal(ant.searchParams.get('cognome'), 'Dupré & Fils'); assert.equal(ant.searchParams.get('nome'), 'Jean');
        const oa = new URL(S3.url('openarchives', P)); assert.equal(oa.searchParams.get('name'), 'Jean Dupré & Fils'); assert.equal(oa.searchParams.get('eventplace'), 'Saint-Étienne');
        assert.match(S3.dataUrl('openarchives', P), /^https:\/\/api\.openarchieven\.nl\/1\.1\/records\/search\.json\?/);
        const yv = new URL(S3.url('yv_justes', P)); assert.equal(yv.searchParams.get('searchType'), 'righteous_only'); assert.equal(yv.searchParams.get('language'), 'fr');
        const gt = new URL(S3.url('geneteka', P)); assert.equal(gt.searchParams.get('search_lastname'), 'Dupré & Fils'); assert.equal(gt.searchParams.get('from_date'), '1880');
        assert.match(S3.url('archiveorg_local', P), /query=%22Saint-%C3%89tienne%22/, 'livres d’histoire locale : par le lieu');
        assert.equal(S3.url('freebmd', P), 'https://www.freebmd.org.uk/cgi/search.pl');
        assert.equal(S3.url('nope', P), '');
    });
    await t('modèle d’adresse de la personne : rempli et encodé ; une adresse non http(s) est ignorée', () => {
        assert.equal(S3.url('persee', P, {persee: 'https://exemple.org/s?n={nom}&p={prénom}&l={lieu}'}), 'https://exemple.org/s?n=Dupr%C3%A9%20%26%20Fils&p=Jean&l=Saint-%C3%89tienne');
        assert.match(S3.url('persee', P, {persee: 'javascript:alert(1)//{nom}'}), /^https:\/\/www\.persee\.fr\//);
    });
    await t('sites proposés selon l’endroit, les années, le lieu et le pays', () => {
        const keys = (w, c) => S3.forPlace(w, c).map(s => s.key);
        assert.ok(keys('militaire', {y1: 1890, y2: 1960}).includes('cicr_pg'));
        assert.ok(!keys('militaire', {y1: 1700, y2: 1760}).includes('cicr_pg'), 'pas de prisonniers 14-18 pour un homme mort en 1760');
        assert.ok(keys('inventeur', {}).includes('inpi_brevets19') && keys('elu', {}).includes('sycomore') && keys('medecin', {}).includes('biusante_theses'));
        assert.deepEqual(keys('emigration', {country: 'Italie'}), ['antenati_nom']);
        assert.ok(keys('emigration', {country: 'Canada'}).includes('banq') && keys('emigration', {country: 'Canada'}).includes('bac_lac'));
        assert.ok(keys('lieu', {place: 'Paris'}).includes('paris_ec') && !keys('lieu', {place: 'Tulle'}).includes('paris_ec'));
        assert.ok(keys('lieu', {place: 'Tulle'}).includes('archiveorg_local') && keys('lieu', {}).includes('persee'));
    });
    await t('Open Archives : JSON de l’API (données ouvertes) et CSV → lignes', () => {
        const json = JSON.stringify({query: {name: 'Jansen'}, response: {number_found: 2, docs: [
            {pid: 'a1', archive_code: 'ra', archive_org: 'Regionaal Archief', personname: 'Jan van der Berg', relationtype: 'Kind', eventtype: 'Doop', eventdate: {day: 3, month: 5, year: 1820}, eventplace: ['Leiden'], sourcetype: 'DTB Dopen', url: 'https://www.openarchieven.nl/ra:a1'},
            {pid: 'a2', archive_code: 'ra', personname: 'Jan van der Berg', relationtype: 'Bruidegom', eventtype: 'Huwelijk', eventdate: {year: 1845}, eventplace: 'Delft', url: 'javascript:alert(1)'}]}});
        const r = S3.parseOpenArchives(json);
        assert.ok(r.ok); assert.equal(r.total, 2); assert.equal(r.rows.length, 2);
        assert.deepEqual([r.rows[0].first, r.rows[0].last, r.rows[0].tag, r.rows[0].date, r.rows[0].place, r.rows[0].role], ['Jan', 'van der Berg', 'BAPM', '3 mai 1820', 'Leiden', 'Enfant']);
        assert.equal(r.rows[1].tag, 'MARR'); assert.equal(r.rows[1].role, 'Marié');
        assert.match(r.rows[1].url, /^https:\/\/www\.openarchieven\.nl\/ra:a2$/, 'lien dangereux remplacé par la notice');
        const c = S3.parseOpenArchives('Naam;Gebeurtenis;Datum;Plaats;Rol\n"Pieter Jansen";Overlijden;12-04-1890;Utrecht;Overledene\n');
        assert.ok(c.ok); assert.deepEqual([c.rows[0].last, c.rows[0].tag, c.rows[0].year, c.rows[0].role], ['Jansen', 'DEAT', 1890, 'Défunt']);
        assert.equal(S3.parseOpenArchives('{abîmé').ok, false);
        assert.equal(S3.parseOpenArchives('a;b\n1;2').ok, false);
    });
    await t('FreeBMD : texte copié d’une page de résultats → naissances, mariages, décès par trimestre', () => {
        const txt = 'Births Mar 1872\nSurname  First name(s)  Mother  District  Vol  Page\nSMITH  John Henry  BROWN  Leeds  9b  345\n\nDeaths Dec 1901\nSMITH\tJohn Henry\t29\tLeeds\t9b\t201\nnot a row';
        const r = S3.parseFreeBMD(txt);
        assert.ok(r.ok); assert.equal(r.rows.length, 2);
        assert.deepEqual([r.rows[0].tag, r.rows[0].last, r.rows[0].first, r.rows[0].district, r.rows[0].vol, r.rows[0].page, r.rows[0].quarter], ['BIRT', 'Smith', 'John Henry', 'Leeds', '9b', '345', 1]);
        assert.match(r.rows[0].note, /1er trimestre \(janvier-mars\) 1872.*Leeds.*nom de la mère : BROWN/);
        assert.equal(r.rows[1].tag, 'DEAT'); assert.equal(r.rows[1].quarter, 4);
        assert.equal(S3.parseFreeBMD('rien').ok, false);
    });
    await t('fiches copiées : CICR, Find a Grave, Sycomore, brevet ; sorte devinée ; ajouts proposés', () => {
        const cicr = 'Agence internationale des prisonniers de guerre\nNom : MOURGUE\nPrénom : Jean\nDate de naissance : 2 février 1890\nLieu de naissance : Tulle\nRégiment : 126e régiment d’infanterie\nFait prisonnier le : 22 août 1914\nLieu de capture : Rossignol\nCamp : Giessen';
        assert.equal(S3.detectKind(cicr), 'cicr');
        const f = S3.parseFields(cicr, 'cicr');
        assert.deepEqual([f.last, f.first, f.birth_date, f.unit, f.capture_date, f.capture_place, f.camp], ['Mourgue', 'Jean', '2 février 1890', '126e régiment d’infanterie', '22 août 1914', 'Rossignol', 'Giessen']);
        const pr = S3.proposals('cicr', f);
        assert.deepEqual(pr.events.map(e => e.tag), ['BIRT', 'EVEN']); assert.match(pr.events[1].note, /Camp : Giessen/); assert.equal(pr.blocks[0].block, 'military');
        const fag = 'Find a Grave Memorial ID\n123456789\nBirth\n4 Apr 1876\nDeath\n8 Jun 1935\nBurial\nMount Hope Cemetery\nPlot\nSec. B';
        assert.equal(S3.detectKind(fag), 'findagrave');
        const g = S3.parseFields(fag, 'findagrave'); assert.equal(g.memorial, '123456789'); assert.equal(g.burial, 'Mount Hope Cemetery');
        assert.equal(S3.proposals('findagrave', g).events.find(e => e.tag === 'BURI').place, 'Mount Hope Cemetery');
        assert.equal(S3.detectKind('Sycomore\nNé le 3 mai 1850 à Tulle\nMandats : député de la Corrèze'), 'elu');
        const b = S3.parseFields('Numéro du brevet : 12345\nTitre : Sécateur à cliquet\nDate de dépôt : 4 mars 1852\nInventeur : MARTIN Pierre\nProfession : coutelier', 'brevet');
        assert.deepEqual([b.number, b.title, b.inventor, b.job], ['12345', 'Sécateur à cliquet', 'MARTIN Pierre', 'coutelier']);
        assert.equal(S3.proposals('brevet', b).blocks[0].block, 'sciences');
        assert.equal(S3.proposals('acte', {type: 'Atto di nascita', date: '1875', place: 'Napoli'}).events[0].tag, 'BIRT');
        assert.equal(S3.proposals('acte', {type: 'Akt zgonu', date: '1901'}).events[0].tag, 'DEAT');
    });

    /* ═════ 2. aucune requête vers ces sites ═════ */
    await t('aucune requête sortante : le code ne fait que fabriquer des adresses', () => {
        const core = fs.readFileSync(path.join(appRoot, 'assets/js/app-sources-ouvertes-3-core.js'), 'utf8');
        assert.ok(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon|new Image\(|import\(/.test(core), 'core : pas de requête');
        const ui = fs.readFileSync(path.join(appRoot, 'assets/js/heritage-sources-ouvertes-3.js'), 'utf8');
        const fetches = [...ui.matchAll(/fetch\(\s*([^,)]+)/g)].map(m => m[1].trim());
        assert.ok(fetches.every(x => /^'api\.php\?action=so3_import'$/.test(x)), 'seulement api.php : ' + fetches.join(' | '));
        assert.ok(!/XMLHttpRequest|sendBeacon|new Image\(/.test(ui));
        const php = fs.readFileSync(path.join(appRoot, 'lib/sources_ouvertes_3.php'), 'utf8');
        assert.ok(!/curl_|file_get_contents\(\s*['"$]|fopen\(\s*['"]https?:|stream_context|http_get|fsockopen/.test(php), 'lib : pas de requête');
    });

    /* ═════ 3. l'API ═════ */
    const phpPath = findPhp([devBundledPhp()]);
    if (!phpPath) { console.log('— PHP absent : partie serveur sautée'); return finish(); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-so3-'));
    const dir = path.join(tmp, 'a'); fs.mkdirSync(path.join(dir, 'media'), {recursive: true});
    const envFor = d => ({...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1'});
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' AND COALESCE(scope,'person')='person' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,is_start,living_status) VALUES(1,'Jean','MOURGUE','male',1,'deceased'),(2,'Pierre','MARTIN','male',0,'deceased'),(3,'Marthe','BESSE','female',0,'deceased'),(4,'Jan','VAN DER BERG','male',0,'deceased')");
$pdo->exec("INSERT INTO places(id,name,county,country) VALUES(1,'Tulle','Corrèze','France')");
$ev = $pdo->prepare('INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES(?,?,?,?,?,?)');
$ev->execute(['person',1,$t('BIRT'),'2 février 1890',1890,1]);
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
            const x = await fetch(`${base}api.php?action=so3_import`, {method: 'POST', body: fd, headers: {Cookie: cookie, 'X-CSRF-Token': csrf}});
            const j = await x.json().catch(() => ({})); return {status: x.status, body: j, result: j.result};
        };
        const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
        const cicrF = S3.parseFields('Nom : MOURGUE\nPrénom : Jean\nDate de naissance : 3 février 1893\nRégiment : 126e régiment d’infanterie\nFait prisonnier le : 22 août 1914\nLieu de capture : Rossignol\nCamp : Giessen', 'cicr');
        const cicrEv = S3.proposals('cicr', cicrF).events.map(e => ({...e, tag: e.label === 'Fait prisonnier' ? 'POW' : e.tag}));
        const before = await get('person', {id: 1});

        await t('API : « c’est la même personne ? » — écarts, naissance déjà sur la fiche, rien n’est écrit', async () => {
            const pv = await post('so3_preview', {kind: 'cicr', site: 'cicr_pg', person_id: 1, fields: cicrF, events: cicrEv});
            assert.equal(pv.status, 200, JSON.stringify(pv.body));
            const txt = pv.result.ecarts.map(e => e.text).join('\n');
            assert.match(txt, /Né en 1893 d’après le document, en 1890 d’après la fiche/);
            assert.match(txt, /déjà une naissance \(2 février 1890 à Tulle\)/);
            const after = await get('person', {id: 1});
            assert.equal(JSON.stringify(after.events), JSON.stringify(before.events));
            assert.equal((await post('so3_preview', {kind: 'pirate', person_id: 1})).status, 422, 'sorte inconnue refusée');
            assert.ok((await post('so3_preview', {kind: 'cicr', person_id: 1}, 'faux')).status >= 400, 'CSRF');
        });
        let cicrBatch = '';
        await t('API : import CICR (image + événements + unité) — naissance gardée, « Prisonnier de guerre » ajouté, source avec lien et mention', async () => {
            const res = await imp({kind: 'cicr', site: 'cicr_pg', person_id: 1, url: 'https://grandeguerre.icrc.org/fr/List/123/1/2/', fields: cicrF, events: cicrEv, blocks: ['military'], source_title: S3.sourceTitle('cicr', cicrF, 'cicr_pg'), text: 'Fiche du CICR'},
                {bytes: PNG, type: 'image/png', name: 'fiche-cicr.png'});
            assert.equal(res.status, 200, JSON.stringify(res.body));
            cicrBatch = res.result.batch; assert.match(cicrBatch, /^so3-[0-9a-f]{12}$/);
            assert.ok(res.result.media_id > 0 && res.result.source_id > 0);
            assert.equal(res.result.events.length, 1, 'seulement l’événement de captivité');
            assert.match(res.result.summary, /déjà sur la fiche, gardé/);
            const p = await get('person', {id: 1});
            assert.equal(p.events.filter(e => e.gedcom_tag === 'BIRT').length, 1, 'une seule naissance');
            assert.equal(p.events.find(e => e.gedcom_tag === 'BIRT').date_text, '2 février 1890', 'pas écrasée');
            const pow = p.events.find(e => /prisonnier/i.test(e.type_label || '')); assert.ok(pow, 'événement « Prisonnier de guerre »'); assert.equal(pow.date_text, '22 août 1914');
            const src = (p.sources || []).find(s => /CICR/.test(s.title || '')); assert.ok(src, 'source'); assert.equal(src.url, 'https://grandeguerre.icrc.org/fr/List/123/1/2/');
            assert.match(JSON.stringify(p), /à vérifier sur le document/);
            assert.ok((p.media || []).some(m => /CICR|prisonnier/i.test(m.title || '')), 'média relié');
        });
        await t('API : ↶ Annuler — média, source, événement et unité s’en vont ; deux fois = refusé', async () => {
            const u = await post('so3_undo', {batch: cicrBatch}); assert.equal(u.status, 200, JSON.stringify(u.body));
            const p = await get('person', {id: 1});
            assert.equal(JSON.stringify(p.events), JSON.stringify(before.events));
            assert.ok(!(p.sources || []).some(s => /CICR/.test(s.title || ''))); assert.ok(!(p.media || []).length);
            assert.ok((await post('so3_undo', {batch: cicrBatch})).status >= 400);
            assert.equal((await post('so3_undo', {batch: '../x'})).status, 422);
        });
        await t('API : brevet → invention avec son brevet et profil « inventeur » ; ↶ Annuler décoche le profil', async () => {
            const f = {number: '12345', title: 'Sécateur à cliquet', date: '4 mars 1852', inventor: 'MARTIN Pierre', job: 'coutelier'};
            const res = await imp({kind: 'brevet', site: 'inpi_brevets19', person_id: 2, url: 'https://bases-brevets19e.inpi.fr/x', fields: f, events: [{tag: 'OCCU', label: 'Profession', date: '4 mars 1852', note: 'coutelier'}], blocks: ['sciences']});
            assert.equal(res.status, 200, JSON.stringify(res.body)); assert.equal(res.result.items.length, 1);
            const prof = () => spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require 'lib/bootstrap.php'; $p=db(); echo json_encode([$p->query("SELECT group_concat(profile_key) FROM person_profiles WHERE person_id=2")->fetchColumn(), $p->query("SELECT data FROM items WHERE person_id=2 AND type_key='invention'")->fetchColumn()]);`], {cwd: appRoot, encoding: 'utf8', env: envFor(dir)}).stdout;
            const [profiles, data] = JSON.parse(prof());
            assert.match(profiles || '', /inventor/); assert.match(data, /"no":"12345"/); assert.match(data, /Sécateur à cliquet/);
            assert.equal((await post('so3_undo', {batch: res.result.batch})).status, 200);
            const [p2, d2] = JSON.parse(prof()); assert.ok(!/inventor/.test(p2 || ''), 'profil décoché'); assert.equal(d2, false);
        });
        await t('API : thèse → diplôme ; Justes parmi les nations → récompense ; Arolsen → jamais dans un jeu', async () => {
            const th = await imp({kind: 'these', site: 'biusante_theses', person_id: 2, fields: {author: 'MARTIN Pierre', title: 'De la fièvre typhoïde', year: '1878', faculty: 'Faculté de médecine de Paris'}, blocks: ['education'], text: 'Thèse'});
            assert.equal(th.status, 200, JSON.stringify(th.body));
            const ju = await imp({kind: 'juste', site: 'yv_justes', person_id: 3, url: 'https://righteous.yadvashem.org/?search=Besse', fields: {name: 'Marthe Besse', date: '1995', file: 'M.31.2/6500'}, blocks: ['awards']});
            assert.equal(ju.status, 200, JSON.stringify(ju.body));
            const q = JSON.stringify(JSON.parse(spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require 'lib/bootstrap.php'; $p=db(); echo json_encode($p->query("SELECT type_key, title FROM items ORDER BY id")->fetchAll(PDO::FETCH_ASSOC));`], {cwd: appRoot, encoding: 'utf8', env: envFor(dir)}).stdout));
            assert.match(q, /"type_key":"diploma","title":"Doctorat en médecine"/); assert.match(q, /"type_key":"award","title":"Juste parmi les nations"/);
            const ar = await imp({kind: 'arolsen', site: 'arolsen_fr', person_id: 4, fields: {last: 'van der Berg', first: 'Jan', document: 'Carte d’enregistrement'}, text: 'Document'});
            assert.equal(ar.status, 200, JSON.stringify(ar.body));
            const resp = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require 'lib/bootstrap.php'; echo json_encode(array_keys(so3_respect_ids(db())));`], {cwd: appRoot, encoding: 'utf8', env: envFor(dir)}).stdout;
            assert.deepEqual(JSON.parse(resp), [4]);
            const ms = await get('mode_simple_data'); const four = (ms.persons || ms.people || []).find(x => Number(x.id) === 4);
            if (four) assert.equal(four.mem, 1, 'marqué « mem » pour les jeux');
        });
        await t('API : lignes d’Open Archives cochées → événements ; mariage laissé dans la source ; rien sans fiche', async () => {
            const res = await imp({kind: 'openarchives', site: 'openarchives', person_id: 4, url: 'https://www.openarchieven.nl/ra:a1',
                events: [{tag: 'BAPM', label: 'Doop', date: '3 mai 1820', place: 'Leiden', note: 'Rôle : Enfant'}, {tag: 'MARR', label: 'Huwelijk', date: '1845', place: 'Delft'}], fields: {last: 'van der Berg', first: 'Jan'}, text: 'Jan van der Berg · Doop · 3 mai 1820 · Leiden'});
            assert.equal(res.status, 200, JSON.stringify(res.body)); assert.equal(res.result.events.length, 1); assert.match(res.result.summary, /mariage laissé dans la source/);
            const p = await get('person', {id: 4}); assert.ok(p.events.some(e => e.gedcom_tag === 'CHR' && e.date_text === '3 mai 1820'));
            assert.equal((await imp({kind: 'acte', person_id: 0, text: 'x'})).status, 422);
            assert.equal((await imp({kind: 'acte', person_id: 4})).status, 422, 'il faut un fichier, un lien, un texte ou une ligne');
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
                await ctx.route(url => !/^http:\/\/127\.0\.0\.1:/.test(url.href) && !/^(data|blob):/.test(url.href), route => { external.push(route.request().url()); route.abort(); });
                await ctx.addInitScript(() => { window.__opened = []; window.open = (u) => { window.__opened.push(String(u)); return null; }; });
                const p = await ctx.newPage(); p.setDefaultTimeout(20000);
                p.on('pageerror', e => errors.push(`${name} : ${e.message}`));
                p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource|ERR_FAILED/.test(m.text())) errors.push(`${name} : ${m.text()}`); });
                p.on('dialog', d => { errors.push(`${name} : dialogue natif ${d.message()}`); d.dismiss(); });
                await p.goto(base);
                await p.waitForFunction(() => window.LCNDA_APP?.state && window.LCNDA_EXT?.sourcesOuvertes3 && window.LCNDA_SOURCES_OUVERTES_3, null, {timeout: 20000});
                if (dark) await p.evaluate(() => { const A = window.LCNDA_APP; localStorage.setItem('genealogie-design', JSON.stringify({...A.readDesignSettings(), preset: 'dark'})); A.applyDesign(); });
                const noScroll = async () => { const sw = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert.ok(sw <= 0, `défilement horizontal : ${sw}`); };
                await t(`${name} : 🔍 fenêtre commune — sites du lot, C1, pastilles, adresses montrées = adresses ouvertes`, async () => {
                    await p.evaluate(() => window.LCNDA_EXT.sourcesOuvertes3.openSearch({personId: 1}));
                    await p.waitForSelector('dialog.ael-search[open] [data-ael-links] .ael-site');
                    assert.equal(await p.inputValue('dialog.ael-search [name=last]'), 'MOURGUE');
                    const links = await p.$$eval('dialog.ael-search .ael-acts a[data-ael-go]', as => as.map(a => [a.getAttribute('href'), a.closest('.so-link').querySelector('.so-url').textContent, a.target]));
                    assert.ok(links.length >= 10); links.forEach(([h, shown, tg]) => { assert.equal(h, shown); assert.equal(tg, '_blank'); });
                    assert.ok(await p.$('dialog.ael-search .ui-search-input'), 'case C1');
                    await p.fill('dialog.ael-search [data-ael-q]', 'antenati');
                    assert.deepEqual(await p.$$eval('dialog.ael-search .ael-site', l => l.map(x => x.dataset.aelSite)), ['so3_antenati_nom']);
                    await p.fill('dialog.ael-search [data-ael-q]', '');
                    await p.click('dialog.ael-search [data-ael-zone="eu"]'); await p.click('dialog.ael-search [data-ael-country="Royaume-Uni"]');
                    const uk = await p.$$eval('dialog.ael-search .ael-site', l => l.map(x => x.dataset.aelSite));
                    assert.ok(uk.includes('so3_freebmd') && uk.includes('so3_freecen') && uk.includes('so6_oldbailey'), uk.join(','));
                    assert.ok(!uk.includes('so6_scotlandspeople'), 'payant caché (Gratuites seulement)');
                    assert.equal(await p.getAttribute('[data-ael-go="so3_freebmd"]', 'href'), 'https://www.freebmd.org.uk/cgi/search.pl');
                    assert.equal(await p.getAttribute('[data-ael-go="so3_freebmd"]', 'data-ael-copy'), 'MOURGUE Jean');
                    await p.evaluate(() => { window.addEventListener('click', e => { if (e.target.closest('[data-ael-go]')) e.preventDefault(); }, {once: true}); });
                    await p.click('dialog.ael-search [data-ael-go="so3_freebmd"]');
                    await p.waitForFunction(() => /MOURGUE Jean/.test(document.body.textContent));
                    await p.click('dialog.ael-search [data-ael-zone=""]');
                    await noScroll(); await shot(p, `so3-chercher-${name}.png`);
                });
                await t(`${name} : ⚙️ Adresses des sites (un seul écran) — rubriques repliables, C1, gardé tout de suite (K2)`, async () => {
                    await p.click('dialog.ael-search [data-ael-settings]');
                    await p.waitForSelector('dialog.ael-settings[open] details.ael-rub');
                    assert.ok(await p.$$eval('dialog.ael-settings details.ael-rub', d => d.length) >= 20);
                    await p.fill('dialog.ael-settings [data-ael-sq]', 'freebmd');
                    assert.equal(await p.$$eval('dialog.ael-settings details.ael-rub:not([hidden])', d => d.length), 1);
                    assert.ok(await p.$eval('dialog.ael-settings details.ael-rub:not([hidden])', d => d.open));
                    await p.fill('dialog.ael-settings input[name=so3_freebmd]', 'https://www.freebmd.org.uk/cgi/search.pl?surname={nom}');
                    await p.waitForTimeout(700);
                    assert.match(await p.evaluate(() => localStorage.getItem('genealogie-sources-ouvertes-3-sites') || ''), /surname=\{nom\}/);
                    await shot(p, `so3-adresses-${name}.png`);
                    await p.click('dialog.ael-settings [data-ui-reset]'); await p.waitForTimeout(300);
                    assert.equal(await p.evaluate(() => localStorage.getItem('genealogie-sources-ouvertes-3-sites')), null);
                    await p.click('dialog.ael-settings .modal-actions [data-ui-x]');
                    await p.click('dialog.ael-search .modal-head [data-x]');
                });
                await t(`${name} : 📋 coller une fiche du CICR → import (cases remplies, propositions, même personne ?) → « ↶ Annuler »`, async () => {
                    await p.evaluate(() => window.LCNDA_EXT.sourcesOuvertes3.openPasteText({personId: 1}));
                    await p.fill('dialog.ael-paste [name=text]', 'Agence internationale des prisonniers de guerre\nNom : MOURGUE\nPrénom : Jean\nRégiment : 126e RI\nFait prisonnier le : 22 août 1914\nCamp : Giessen');
                    assert.equal(await p.inputValue('dialog.ael-paste [name=lot]'), '3', 'le seul « Coller un lien » : la fiche du CICR va à l’import de ce lot');
                    await p.click('dialog.ael-paste button[type=submit]');
                    await p.waitForSelector('dialog.k-import [data-so3-imp] .so3-fields');
                    assert.equal(await p.inputValue('dialog.k-import [name=so3_kind]'), 'cicr');
                    assert.equal(await p.inputValue('dialog.k-import .so3-fields [name=camp]'), 'Giessen');
                    assert.ok(await p.$('dialog.k-import [data-so3-ev]'));
                    await p.waitForSelector('dialog.k-import .so-ecart');
                    await noScroll(); await shot(p, `so3-import-${name}.png`);
                    await p.click('dialog.k-import [data-k-go]');
                    await p.waitForSelector('dialog.k-import', {state: 'detached'});
                    await p.waitForFunction(() => /Fiche de prisonnier/.test(document.body.textContent) && /Annuler/.test(document.body.textContent));
                    const undo = p.locator('button', {hasText: 'Annuler'}).last(); await undo.click();
                    await p.waitForTimeout(600);
                });
                await t(`${name} : « Chercher sur internet » — sites ajoutés (cachés au départ), réglage avec C1 et rubriques`, async () => {
                    const r2 = await p.evaluate(() => { const A = window.LCNDA_APP; const all = A.webSearchAllSites(); const s = A.webSearchSettings();
                        return {n: all.filter(x => x[0].startsWith('so3_')).length, hidden: all.filter(x => x[0].startsWith('so3_')).every(x => s.hidden.includes(x[0])), groups: A.webSearchGroups.slice(), href: all.find(x => x[0] === 'so3_antenati_nom')[3]({first: 'Jean', last: 'Rossi', place: 'Napoli'})}; });
                    assert.ok(r2.n >= 25 && r2.hidden); assert.ok(r2.groups.includes('Italie · Espagne · Portugal')); assert.ok(r2.groups.indexOf('Royaume-Uni') < r2.groups.indexOf('Autres'));
                    assert.match(r2.href, /cognome=Rossi&nome=Jean&localita=Napoli/);
                    await p.evaluate(() => { const box = document.createElement('div'); box.id = 'so3-test-ed'; box.innerHTML = window.LCNDA_APP.webSearchSitesEditor('so3-ed-list', 'Toutes les fiches', window.LCNDA_APP.webSearchSettings()); document.querySelector('#workspace').prepend(box); window.LCNDA_EXT.sourcesOuvertes3.enhanceEditors(box); });
                    await p.waitForSelector('#so3-test-ed .so3-wsbar [data-so3-wsq]');
                    await p.fill('#so3-test-ed [data-so3-wsq]', 'geneteka');
                    assert.equal(await p.$$eval('#so3-test-ed .order-row:not([hidden])', r => r.length), 1);
                    await p.fill('#so3-test-ed [data-so3-wsq]', '');
                    await p.$eval('#so3-test-ed .so3-wsrub', d => { d.open = true; });
                    await p.$eval('#so3-test-ed [data-so3-wsg="Royaume-Uni"]', b => b.click());
                    assert.equal(await p.$$eval('#so3-test-ed .order-row:not([hidden])', r => r.length), 2);
                    await shot(p, `so3-reglage-sites-${name}.png`);
                    await p.evaluate(() => document.getElementById('so3-test-ed').remove());
                });
                await ctx.close();
            }
            await t('navigateur : aucune erreur, aucune requête vers un autre site', () => {
                assert.deepEqual(errors, []);
                const hosts = new Set(S3.SITES.flatMap(x => [x.home, x.search, S3.url(x.key, P), x.data ? S3.dataUrl(x.key, P) : ''].filter(Boolean).map(u => new URL(u).hostname)));
                assert.deepEqual(external.filter(u => hosts.has(new URL(u).hostname) || /google\.com\/search/.test(u)), [], 'aucune requête vers ces sites (les tuiles de carte du tableau de bord ne comptent pas)');
            });
        } finally { await browser.close(); }
    } finally {
        proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
        finish();
    }
})();
