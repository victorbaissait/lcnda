'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Test de lib/recueils.php :   npm run test:recueils
 * 📚 Recueils : pages dans l'ordre, deux versions qui coexistent, photos posées sur les pages existantes,
 * détail (zoom), image retenue, page supprimée (photos « à ranger »), rattachement de quelques pages à une fiche.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-recueils-'));
const code = String.raw`
require 'lib/paths.php';
(new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'))->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
require 'lib/bootstrap.php';
$pdo = db();
$out = ['version' => (int) $pdo->query('PRAGMA user_version')->fetchColumn()];
$pdo->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Jean','Dupont','male')");
$m = $pdo->prepare("INSERT INTO media(title,media_type,filename) VALUES(?, 'image', ?)");
$media = []; for ($i = 1; $i <= 8; $i++) { $m->execute(["Photo $i", "p$i.jpg"]); $media[] = (int) $pdo->lastInsertId(); }
$r = save_recueil($pdo, ['title' => 'Prisonniers d’Ulm', 'reference' => 'SHD 1 M 123', 'first_version' => 'Photos 2015']);
$rid = $r['id'];
$d = recueil_detail($pdo, $rid); $v1 = $d['versions'][0]['id'];
// 2015 : 3 pages photographiées
recueil_add_images($pdo, ['recueil_id' => $rid, 'version_id' => $v1, 'media_ids' => array_slice($media, 0, 3), 'mode' => 'new_pages']);
// 2026 : nouvelle version, 4 photos posées sur les pages dans l'ordre (3 existantes + 1 nouvelle)
$add = recueil_add_images($pdo, ['recueil_id' => $rid, 'new_version' => 'Photos 2026', 'media_ids' => array_slice($media, 3, 4), 'mode' => 'fill']);
$d = recueil_detail($pdo, $rid);
$out['counts'] = [count($d['versions']), count($d['pages']), count($d['images']), $add['new_pages']];
$v2 = $add['version_id'];
$img = []; foreach ($d['images'] as $i) { $img[$i['media_id']] = $i; }
// page 1 : la plus récente est montrée par défaut ; on retient celle de 2015
$p1 = $d['pages'][0]['id'];
$out['default_shown'] = $d['pages'][0]['shown_image_id'] === $img[$media[3]]['id'];
save_recueil_page($pdo, ['id' => $p1, 'best_image_id' => $img[$media[0]]['id'], 'label' => 'f° 1', 'transcription' => 'Liste des prisonniers']);
// une photo de 2015 en plus = un zoom de la page 2
$z = recueil_add_images($pdo, ['recueil_id' => $rid, 'version_id' => $v1, 'media_ids' => [$media[7]], 'mode' => 'loose']);
$d = recueil_detail($pdo, $rid); $img = []; foreach ($d['images'] as $i) { $img[$i['media_id']] = $i; }
$out['loose'] = $img[$media[7]]['page_id'];
update_recueil_image($pdo, ['id' => $img[$media[7]]['id'], 'page_id' => $d['pages'][1]['id'], 'role' => 'detail']);
try { save_recueil_page($pdo, ['id' => $p1, 'best_image_id' => $img[$media[7]]['id']]); $out['best_other'] = 'accepté'; } catch (Throwable $e) { $out['best_other'] = 'refusé'; }
$d = recueil_detail($pdo, $rid);
$out['p1'] = [$d['pages'][0]['label'], $d['pages'][0]['shown_image_id'] === $img[$media[0]]['id']];
$out['p2_shown_not_detail'] = $d['pages'][1]['shown_image_id'] !== $img[$media[7]]['id'];
// déplacer la page 4 en tête
save_recueil_page($pdo, ['id' => $d['pages'][3]['id'], 'to_index' => 1]);
$d2 = recueil_detail($pdo, $rid);
$out['moved'] = $d2['pages'][0]['id'] === $d['pages'][3]['id'] && $d2['pages'][1]['label'] === 'f° 1';
// rattacher les pages 2 à 3 (dans le désordre) à Jean
save_recueil_link($pdo, ['recueil_id' => $rid, 'entity_type' => 'person', 'entity_key' => '1', 'page_from' => $d2['pages'][2]['id'], 'page_to' => $d2['pages'][1]['id']]);
try { save_recueil_link($pdo, ['recueil_id' => $rid, 'entity_type' => 'person', 'entity_key' => '999']); $out['bad_link'] = 'accepté'; } catch (Throwable $e) { $out['bad_link'] = 'refusé'; }
$for = recueils_for_entity($pdo, 'person', '1');
$out['for'] = [count($for), $for[0]['from_num'], $for[0]['to_num'], $for[0]['pages'], $for[0]['transcribed'], $for[0]['thumbs'][0]['label']];
$out['person_data'] = count(heritage_person_data($pdo, 1)['recueils']);
// supprimer une page : ses photos passent « à ranger »
delete_recueil_page($pdo, ['id' => $d2['pages'][1]['id']]);
$d3 = recueil_detail($pdo, $rid);
$out['after_delete'] = [count($d3['pages']), count(array_filter($d3['images'], fn($i) => $i['page_id'] === null))];
// supprimer la version 2026 : ses photos quittent le recueil, restent dans Médias
delete_recueil_version($pdo, ['id' => $v2]);
$d4 = recueil_detail($pdo, $rid);
$out['after_version'] = [count($d4['versions']), count($d4['images']), (int) $pdo->query('SELECT COUNT(*) FROM media')->fetchColumn(), (int) $pdo->query("SELECT COUNT(*) FROM family_collection_media WHERE collection_type='recueil'")->fetchColumn()];
try { delete_recueil_version($pdo, ['id' => $v1]); $out['last_version'] = 'supprimée'; } catch (Throwable $e) { $out['last_version'] = 'gardée'; }
$list = recueils_list($pdo)['recueils'][0];
$out['list'] = [$list['pages'], $list['transcribed'], $list['versions'], $list['links'], $list['cover'] !== null];
$out['av_owner'] = 'ok';
// dossiers de « À ranger » : créer, ranger, renommer, supprimer
$d5 = recueil_detail($pdo, $rid); $im = $d5['images'][0]['id'];
save_recueil_trays($pdo, ['recueil_id' => $rid, 'trays' => ['Liste A', 'Liste B', 'Liste A', '']]);
update_recueil_image($pdo, ['id' => $im, 'tray' => 'Liste A']);
save_recueil_trays($pdo, ['recueil_id' => $rid, 'trays' => ['Liste C', 'Liste B'], 'rename' => ['from' => 'Liste A', 'to' => 'Liste C']]);
$t1 = recueil_detail($pdo, $rid); $tr1 = array_values(array_filter($t1['images'], fn($i) => $i['id'] === $im))[0]['tray'];
save_recueil_trays($pdo, ['recueil_id' => $rid, 'trays' => ['Liste B']]);
$t2 = recueil_detail($pdo, $rid); $tr2 = array_values(array_filter($t2['images'], fn($i) => $i['id'] === $im))[0]['tray'];
$out['trays'] = [$t1['recueil']['trays'], $tr1, $t2['recueil']['trays'], $tr2];
// nouvelle page au début, puis juste après la page 1
$r1 = update_recueil_image($pdo, ['id' => $im, 'page_id' => -2]);
$t3 = recueil_detail($pdo, $rid);
$r2 = update_recueil_image($pdo, ['id' => $d5['images'][1]['id'], 'page_id' => -1, 'after_page' => $t3['pages'][0]['id']]);
$t4 = recueil_detail($pdo, $rid);
$out['new_pages'] = [$t3['pages'][0]['id'] === $r1['page_id'], count($t4['pages']) - count($d5['pages']), $t4['pages'][1]['id'] === $r2['page_id']];
// un rattachement rangé dans un dossier d'enquête, puis visible partout
$lk = recueils_for_entity($pdo, 'person', '1')[0]['link_id'];
move_recueil_link($pdo, ['id' => $lk, 'folder_id' => 0]); $f0 = recueils_for_entity($pdo, 'person', '1')[0]['folder_id'];
move_recueil_link($pdo, ['id' => $lk, 'folder_id' => '']); $f1 = recueils_for_entity($pdo, 'person', '1')[0]['folder_id'];
$out['folder'] = [$f0, $f1];
// tableau d'une page : nettoyé (identifiants, cellules de colonnes inconnues, fusions invalides), relu
$pg = recueil_detail($pdo, $rid)['pages'][0]['id'];
save_recueil_page($pdo, ['id' => $pg, 'table' => ['locked' => false, 'cols' => [['id' => 'c1', 'name' => 'Nom'], ['id' => 'c2', 'name' => 'Âge'], ['id' => 'c1', 'name' => 'doublon']],
    'rows' => [['id' => 'r1', 'c' => ['c1' => 'DUPONT Jean', 'c2' => '23', 'zz' => 'perdu'], 'person' => ['id' => 1, 'name' => 'Jean Dupont', 'link' => 9]], ['id' => 'r2', 'c' => ['c1' => 'x<script>']]],
    'merges' => [['r' => 'r1', 'c' => 'c1', 'rs' => 2, 'cs' => 1], ['r' => 'r9', 'c' => 'c1', 'rs' => 2, 'cs' => 1], ['r' => 'r2', 'c' => 'c2', 'rs' => 1, 'cs' => 1]]]]);
$tb = array_values(array_filter(recueil_detail($pdo, $rid)['pages'], fn($x) => $x['id'] === $pg))[0]['table'];
$out['table'] = [count($tb['cols']), $tb['rows'][0]['c'], $tb['rows'][0]['person']['id'], count($tb['merges']), $tb['locked']];
save_recueil_page($pdo, ['id' => $pg, 'table' => null]);
$out['table_cleared'] = array_values(array_filter(recueil_detail($pdo, $rid)['pages'], fn($x) => $x['id'] === $pg))[0]['table'];
// couverture choisie, puis automatique
$cov = (int) $pdo->query("SELECT id FROM media WHERE media_type='image' ORDER BY id DESC LIMIT 1")->fetchColumn();
save_recueil($pdo, ['id' => $rid, 'title' => 'X', 'cover_media_id' => $cov]); $c1 = recueil_detail($pdo, $rid)['recueil']['cover'];
save_recueil($pdo, ['id' => $rid, 'title' => 'X', 'cover_media_id' => 0]); $c2 = recueil_detail($pdo, $rid)['recueil']['cover'];
$out['cover'] = [$c1['media_id'] === $cov && !empty($c1['chosen']), empty($c2['chosen'])];
// juste une image : médias de la fiche, bloc Résistance, Atelier ; deux fois = déjà là
$tg = array_column(recueil_media_targets($pdo, 'person', '1')['targets'], 'value');
$r1 = recueil_link_media($pdo, ['media_id' => $cov, 'target' => 'person:1']); $r2 = recueil_link_media($pdo, ['media_id' => $cov, 'target' => 'person:1']);
recueil_link_media($pdo, ['media_id' => $cov, 'target' => 'collection:resistance:1']);
$pdo->exec("INSERT INTO atelier_projects(title) VALUES('Thèse')"); $ap = (int) $pdo->lastInsertId();
recueil_link_media($pdo, ['media_id' => $cov, 'target' => "atelier:$ap:0", 'title' => 'Registre — p. 1']);
$own = array_column(recueil_media_owners($pdo, $cov)['owners'], 'label');
try { recueil_link_media($pdo, ['media_id' => $cov, 'target' => 'collection:bidon:1']); $bad = 'accepté'; } catch (Throwable $e) { $bad = 'refusé'; }
$out['img_link'] = [in_array('person:1', $tg, true), in_array('collection:resistance:1', $tg, true), $r1['already'], $r2['already'],
    (int) $pdo->query("SELECT COUNT(*) FROM family_collection_media WHERE collection_type='resistance' AND collection_id=1 AND media_id=$cov")->fetchColumn(),
    (int) $pdo->query("SELECT COUNT(*) FROM atelier_items WHERE project_id=$ap AND type='media'")->fetchColumn(), in_array('Fiche', $own, true), $bad];
$del = delete_recueil($pdo, ['id' => $rid, 'delete_media' => true]);
$out['deleted'] = [(int) $pdo->query('SELECT COUNT(*) FROM recueils')->fetchColumn(), (int) $pdo->query('SELECT COUNT(*) FROM recueil_pages')->fetchColumn(), $del['media_deleted']];
echo json_encode($out);
`;
const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media') } });
fs.rmSync(dir, { recursive: true, force: true });
let out;
try { out = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))); } catch (_) { console.error(r.stdout, r.stderr); process.exit(1); }
const checks = [
  ['structure à jour (n°37)', () => assert.equal(out.version, 37)],
  ['deux versions ; les nouvelles photos remplissent les pages existantes puis en créent une', () => assert.deepEqual(out.counts, [2, 4, 7, 1])],
  ['par défaut, la page montre la photo la plus récente ; on peut retenir l’ancienne', () => { assert.equal(out.default_shown, true); assert.deepEqual(out.p1, ['f° 1', true]); }],
  ['photo « à ranger », puis posée en détail (zoom) sur une page', () => { assert.equal(out.loose, null); assert.equal(out.p2_shown_not_detail, true); }],
  ['l’image retenue doit être sur la page', () => assert.equal(out.best_other, 'refusé')],
  ['déplacer une page en tête', () => assert.equal(out.moved, true)],
  ['rattacher des pages (dans le désordre) à une fiche ; fiche inexistante refusée', () => { assert.deepEqual(out.for, [1, 2, 3, 2, 1, 'f° 1']); assert.equal(out.bad_link, 'refusé'); assert.equal(out.person_data, 1); }],
  ['supprimer une page : ses photos passent à ranger', () => assert.deepEqual(out.after_delete, [3, 2])],
  ['supprimer une version : ses photos quittent le recueil mais restent dans Médias ; la dernière version est gardée', () => { assert.deepEqual(out.after_version, [1, 4, 8, 4]); assert.equal(out.last_version, 'gardée'); }],
  ['liste des recueils : chiffres et vignette', () => assert.deepEqual(out.list, [3, 0, 1, 1, true])],
  ['dossiers de « À ranger » : sans doublon, renommés avec leurs photos, supprimés sans perdre les photos', () => assert.deepEqual(out.trays, [['Liste C', 'Liste B'], 'Liste C', ['Liste B'], ''])],
  ['nouvelle page au début, puis juste après la première', () => assert.deepEqual(out.new_pages, [true, 2, true])],
  ['recueil d’une enquête : dans un dossier (0 = racine) ou partout', () => assert.deepEqual(out.folder, [0, null])],
  ['tableau d’une page : colonnes uniques, cellules inconnues retirées, ligne rattachée gardée, fusion invalide retirée ; effaçable', () => { assert.deepEqual(out.table, [2, {c1: 'DUPONT Jean', c2: '23'}, 1, 1, false]); assert.equal(out.table_cleared, null); }],
  ['couverture choisie (image de Médias), puis revenue à la première page', () => assert.deepEqual(out.cover, [true, true])],
  ['juste une image : médias de la fiche, bloc Résistance, projet de l’Atelier ; pas de doublon ; bloc inconnu refusé', () => assert.deepEqual(out.img_link, [true, true, false, true, 1, 1, true, 'refusé'])],
  ['recueil supprimé avec ses photos qui ne servent nulle part ailleurs (celle rattachée à la fiche est gardée)', () => assert.deepEqual(out.deleted, [0, 0, 3])],
];
let failed = 0;
for (const [name, fn] of checks) { try { fn(); console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n    ' + e.message); } }
console.log(failed ? `\n${failed} vérification(s) en échec.` : `\n${checks.length} vérifications réussies.`);
process.exit(failed ? 1 : 0);
