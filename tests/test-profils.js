'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Test des profils d'une personne (🧩 « Cette personne était… », page combinée, politique, sport) :   node tests/test-profils.js
 *  1. côté serveur (lib/profils.php sur lib/art_engine.php), base temporaire : cocher plusieurs profils d'un coup, la case
 *     « Artiste » suit le profil « artist » (et l'inverse), fiches d'un profil sans être « Artiste », une seule fiche de profil
 *     par personne, fiche verrouillée refusée, menu de choix sans fiches de profil, profils de l'utilisateur (créer, refuser
 *     la suppression s'il est coché, supprimer puis remettre), données de la fiche (heritage) ;
 *  2. côté navigateur (heritage-artist*.js + heritage-profils*.js dans une machine virtuelle) : profils déclarés, groupes,
 *     doublons, sections, frise (périodes fusionnées, texte échappé), colonnes calculées, sports, page combinée.
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
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-profils-'));
const code = String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p0->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Pierre','Martin','male'),('Henri','Borie','male'),('Camille','Borie','female')");
$p0 = null;
require 'lib/bootstrap.php';
$pdo = db();
$out = [];
// plusieurs profils d'un coup ; « artist » coche aussi la case Artiste
$r = profils_set_many($pdo, ['person_id' => 1, 'on' => [['key' => 'artist'], ['key' => 'sport'], ['key' => 'military', 'label' => 'Militaire', 'icon' => '🎖']], 'off' => []]);
$out['set'] = [array_column($r['profiles'], 'key'), (int) $pdo->query('SELECT is_artist FROM persons WHERE id=1')->fetchColumn(), (string) $pdo->query("SELECT label FROM profiles WHERE key='sport'")->fetchColumn()];
$r = profils_set_many($pdo, ['person_id' => 1, 'on' => [['key' => 'sport'], ['key' => 'military']], 'off' => ['artist', 'BAD KEY']]);
$out['unset'] = [array_column($r['profiles'], 'key'), (int) $pdo->query('SELECT is_artist FROM persons WHERE id=1')->fetchColumn()];
// la case du formulaire suit (api.php → profils_sync_artist)
profils_sync_artist($pdo, 1, 1); $out['sync_on'] = in_array('artist', array_column(profils_of_person($pdo, 1), 'key'), true);
profils_sync_artist($pdo, 1, 0); $out['sync_off'] = in_array('artist', array_column(profils_of_person($pdo, 1), 'key'), true);
// une fiche de mandat sans être « Artiste » : le profil se coche tout seul
$m = art_save_item($pdo, ['person_id' => 2, 'kind' => 'pol_mandate', 'data' => ['title' => '<b>Maire</b> de Tulle', 'date' => '1947', 'end' => '1971', 'place' => ['plid' => 5, 'title' => 'Tulle']]])['id'];
$out['mandate'] = [$m > 0, (int) $pdo->query('SELECT COALESCE(is_artist,0) FROM persons WHERE id=2')->fetchColumn(), (int) $pdo->query("SELECT count(*) FROM person_profiles WHERE person_id=2 AND profile_key='politic'")->fetchColumn(), (int) $pdo->query("SELECT year FROM items WHERE id={$m}")->fetchColumn(), (string) $pdo->query("SELECT icon FROM item_types WHERE key='pol_mandate'")->fetchColumn()];
// déjà élu local : pas de profil « politic » en plus
profils_set_many($pdo, ['person_id' => 3, 'on' => [['key' => 'elu_local']], 'off' => []]);
art_save_item($pdo, ['person_id' => 3, 'kind' => 'pol_election', 'data' => ['title' => 'Municipales 2020']]);
$out['elu_local'] = $pdo->query('SELECT profile_key FROM person_profiles WHERE person_id=3 ORDER BY profile_key')->fetchAll(PDO::FETCH_COLUMN);
// une seule fiche de profil par personne et par profil, retenue dans person_profiles
$a = art_save_item($pdo, ['person_id' => 2, 'kind' => 'profile_politic', 'data' => ['title' => 'Maire']])['id'];
$b = art_save_item($pdo, ['person_id' => 2, 'kind' => 'profile_politic', 'data' => ['title' => 'Maire, député']])['id'];
$out['one_profile'] = [$a === $b, (int) $pdo->query("SELECT item_id FROM person_profiles WHERE person_id=2 AND profile_key='politic'")->fetchColumn() === $a];
// les artistes restent comme avant : un disque sur une fiche non « Artiste » est refusé
try { art_save_item($pdo, ['person_id' => 2, 'kind' => 'release', 'data' => ['title' => 'X']]); $out['artist_refused'] = false; } catch (Throwable $e) { $out['artist_refused'] = str_contains($e->getMessage(), 'Artiste'); }
// la fiche d'un profil inconnu est refusée
try { art_save_item($pdo, ['person_id' => 2, 'kind' => 'profile_inconnu', 'data' => ['title' => 'X']]); $out['unknown'] = false; } catch (Throwable $e) { $out['unknown'] = true; }
// menu de choix : pas de fiches de profil
$out['picker'] = [picker_art_items($pdo, 'Maire', 0, 10, [])['total'], picker_art_items($pdo, 'Maire', 0, 10, ['art_kind' => 'pol_mandate'])['total']];
// les profils de l'utilisateur
$u = profils_save_def($pdo, ['label' => 'Musicien de fanfare', 'icon' => '🎺', 'def' => ['color' => '#e1a500', 'sections' => [['key' => 's_instr', 'label' => 'Instruments', 'kind' => 'rows', 'cols' => ['instrument', 'de', 'à']], ['reuse' => 'concerts']]]]);
$u2 = profils_save_def($pdo, ['label' => 'Musicien de fanfare', 'icon' => '🎺', 'def' => ['color' => 'pas une couleur']]);
$out['user'] = [$u['key'], $u2['key'], (string) json_decode((string) $pdo->query("SELECT def FROM profiles WHERE key='{$u2['key']}'")->fetchColumn(), true)['color']];
profils_set_many($pdo, ['person_id' => 3, 'on' => [['key' => 'elu_local'], ['key' => $u['key']]], 'off' => []]);
$f = art_save_item($pdo, ['person_id' => 3, 'kind' => 'profile_' . $u['key'], 'data' => ['title' => 'Clairon', 's_instr' => [['c0' => 'clairon', 'from' => '1950']]]])['id'];
$out['user_fiche'] = $f > 0;
try { profils_delete_def($pdo, ['key' => $u['key']]); $out['del_used'] = false; } catch (Throwable $e) { $out['del_used'] = str_contains($e->getMessage(), 'coché'); }
try { profils_delete_def($pdo, ['key' => 'sport']); $out['del_builtin'] = false; } catch (Throwable $e) { $out['del_builtin'] = true; }
$snap = profils_delete_def($pdo, ['key' => $u2['key']]);
$out['deleted'] = (int) $pdo->query("SELECT count(*) FROM profiles WHERE key='{$u2['key']}'")->fetchColumn();
profils_save_def($pdo, ['key' => $snap['profile']['key'], 'label' => $snap['profile']['label'], 'icon' => $snap['profile']['icon'], 'def' => $snap['profile']['def']]);
$out['restored'] = (int) $pdo->query("SELECT count(*) FROM profiles WHERE key='{$u2['key']}'")->fetchColumn();
try { profils_save_def($pdo, ['key' => 'sport', 'label' => 'X']); $out['edit_builtin'] = false; } catch (Throwable $e) { $out['edit_builtin'] = true; }
// les données de la fiche (bloc « Cette personne était… ») et la lecture GET op=profiles
$out['heritage'] = array_column(heritage_person_data($pdo, 3)['profiles'] ?? [], 'key');
$out['get'] = count(art_api_get($pdo, ['op' => 'profiles', 'person_id' => 3])['defs']) >= 3;
// fiche verrouillée : rien ne se coche
$pdo->exec('UPDATE persons SET is_locked=1 WHERE id=3');
try { profils_set_many($pdo, ['person_id' => 3, 'on' => [['key' => 'sport']], 'off' => []]); $out['locked'] = false; } catch (Throwable $e) { $out['locked'] = str_contains($e->getMessage(), 'verrouillée'); }
try { profils_set_many($pdo, ['person_id' => 999, 'on' => [], 'off' => []]); $out['no_person'] = false; } catch (Throwable $e) { $out['no_person'] = true; }
echo json_encode($out, JSON_UNESCAPED_UNICODE);
`;
const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media') } });
if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
const out = JSON.parse(r.stdout.trim().split('\n').pop());

/* ── 2. le navigateur, sans navigateur ── */
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const stubEl = () => ({addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], dataset: {}, classList: {add() {}, remove() {}, toggle() {}}});
const mem = {};
const win = {LCNDA_EXT: {}, localStorage: {getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; }},
    LCNDA_APP: {plural: (n, w, pl) => `${n} ${n > 1 ? (pl || `${w}s`) : w}`, toast() {}, api: async () => ({}), emptyState: () => '', card: (i, title, count, body) => `<section><h3>${esc(title)}</h3>${body}</section>`}};
const ctx = vm.createContext({window: win, document: {...stubEl(), documentElement: stubEl(), body: stubEl(), createElement: stubEl}, localStorage: win.localStorage, console, setTimeout, clearTimeout, URL, CSS: {escape: s => s}, Event: class {}, CustomEvent: class {}, MutationObserver: class { observe() {} }, Audio: class {}, location: {href: 'http://x/'}});
ctx.globalThis = ctx;
['heritage-artist.js', 'heritage-artist-fields.js', 'heritage-artist-panel.js', 'heritage-artist-music.js', 'heritage-artist-art.js', 'heritage-artist-books.js', 'heritage-artist-film.js', 'heritage-sciences.js', 'heritage-sciences-explore.js', 'heritage-sciences-profile.js', 'heritage-artist-page.js', 'heritage-artist-list.js',
    'heritage-profils.js', 'heritage-profils-politique.js', 'heritage-profils-sport.js']
    .forEach(f => vm.runInContext(fs.readFileSync(path.join(appRoot, 'assets/js', f), 'utf8'), ctx, {filename: f}));
const ART = win.LCNDA_ART, PF = ART.PF;
const mk = (pid, person, items) => { const st = new ART.Store(pid); st.person = person; st.items = items; st.byId = new Map(items.map(i => [i.id, i])); st.global = {}; st.settings = {}; return st; };
const henri = mk(2, {first_name: 'Henri', last_name: 'Borie', gender: 'male', profiles: [{profile_key: 'politic'}]}, [
    {id: 1, kind: 'pol_mandate', title: '<img src=x onerror=alert(1)>', year: 1947, sort: 1, data: {title: '<img src=x onerror=alert(1)>', fn: 'maire', level: 'communal', date: '1947', end: '1971'}},
    {id: 2, kind: 'pol_mandate', title: 'Député', year: 1951, sort: 2, data: {title: 'Député', fn: 'depute', level: 'national', date: '1951', end: '1958'}},
    {id: 3, kind: 'pol_election', title: 'Législatives 1951', year: 1951, sort: 1, data: {title: 'Législatives 1951', date: '17 juin 1951', result: 'elu', votes: '38412'}},
    {id: 4, kind: 'pol_election', title: 'Législatives 1958', year: 1958, sort: 2, data: {title: 'Législatives 1958', date: '1958', result: 'battu'}}]);
const C = {store: henri, pid: 2, S: {view: 'page'}, dlg: {isConnected: false}, prefs: {}, paint() {}};
const camille = mk(3, {first_name: 'Camille', last_name: 'Borie', gender: 'female', is_artist: 1, profiles: [{profile_key: 'artist'}, {profile_key: 'sport'}]}, [
    {id: 9, kind: 'sp_club', title: 'CA Brive', year: 2010, sort: 1, data: {title: 'CA Brive', ckind: 'club', sport: 'rugby_xv', date: '2010', end: '2016'}},
    {id: 10, kind: 'sp_season', title: '2018-19', year: 2018, sort: 1, data: {title: '2018-19', scope: 'club', sport: 'rugby_xv', stats: {matches: '21', points: '70'}}},
    {id: 11, kind: 'sp_result', title: 'JO 2024', year: 2024, sort: 1, data: {title: 'JO 2024', medal: 'argent', date: '2024'}}]);
const C2 = {store: camille, pid: 3, S: {view: 'page'}, dlg: {isConnected: false}, prefs: {}, paint() {}};
camille.global.sportcols = {rugby_xv: {calc: [{key: 'k_ppm', label: 'Points par match', formula: 'Points / Matchs'}]}};
const mand = ART.pageSections.pol_mandates.render(C), hero = ART.profiles.politic.hero(C), rows = ART.profiles.politic.timeline(C), stats = ART.pageSections.sp_stats.render(C2, {});
const frise = PF.gantt([{label: '<b>x</b>', bars: [{a: 1947, b: 1971, text: '<script>'}]}]);
const all = PF.all(), labels = all.map(p => p.label);

const checks = [
    ['plusieurs profils d’un coup ; « Artiste » coche la case de la fiche', () => assert.deepEqual(out.set, [['artist', 'sport', 'military'], 1, 'Sportif · athlète'])],
    ['décocher « Artiste » : la case suit ; clé invalide ignorée', () => assert.deepEqual(out.unset, [['sport', 'military'], 0])],
    ['la case « Artiste » du formulaire suit le profil (et l’inverse)', () => { assert.equal(out.sync_on, true); assert.equal(out.sync_off, false); }],
    ['un mandat sans être « Artiste » : profil « politique » coché, année, sorte connue', () => assert.deepEqual(out.mandate, [true, 0, 1, 1947, '🏛'])],
    ['élu local : ses élections ne cochent pas « politique » en plus', () => assert.deepEqual(out.elu_local, ['elu_local'])],
    ['une seule fiche de profil par personne (retenue dans person_profiles)', () => assert.deepEqual(out.one_profile, [true, true])],
    ['les artistes comme avant (disque refusé sans « Artiste ») ; fiche d’un profil inconnu refusée', () => { assert.equal(out.artist_refused, true); assert.equal(out.unknown, true); }],
    ['menu de choix : pas de fiches de profil, mais les mandats', () => assert.deepEqual(out.picker, [1, 1])],
    ['profils de l’utilisateur : clé u_…, homonyme numéroté, couleur invalide remplacée, sa fiche', () => { assert.equal(out.user[0], 'u_musicien_de_fanfare'); assert.equal(out.user[1], 'u_musicien_de_fanfare_2'); assert.equal(out.user[2], '#7b2ff7'); assert.equal(out.user_fiche, true); }],
    ['supprimer un profil : refusé s’il est coché ou intégré ; sinon supprimé puis remis (« ↶ Annuler »)', () => { assert.equal(out.del_used, true); assert.equal(out.del_builtin, true); assert.equal(out.deleted, 0); assert.equal(out.restored, 1); assert.equal(out.edit_builtin, true); }],
    ['les profils dans les données de la fiche ; GET op=profiles', () => { assert.deepEqual(out.heritage, ['elu_local', 'u_musicien_de_fanfare']); assert.equal(out.get, true); }],
    ['fiche verrouillée : rien ne se coche ni ne s’écrit ; personne inconnue refusée', () => { assert.equal(out.locked, true); assert.equal(out.no_person, true); }],
    ['profils déclarés (politique, élu local, sportif, militaire, agriculteur…) et rangés par groupe', () => { ['artist', 'politic', 'elu_local', 'sport', 'military', 'farmer', 'teacher', 'clergy'].forEach(k => assert.ok(ART.profiles[k], k)); assert.equal(all.find(p => p.key === 'sport').group, 'aventure'); assert.equal(all.find(p => p.key === 'politic').group, 'public'); assert.equal(new Set(labels).size, labels.length); }],
    ['les profils de l’outil « sciences » (scientifique, inventeur, explorateur) dans leurs groupes', () => { const g = k => all.find(p => p.key === k)?.group; assert.equal(g('scientist'), 'savoir'); assert.equal(g('inventor'), 'savoir'); assert.equal(g('explorer'), 'aventure'); assert.ok(all.find(p => p.key === 'inventor').desc); }],
    ['un profil « sciences » seul : sa page avec son modèle (ART.models) et sa frise', () => { const st = mk(5, {first_name: 'Anne', profiles: [{profile_key: 'inventor'}]}, [{id: 30, kind: 'invention', title: 'Sécateur', year: 1950, sort: 1, data: {title: 'Sécateur'}}]); const c = PF.profileCfg(st, 'inventor'); assert.ok(c.order.length > 2); assert.equal(c.model, 'inventeur'); const t = PF.timelineOf({store: st}, 'inventor'); assert.equal(t[0].bars[0].a, 1950); }],
    ['un profil d’un autre outil passe avant un profil simple du même nom', () => { ART.profiles.explorer_x = {key: 'explorer_x', label: 'Alpiniste', icon: '🧗', group: 'aventure'}; const l = PF.all().filter(p => p.label === 'Alpiniste'); assert.equal(l.length, 1); assert.equal(l[0].key, 'explorer_x'); delete ART.profiles.explorer_x; }],
    ['sortes du moteur : mandats, élections, partis, textes, clubs, résultats, records, saisons, fiches de profil', () => ['pol_mandate', 'pol_election', 'pol_party', 'pol_text', 'pol_speech', 'pol_affair', 'profile_politic', 'sp_club', 'sp_result', 'sp_record', 'sp_season', 'profile_sport', 'profile_military'].forEach(k => assert.ok(ART.defs[k], k))],
    ['mandats : tableau, texte échappé', () => { assert.match(mand.body, /&lt;img src=x/); assert.doesNotMatch(mand.body, /<img src=x/); assert.equal(mand.count, 2); }],
    ['en-tête politique : « 2 mandats électifs · 2 élections (1 gagnée) »', () => { assert.match(hero.summary, /2 mandats électifs/); assert.match(hero.summary, /2 élections \(1 gagnée\)/); assert.match(hero.eyebrow, /HOMME POLITIQUE/); }],
    ['frise de carrière : une ligne par fonction ; texte échappé', () => { assert.equal(rows.length, 2); assert.match(frise, /&lt;script&gt;/); assert.doesNotMatch(frise, /<script>/); }],
    ['frise « Tout mélangé » : périodes qui se chevauchent fusionnées', () => assert.deepEqual(JSON.parse(JSON.stringify(PF.mergeBars([{a: 1950, b: 1960, text: 'A'}, {a: 1955, b: 1970, text: 'B'}, {a: 1980, b: 1980, text: 'C', id: 4}]))), [{a: 1950, b: 1970, text: 'A · B'}, {a: 1980, b: 1980, text: 'C', id: 4}])],
    ['colonnes calculées avec les noms des colonnes ; formule fausse refusée', () => { const cols = PF.statCols(camille, 'rugby_xv'); assert.equal(PF.calc('Points / Matchs', {points: 70, matches: 21}, cols), 3.33); assert.ok(Number.isNaN(PF.calc('Points / (Matchs', {}, cols))); assert.ok(Number.isNaN(PF.calc('foo * 2', {}, cols))); assert.match(stats.body, /3,33/); }],
    ['rugby : pénalités, transformations et drops cachées au départ', () => { const off = PF.statCols(henri, 'rugby_xv').filter(c => !c.on).map(c => c.key); assert.deepEqual([...off], ['pens', 'convs', 'drops']); }],
    ['plus de 120 sports, 13 familles', () => { assert.ok(PF.SPORTS.length >= 120, String(PF.SPORTS.length)); assert.equal(Object.keys(PF.SPORT_FAMILIES).length, 13); }],
    ['page combinée : profils de la personne, sections communes et celles des profils', () => { const cfg = PF.allCfg(camille); assert.deepEqual([...cfg.profOrder], ['artist', 'sport']); assert.equal(cfg.owner.sp_clubs, 'sport'); assert.equal(cfg.owner.discography, 'artist'); assert.equal(cfg.owner.pf_frise, 'common'); assert.ok(PF.isCombined(camille)); assert.ok(!PF.isCombined(mk(1, {is_artist: 1}, []))); }],
    ['l’en-tête du catalogue : artiste seul, un profil, plusieurs', () => { assert.equal(ART.pageHead(mk(1, {is_artist: 1}, [])).eyebrow, 'ARTISTE · SA PAGE'); assert.equal(ART.pageHead(henri).icon, '🗳'); assert.match(ART.pageHead(camille).eyebrow, /2 PROFILS/); }],
    ['le bloc de la fiche « Cette personne était… » (échappé)', () => { const h = win.LCNDA_EXT.personBlocks.profiles(0, {person: {id: 1, first_name: 'P'}, heritage: {profiles: [{key: 'sport', label: 'Sportif'}, {key: 'u_x', label: '<b>X</b>', icon: '🎺'}]}}); assert.match(h, /Sportif · athlète/); assert.match(h, /&lt;b&gt;X/); assert.match(h, /data-pf-choose-pid="1"/); }],
];
let failed = 0;
for (const [name, fn] of checks) { try { fn(); console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + e.message); } }
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${checks.length - failed} vérifications réussies${failed ? `, ${failed} échec(s)` : ''}.`);
process.exitCode = failed ? 1 : 0;
