'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Test de lib/media_av.php :   npm run test:media-av
 * Listes 🎧 Audios et 🎬 Vidéos : seulement la bonne sorte de média, rattachements (fiche, couple, enquête, collection),
 * fichier absent signalé, durées enregistrées (et refusées si absurdes ou sur une image).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-media-av-'));
fs.mkdirSync(path.join(dir, 'media'));
fs.writeFileSync(path.join(dir, 'media', 'son.mp3'), 'x'.repeat(2048));
const code = String.raw`
require 'lib/paths.php';
(new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'))->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
require 'lib/bootstrap.php';
$pdo = db();
$src = file_get_contents('api.php'); $a = strpos($src, 'function person_select'); $b = strpos($src, "\n}\n", $a); eval(substr($src, $a, $b - $a + 3));
$out = ['version' => (int) $pdo->query('PRAGMA user_version')->fetchColumn()];
$pdo->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Jean','Dupont','male'),('Marie','Martin','female')");
$pdo->exec("INSERT INTO families(partner1_id,partner2_id) VALUES(1,2)");
$m = $pdo->prepare('INSERT INTO media(title,media_type,filename,created_at) VALUES(?,?,?,?)');
$m->execute(['Interview', 'audio', 'son.mp3', '2024-01-01']); $a1 = (int) $pdo->lastInsertId();
$m->execute(['Perdu', 'audio', 'absent.mp3', '2023-01-01']); $a2 = (int) $pdo->lastInsertId();
$m->execute(['Mariage', 'video', 'film.mp4', '2022-01-01']); $v1 = (int) $pdo->lastInsertId();
$m->execute(['Photo', 'image', 'photo.jpg', '2022-01-01']); $i1 = (int) $pdo->lastInsertId();
$l = $pdo->prepare('INSERT INTO media_links(media_id,entity_type,entity_id) VALUES(?,?,?)');
$l->execute([$a1, 'person', 1]); $l->execute([$a1, 'family', 1]); $l->execute([$v1, 'person', 2]);
try { $pdo->exec("INSERT INTO investigations(person_id,title) VALUES(1,'Qui est Jean ?')"); $pdo->prepare('INSERT INTO investigation_media(investigation_id,media_id) VALUES(1,?)')->execute([$a1]); } catch (Throwable $e) { $out['inv_err'] = $e->getMessage(); }
try { $pdo->exec("INSERT INTO family_objects(title) VALUES('Phonographe')"); $pdo->prepare("INSERT INTO family_collection_media(collection_type,collection_id,media_id) VALUES('family_object',1,?)")->execute([$a2]); } catch (Throwable $e) { $out['obj_err'] = $e->getMessage(); }
$aud = media_av_list($pdo, 'audio'); usort($aud['items'], fn($x, $y) => strcmp($x['title'], $y['title']));
$out['audio'] = array_map(fn($r) => [$r['title'], $r['exists'], $r['size'], array_map(fn($o) => $o['type'] . ':' . $o['name'] . ':' . ($o['person_id'] ?? $o['investigation_id'] ?? ''), $r['owners'])], $aud['items']);
$out['video'] = array_column(media_av_list($pdo, 'video')['items'], 'title');
$out['saved'] = save_media_durations($pdo, ['durations' => [$a1 => 125.456, $a2 => -3, $v1 => 999999, $i1 => 12]])['saved'];
$out['durations'] = array_column(media_av_list($pdo, 'audio')['items'], 'duration', 'title');
$out['image_dur'] = $pdo->query("SELECT duration_seconds FROM media WHERE id=$i1")->fetchColumn();
// Son modifié : l'original est gardé (media_versions), la version montrée change de fichier et la durée est remise à mesurer
file_put_contents(MEDIA_DIR . '/son2.wav', 'y'); $pdo->prepare("INSERT INTO media_versions(media_id, filename, label, is_original) VALUES(?, 'son.mp3', 'Original', 1), (?, 'son2.wav', 'Montage 1', 0)")->execute([$a1, $a1]);
retouch_av_show($pdo, $a1, 'son2.wav', 42.5);
$it = array_values(array_filter(media_av_list($pdo, 'audio')['items'], fn($r) => $r['id'] === $a1))[0];
$out['edited'] = [$it['filename'], $it['format'], $it['original'], $it['original_format'], $it['versions'], $it['duration']];
$vid = (int) $pdo->query("SELECT id FROM media_versions WHERE media_id=$a1 AND is_original=1")->fetchColumn();
retouch_show_version($pdo, ['media_id' => $a1, 'version_id' => $vid]);
$it = array_values(array_filter(media_av_list($pdo, 'audio')['items'], fn($r) => $r['id'] === $a1))[0];
$out['back'] = [$it['filename'], $it['original'], $it['duration'], $pdo->query("SELECT thumbnail FROM media WHERE id=$a1")->fetchColumn()];
echo json_encode($out);
`;
const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media') } });
fs.rmSync(dir, { recursive: true, force: true });
let out;
try { out = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))); } catch (_) { console.error(r.stdout, r.stderr); process.exit(1); }
const checks = [
  ['structure à jour (n°34)', () => assert.equal(out.version, 34)],
  ['seulement les sons', () => { assert.deepEqual(out.audio.map(a => a[0]), ['Interview', 'Perdu']); assert.equal(out.inv_err, undefined); assert.equal(out.obj_err, undefined); }],
  ['fichier présent mesuré, fichier absent signalé', () => { assert.deepEqual(out.audio[0].slice(1, 3), [true, 2048]); assert.deepEqual(out.audio[1].slice(1, 3), [false, 0]); }],
  ['rattachements : fiche, couple, enquête', () => assert.deepEqual(out.audio[0][3], ['person:Jean Dupont:1', 'family:Jean Dupont et Marie Martin:1', 'investigation:Qui est Jean ?:1'])],
  ['rattachement à un objet de famille', () => assert.deepEqual(out.audio[1][3], ['collection:Phonographe:'])],
  ['liste des vidéos à part', () => assert.deepEqual(out.video, ['Mariage'])],
  ['son modifié : format, original gardé et proposé, durée de la version', () => assert.deepEqual(out.edited, ['son2.wav', 'WAV', 'son.mp3', 'MP3', 2, 42.5])],
  ['revenir à l’original : plus de bouton « original », durée à remesurer, pas de vignette d’image', () => assert.deepEqual(out.back, ['son.mp3', '', null, ''])],
  ['durées : seule une valeur sensée sur un son ou une vidéo est gardée', () => { assert.equal(out.saved, 1); assert.equal(out.durations.Interview, 125.46); assert.equal(out.durations.Perdu, null); assert.equal(out.image_dur, null); }],
];
let failed = 0;
for (const [name, fn] of checks) { try { fn(); console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n    ' + e.message); } }
console.log(failed ? `\n${failed} vérification(s) en échec.` : `\n${checks.length} vérifications réussies.`);
process.exit(failed ? 1 : 0);
