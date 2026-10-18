'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Test du domaine « sciences » (maquettes M, N, Y, Z) :   node tests/test-sciences.js
 *  1. serveur (lib/sciences.php branché sur lib/art_engine.php) sur une base temporaire : sortes acceptées, fiche refusée sans
 *     profil (message clair) puis profil coché à la demande, fiche de profil unique, index (inventeurs, liens, employeur, lieu),
 *     ligne grise du menu de choix, fiches de profil hors du menu de choix général, supprimer + « ↶ Annuler », coordonnées des
 *     lieux, DOI / ORCID vérifiés, lecture des réponses Crossref, ORCID et HAL (sans réseau), erreurs claires ;
 *  2. navigateur (assets/js/heritage-artist*.js + heritage-sciences*.js dans une machine virtuelle) : définitions, profils et
 *     sections, lecture d'une invention (brevets pays par pays, carte du brevet principal), découverte (champs selon la sorte),
 *     filiation académique tirée de la base, « porte son nom », coordonnées, auteur reconnu, échappement du texte.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-sciences-'));
const code = String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p0->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Pierre','Martin','male'),('Anne','Martin','female'),('Jean','Dumas','male')");
$p0->exec("INSERT INTO places(name, latitude, longitude) VALUES('Laguenne', 45.24, 1.78), ('Nulle part', 123, 400)");
$p0 = null;
require 'lib/bootstrap.php';
$pdo = db();
$pdo->exec("INSERT OR IGNORE INTO employer_records(key,name,data_json) VALUES('pradier','Manufacture Pradier','{}')");
$emp = (int) $pdo->query("SELECT id FROM employer_records WHERE key='pradier'")->fetchColumn();
$out = [];
$out['kinds'] = [art_kind_ok($pdo, 'invention'), art_kind_ok($pdo, 'discovery'), art_kind_ok($pdo, 'paper'), art_kind_ok($pdo, 'expedition'), art_kind_ok($pdo, 'profile_scientist'), art_kind_ok($pdo, 'inventionx')];
// sans profil : refusé avec un message clair ; avec make_profile : le bon profil est coché (pas « Artiste »)
try { art_save_item($pdo, ['person_id' => 1, 'kind' => 'invention', 'data' => ['title' => 'X']]); $out['refused'] = ''; } catch (Throwable $e) { $out['refused'] = $e->getMessage(); }
$inv = art_save_item($pdo, ['person_id' => 1, 'kind' => 'invention', 'make_profile' => 'inventor', 'data' => ['title' => 'Sécateur à cliquet', 'date' => 'vers 1950', 'domain' => 'Outillage', 'place' => ['plid' => 1, 'title' => 'Laguenne'],
    'inventors' => [['pid' => 1, 'title' => 'Pierre MARTIN', 'role' => 'inventeur principal'], ['pname' => 'Émile Chassaing', 'role' => 'co-inventeur']],
    'patents' => [['country' => 'FR', 'no' => 'FR 1 054 321', 'status' => 'tombe', 'main' => true], ['country' => 'US', 'no' => 'US 2 789 412']],
    'licences' => [['company' => ['empid' => $emp, 'title' => 'Manufacture Pradier'], 'years' => '1954-1972']]]])['id'];
$out['profiles1'] = $pdo->query("SELECT group_concat(profile_key) FROM person_profiles WHERE person_id=1")->fetchColumn();
$out['not_artist'] = (int) $pdo->query('SELECT COALESCE(is_artist,0) FROM persons WHERE id=1')->fetchColumn();
$g = art_save_item($pdo, ['person_id' => 1, 'kind' => 'invention', 'data' => ['title' => 'Greffoir', 'related' => [['link' => 'derivee', 'to' => ['iid' => $inv, 'title' => 'Sécateur à cliquet', 'kind' => 'invention']]]]])['id'];
$out['index'] = [(int) $pdo->query("SELECT count(*) FROM item_people WHERE item_id={$inv} AND field='inventors'")->fetchColumn(), (int) $pdo->query("SELECT count(*) FROM item_links WHERE from_id={$inv} AND to_type='employer' AND to_id={$emp}")->fetchColumn(),
    (int) $pdo->query("SELECT place_id FROM items WHERE id={$inv}")->fetchColumn(), (int) $pdo->query("SELECT count(*) FROM item_links WHERE from_id={$g} AND to_id={$inv} AND kind='related'")->fetchColumn(),
    (int) $pdo->query("SELECT count(*) FROM item_rows WHERE item_id={$inv} AND field='patents'")->fetchColumn(), (int) $pdo->query("SELECT year FROM items WHERE id={$inv}")->fetchColumn()];
// une seule fiche de profil par personne ; person_profiles la retient
$a = art_save_item($pdo, ['person_id' => 2, 'kind' => 'profile_scientist', 'data' => ['title' => 'Anne']])['id'];
$b = art_save_item($pdo, ['person_id' => 2, 'kind' => 'profile_scientist', 'data' => ['title' => 'Anne MARTIN', 'disciplines' => 'Botanique']])['id'];
$out['profile'] = [$a === $b, (int) $pdo->query("SELECT item_id FROM person_profiles WHERE person_id=2 AND profile_key='scientist'")->fetchColumn() === $a, (int) $pdo->query("SELECT count(*) FROM items WHERE person_id=2 AND type_key='profile_scientist'")->fetchColumn()];
// un élève qui la cite comme directrice de thèse : « Lié à » de son côté
art_save_item($pdo, ['person_id' => 3, 'kind' => 'profile_scientist', 'data' => ['title' => 'Jean', 'thesis_director' => ['pid' => 2, 'title' => 'Anne MARTIN']]]);
$out['cited'] = array_map(static fn($c) => [$c['kind'], $c['fields']], art_person_cited($pdo, 2));
// plusieurs publications d'un coup (import) : le profil scientifique est déjà coché
$ps = art_save_items($pdo, ['person_id' => 2, 'items' => [['kind' => 'paper', 'data' => ['title' => 'Polyploidy', 'year' => '1974', 'journal_txt' => 'Nature', 'doi' => '10.1038/251123a0']], ['kind' => 'discovery', 'data' => ['title' => 'Ophrys martinii', 'dkind' => 'plante', 'dkind_label' => 'Espèce nouvelle (plante)', 'sci_name' => 'Ophrys martinii', 'date' => '12 mai 1956']]]]);
$out['batch'] = count($ps['ids']);
// le menu de choix : ligne grise ; les fiches de profil n'y sont pas
$pk = picker_art_items($pdo, '', 0, 50, []);
$out['picker'] = [array_values(array_map(static fn($i) => $i['art_kind'], $pk['items'])), array_values(array_filter(array_map(static fn($i) => $i['art_kind'] === 'paper' ? $i['meta'] : null, $pk['items'])))[0] ?? ''];
$out['picker_kind'] = picker_art_items($pdo, 'ophrys', 0, 5, ['art_kind' => 'discovery'])['items'][0]['icon'] ?? '';
// supprimer puis remettre
$snap = art_delete_item($pdo, ['person_id' => 1, 'id' => $inv]); $out['after_delete'] = count(art_links_of($pdo, [$g]));
art_restore_item($pdo, ['item' => $snap['item']]); $out['after_restore'] = count(art_links_of($pdo, [$g]));
// coordonnées des lieux (hors limites → null) ; demande inconnue
$c = sciences_api_get($pdo, ['op' => 'coords', 'ids' => '1,2,999,abc']); $out['coords'] = array_map(static fn($p) => [$p['name'], $p['lat'], $p['lon']], $c['places']);
try { sciences_api_get($pdo, ['op' => 'x']); $out['bad_op'] = false; } catch (Throwable $e) { $out['bad_op'] = true; }
// identifiants
$out['ids'] = [sciences_orcid('https://orcid.org/0000-0002-1825-0097'), sciences_orcid('0000-0002-1825-0098'), sciences_doi('https://doi.org/10.1038/251123a0'), sciences_doi('doi: 10.1000/xyz'), sciences_doi('pas un doi')];
// lecture des réponses (sans réseau)
$cr = sciences_from_crossref(['title' => ['Polyploidy in <i>Ophrys</i>'], 'container-title' => ['Nature'], 'volume' => '251', 'page' => '123-125', 'issued' => ['date-parts' => [[1974, 9, 27]]], 'DOI' => '10.1038/251123a0', 'author' => [['given' => 'Anne', 'family' => 'Martin'], ['given' => 'J.', 'family' => 'Dumas']], 'is-referenced-by-count' => 412, 'type' => 'journal-article']);
$out['crossref'] = [$cr['title'], $cr['year'], $cr['journal'], $cr['authors'], $cr['citations'], $cr['ptype'], $cr['url']];
$or = sciences_parse_orcid(['group' => [['work-summary' => [['title' => ['title' => ['value' => 'Ophrys of Lebanon']], 'publication-date' => ['year' => ['value' => '1970'], 'month' => ['value' => '05']], 'journal-title' => ['value' => 'Candollea'], 'type' => 'journal-article', 'external-ids' => ['external-id' => [['external-id-type' => 'doi', 'external-id-value' => '10.5169/abc']]]]]]]]);
$out['orcid'] = [$or[0]['title'], $or[0]['date'], $or[0]['doi'], $or[0]['ptype']];
$ha = sciences_parse_hal(['response' => ['docs' => [['title_s' => ['Cytologie'], 'producedDateY_i' => 1965, 'journalTitle_s' => 'Rev. cytol.', 'halId_s' => 'hal-0001', 'authFullName_s' => ['Anne Martin'], 'docType_s' => 'COMM', 'uri_s' => 'https://hal.science/hal-0001', 'issue_s' => ['3']]]]]);
$out['hal'] = [$ha[0]['title'], $ha[0]['year'], $ha[0]['hal'], $ha[0]['ptype'], $ha[0]['issue'], $ha[0]['url']];
$errs = [];
foreach ([['source' => 'crossref', 'dois' => 'rien'], ['source' => 'orcid', 'id' => '1234'], ['source' => 'hal', 'q' => ''], ['source' => 'autre']] as $q) { try { sciences_remote($q); $errs[] = ''; } catch (Throwable $e) { $errs[] = $e->getMessage(); } }
$out['remote_errors'] = $errs;
echo json_encode($out, JSON_UNESCAPED_UNICODE);
`;
const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media') } });
if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
const out = JSON.parse(r.stdout.trim().split('\n').pop());

/* ── 2. le navigateur, sans navigateur : les fichiers chargés dans une machine virtuelle ── */
const store = {};
const stubEl = () => ({addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], dataset: {}, classList: {add() {}, remove() {}, toggle() {}}});
const win = {LCNDA_EXT: {}, localStorage: {getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }},
    LCNDA_APP: {plural: (n, w, pl) => `${n} ${n > 1 ? (pl || `${w}s`) : w}`, toast() {}, api: async () => ({result: {}})}};
const ctx = vm.createContext({window: win, document: {...stubEl(), documentElement: stubEl(), body: stubEl(), createElement: stubEl}, localStorage: win.localStorage, console, setTimeout, clearTimeout, URL, CSS: {escape: s => s}, Event: class {}, CustomEvent: class {}, Audio: class {}, location: {href: 'http://x/'}});
ctx.globalThis = ctx;
['heritage-artist.js', 'heritage-artist-fields.js', 'heritage-artist-panel.js', 'heritage-artist-music.js', 'heritage-artist-art.js', 'heritage-artist-books.js', 'heritage-artist-film.js',
    'heritage-sciences.js', 'heritage-sciences-explore.js', 'heritage-sciences-profile.js', 'heritage-artist-page.js', 'heritage-artist-list.js', 'heritage-artist-import.js', 'heritage-artist-catalogue.js']
    .forEach(f => vm.runInContext(fs.readFileSync(path.join(appRoot, 'assets/js', f), 'utf8'), ctx, {filename: f}));
const ART = win.LCNDA_ART, SC = ART.sci;
const st = new ART.Store(2); st.person = {first_name: 'Anne', last_name: 'Martin', gender: 'female', profiles: [{profile_key: 'scientist'}]}; st.global = {}; st.settings = {};
const inv = {id: 10, person_id: 2, kind: 'invention', title: 'Sécateur <script>x</script>', year: 1950, sort: 1, data: {title: 'Sécateur <script>x</script>', date: 'vers 1950', domain: 'Outillage', place: {plid: 1, title: 'Laguenne'},
    patents: [{country: 'FR', no: 'FR 1 054 321', status: 'tombe', end: '1972', main: true, title: 'Sécateur à commande', claims: 'Une\nDeux\nTrois', cls: 'A01G 3/02', cited_by: '4'}, {country: 'BE', no: '518 207', status: 'tombe'}, {country: 'IT', status: 'refuse'}],
    licences: [{company: {empid: 3, title: 'Pradier'}, years: '1954-1972'}]}};
const disc = {id: 11, person_id: 2, kind: 'discovery', title: 'Comète Martin', year: 1959, sort: 2, data: {title: 'Comète Martin', dkind: 'comete', spec: {designation: 'C/1959 K1', taxon: 'ne doit pas sortir'}, recognition: 'contestee', honoree: {pid: 2, title: 'Anne MARTIN'}}};
const prof = {id: 12, person_id: 2, kind: 'profile_scientist', title: 'Anne', sort: 1, data: {title: 'Anne', thesis_date: '1962', thesis_director: {pname: 'Pr H. Garrigues'}, students: [{who: {pname: 'M. Roux'}, year: '1983'}], students_total: '11', named_after: [{what: 'asteroide', name: '(31042) Annemartin'}]}};
st.items = [inv, disc, prof]; st.byId = new Map(st.items.map(i => [i.id, i]));
st.cited = [{id: 50, kind: 'profile_scientist', title: 'Jean', person_id: 3, person: 'Jean DUMAS', fields: ['thesis_director'], roles: []}, {id: 51, kind: 'discovery', title: 'Ophrys annae', year: 1981, person_id: 3, person: 'Jean DUMAS', fields: ['honoree'], roles: []}];
const hInv = ART.readHtml(st, inv), hDisc = ART.readHtml(st, disc);
const C = {store: st, pid: 2, S: {}};
const sec = k => ART.pageSections[k].render(C, {});
const checks = [
    ['serveur : nos sortes acceptées, une sorte inconnue refusée', () => assert.deepEqual(out.kinds, [true, true, true, true, true, false])],
    ['sans profil : refusée avec un message clair (et pas « Artiste »)', () => { assert.match(out.refused, /Inventeur/); assert.doesNotMatch(out.refused, /Artiste/); }],
    ['… le profil demandé est coché, la fiche n’est pas « Artiste »', () => { assert.equal(out.profiles1, 'inventor'); assert.equal(out.not_artist, 0); }],
    ['index : inventeurs, employeur (licence), lieu, lien entre inventions, brevets dans item_rows, année « vers 1950 »', () => assert.deepEqual(out.index, [2, 1, 1, 1, 2, 1950])],
    ['une seule fiche de profil scientifique par personne', () => assert.deepEqual(out.profile, [true, true, 1])],
    ['« Lié à » : l’élève qui la cite comme directrice de thèse', () => assert.deepEqual(out.cited, [['profile_scientist', ['thesis_director']]])],
    ['plusieurs publications d’un coup (import)', () => assert.equal(out.batch, 2)],
    ['menu de choix : pas de fiche de profil ; ligne grise d’une publication', () => { assert.ok(!out.picker[0].some(k => k.startsWith('profile'))); assert.match(out.picker[1], /Nature · 1974 · DOI 10\.1038\/251123a0/); assert.equal(out.picker_kind, '🔬'); }],
    ['supprimer puis « ↶ Annuler » : le lien revient', () => { assert.equal(out.after_delete, 0); assert.equal(out.after_restore, 1); }],
    ['coordonnées des lieux (valeur impossible → vide), demande inconnue refusée', () => { assert.deepEqual(out.coords, [['Laguenne', 45.24, 1.78], ['Nulle part', null, null]]); assert.equal(out.bad_op, true); }],
    ['ORCID vérifié par sa clé, DOI nettoyé', () => assert.deepEqual(out.ids, ['0000-0002-1825-0097', '', '10.1038/251123a0', '10.1000/xyz', ''])],
    ['Crossref : titre sans balises, année, revue, auteurs, citations', () => assert.deepEqual(out.crossref, ['Polyploidy in Ophrys', '1974', 'Nature', ['Anne Martin', 'J. Dumas'], 412, 'article', 'https://doi.org/10.1038/251123a0'])],
    ['ORCID et HAL lus sans réseau', () => { assert.deepEqual(out.orcid, ['Ophrys of Lebanon', '1970-05', '10.5169/abc', 'article']); assert.deepEqual(out.hal, ['Cytologie', '1965', 'hal-0001', 'communication', '3', 'https://hal.science/hal-0001']); }],
    ['import : erreurs claires (DOI, ORCID, nom vide, source inconnue)', () => { assert.match(out.remote_errors[0], /DOI/); assert.match(out.remote_errors[1], /ORCID/); assert.match(out.remote_errors[2], /nom/); assert.match(out.remote_errors[3], /inconnue/); }],
    ['navigateur : sortes et fiches de profil définies', () => ['invention', 'discovery', 'paper', 'expedition', 'profile_scientist', 'profile_inventor', 'profile_explorer'].forEach(k => assert.ok(ART.defs[k], k))],
    ['profils déclarés (ART.profiles) avec leur fiche, leurs sortes et un résumé', () => ['inventor', 'scientist', 'explorer'].forEach(k => { const p = ART.profiles[k]; assert.equal(p.type, `profile_${k}`); assert.ok(p.kinds.length); assert.equal(typeof p.summary, 'function'); })],
    ['sections de page rattachées à leurs profils, modèles de départ', () => { assert.deepEqual(JSON.parse(JSON.stringify(ART.pageSections.sci_inventions.profiles)), ['inventor', 'scientist']); assert.equal(ART.pageSections.exp_map.profile, 'explorer'); assert.ok(ART.models.scientifique.order.includes('sci_genealogy')); assert.ok(ART.models.explorateur && ART.models.inventeur); }],
    ['invention : brevets pays par pays, « 3 pays », statut, brevet principal en carte, revendications', () => { assert.match(hInv, /3 pays · 1 famille de brevets/); assert.match(hInv, /tombé \(1972\)/); assert.match(hInv, /BREVET FR 1 054 321/); assert.match(hInv, /Revendications \(3\)/); assert.match(hInv, /BE 518 207/); assert.match(hInv, /refusé/); assert.match(hInv, /espacenet\.com\/patent\/search\?q=pn%3DFR1054321/); assert.match(hInv, /4 brevets ultérieurs/); }],
    ['invention : texte échappé (pas de <script>)', () => { assert.doesNotMatch(hInv, /<script>/); assert.match(hInv, /&lt;script&gt;/); }],
    ['découverte : les champs de la sorte (comète), pas ceux d’une autre', () => { assert.match(hDisc, /Désignation/); assert.match(hDisc, /C\/1959 K1/); assert.doesNotMatch(hDisc, /ne doit pas sortir/); assert.match(hDisc, /contestée/); }],
    ['filiation : le directeur de thèse, l’élève de la base (qui la cite), « + » jusqu’à 11', () => { const h = sec('sci_genealogy').body; assert.match(h, /Garrigues/); assert.match(h, /Jean DUMAS/); assert.match(h, /M\. Roux/); assert.match(h, /\(11\)/); assert.match(h, /\+ 9/); }],
    ['« Porte son nom » : la ligne du profil, sa découverte à son nom, celle d’un autre catalogue', () => { const h = sec('sci_named').body; assert.match(h, /Annemartin/); assert.match(h, /Comète Martin/); assert.match(h, /Ophrys annae/); assert.match(h, /nommée par Jean DUMAS/); }],
    ['inventions : « 3 brevets » et drapeaux', () => assert.match(sec('sci_inventions').body, /3 brevets \(🇫🇷 🇧🇪 🇮🇹\)/)],
    ['coordonnées écrites à la main', () => { assert.deepEqual(JSON.parse(JSON.stringify(SC.parseCoords('45.24 N, 1.78 E'))), [45.24, 1.78]); assert.deepEqual(JSON.parse(JSON.stringify(SC.parseCoords('12,5 S ; 45,2 O'))), [-12.5, -45.2]); assert.equal(SC.parseCoords('200, 5'), null); assert.equal(SC.parseCoords('n’importe'), null); }],
    ['import : l’auteur reconnu (« A. Martin », « Martin, Anne »), pas un homonyme', () => { assert.ok(SC.isSelf(st, 'A. Martin')); assert.ok(SC.isSelf(st, 'Martin, Anne')); assert.ok(!SC.isSelf(st, 'Paul Martin')); assert.ok(!SC.isSelf(st, 'Anne Dupont')); const d = SC.pubToData(st, {title: 'T', authors: ['Anne Martin', 'J. Dumas'], journal: 'Nature'}); assert.deepEqual(JSON.parse(JSON.stringify(d.authors)), [{pid: 2, title: 'Anne MARTIN'}, {pname: 'J. Dumas'}]); }],
    ['cellule « employeur » d’un tableau (ART.cellTypes) : pastille cliquable, texte', () => { assert.match(ART.cellTypes.employer.read({}, {empid: 3, title: 'Pradier <b>'}), /data-sc-emp="Pradier &lt;b&gt;"/); assert.equal(ART.cellTypes.employer.text({}, {txt: 'Muséum'}), 'Muséum'); }],
];
let failed = 0;
for (const [name, fn] of checks) { try { fn(); console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + e.message); } }
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${checks.length - failed} vérifications réussies${failed ? `, ${failed} échec(s)` : ''}.`);
process.exitCode = failed ? 1 : 0;
