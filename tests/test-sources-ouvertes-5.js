'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🌍 Archives en ligne, 5e lot (FamilySearch, WikiTree, Fichier Origine, Castle Garden, Sainte-Hélène, ANMT, mémoriaux,
 * état civil consulaire, Geneawiki, Pamyat Naroda, Memorial, photographes, Maitron, CCFr, Calames) :   node tests/test-sources-ouvertes-5.js
 *  1. calculs purs : chaque adresse construite, encodée, en https ; sites « copier le nom » ; modèle d’adresse de la personne ;
 *     « Mes sites » ({annee_naissance}, {annee_deces}, champs inconnus) ; sites selon l’endroit et les années ; fiches copiées
 *     (Fichier Origine, Castle Garden, Sainte-Hélène, registre du personnel, Maitron, Memorial) ; liens ; photographe → période ;
 *  2. aucune requête vers ces sites (code JS et PHP) ;
 *  3. l’API : « c’est la même personne ? », import (média, source avec lien, naissance gardée, voyage, médaille, employeur,
 *     note, identifiant FamilySearch seulement si vide), ↶ Annuler (tout s’en va), Memorial jamais dans un jeu, CSRF ;
 *  4. le navigateur (Playwright ; sinon sauté) à 1440 px, 390 px et en sombre : fenêtre de recherche, ⚙️ Adresses des sites,
 *     import d’un texte collé jusqu’à « ↶ Annuler », « Chercher sur internet » (sites ajoutés, rubriques), « Mes sites »
 *     (🧪 Essayer, ajout, 💾 Réglages enregistrés), 📷 photographe, aucune requête sortante, pas d’erreur, pas de défilement.
 * Captures : SHOTS=dossier node tests/test-sources-ouvertes-5.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const S5 = require('../assets/js/app-sources-ouvertes-5-core.js');
const SHOTS = process.env.SHOTS || '';
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const finish = () => { if (failed) { console.error(`\n${failed} échec(s)`); process.exit(1); } console.log('\nTout est bon.'); };
const P = {first: 'Jean Marie', last: 'Dupré & Fils', place: 'Saint-Étienne, Loire', y1: 1790, y2: 1860, birthYear: 1790, deathYear: 1860, insee: '42218', employer: 'Filature Motte & Cie', photographer: 'Nadar'};

(async () => {
    /* ═════ 1. calculs purs ═════ */
    await t('toutes les adresses : https, encodées, sans espace ni guillemet, rubrique et vérification connues', () => {
        const keys = new Set();
        for (const s of S5.SITES) {
            assert.ok(!keys.has(s.key), `clé en double ${s.key}`); keys.add(s.key);
            assert.ok(S5.groupOf(s.group), `${s.key} : rubrique`); assert.ok(['oui', 'partiel', 'non'].includes(s.verified), `${s.key} : vérification`);
            const u = S5.url(s.key, P); assert.match(u, /^https:\/\//, s.key); assert.ok(!/[\s"<>]/.test(u), `${s.key} : ${u}`);
            new URL(u); assert.match(s.home, /^https:\/\//); assert.ok(Array.isArray(s.where) && s.where.length);
            if (s.copy) assert.equal(S5.copyText(s.key, P), 'DUPRÉ & FILS Jean');
            if (s.kind) assert.ok(S5.KINDS.includes(s.kind) || s.kind === 'photographe', `${s.key} : sorte ${s.kind}`);
        }
        assert.ok(S5.SITES.length >= 20);
        const fs1 = new URL(S5.url('fs_records', P)); assert.equal(fs1.searchParams.get('q.surname'), 'Dupré & Fils'); assert.equal(fs1.searchParams.get('q.givenName'), 'Jean'); assert.equal(fs1.searchParams.get('q.birthLikeDate.from'), '1788');
        const fo = new URL(S5.url('fichier_origine', P)); assert.equal(fo.searchParams.get('nom'), 'Dupré & Fils'); assert.equal(fo.searchParams.get('prenom'), 'Jean');
        assert.equal(new URL(S5.url('maitron', P)).searchParams.get('recherche'), 'Dupré & Fils Jean');
        assert.equal(new URL(S5.url('geneawiki', P)).searchParams.get('search'), '42218 - Saint-Étienne');
        assert.equal(new URL(S5.url('geneawiki', {county: 'Corrèze'})).searchParams.get('search'), 'Corrèze');
        assert.match(S5.url('anmt', P), /%22Filature%20Motte%20%26%20Cie%22/, 'ANMT : par le nom de l’entreprise');
        assert.equal(S5.url('fs_tree', {...P, fsId: 'lz2k-8qf'}), 'https://www.familysearch.org/tree/person/details/LZ2K-8QF');
        assert.match(S5.url('fs_tree', P), /familysearch\.org\/fr\/tree\/find\/name$/, 'sans identifiant : la page de recherche');
        assert.equal(S5.url('wikitree', {...P, wikitreeId: 'Dupont-1234'}), 'https://www.wikitree.com/wiki/Dupont-1234');
        assert.match(S5.url('pamyat_naroda', P), /last_name=Dupr%C3%A9%20%26%20Fils&first_name=Jean&date_birth=1790/);
        assert.equal(S5.url('nope', P), '');
    });
    await t('modèle d’adresse de « ⚙️ Adresses des sites » : rempli et encodé ; une adresse non http(s) est ignorée', () => {
        assert.equal(S5.url('castle_garden', P, {castle_garden: 'https://exemple.org/s?n={nom}&p={prénom}&b={annee_naissance}'}), 'https://exemple.org/s?n=Dupr%C3%A9%20%26%20Fils&p=Jean&b=1790');
        assert.match(S5.url('castle_garden', P, {castle_garden: 'javascript:alert(1)//{nom}'}), /^https:\/\/www\.castlegarden\.org\//);
    });
    await t('« Mes sites » : {annee_naissance} {annee_deces} {lieu}, avec ou sans accents ; champs inconnus et adresses dangereuses signalés', () => {
        const p = {first: 'Jean', last: 'Dupré', name: 'Jean Dupré', place: 'Tulle', birthYear: 1850, deathYear: 1920, y1: 1850, y2: 1920, q: '"Jean Dupré"'};
        assert.equal(S5.fillCustom('https://x.fr/?n={nom}&p={prénom}&b={annee_naissance}&d={année_décès}&l={lieu}&q={requête}', p), 'https://x.fr/?n=Dupr%C3%A9&p=Jean&b=1850&d=1920&l=Tulle&q=%22Jean%20Dupr%C3%A9%22');
        assert.deepEqual(S5.checkCustom({label: 'X', url: 'https://x.fr/?n={nom}'}), []);
        assert.match(S5.checkCustom({label: 'X', url: 'https://x.fr/?n={zzz}'}).join(' '), /Champ inconnu : \{zzz\}/);
        assert.match(S5.checkCustom({label: '', url: 'javascript:alert(1)'}).join(' '), /Donne un nom.*https:\/\//);
        assert.match(S5.checkCustom({label: 'X', url: 'https://x.fr/'}).join(' '), /aucun champ/);
        const c = S5.cleanCustom({key: 'custom-<x>', label: ' Site ', url: 'https://x.fr/{nom}', group: 'Lot', icon: '🏛'}, 'custom-a1');
        assert.deepEqual(c, {key: 'custom-a1', label: 'Site', url: 'https://x.fr/{nom}', group: 'Lot', icon: '🏛'});
    });
    await t('sites proposés selon l’endroit et les années ; au format de « Chercher sur internet » (FamilySearch et WikiTree pas en double)', () => {
        const keys = (w, c) => S5.forPlace(w, c).map(s => s.key);
        assert.ok(keys('militaire', {birthYear: 1785}).includes('sainte_helene'));
        assert.ok(!keys('militaire', {birthYear: 1880}).includes('sainte_helene'), 'pas de Sainte-Hélène pour un homme né en 1880');
        assert.ok(keys('emigration', {y1: 1700, y2: 1760}).includes('fichier_origine') && !keys('emigration', {y1: 1900, y2: 1960}).includes('castle_garden'));
        assert.ok(keys('fiche', {fsId: 'LZ2K-8QF'}).includes('fs_tree') && !keys('fiche', {}).includes('fs_tree'));
        assert.deepEqual(keys('photo', {}), ['daguerre', 'portraitsepia', 'gallica_annuaires']);
        assert.ok(keys('employeur', {}).includes('anmt') && keys('lieu', {}).includes('geneawiki'));
        const ws = S5.webSites();
        assert.ok(ws.length >= 12); assert.ok(!ws.some(x => /fs_records|so5_wikitree/.test(x[0])), 'FamilySearch et WikiTree sont déjà dans l’app');
        ws.forEach(([k, label, group, fn, meta]) => { assert.match(k, /^so5_/); assert.ok(label && group && meta.icon); const u = fn({first: 'Jean', last: 'Dupont', place: 'Tulle', year: 1850}); assert.match(u, /^https:\/\//); });
    });
    await t('fiches copiées : Fichier Origine, Castle Garden, Sainte-Hélène, registre du personnel, Maitron, Memorial ; sorte devinée ; ajouts proposés', () => {
        const fo = 'Fichier Origine\nNuméro : 240456\nNom : TREMBLAY\nPrénom : Pierre\nDate de baptême : 23 janvier 1626\nLieu d’origine : Randonnai (Orne)\nPère : Philibert Tremblay\nMère : Jeanne Coignet\nDate de mariage : 2 octobre 1657\nLieu de mariage : Québec\nConjoint : Ozanne Achon';
        assert.equal(S5.detectKind(fo), 'origine');
        const f = S5.parseFields(fo, 'origine'); assert.equal(f.numero, '240456'); assert.equal(f.last, 'Tremblay'); assert.equal(f.birth_place, 'Randonnai (Orne)');
        const pr = S5.proposals('origine', f, {has: {}});
        assert.equal(pr.events[0].tag, 'CHR'); assert.equal(pr.events[0].date, '23 janvier 1626'); assert.equal(pr.voyage.destination, 'Québec'); assert.match(pr.voyage.passenger_list_ref, /240456/);
        assert.ok(S5.proposals('origine', f, {has: {BIRT: true}}).events[0].already, 'baptême : la naissance de la fiche suffit, rien en double');
        const cg = 'Castle Garden\nLast name: MULLER\nFirst name: Johann\nAge: 24\nOccupation: farmer\nCountry of origin: Germany\nShip: Hammonia\nPort of departure: Hamburg\nArrival date: 12 May 1866';
        assert.equal(S5.detectKind(cg), 'passager');
        const c = S5.proposals('passager', S5.parseFields(cg, 'passager'), {has: {}});
        assert.equal(c.voyage.ship_name, 'Hammonia'); assert.equal(c.voyage.departure_port, 'Hamburg'); assert.ok(c.events.some(e => e.tag === 'BIRT' && e.date === 'vers 1842'));
        const sh = S5.parseFields('Médaillés de Sainte-Hélène\nNom : MOURGUE\nPrénom : Jean\nNé le : 4 mars 1785\nDomicile en 1857 : Naves\nCorps : 27e régiment de ligne\nGrade : sergent', 'medaille_sh');
        const shp = S5.proposals('medaille_sh', sh, {has: {BIRT: true}});
        assert.equal(shp.award.title, 'Médaille de Sainte-Hélène'); assert.match(shp.award.notes, /27e régiment/); assert.ok(shp.events.find(e => e.tag === 'BIRT').already); assert.ok(shp.events.some(e => e.tag === 'RESI' && e.place === 'Naves'));
        const rp = S5.parseFields('Registre du personnel\nNom : LEROY\nPrénom : Marie\nEntreprise : Filature Motte-Bossut\nEmploi : bobineuse\nDate d’entrée : 3 mars 1905\nDate de sortie : 1912', 'personnel');
        const rpp = S5.proposals('personnel', rp, {has: {}});
        assert.equal(rpp.employer.name, 'Filature Motte-Bossut'); const occ = rpp.events.find(e => e.tag === 'OCCU'); assert.equal(occ.date, 'entre 1905 et 1912'); assert.equal(occ.description, 'bobineuse — Employeur : Filature Motte-Bossut');
        const mt = 'DUPONT Jean, Marie. Né le 3 mars 1880 à Lille (Nord), mort le 4 mai 1944 à Paris ; ouvrier métallurgiste ; militant syndicaliste.';
        assert.equal(S5.detectKind(mt), 'biographie'); const m = S5.parseFields(mt, 'biographie'); assert.equal(m.birth_place, 'Lille (Nord)'); assert.equal(m.death_date, '4 mai 1944');
        assert.ok(S5.proposals('biographie', m, {has: {}}).note.text.includes('militant syndicaliste'));
        const me = 'Фамилия: Петров\nИмя: Иван\nДата рождения: 1899\nДата ареста: 12.08.1937\nПриговор: ВМН\nДата расстрела: 20.10.1937';
        assert.equal(S5.detectKind(me), 'repression');
        const mp = S5.proposals('repression', S5.parseFields(me, 'repression'), {has: {}});
        const ev = mp.events.find(e => e.slug); assert.equal(ev.slug, S5.RESPECT.slugs[0]); assert.ok(mp.events.some(e => e.tag === 'DEAT' && e.date === '20.10.1937'));
        const ms = S5.proposals('mort_service', {last: 'Martin', death_date: '3 juin 1925', death_place: 'Laroche', circumstances: 'accident de manœuvre'}, {service: 'cheminot'});
        assert.equal(ms.events[0].description, 'Mort en service (cheminot) — accident de manœuvre');
    });
    await t('liens collés et photographes', () => {
        assert.deepEqual(['fs_tree', 'LZ2K-8QF'], [S5.parseLink('https://www.familysearch.org/tree/person/details/LZ2K-8QF').site, S5.parseLink('https://www.familysearch.org/tree/person/details/LZ2K-8QF').fsId]);
        assert.equal(S5.parseLink('https://www.wikitree.com/wiki/Dupont-1234').wikitreeId, 'Dupont-1234');
        assert.equal(S5.parseLink('https://www.fichierorigine.com/recherche?numero=240456').numero, '240456');
        assert.equal(S5.parseLink('javascript:alert(1)').site, '');
        assert.deepEqual(S5.photographerPeriod('Atelier actif de 1862 à 1895, 12 rue Nationale'), {from: 1862, to: 1895});
        assert.deepEqual(S5.photographerPeriod('Photographe (1870-1885)'), {from: 1870, to: 1885});
        assert.deepEqual(S5.photographerPeriod('rien'), {from: 0, to: 0});
    });

    /* ═════ 2. aucune requête vers ces sites ═════ */
    await t('aucune requête sortante : le code ne fait que fabriquer des adresses', () => {
        const core = fs.readFileSync(path.join(appRoot, 'assets/js/app-sources-ouvertes-5-core.js'), 'utf8');
        const ui = fs.readFileSync(path.join(appRoot, 'assets/js/heritage-sources-ouvertes-5.js'), 'utf8');
        assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|new Image|<img[^>]+https?:/.test(core), 'le cœur ne lit rien');
        const fetches = [...ui.matchAll(/fetch\(\s*([^,)]+)/g)].map(m => m[1].trim());
        assert.deepEqual(fetches, ["'api.php?action=so5_import'"], 'seul l’envoi à l’app elle-même');
        assert.ok(!/XMLHttpRequest|sendBeacon/.test(ui));
        const php = fs.readFileSync(path.join(appRoot, 'lib/sources_ouvertes_5.php'), 'utf8');
        assert.ok(!/curl_|file_get_contents\(\s*['"]?https?|fopen\(\s*['"]?https?|stream_context|fsockopen|http_get/i.test(php), 'le serveur ne se connecte à rien');
    });

    /* ═════ 3. l'API ═════ */
    const phpPath = findPhp([devBundledPhp()]);
    if (!phpPath) { console.log('— PHP absent : partie serveur sautée'); return finish(); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-so5-'));
    const dir = path.join(tmp, 'a'); fs.mkdirSync(path.join(dir, 'media'), {recursive: true});
    const envFor = d => ({...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1'});
    const php = code => spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], {cwd: appRoot, encoding: 'utf8', env: envFor(dir)});
    const r = php(String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' AND COALESCE(scope,'person')='person' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,is_start,living_status,familysearch_id) VALUES(1,'Jean','MOURGUE','male',1,'deceased',''),(2,'Pierre','TREMBLAY','male',0,'deceased','AAAA-111'),(3,'Marie','LEROY','female',0,'deceased',''),(4,'Ivan','PETROV','male',0,'deceased','')");
$pdo->exec("INSERT INTO places(id,name,county,country) VALUES(1,'Naves','Corrèze','France')");
$ev = $pdo->prepare('INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES(?,?,?,?,?,?)');
$ev->execute(['person',1,$t('BIRT'),'4 mars 1785',1785,1]);
$pdo->exec("INSERT INTO employer_records(key,name,data_json) VALUES('filature motte-bossut','Filature Motte-Bossut','{\"history\":[{\"date\":\"1843\",\"text\":\"Fondation\"}]}')");
echo 'ok';`);
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
        const post = async (action, body, token = csrf) => { const x = await fetch(`${base}api.php?action=${action}`, {method: 'POST', headers: {Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': token}, body: JSON.stringify({...body, csrf: token})}); return {status: x.status, body: await x.json().catch(() => ({})), result: null}; };
        const imp = async (data, file = null, token = csrf) => {
            const fd = new FormData(); if (file) fd.append('file', new Blob([file.bytes], {type: file.type}), file.name);
            fd.append('data', JSON.stringify(data)); fd.append('csrf', token);
            const x = await fetch(`${base}api.php?action=so5_import`, {method: 'POST', body: fd, headers: {Cookie: cookie, 'X-CSRF-Token': token}});
            const j = await x.json().catch(() => ({})); return {status: x.status, body: j, result: j.result};
        };
        const q1 = sql => JSON.parse(php(`require 'lib/bootstrap.php'; echo json_encode(db()->query(${JSON.stringify(sql)})->fetchAll(PDO::FETCH_ASSOC));`).stdout || '[]');
        const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
        const shF = {last: 'Mourgue', first: 'Jean', birth_date: '4 mars 1786', residence: 'Naves', unit: '27e de ligne', rank: 'sergent'};
        const shPr = S5.proposals('medaille_sh', shF, {has: {BIRT: true}});

        await t('API : « c’est la même personne ? » — écarts, naissance déjà sur la fiche, rien n’est écrit', async () => {
            const pv = await post('so5_preview', {kind: 'medaille_sh', site: 'sainte_helene', person_id: 1, fields: {...shF, birth_date: '1795'}});
            assert.equal(pv.status, 200, JSON.stringify(pv.body));
            const txt = pv.body.result.ecarts.map(e => e.text).join('\n');
            assert.match(txt, /Né\(e\) en 1795 d’après le document, en 1785/); assert.match(txt, /naissance de la fiche .*gardée/i);
            assert.deepEqual(pv.body.result.person.has, {BIRT: true});
            assert.equal(q1('SELECT count(*) n FROM sources')[0].n, 0, 'rien n’est écrit');
        });
        let shBatch = '';
        await t('API : Sainte-Hélène (image) — naissance gardée, médaille dans « Concours et récompenses », domicile de 1857, source avec lien et mention', async () => {
            const res = await imp({kind: 'medaille_sh', site: 'sainte_helene', person_id: 1, url: 'https://www.stehelene.org/fiche?id=42', fields: shF,
                events: shPr.events.map(e => ({...e, checked: true})), award: {...shPr.award, checked: true}}, {bytes: PNG, type: 'image/png', name: 'medaille.png'});
            assert.equal(res.status, 200, JSON.stringify(res.body)); shBatch = res.result.batch; assert.match(shBatch, /^so5-[0-9a-f]{12}$/);
            assert.match(res.result.summary, /naissance déjà sur la fiche, gardée/);
            assert.equal(q1("SELECT count(*) n FROM events WHERE person_id=1 AND event_type_id IN (SELECT id FROM event_types WHERE gedcom_tag='BIRT')")[0].n, 1, 'pas de deuxième naissance');
            assert.equal(q1("SELECT count(*) n FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=1 AND t.gedcom_tag='RESI'")[0].n, 1);
            assert.match(JSON.stringify(q1('SELECT type_key, title FROM items')), /"award","title":"Médaille de Sainte-Hélène"/);
            const src = q1('SELECT title, url, text FROM sources')[0]; assert.equal(src.url, 'https://www.stehelene.org/fiche?id=42'); assert.match(src.text, /à vérifier sur le document/);
            assert.equal(q1('SELECT count(*) n FROM media')[0].n, 1);
            assert.equal(q1("SELECT kind FROM so_imports")[0].kind, 'so5:medaille_sh', 'la table commune des archives en ligne');
        });
        await t('API : ↶ Annuler — média, source, événement, médaille s’en vont ; deux fois = refusé', async () => {
            const u = await post('so5_undo', {batch: shBatch}); assert.equal(u.status, 200, JSON.stringify(u.body));
            assert.equal(q1('SELECT count(*) n FROM items')[0].n, 0); assert.equal(q1('SELECT count(*) n FROM sources')[0].n, 0); assert.equal(q1('SELECT count(*) n FROM media')[0].n, 0);
            assert.equal(q1('SELECT count(*) n FROM events WHERE person_id=1')[0].n, 1, 'seule la naissance d’avant reste');
            assert.equal((await post('so5_undo', {batch: shBatch})).status, 422);
        });
        await t('API : Fichier Origine → baptême, départ vers la Nouvelle-France ; identifiant FamilySearch gardé ; ↶ Annuler', async () => {
            const f = {numero: '240456', last: 'Tremblay', first: 'Pierre', birth_date: '23 janvier 1626', birth_place: 'Randonnai (Orne)', marriage_place: 'Québec'};
            const pr = S5.proposals('origine', f, {has: {}});
            const res = await imp({kind: 'origine', site: 'fichier_origine', person_id: 2, url: 'https://www.fichierorigine.com/recherche?numero=240456', fields: f, events: pr.events, voyage: {...pr.voyage, checked: true}, fs_id: 'ZZZZ-999'});
            assert.equal(res.status, 200, JSON.stringify(res.body));
            assert.match(res.result.summary, /voyage ajouté/); assert.match(res.result.summary, /identifiant FamilySearch de la fiche gardé/);
            const v = q1('SELECT destination, passenger_list_ref, passenger_list_url FROM person_voyages WHERE person_id=2')[0];
            assert.equal(v.destination, 'Québec'); assert.match(v.passenger_list_ref, /240456/); assert.match(v.passenger_list_url, /numero=240456/);
            assert.equal(q1('SELECT familysearch_id f FROM persons WHERE id=2')[0].f, 'AAAA-111');
            assert.equal(q1("SELECT count(*) n FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=2 AND t.gedcom_tag='CHR'")[0].n, 1);
            assert.equal((await post('so5_undo', {batch: res.result.batch})).status, 200);
            assert.equal(q1('SELECT count(*) n FROM person_voyages')[0].n, 0); assert.equal(q1('SELECT count(*) n FROM events WHERE person_id=2')[0].n, 0);
        });
        await t('API : registre du personnel → métier « Employeur : … », ligne chez l’employeur existant, la personne sur sa fiche ; identifiant FamilySearch noté si vide ; ↶ Annuler', async () => {
            const f = {last: 'Leroy', first: 'Marie', employer: 'Filature Motte-Bossut', job: 'bobineuse', entry: '3 mars 1905', exit: '1912'};
            const pr = S5.proposals('personnel', f, {has: {}});
            const res = await imp({kind: 'personnel', site: 'anmt', person_id: 3, fields: f, events: pr.events, employer: {...pr.employer, checked: true}, fs_id: 'LZ2K-8QF', text: 'Registre du personnel'});
            assert.equal(res.status, 200, JSON.stringify(res.body));
            const rec = JSON.parse(q1("SELECT data_json FROM employer_records WHERE key='filature motte-bossut'")[0].data_json);
            assert.equal(rec.history.length, 2); assert.match(rec.history[1].text, /bobineuse/);
            const emp = await get('employer_record', {name: 'Filature Motte-Bossut'});
            assert.ok((emp.people || []).some(p => Number(p.id) === 3), 'Marie LEROY dans « La famille chez cet employeur »');
            assert.equal(q1('SELECT familysearch_id f FROM persons WHERE id=3')[0].f, 'LZ2K-8QF');
            assert.equal((await post('so5_undo', {batch: res.result.batch})).status, 200);
            assert.equal(JSON.parse(q1("SELECT data_json FROM employer_records WHERE key='filature motte-bossut'")[0].data_json).history.length, 1);
            assert.equal(q1('SELECT familysearch_id f FROM persons WHERE id=3')[0].f, '');
            // un employeur inconnu : sa fiche est créée, puis retirée par ↶ Annuler
            const res2 = await imp({kind: 'personnel', site: 'anmt', person_id: 3, fields: {...f, employer: 'Tissage Leclercq'}, events: [], employer: {name: 'Tissage Leclercq', line: 'Marie LEROY', checked: true}, text: 'x'});
            assert.equal(q1("SELECT count(*) n FROM employer_records WHERE key='tissage leclercq'")[0].n, 1);
            await post('so5_undo', {batch: res2.result.batch}); assert.equal(q1("SELECT count(*) n FROM employer_records WHERE key='tissage leclercq'")[0].n, 0);
        });
        await t('API : Maitron → note ; Memorial → « Répression politique (URSS) », jamais dans un jeu', async () => {
            const mt = await imp({kind: 'biographie', site: 'maitron', person_id: 3, fields: {name: 'Marie LEROY', text: 'LEROY Marie. Ouvrière du textile, militante.'}, note: {title: 'Notice du Maitron', text: 'Ouvrière du textile, militante.', checked: true}});
            assert.equal(mt.status, 200, JSON.stringify(mt.body)); assert.equal(q1("SELECT count(*) n FROM notes WHERE entity_type='person' AND entity_id=3")[0].n, 1);
            const me = S5.proposals('repression', {last: 'Petrov', first: 'Ivan', arrest_date: '12.08.1937', sentence: 'ВМН', death_date: '20.10.1937'}, {has: {}});
            const res = await imp({kind: 'repression', site: 'memorial_urss', person_id: 4, fields: {last: 'Petrov', first: 'Ivan', text: 'Memorial'}, events: me.events});
            assert.equal(res.status, 200, JSON.stringify(res.body));
            assert.deepEqual(JSON.parse(php(`require 'lib/bootstrap.php'; echo json_encode(array_keys(so5_respect_ids(db())));`).stdout), [4]);
            const ms = await get('mode_simple_data'); const four = (ms.persons || ms.people || []).find(x => Number(x.id) === 4);
            if (four) assert.equal(four.mem, 1, 'marqué « mem » pour les jeux');
        });
        await t('API : refus — sans fiche, sans rien, sorte inconnue, mauvais jeton', async () => {
            assert.equal((await imp({kind: 'acte', person_id: 0, text: 'x'})).status, 422);
            assert.equal((await imp({kind: 'acte', person_id: 1})).status, 422, 'il faut un fichier, un lien ou un texte');
            assert.equal((await imp({kind: 'zzz', person_id: 1, text: 'x'})).status, 422);
            assert.notEqual((await imp({kind: 'acte', person_id: 1, text: 'abc'}, null, 'mauvais')).status, 200);
            assert.notEqual((await post('so5_undo', {batch: 'so5-x'}, 'mauvais')).status, 200);
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
                await p.waitForFunction(() => window.LCNDA_APP?.state && window.LCNDA_EXT?.sourcesOuvertes5 && window.LCNDA_SOURCES_OUVERTES_5, null, {timeout: 60000});
                if (dark) await p.evaluate(() => { const A = window.LCNDA_APP; localStorage.setItem('genealogie-design', JSON.stringify({...A.readDesignSettings(), preset: 'dark'})); A.applyDesign(); });
                const noScroll = async () => { const sw = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert.ok(sw <= 0, `défilement horizontal : ${sw}`); };
                await t(`${name} : 🌍 fenêtre de recherche — rubriques, C1, pastilles, adresses montrées = adresses ouvertes, copier le nom`, async () => {
                    await p.evaluate(() => window.LCNDA_EXT.sourcesOuvertes5.openSearch({personId: 1}));
                    await p.waitForSelector('dialog.so5-search[open] [data-so5-links] .so5-link');
                    assert.equal(await p.inputValue('dialog.so5-search [name=last]'), 'MOURGUE');
                    const links = await p.$$eval('dialog.so5-search a[data-so5-go]', as => as.map(a => [a.getAttribute('href'), a.closest('.so-link').querySelector('.so-url').textContent, a.target]));
                    assert.ok(links.length >= 6); links.forEach(([h, shown, tg]) => { assert.equal(h, shown); assert.equal(tg, '_blank'); });
                    assert.ok(await p.$('dialog.so5-search .ui-search-input'), 'case C1');
                    await p.selectOption('dialog.so5-search [name=so5_where]', 'emigration');
                    await p.fill('dialog.so5-search [data-so5-q]', 'castle');
                    assert.deepEqual(await p.$$eval('dialog.so5-search .so5-link', l => l.map(x => x.dataset.so5Site)), ['castle_garden']);
                    await p.click('dialog.so5-search [data-so5-copy="castle_garden"]');
                    assert.match((await p.evaluate(() => window.__opened))[0], /^https:\/\/www\.castlegarden\.org\/searcher\.php\?lastname=MOURGUE&firstname=Jean$/);
                    await p.fill('dialog.so5-search [data-so5-q]', '');
                    await p.selectOption('dialog.so5-search [name=so5_where]', 'fiche');
                    assert.ok(!await p.$('dialog.so5-search [data-so5-group="urss"]'), 'né en 1785 : ni Pamyat Naroda ni Memorial');
                    await p.click('dialog.so5-search [data-so5-group="quebec"]');
                    assert.deepEqual(await p.$$eval('dialog.so5-search .so5-link', l => l.map(x => x.dataset.so5Site)), ['fichier_origine', 'cea_acadie']);
                    await p.click('dialog.so5-search [data-so5-group=""]');
                    await noScroll(); await shot(p, `so5-chercher-${name}.png`);
                });
                await t(`${name} : ⚙️ Adresses des sites — rubriques repliables, C1, gardé tout de suite (K2)`, async () => {
                    await p.click('dialog.so5-search [data-so5-settings]');
                    await p.waitForSelector('dialog.so5-settings[open] details.so5-rub');
                    assert.equal(await p.$$eval('dialog.so5-settings details.so5-rub', d => d.length), S5.GROUPS.length);
                    await p.fill('dialog.so5-settings [data-so5-sq]', 'cheminots');
                    assert.equal(await p.$$eval('dialog.so5-settings details.so5-rub:not([hidden])', d => d.length), 1);
                    await p.fill('dialog.so5-settings input[name=memorial_cheminots]', 'https://memorial.exemple.fr/?nom={nom}');
                    await p.waitForTimeout(700);
                    assert.match(await p.evaluate(() => localStorage.getItem('genealogie-sources-ouvertes-5-sites') || ''), /nom=\{nom\}/);
                    await shot(p, `so5-adresses-${name}.png`);
                    await p.click('dialog.so5-settings [data-ui-reset]'); await p.waitForTimeout(300);
                    await p.click('dialog.so5-settings .modal-actions [data-ui-x]');
                    await p.click('dialog.so5-search .modal-head [data-x]');
                });
                await t(`${name} : 📋 coller une fiche Castle Garden → import (cases, voyage proposé, même personne ?) → « ↶ Annuler »`, async () => {
                    await p.evaluate(() => window.LCNDA_EXT.sourcesOuvertes5.openPasteText({personId: 1}));
                    await p.fill('dialog.so5-paste [name=text]', 'Castle Garden\nLast name: MOURGUE\nFirst name: Jean\nAge: 30\nOccupation: farmer\nShip: Hammonia\nPort of departure: Le Havre\nArrival date: 12 May 1866');
                    await p.click('dialog.so5-paste button[type=submit]');
                    await p.waitForSelector('dialog.k-import [data-so5-imp] .so5-fields');
                    assert.equal(await p.inputValue('dialog.k-import [name=so5_kind]'), 'passager');
                    assert.equal(await p.inputValue('dialog.k-import .so5-fields [name=ship]'), 'Hammonia');
                    assert.ok(await p.$('dialog.k-import [data-so5-on="voyage"]:checked'));
                    assert.ok(!/Naissance/.test(await p.textContent('dialog.k-import [data-so5-props]')), 'naissance déjà sur la fiche : pas de « né vers »');
                    await p.waitForSelector('dialog.k-import .so-ecart');
                    await noScroll(); await shot(p, `so5-import-${name}.png`);
                    await p.click('dialog.k-import [data-k-go]');
                    await p.waitForSelector('dialog.k-import', {state: 'detached'});
                    await p.waitForFunction(() => /Liste de passagers/.test(document.body.textContent) && /Annuler/.test(document.body.textContent));
                    assert.equal(q1('SELECT count(*) n FROM person_voyages WHERE person_id=1')[0].n, 1);
                    await shot(p, `so5-import-fait-${name}.png`);
                    const undo = p.locator('button', {hasText: 'Annuler'}).last(); await undo.click();
                    await p.waitForTimeout(800);
                    assert.equal(q1('SELECT count(*) n FROM person_voyages WHERE person_id=1')[0].n, 0, '↶ Annuler retire le voyage');
                });
                await t(`${name} : « Chercher sur internet » — sites ajoutés dans leurs rubriques, cachés au départ, avec les autres lots`, async () => {
                    const r2 = await p.evaluate(() => { const A = window.LCNDA_APP; const all = A.webSearchAllSites(); const s = A.webSearchSettings(); const mine = all.filter(x => x[0].startsWith('so5_'));
                        return {n: mine.length, hidden: mine.every(x => s.hidden.includes(x[0])), groups: A.webSearchGroups.slice(), keys: all.map(x => x[0]), href: mine.find(x => x[0] === 'so5_fichier_origine')[3]({first: 'Pierre', last: 'Tremblay', place: 'Randonnai'})}; });
                    assert.ok(r2.n >= 12 && r2.hidden); assert.ok(r2.groups.includes('Canada — Québec et Acadie')); assert.ok(r2.groups.indexOf('Russie et URSS') < r2.groups.indexOf('Autres'));
                    assert.equal(new Set(r2.keys).size, r2.keys.length, 'aucune clé en double');
                    assert.match(r2.href, /nom=Tremblay&prenom=Pierre/);
                });
                await t(`${name} : « Mes sites » — rubrique, icône, 🧪 Essayer, ajout avec ↶ Annuler, 💾 Réglages enregistrés`, async () => {
                    await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'design_sheets'; A.state.regATab = {design_sheets: 'Internet'}; A.setModule('maintenance'); });
                    await p.waitForSelector('[data-ws-custom] #ws-custom-url', {timeout: 40000, state: 'attached'});
                    await p.waitForTimeout(1500); // la page peut se dessiner deux fois
                    await p.fill('#ws-custom-label', 'Archives du Lot'); await p.fill('#ws-custom-url', 'https://exemple.fr/r?nom={nom}&n={annee_naissance}&x={zzz}');
                    await p.click('[data-ws-custom] button[data-ws-custom-test=""]');
                    await p.waitForSelector('[data-ws-custom] .is-error, [data-ws-custom] [aria-invalid="true"]');
                    await p.fill('#ws-custom-url', 'https://exemple.fr/r?nom={nom}&n={annee_naissance}&d={annee_deces}');
                    await p.fill('#ws-custom-group', 'Lot'); await p.fill('#ws-custom-icon', '🏛');
                    await p.click('[data-ws-custom] button[data-ws-custom-test=""]');
                    await p.waitForSelector('[data-ws-custom] .so5-test a');
                    assert.match(await p.$eval('[data-ws-custom] .so5-test a', a => a.getAttribute('href')), /^https:\/\/exemple\.fr\/r\?nom=(Dupont|MOURGUE)&n=(1850|1785)&d=\d*$/);
                    const before = await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-web-search-custom') || '[]').length);
                    await p.click('#ws-custom-add');
                    await p.waitForSelector('[data-ws-custom-row]', {state: 'attached'});
                    const list = await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-web-search-custom')));
                    assert.equal(list.length, before + 1, 'un seul ajout'); const added = list.at(-1); assert.equal(added.group, 'Lot'); assert.equal(added.icon, '🏛');
                    const site = await p.evaluate(() => { const s = window.LCNDA_APP.webSearchAllSites().filter(x => x[0].startsWith('custom-')).at(-1); return [s[1], s[2], s[3]({first: 'Jean', last: 'Mourgue', birthYear: 1785, deathYear: 1860})]; });
                    assert.deepEqual(site, ['🏛 Archives du Lot', 'Lot', 'https://exemple.fr/r?nom=Mourgue&n=1785&d=1860']);
                    await p.waitForTimeout(1200);
                    await p.waitForSelector('[data-ws-custom-presets] .ui-presets');
                    if (!await p.$('[data-ws-custom-presets] [data-ps-new]')) await p.click('[data-ws-custom-presets] [data-ps-toggle]'); // ouvert ou fermé : retenu (et synchronisé)
                    await p.click('[data-ws-custom-presets] [data-ps-new]');
                    await p.fill('[data-ws-custom-presets] [data-ps-name]', `Sites du Lot ${name}`); await p.click('[data-ws-custom-presets] [data-ps-ok]'); await p.waitForTimeout(300);
                    const pr = await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-web-search-custom-presets')));
                    assert.equal(pr.at(-1).name, `Sites du Lot ${name}`); assert.equal(pr.at(-1).data.at(-1).url, 'https://exemple.fr/r?nom={nom}&n={annee_naissance}&d={annee_deces}');
                    await p.$eval('[data-ws-custom]', e => e.scrollIntoView({block: 'center'})); await noScroll(); await shot(p, `so5-mes-sites-${name}.png`);
                    await p.click(`[data-ws-custom-delete="${added.key}"]`); await p.waitForTimeout(800); // Supprimer (H7, ↶ Annuler)
                    assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-web-search-custom') || '[]').length), before);
                });
                await t(`${name} : 📷 le photographe → ses années dans « Dater une vieille photo »`, async () => {
                    await p.evaluate(() => { const ws = document.getElementById('workspace'); const d = document.createElement('div'); d.id = 'so5-ph-test'; d.innerHTML = '<form data-ph><label>Photographe ou date notée : de<input type="number" name="lo"></label><label>à<input type="number" name="hi"></label><label>Lieu<input name="where" value="Tulle"></label></form>'; ws.prepend(d); });
                    await p.waitForSelector('#so5-ph-test [data-so5-photo]', {state: 'attached'});
                    await p.$eval('#so5-ph-test [data-so5-photo]', b => b.click());
                    await p.waitForSelector('dialog.so5-photo[open] .so5-link');
                    assert.equal(await p.inputValue('dialog.so5-photo [name=place]'), 'Tulle');
                    await p.fill('dialog.so5-photo [name=photographer]', 'Nadar');
                    await p.fill('dialog.so5-photo [name=said]', 'Atelier actif de 1862 à 1895');
                    assert.match(await p.textContent('dialog.so5-photo [data-so5-ph-read]'), /Compris : actif de 1862 à 1895/);
                    await shot(p, `so5-photographe-${name}.png`);
                    await p.click('dialog.so5-photo [data-so5-ph-use]');
                    assert.equal(await p.inputValue('#so5-ph-test [name=lo]'), '1862'); assert.equal(await p.inputValue('#so5-ph-test [name=hi]'), '1895');
                    await p.evaluate(() => document.getElementById('so5-ph-test').remove());
                });
                await ctx.close();
            }
            await t('navigateur : aucune erreur, aucune requête vers un autre site', () => {
                assert.deepEqual(errors, []);
                const hosts = new Set(S5.SITES.flatMap(x => [x.home, x.search, S5.url(x.key, P)].filter(Boolean).map(u => new URL(u).hostname)));
                assert.deepEqual(external.filter(u => hosts.has(new URL(u).hostname) || /google\.com\/search|exemple\.fr/.test(u)), [], 'aucune requête vers ces sites (les tuiles de carte ne comptent pas)');
            });
        } finally { await browser.close(); }
    } finally {
        proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
        finish();
    }
})();
