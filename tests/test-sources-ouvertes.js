'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🗂 Archives en ligne (Mémoire des hommes, Léonore, registres matricules, presse ancienne) :   node tests/test-sources-ouvertes.js
 *  1. calculs purs (app-sources-ouvertes-core.js) : adresses construites et encodées (accents, &, guillemets), modèles de
 *     « ⚙️ Adresses des sites » (et refus de javascript:), classe de recrutement, liens collés reconnus, page enregistrée (texte
 *     seul), texte copié d'une fiche, personne peut-être vivante ;
 *  2. aucune requête sortante de l'app (code serveur et navigateur) : seulement des adresses ouvertes par la personne ;
 *  3. l'API sur une petite base inventée : contexte (département, archives), « c'est la même personne ? », imports →
 *     médias / sources / événement / case MPF / bloc Poilu / récompense / bloc Militaire / passage presse ; rien n'est écrasé ;
 *     ↶ Annuler remet tout ; CSRF, fiche verrouillée, fichiers refusés ;
 *  4. le navigateur (Playwright ; sinon sauté) à 1440 px, 390 px et en sombre : boutons des blocs, fenêtre de recherche
 *     (adresse affichée = adresse ouverte), import d'une image avec « ↶ Annuler », sans erreur ni défilement horizontal.
 * Captures : SHOTS=dossier node tests/test-sources-ouvertes.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const SO = require('../assets/js/app-sources-ouvertes-core.js');
const SHOTS = process.env.SHOTS || '';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const ARCHIVE_HOSTS = /memoiredeshommes|leonore\.archives|gallica\.bnf|retronews|europeana|francearchives|culture\.fr|google\.com/;

let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const finish = () => { if (failed) { console.error(`\n${failed} échec(s)`); process.exit(1); } console.log('\nTout est bon.'); };

(async () => {
    /* ═════ 1. calculs purs ═════ */
    await t('adresses : remplies, encodées, rien de dangereux', () => {
        const p = {first: 'Léon Marie', last: 'Dupré & Fils', place: 'Saint-Étienne, Loire', y1: 1920, y2: 1890, birthYear: 1892, unit: '152e régiment d’infanterie', adUrl: 'https://archives.example.fr/etat-civil/recherche?x=1'};
        const g = new URL(SO.url('gallica', p));
        assert.equal(g.origin + g.pathname, 'https://gallica.bnf.fr/services/engine/search/sru');
        const q = g.searchParams.get('query');
        assert.ok(q.includes('(gallica all "Léon Dupré & Fils")'), q);
        assert.ok(q.includes('dc.type all "fascicule"') && q.includes('(gallica all "Saint-Étienne")'), 'presse + lieu (sans le département)');
        assert.ok(q.includes('gallicapublication_date>="1890/01/01"') && q.includes('gallicapublication_date<="1920/12/31"'), 'années remises dans l’ordre');
        assert.ok(/Dupr%C3%A9%20%26%20Fils/.test(SO.url('gallica', p)), 'é, & et espace encodés');
        assert.ok(!SO.url('gallica', {...p, withFirst: false}).includes('L%C3%A9on'), 'sans le prénom');
        const r = SO.url('retronews', p); assert.ok(r.startsWith('https://www.retronews.fr/search#allTerms=%22L%C3%A9on%20Dupr%C3%A9%20%26%20Fils%22'), r);
        assert.equal(SO.site('retronews').paid, true, 'RetroNews est signalé en partie payant');
        const e = new URL(SO.url('europeana', p)); assert.equal(e.searchParams.get('qf'), 'TYPE:"TEXT"'); assert.ok(e.searchParams.get('query').includes('Dupré & Fils'));
        const fa = new URL(SO.url('francearchives_noms', p)); assert.equal(fa.pathname, '/fr/basedenoms');
        assert.equal(fa.searchParams.get('es_names'), 'Dupré & Fils'); assert.equal(fa.searchParams.get('es_forenames'), 'Léon'); assert.equal(fa.searchParams.get('es_locations'), 'Saint-Étienne');
        for (const k of ['mdh_mpf1418', 'mdh_mpf3945', 'mdh_sepultures', 'mdh_hors_mpf', 'mdh_marins', 'leonore']) {
            const u = new URL(SO.url(k, p)); assert.equal(u.hostname, 'www.google.com', k);
            assert.ok(/^site:(memoiredeshommes\.sga\.defense\.gouv\.fr|leonore\.archives-nationales\.culture\.gouv\.fr) "Dupré & Fils" "Léon"/.test(u.searchParams.get('q')), u.searchParams.get('q'));
        }
        assert.ok(new URL(SO.url('mdh_jmo', p)).searchParams.get('q').includes('"152e régiment d’infanterie" journal des marches'));
        assert.equal(SO.url('mdh_jmo', {last: 'X'}), '', 'sans unité, pas de journal de marche');
        assert.equal(SO.url('matricules_ad', p), 'https://archives.example.fr/', 'la racine du site des archives');
        assert.equal(SO.url('matricules_ad', {adUrl: 'javascript:alert(1)'}), '');
        for (const s of SO.SITES) { const u = SO.url(s.key, {...p, last: '<script>"x y'}); assert.ok(!u || !/[<>"\s]/.test(u), `${s.key} : ${u}`); }
    });
    await t('« ⚙️ Adresses des sites » : modèle écrit à la main, javascript: refusé', () => {
        const p = {first: 'Jean', last: 'Martin', place: 'Tulle', y1: 1900, y2: 1914, birthYear: 1892, unit: '126e RI', dept: '19'};
        assert.equal(SO.url('leonore', p, {leonore: 'https://exemple.org/leonore?nom={nom}&prenom={prénom}&classe={classe}&dep={département}'}), 'https://exemple.org/leonore?nom=Martin&prenom=Jean&classe=1912&dep=19');
        assert.equal(SO.url('gallica', p, {gallica: 'https://ex.org/?q={nom_complet}&de={de}&a={à}&u={unité}'}), 'https://ex.org/?q=Jean%20Martin&de=1900&a=1914&u=126e%20RI');
        assert.ok(SO.url('leonore', p, {leonore: 'javascript:alert({nom})'}).startsWith('https://www.google.com/'), 'modèle dangereux : l’adresse de l’app');
        assert.equal(SO.fill('https://x.org/{inconnu}/{nom}', {last: 'A B'}), 'https://x.org/{inconnu}/A%20B');
    });
    await t('classe de recrutement : naissance + 20 ans, avec la phrase qui l’explique', () => {
        const c = SO.classOf(1892); assert.equal(c.classe, 1912); assert.ok(c.inRange); assert.match(c.text, /1892 \+ 20 = 1912/);
        assert.match(SO.classOf(1820).text, /pas encore de registre matricule/);
        assert.match(SO.classOf(1950).text, /pas encore en ligne/);
        assert.equal(SO.classOf('').classe, 0);
    });
    await t('lien collé : Gallica, RetroNews, Léonore, Mémoire des hommes, Europeana', () => {
        const g = SO.parseLink('https://gallica.bnf.fr/ark:/12148/bpt6k123456x/f3.item.r=Dupont');
        assert.equal(g.site, 'gallica'); assert.equal(g.ark, 'bpt6k123456x'); assert.equal(g.page, '3');
        assert.equal(SO.parseLink('https://gallica.bnf.fr/ark:/12148/cb32895690j/date19050512').date, '12 mai 1905');
        const r = SO.parseLink('https://www.retronews.fr/journal/le-petit-journal/12-mai-1905/123/456789/3');
        assert.equal(r.site, 'retronews'); assert.equal(r.journal, 'Le Petit Journal'); assert.equal(r.date, '12 mai 1905'); assert.equal(r.page, '3');
        assert.equal(SO.parseLink('https://www.leonore.archives-nationales.culture.gouv.fr/ui/notice/123456').notice, '123456');
        assert.equal(SO.parseLink('https://www.memoiredeshommes.sga.defense.gouv.fr/fr/ark:/40699/m005239dc3d8f1b3').site, 'mdh');
        assert.equal(SO.parseLink('https://www.europeana.eu/fr/item/9200338/BibliographicResource_3000113').site, 'europeana');
        assert.equal(SO.parseLink('javascript:alert(1)').url, '');
        assert.equal(SO.cleanUrl('https://x.org/a"onmouseover=1'), '');
    });
    await t('page enregistrée : titre, adresse d’origine, texte seul (pas de script, pas de HTML)', () => {
        const html = `<!DOCTYPE html><!-- saved from url=(0058)https://www.retronews.fr/journal/le-temps/3-juin-1910/1/2/4 --><html><head><title>Le Temps &amp; vous – 3 juin 1910</title><script>alert(1)</script><style>p{}</style></head>
            <body><p>M. Jean <b>Dupont</b>, de Tulle,</p><p>a été décoré.&nbsp;&#8217;</p><img src=x onerror=alert(1)></body></html>`;
        const pg = SO.parseSavedPage(html);
        assert.equal(pg.title, 'Le Temps & vous – 3 juin 1910'); assert.equal(pg.url, 'https://www.retronews.fr/journal/le-temps/3-juin-1910/1/2/4');
        assert.ok(pg.text.includes('M. Jean Dupont , de Tulle,') || pg.text.includes('M. Jean Dupont, de Tulle,'), pg.text);
        assert.ok(!/alert|<|onerror/.test(pg.text), pg.text);
        assert.equal(SO.parseSavedPage('<link rel="canonical" href="https://gallica.bnf.fr/ark:/12148/bpt6k1"><title>x</title>').url, 'https://gallica.bnf.fr/ark:/12148/bpt6k1');
    });
    await t('texte copié d’une fiche : les cases reconnues', () => {
        const m = SO.parseFields('Nom : DUPONT\nPrénoms : Jean Marie\nDate de naissance : 12/03/1892\nLieu de naissance : Tulle (Corrèze)\nGrade : soldat\nUnité : 126e régiment d’infanterie\nDate de décès\n20/08/1914\nLieu de décès : Maissin (Belgique)\nGenre de mort : tué à l’ennemi\nMention : Mort pour la France', 'mdh');
        assert.equal(m.last, 'Dupont'); assert.equal(m.first, 'Jean Marie'); assert.equal(m.death_date, '20/08/1914'); assert.equal(m.death_place, 'Maissin (Belgique)');
        assert.equal(m.unit, '126e régiment d’infanterie'); assert.equal(m.cause, 'tué à l’ennemi'); assert.equal(m.mpf, 'yes');
        const l = SO.parseFields('Nom : Martin\nPrénoms : Paul\nCote LH/1758/42\nGrade : chevalier', 'leonore');
        assert.equal(l.cote, 'LH/1758/42'); assert.equal(l.grade, 'chevalier');
        const r = SO.parseFields('Numéro matricule : 1234\nClasse : 1912\nCheveux : châtains\nYeux : gris\nTaille : 1 m 68\nCampagnes : contre l’Allemagne du 2 août 1914 au 20 août 1914', 'matricule');
        assert.equal(r.matricule, '1234'); assert.equal(r.classe_mobilisation, '1912'); assert.equal(r.cheveux, 'châtains'); assert.equal(r.taille, '1 m 68'); assert.ok(r.campagnes.startsWith('contre'));
    });
    await t('vie privée : une personne peut-être vivante est repérée', () => {
        assert.equal(SO.livingRisk({living_status: 'living'}), true);
        assert.equal(SO.livingRisk({birth_year: 1990}, 2026), true);
        assert.equal(SO.livingRisk({birth_year: 1990, death_year: 2010}, 2026), false);
        assert.equal(SO.livingRisk({birth_year: 1890}, 2026), false);
    });
    await t('aucune requête vers ces sites dans le code (seulement des adresses à ouvrir dans le navigateur)', () => {
        for (const f of ['assets/js/heritage-sources-ouvertes.js', 'assets/js/app-sources-ouvertes-core.js']) {
            const s = fs.readFileSync(path.join(appRoot, f), 'utf8');
            const fetches = [...s.matchAll(/fetch\(\s*([^,)]+)/g)].map(m => m[1].trim());
            assert.ok(fetches.every(x => /^'api\.php/.test(x)), `${f} : ${fetches.join(', ')}`);
            assert.ok(!/XMLHttpRequest|sendBeacon|new Image\(|EventSource|WebSocket/.test(s), f);
        }
        const php = fs.readFileSync(path.join(appRoot, 'lib/sources_ouvertes.php'), 'utf8');
        assert.ok(!/curl_|fsockopen|stream_socket|file_get_contents\(\s*['"]https?|get_headers|SoapClient/.test(php), 'le serveur ne se connecte à rien');
    });

    /* ═════ 3. l'API ═════ */
    const phpPath = findPhp([devBundledPhp()]);
    if (!phpPath) { console.log('— PHP absent : partie serveur sautée'); return finish(); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-so-'));
    const dir = path.join(tmp, 'a'); fs.mkdirSync(path.join(dir, 'media'), {recursive: true});
    const envFor = d => ({...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1'});
    // une famille inventée : Jean DUPONT (1892, Tulle), Paul MARTIN (1870), Louise DUPONT (fiche verrouillée)
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,is_start) VALUES(1,'Jean','DUPONT','male',1),(2,'Paul','MARTIN','male',0),(3,'Louise','DUPONT','female',0)");
$pdo->exec("UPDATE persons SET show_poilu_block=1 WHERE id=1");
$pdo->exec("UPDATE persons SET is_locked=1 WHERE id=3");
$pdo->exec("UPDATE persons SET military_data='{\"cheveux\":\"châtains\",\"services_mutations\":\"Incorporé au 126e RI\"}' WHERE id=2");
$pdo->exec("INSERT INTO places(id,name,county,country) VALUES(1,'Tulle','Corrèze','France'),(2,'Brive','Corrèze','France')");
$ev = $pdo->prepare('INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES(?,?,?,?,?,?)');
foreach ([[1,'BIRT','12 mars 1892',1892,1],[2,'BIRT','1 juin 1870',1870,2],[2,'DEAT','3 mai 1940',1940,2]] as [$pid,$tag,$d,$y,$pl]) { $ev->execute(['person',$pid,$t($tag),$d,$y,$pl]); }
echo 'ok';`], {cwd: appRoot, encoding: 'utf8', env: envFor(dir)});
    if (r.status !== 0 || !String(r.stdout).includes('ok')) { console.error(r.stderr || r.stdout); process.exit(1); }
    const port = Number(process.env.SO_PORT) || await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], {cwd: appRoot, env: envFor(dir), stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    try {
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
        let cookie = '';
        const html = await (await fetch(base).then(x => { cookie = (x.headers.get('set-cookie') || '').split(';')[0]; return x; })).text();
        const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
        const get = async (action, q = {}) => (await fetch(`${base}api.php?action=${action}&${new URLSearchParams(q)}`, {headers: {Cookie: cookie}})).json();
        const post = async (action, body, token = csrf) => { const x = await fetch(`${base}api.php?action=${action}`, {method: 'POST', headers: {Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': token}, body: JSON.stringify({...body, csrf: token})}); return {status: x.status, ...(await x.json())}; };
        const imp = async (data, file = null, token = csrf) => {
            const fd = new FormData(); if (file) fd.append('file', new Blob([file.buf], {type: file.type}), file.name);
            fd.append('data', JSON.stringify(data)); fd.append('csrf', token);
            const x = await fetch(`${base}api.php?action=so_import`, {method: 'POST', headers: {Cookie: cookie, 'X-CSRF-Token': token}, body: fd}); return {status: x.status, ...(await x.json())};
        };
        const php = code => { const o = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require 'lib/paths.php'; $pdo = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC); echo json_encode((function($pdo){ ${code} })($pdo));`], {cwd: appRoot, encoding: 'utf8', env: envFor(dir)}); return JSON.parse(o.stdout); };
        const media = () => fs.readdirSync(path.join(dir, 'media')).filter(f => !f.startsWith('.'));

        await t('API : contexte de la fiche (département, archives, classe), sans rien écrire', async () => {
            const c = await get('so_context', {person_id: 1});
            assert.equal(c.person.last, 'DUPONT'); assert.equal(c.person.birth_year, 1892); assert.equal(c.has_death, false);
            assert.equal(c.dept.code, '19'); assert.equal(c.dept.name, 'Corrèze'); assert.ok(c.dept.root.startsWith('https://'));
            assert.ok(c.depts.length >= 96);
            const z = await get('so_context', {person_id: 0}); assert.equal(z.person, null); assert.ok(z.depts.length >= 96);
            assert.ok((await get('so_context', {person_id: 999})).error);
        });
        await t('API : « c’est la même personne ? » — écarts en phrases, rien n’est écrit', async () => {
            const pv = await post('so_preview', {kind: 'mdh', person_id: 1, fields: {last: 'Durand', first: 'Pierre', birth_date: '1880'}});
            const txt = pv.result.ecarts.map(e => e.text).join(' | ');
            assert.match(txt, /« Durand », la fiche « DUPONT »/); assert.match(txt, /Prénom lu « Pierre »/); assert.match(txt, /Né en 1880 d’après le document, en 1892/);
            const ok = await post('so_preview', {kind: 'mdh', person_id: 1, fields: {last: 'Dupont', first: 'Jean Marie', birth_date: '12/03/1892'}});
            assert.deepEqual(ok.result.ecarts, []);
            const dead = await post('so_preview', {kind: 'mdh', person_id: 2, fields: {}});
            assert.ok(dead.result.ecarts.some(e => /déjà un décès/.test(e.text)));
            assert.equal(php(`return (int) $pdo->query('SELECT count(*) FROM so_imports')->fetchColumn();`), 0);
        });
        let b1 = '';
        await t('API : 🎖 Mémoire des hommes — média, source avec le lien, décès « Mort pour la France », case MPF, unité au bloc Poilu', async () => {
            const before = media().length;
            const res = await imp({kind: 'mdh', person_id: 1, url: 'https://www.memoiredeshommes.sga.defense.gouv.fr/fr/ark:/40699/m005', add_death: true, set_mpf: true, add_unit: true, place_id: '1',
                fields: {last: 'DUPONT', first: 'Jean Marie', death_date: '20 août 1914', cause: 'tué à l’ennemi', unit: '126e régiment d’infanterie', mpf: 'yes', base: 'Morts pour la France 1914-1918', text: 'Nom : DUPONT'}}, {buf: PNG, type: 'image/png', name: 'fiche-mdh.png'});
            assert.equal(res.ok, true, JSON.stringify(res)); b1 = res.result.batch;
            assert.equal(media().length, before + 1, 'le fichier est dans les médias');
            const d = php(`return ['m' => $pdo->query("SELECT m.title, m.media_type, m.document_url FROM media m JOIN media_links l ON l.media_id=m.id AND l.entity_type='person' AND l.entity_id=1")->fetchAll(),
                'src' => $pdo->query("SELECT s.title, s.url, s.agency, s.text FROM sources s JOIN source_links l ON l.source_record_id=s.id AND l.entity_type='person' AND l.entity_id=1")->fetchAll(),
                'ev' => $pdo->query("SELECT e.id, e.date_text, e.description, e.place_id FROM events e JOIN event_types t ON t.id=e.event_type_id AND t.gedcom_tag='DEAT' WHERE e.person_id=1")->fetchAll(),
                'evsrc' => (int) $pdo->query("SELECT count(*) FROM source_links WHERE entity_type='event'")->fetchColumn(),
                'mpf' => $pdo->query('SELECT mort_pour_la_france FROM persons WHERE id=1')->fetchColumn(),
                'unit' => $pdo->query('SELECT unit_name FROM poilu_units WHERE person_id=1')->fetchAll(PDO::FETCH_COLUMN)];`);
            assert.equal(d.m.length, 1); assert.equal(d.m[0].media_type, 'image'); assert.ok(d.m[0].document_url.includes('memoiredeshommes'));
            assert.equal(d.src.length, 1); assert.ok(d.src[0].url.includes('memoiredeshommes')); assert.match(d.src[0].text, /à vérifier/); assert.match(d.src[0].agency, /Mémoire des hommes/);
            assert.equal(d.ev.length, 1); assert.equal(d.ev[0].date_text, '20 août 1914'); assert.match(d.ev[0].description, /^Mort pour la France — tué à l’ennemi/); assert.equal(d.ev[0].place_id, 1);
            assert.equal(d.evsrc, 1, 'la source est aussi sur le décès');
            assert.equal(d.mpf, 'yes'); assert.deepEqual(d.unit, ['126e régiment d’infanterie']);
            // la fiche le montre (bloc Poilu, décès)
            const p = await get('person', {id: 1});
            assert.ok(JSON.stringify(p).includes('126e régiment d’infanterie'));
        });
        await t('API : un 2ᵉ import ne remplace rien (décès gardé, pas de 2ᵉ décès, unité pas en double)', async () => {
            const res = await imp({kind: 'mdh', person_id: 1, url: '', add_death: true, set_mpf: true, add_unit: true, fields: {death_date: '1 janvier 1915', unit: '126E régiment d’infanterie', text: 'autre fiche'}});
            assert.equal(res.ok, true, JSON.stringify(res));
            assert.ok(res.result.notes.some(n => /décès déjà sur la fiche/.test(n)));
            const d = php(`return ['n' => (int) $pdo->query("SELECT count(*) FROM events e JOIN event_types t ON t.id=e.event_type_id AND t.gedcom_tag='DEAT' WHERE e.person_id=1")->fetchColumn(), 'u' => (int) $pdo->query('SELECT count(*) FROM poilu_units WHERE person_id=1')->fetchColumn(), 'date' => $pdo->query("SELECT e.date_text FROM events e JOIN event_types t ON t.id=e.event_type_id AND t.gedcom_tag='DEAT' WHERE e.person_id=1")->fetchColumn()];`);
            assert.deepEqual(d, {n: 1, u: 1, date: '20 août 1914'});
            const u = await post('so_undo', {batch: res.result.batch}); assert.equal(u.ok, true);
        });
        await t('API : ↶ Annuler l’import Mémoire des hommes — tout est retiré, la case MPF revient à « inconnu »', async () => {
            const before = media().length;
            const u = await post('so_undo', {batch: b1}); assert.equal(u.ok, true, JSON.stringify(u));
            assert.equal(media().length, before - 1, 'le fichier est effacé');
            const d = php(`return ['ev' => (int) $pdo->query("SELECT count(*) FROM events e JOIN event_types t ON t.id=e.event_type_id AND t.gedcom_tag='DEAT' WHERE e.person_id=1")->fetchColumn(), 'src' => (int) $pdo->query('SELECT count(*) FROM sources')->fetchColumn(), 'm' => (int) $pdo->query('SELECT count(*) FROM media')->fetchColumn(), 'l' => (int) $pdo->query('SELECT count(*) FROM source_links')->fetchColumn(), 'mpf' => $pdo->query('SELECT mort_pour_la_france FROM persons WHERE id=1')->fetchColumn(), 'u' => (int) $pdo->query('SELECT count(*) FROM poilu_units')->fetchColumn(), 'flag' => (int) $pdo->query('SELECT show_poilu_block FROM persons WHERE id=1')->fetchColumn()];`);
            assert.deepEqual(d, {ev: 0, src: 0, m: 0, l: 0, mpf: 'unknown', u: 0, flag: 1});
            assert.ok((await post('so_undo', {batch: b1})).error, 'deux fois : refusé');
        });
        await t('API : 🏅 Léonore — PDF rangé, récompense « décoration » dans 🏆 Concours et récompenses, ↶', async () => {
            const res = await imp({kind: 'leonore', person_id: 2, url: 'https://www.leonore.archives-nationales.culture.gouv.fr/ui/notice/42', fields: {grade: 'chevalier', date: '14 juillet 1920', decree: 'décret du 10 juillet 1920', cote: 'LH/1758/42'}}, {buf: PDF, type: 'application/pdf', name: 'dossier.pdf'});
            assert.equal(res.ok, true, JSON.stringify(res));
            const b = await get('blocs', {op: 'person', person_id: 2, kinds: 'award'});
            const it = b.items[0]; assert.ok(it, JSON.stringify(b));
            assert.equal(it.title, 'Légion d’honneur · chevalier'); assert.equal(it.data.category, 'decoration'); assert.equal(it.data.grade, 'chevalier');
            assert.equal(it.data.dossier, 'https://www.leonore.archives-nationales.culture.gouv.fr/ui/notice/42'); assert.match(it.data.source, /LH\/1758\/42/);
            assert.ok(Number(it.data.photo?.mid) > 0, 'le PDF est le document de la récompense');
            assert.equal(php(`return $pdo->query("SELECT media_type FROM media")->fetchColumn();`), 'pdf');
            assert.equal((await post('so_undo', {batch: res.result.batch})).ok, true);
            assert.equal((await get('blocs', {op: 'person', person_id: 2, kinds: 'award'})).items.length, 0);
        });
        await t('API : 📋 matricule — seulement les cases vides du bloc Militaire, campagnes ajoutées, ↶ remet tout', async () => {
            const res = await imp({kind: 'matricule', person_id: 2, url: '', fields: {matricule: '1234', classe_mobilisation: '1890', cheveux: 'blonds', yeux: 'gris', taille: '1 m 68', campagnes: 'Allemagne 1914-1918', blessures: 'blessé le 3 juin 1916', localites_successives: 'Brive, 1895'}}, {buf: PNG, type: 'image/png', name: 'matricule.png'});
            assert.equal(res.ok, true, JSON.stringify(res));
            const m = await get('military', {id: 2}); const d = m.data || m;
            assert.equal(d.cheveux, 'châtains', 'déjà rempli : gardé'); assert.equal(d.yeux, 'gris'); assert.equal(d.matricule, '1234'); assert.equal(d.localites_successives, 'Brive, 1895');
            assert.equal(d.services_mutations, 'Incorporé au 126e RI\nCampagnes : Allemagne 1914-1918\nBlessures, citations : blessé le 3 juin 1916');
            assert.equal(php(`return (int) $pdo->query("SELECT count(*) FROM media_links WHERE entity_type='military' AND entity_id=2")->fetchColumn();`), 1, 'aussi dans les documents du bloc Militaire');
            assert.equal((await post('so_undo', {batch: res.result.batch})).ok, true);
            assert.deepEqual(JSON.parse(php(`return $pdo->query('SELECT military_data FROM persons WHERE id=2')->fetchColumn();`)), {cheveux: 'châtains', services_mutations: 'Incorporé au 126e RI'});
        });
        await t('API : 📰 presse par un lien collé (sans fichier) — passage « Dans les médias » avec journal, date, page, lien', async () => {
            const res = await imp({kind: 'presse', person_id: 1, site: 'retronews', url: 'https://www.retronews.fr/journal/le-petit-journal/12-mai-1905/123/456789/3', fields: {journal: 'Le Petit Journal', date: '12 mai 1905', page: '3', title: 'Un drame à Tulle', ptype: 'faits_divers', text: 'M. Dupont…'}});
            assert.equal(res.ok, true, JSON.stringify(res)); assert.equal(res.result.media_id, 0);
            const it = (await get('blocs', {op: 'person', person_id: 1, kinds: 'press_item'})).items[0];
            assert.equal(it.title, 'Un drame à Tulle'); assert.deepEqual(it.data.outlet, {txt: 'Le Petit Journal'}); assert.equal(it.data.pages, 'p. 3'); assert.equal(it.data.ptype, 'faits_divers');
            assert.ok(it.data.url.startsWith('https://www.retronews.fr/')); assert.equal(it.data.transcript, 'M. Dupont…');
            const src = php(`return $pdo->query('SELECT title, agency FROM sources')->fetch();`);
            assert.equal(src.title, 'Le Petit Journal, 12 mai 1905, p. 3 — « Un drame à Tulle »'); assert.equal(src.agency, 'RetroNews (BnF)');
            assert.ok((await post('so_preview', {kind: 'presse', person_id: 1, url: 'https://www.retronews.fr/journal/le-petit-journal/12-mai-1905/123/456789/3', fields: {}})).result.ecarts.some(e => /déjà une source/.test(e.text)));
            assert.equal((await post('so_undo', {batch: res.result.batch})).ok, true);
        });
        await t('API : sécurité — CSRF, fiche verrouillée, mauvais fichiers, lien javascript:, rien sans document', async () => {
            assert.equal((await imp({kind: 'presse', person_id: 1, url: 'https://x.org/'}, null, 'faux')).status, 419);
            assert.equal((await post('so_undo', {batch: 'x'}, 'faux')).status, 419);
            assert.match((await imp({kind: 'presse', person_id: 3, url: 'https://x.org/', fields: {}})).error, /verrouill/i);
            assert.match((await imp({kind: 'presse', person_id: 1, fields: {}}, {buf: Buffer.from('<html><script>alert(1)</script></html>'), type: 'text/html', name: 'page.html'})).error, /image|PDF/);
            assert.match((await imp({kind: 'presse', person_id: 1, fields: {}}, {buf: Buffer.from('pas une image'), type: 'image/png', name: 'faux.png'})).error, /ne correspond pas/);
            assert.match((await imp({kind: 'presse', person_id: 1, url: 'javascript:alert(1)', fields: {}})).error, /fichier, un lien/);
            assert.match((await imp({kind: 'autre', person_id: 1, url: 'https://x.org/'})).error, /inconnue/);
            assert.match((await imp({kind: 'presse', person_id: 999, url: 'https://x.org/'})).error, /fiche/);
            assert.equal(php(`return (int) $pdo->query('SELECT count(*) FROM media')->fetchColumn() + (int) $pdo->query('SELECT count(*) FROM sources')->fetchColumn();`), 0, 'rien n’est entré');
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
                await ctx.route(url => !/^https?:\/\/127\.0\.0\.1/.test(String(url)) && !/^(data|blob):/.test(String(url)), route => { const u = route.request().url(); if (ARCHIVE_HOSTS.test(u)) external.push(u); route.abort(); });
                const p = await ctx.newPage();
                p.on('pageerror', e => errors.push(`${name} : ${e.message}`));
                p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource|ERR_FAILED|net::/.test(m.text())) errors.push(`${name} : ${m.text()}`); });
                p.on('dialog', d => { errors.push(`${name} : dialogue natif ${d.message()}`); d.dismiss(); });
                await p.goto(base);
                await p.waitForFunction(() => window.LCNDA_APP?.state && window.LCNDA_EXT?.sourcesOuvertes && window.LCNDA_SOURCES_OUVERTES, null, {timeout: 20000});
                if (dark) await p.evaluate(() => { const A = window.LCNDA_APP; localStorage.setItem('genealogie-design', JSON.stringify({...A.readDesignSettings(), preset: 'dark'})); A.applyDesign(); });
                const noScroll = async () => { const sw = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert.ok(sw <= 0, `défilement horizontal : ${sw}`); };
                await t(`${name} : la fiche — boutons « 🔍 Mémoire des hommes », « 📋 Registre matricule », Léonore, presse`, async () => {
                    await p.evaluate(() => window.LCNDA_APP.openPersonById(1));
                    await p.waitForSelector('[data-so-search="mdh"]', {timeout: 20000, state: 'attached'}); // à 390 px, les boutons d'en-tête des blocs passent dans le menu de la carte
                    const kinds = await p.$$eval('[data-so-search]', els => els.map(e => e.dataset.soSearch));
                    for (const k of ['mdh', 'matricule']) assert.ok(kinds.includes(k), kinds.join(','));
                    assert.ok(await p.$('[data-so-import="mdh"]'), 'import depuis le bloc Poilu');
                    await noScroll();
                });
                await t(`${name} : 🔍 Chercher — l’adresse affichée est celle qu’on ouvre, rien n’est demandé aux sites`, async () => {
                    await p.$eval('[data-so-search="matricule"]', b => b.click());
                    await p.waitForSelector('dialog.so-search .so-link [data-so-go]', {timeout: 15000});
                    const cls = await p.textContent('dialog.so-search [data-so-classe]'); assert.match(cls, /Classe 1912/);
                    assert.equal(await p.inputValue('dialog.so-search [name=dept]'), '19');
                    await shot(p, `so-chercher-matricule-${name}.png`);
                    await p.click('dialog.so-search [data-so-tab="presse"]');
                    await p.fill('dialog.so-search [name=place]', 'Brive & Tulle');
                    const shown = await p.textContent('[data-so-url="gallica"]'), href = await p.getAttribute('[data-so-go="gallica"]', 'href');
                    assert.equal(shown, href); assert.ok(href.includes('Brive%20%26%20Tulle'), href);
                    assert.ok(await p.$('dialog.so-search .ui-badge'), 'RetroNews : « En partie payant »');
                    await shot(p, `so-chercher-presse-${name}.png`);
                    await p.click('dialog.so-search [data-so-tab="mdh"]');
                    assert.ok((await p.$$('dialog.so-search [data-so-go]')).length >= 5);
                    await noScroll();
                    await p.click('dialog.so-search .modal-head [data-x]');
                });
                await t(`${name} : ⚙️ Adresses des sites — gardé tout de suite (K2), utilisé, ↺`, async () => {
                    await p.$eval('[data-so-search="leonore"]', b => b.click()); await p.waitForSelector('dialog.so-search [data-so-go="leonore"]');
                    await p.click('dialog.so-search [data-so-settings]'); await p.waitForSelector('dialog.so-settings[open]');
                    await p.fill('dialog.so-settings [name=leonore]', 'https://exemple.org/l?nom={nom}'); await p.waitForTimeout(800);
                    assert.match(await p.evaluate(() => localStorage.getItem('genealogie-sources-ouvertes-sites')), /exemple\.org/);
                    await shot(p, `so-adresses-${name}.png`);
                    await p.click('dialog.so-settings [data-ui-reset]'); await p.waitForTimeout(200);
                    assert.equal(await p.evaluate(() => localStorage.getItem('genealogie-sources-ouvertes-sites')), null);
                    await p.click('dialog.so-settings .modal-actions [data-ui-x]');
                    await p.click('dialog.so-search .modal-head [data-x]');
                });
                await t(`${name} : ⤒ Importer une image — document à côté des cases, « c’est la même personne ? », import, ↶ Annuler`, async () => {
                    await p.evaluate(b64 => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
                        void window.LCNDA_EXT.sourcesOuvertes.openImport({personId: 1, kind: 'mdh', files: [new File([u], 'fiche.png', {type: 'image/png'})]}); }, PNG.toString('base64'));
                    await p.waitForSelector('.k-import .so-imp-img img', {timeout: 15000});
                    await p.fill('.k-import [name=last]', 'Durand');
                    await p.waitForSelector('.k-import .so-ecart.is-orange', {timeout: 5000});
                    await p.fill('.k-import [name=last]', 'Dupont'); await p.fill('.k-import [name=death_date]', '20 août 1914'); await p.fill('.k-import [name=unit]', '126e RI');
                    await p.waitForTimeout(700);
                    await noScroll(); await shot(p, `so-import-${name}.png`);
                    await p.click('.k-import [data-k-go]');
                    await p.waitForSelector('.k-import', {state: 'detached', timeout: 15000});
                    const n = php(`return (int) $pdo->query("SELECT count(*) FROM events e JOIN event_types t ON t.id=e.event_type_id AND t.gedcom_tag='DEAT' WHERE e.person_id=1")->fetchColumn();`);
                    assert.equal(n, 1, 'décès ajouté');
                    const undo = p.locator('button', {hasText: '↶ Annuler'}).last(); await undo.click();
                    await p.waitForTimeout(800);
                    assert.equal(php(`return (int) $pdo->query("SELECT count(*) FROM events e JOIN event_types t ON t.id=e.event_type_id AND t.gedcom_tag='DEAT' WHERE e.person_id=1")->fetchColumn() + (int) $pdo->query('SELECT count(*) FROM media')->fetchColumn();`), 0, '↶ a tout retiré');
                });
                await t(`${name} : sans fiche choisie — le menu de choix et l’erreur sous le champ (K1)`, async () => {
                    await p.evaluate(() => { void window.LCNDA_EXT.sourcesOuvertes.openImport({kind: 'presse', link: 'https://www.retronews.fr/journal/le-temps/3-juin-1910/1/2/4', linkOnly: true, files: [new File(['x'], 'lien-colle.txt', {type: 'text/plain'})]}); });
                    await p.waitForSelector('.k-import .so-fields [name=journal]', {timeout: 15000});
                    assert.equal(await p.inputValue('.k-import [name=journal]'), 'Le Temps'); assert.equal(await p.inputValue('.k-import [name=date]'), '3 juin 1910');
                    await p.click('.k-import [data-k-go]'); await p.waitForTimeout(300);
                    assert.ok(await p.$('.k-import .is-invalid, .k-import [aria-invalid="true"], .k-import .ui-field-error, .k-import .field-error'), 'erreur sous le champ');
                    await shot(p, `so-sans-fiche-${name}.png`);
                    await p.click('.k-import .modal-head [data-k-x]');
                });
                await ctx.close();
            }
            await t('navigateur : aucune erreur, aucune requête vers les sites d’archives', () => {
                assert.deepEqual(errors, []); assert.deepEqual(external, []);
            });
        } finally { await browser.close(); }
    } finally {
        proc.kill();
        fs.rmSync(tmp, {recursive: true, force: true});
        finish();
    }
})();
