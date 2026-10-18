'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Test des types d'œuvres (maquettes I, J, K, L, S, T) :   node tests/test-oeuvres.js
 *  1. côté serveur (lib/oeuvres.php + lib/art_engine.php) sur une base temporaire : clés permises, chaîne sculpture → fontes
 *     (parent_id), ligne item_types et menu de choix (« Sculpture 🗿 »), ligne grise, types de l'utilisateur (liens « items »
 *     sans doublons après une nouvelle sauvegarde), clé inventée refusée ;
 *  2. côté navigateur (heritage-artist*.js + heritage-oeuvres*.js dans une machine virtuelle) : 129 types en 11 familles + « Mes
 *     types », toutes les fiches lisibles (et le texte échappé), mêmes clés que le serveur, vues (fontes, mouvements, mises en
 *     scène), calculs, dates, liste officielle des métiers d'art (16 domaines, 198 métiers) et recherche de métiers.
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
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-oeuvres-'));
const code = String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php';
$pdo = db();
$pdo->exec("INSERT INTO persons(first_name,last_name,gender,is_artist) VALUES('Joseph','Martin','male',1),('Marie','Martin','female',0)");
$out = [];
$out['kinds'] = [art_kind_ok($pdo, 'o_sculpture'), art_kind_ok($pdo, 'o_cast'), art_kind_ok($pdo, 'o_ferronnerie'), art_kind_ok($pdo, 'o_pas_un_type')];
$out['keys'] = array_keys(oeuvres_types());
$s = art_save_item($pdo, ['person_id' => 1, 'kind' => 'o_sculpture', 'data' => ['title' => 'La Corrézienne', 'date' => '1931', 'material' => 'bronze', 'edition_plan' => '8 + 4 EA', 'sitter' => [['pid' => 2, 'title' => 'Marie MARTIN', 'role' => 'a posé']]]])['id'];
$c = art_save_item($pdo, ['person_id' => 1, 'kind' => 'o_cast', 'parent_id' => $s, 'data' => ['title' => 'Fonte 1/8', 'no' => '1/8', 'date' => '1932', 'sculpture' => ['iid' => $s, 'title' => 'La Corrézienne', 'kind' => 'o_sculpture'], 'founder' => ['empid' => 5, 'title' => 'Susse']]])['id'];
$out['parent'] = (int) $pdo->query("SELECT parent_id FROM items WHERE id={$c}")->fetchColumn() === $s;
$out['link'] = (int) $pdo->query("SELECT count(*) FROM item_links WHERE from_id={$c} AND to_type='item' AND to_id={$s} AND kind='sculpture'")->fetchColumn();
$out['employer'] = (int) $pdo->query("SELECT count(*) FROM item_links WHERE from_id={$c} AND to_type='employer' AND to_id=5")->fetchColumn();
$out['type_row'] = $pdo->query("SELECT label, icon FROM item_types WHERE key='o_sculpture'")->fetch(PDO::FETCH_NUM);
$pk = picker_art_items($pdo, 'Corrézienne', 0, 10, ['art_kind' => 'o_sculpture']); $out['picker'] = [$pk['total'], $pk['items'][0]['icon'] ?? '', $pk['items'][0]['badge'] ?? '', $pk['items'][0]['meta'] ?? ''];
$out['cited'] = array_map(static fn($x) => [$x['title'], $x['roles']], art_person_cited($pdo, 2));
// un type de l'utilisateur avec un lien « items » : type_links, et pas de doublon quand on l'enregistre à nouveau
$def = ['many' => 'Chars', 'icon' => '🎠', 'family' => 'hobby', 'groups' => [['key' => 'main', 'label' => 'Le char', 'fields' => [['key' => 'title', 'label' => 'Titre', 'type' => 'text', 'star' => true], ['key' => 'calc', 'label' => 'Éditions', 'type' => 'computed', 'view' => 'o_calc', 'calc' => ['op' => 'count', 'field' => 'x']]]],
    ['key' => 'links_oe', 'label' => 'Liens', 'zone' => 'right', 'fields' => [['key' => 'musique', 'label' => 'musique du char', 'type' => 'items', 'kinds' => ['track_work'], 'back' => 'joué sur le char', 'star' => true]]]]];
$t = art_save_type($pdo, ['label' => 'Char de carnaval', 'def' => $def]); art_save_type($pdo, ['key' => $t['key'], 'label' => 'Char de carnaval', 'def' => $def]);
$out['type_links'] = (int) $pdo->query("SELECT count(*) FROM type_links WHERE from_type='{$t['key']}' AND to_type='track_work' AND name_back='joué sur le char'")->fetchColumn();
$ty = array_values(array_filter(art_types_all($pdo), static fn($x) => $x['key'] === $t['key']))[0];
$out['type_calc'] = $ty['def']['groups'][0]['fields'][1]['calc']['op'] ?? '';
$out['sub'] = oeuvres_subline(['material' => 'bronze', 'edition_plan' => '8 + 4 EA'], 'o_sculpture');
echo json_encode($out, JSON_UNESCAPED_UNICODE);
`;
const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media') } });
if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
const out = JSON.parse(r.stdout.trim().split('\n').pop());

/* ── 2. le navigateur, sans navigateur ── */
const store = {};
const stubEl = () => ({addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], dataset: {}, classList: {add() {}, remove() {}, toggle() {}}});
const win = {LCNDA_EXT: {}, localStorage: {getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }},
    LCNDA_APP: {plural: (n, w, pl) => `${n} ${n > 1 ? (pl || `${w}s`) : w}`, toast() {}, api: async () => ({})}};
const ctx = vm.createContext({window: win, document: {...stubEl(), documentElement: stubEl(), body: stubEl(), createElement: stubEl}, localStorage: win.localStorage, console, setTimeout, clearTimeout, URL, CSS: {escape: s => s}, Event: class {}, CustomEvent: class {}, Audio: class {}, location: {href: 'http://x/'}});
ctx.globalThis = ctx;
const files = fs.readdirSync(path.join(appRoot, 'assets/js')).filter(f => /^heritage-artist.*\.js$/.test(f)).sort((a, b) => (a === 'heritage-artist.js' ? -1 : b === 'heritage-artist.js' ? 1 : a === 'heritage-artist-fields.js' ? -1 : b === 'heritage-artist-fields.js' ? 1 : a.localeCompare(b)));
[...files, 'heritage-oeuvres.js', 'heritage-oeuvres-fiches.js', 'heritage-oeuvres-types.js', 'heritage-oeuvres-wizard.js', 'heritage-oeuvres-metiers.js']
    .forEach(f => vm.runInContext(fs.readFileSync(path.join(appRoot, 'assets/js', f), 'utf8'), ctx, {filename: f}));
const ART = win.LCNDA_ART, OE = ART.oeuvres;
const st = new ART.Store(1); st.person = {first_name: 'Joseph', last_name: 'Martin', gender: 'male', profiles: []}; st.global = {}; st.settings = {};
const sc = {id: 10, person_id: 1, kind: 'o_sculpture', title: 'La Corrézienne', year: 1931, sort: 1, data: {title: 'La Corrézienne', date: '1931', material: 'bronze', edition_plan: '8 + 4 EA', attribution: 'certaine'}};
const casts = [['1/8', false], ['8/8', true]].map(([no, post], i) => ({id: 20 + i, person_id: 1, kind: 'o_cast', parent_id: 10, title: `Fonte ${no}`, year: 1932, sort: i, data: {title: `Fonte ${no}`, no, posthumous: post, sculpture: {iid: 10, title: 'La Corrézienne', kind: 'o_sculpture'}}}));
const co = {id: 30, person_id: 1, kind: 'o_concerto', title: 'Concerto', year: 1962, sort: 1, data: {title: 'Concerto', catsys: 'op', catno: '12', movements: [{no: 'I.', title: 'Allegro', dur: '9:40'}, {title: 'Valse', dur: '7:15'}]}};
const pc = {id: 40, person_id: 1, kind: 'o_piece', title: 'La Veillée', year: 1949, sort: 1, data: {title: 'La Veillée', characters: [{name: 'Mélanie', sex: 'f'}, {name: 'Jean', sex: 'h'}]}};
const mes = {id: 41, person_id: 1, kind: 'o_mes', parent_id: 40, title: 'Création', year: 1951, sort: 1, data: {title: 'Création', play: {iid: 40, title: 'La Veillée', kind: 'o_piece'}, mkind: 'creation'}};
const rep = {id: 42, person_id: 1, kind: 'o_representation', parent_id: 41, title: 'La Veillée', year: 1951, sort: 1, data: {title: 'La Veillée', date: '12 mai 1951', staging: {iid: 41, title: 'Création', kind: 'o_mes'}, spectators: '420', tag: 'premiere'}};
st.items = [sc, ...casts, co, pc, mes, rep]; st.byId = new Map(st.items.map(i => [i.id, i]));
const evil = '<script>alert(1)</script>';
const readAll = () => { const bad = []; Object.keys(ART.defs).forEach(k => { const it = {id: 99, person_id: 1, kind: k, title: evil, year: 1950, sort: 1, data: {title: evil, date: '1950', notes: evil, metier: evil}};
    try { const h = ART.readHtml(st, it); if (h.includes('<script>')) bad.push(`${k} : texte non échappé`); } catch (e) { bad.push(`${k} : ${e.message}`); } }); return bad; };
const json = JSON.parse(fs.readFileSync(path.join(appRoot, 'assets/data/metiers-art.json'), 'utf8'));
const checks = [
    ['serveur : clés permises (sculpture, fonte, ferronnerie) ; clé inventée refusée', () => assert.deepEqual(out.kinds, [true, true, true, false])],
    ['serveur : la fonte est rattachée à sa sculpture (parent_id, lien lisible des deux côtés, fondeur indexé)', () => { assert.equal(out.parent, true); assert.equal(out.link, 1); assert.equal(out.employer, 1); }],
    ['serveur : ligne item_types écrite au premier enregistrement, menu de choix « Sculpture 🗿 »', () => { assert.deepEqual(out.type_row, ['Sculpture', '🗿']); assert.equal(out.picker[0], 1); assert.equal(out.picker[1], '🗿'); assert.equal(out.picker[2], 'Sculpture'); assert.match(out.picker[3], /bronze/); }],
    ['serveur : « Lié à » sur la fiche du modèle (a posé)', () => assert.deepEqual(out.cited, [['La Corrézienne', ['a posé']]])],
    ['serveur : type de l’utilisateur — lien « items » dans type_links, sans doublon après une 2e sauvegarde ; calcul gardé', () => { assert.equal(out.type_links, 1); assert.equal(out.type_calc, 'count'); }],
    ['serveur : ligne grise d’une sculpture', () => assert.equal(out.sub, 'bronze · 8 + 4 EA')],
    ['catalogue : 129 types en 11 familles (+ « Mes types »), tous définis', () => { assert.equal(OE.catalog.length, 129); assert.equal(OE.FAMILIES.length, 12); OE.catalog.forEach(e => assert.ok(ART.defs[OE.keyOf(e)], e.key)); assert.equal(new Set(OE.catalog.map(e => e.fam)).size, 11); }],
    ['mêmes clés côté navigateur et côté serveur', () => { const js = Object.keys(ART.defs).filter(k => k.startsWith('o_') || k === 'profile_artisan').sort(); assert.deepEqual(js, [...out.keys].sort()); }],
    ['toutes les fiches se lisent, le texte est échappé', () => assert.deepEqual(readAll(), [])],
    ['recherche des types : « bronze » → sculpture, « podcast »', () => { const m = q => OE.entries(st).filter(e => OE.norm(`${e.label} ${e.words}`).includes(OE.norm(q))).map(e => e.kind); assert.ok(m('bronze').includes('o_sculpture')); assert.ok(m('podcast').includes('o_podcast')); }],
    ['J : fontes (tableau, posthume), badges', () => { const h = ART.readHtml(st, sc); assert.match(h, /data-post="1"/); assert.match(h, /1 fonte posthume/); assert.match(h, /8 \+ 4 EA/); assert.match(h, /limite légale/); }],
    ['K : concerto — op. 12, mouvements (II. calculé), durée totale', () => { const h = ART.readHtml(st, co); assert.match(h, /op\. 12/); assert.match(h, /II\./); assert.match(h, /2 mouvements · 16:55/); }],
    ['K : pièce → mise en scène → représentation (arbre, calendrier), personnages « 2 (1 F, 1 H) »', () => { const h = ART.readHtml(st, pc); assert.match(h, /Représentations · 1/); assert.match(h, /class="on">12</); assert.match(h, /2 \(1 F, 1 H\)/); }],
    ['dates à la française (« 1er juin 1952 », « 12/05/1951 »)', () => { assert.deepEqual({...OE.frDate('1er juin 1952')}, {y: 1952, m: 5, d: 1}); assert.deepEqual({...OE.frDate('12/05/1951')}, {y: 1951, m: 4, d: 12}); }],
    ['champ « Calcul » : nombre de lignes, somme, durée', () => { const it = {data: {r: [{n: '3', d: '2:00'}, {n: '4,5', d: '1:30'}]}}; const c = (calc, unit) => ART.views.o_calc.text({store: st}, it, {calc, unit}); assert.equal(c({op: 'count', field: 'r'}), '2 lignes'); assert.equal(c({op: 'sum', field: 'r', col: 'n'}, 'h'), '7,5 h'); assert.equal(c({op: 'dur', field: 'r', col: 'd'}), '3:30'); }],
    ['S : liste officielle — 16 domaines, 198 métiers, chaque type proposé existe', () => { assert.equal(json.domaines.length, 16); assert.equal(json.domaines.reduce((a, d) => a + d.metiers.length, 0), 198); json.domaines.forEach(d => { assert.ok(ART.defs[d.type], d.type); d.metiers.forEach(m => assert.ok(!m.type || ART.defs[m.type], m.type)); }); assert.match(json.url, /JORFTEXT000031941949/); }],
    ['S : un métier de deux domaines reste dans les deux (Ciseleur)', () => assert.ok(json.domaines.filter(d => d.metiers.some(m => m.nom === 'Ciseleur')).length >= 2)],
    ['T : ferronnerie — badges MH, Mérimée vers POP', () => { const it = {id: 50, person_id: 1, kind: 'o_ferronnerie', title: 'Grille', year: 1927, sort: 1, data: {title: 'Grille', protection: 'inscrit', prot_date: '12 juin 1986', merimee: 'PA19000123', situation: 'place', techniques: ['forge']}}; const h = ART.readHtml(st, it); assert.match(h, /Inscrite MH 1986/); assert.match(h, /pop\.culture\.gouv\.fr\/notice\/merimee\/PA19000123/); }],
    ['profil « artisan d’art » déclaré, avec ses sections de page', () => { assert.equal(ART.profiles.artisan.type, 'profile_artisan'); ART.profiles.artisan.sections.forEach(k => assert.equal(ART.pageSections[k]?.profile, 'artisan', k)); }],
];
(async () => {
    // les métiers : la liste lue comme le ferait fetch()
    win.fetch = ctx.fetch = async () => ({ok: true, json: async () => json});
    await OE.loadMetiers();
    checks.push(['S : recherche de métiers (« dinandier » → ferronnerie, sans accents : « ebeniste »)', () => { assert.equal(OE.searchMetiers('dinandier')[0].type, 'o_ferronnerie'); assert.ok(OE.searchMetiers('ebeniste').length >= 1); }]);
    let failed = 0;
    for (const [name, fn] of checks) { try { fn(); console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + e.message); } }
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`\n${checks.length - failed} vérifications réussies${failed ? `, ${failed} échec(s)` : ''}.`);
    process.exitCode = failed ? 1 : 0;
})();
