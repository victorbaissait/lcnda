'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * H7 « Défaire au lieu de demander avant » (28/10) :   node tests/test-h7-sans-question.js
 *  1. les 8 questions « Es-tu sûr ? » inutiles ont disparu (et « Détacher » est devenu « Retirer ») ;
 *  2. ↶ Annuler remet une photo retirée d'un recueil (même page, même place, photo retenue) ;
 *  3. ↶ Annuler remet un lien retiré d'un recueil ;
 *  4. ↶ Annuler remet une ligne écrite à la main dans Mes listes, avec ses cases.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(appRoot, f), 'utf8');
let passed = 0;
const step = (name, fn) => { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.log('  ✗ ' + name + '\n      ' + e.message); process.exitCode = 1; } };

step('plus de question avant pour ce qui se défait', () => {
    const gone = [
        ['assets/js/heritage-atelier-widgets.js', 'Retirer ce widget ?'],
        ['assets/js/heritage-depouillements.js', 'Retirer cette photo du dépouillement ?'],
        ['assets/js/heritage-more.js', "confirmBox('Supprimer cette ligne ?'"],
        ['assets/js/heritage-records.js', 'Retirer les étapes ?'],
        ['assets/js/heritage-records.js', "confirmBox('Retirer cette ligne ?'"],
        ['assets/js/heritage-recueils.js', 'Retirer cette photo du recueil ?'],
        ['assets/js/heritage-recueils.js', 'Détacher'],
    ];
    for (const [f, s] of gone) assert.ok(!read(f).includes(s), `${f} contient encore « ${s} »`);
    for (const f of ['heritage-atelier-widgets', 'heritage-depouillements', 'heritage-records', 'heritage-recueils']) assert.match(read(`assets/js/${f}.js`), /undoToast\(/, f);
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-h7-'));
const code = String.raw`
require 'lib/paths.php';
(new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'))->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
require 'lib/bootstrap.php';
$pdo = db(); $out = [];
$pdo->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Jean','Dupont','male')");
$m = $pdo->prepare("INSERT INTO media(title,media_type,filename) VALUES(?, 'image', ?)");
$media = []; for ($i = 1; $i <= 3; $i++) { $m->execute(["Photo $i", "p$i.jpg"]); $media[] = (int) $pdo->lastInsertId(); }
$rid = save_recueil($pdo, ['title' => 'Registre', 'first_version' => 'Photos'])['id'];
$v = recueil_detail($pdo, $rid)['versions'][0]['id'];
recueil_add_images($pdo, ['recueil_id' => $rid, 'version_id' => $v, 'media_ids' => $media, 'mode' => 'new_pages']);
$d = recueil_detail($pdo, $rid); $img = $d['images'][1]; $page = $d['pages'][1]['id'];
save_recueil_page($pdo, ['id' => $page, 'best_image_id' => $img['id']]);
$before = [$img['id'], $img['page_id'], (float) $img['position'], $d['pages'][1]['shown_image_id']];
$r = remove_recueil_image($pdo, ['id' => $img['id']]);
$out['removed'] = count(recueil_detail($pdo, $rid)['images']);
restore_recueil_image($pdo, json_decode(json_encode($r['restore']), true));
$d = recueil_detail($pdo, $rid); $back = null; foreach ($d['images'] as $i) { if ((int) $i['id'] === (int) $img['id']) $back = $i; }
$out['image'] = [count($d['images']), $back ? [$back['id'], $back['page_id'], (float) $back['position'], $d['pages'][1]['shown_image_id']] === $before : false];
$fcm = $pdo->prepare("SELECT count(*) FROM family_collection_media WHERE collection_type='recueil' AND collection_id=? AND media_id=?"); $fcm->execute([$rid, $img['media_id']]);
$out['fcm'] = (int) $fcm->fetchColumn();
try { restore_recueil_image($pdo, ['recueil_id' => $rid, 'version_id' => 99999, 'media_id' => $media[0]]); $out['bad'] = 'accepté'; } catch (Throwable $e) { $out['bad'] = 'refusé'; }
$l = save_recueil_link($pdo, ['recueil_id' => $rid, 'entity_type' => 'person', 'entity_key' => '1', 'note' => 'vu en 2015', 'page_from' => $page, 'page_to' => $page]);
$r = delete_recueil_link($pdo, ['id' => $l['id']]);
$out['link_gone'] = count(recueils_for_entity($pdo, 'person', '1'));
save_recueil_link($pdo, json_decode(json_encode($r['restore']), true));
$for = recueils_for_entity($pdo, 'person', '1');
$out['link'] = [count($for), $for[0]['note'] ?? null];
$lid = save_my_list($pdo, ['name' => 'Tombes', 'source' => 'free', 'definition' => ['custom' => [['key' => 'c1', 'label' => 'Nom', 'type' => 'text']]]])['id'];
$k = save_my_list_row($pdo, ['list_id' => $lid, 'row_key' => 'f:new', 'field' => 'c1', 'value' => 'Martin'])['row_key'];
$r = save_my_list_row($pdo, ['list_id' => $lid, 'row_key' => $k, 'included' => -1]);
$q = $pdo->prepare('SELECT count(*) FROM custom_list_rows WHERE list_id=? AND included>=0'); $q->execute([$lid]); $out['row_gone'] = (int) $q->fetchColumn();
save_my_list_row($pdo, ['list_id' => $lid, 'row_key' => $k, 'included' => $r['was'], 'values' => $r['values']]);
$q = $pdo->prepare('SELECT included, data_json FROM custom_list_rows WHERE list_id=? AND row_key=?'); $q->execute([$lid, $k]); $row = $q->fetch(PDO::FETCH_ASSOC);
$out['row'] = [(int) $row['included'], json_decode($row['data_json'], true)];
echo json_encode($out, JSON_UNESCAPED_UNICODE);
`;
const phpPath = findPhp([devBundledPhp()]);
const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media') } });
let out = null;
try { out = JSON.parse(r.stdout.trim().split('\n').pop()); } catch (_) { console.log(r.stdout, r.stderr); }
step('↶ Annuler remet la photo du recueil à sa place', () => {
    assert.ok(out, 'PHP');
    assert.equal(out.removed, 2);
    assert.deepEqual(out.image, [3, true]);
    assert.equal(out.fcm, 1);
    assert.equal(out.bad, 'refusé');
});
step('↶ Annuler remet le lien du recueil', () => { assert.equal(out.link_gone, 0); assert.deepEqual(out.link, [1, 'vu en 2015']); });
step('↶ Annuler remet une ligne écrite à la main, avec ses cases', () => { assert.equal(out.row_gone, 0); assert.deepEqual(out.row, [1, {c1: 'Martin'}]); });
fs.rmSync(dir, { recursive: true, force: true });
console.log(process.exitCode ? 'Échec' : `✓ H7 sans question : ${passed} vérifications`);
