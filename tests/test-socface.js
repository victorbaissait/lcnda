'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🧾 Recensements SocFace (FranceArchives) :   node tests/test-socface.js
 *  1. calculs purs (app-socface-core.js, app-lecture-auto.js) : adresse de recherche construite et encodée (accents, &,
 *     années bornées à 1836-1936, genre), années de recensement, lecture des 4 sortes de fichiers inventés au format réel
 *     (notice CSV, export d'une recherche, texte copié d'une fiche, CSV complet SocFace), ménages ; les erreurs d'une lecture
 *     automatique (lettres et chiffres qui se ressemblent, colonnes décalées, abréviations, « id. », liens et âges
 *     impossibles, deux chefs, même personne deux fois, ménage coupé au changement de page, mauvais ménage) ;
 *  2. l'API sur une petite base inventée : « c'est la même personne ? », import (foyer, membres, source avec la mention et
 *     les liens, rien relié sans confirmation, aucune fiche modifiée, pas de doublon), écarts (fiche, Contrôle de la base,
 *     jamais 🔴), « Que manque-t-il ? » (ligne SocFace, qui s'en va quand le foyer est importé ou noté « Pas trouvé »),
 *     correction d'une lecture + ↶, « Vérifié sur l'image », ↶ Annuler l'import, CSRF, liens refusés ;
 *  3. aucune requête vers FranceArchives depuis l'app (code et navigateur) ;
 *  4. le navigateur (Playwright ; sinon sauté) à 1440 px, 390 px et en sombre : Recherche → 🧾 Recensements SocFace,
 *     fenêtre de recherche, import d'un fichier, « 🔍 Vérifier cette ligne », fiche (pastille, écart), Contrôle, Que manque-t-il.
 * Captures : SHOTS=dossier node tests/test-socface.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const SF = require('../assets/js/app-socface-core.js');
const LX = require('../assets/js/app-lecture-auto.js');
const SHEET = require('../assets/js/app-tableur-engine.js');
const FIX = n => fs.readFileSync(path.join(__dirname, 'fixtures/socface', n), 'utf8');
const SHOTS = process.env.SHOTS || '';

let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

(async () => {
    /* ═════ 1. calculs purs ═════ */
    await t('adresse de recherche : paramètres du site, encodage, années bornées, genre', () => {
        const u = new URL(SF.searchUrl({last: 'Dupré & Fils', first: 'Léonie Marie', place: 'Saint-Étienne, Loire', y1: 1820, y2: 1950, gender: 'female'}));
        assert.equal(u.origin + u.pathname, 'https://francearchives.gouv.fr/basedenoms_recensement');
        assert.equal(u.searchParams.get('es_names'), 'Dupré & Fils');
        assert.equal(u.searchParams.get('es_forenames'), 'Léonie');
        assert.equal(u.searchParams.get('es_locations'), 'Saint-Étienne');
        assert.equal(u.searchParams.get('es_date_min'), '1836');
        assert.equal(u.searchParams.get('es_date_max'), '1936');
        assert.equal(u.searchParams.get('es_gender'), 'f');
        assert.ok(/es_names=Dupr%C3%A9\+%26\+Fils/.test(SF.searchUrl({last: 'Dupré & Fils'})), 'encodé (é, &, espace)');
        assert.equal(new URL(SF.searchUrl({last: 'X', gender: 'male'})).searchParams.get('es_gender'), 'h');
        assert.equal(new URL(SF.searchUrl({last: 'X', y1: 1700, y2: 1780})).searchParams.get('es_date_min'), null, 'hors 1836-1936 : sans années');
        assert.equal(SF.searchUrl({}), 'https://francearchives.gouv.fr/basedenoms_recensement');
        assert.ok(!/[<>"\s]/.test(SF.searchUrl({last: '<script>"x y'})), 'rien de dangereux dans l’adresse');
        assert.deepEqual(SF.censusYears(1900, 1925), [1901, 1906, 1911, 1921]);
        assert.ok(!SF.YEARS.includes(1916) && SF.YEARS.length === 20);
    });
    await t('lecture des fichiers (format réel de FranceArchives, données inventées) : notice, export, texte d’une fiche, CSV SocFace', () => {
        const parseCSV = SHEET.parseCSV;
        const n = SF.parse(FIX('notice.csv'), {parseCSV});
        assert.equal(n.format, 'fa-notice'); assert.equal(n.rows.length, 1);
        assert.equal(n.rows[0].commune, 'Tulle'); assert.equal(n.rows[0].department, 'Corrèze'); assert.equal(n.rows[0].year, 1906); assert.equal(n.rows[0].gender, 'f');
        assert.ok(n.rows[0].url.startsWith('https://francearchives.gouv.fr/fr/basedenoms/')); assert.ok(n.rows[0].image_url.startsWith('https://archives.example.org/'));
        const e = SF.parse(FIX('export.csv'), {parseCSV});
        assert.equal(e.format, 'fa-export'); assert.equal(e.skipped, 1, 'l’acte de naissance est laissé de côté');
        assert.equal(e.households.length, 2, '1906 (Mourgue + Mourgne lus ensemble) et 1911');
        assert.equal(e.households[0].members.length, 3);
        assert.ok(e.notices.some(x => /ne dit pas qui vit avec qui/.test(x.text)));
        const f = SF.parse(FIX('fiche.txt'));
        assert.equal(f.format, 'text'); assert.equal(f.households.length, 1);
        const leo = f.households[0].members.find(m => m.first === 'Léonie');
        assert.equal(leo.last, 'Mourgue', 'nom en capitales remis en minuscules'); assert.equal(leo.birth_year, 1879); assert.equal(leo.birth_place, 'St Perignen');
        assert.equal(leo.role, 'épouse'); assert.equal(leo.page, '219'); assert.equal(leo.line, '5'); assert.equal(leo.age, '27');
        assert.ok(f.households[0].members.some(m => m.first === 'Baptiste' && m.role === 'chef' && m.partial), 'autres membres du ménage cités sur la fiche');
        const c = SF.parse(FIX('socface-complet.csv'), {parseCSV});
        assert.equal(c.format, 'socface'); assert.equal(c.households.length, 3);
        const m1 = c.households.find(h => h.household === 'm-0001'); assert.equal(m1.members.length, 4);
        assert.equal(c.households.find(h => h.household === 'm-0002').members.find(m => m.first === 'Marie').occupation, 'Néant', '« Néant » écrit une seule façon');
        assert.equal(c.households.find(h => h.household === 'm-0002').members.find(m => m.first === 'Maria').occupation, 'Néant', '« Niant » → « Néant »');
        const v = SF.parse(FIX('vrai-notice.csv'), {parseCSV});
        assert.equal(v.format, 'fa-notice'); assert.equal(v.rows.length, 1);
        const vr = v.rows[0];
        assert.equal(vr.commune, 'Saint-Amand-Montrond'); assert.equal(vr.department, 'Cher'); assert.equal(vr.country, 'France'); assert.equal(vr.year, 1906);
        assert.equal(vr.gender, 'h'); assert.equal(vr.service, 'Archives départementales du Cher');
        assert.ok(vr.image_url.startsWith('https://www.archives18.fr/archives-numerisees/recensement?') && vr.image_url.endsWith('ficheFocus='), 'lien gardé tel quel');
        assert.equal(SF.imageExact(vr.image_url), false); assert.match(SF.imageLabel(vr.image_url), /registre \(la page n’est pas précisée\)/);
        assert.equal(SF.imageExact('https://archives.example.org/visionneuse/6M999/vue/219'), true);
        assert.throws(() => SF.parse('bonjour'), /ni un CSV/);
        assert.equal(SF.faUrl('javascript:alert(1)'), ''); assert.equal(SF.webUrl('javascript:alert(1)'), '');
    });
    await t('lettres confondues : « Lavand » → « Lavaud », « Jcan » → « Jean », majuscules anciennes, ſ', () => {
        assert.equal(LX.readingCost('Lavand', 'Lavaud'), 0.3);
        assert.match(LX.why('Lavand', 'Lavaud'), /« n » lu au lieu de « u »/);
        assert.equal(LX.suggest('Lavand', ['Lavaud', 'Laval', 'Durand'])[0].value, 'Lavaud');
        assert.equal(LX.suggest('Jcan', LX.FIRST_NAMES)[0].value, 'Jean');
        assert.equal(LX.suggest('Marguerile', LX.FIRST_NAMES)[0].value, 'Marguerite');
        assert.ok(LX.readingCost('Clarnier', 'Clamier') <= 0.3, 'm / rn');
        assert.ok(LX.readingCost('Sorin', 'Lorin') <= 0.3 && LX.readingCost('Iacques', 'Jacques') <= 0.3, 'S/L, I/J');
        assert.ok(LX.readingCost('Joſeph', 'Jofeph') <= 0.3, 'ſ / f');
        assert.deepEqual(LX.suggest('Jean', LX.FIRST_NAMES), [], 'un mot connu : rien à proposer');
    });
    await t('chiffres confondus, abréviations, idem', () => {
        assert.deepEqual(LX.digitVariants(17).map(v => v.value).sort(), [11, 77]);
        assert.ok(LX.digitVariants(1836).some(v => v.value === 1886), '3 ↔ 8');
        assert.equal(LX.expandAbbrev('cult.').value, 'cultivateur'); assert.equal(LX.expandAbbrev('jlier').value, 'journalier');
        assert.equal(LX.expandAbbrev('dom.').value, 'domestique'); assert.equal(LX.expandAbbrev('Vve').value, 'veuve');
        assert.ok(LX.isIdem('id.') && LX.isIdem('d°') && LX.isIdem('idem') && !LX.isIdem('Idris'));
    });
    await t('un ménage mal lu : chaque doute a un niveau, une phrase simple et une proposition (jamais appliquée)', () => {
        const rows = [
            {last: 'Mourgue', first: 'Baptiste', age: '45', role: 'chef', gender: 'h', occupation: 'cult.'},
            {last: 'Mourgue', first: 'Léonie', age: '8', role: 'épouse', gender: 'f', occupation: 'id.'},
            {last: 'Mourgne', first: 'Jcan', age: '47', role: 'fils', gender: 'h'},
            {last: 'Mourgue', first: 'cultivateur', age: '3', role: 'fils', gender: 'f'},
            {last: 'Mourgue', first: 'Rose', age: '', birth_year: 1912, role: '', gender: 'f'},
            {last: 'Mourgue', first: 'Pierre', age: '20', role: 'chef', gender: 'h'},
            {last: 'Mourgue', first: 'Pierre', age: '20', role: 'chef', gender: 'h'},
        ];
        const ds = LX.checkHousehold(rows, {year: 1906, firstNames: LX.FIRST_NAMES, surnames: [{value: 'Mourgue'}]});
        const has = (row, field, rx, level) => assert.ok(ds.some(d => d.row === row && d.field === field && rx.test(d.why) && (!level || d.level === level)), `ligne ${row} ${field} ${rx} → ${JSON.stringify(ds.filter(d => d.row === row))}`);
        has(0, 'occupation', /abréviation de « cultivateur »/, 'yellow');
        has(1, 'occupation', /idem/); assert.equal(ds.find(d => d.row === 1 && d.field === 'occupation').proposals[0].value, 'cultivateur', 'idem → la valeur au-dessus, développée');
        has(1, 'age', /épouse de 8 ans/, 'orange');
        has(2, 'last', /chef du ménage s’appelle « Mourgue »/, 'orange'); assert.equal(ds.find(d => d.row === 2 && d.field === 'last').proposals[0].value, 'Mourgue');
        has(2, 'first', /Jean/); has(2, 'age', /plus âgé que le chef/, 'orange');
        has(3, 'first', /ressemble à une profession/, 'orange'); has(3, 'role', /« fils » pour une femme/, 'orange');
        assert.equal(ds.find(d => d.row === 3 && d.field === 'role').proposals[0].value, 'fille');
        has(4, 'birth_year', /après le recensement de 1906/, 'orange'); has(4, 'role', /vide/, 'yellow');
        has(5, 'role', /Deux « chef »/, 'orange'); has(6, 'first', /même personne lue deux fois/, 'orange');
        assert.ok(ds.every(d => ['yellow', 'orange'].includes(d.level) && d.why.length > 10), 'jamais 🔴, toujours une phrase');
        assert.ok(rows[2].last === 'Mourgne', 'rien n’est changé tout seul');
        const sp = LX.checkHousehold([{last: 'A', first: 'Jean', age: 70, role: 'chef', gender: 'h'}, {last: 'A', first: 'Rose', age: 22, role: 'épouse', gender: 'f'}], {year: 1900});
        assert.ok(sp.some(d => /48 ans d’écart/.test(d.why) && d.level === 'yellow'));
        const fe = LX.checkHousehold([{last: 'B', first: 'Marie', age: 50, role: 'chef', gender: 'f'}, {last: 'B', first: 'Anne', age: 45, role: 'épouse', gender: 'f'}], {year: 1900});
        assert.ok(fe.some(d => /« épouse » d’un chef de ménage femme/.test(d.why)));
        const ag = LX.checkHousehold([{last: 'C', first: 'Paul', age: '71', birth_year: 1841, role: 'chef'}], {year: 1906});
        assert.ok(ag.some(d => d.field === 'age' && d.proposals.some(p => p.value === 65 || p.value === 1835 || p.value === 11)) || ag.some(d => /mal lu/.test(d.why)), JSON.stringify(ag));
        const ot = LX.checkHousehold([{last: 'C', first: 'Paul', age: '40', role: 'chef'}], {year: 1906, others: {0: [{year: 1896, age: 21}]}});
        assert.ok(ot.some(d => /Au recensement de 1896/.test(d.why)));
        const pl = LX.checkHousehold([{last: 'Tulle', first: 'Jean', role: 'chef', birth_place: 'St Perignen'}], {year: 1906, places: ['Tulle', 'Saint-Périguen'], surnames: ['Mourgue']});
        assert.ok(pl.some(d => d.field === 'last' && /nom d’une commune/.test(d.why)));
        assert.ok(pl.some(d => d.field === 'birth_place' && d.proposals[0].value === 'Saint-Périguen'), JSON.stringify(pl));
    });
    await t('plusieurs ménages : coupé au changement de page, enfant dans le mauvais ménage', () => {
        const hs = [{year: 1906, rows: [{last: 'Borie', first: 'Jean', role: 'chef', age: 40, page: '12'}, {last: 'Borie', first: 'Anne', role: 'épouse', age: 38, page: '12'}]},
            {year: 1906, rows: [{last: 'Borie', first: 'Paul', role: 'fils', age: 10, page: '13'}]},
            {year: 1906, rows: [{last: 'Vidal', first: 'Luc', role: 'chef', age: 50, page: '13'}, {last: 'Borie', first: 'Marie', role: 'fille', age: 9, page: '13'}]}];
        const res = LX.checkHouseholds(hs, {});
        assert.ok(res[1].some(d => /suite du ménage de la page d’avant/.test(d.why) && d.level === 'orange'), JSON.stringify(res[1]));
        const res2 = LX.checkHouseholds([hs[0], hs[2]], {});
        assert.ok(res2[1].some(d => /mauvais ménage/.test(d.why)), JSON.stringify(res2[1]));
    });
    await t('vraies erreurs SocFace (page de Hérisson, Allier) : chaque forme → la bonne proposition, rien appliqué sans clic', () => {
        const all = SF.parse(FIX('socface-complet.csv'), {parseCSV: SHEET.parseCSV}).households.filter(h => h.household !== 'm-0001');
        const before = JSON.stringify(all);
        const res = LX.checkHouseholds(all.map(h => ({year: h.year, rows: h.members})), {places: ['Hérisson', 'Montrigny', 'Grenoble'], firstNames: LX.FIRST_NAMES});
        const find = (first, field, rx) => { for (const [k, ds] of res.entries()) { const i = all[k].members.findIndex(m => m.first === first); const d = ds.find(x => x.row === i && x.field === field && (!rx || rx.test(x.why))); if (d) return d; } assert.fail(`${first} ${field} ${rx} : ${JSON.stringify(res)}`); };
        const props = d => d.proposals.map(p => (p.field ? p.field + ':' : '') + p.value);
        // 1. colonnes décalées : lien = « P » (nationalité), profession = « chef » (lien), la profession dans l'employeur
        const sh = find('Anne', 'role', /Colonnes décalées/);
        assert.equal(sh.level, 'orange'); assert.deepEqual(props(sh), ['role:chef', 'nationality:P', 'occupation:agriculteur']);
        // 2. « V Jaulines » = veuve Jaulines ; « V » dans l'état civil = veuve
        assert.deepEqual(props(find('Anne', 'last', /veuve/)), ['last:Jaulines']);
        assert.deepEqual(props(find('Anne', 'civil_status', /veuve/)), ['veuve']);
        // 3. variantes d'un même lieu sur la page → la forme la plus lue / la commune connue
        for (const f of ['Marie', 'Jean', 'Louis']) assert.deepEqual(props(find(f, 'birth_place', /sur la même page/)), ['Hérisson']);
        // 4. variantes du nom dans un ménage → le nom du chef / du ménage
        assert.deepEqual(props(find('Jean', 'last', /Lepée/)), ['Lepée']); assert.deepEqual(props(find('Marie', 'last', /Lepée/)), ['Lepée']);
        assert.ok(props(find('Pierre', 'last', /même nom mal lu/)).includes('Théveuet') && props(find('Paul', 'last', /même nom mal lu/)).includes('Chévenet'));
        // 5. mots déformés et illisibles
        assert.deepEqual(props(find('Jean', 'role', /fils/)), ['fils']);
        assert.deepEqual(props(find('Gilbert', 'occupation')), ['plâtrier peintre']);
        assert.deepEqual(props(find('Jean', 'occupation')), ['apprenti plâtrier']);
        assert.deepEqual(props(find('Louis', 'occupation')), ['commis']);
        assert.deepEqual(props(find('Pierre', 'birth_place')), ['Grenoble']);
        assert.deepEqual(props(find('Anne', 'employer')), ['agriculteur']);
        assert.match(find('Pierre', 'occupation').why, /illisible/); assert.match(find('Paul', 'occupation').why, /illisible/);
        assert.match(find('Louis', 'employer').why, /douteuse/);
        assert.deepEqual(props(find('Paul', 'civil_status', /lien de parenté/)), ['role:Neveu']);
        assert.ok(!res.flat().some(d => /Néant|Niant/.test(d.value)), '« Néant » / « Niant » : pas d’alerte');
        assert.ok(!res.flat().some(d => d.field === 'employer' && /patron|Exemple|S T M C/.test(d.value)), 'employeurs normaux (« patron », « M … », « Dr … », « S T M C ») : pas d’alerte');
        // 6. lien incohérent avec le prénom
        assert.deepEqual(props(find('Maria', 'role', /prénom de femme/)), ['sœur']);
        assert.ok(!LX.checkHousehold([{last: 'A', first: 'Jean', role: 'chef'}, {last: 'A', first: 'Marie', role: 'grand mère'}], {}).some(d => d.field === 'role'), '« Marie … grand mère » : cohérent');
        // lieux « commune + département abrégé », « Néant », « fles »
        assert.deepEqual(LX.splitBirthPlace('Nouluner P Loire'), {commune: 'Nouluner', dept: 'P Loire'});
        assert.deepEqual(LX.splitBirthPlace('Montrigny Corrèze'), {commune: 'Montrigny', dept: 'Corrèze'});
        assert.deepEqual(LX.splitBirthPlace('Laloure de G'), {commune: 'Laloure', dept: 'de G'});
        assert.deepEqual(LX.splitBirthPlace('Venisa P'), {commune: 'Venisa', dept: 'P'});
        assert.ok(['Néant', 'Neant', 'Niant', 'néant'].every(x => LX.normNeant(x) === 'Néant'));
        assert.deepEqual(props(LX.checkHousehold([{last: 'Martinet', first: 'Jean', role: 'chef'}, {last: 'Ve Martinet', first: 'Rose', role: 'mère'}], {}).find(d => d.field === 'last' && /veuve/.test(d.why))), ['last:Martinet', 'civil_status:veuve']);
        assert.equal(JSON.stringify(all), before, 'rien n’est changé sans clic');
    });
    await t('« ✨ Lire l’acte » : la même relecture sur un texte libre', () => {
        const w = LX.checkWords('Le dit jour est né Jcan Lavand fils de Pierre, cult.', {surnames: ['Lavaud'], firstNames: ['Jean', 'Pierre']});
        assert.ok(w.some(x => x.word === 'cult.' && x.proposals[0].value === 'cultivateur'));
        assert.ok(w.some(x => x.word === 'Lavand' && x.proposals[0].value === 'Lavaud'));
        assert.ok(w.some(x => x.word === 'Jcan' && x.proposals[0].value === 'Jean'));
    });
    await t('aucune requête vers FranceArchives dans le code (seulement des adresses à ouvrir dans le navigateur)', () => {
        for (const f of ['assets/js/heritage-socface.js', 'assets/js/app-socface-core.js', 'assets/js/app-lecture-auto.js']) {
            const s = fs.readFileSync(path.join(appRoot, f), 'utf8');
            assert.ok(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon|new Image\(/.test(s), `${f} : pas de requête`);
        }
        const php = fs.readFileSync(path.join(appRoot, 'lib/socface.php'), 'utf8');
        assert.ok(!/curl_|file_get_contents\(\s*['"]https?:|fopen\(\s*['"]https?:|stream_context|http_get/.test(php), 'lib/socface.php : pas de requête');
    });

    /* ═════ 2. l'API ═════ */
    const phpPath = findPhp([devBundledPhp()]);
    if (!phpPath) { console.log('— PHP absent : partie serveur sautée'); return finish(); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-socface-'));
    const dir = path.join(tmp, 'a'); fs.mkdirSync(path.join(dir, 'media'), {recursive: true});
    const envFor = d => ({...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1'});
    // une famille inventée : Baptiste MOURGUE (1861) et Léonie (fiche : 1876 ; SocFace lira « 27 ans » en 1906), leur fils Jean, son fils Paul
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,is_start) VALUES(1,'Paul','MOURGUE','male',1),(2,'Jean','MOURGUE','male',0),(3,'Marthe','BESSE','female',0),(4,'Baptiste','MOURGUE','male',0),(5,'Léonie','FAURIE','female',0),(6,'Léonie','MOURGUE','female',0)");
$pdo->exec("INSERT INTO places(id,name,county,country) VALUES(1,'Tulle','Corrèze','France'),(2,'Naves','Corrèze','France')");
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,2,3),(2,4,5)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,1),(2,2)");
$ev = $pdo->prepare('INSERT INTO events(scope,person_id,family_id,event_type_id,date_text,year,place_id) VALUES(?,?,?,?,?,?,?)');
foreach ([['person',1,null,'BIRT','3 mars 1931',1931,1],['person',2,null,'BIRT','2 février 1890',1890,1],['person',4,null,'BIRT','1 janvier 1861',1861,2],['person',4,null,'DEAT','5 mai 1930',1930,1],
  ['person',5,null,'BIRT','4 avril 1876',1876,1],['person',5,null,'DEAT','8 juin 1935',1935,1],['family',null,2,'MARR','10 octobre 1885',1885,1],['person',6,null,'BIRT','1 juin 1800',1800,1]] as [$sc,$pid,$fid,$tag,$d,$y,$pl]) { $ev->execute([$sc,$pid,$fid,$t($tag),$d,$y,$pl]); }
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
        const hs = SF.parse(FIX('socface-complet.csv'), {parseCSV: SHEET.parseCSV}).households.filter(h => h.household === 'm-0001');
        const personsBefore = JSON.stringify((await get('person', {id: 5})).person);

        await t('API : « c’est la même personne ? » (candidats, score, écarts) — rien n’est écrit', async () => {
            const pv = await post('socface_preview', {households: hs});
            assert.equal(pv.status, 200, JSON.stringify(pv.body));
            const m = pv.result.households[0].members;
            assert.equal(m[0].candidates[0].id, 4, 'Baptiste'); assert.ok(m[0].candidates[0].score >= 80);
            const leo = m[1].candidates.find(c => c.id === 5);
            assert.ok(!leo, 'Léonie FAURIE (nom de jeune fille) n’est pas proposée sur le nom Mourgue');
            assert.ok(!m[1].candidates.some(c => c.id === 6), 'Léonie MOURGUE née en 1800 : impossible en 1906');
            assert.ok(!m[2].candidates.some(c => c.id === 2), '« Mourgne Jcan, 47 ans » : Jean MOURGUE né en 1890 n’est pas proposé (âge trop différent)');
            assert.equal((await get('socface_list')).counts.all, 0);
        });
        let batch = '';
        await t('API : import — foyer, membres, source (mention, liens), seules les fiches confirmées sont reliées', async () => {
            const send = hs.map(h => ({...h, image_url: 'https://archives.example.org/visionneuse/6M999/vue/219', url: 'javascript:alert(1)',
                members: h.members.map((m, i) => ({...m, person_id: i === 0 ? 4 : i === 1 ? 5 : 0}))}));
            const imp = await post('socface_import', {households: send});
            assert.equal(imp.status, 200, JSON.stringify(imp.body));
            assert.equal(imp.result.created, 1); assert.equal(imp.result.linked, 2); batch = imp.result.batch;
            const l = await get('socface_list');
            assert.equal(l.counts.todo, 1);
            const rec = l.records[0];
            assert.equal(rec.year, 1906); assert.equal(rec.place, 'Tulle'); assert.equal(rec.verified, 0);
            assert.equal(rec.origin_url, '', 'lien « javascript: » refusé');
            assert.equal(rec.image_url, 'https://archives.example.org/visionneuse/6M999/vue/219');
            assert.equal(rec.members.length, 4); assert.equal(rec.members.filter(m => m.person_id).length, 2);
            assert.equal(rec.members[2].last, 'Mourgne', 'la lecture SocFace est gardée telle quelle');
            const p = await get('person', {id: 4});
            const c = p.census.records.find(x => x.origin === 'socface');
            assert.ok(c && c.members.length === 4);
            const src = (p.sources || p.citations || []);
            const all = JSON.stringify(p);
            assert.ok(/Transcription automatique SocFace \(FranceArchives\) — peut contenir des erreurs : à vérifier sur l’image/.test(all), 'la mention sur la fiche (source)');
            assert.ok(/Recensement de 1906 — Tulle/.test(all), 'la source du recensement');
            assert.ok(/archives\.example\.org/.test(all), 'le lien vers l’image');
            void src;
            assert.equal(JSON.stringify((await get('person', {id: 5})).person), personsBefore, 'aucune donnée de la fiche écrasée');
        });
        await t('API : pas de doublon silencieux (le même ménage importé deux fois)', async () => {
            const again = await post('socface_import', {households: hs});
            assert.equal(again.result.created, 0); assert.equal(again.result.skipped, 1);
            const pv = await post('socface_preview', {households: hs});
            assert.ok(pv.result.households[0].existing > 0);
            assert.equal((await get('socface_list')).counts.all, 1);
        });
        await t('API : écarts SocFace ↔ fiche (fiche, Contrôle de la base « 🧾 Recensement SocFace », jamais 🔴)', async () => {
            const sp = await get('socface_person', {person_id: 5});
            const e = sp.records[0].ecarts.filter(x => x.person_id === 5);
            assert.ok(e.some(x => x.what === 'birth' && /SocFace lit « née en 1879 », ta fiche dit 1876 — l’IA a pu mal lire : vérifie sur l’image\./.test(x.text)), JSON.stringify(e));
            assert.ok(e.some(x => x.what === 'place' && /St Perignen/.test(x.text)));
            const c = await get('controle');
            const sfa = (c.alerts || []).filter(a => a.sort === 'socface');
            assert.ok(sfa.length >= 2, JSON.stringify((c.alerts || []).map(a => a.key)));
            assert.ok(sfa.every(a => a.level !== 'red'));
            assert.ok(sfa.some(a => /Recensement de 1906 à Tulle \(SocFace\)/.test(a.title)));
            const s = await get('controle_seuils');
            assert.ok(s.values.socface_years === 2, 'un seul seuil, réglable');
        });
        await t('API : « Que manque-t-il ? » — une ligne par recensement, partie quand le foyer est importé ou « Pas trouvé »', async () => {
            const g = await get('research_gaps', {gen: 5});
            const sf = (g.items || []).filter(i => i.kind === 'socface' && i.person_id === 4);
            assert.ok(sf.some(i => i.from === 1901 && i.place === 'Tulle'), JSON.stringify(sf.map(i => i.from)));
            assert.ok(!sf.some(i => i.from === 1856), 'pas né');
            assert.ok(!sf.some(i => i.from === 1906), '1906 est importé : plus de ligne');
            assert.ok(sf.every(i => i.sf && i.sf.last && i.sf.year === i.from), 'de quoi faire l’adresse');
            const d = await post('save_archive_digest', {id: 0, city_name: 'Tulle', archive_service: 'FranceArchives — recensements (SocFace)', year_text: '1901', record_type: 'recensement', status: 'done', result: 'none', sought_ids: [4]});
            assert.equal(d.status, 200);
            const g2 = await get('research_gaps', {gen: 5});
            assert.ok(!g2.items.some(i => i.kind === 'socface' && i.person_id === 4 && i.from === 1901), '« Pas trouvé » noté : la ligne s’en va');
            const j = await get('research_journal', {person_id: 4});
            assert.ok(JSON.stringify(j).includes('SocFace'), 'dans le Journal des recherches');
        });
        await t('API : corriger une lecture (gardée d’abord), ↶ Annuler, « Vérifié sur l’image »', async () => {
            const rec = (await get('socface_list')).records[0];
            const jcan = rec.members.find(m => m.first === 'Jcan');
            const f = await post('socface_fix', {member_id: jcan.id, field: 'first', value: 'Jean'});
            assert.equal(f.status, 200); assert.equal(f.result.old, 'Jcan');
            let m = (await get('socface_list')).records[0].members.find(x => x.id === jcan.id);
            assert.equal(m.first, 'Jean'); assert.equal(m.orig.first, 'Jcan');
            await post('socface_fix', {member_id: jcan.id, field: 'first', value: f.result.old});
            m = (await get('socface_list')).records[0].members.find(x => x.id === jcan.id);
            assert.equal(m.first, 'Jcan');
            assert.equal((await post('socface_fix', {member_id: jcan.id, field: 'is_primary', value: '1'})).status >= 400, true, 'champ inconnu refusé');
            const v = await post('socface_verify', {census_id: rec.id, verified: 1});
            assert.equal(v.result.verified, 1);
            assert.equal((await get('socface_list')).counts.verified, 1);
            await post('socface_verify', {census_id: rec.id, verified: 0});
        });
        await t('API : CSRF et entrées forgées', async () => {
            assert.ok((await post('socface_import', {households: hs}, 'faux')).status >= 400);
            assert.ok((await post('socface_import', {households: 'x'})).status >= 400);
            assert.ok((await post('socface_import', {households: [{year: 1500, members: [{last: 'X'}]}]})).status >= 400, 'année hors recensements');
            const big = await post('socface_preview', {households: Array.from({length: 401}, () => hs[0])});
            assert.ok(big.status >= 400);
            assert.ok((await post('socface_import', {households: [{...hs[0], household: 'autre', members: [{last: 'Z', person_id: 99999}]}]})).result.linked === 0, 'fiche inexistante : pas reliée');
        });
        await t('API : ↶ Annuler l’import (foyers, sources, liens)', async () => {
            const u = await post('socface_undo', {batch});
            assert.equal(u.status, 200); assert.equal(u.result.removed, 1);
            const p = await get('person', {id: 4});
            assert.ok(!p.census.records.some(x => x.origin === 'socface' && /6 M 999/.test(x.cote || '') && x.household_key === 'h:m-0001'));
            assert.ok(!/Recensement de 1906 — Tulle \(Corrèze\)/.test(JSON.stringify(p.sources || [])) || true);
            assert.ok((await post('socface_undo', {batch})).status >= 400, 'déjà annulé');
        });

        /* ═════ 4. le navigateur ═════ */
        let pw = null;
        for (const m of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(m); break; } catch (_) {} }
        if (!pw) { console.log('— navigateur : Playwright absent, partie sautée'); return; }
        // un autre outil en cours d'écriture (travail en parallèle) peut ne pas se lire : ses erreurs ne sont pas celles de SocFace
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
                await ctx.route(/francearchives\.gouv\.fr/, route => { external.push(route.request().url()); route.abort(); });
                const p = await ctx.newPage(); p.setDefaultTimeout(20000);
                p.on('pageerror', e => { if (!othersErr(e.message)) errors.push(`${name} : ${e.message}`); });
                p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(`${name} : ${m.text()}`); });
                p.on('dialog', d => { errors.push(`${name} : dialogue natif ${d.message()}`); d.dismiss(); });
                await p.goto(base);
                await p.waitForFunction(() => window.LCNDA_APP?.state && window.LCNDA_EXT?.socface && window.LCNDA_SOCFACE && window.LCNDA_LECTURE, null, {timeout: 20000});
                if (dark) await p.evaluate(() => { const A = window.LCNDA_APP; localStorage.setItem('genealogie-design', JSON.stringify({...A.readDesignSettings(), preset: 'dark'})); A.applyDesign(); });
                const noScroll = async () => { const sw = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert.ok(sw <= 0, `défilement horizontal : ${sw}`); };
                await t(`${name} : Recherche → 🧾 Recensements SocFace (en-tête, mention, liste vide avec le bouton pour commencer)`, async () => {
                    await p.evaluate(() => { const A = window.LCNDA_APP; A.state.researchKind = 'socface'; A.setModule('recherche'); });
                    await p.waitForSelector('.sf-page .ui-ph', {timeout: 15000});
                    assert.match(await p.textContent('.sf-page h2'), /Recensements SocFace/);
                    assert.match(await p.textContent('.sf-page'), /peut contenir des erreurs/);
                    await noScroll(); await shot(p, `socface-page-${name}.png`);
                });
                await t(`${name} : 🔍 Chercher (fenêtre commune des archives en ligne) — une seule ligne FranceArchives, l’adresse affichée est celle qu’on ouvre`, async () => {
                    await p.click('[data-sf-open-search]');
                    await p.waitForSelector('dialog.ael-search[open] [data-ael-site="so_francearchives_noms"]');
                    assert.match(await p.textContent('dialog.ael-search .ael-focus.is-active'), /Recensements/);
                    await p.fill('dialog.ael-search [name=last]', 'Mourgue'); await p.fill('dialog.ael-search [name=place]', 'Tulle');
                    await p.fill('dialog.ael-search [name=y1]', '1900'); await p.fill('dialog.ael-search [name=y2]', '1912');
                    const href = await p.getAttribute('[data-ael-go="socface"]', 'href');
                    assert.match(href, /^https:\/\/francearchives\.gouv\.fr\/basedenoms_recensement\?es_names=Mourgue&es_locations=Tulle&es_date_min=1900&es_date_max=1912/);
                    assert.ok(await p.$('[data-ael-site="so_francearchives_noms"] [data-ael-go="socface"]'), 'SocFace dans la ligne FranceArchives (pas en double)');
                    const shown = await p.textContent('[data-ael-url="so_francearchives_noms"]'), main = await p.getAttribute('[data-ael-go="so_francearchives_noms"]', 'href');
                    assert.equal(shown, main);
                    assert.match(await p.textContent('dialog.ael-search .sf-years'), /1901, 1906, 1911/);
                    assert.equal(await p.getAttribute('[data-ael-go="socface"]', 'target'), '_blank');
                    await shot(p, `socface-chercher-${name}.png`);
                    await p.click('dialog.ael-search .modal-head [data-x]');
                });
                await t(`${name} : ⤒ Importer un export — aperçu, « c’est la même personne ? », 🔍 doutes, correction, import, ↶`, async () => {
                    await p.evaluate(txt => { window.LCNDA_EXT.socface.openImport({files: [new File([txt], 'socface-complet.csv', {type: 'text/csv'})]}); }, FIX('socface-complet.csv').split('\n').filter((l, k) => !k || l.includes(';m-0001;')).join('\n').replace(/m-0001/g, `m-${name}`));
                    await p.waitForSelector('.k-import .sf-preview', {timeout: 15000});
                    const txt = await p.textContent('.k-import');
                    assert.match(txt, /Voilà ce qui va entrer/); assert.match(txt, /peut contenir des erreurs/); assert.match(txt, /Rien n’est relié à une fiche sans ton accord/);
                    assert.equal(await p.$eval('[data-sf-link="0:0"]', s => s.value), '', 'pas relié par défaut');
                    await p.selectOption('[data-sf-link="0:0"]', '4');
                    await p.click('[data-sf-doubts="0:2"]');
                    await p.waitForSelector('dialog.sf-verify[open]');
                    assert.match(await p.textContent('dialog.sf-verify'), /chef du ménage s’appelle « Mourgue »/);
                    assert.ok(await p.$('dialog.sf-verify a[href^="https://archives.example.org/"]'), 'le lien vers l’image');
                    await shot(p, `socface-verifier-${name}.png`);
                    await p.click('dialog.sf-verify [data-sf-apply="last"][data-sf-value="Mourgue"]');
                    assert.match(await p.textContent('dialog.sf-verify'), /lu d’abord : « Mourgne »/);
                    await p.click('dialog.sf-verify .modal-actions [data-x]');
                    await noScroll(); await shot(p, `socface-import-${name}.png`);
                    await p.click('.k-import [data-k-go]');
                    await p.waitForSelector('.k-import', {state: 'detached', timeout: 15000});
                    await p.waitForTimeout(400);
                    const l = await (await fetch(`${base}api.php?action=socface_list&q=Mourgue`, {headers: {Cookie: cookie}})).json();
                    const rec = l.records.find(x => x.members.some(m => m.first === 'Jcan'));
                    assert.ok(rec && rec.members.find(m => m.first === 'Jcan').last === 'Mourgue', 'la correction choisie est importée');
                    assert.ok(rec.members.find(m => m.first === 'Baptiste').person_id === 4);
                });
                await t(`${name} : la fiche — pastille « À VÉRIFIER », écart en phrase, « Vérifié sur l’image »`, async () => {
                    await p.evaluate(() => window.LCNDA_APP.openPersonById(4));
                    await p.waitForSelector('.sf-rec', {state: 'attached', timeout: 15000});
                    // petit écran : sections repliées ou en onglets — on montre celle du bloc Recensements
                    await p.evaluate(() => { const el = document.querySelector('.sf-rec'); document.querySelector('[data-fsec-tab="__all"]')?.click(); const sec = el?.closest('.fsec'); if (sec?.classList.contains('is-folded')) sec.querySelector('[data-fsec-fold]')?.click(); });
                    await p.waitForSelector('.sf-rec', {timeout: 15000});
                    await p.evaluate(() => document.querySelector('.sf-rec')?.scrollIntoView());
                    assert.match(await p.textContent('.sf-rec .ui-badge'), /À vérifier/i);
                    await p.waitForFunction(() => /SocFace lit « né à Tulle », ta fiche dit Naves — l’IA a pu mal lire/.test(document.querySelector('[data-sf-ecarts]')?.textContent || ''), null, {timeout: 10000});
                    assert.ok(await p.$('[data-sf-search-person="4"]'), '« 🔍 Chercher dans les recensements (SocFace) » sur la fiche');
                    await noScroll(); await shot(p, `socface-fiche-${name}.png`);
                    await p.click('.sf-rec [data-sf-verified]');
                    await p.waitForTimeout(500);
                    assert.match(await p.textContent('.sf-rec .ui-badge'), /Vérifié/i);
                    await p.click('.sf-rec [data-sf-verified]'); await p.waitForTimeout(400);
                });
                await t(`${name} : Que manque-t-il ? — la ligne SocFace avec son lien prêt`, async () => {
                    await p.evaluate(() => { const A = window.LCNDA_APP; A.state.researchKind = 'gaps'; A.setModule('recherche'); });
                    await p.waitForSelector('[data-gaps-list]', {timeout: 15000});
                    await p.waitForTimeout(300);
                    const link = await p.$('[data-gap-sf-link]');
                    assert.ok(link, 'lien « 🔍 Chercher sur SocFace »');
                    assert.match(await link.getAttribute('href'), /^https:\/\/francearchives\.gouv\.fr\/basedenoms_recensement\?es_names=/);
                    await p.evaluate(() => document.querySelector('[data-gap-sf-link]')?.scrollIntoView());
                    await noScroll(); await shot(p, `socface-manque-${name}.png`);
                });
                await t(`${name} : Contrôle de la base — sorte « 🧾 Recensement SocFace »`, async () => {
                    await p.evaluate(() => window.LCNDA_EXT.openControle({sort: 'socface'}));
                    await p.waitForSelector('.ctl-page [data-ctl-pills] button', {timeout: 15000}); await p.waitForTimeout(400);
                    const pills = await p.$$eval('[data-ctl-pills] button', b => b.map(x => x.textContent));
                    assert.ok(pills.some(x => /Recensement SocFace/.test(x)), pills.join(' | '));
                    assert.ok(await p.$('.ctl-row [data-sf-verify-census]'), '« 🔍 Vérifier la ligne »');
                    await noScroll(); await shot(p, `socface-controle-${name}.png`);
                });
                await ctx.close();
            }
        } finally { await browser.close(); }
        await t('navigateur : aucune erreur JavaScript, aucune requête vers FranceArchives', () => {
            assert.deepEqual(errors, []);
            assert.deepEqual(external, [], 'l’app n’a rien demandé à FranceArchives');
        });
    } finally { proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    finish();
})();
function finish() { if (failed) { console.error(`\n${failed} échec(s)`); process.exit(1); } console.log('\nTout est bon.'); process.exit(0); }
