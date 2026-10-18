'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Garde-fous des outils « œuvres et profils » (artistes, blocs, profils, scène, sciences, œuvres) :   node tests/test-domaines-securite.js
 *  1. côté serveur, base temporaire : fiche verrouillée (enregistrer, supprimer, remettre par « ↶ Annuler », profils, blocs),
 *     fiche d'une autre personne, sortes forgées, réglages et profils à clé forgée, art_boot dit « verrouillée »,
 *     pièce de métier d'art rangée dans le profil « Artisan d'art » (et pas « Artiste »), lecture d'une fiche sans écriture
 *     (house_links_lookup ne crée pas de table : « database is locked » quand on enregistre en même temps) ;
 *  2. côté navigateur (machine virtuelle) : données de forme inattendue remises d'aplomb (ART.sane, ART.arr), encre lisible
 *     sur la couleur d'un profil (PF.ink), « Cocher Artisan d'art » pour une pièce de métier d'art ;
 *  3. fichiers : pas de classe .sc-… commune à scene.css et sciences.css, la case « Apparence » sombre ignore les fonds de
 *     cartes clairs, les boutons qui modifient sont cachés en lecture seule (artist.css).
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
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-secu-'));
const code = String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p0->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Joseph','Martin','male'),('Paul','Verrou','male'),('Anne','Dufour','female')");
$p0 = null;
require 'lib/bootstrap.php';
require 'tests/api_functions.php';
$pdo = db();
$out = [];
$try = static function (callable $f): string { try { $f(); return 'ok'; } catch (Throwable $e) { return $e->getMessage(); } };
art_make_artist($pdo, 1); art_make_artist($pdo, 2);
$w1 = art_save_item($pdo, ['person_id' => 1, 'kind' => 'work', 'data' => ['title' => 'Le moulin']])['id'];
$w2 = art_save_item($pdo, ['person_id' => 2, 'kind' => 'work', 'data' => ['title' => 'La grange']])['id'];
$b2 = blocs_save_item($pdo, ['person_id' => 2, 'kind' => 'award', 'data' => ['title' => 'Prix']])['id'];
$snap = art_delete_item($pdo, ['person_id' => 2, 'id' => $w2]);
$pdo->exec('UPDATE persons SET is_locked=1 WHERE id=2');
$out['locked'] = [
    $try(fn() => art_save_item($pdo, ['person_id' => 2, 'kind' => 'work', 'data' => ['title' => 'x']])),
    $try(fn() => art_restore_item($pdo, ['item' => $snap['item']])),
    $try(fn() => profils_set_many($pdo, ['person_id' => 2, 'on' => [['key' => 'sport']], 'off' => []])),
    $try(fn() => blocs_save_item($pdo, ['person_id' => 2, 'kind' => 'award', 'id' => $b2, 'data' => ['title' => 'y']])),
    $try(fn() => blocs_delete_item($pdo, ['id' => $b2])),
    $try(fn() => art_reorder_items($pdo, ['person_id' => 2, 'ids' => []])),
];
$out['boot_locked'] = [(int) art_boot($pdo, 2)['person']['is_locked'], (int) art_boot($pdo, 1)['person']['is_locked']];
$pdo->exec('UPDATE persons SET is_locked=0 WHERE id=2');
$out['restore_unlocked'] = $try(fn() => art_restore_item($pdo, ['item' => $snap['item']]));
$out['other'] = $try(fn() => art_save_item($pdo, ['person_id' => 2, 'kind' => 'work', 'id' => $w1, 'data' => ['title' => 'volée']]));
$out['kinds'] = [$try(fn() => art_save_item($pdo, ['person_id' => 1, 'kind' => '../x', 'data' => []])), $try(fn() => art_save_item($pdo, ['person_id' => 1, 'kind' => 'profile_zzz', 'data' => []])),
    $try(fn() => blocs_save_item($pdo, ['person_id' => 1, 'kind' => 'work', 'data' => []])), $try(fn() => art_save_settings($pdo, ['key' => "global' --", 'data' => []])),
    $try(fn() => art_set_profile($pdo, ['person_id' => 1, 'profile' => "x'); DROP TABLE persons;--", 'on' => 1]))];
$out['title_kept'] = (string) $pdo->query("SELECT title FROM items WHERE id={$w1}")->fetchColumn();
// une pièce de métier d'art : profil « Artisan d'art » coché tout seul (pas « Artiste »), avec son vrai nom
$f = art_save_item($pdo, ['person_id' => 3, 'kind' => 'o_ferronnerie', 'data' => ['title' => 'Grille']])['id'];
$out['craft'] = [$f > 0, (string) $pdo->query("SELECT group_concat(profile_key) FROM person_profiles WHERE person_id=3")->fetchColumn(), (string) $pdo->query("SELECT label FROM profiles WHERE key='artisan'")->fetchColumn(), (int) $pdo->query('SELECT is_artist FROM persons WHERE id=3')->fetchColumn()];
$out['sculpture_needs_artist'] = $try(fn() => art_save_item($pdo, ['person_id' => 3, 'kind' => 'o_sculpture', 'data' => ['title' => 'La Pensée']]));
// lire la fiche ne crée pas de table (pas d'écriture pendant une lecture)
$pdo->exec('DROP TABLE IF EXISTS houses'); $pdo->exec('DROP TABLE IF EXISTS house_models');
$out['houses_read'] = [house_links_lookup($pdo, 1, 0), (int) $pdo->query("SELECT count(*) FROM sqlite_master WHERE name='houses'")->fetchColumn()];
// la liste « Cette personne était… » et les réglages des pages (Maintenance)
art_save_settings($pdo, ['key' => 'global', 'data' => ['ppage' => ['profColors' => ['artist' => '#0e9aa7', 'sport' => 'red;x'], 'widths' => ['pf_frise' => '¾']]]]);
art_save_settings($pdo, ['key' => 'person:1', 'data' => ['own' => true, 'ppage' => ['widths' => ['pf_frise' => '⅔']]]]);
$pl = profils_people($pdo); $ps = profils_page_settings($pdo); $pg = profils_get($pdo, 0);
$out['people'] = [array_map(static fn($p) => [$p['first_name'], $p['profiles'], $p['own']], $pl['people']), array_column($ps['people'], 'id'), $ps['global']['ppage']['widths']['pf_frise'], (array) $pg['prof_colors']];
echo json_encode($out);
`;
const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media') } });
if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
const out = JSON.parse(r.stdout.trim().split('\n').pop());

/* ── 2. le navigateur, sans navigateur ── */
const store = {};
const stubEl = () => ({addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], dataset: {}, classList: {add() {}, remove() {}, toggle() {}, contains: () => false}});
const writes = []; let asked = '';
const win = {LCNDA_EXT: {}, localStorage: {getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }},
    LCNDA_APP: {plural: (n, w, pl) => `${n} ${n > 1 ? (pl || `${w}s`) : w}`, toast() {}, confirmBox: async m => { asked = m; return true; },
        api: async (action, q, o) => { writes.push(o?.body || q); return {result: {id: 77}, defs: [], profiles: []}; }}};
const ctx = vm.createContext({window: win, document: {...stubEl(), documentElement: stubEl(), body: stubEl(), createElement: stubEl}, localStorage: win.localStorage, console, setTimeout, clearTimeout, URL, CSS: {escape: s => s}, Event: class {}, CustomEvent: class {}, Audio: class {}, location: {href: 'http://x/'}, MutationObserver: undefined});
ctx.globalThis = ctx;
['heritage-artist.js', 'heritage-artist-fields.js', 'heritage-artist-panel.js', 'heritage-artist-music.js', 'heritage-artist-art.js', 'heritage-artist-books.js', 'heritage-artist-film.js', 'heritage-artist-page.js', 'heritage-artist-list.js',
    'heritage-oeuvres-types.js', 'heritage-oeuvres.js', 'heritage-oeuvres-fiches.js', 'heritage-oeuvres-metiers.js', 'heritage-profils.js', 'heritage-profils-liste.js']
    .forEach(f => vm.runInContext(fs.readFileSync(path.join(appRoot, 'assets/js', f), 'utf8'), ctx, {filename: f}));
const ART = win.LCNDA_ART;
const css = n => fs.readFileSync(path.join(appRoot, 'assets/css', n), 'utf8');
const classes = t => new Set((t.match(/\.sc-[a-z0-9-]+/g) || []));

(async () => {
    const st = new ART.Store(3); st.person = {first_name: 'Anne', last_name: 'Dufour', profiles: [], is_artist: 0}; st.global = {}; st.settings = {};
    const id = await ART.saveItem(st, 'o_ferronnerie', 0, {title: 'Grille'});
    const setProf = writes.find(w => w && w.op === 'set_profile');
    const sane = ART.sane('release', {title: 12, tracks: 'pas une liste', credits: {pid: 1}, photos: {f: 'a.jpg'}});
    const checks = [
        ['fiche verrouillée : enregistrer, remettre (↶ Annuler), profils, blocs, rangement refusés', () => out.locked.forEach((m, i) => assert.match(m, /verrouillée/, `cas ${i}`))],
        ['art_boot dit si la fiche est verrouillée (le catalogue passe en lecture seule)', () => assert.deepEqual(out.boot_locked, [1, 0])],
        ['déverrouillée : « ↶ Annuler » remet la fiche', () => assert.equal(out.restore_unlocked, 'ok')],
        ['la fiche d’une autre personne ne se modifie pas en changeant person_id', () => { assert.match(out.other, /introuvable/); assert.equal(out.title_kept, 'Le moulin'); }],
        ['sortes, réglages et profils à clé forgée refusés', () => { assert.match(out.kinds[0], /inconnue/); assert.match(out.kinds[1], /inconnue/); assert.match(out.kinds[2], /inconnue/); assert.match(out.kinds[3], /inconnu/); assert.match(out.kinds[4], /inconnu/); }],
        ['métier d’art : profil « Artisan d’art » (pas « Artiste ») coché avec son nom', () => assert.deepEqual(out.craft, [true, 'artisan', 'Artisan d’art', 0])],
        ['une sculpture demande toujours « Artiste »', () => assert.match(out.sculpture_needs_artist, /Artiste/)],
        ['lire une fiche ne crée pas de table (pas de « base verrouillée »)', () => assert.deepEqual(out.houses_read, [[], 0])],
        ['navigateur : « Cocher Artisan d’art ? » pour une ferronnerie, puis enregistrement', () => { assert.match(asked, /Artisan d’art/); assert.equal(setProf?.profile, 'artisan'); assert.equal(id, 77); }],
        ['navigateur : données de forme inattendue remises d’aplomb (ART.sane, ART.arr)', () => { assert.equal(sane.title, '12'); assert.deepEqual(JSON.parse(JSON.stringify(sane.tracks)), []); assert.equal(sane.photos.length, 1); assert.deepEqual(JSON.parse(JSON.stringify(ART.arr('x'))), []); }],
        ['encre lisible sur la couleur d’un profil (jaune → foncé, violet → blanc)', () => { assert.equal(ART.PF.ink('#e1a500'), '#111'); assert.equal(ART.PF.ink('#7b2ff7'), '#fff'); assert.equal(ART.PF.ink('red;x'), '#fff'); }],
        ['scene.css et sciences.css n’ont plus de classe en commun', () => { const a = classes(css('scene.css')), b = classes(css('sciences.css')); assert.deepEqual([...a].filter(x => b.has(x)), []); }],
        ['mode sombre : les fonds de cartes clairs ne s’appliquent pas (app.js)', () => assert.match(fs.readFileSync(path.join(appRoot, 'assets/js/app.js'), 'utf8'), /const cardBg=preset\.dark\?cardBackgrounds\.white:/)],
        ['lecture seule : les boutons qui modifient sont cachés (artist.css)', () => { const c = css('artist.css'); ['[data-ar-cmd="edit"]', '[data-pf-choose]', '[data-ar-cmd="new"]', '[data-ar-cmd="delete"]'].forEach(s => assert.ok(c.includes(`.ar-ro ${s}`), s)); }],
        ['liste « Cette personne était… » : personnes avec profils, page personnalisée ; réglages des pages ; couleur de profil vérifiée', () => { const ppl = out.people[0]; assert.ok(ppl.some(([n, k, own]) => n === 'Joseph' && k.includes('artist') && own === true)); assert.ok(ppl.some(([n, k]) => n === 'Anne' && k.includes('artisan'))); assert.deepEqual(out.people[1], [1]); assert.equal(out.people[2], '¾'); assert.deepEqual(out.people[3], {artist: '#0e9aa7'}); }],
        ['liste enregistrée dans Listes (app.js, app-listes.js) et branchée (ext.lists, Maintenance)', () => { assert.match(fs.readFileSync(path.join(appRoot, 'assets/js/app.js'), 'utf8'), /\['profiles_list','44h',/); const l = fs.readFileSync(path.join(appRoot, 'assets/js/app-listes.js'), 'utf8'); assert.match(l, /const validTypes=\[[^\]]*'profiles_list'/); assert.match(l, /'occupations', 'profiles_list'/); assert.equal(typeof win.LCNDA_EXT.lists.profiles_list, 'function'); assert.ok(win.LCNDA_EXT.designPanels.length >= 1); assert.match(win.LCNDA_EXT.designPanels[0](), /FICHES PERSONNES<\/span><h3>Cette personne était… \(profils\)/); }],
        ['largeurs des sections : toute la ligne, ¾, ⅔, ½, ⅓ (classes w-9 et w-8)', () => { assert.deepEqual(JSON.parse(JSON.stringify(ART.PAGE_WIDTHS.map(w => w[0]))), ['ligne', '¾', '⅔', '½', '⅓']); assert.equal(ART.PAGE_WIDTH_CLASS['¾'], 'w-9'); assert.equal(ART.PAGE_WIDTH_CLASS['⅔'], 'w-8'); assert.match(ART.widthOptions('⅔'), /value="⅔" selected/); assert.match(css('artist.css'), /\.ar-blk\.w-9 \{ grid-column: span 9; \}/); }],
        ['couleur du liseré : la section, sinon le profil ; « Aucune » = pas de liseré ; un code forgé est ignoré', () => { assert.equal(ART.secColor({a: '#123456'}, 'a', '#7b2ff7'), '#123456'); assert.equal(ART.secColor({a: 'none'}, 'a', '#7b2ff7'), ''); assert.equal(ART.secColor({a: 'red;x:url(y)'}, 'a', '#7b2ff7'), '#7b2ff7'); assert.equal(ART.secColor({}, 'a'), '');
            const st2 = {person: {profiles: []}, global: {ppage: {profColors: {sport: '#000000'}}}, personSet: null}; assert.equal(ART.PF.colorIn(st2, 'sport'), '#000000'); ART.PF.profColors = {sport: '#111111'}; assert.equal(ART.PF.color('sport'), '#111111'); ART.PF.profColors = {}; }],
        ['aperçu du livre (papier) : titres en encre sombre aussi en mode sombre', () => assert.match(css('artist.css'), /data-theme="dark"\] \.ar-spread \.no, :root\[data-theme="dark"\] \.ar-spread \.lbl \{ color: #8a6a3a; \}/)],
    ];
    let failed = 0;
    for (const [name, fn] of checks) { try { fn(); console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); } }
    fs.rmSync(dir, {recursive: true, force: true});
    if (failed) { console.error(`${failed} vérification(s) en échec.`); process.exit(1); }
    console.log(`${checks.length} vérifications réussies.`);
})();
