'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Test du domaine « Scène » (maquettes U, V, W, X) :   node tests/test-scene.js
 *  1. côté serveur, sur une base temporaire : les sortes concert / tournée / sketch / rôle / série / saison / épisode / profil
 *     d'acteur acceptées par le moteur, la chaîne série → saison → épisode (parent_id), les personnes d'une setlist et d'une
 *     série indexées (« Lié à »), une seule fiche de profil d'acteur, les coordonnées des lieux (lib/scene.php) ;
 *  2. côté navigateur (assets/js/heritage-artist*.js + heritage-scene*.js dans une machine virtuelle) : dates d'un soir,
 *     lecture d'une setlist (rappels R1, entracte, reprise, texte échappé), titres les plus joués (1re et dernière fois),
 *     setlist type d'une tournée, liste collée, anciennes fiches de concert remises au format, « S3 ép. 2-7 (6 épisodes) »,
 *     la filmographie rassemblée (rôles, films, séries, rôles du soir), le profil acteur et ses sections.
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
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-scene-'));
const code = String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p0->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Joseph','Martin','male'),('Pierre','Martin','male'),('Louise','Borie','female')");
$p0->exec("INSERT INTO places(name,country,latitude,longitude) VALUES('Tulle','France',45.267,1.771),('Nulle part','',0,0)");
$p0 = null;
require 'lib/bootstrap.php';
require_once 'lib/scene.php';
$pdo = db();
$pdo->exec('UPDATE persons SET is_artist=1 WHERE id IN (1,3)');
$S = fn($pid, $kind, $data, $parent = 0) => art_save_item($pdo, ['person_id' => $pid, 'kind' => $kind, 'data' => $data, 'parent_id' => $parent])['id'];
$out = [];
$song = $S(1, 'track_work', ['title' => 'Paris canaille']);
$tour = $S(1, 'tour', ['title' => 'Été 1958', 'dates' => 'été 1958']);
$c = $S(1, 'concert', ['skind' => 'concert', 'title' => 'Tulle 1958', 'date' => '14/07/1958', 'place' => ['plid' => 1, 'title' => 'Tulle'], 'tour' => ['iid' => $tour, 'title' => 'Été 1958', 'kind' => 'tour'],
    'setlist' => [['work' => ['iid' => $song, 'title' => 'Paris canaille', 'kind' => 'track_work'], 'guests' => [['pid' => 2, 'title' => 'Pierre MARTIN', 'role' => 'accordéon']]], ['t' => 'encore', 'work' => ['txt' => 'Les cerisiers']]],
    'cast_night' => [['role' => 'Mélanie', 'who' => ['pid' => 3, 'title' => 'Louise BORIE'], 'status' => 'remplacant']]]);
$out['concert'] = [(int) $pdo->query("SELECT year FROM items WHERE id=$c")->fetchColumn(), (int) $pdo->query("SELECT place_id FROM items WHERE id=$c")->fetchColumn(),
    (int) $pdo->query("SELECT count(*) FROM item_rows WHERE item_id=$c AND field='setlist'")->fetchColumn(),
    (string) $pdo->query("SELECT role FROM item_people WHERE item_id=$c AND person_id=2")->fetchColumn(), (string) $pdo->query("SELECT role FROM item_people WHERE item_id=$c AND person_id=3")->fetchColumn(),
    (int) $pdo->query("SELECT count(*) FROM item_links WHERE from_id=$c AND to_type='item' AND to_id=$tour AND kind='tour'")->fetchColumn()];
$ser = $S(3, 'series', ['title' => 'Le Commissaire', 'skind' => 'serie_tv', 'dates' => '1958 – 1996']);
$sea = $S(3, 'season', ['title' => 'Saison 3', 'no' => '3', 'series' => ['iid' => $ser, 'title' => 'Le Commissaire', 'kind' => 'series']], $ser);
$ep = $S(3, 'episode', ['title' => 'Une affaire de famille', 'no' => '2', 'season' => ['iid' => $sea, 'title' => 'Saison 3', 'kind' => 'season']], $sea);
art_save_item($pdo, ['person_id' => 3, 'kind' => 'series', 'id' => $ser, 'data' => ['title' => 'Le Commissaire', 'skind' => 'serie_tv', 'dates' => '1958 – 1996', 'participants' => [['who' => ['pid' => 3, 'title' => 'Louise BORIE'], 'mode' => 'role', 'role' => 'Mme Pichon', 'character' => 'Mme Pichon', 'rkind' => 'recurrent', 'eps' => [$ep]]]]]);
$out['chain'] = [(int) $pdo->query("SELECT parent_id FROM items WHERE id=$sea")->fetchColumn() === $ser, (int) $pdo->query("SELECT parent_id FROM items WHERE id=$ep")->fetchColumn() === $sea, (int) $pdo->query("SELECT year FROM items WHERE id=$ser")->fetchColumn()];
$out['series_people'] = (string) $pdo->query("SELECT role FROM item_people WHERE person_id=3 AND field='participants'")->fetchColumn();
$r = $S(3, 'role', ['title' => 'Mme Lacombe', 'domain' => 'cinema', 'character' => 'Mme Lacombe', 'year' => '1959', 'partners' => [['pid' => 1, 'title' => 'Joseph MARTIN', 'role' => 'le boucher']]]);
$out['role'] = [(int) $pdo->query("SELECT year FROM items WHERE id=$r")->fetchColumn(), (string) $pdo->query("SELECT role FROM item_people WHERE item_id=$r AND person_id=1")->fetchColumn()];
$pdo->prepare("INSERT OR IGNORE INTO profiles(key, label, icon, origin) VALUES('actor','Acteur','🎬','builtin')")->execute();
$p1 = $S(3, 'profile_actor', ['title' => 'Louise Bory']); $p2 = $S(3, 'profile_actor', ['title' => 'Louise Bory', 'languages' => 'occitan']);
$out['profile'] = [$p1 === $p2, (int) $pdo->query("SELECT item_id FROM person_profiles WHERE person_id=3 AND profile_key='actor'")->fetchColumn() === $p1];
try { $S(1, 'scene_inconnue', ['title' => 'x']); $out['bad'] = false; } catch (Throwable $e) { $out['bad'] = true; }
$out['places'] = scene_places($pdo, '1,2,x,-3,99');
try { scene_api_get($pdo, ['op' => 'nimporte']); $out['badop'] = false; } catch (Throwable $e) { $out['badop'] = true; }
$out['types'] = (string) $pdo->query("SELECT icon FROM item_types WHERE key='series'")->fetchColumn();
$out['boot'] = count(array_filter(art_boot($pdo, 3)['items'], static fn($i) => in_array($i['kind'], ['series', 'season', 'episode', 'role'], true)));
echo json_encode($out);
`;
const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media') } });
if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
const out = JSON.parse(r.stdout.trim().split('\n').pop());

/* ── 2. le navigateur, sans navigateur ── */
const store = {};
const stubEl = () => ({addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], dataset: {}, classList: {add() {}, remove() {}, toggle() {}}});
const win = {LCNDA_EXT: {}, localStorage: {getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }},
    LCNDA_APP: {plural: (n, w, pl) => `${n} ${n > 1 ? (pl || `${w}s`) : w}`, toast() {}, emptyState: o => `<div class="empty">${o.text}</div>`, api: async () => ({})}};
const ctx = vm.createContext({window: win, document: {...stubEl(), documentElement: stubEl(), body: stubEl(), createElement: stubEl}, localStorage: win.localStorage, console, setTimeout, clearTimeout, URL, CSS: {escape: s => s}, Event: class {}, CustomEvent: class {}, Audio: class {}, location: {href: 'http://x/'}});
ctx.globalThis = ctx;
['heritage-artist.js', 'heritage-artist-fields.js', 'heritage-artist-panel.js', 'heritage-artist-music.js', 'heritage-artist-art.js', 'heritage-artist-books.js', 'heritage-artist-film.js', 'heritage-artist-page.js', 'heritage-artist-list.js',
    'heritage-scene.js', 'heritage-scene-list.js', 'heritage-scene-actor.js', 'heritage-scene-series.js']
    .forEach(f => vm.runInContext(fs.readFileSync(path.join(appRoot, 'assets/js', f), 'utf8'), ctx, {filename: f}));
const ART = win.LCNDA_ART, SC = ART.scene;
const mk = (pid, items, person = {}) => { const st = new ART.Store(pid); st.person = {first_name: 'Joseph', last_name: 'Martin', gender: 'male', ...person}; st.global = {}; st.settings = {}; st.items = items; st.byId = new Map(items.map(i => [i.id, i])); st.cited = []; return st; };
const song = (id, title) => ({id, person_id: 1, kind: 'track_work', title, sort: id, data: {title}});
const conc = (id, date, setlist, extra = {}) => ({id, person_id: 1, kind: 'concert', title: `Soir ${id}`, year: Number(String(date).slice(-4)), sort: id, data: {skind: 'concert', title: `Soir ${id}`, date, setlist, ...extra}});
const ref = (s) => ({iid: s.id, title: s.title, kind: 'track_work'});
const A1 = song(1, 'Paris canaille'), A2 = song(2, 'Fin de bal'), A3 = song(3, 'Valse pour Jeanne');
const tour = {id: 9, person_id: 1, kind: 'tour', title: 'Été 1958', sort: 1, data: {title: 'Été 1958'}};
const c1 = conc(10, '14/07/1958', [{work: ref(A1), first: true}, {work: ref(A2), cover: {pname: 'J.-B. Clément'}}, {t: 'interlude', work: {txt: 'Entracte'}}, {t: 'encore', work: {txt: 'Paris canaille'}, unfinished: true}, {work: {txt: '<b>X</b>'}}], {tour: {iid: 9, title: 'Été 1958', kind: 'tour'}});
const c2 = conc(11, '2 mai 1966', [{work: ref(A2)}, {work: ref(A1)}], {tour: {iid: 9, title: 'Été 1958', kind: 'tour'}});
const old = {id: 12, person_id: 1, kind: 'concert', title: 'Ancien', year: 1950, sort: 3, data: {title: 'Ancien', tour: 'Vieille tournée', program: [{work: ref(A2), note: 'bis'}], musicians: [{pid: 2, title: 'Pierre', role: 'accordéon'}]}};
ART.defs.concert.upgrade(old.data);
const st = mk(1, [A1, A2, A3, tour, c1, c2, old]);
SC.late();
const html = ART.readHtml(st, c1);
const stats = SC.playStats(st), type = SC.typeSetlist(st, SC.tourDates(st, 9));
// la série (X) et l'actrice (W)
const ser = {id: 20, person_id: 3, kind: 'series', title: 'Le Commissaire', sort: 1, data: {title: 'Le Commissaire', skind: 'serie_tv', dates: '1958 – 1996', participants: []}};
const s3 = {id: 21, person_id: 3, kind: 'season', title: 'Saison 3', sort: 1, data: {no: '3', series: {iid: 20, title: 'Le Commissaire', kind: 'series'}}};
const eps = [1, 2, 3, 4, 5, 6, 7, 8].map(n => ({id: 30 + n, person_id: 3, kind: 'episode', title: `Épisode ${n}`, sort: n, data: {no: String(n), season: {iid: 21, title: 'Saison 3', kind: 'season'}}}));
ser.data.participants = [{who: {pid: 3, title: 'Louise BORIE'}, mode: 'role', character: 'Mme Pichon', rkind: 'recurrent', eps: [32, 33, 34, 35, 36, 37]}, {who: {pid: 3, title: 'Louise BORIE'}, mode: 'job', job: 'scénariste', eps: [38]}];
const film = {id: 40, person_id: 3, kind: 'film', title: 'Rue des Bouchers', year: 1959, sort: 1, data: {title: 'Rue des Bouchers', jobs: 'actrice', role: 'Mme Lacombe', fkind: 'long'}};
const film2 = {id: 41, person_id: 3, kind: 'film', title: 'Mon film', year: 1970, sort: 2, data: {title: 'Mon film', jobs: 'réalisation'}};
const role = {id: 42, person_id: 3, kind: 'role', title: 'Mme Lacombe', year: 1959, sort: 1, data: {domain: 'cinema', character: 'Mme Lacombe', rkind: 'secondaire', work: {iid: 40, title: 'Rue des Bouchers', kind: 'film'}, year: '1959'}};
const play = {id: 50, person_id: 3, kind: 'concert', title: 'La Veillée 1', year: 1951, sort: 1, data: {skind: 'theatre', show: 'La Veillée', date: '3/3/1951', cast_night: [{role: 'Mélanie', who: {pid: 3, title: 'Louise BORIE'}, status: 'creation'}]}};
const play2 = {...play, id: 51, data: {...play.data, date: '4/3/1951', cast_night: [{role: 'Mélanie', who: {pid: 3, title: 'Louise BORIE'}, status: 'remplacant'}]}};
const st3 = mk(3, [ser, s3, ...eps, film, film2, role, play, play2], {first_name: 'Louise', last_name: 'Borie', gender: 'female', profiles: [{profile_key: 'actor'}]});
const entries = SC.actorEntries(st3);
const checks = [
    ['serveur : un soir rangé (année, lieu, 2 lignes de setlist, invité « accordéon », rôle du soir, lien vers la tournée)', () => assert.deepEqual(out.concert, [1958, 1, 2, 'accordéon', 'Mélanie', 1])],
    ['serveur : série → saison → épisode (parent_id), année de la série', () => assert.deepEqual(out.chain, [true, true, 1958])],
    ['serveur : la personne d’une série indexée avec son personnage', () => assert.equal(out.series_people, 'Mme Pichon')],
    ['serveur : un rôle (année, partenaire indexé)', () => assert.deepEqual(out.role, [1959, 'le boucher'])],
    ['serveur : une seule fiche de profil d’acteur, retenue dans person_profiles', () => assert.deepEqual(out.profile, [true, true])],
    ['serveur : sorte inconnue refusée', () => assert.equal(out.bad, true)],
    ['serveur : coordonnées des lieux (0,0 = sans coordonnées ; ids invalides ignorés) ; demande inconnue refusée', () => { assert.equal(out.places.places.length, 2); assert.equal(out.places.places[0].lat, 45.267); assert.equal(out.places.places[1].lat, null); assert.equal(out.badop, true); }],
    ['serveur : le type « série » a son icône (menu de choix), le catalogue charge les nouvelles sortes', () => { assert.equal(out.types, '📺'); assert.equal(out.boot, 4); }],
    ['définitions chargées (concert, tournée, sketch, rôle, série, saison, épisode, profil acteur)', () => ['concert', 'tour', 'stage_piece', 'role', 'series', 'season', 'episode', 'profile_actor'].forEach(k => assert.ok(ART.defs[k], k))],
    ['dates d’un soir : 14/07/1958, « 1er mai 1966 », « juillet 1958 », « 1958-07-14 »', () => { assert.equal(SC.dayOf('14/07/1958').k, 19580714); assert.equal(SC.dayOf('1er mai 1966').k, 19660501); assert.equal(SC.dayOf('juillet 1958').k, 19580700); assert.equal(SC.dayOf('1958-07-14').k, 19580714); assert.equal(SC.dayOf('n’importe'), null); assert.equal(SC.dayLabel(SC.dayOf('14/07/1958')), '14 juillet 1958'); }],
    ['horaires : 20 h 45 – 22 h 17 = 1 h 32 ; après minuit aussi', () => { assert.equal(SC.durationText({data: {start: '20 h 45', end: '22 h 17'}}), '1 h 32'); assert.equal(SC.durationText({data: {start: '23:30', end: '0:40'}}), '1 h 10'); }],
    ['lecture d’une setlist : numéros, rappel R1, entracte, reprise, 1re fois, inachevé', () => { assert.match(html, />R1</); assert.match(html, /Rappel/); assert.match(html, /Entracte/); assert.match(html, /reprise/); assert.match(html, /1re fois en public/); assert.match(html, /inachevé/); }],
    ['lecture : le texte d’une ligne est échappé', () => { assert.doesNotMatch(html, /<b>X<\/b>/); assert.match(html, /&lt;b&gt;X/); }],
    ['« 4 titres · 1 rappel » (pas « 1 rappels »)', () => assert.equal(ART.views.setlist.meta(ART.ctx(st, c1), c1), '4 titres · 1 rappel')],
    ['titres les plus joués : un titre en texte rapproché de sa fiche ; 1re et dernière fois', () => { const x = stats.get('i1'); assert.equal(x.n, 2); assert.equal(x.first.c.id, 10); assert.equal(x.last.c.id, 11); }],
    ['setlist type d’une tournée : place 1, rappel R1', () => { assert.equal(type[0].pos, '1'); assert.equal(type[0].n, 1); assert.ok(type.some(t => t.pos === 'R1')); }],
    ['anciennes fiches de concert : programme → setlist, musiciens → sur scène, tournée en texte', () => { assert.equal(old.data.setlist.length, 1); assert.equal(old.data.setlist[0].note, 'bis'); assert.equal(old.data.on_stage[0].role, 'accordéon'); assert.deepEqual(JSON.parse(JSON.stringify(old.data.tour)), {txt: 'Vieille tournée'}); assert.equal(old.data.program, undefined); }],
    ['liste collée : numéros enlevés, « (note) », « Rappel : », rapprochée des fiches', () => { const l = JSON.parse(JSON.stringify(SC.parseList('1. Paris canaille\n2) Inconnu (version longue)\nRappel :\n- Fin de bal', st))); assert.equal(l.length, 3); assert.equal(l[0].work.iid, 1); assert.deepEqual(l[1], {work: {txt: 'Inconnu'}, note: 'version longue'}); assert.equal(l[2].t, 'encore'); assert.equal(l[2].work.iid, 2); }],
    ['la setlist s’adapte : sketches pour l’humour, scènes pour le théâtre', () => { assert.equal(SC.genre('humour').list, 'Sketches'); assert.equal(SC.kindsFor('humour')[0], 'stage_piece'); assert.ok(SC.kindsFor('concert').includes('track_work')); }],
    ['série : « S3 ép. 2-7 (6 épisodes) »', () => assert.equal(SC.epsLabel(st3, ser, [32, 33, 34, 35, 36, 37]), 'S3 ép. 2-7 (6 épisodes)')],
    ['filmographie : rôle détaillé (pas de doublon avec son film), film sans rôle d’acteur écarté, série (rôle et métier), rôles du soir regroupés', () => {
        const keys = JSON.parse(JSON.stringify(entries.map(e => e.src).sort())); assert.deepEqual(keys, ['role', 'series', 'series', 'stage']);
        const s = entries.find(e => e.src === 'series' && !e.job); assert.equal(s.eps, 'S3 ép. 2-7 (6 épisodes)');
        const th = entries.find(e => e.src === 'stage'); assert.equal(th.counted, 2); assert.equal(th.subst, 1); assert.equal(th.creation, true); }],
    ['profil acteur : déclaré, ses sections de page (profil « actor »), modèle « Acteur, actrice »', () => { assert.equal(ART.profiles.actor.type, 'profile_actor'); assert.ok(SC.ACTOR_SECTIONS.every(k => ART.pageSections[k]?.profile === 'actor')); assert.ok(ART.models.acteur.order.includes('actor_roles')); assert.ok(ART.models.cineaste.order.includes('actor_roles')); }],
    ['sections de page : rendues sans erreur', () => { const C = {store: st3, pid: 3}; SC.ACTOR_SECTIONS.forEach(k => { const r2 = ART.pageSections[k].render(C, {}); assert.equal(typeof r2.body, 'string', k); }); }],
    ['fiche d’une série et d’un rôle : lues sans erreur', () => { assert.match(ART.readHtml(st3, ser), /Saison/); assert.match(ART.readHtml(st3, role), /Mme Lacombe/); assert.match(ART.readHtml(st3, play), /Rôles du soir|Mélanie/); }],
];
let failed = 0;
for (const [name, fn] of checks) { try { fn(); console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + e.message); } }
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${checks.length - failed} vérifications réussies${failed ? `, ${failed} échec(s)` : ''}.`);
process.exitCode = failed ? 1 : 0;
