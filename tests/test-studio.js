'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Test de lib/museum.php, lib/studio.php et du partage des listes (lib/my_lists.php) :   npm run test:studio
 * Musée (salles, œuvres, ordre, livre d'or, paquet de partage, site web), listes partagées, original d'une photo retouchée.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-studio-'));
const code = String.raw`
require 'lib/paths.php';
(new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'))->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
require 'lib/bootstrap.php';
$pdo = db();
$out = ['version' => (int) $pdo->query('PRAGMA user_version')->fetchColumn()];
$pdo->exec("INSERT INTO persons(first_name,last_name) VALUES('Pierre','Dupont')");
// Une vraie petite image dans media/
$img = imagecreatetruecolor(40, 30); imagefill($img, 0, 0, imagecolorallocate($img, 200, 40, 40)); imagejpeg($img, MEDIA_DIR . '/portrait.jpg');
$pdo->exec("INSERT INTO media(title,media_type,filename,thumbnail,date_text) VALUES('Portrait de Pierre','image','portrait.jpg','portrait.jpg','1890')");
$pdo->exec("INSERT INTO media_links(media_id,entity_type,entity_id,position) VALUES(1,'person',1,1)");
$pdo->exec("INSERT INTO family_objects(title,kind) VALUES('Montre à gousset','montre')");
$pdo->exec("INSERT INTO family_collection_media(collection_type,collection_id,media_id) VALUES('family_object',1,1)");

// Musée : créé tout seul avec une salle
$m = museum_get($pdo, 0);
$out['museum'] = [$m['title'], count($m['rooms']), $m['imported']];
$room = $m['rooms'][0]['id'];
$a = museum_save_item($pdo, ['room_id' => $room, 'kind' => 'photo', 'wall' => 'left', 'media_id' => 1, 'title' => 'Pierre', 'cartel' => "1890\nPhotographie", 'in_tour' => 1, 'settings' => ['scale' => 1.4, 'model' => 'piano', 'bad' => 'x']]);
$b = museum_save_item($pdo, ['room_id' => $room, 'kind' => 'object', 'object_id' => 1, 'title' => 'Montre', 'in_tour' => 1]);
$c = museum_save_item($pdo, ['room_id' => $room, 'kind' => 'seat', 'wall' => 'back', 'settings' => ['model' => 'bench', 'px' => 0.5, 'pz' => -0.5]]);
$d = museum_save_item($pdo, ['room_id' => $room, 'kind' => 'text', 'wall' => 'nimporte', 'title' => 'Bienvenue', 'description' => 'Texte </script><b>']);
$m = museum_get($pdo, 0);
$it = $m['rooms'][0]['items'];
$out['items'] = array_map(fn($i) => [$i['kind'], $i['wall'], $i['image']], $it);
$out['settings'] = [$it[0]['settings'], $it[2]['settings']];
museum_reorder($pdo, ['what' => 'items', 'ids' => [$d['id'], $c['id'], $b['id'], $a['id']]]);
$out['order'] = array_column(museum_get($pdo, 0)['rooms'][0]['items'], 'kind');
$r2 = museum_save_room($pdo, ['name' => 'Salle des objets', 'settings' => ['size' => 'large', 'floor' => 'wood', 'wall' => '#f0e0d0', 'size2' => 'x']]);
museum_reorder($pdo, ['what' => 'rooms', 'ids' => [$r2['id'], $room]]);
$out['rooms'] = array_map(fn($r) => [$r['name'], $r['settings']], museum_get($pdo, 0)['rooms']);
$out['sign'] = count(museum_sign($pdo, ['name' => 'Tante Lucie', 'message' => 'Très émouvant !'])['guestbook']);
try { museum_sign($pdo, ['name' => '', 'message' => '']); $out['sign_empty'] = 'accepté'; } catch (Throwable $e) { $out['sign_empty'] = 'refusé'; }
$out['pick'] = [count(museum_pick($pdo, 'media', 'Pierre')), museum_pick($pdo, 'media', 'Dupont')[0]['person_name'] ?? null, museum_pick($pdo, 'objects', '')[0]['url'] ?? null];
try { museum_delete($pdo, ['id' => $m['id']]); $out['own_delete'] = 'accepté'; } catch (Throwable $e) { $out['own_delete'] = 'refusé'; }

// Un même fichier pour deux œuvres : en retirer une ne l'efface pas
@mkdir(MEDIA_DIR . '/musee/1', 0775, true); file_put_contents(MEDIA_DIR . '/musee/1/x.mp3', 'son');
$s1 = museum_save_item($pdo, ['room_id' => $room, 'kind' => 'text', 'title' => 'A']); $s2 = museum_save_item($pdo, ['room_id' => $room, 'kind' => 'text', 'title' => 'B']);
$pdo->exec("UPDATE museum_items SET audio_file='musee/1/x.mp3' WHERE id IN ({$s1['id']},{$s2['id']})");
museum_delete_item($pdo, ['id' => $s1['id']]); $gc1 = is_file(MEDIA_DIR . '/musee/1/x.mp3');
museum_delete_item($pdo, ['id' => $s2['id']]); $out['gc'] = [$gc1, is_file(MEDIA_DIR . '/musee/1/x.mp3')];

// Paquet de partage (fichier LCNDA) et site web
$zip = new ZipArchive(); $zp = DATA_DIR . '/m.zip'; $zip->open($zp, ZipArchive::CREATE | ZipArchive::OVERWRITE);
$pkg = museum_package($pdo, $m['id'], 'lcnda', $zip); $zip->addFromString('musee.json', json_encode($pkg)); $zip->close();
$z = new ZipArchive(); $z->open($zp);
$out['package'] = [$pkg['type'], count($pkg['rooms']), $pkg['rooms'][1]['items'][3]['image'] ?? null, $z->locateName('fichiers/1.jpg') !== false, count($pkg['guestbook'])];
$z->close();
$zip = new ZipArchive(); $zip->open(DATA_DIR . '/s.zip', ZipArchive::CREATE | ZipArchive::OVERWRITE);
$site = museum_package($pdo, $m['id'], 'site', $zip); $zip->close();
$html = museum_site_html($site);
$out['site'] = [str_contains($html, 'const THREE = {'), !str_contains($html, "\nexport {"), str_starts_with($site['rooms'][1]['items'][3]['image'], 'data:image/jpeg;base64,'), substr_count(strtolower($html), '</script') === 2, str_contains($html, 'LCNDA_MUSEUM_VIEWER.mount')];

// Musée reçu : lecture seule ; ordre limité à une même salle
$pdo->exec("INSERT INTO museums(title, imported) VALUES('Reçu', 1)"); $rid = (int) $pdo->lastInsertId();
$pdo->exec("INSERT INTO museum_rooms(museum_id, name) VALUES($rid, 'Salle reçue')"); $rroom = (int) $pdo->lastInsertId();
$ro = [];
foreach ([fn() => museum_save_room($pdo, ['id' => $rroom, 'name' => 'X']), fn() => museum_save_item($pdo, ['room_id' => $rroom, 'kind' => 'text', 'title' => 'X']), fn() => museum_delete_room($pdo, ['id' => $rroom]), fn() => museum_save($pdo, ['id' => $rid, 'title' => 'X'])] as $f) { try { $f(); $ro[] = 'accepté'; } catch (Throwable $e) { $ro[] = 'refusé'; } }
$i1 = museum_save_item($pdo, ['room_id' => $room, 'kind' => 'text', 'title' => 'i1']);
$i2 = museum_save_item($pdo, ['room_id' => $r2['id'], 'kind' => 'text', 'title' => 'i2']);
try { museum_reorder($pdo, ['what' => 'items', 'ids' => [$i1['id'], $i2['id']]]); $ro[] = 'accepté'; } catch (Throwable $e) { $ro[] = 'refusé'; }
$out['readonly'] = $ro;
museum_delete_item($pdo, ['id' => $i1['id']]); museum_delete_item($pdo, ['id' => $i2['id']]);

// Listes partagées : types d'événements et étiquettes désignés par leur nom
$pdo->exec("INSERT INTO labels(name,color) VALUES('Salon 2026','#cc0000')");
$tag = (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='MARR' LIMIT 1")->fetchColumn();
$l = save_my_list($pdo, ['name' => 'Mariages', 'icon' => '💍', 'source' => 'events', 'definition' => ['rules' => [['field' => 'event_type', 'values' => [$tag]], ['field' => 'label', 'values' => [1]]], 'in_lists' => true, 'custom' => [['label' => 'Fait', 'type' => 'checkbox']]]]);
$exp = export_my_list($pdo, $l['id']);
$out['list_export'] = [$exp['type'], $exp['definition']['rules'][0]['values'][0]['tag'] ?? null, $exp['definition']['rules'][1]['values'][0]['name'] ?? null, $exp['definition']['in_lists']];
$pdo->exec("DELETE FROM labels");
$imp = import_my_list($pdo, ['json' => json_encode($exp)]);
$def = array_values(array_filter(my_lists($pdo), fn($x) => $x['id'] === $imp['id']))[0]['definition'];
$out['list_import'] = [$def['rules'][0]['values'] === [$tag], (string) $pdo->query('SELECT name FROM labels')->fetchColumn(), $def['in_lists']];
$f = save_my_list($pdo, ['name' => 'Stands', 'source' => 'free', 'definition' => ['custom' => [['label' => 'Stand', 'type' => 'text'], ['label' => 'Qui', 'type' => 'person']]]]);
$fk = array_values(array_filter(my_lists($pdo), fn($x) => $x['id'] === $f['id']))[0]['definition']['custom'];
$k = save_my_list_row($pdo, ['list_id' => $f['id'], 'row_key' => 'f:new'])['row_key'];
save_my_list_row($pdo, ['list_id' => $f['id'], 'row_key' => $k, 'field' => $fk[0]['key'], 'value' => 'Cercle du Nord']);
save_my_list_row($pdo, ['list_id' => $f['id'], 'row_key' => $k, 'field' => $fk[1]['key'], 'value' => '1']);
$fe = export_my_list($pdo, $f['id']);
$fi = import_my_list($pdo, ['json' => json_encode($fe)]);
$out['free_share'] = [$fi['rows'], array_values(my_list_rows($pdo, $fi['id'])['rows'][0]['values'])];
$unk = $exp; $unk['definition']['rules'][0]['values'] = [['tag' => 'ZZZ', 'label' => 'Type inventé']];
try { import_my_list($pdo, ['json' => json_encode($unk)]); $out['list_unknown'] = 'accepté'; } catch (Throwable $e) { $out['list_unknown'] = str_contains($e->getMessage(), 'Type inventé') ? 'refusé' : $e->getMessage(); }
try { import_my_list($pdo, ['json' => '{"type":"autre"}']); $out['list_bad'] = 'accepté'; } catch (Throwable $e) { $out['list_bad'] = 'refusé'; }

// Plan du musée : place sur le mur, hauteur, orientation (bornées)
$pl = museum_save_item($pdo, ['room_id' => $room, 'kind' => 'photo', 'wall' => 'right', 'title' => 'P', 'settings' => ['along' => -0.25, 'y' => 9, 'rot' => 450]]);
$out['plan'] = array_values(array_filter(museum_get($pdo, 0)['rooms'], fn($r) => $r['id'] === $room))[0]['items'];
$out['plan'] = array_values(array_filter($out['plan'], fn($i) => $i['id'] === $pl['id']))[0]['settings'];

// Mes listes reprises de l'onglet Listes, filtres de colonnes gardés
$src = file_get_contents('api.php'); foreach (['function person_select'] as $fn) { $a = strpos($src, $fn); $b = strpos($src, "\n}\n", $a); if (!function_exists(substr($fn, 9))) eval(substr($src, $a, $b - $a + 3)); }
$pdo->exec("INSERT INTO places(name,country) VALUES('Lille','France'),('Gand','Belgique')");
$pdo->exec("INSERT INTO events(scope,person_id,event_type_id,year,place_id) SELECT 'person',1,(SELECT id FROM event_types WHERE gedcom_tag='BIRT' LIMIT 1),1900,id FROM places WHERE name IN ('Lille','Gand')");
$tl = save_my_list($pdo, ['name' => 'Lieux', 'source' => 'places', 'definition' => ['columns' => ['name', 'country', 'events'], 'rules' => [['field' => 'place', 'value' => 'x']], 'filters' => ['country' => ['values' => ['France']], 'inconnue' => ['contains' => 'x']]]]);
$tr = my_list_rows($pdo, $tl['id']);
$out['table_list'] = [array_column(array_column($tr['rows'], 'cells'), 'name'), $tr['list']['definition']['rules'], $tr['list']['definition']['filters']];
$out['filters_saved'] = save_my_list_filters($pdo, ['id' => $tl['id'], 'filters' => ['name' => ['contains' => 'Li', 'from' => 1800]]])['filters'];
$k = save_my_list_row($pdo, ['list_id' => $tl['id'], 'row_key' => $tr['rows'][0]['key'], 'field' => 'note', 'value' => 'ok']);
$out['table_row'] = $k['row_key'] === $tr['rows'][0]['key'];

// Versions d'une photo : original gardé, version affichée au choix, l'original ne se supprime pas
$out['v0'] = array_map(fn($v) => [$v['label'], $v['shown']], retouch_versions($pdo, 1));
copy(MEDIA_DIR . '/portrait.jpg', MEDIA_DIR . '/retouche.jpg');
$pdo->exec("INSERT INTO media_versions(media_id, filename, label, is_original) VALUES(1,'portrait.jpg','Original',1),(1,'retouche.jpg','Retouche 1',0)");
$pdo->exec("UPDATE media SET filename='retouche.jpg', thumbnail='retouche.jpg' WHERE id=1");
$vs = retouch_versions($pdo, 1);
$out['v1'] = array_map(fn($v) => [$v['label'], $v['shown']], $vs);
$back = retouch_show_version($pdo, ['media_id' => 1, 'version_id' => $vs[0]['id']]);
$out['v2'] = [$back['filename'], (string) $pdo->query('SELECT filename FROM media WHERE id=1')->fetchColumn(), is_file(MEDIA_DIR . '/retouche.jpg')];
try { retouch_show_version($pdo, ['media_id' => 2, 'version_id' => $vs[1]['id']]); $out['v_other'] = 'accepté'; } catch (Throwable $e) { $out['v_other'] = 'refusé'; }
$pdo->exec("INSERT INTO media(title,media_type,filename,thumbnail) VALUES('Doublon','image','autre.jpg','autre.jpg')");
$out['used'] = [retouch_file_used($pdo, 'retouche.jpg'), retouch_file_used($pdo, 'retouche.jpg', $vs[1]['id']), retouch_file_used($pdo, 'autre.jpg'), retouch_file_used($pdo, 'rien.jpg')];
echo json_encode($out, JSON_UNESCAPED_UNICODE);
`;
const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media') } });
if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
const out = JSON.parse(r.stdout.trim().split('\n').pop());
const checks = [
  ['structure à jour (n°31)', () => assert.equal(out.version, 31)],
  ['musée créé tout seul avec une première salle', () => assert.deepEqual(out.museum, ['Musée de la famille', 1, 0])],
  ['œuvres : photo de la base, objet (photo de l’objet), siège et texte au milieu ou au mur', () => assert.deepEqual(out.items, [['photo', 'left', 'media/portrait.jpg'], ['object', 'center', 'media/portrait.jpg'], ['seat', 'center', ''], ['text', 'back', '']])],
  ['réglages filtrés (taille bornée, modèle connu, position)', () => assert.deepEqual(out.settings, [{scale: 1.4, model: 'piano'}, {model: 'bench', px: 0.5, pz: -0.5}])],
  ['ordre des œuvres changé', () => assert.deepEqual(out.order, ['text', 'seat', 'object', 'photo'])],
  ['salles : ordre et réglages', () => assert.deepEqual(out.rooms, [['Salle des objets', {size: 'large', wall: '#f0e0d0', floor: 'wood'}], ['Les visages de la famille', {size: 'medium', wall: '#ffffff', floor: 'light'}]])],
  ['livre d’or signé, message vide refusé', () => { assert.equal(out.sign, 1); assert.equal(out.sign_empty, 'refusé'); }],
  ['choix des photos (par titre ou par personne) et des objets', () => assert.deepEqual(out.pick, [1, 'Pierre Dupont', 'media/portrait.jpg'])],
  ['fichier partagé par deux œuvres : effacé seulement quand plus rien ne s’en sert', () => assert.deepEqual(out.gc, [true, false])],
  ['son propre musée ne se supprime pas', () => assert.equal(out.own_delete, 'refusé')],
  ['fichier LCNDA : salles, images, livre d’or', () => assert.deepEqual(out.package, ['lcnda-musee', 2, 'fichiers/1.jpg', true, 1])],
  ['site web : Three.js dans la page, images incluses, pas de </script> parasite', () => assert.deepEqual(out.site, [true, true, true, true, true])],
  ['liste partagée : types d’événements et étiquettes par leur nom', () => assert.deepEqual(out.list_export, ['lcnda-liste', 'MARR', 'Salon 2026', true])],
  ['liste importée : type retrouvé, étiquette recréée, pas ajoutée d’elle-même au menu Listes', () => assert.deepEqual(out.list_import, [true, 'Salon 2026', false])],
  ['musée reçu non modifiable ; ordre refusé entre deux salles', () => assert.deepEqual(out.readonly, ['refusé', 'refusé', 'refusé', 'refusé', 'refusé'])],
  ['liste écrite à la main partagée avec ses lignes, sans lien vers les fiches', () => assert.deepEqual(out.free_share, [1, ['Cercle du Nord']])],
  ['fichier qui n’est pas une liste refusé', () => assert.equal(out.list_bad, 'refusé')],
  ['liste dont le type d’événement n’existe pas ici : refusée (sinon elle montrerait tout)', () => assert.equal(out.list_unknown, 'refusé')],
  ['plan du musée : position, hauteur et orientation gardées (bornées)', () => assert.deepEqual(out.plan, {along: -0.25, y: 3.4, rot: 90})],
  ['liste reprise des Lieux : toutes les lignes, pas de critères, filtres de colonnes connus seulement', () => { assert.deepEqual(out.table_list[0].sort(), ['Gand', 'Lille']); assert.deepEqual(out.table_list[1], []); assert.deepEqual(out.table_list[2], {country: {values: ['France']}}); }],
  ['filtres de colonnes enregistrés depuis la liste', () => assert.deepEqual(out.filters_saved, {name: {contains: 'Li', from: 1800}})],
  ['liste reprise : on peut remplir ses propres colonnes', () => assert.equal(out.table_row, true)],
  ['photo jamais retouchée : une seule version, l’original, affichée', () => assert.deepEqual(out.v0, [['Original', true]])],
  ['retouche : l’original et la retouche sont gardés, la retouche affichée', () => assert.deepEqual(out.v1, [['Original', false], ['Retouche 1', true]])],
  ['retour à l’original par défaut : la retouche reste disponible', () => assert.deepEqual(out.v2, ['portrait.jpg', 'portrait.jpg', true])],
  ['version d’une autre photo refusée', () => assert.equal(out.v_other, 'refusé')],
  ['fichier encore utile reconnu (version, autre média)', () => assert.deepEqual(out.used, [true, false, true, false])],
];
let failed = 0;
for (const [name, fn] of checks) { try { fn(); console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + e.message); } }
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${checks.length - failed} vérifications réussies${failed ? `, ${failed} échec(s)` : ''}.`);
process.exitCode = failed ? 1 : 0;
