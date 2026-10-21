'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Test du moteur des catalogues d'artistes :   node tests/test-artist.js
 *  1. côté serveur (lib/art_engine.php, lib/artist_catalog.php) sur une base temporaire : migration n°47 (artist_items → items),
 *     fiche refusée sur une personne non « Artiste », index des personnes et des liens (les deux côtés), années avant l'an 1000,
 *     suppression + « ↶ Annuler », rangement d'un élément inconnu, menu de choix « artwork », types créés par l'utilisateur,
 *     fusion de deux fiches ;
 *  2. côté navigateur (assets/js/heritage-artist*.js chargés dans une machine virtuelle) : définitions, champs affichés,
 *     lecture d'une fiche, pluriels, import Discogs (rôles en français, crédits par piste, intertitres, matrices, date).
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
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-artist-'));
const code = String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
// une base d'avant : la table artist_items avec un disque
$p0->exec("CREATE TABLE artist_items (id INTEGER PRIMARY KEY AUTOINCREMENT, person_id INTEGER NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', year INTEGER, data TEXT NOT NULL DEFAULT '{}', sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
$p0->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Joseph','Martin','male'),('Pierre','Martin','male'),('Louise','Borie','female'),('Paul','Borie','male')");
$p0->exec("INSERT INTO artist_items(id,person_id,kind,title,year,data) VALUES(7,1,'release','Ancien disque',1958,'{\"title\":\"Ancien disque\",\"artist\":\"Joseph Martin\",\"credits\":[{\"role\":\"Accordéon\",\"name\":\"Pierre\"}]}')");
$p0 = null;
require 'lib/bootstrap.php';
$pdo = db();
$pdo->exec('UPDATE persons SET is_artist=1 WHERE id=1'); $pdo->exec("INSERT OR IGNORE INTO person_profiles(person_id, profile_key) VALUES(1, 'artist')");
$out = [];
$out['version'] = (int) $pdo->query('PRAGMA user_version')->fetchColumn();
$out['migrated'] = [(int) $pdo->query("SELECT count(*) FROM items WHERE id=7 AND type_key='release'")->fetchColumn(), (string) $pdo->query("SELECT type FROM sqlite_master WHERE name='artist_items'")->fetchColumn(), (int) $pdo->query("SELECT count(*) FROM person_profiles WHERE person_id=1 AND profile_key='artist'")->fetchColumn()];
// refusée sur une fiche non « Artiste », sauf si on demande de la cocher
try { save_artist_item($pdo, ['person_id' => 2, 'kind' => 'work', 'data' => ['title' => 'X']]); $out['refused'] = false; } catch (Throwable $e) { $out['refused'] = str_contains($e->getMessage(), 'Artiste'); }
$w = save_artist_item($pdo, ['person_id' => 2, 'kind' => 'work', 'make_artist' => 1, 'data' => ['title' => 'Vase', 'date' => 'vers 845']]);
$out['made_artist'] = (int) $pdo->query('SELECT is_artist FROM persons WHERE id=2')->fetchColumn();
$out['year845'] = [(int) $pdo->query('SELECT year FROM items WHERE id=' . $w['id'])->fetchColumn(), (int) $pdo->query('SELECT date_min FROM items WHERE id=' . $w['id'])->fetchColumn(), (int) $pdo->query('SELECT date_max FROM items WHERE id=' . $w['id'])->fetchColumn()];
try { save_artist_item($pdo, ['person_id' => 1, 'kind' => 'pas_une_sorte', 'data' => ['title' => 'X']]); $out['badkind'] = false; } catch (Throwable $e) { $out['badkind'] = true; }
// index : un morceau, un enregistrement, un disque dont la piste pointe vers l'enregistrement
$m = save_artist_item($pdo, ['person_id' => 1, 'kind' => 'track_work', 'data' => ['title' => 'La complainte', 'lyricist' => ['pid' => 1, 'title' => 'Joseph MARTIN']]])['id'];
$r = save_artist_item($pdo, ['person_id' => 1, 'kind' => 'recording', 'parent_id' => $m, 'data' => ['title' => 'Prise 3', 'rkind' => 'prise', 'work' => ['iid' => $m, 'title' => 'La complainte'], 'studio' => ['plid' => 99, 'title' => 'Studio']]])['id'];
$d = save_artist_item($pdo, ['person_id' => 1, 'kind' => 'release', 'data' => ['title' => 'Paris canaille', 'released' => 'mars 1958', 'tracks' => [['pos' => 'A2', 'title' => 'La complainte', 'dur' => '2:58', 'rec' => ['iid' => $r, 'title' => 'Prise 3']]],
    'credits' => [['pid' => 2, 'title' => 'Pierre', 'role' => 'Accordéon', 'tracks' => 'B1'], ['pname' => 'René Dufour', 'role' => 'Prise de son']], 'dedicatee' => ['pid' => 3, 'title' => 'Louise']]])['id'];
$out['rows'] = [(int) $pdo->query("SELECT count(*) FROM item_rows WHERE item_id={$d} AND field='tracks'")->fetchColumn(), (int) $pdo->query("SELECT count(*) FROM item_rows WHERE item_id={$d} AND field='credits'")->fetchColumn()];
$l = art_links_of($pdo, [$r]);
$out['links'] = array_map(static fn($x) => [$x['type'], $x['from'] === $r ? 'out' : 'in', $x['data']['pos'] ?? ''], $l); sort($out['links']);
$out['place_link'] = (int) $pdo->query("SELECT count(*) FROM item_links WHERE from_id={$r} AND to_type='place' AND to_id=99")->fetchColumn();
$out['parent'] = (int) $pdo->query("SELECT parent_id FROM items WHERE id={$r}")->fetchColumn() === $m;
$out['cited'] = array_map(static fn($x) => [$x['title'], $x['roles']], art_person_cited($pdo, 2));
$out['free_name'] = (int) $pdo->query("SELECT count(*) FROM item_people WHERE item_id={$d} AND person_id IS NULL AND name='René Dufour' AND role='Prise de son'")->fetchColumn();
// supprimer puis remettre (« ↶ Annuler ») : mêmes numéros, liens revenus
$snap = delete_artist_item($pdo, ['person_id' => 1, 'id' => $r]);
$out['after_delete'] = count(art_links_of($pdo, [$d]));
art_restore_item($pdo, ['item' => $snap['item']]);
$out['after_restore'] = count(art_links_of($pdo, [$d]));
try { delete_artist_item($pdo, ['person_id' => 1, 'id' => 99999]); $out['del_unknown'] = false; } catch (Throwable $e) { $out['del_unknown'] = true; }
try { reorder_artist_items($pdo, ['person_id' => 1, 'ids' => [$d, 99999]]); $out['reorder_unknown'] = false; } catch (Throwable $e) { $out['reorder_unknown'] = true; }
reorder_artist_items($pdo, ['person_id' => 1, 'ids' => [$d, $m]]); $out['reordered'] = (int) $pdo->query("SELECT sort_order FROM items WHERE id={$m}")->fetchColumn();
// le menu de choix « artwork »
$pk = picker_art_items($pdo, 'canaille', 0, 10, ['art_kind' => 'release']); $out['picker'] = [$pk['total'], $pk['items'][0]['title'] ?? '', $pk['items'][0]['icon'] ?? ''];
// un type créé par l'utilisateur, avec ses champs (type_fields) et un lien permis (type_links)
$t = art_save_type($pdo, ['label' => 'Char de carnaval', 'def' => ['many' => 'Chars de carnaval', 'icon' => '🎠', 'domain' => 'autre', 'groups' => [['key' => 'main', 'label' => 'Le char', 'fields' => [['key' => 'title', 'label' => 'Titre', 'type' => 'text', 'star' => true], ['key' => 'builders', 'label' => 'Constructeurs', 'type' => 'people', 'star' => true], ['key' => 'music', 'label' => 'Musique', 'type' => 'item', 'kinds' => ['track_work'], 'star' => true]]]]]]);
$ty = art_types_all($pdo); $out['type'] = [$t['key'], $ty[0]['def']['groups'][0]['fields'][1]['type'] ?? '', (int) $pdo->query("SELECT count(*) FROM type_links WHERE from_type='{$t['key']}' AND to_type='track_work'")->fetchColumn()];
$c = save_artist_item($pdo, ['person_id' => 1, 'kind' => $t['key'], 'data' => ['title' => 'Le grand char', 'builders' => [['pid' => 4, 'title' => 'Paul', 'role' => 'chef']]]]); $out['type_item'] = $c['id'] > 0;
// une seule fiche de profil par personne
$p1 = save_artist_item($pdo, ['person_id' => 1, 'kind' => 'profile', 'data' => ['title' => 'Jo']])['id']; $p2 = save_artist_item($pdo, ['person_id' => 1, 'kind' => 'profile', 'data' => ['title' => 'Jo Martin']])['id'];
$out['profile'] = [$p1 === $p2, (int) $pdo->query("SELECT item_id FROM person_profiles WHERE person_id=1 AND profile_key='artist'")->fetchColumn() === $p1];
// réglages
art_save_settings($pdo, ['key' => 'global', 'data' => ['hideEmpty' => false, 'kinds' => ['release' => ['custom' => [['key' => 'c_x', 'label' => 'Écouté sur', 'type' => 'list']]]]]]);
$out['settings'] = art_boot($pdo, 1)['settings']['global']['kinds']['release']['custom'][0]['label'];
try { art_save_settings($pdo, ['key' => 'n_importe', 'data' => []]); $out['bad_setting'] = false; } catch (Throwable $e) { $out['bad_setting'] = true; }
// fusion : Paul (4) dans Pierre (2) — la pastille du char suit
art_merge_person($pdo, 4, 2);
$out['merge'] = [(int) $pdo->query("SELECT count(*) FROM item_people WHERE person_id=2 AND item_id={$c['id']}")->fetchColumn(), str_contains((string) $pdo->query("SELECT data FROM items WHERE id={$c['id']}")->fetchColumn(), '"pid":2')];
$out['bounds'] = [art_date_bounds('entre 1880 et 1885'), art_date_bounds('avant 1800'), art_date_bounds('vers 1784'), art_date_bounds('12 juin 1987')];
echo json_encode($out);
`;
const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media') } });
if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
const out = JSON.parse(r.stdout.trim().split('\n').pop());

/* ── 2. le navigateur, sans navigateur : les fichiers chargés dans une machine virtuelle ── */
const store = {};
const stubEl = () => ({addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], dataset: {}, classList: {add() {}, remove() {}, toggle() {}}});
const fakeApi = {calls: []};
const win = {LCNDA_EXT: {}, localStorage: {getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }},
    LCNDA_APP: {plural: (n, w, pl) => `${n} ${n > 1 ? (pl || `${w}s`) : w}`, toast() {}, api: async (action, q, o) => { fakeApi.calls.push([action, o?.body]); return {result: fakeApi.reply(o?.body || q)}; }}};
const ctx = vm.createContext({window: win, document: {...stubEl(), documentElement: stubEl(), body: stubEl(), createElement: stubEl}, localStorage: win.localStorage, console, setTimeout, clearTimeout, URL, CSS: {escape: s => s}, Event: class {}, CustomEvent: class {}, Audio: class {}, location: {href: 'http://x/'}});
ctx.globalThis = ctx;
['heritage-artist.js', 'heritage-artist-fields.js', 'heritage-artist-panel.js', 'heritage-artist-music.js', 'heritage-artist-art.js', 'heritage-artist-books.js', 'heritage-artist-film.js', 'heritage-artist-page.js', 'heritage-artist-list.js', 'heritage-artist-import.js', 'heritage-artist-catalogue.js']
    .forEach(f => vm.runInContext(fs.readFileSync(path.join(appRoot, 'assets/js', f), 'utf8'), ctx, {filename: f}));
const ART = win.LCNDA_ART;
const st = new ART.Store(1); st.person = {first_name: 'Joseph', last_name: 'Martin', gender: 'male'}; st.global = {}; st.settings = {};
const rel = {id: 5, person_id: 1, kind: 'release', title: 'Paris canaille', year: 1958, sort: 1, data: {title: 'Paris canaille', artist: {pid: 1, title: 'Joseph MARTIN'}, label: {txt: 'Polydor'}, catno: '21 812', format: 'Vinyle · 7″ · 45 tours',
    tracks: [{pos: 'A1', title: 'Paris canaille', dur: '2:41'}, {pos: 'A2', title: 'La complainte', dur: '2:58'}], credits: [{pid: 2, title: 'Pierre MARTIN', role: 'Accordéon', tracks: 'A2'}], barcode: '123'}};
const one = {...rel, id: 6, data: {...rel.data, tracks: [{pos: '1', title: 'Seul', dur: '3:00'}]}};
st.items = [rel, one]; st.byId = new Map(st.items.map(i => [i.id, i]));
const html = ART.readHtml(st, rel), html1 = ART.readHtml(st, one);
fakeApi.reply = body => (body.what === 'release' ? {id: 249504, title: 'Never', year: 1987, released: '1987-03-12', country: 'UK', genres: ['Pop'], styles: ['Synth-pop'],
    artists: [{name: 'Rick Astley'}], labels: [{name: 'RCA (2)', catno: 'PB 41447'}], formats: [{name: 'Vinyl', qty: '1', descriptions: ['7"', '45 RPM', 'Single']}],
    identifiers: [{type: 'Barcode', value: '5012'}, {type: 'Matrix / Runout', value: 'PB 41447 A-1'}, {type: 'Matrix / Runout', value: 'PB 41447 B-1'}, {type: 'Rights Society', value: 'BIEM'}],
    extraartists: [{name: 'Stock, Aitken & Waterman', role: 'Producer'}, {name: 'Pete Waterman', role: 'Keyboards', tracks: 'B'}],
    tracklist: [{type_: 'heading', title: 'Face A'}, {position: 'A', title: 'Never', duration: '3:32', extraartists: [{name: 'Rick Astley', role: 'Vocals'}]}, {position: 'B', title: 'Instrumental', duration: '3:30'}], images: [{uri: 'https://i.discogs.com/x.jpg'}]} : {});
(async () => {
    const disc = JSON.parse(JSON.stringify(await ART.discogsItem('release', '249504'))); // objets de la machine virtuelle → objets d'ici
    const L = ART.layout(st, 'release', 'fiche'), shown = L.groups.flatMap(g => g.fields).filter(f => f.on).map(f => f.key);
    ART.setVisible(st, 'release', 'fiche', 'barcode', true);
    const L2 = ART.layout(st, 'release', 'fiche');
    const checks = [
        ['structure à jour (n° de lib/migrations.php)', () => assert.equal(out.version, Number(require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'lib/migrations.php'), 'utf8').match(/const SCHEMA_VERSION = (\d+);/)[1]))],
        ['migration : artist_items recopiée dans items (même numéro), profil « Artiste » créé', () => assert.deepEqual(out.migrated, [1, '', 1])],
        ['fiche non « Artiste » : refusée avec un message clair', () => assert.equal(out.refused, true)],
        ['… ou cochée « Artiste » quand on le demande', () => assert.equal(out.made_artist, 1)],
        ['année avant l’an 1000 (« vers 845 » : 845, bornes 840 – 850)', () => assert.deepEqual(out.year845, [845, 840, 850])],
        ['sorte inconnue refusée', () => assert.equal(out.badkind, true)],
        ['liens lisibles des deux côtés (piste A2 → enregistrement → morceau)', () => assert.deepEqual(out.links, [['tracks', 'in', 'A2'], ['work', 'out', '']])],
        ['lien vers un lieu indexé, parent_id (morceau → enregistrement)', () => { assert.equal(out.place_link, 1); assert.equal(out.parent, true); }],
        ['« Lié à » sur la fiche de Pierre : « Paris canaille », accordéon', () => assert.deepEqual(out.cited, [['Paris canaille', ['Accordéon']]])],
        ['lignes répétées copiées dans item_rows (1 piste, 2 crédits)', () => assert.deepEqual(out.rows, [1, 2])],
        ['nom sans fiche gardé dans item_people', () => assert.equal(out.free_name, 1)],
        ['supprimer puis « ↶ Annuler » : les liens reviennent', () => { assert.equal(out.after_delete, 0); assert.equal(out.after_restore, 1); }],
        ['supprimer ou ranger un élément inconnu : erreur claire', () => { assert.equal(out.del_unknown, true); assert.equal(out.reorder_unknown, true); assert.equal(out.reordered, 2); }],
        ['menu de choix « artwork » (sorte « release »)', () => assert.deepEqual(out.picker, [1, 'Paris canaille', '💿'])],
        ['type créé par l’utilisateur : item_types + type_fields + type_links, et ses fiches', () => { assert.deepEqual(out.type, ['t_char_de_carnaval', 'people', 1]); assert.equal(out.type_item, true); }],
        ['une seule fiche de profil par personne (person_profiles la retient)', () => assert.deepEqual(out.profile, [true, true])],
        ['réglages : enregistrés, relus ; clé inconnue refusée', () => { assert.equal(out.settings, 'Écouté sur'); assert.equal(out.bad_setting, true); }],
        ['fusion de deux fiches : la pastille suit (JSON et index)', () => assert.deepEqual(out.merge, [1, true])],
        ['bornes des dates (entre, avant, vers, date complète)', () => assert.deepEqual(out.bounds, [[1880, 1885], [null, 1800], [1779, 1789], [1987, 1987]])],
        ['définitions intégrées chargées (disque, morceau, enregistrement, œuvre, exposition, livre, film…)', () => ['release', 'master', 'track_work', 'recording', 'work', 'exhibition', 'book', 'text', 'copy', 'film', 'org', 'profile', 'concert'].forEach(k => assert.ok(ART.defs[k], k))],
        ['champs affichés : ★ au départ, code-barres masqué puis affiché', () => { assert.ok(shown.includes('catno')); assert.ok(!shown.includes('barcode')); assert.ok(L2.groups.flatMap(g => g.fields).find(f => f.key === 'barcode').on); }],
        ['lecture : « 2 titres · 5:39 », label et n° de catalogue ensemble, crédit d’une piste', () => { assert.match(html, /2 titres · 5:39/); assert.match(html, /Polydor/); assert.match(html, /21 812/); assert.match(html, /Accordéon/); }],
        ['pluriel : « 1 titre » (pas « 1 titres »)', () => { assert.match(html1, /1 titre · 3:00/); assert.doesNotMatch(html1, /1 titres/); }],
        ['Discogs : rôles en français, crédits par piste, intertitres', () => { assert.equal(disc.data.tracks[0].heading, true); assert.deepEqual(disc.data.tracks[1].credits, [{role: 'Chant', pname: 'Rick Astley'}]); assert.deepEqual(disc.data.tracks[2].credits, [{role: 'Claviers', pname: 'Pete Waterman'}]); assert.deepEqual(disc.data.credits, [{role: 'Production', pname: 'Stock, Aitken & Waterman'}]); }],
        ['Discogs : matrices, autres identifiants, date à la française, format de l’édition', () => { assert.equal(disc.data.matrix_a, 'PB 41447 A-1'); assert.equal(disc.data.matrix_b, 'PB 41447 B-1'); assert.equal(disc.data.runout[0].value, 'BIEM'); assert.equal(disc.data.released, '12 mars 1987'); assert.equal(disc.data.label.txt, 'RCA'); assert.match(disc.data.format, /Vinyl · 7" · 45 RPM/); assert.equal(disc.data.rtype, 'single'); }],
    ];
    let failed = 0;
    for (const [name, fn] of checks) { try { fn(); console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + e.message); } }
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`\n${checks.length - failed} vérifications réussies${failed ? `, ${failed} échec(s)` : ''}.`);
    process.exitCode = failed ? 1 : 0;
})();
