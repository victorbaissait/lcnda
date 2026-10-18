'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Test des blocs communs à toute personne (📰 Dans les médias, 🏆 Concours et récompenses, 🎓 Diplômes et formation) :
 *     node tests/test-blocs.js
 *  1. côté serveur (lib/blocs.php, sur le moteur lib/art_engine.php) sur une base temporaire : fiche d'une personne qui
 *     n'est pas « Artiste », sorte ou personne inconnue refusée, fiche verrouillée refusée, index (personnes en zones, revue,
 *     lieu, concours), fiches des autres qui citent la personne, supprimer + « ↶ Annuler », changer de personne, menu de choix ;
 *  2. côté navigateur (heritage-artist*.js + heritage-blocs*.js dans une machine virtuelle) : définitions, colonnes, lecture
 *     échappée, types de champs, blocs de la fiche, API ext.press / ext.awards / ext.education.
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
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-blocs-'));
const code = String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p0->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Joseph','Martin','male'),('Pierre','Martin','male'),('Louise','Borie','female'),('Paul','Borie','male')");
$p0->exec("INSERT INTO places(name,country) VALUES('Tulle','France')");
$p0 = null;
require 'lib/bootstrap.php';
$pdo = db();
periodicals_ensure($pdo); $pdo->exec("INSERT INTO periodicals(title,kind) VALUES('La Montagne','journal')");
$out = [];
$out['version'] = (int) $pdo->query('PRAGMA user_version')->fetchColumn();
// une personne qui n'est pas « Artiste » : pas besoin de la cocher
$a = blocs_save_item($pdo, ['person_id' => 1, 'kind' => 'press_item', 'data' => ['title' => '<b>Le chanteur</b>', 'medium' => 'presse', 'date' => '3 mai 1958', 'outlet' => ['perid' => 1, 'title' => 'La Montagne'],
    'people' => [['pid' => 2, 'title' => 'Pierre MARTIN', 'role' => 'invité', 'primary' => true], ['pid' => 3, 'title' => 'Louise BORIE', 'role' => 'citée', 'primary' => false], ['pname' => 'R. Lavaud', 'role' => 'journaliste', 'primary' => true]]]])['id'];
$out['saved'] = [$a > 0, (int) $pdo->query('SELECT COALESCE(is_artist,0) FROM persons WHERE id=1')->fetchColumn(), (int) $pdo->query("SELECT year FROM items WHERE id={$a}")->fetchColumn()];
$out['zones'] = $pdo->query("SELECT COALESCE(person_id,0)||':'||role||':'||zone FROM item_people WHERE item_id={$a} ORDER BY ord")->fetchAll(PDO::FETCH_COLUMN);
$out['periodical_link'] = (int) $pdo->query("SELECT count(*) FROM item_links WHERE from_id={$a} AND to_type='periodical' AND to_id=1")->fetchColumn();
$out['type_row'] = (string) $pdo->query("SELECT icon FROM item_types WHERE key='award'")->fetchColumn();
foreach ([['person_id' => 1, 'kind' => 'release', 'data' => ['title' => 'X']], ['person_id' => 999, 'kind' => 'award', 'data' => ['title' => 'X']]] as $i => $bad) { try { blocs_save_item($pdo, $bad); $out['bad' . $i] = false; } catch (Throwable $e) { $out['bad' . $i] = $e->getMessage(); } }
// une récompense, un concours, une étape de scolarité (avec un camarade) et un diplôme
$c = blocs_save_item($pdo, ['person_id' => 2, 'kind' => 'contest', 'data' => ['title' => 'Plus belle moustache', 'category' => 'insolite']])['id'];
$w = blocs_save_item($pdo, ['person_id' => 2, 'kind' => 'award', 'data' => ['title' => 'Moustache d’or', 'category' => 'insolite', 'date' => '15 août 1971', 'rank' => '1er sur 22', 'place' => ['plid' => 1, 'title' => 'Tulle'],
    'contest' => ['iid' => $c, 'title' => 'Plus belle moustache', 'kind' => 'contest'], 'people' => [['pid' => 3, 'title' => 'Louise BORIE', 'role' => 'jury', 'primary' => true]]]])['id'];
$out['award'] = [(int) $pdo->query("SELECT place_id FROM items WHERE id={$w}")->fetchColumn(), (int) $pdo->query("SELECT date_min FROM items WHERE id={$w}")->fetchColumn(), count(art_links_of($pdo, [$c]))];
$s = blocs_save_item($pdo, ['person_id' => 2, 'kind' => 'school_step', 'data' => ['title' => 'École de Laguenne', 'date' => '1907 – 1912', 'mates' => [['pid' => 1, 'title' => 'Joseph MARTIN', 'role' => 'camarade', 'primary' => true]]]])['id'];
$out['step_bounds'] = $pdo->query("SELECT date_min||'-'||date_max FROM items WHERE id={$s}")->fetchColumn();
// la fiche de Joseph : son passage, et l'étape de Pierre où il est camarade
$pj = blocs_person($pdo, 1);
$out['person'] = [count($pj['items']), count($pj['cited']), $pj['cited'][0]['my_roles'][0] ?? '', $pj['cited'][0]['owner'] ?? ''];
$pl = blocs_person($pdo, 3);
$out['louise'] = array_map(static fn($x) => $x['kind'] . ':' . implode(',', $x['my_roles']), $pl['cited']); sort($out['louise']);
$hp = heritage_person_data($pdo, 1);
$out['heritage'] = isset($hp['blocs']) ? count($hp['blocs']['items']) : -1;
// la fenêtre : toutes les personnes, ou une seule
$out['boot'] = [count(blocs_boot($pdo, ['kinds' => 'award,contest'])['items']), count(blocs_boot($pdo, ['kinds' => 'press_item', 'person_id' => 3, 'scope' => 'person'])['items']), count(blocs_boot($pdo, ['kinds' => 'pas_une_sorte'])['kinds'])];
// supprimer puis « ↶ Annuler » : même numéro, liens revenus
$snap = blocs_delete_item($pdo, ['id' => $c]);
$out['deleted'] = [(int) $pdo->query("SELECT count(*) FROM items WHERE id={$c}")->fetchColumn(), count(art_links_of($pdo, [$w]))];
blocs_restore_item($pdo, ['item' => $snap['item']]);
$out['restored'] = [(int) $pdo->query("SELECT count(*) FROM items WHERE id={$c}")->fetchColumn(), count(art_links_of($pdo, [$w]))];
try { blocs_delete_item($pdo, ['id' => 99999]); $out['del_unknown'] = false; } catch (Throwable $e) { $out['del_unknown'] = true; }
// une fiche du catalogue d'un artiste ne se supprime pas par ici
$pdo->exec('UPDATE persons SET is_artist=1 WHERE id=4'); $rel = art_save_item($pdo, ['person_id' => 4, 'kind' => 'release', 'data' => ['title' => 'Disque']])['id'];
try { blocs_delete_item($pdo, ['id' => $rel]); $out['del_other'] = false; } catch (Throwable $e) { $out['del_other'] = true; }
// changer de personne
blocs_move_item($pdo, ['id' => $a, 'person_id' => 4]); $out['moved'] = (int) $pdo->query("SELECT person_id FROM items WHERE id={$a}")->fetchColumn();
// fiche verrouillée : rien ne s'écrit
$pdo->exec('UPDATE persons SET is_locked=1 WHERE id=3');
try { blocs_save_item($pdo, ['person_id' => 3, 'kind' => 'diploma', 'data' => ['title' => 'CAP']]); $out['locked'] = false; } catch (Throwable $e) { $out['locked'] = str_contains($e->getMessage(), 'verrouillée'); }
// menu de choix « artwork » : nos sortes avec leur icône
$pk = picker_art_items($pdo, 'moustache', 0, 10, ['art_kind' => 'award']); $out['picker'] = [$pk['total'], $pk['items'][0]['icon'] ?? ''];
try { blocs_api_post($pdo, ['op' => 'n_importe']); $out['bad_op'] = false; } catch (Throwable $e) { $out['bad_op'] = true; }
echo json_encode($out);
`;
const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media') } });
if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
const out = JSON.parse(r.stdout.trim().split('\n').pop());

/* ── 2. le navigateur, sans navigateur : les fichiers chargés dans une machine virtuelle ── */
const store = {};
const stubEl = () => ({addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], dataset: {}, classList: {add() {}, remove() {}, toggle() {}, contains: () => false}});
const fake = {reply: () => ({})};
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const win = {LCNDA_EXT: {}, localStorage: {getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }},
    LCNDA_APP: {plural: (n, w, pl) => `${n} ${n > 1 ? (pl || `${w}s`) : w}`, toast() {}, api: async (action, q) => fake.reply(action, q),
        card: (i, title, count, body, span, actions = '') => `<section class="card ${span}"><h3>${esc(title)}</h3>${actions}${body}</section>`,
        emptyState: ({text = '', action = null} = {}) => `<div class="empty-box"><b>${esc(text)}</b>${action ? `<button ${action.attrs}>${esc(action.label)}</button>` : ''}</div>`}};
const ctx = vm.createContext({window: win, document: {...stubEl(), documentElement: stubEl(), body: stubEl(), createElement: stubEl}, localStorage: win.localStorage, console, setTimeout, clearTimeout, URL, CSS: {escape: s => s}, Event: class {}, CustomEvent: class {}, MutationObserver: class { observe() {} }, Audio: class {}, location: {href: 'http://x/'}});
ctx.globalThis = ctx;
['heritage-artist.js', 'heritage-artist-fields.js', 'heritage-artist-panel.js', 'heritage-artist-music.js', 'heritage-artist-art.js', 'heritage-artist-books.js', 'heritage-artist-film.js', 'heritage-artist-page.js', 'heritage-artist-list.js', 'heritage-artist-import.js', 'heritage-artist-catalogue.js',
    'heritage-blocs.js', 'heritage-blocs-press.js', 'heritage-blocs-awards.js', 'heritage-blocs-school.js']
    .forEach(f => vm.runInContext(fs.readFileSync(path.join(appRoot, 'assets/js', f), 'utf8'), ctx, {filename: f}));
const ART = win.LCNDA_ART, ext = win.LCNDA_EXT, BL = ext.blocs;
const st = new BL.Store(1, BL.DOMAINS.press.kinds); st.person = {id: 1, first_name: 'Joseph', last_name: 'Martin', gender: 'male'}; st.global = {}; st.settings = {};
const press = {id: 5, person_id: 1, owner: 'Joseph MARTIN', kind: 'press_item', title: '<script>x</script>', year: 1958, date_min: 1958, date_max: 1958, sort: 1,
    data: {title: '<script>x</script>', medium: 'radio', ptype: 'invite', date: '14 juin 1959', outlet: {perid: 1, title: 'Radio-Limoges'}, pages: '12:40', tone: 'pos', subject: '<img src=x onerror=alert(1)>',
        people: [{pid: 2, title: 'Pierre MARTIN', role: 'invité', primary: true}, {pname: 'J. Pierrot', role: 'animateur', primary: false}], quote: 'Je chante…'}};
st.items = [press]; st.byId = new Map([[5, press]]);
const html = ART.readHtml(st, press);
const aw = it => ({id: it[0], person_id: 2, owner: 'Pierre MARTIN', kind: 'award', title: it[1], year: it[2], date_min: it[2], date_max: it[2], data: {title: it[1], date: String(it[2]), category: it[3], rank: it[4], medal: it[5] || ''}});
const awards = [aw([10, 'Moustache d’or', 1971, 'insolite', '1er sur 22']), aw([11, 'Belote', 1978, 'jeu', '3 / 48', 'bronze']), aw([12, 'Mérite agricole', 1955, 'decoration', ''])];
const step = {id: 20, person_id: 2, kind: 'school_step', title: 'École de Laguenne', year: 1907, date_min: 1907, date_max: 1912, data: {title: 'École de Laguenne', stype: 'ecole', date: '1907 – 1912', level: 'CP → CM2', mates: [{pid: 1, title: 'Joseph MARTIN', role: 'camarade', primary: true}]}};
const dip = {id: 21, person_id: 2, kind: 'diploma', title: 'CAP', year: 1919, date_min: 1919, date_max: 1919, data: {title: 'CAP', dkind: 'cap', specialty: 'ferronnier', mention: 'bien'}};
const detail = (items, cited = []) => ({person: {id: 2, first_name: 'Pierre', last_name: 'Martin'}, heritage: {blocs: {items, cited, people: []}}});
fake.reply = (action, q) => action === 'blocs' && q.op === 'person' ? {items: [...awards, step, dip, press].map(x => ({...x, person_id: Number(q.person_id)})), cited: [], people: []} : {};
(async () => {
    const awApi = JSON.parse(JSON.stringify(await ext.awards.listFor(2)));
    const awSport = await ext.awards.listFor(2, {category: 'jeu'});
    const edu = JSON.parse(JSON.stringify(await ext.education.listFor(2)));
    const pr = JSON.parse(JSON.stringify(await ext.press.listFor(2)));
    const blkPress = ext.personBlocks.in_media(1, detail([press]), {});
    const blkAw = ext.personBlocks.awards(2, detail(awards), {});
    const blkEdu = ext.personBlocks.education(3, detail([step, dip]), {});
    const blkEmpty = ext.personBlocks.education(3, detail([]), {isLocked: true, editOnly: () => ''});
    const blkLazy = ext.personBlocks.awards(2, {person: {id: 2}}, {});
    const listCols = JSON.parse(JSON.stringify(ART.layout(st, 'award', 'liste').fields.filter(f => f.on).map(f => f.key)));
    const T = ART.ft;
    const checks = [
        ['structure inchangée (pas de nouvelle migration : n°47)', () => assert.equal(out.version, 47)],
        ['une personne qui n’est pas « Artiste » : fiche enregistrée, sans la cocher ; année tirée de la date', () => assert.deepEqual(out.saved, [true, 0, 1958])],
        ['personnes avec rôles en zones (★ principales / ☆ secondaires), nom sans fiche gardé', () => assert.deepEqual(out.zones, ['2:invité:main', '3:citée:secondary', '0:journaliste:main'])],
        ['le média est relié à « Revues et magazines » (index des liens)', () => assert.equal(out.periodical_link, 1)],
        ['les sortes rangées dans item_types (nom, icône)', () => assert.equal(out.type_row, '🏆')],
        ['sorte d’un autre outil, ou personne inconnue : refusées avec un message clair', () => { assert.match(String(out.bad0), /Sorte/); assert.match(String(out.bad1), /Personne introuvable/); }],
        ['récompense : lieu, bornes de date, lien vers le concours (lisible des deux côtés)', () => assert.deepEqual(out.award, [1, 1971, 1])],
        ['étape de scolarité : « 1907 – 1912 » donne les bornes', () => assert.equal(out.step_bounds, '1907-1912')],
        ['fiche de Joseph : son passage, et l’étape de Pierre où il est camarade (avec le rôle et la personne)', () => assert.deepEqual(out.person, [1, 1, 'camarade', 'Pierre MARTIN'])],
        ['fiche de Louise : jury d’une récompense, citée dans un passage', () => assert.deepEqual(out.louise, ['award:jury', 'press_item:citée'])],
        ['données de la fiche personne (heritage_person_data → blocs)', () => assert.equal(out.heritage, 1)],
        ['la fenêtre : toutes les personnes, une seule, sortes inconnues ignorées', () => assert.deepEqual(out.boot, [2, 1, 6])],
        ['supprimer puis « ↶ Annuler » : même numéro, liens revenus', () => { assert.deepEqual(out.deleted, [0, 0]); assert.deepEqual(out.restored, [1, 1]); }],
        ['supprimer une fiche inconnue, ou d’un catalogue d’artiste : refusé', () => { assert.equal(out.del_unknown, true); assert.equal(out.del_other, true); }],
        ['changer la personne d’une fiche', () => assert.equal(out.moved, 4)],
        ['fiche verrouillée : rien ne s’écrit', () => assert.equal(out.locked, true)],
        ['menu de choix « artwork » : les récompenses avec leur icône', () => assert.deepEqual(out.picker, [1, '🏆'])],
        ['demande inconnue refusée', () => assert.equal(out.bad_op, true)],
        ['définitions chargées (passage, récompense, concours, étape, diplôme, établissement)', () => ['press_item', 'award', 'contest', 'school_step', 'diploma', 'school'].forEach(k => assert.ok(ART.defs[k], k))],
        ['pas d’onglet « passages » dans le catalogue d’un artiste', () => { const s2 = new ART.Store(1); s2.person = {}; s2.items = [press]; assert.ok(!ART.tabKinds(s2).includes('press_item')); }],
        ['lecture : tout est échappé (titre, sujet), rôles et zones affichés', () => { assert.doesNotMatch(html, /<script>|<img src=x/); assert.match(html, /&lt;script&gt;/); assert.match(html, /☆ Secondaires/); assert.match(html, /J\. Pierrot/); assert.match(html, /bl-quote/); }],
        ['colonnes de « Palmarès » : date, récompense, catégorie, épreuve, rang, lieu, fichier, personne', () => assert.deepEqual(listCols, ['date', 'title', 'c_cat', 'c_event', 'c_rank', 'c_where', 'c_file', 'c_who'])],
        ['types de champs : pastilles, revue, personnes en zones', () => { assert.equal(T.pills.text({choices: [['radio', '📻 Radio']]}, 'radio'), 'Radio'); assert.equal(T.pills.read({choices: []}, 'mon mot'), '<span class="bl-pillr">mon mot</span>'); assert.equal(T.periodical.text({}, {perid: 3, title: 'La Montagne'}), 'La Montagne'); assert.equal(T.cast.text({}, press.data.people), 'Pierre MARTIN (invité), J. Pierrot (animateur)'); assert.ok(T.cast.empty([])); }],
        ['bloc 📰 : frise, carte du passage (échappée), pastilles de sorte', () => { assert.match(blkPress, /bl-strip/); assert.match(blkPress, /data-bl-item="5"/); assert.doesNotMatch(blkPress, /<script>x/); assert.match(blkPress, /1 passage/); }],
        ['bloc 🏆 : tableau, catégories avec le nombre, frise, premières places', () => { assert.match(blkAw, /Tout \(3\)/); assert.match(blkAw, /Décorations \(1\)/); assert.match(blkAw, /bl-gantt/); assert.match(blkAw, /1 première place/); }],
        ['bloc 🎓 : frise du parcours et tableau des diplômes', () => { assert.match(blkEdu, /bl-bar/); assert.match(blkEdu, /CP → CM2/); assert.match(blkEdu, /ferronnier/); }],
        ['bloc vide sur une fiche verrouillée : pas de bouton « ＋ »', () => { assert.match(blkEmpty, /Aucune école/); assert.doesNotMatch(blkEmpty, /data-bl-new/); }],
        ['sans données du serveur : le bloc se remplit ensuite (rond qui tourne)', () => assert.match(blkLazy, /data-bl-host="awards"/)],
        ['API ext.awards.listFor : rangées par date, 1re place reconnue, filtre par catégorie', () => { assert.deepEqual(awApi.map(a => a.year), [1955, 1971, 1978]); assert.equal(awApi[1].first, true); assert.equal(awApi[2].medalLabel, 'Bronze · 3e'); assert.equal(awSport.length, 1); }],
        ['API ext.education.listFor et ext.press.listFor', () => { assert.equal(edu.steps[0].from, 1907); assert.equal(edu.steps[0].to, 1912); assert.equal(edu.diplomas[0].typeLabel, 'CAP'); assert.equal(pr[0].outlet, 'Radio-Limoges'); assert.equal(pr[0].mediumLabel, 'Radio'); }],
    ];
    let failed = 0;
    for (const [name, fn] of checks) { try { fn(); console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + e.message); } }
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`\n${checks.length - failed} vérifications réussies${failed ? `, ${failed} échec(s)` : ''}.`);
    process.exitCode = failed ? 1 : 0;
})();
