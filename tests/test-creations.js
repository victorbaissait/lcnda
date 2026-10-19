'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Listes « 🎨 Créations et carrières » :   node tests/test-creations.js
 *  1. serveur (lib/creations.php) sur une base temporaire : familles du moteur, liste générale, compte par sorte, filtres
 *     (sorte, personne citée, lieu de la base ou texte, période, image, son ou vidéo), recherche (titre, personne, lieu,
 *     année, « % » tapé), tris, rangement par sorte, pagination, fiches d'une personne supprimée cachées, mode consultation
 *     (vivants et confidentiels cachés, et pas nommés dans les crédits), paramètres forgés, 20 000 fiches en moins d'une seconde ;
 *  2. branchements : les clés des listes dans app.js (defaultListTypes), app-listes.js (groupe et validTypes), index.php,
 *     les familles du navigateur = celles du serveur, la FAQ.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-creations-'));
const code = String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p0->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Joseph','Martin','male','deceased'),('Louise','Borie','female','living'),('Paul','Borie','male','deceased'),('Jeanne','Secret','female','deceased'),('Effacé','Bientôt','male','deceased')");
$p0->exec("UPDATE persons SET is_private=1 WHERE id=4");
$p0->exec("INSERT INTO places(name,country) VALUES('Tulle','France'),('Brive','France')");
$p0->exec("INSERT INTO media(title,media_type,filename) VALUES('Prise','audio','prise.mp3'),('Photo','image','p.jpg')");
$p0 = null;
require 'lib/bootstrap.php';
require 'lib/creations.php';
$pdo = db();
art_ensure($pdo);
$pdo->exec('UPDATE persons SET is_artist=1');
$out = [];
$save = static fn(int $pid, string $kind, array $data) => art_save_item($pdo, ['person_id' => $pid, 'kind' => $kind, 'data' => $data, 'make_artist' => 1])['id'];
$m1 = $save(1, 'track_work', ['title' => 'La bourrée de Tulle', 'date' => '1958', 'place' => ['plid' => 1, 'title' => 'Tulle'], 'credits' => [['pid' => 2, 'title' => 'Louise BORIE', 'role' => 'accordéon']]]);
$m2 = $save(1, 'master', ['title' => 'Valses 100 % musette', 'year' => '1962', 'label' => ['txt' => 'Polydor'], 'catno' => '21 812', 'photos' => [['mid' => 2, 'f' => 'p.jpg']]]);
$m3 = $save(3, 'recording', ['title' => 'Prise 3', 'date' => 'vers 1784', 'sound' => ['mid' => 1, 'f' => 'prise.mp3', 'title' => 'Prise']]);
$s1 = $save(3, 'o_piece', ['title' => '<img src=x onerror=alert(1)>', 'date' => '1921', 'author' => 'Paul Borie']);
$v1 = $save(1, 'o_sculpture', ['title' => 'Le bronze', 'date' => '1930', 'place' => ['plid' => 2, 'title' => 'Brive']]);
$c1 = $save(3, 'o_ceramique', ['title' => 'Vase', 'metier' => 'faïencier']);
$i1 = art_save_item($pdo, ['person_id' => 3, 'kind' => 'invention', 'data' => ['title' => 'Moulin à vent', 'date' => '1890'], 'make_profile' => 1])['id'];
$po = $save(1, 'pol_mandate', ['title' => 'Maire de Tulle', 'fn' => 'maire', 'date' => '1945']);
$b1 = blocs_save_item($pdo, ['person_id' => 1, 'kind' => 'diploma', 'data' => ['title' => 'Certificat d’études', 'date' => '1925']])['id'];
$l1 = $save(2, 'film', ['title' => 'Film de Louise (vivante)', 'year' => '2001']);
$x1 = $save(4, 'book', ['title' => 'Livre confidentiel', 'year' => '1950']);
$d1 = $save(5, 'work', ['title' => 'Tableau orphelin', 'year' => '1900']);
$pf = $save(1, 'profile', ['title' => 'Profil d’artiste de Joseph']);
$pdo->exec('DELETE FROM persons WHERE id=5'); // la personne supprimée : sa fiche reste dans items, mais ne s'affiche plus
$L = static fn(array $g) => creations_list($pdo, $g);
$titles = static fn(array $r) => array_map(static fn($i) => $i['title'], $r['items']);
// familles du moteur
$fam = creations_families($pdo);
$out['fam'] = [array_keys($fam), in_array('o_concerto', $fam['music']['kinds'], true), in_array('o_mosaique', $fam['craft']['kinds'], true), in_array('o_mosaique', $fam['visual']['kinds'], true), in_array('paper', $fam['science']['kinds'], true) && in_array('paper', $fam['writing']['kinds'], true), $fam['all']['kinds']];
// la liste générale : sans la fiche de profil, sans la personne supprimée
$all = $L(['family' => 'all', 'sort' => 'az', 'limit' => 200]);
$out['all'] = [$all['total'], in_array('Tableau orphelin', $titles($all), true), count(array_filter($all['items'], static fn($i) => str_starts_with($i['kind'], 'profile'))), $all['readonly']];
$mus = $L(['family' => 'music', 'sort' => 'az']);
$out['music'] = [$mus['total'], $titles($mus), (array) $mus['counts'], $mus['types']['track_work']['icon'] ?? ''];
$row = array_values(array_filter($mus['items'], static fn($i) => $i['id'] === $m2))[0];
$out['row'] = [$row['thumb'], $row['f']['label'] ?? '', $row['f']['catno'] ?? '', $row['owner'], $row['year']];
$out['credits'] = array_values(array_filter($mus['items'], static fn($i) => $i['id'] === $m1))[0]['people'];
$out['av'] = [array_values(array_filter($mus['items'], static fn($i) => $i['id'] === $m3))[0]['av'], $L(['family' => 'music', 'av' => 1])['total'], $L(['family' => 'music', 'img' => 1])['total']];
// filtres
$out['kinds'] = [$L(['family' => 'music', 'kinds' => 'track_work,master'])['total'], (array) $L(['family' => 'music', 'kinds' => 'track_work'])['counts']];
$out['person'] = [$L(['family' => 'all', 'person' => 2])['total'], $titles($L(['family' => 'all', 'person' => 3, 'sort' => 'az']))];
$out['place'] = [$titles($L(['family' => 'all', 'place' => '1'])), $titles($L(['family' => 'all', 'place' => 'txt:Brive']))];
$out['period'] = [$titles($L(['family' => 'all', 'from' => '1780', 'to' => '1790'])), $L(['family' => 'all', 'from' => '1950', 'to' => '1900'])['total'], $L(['family' => 'all', 'from' => '1900'])['total']];
$out['q'] = [$titles($L(['family' => 'all', 'q' => 'bourrée'])), $L(['family' => 'all', 'q' => 'Borie'])['total'], $titles($L(['family' => 'all', 'q' => '100 %'])), $L(['family' => 'all', 'q' => '%'])['total'], $titles($L(['family' => 'all', 'q' => '1945'])), $titles($L(['family' => 'all', 'q' => 'Tulle maire']))];
// tris et rangement par sorte
$out['sorts'] = [$titles($L(['family' => 'music', 'sort' => 'year'])), $titles($L(['family' => 'music', 'sort' => 'year_desc'])), $titles($L(['family' => 'music', 'sort' => 'za'])), array_column($L(['family' => 'all', 'sort' => 'kind'])['items'], 'kind')];
$g = $L(['family' => 'all', 'sort' => 'az', 'group' => 1]); $runs = []; foreach ($g['items'] as $it) { if (end($runs) !== $it['kind']) { $runs[] = $it['kind']; } }
$out['group'] = count($runs) === count(array_unique($runs));
// pagination
$p1 = $L(['family' => 'all', 'sort' => 'az', 'limit' => 3]); $p2 = $L(['family' => 'all', 'sort' => 'az', 'limit' => 3, 'offset' => 3]);
$out['page'] = [count($p1['items']), count($p2['items']), array_intersect($titles($p1), $titles($p2)), $p1['total'], $L(['family' => 'all', 'limit' => 99999])['limit']];
// paramètres forgés : refusés ou ignorés, jamais dans le SQL
try { $L(['family' => 'x; DROP TABLE items']); $out['bad_family'] = false; } catch (Throwable $e) { $out['bad_family'] = $e->getMessage(); }
$out['bad_kinds'] = $L(['family' => 'all', 'kinds' => "track_work') OR 1=1 --,master"])['total'];
$out['bad_sort'] = count($L(['family' => 'all', 'sort' => 'title; DROP TABLE items'])['items']);
try { $L(['family' => 'all', 'q' => ['a']]); $out['bad_q'] = false; } catch (Throwable $e) { $out['bad_q'] = true; }
$out['items_left'] = (int) $pdo->query('SELECT count(*) FROM items')->fetchColumn();
$out['summary'] = creations_summary($pdo)['families'];
// mode consultation : vivants et confidentiels cachés
file_put_contents(DATA_DIR . '/consultation.json', json_encode(['hash' => password_hash('1234', PASSWORD_DEFAULT), 'since' => 'x']));
$k = $L(['family' => 'all', 'limit' => 200]);
$out['kiosk'] = [$k['readonly'], $k['total'], in_array('Film de Louise (vivante)', $titles($k), true), in_array('Livre confidentiel', $titles($k), true),
    array_values(array_filter($k['items'], static fn($i) => $i['id'] === $m1))[0]['people'], creations_summary($pdo)['families']['all'], $L(['family' => 'all', 'person' => 2])['total'],
    json_encode(array_values(array_filter($k['items'], static fn($i) => $i['id'] === $m1))[0]['f'], JSON_UNESCAPED_UNICODE)];
@unlink(DATA_DIR . '/consultation.json');
// 20 000 fiches : la page reste rapide
$pdo->beginTransaction();
$ins = $pdo->prepare('INSERT INTO items(type_key, person_id, title, date_text, date_min, date_max, year, data, sort_order) VALUES(?,?,?,?,?,?,?,?,0)');
$ip = $pdo->prepare('INSERT INTO item_people(item_id, person_id, name, role, zone, ord, field) VALUES(?,?,?,?,?,0,?)');
$ks = ['track_work', 'master', 'release', 'o_piece', 'film', 'book', 'work', 'pol_mandate', 'sp_result', 'invention', 'o_sculpture', 'o_ceramique'];
for ($n = 0; $n < 20000; $n++) {
    $y = 1700 + $n % 320; $kind = $ks[$n % count($ks)];
    $ins->execute([$kind, 1 + $n % 3, 'Fiche n°' . $n . ' ' . ['Valse', 'Bourrée', 'Portrait', 'Mandat'][$n % 4], (string) $y, $y, $y, $y, json_encode(['title' => 'Fiche ' . $n, 'date' => (string) $y, 'note' => str_repeat('texte ', 30), 'label' => ['txt' => 'Label ' . ($n % 50)]])]);
    if ($n % 5 === 0) { $ip->execute([(int) $pdo->lastInsertId(), 2, 'Louise BORIE', 'chant', 'main', 'credits']); }
}
$pdo->commit();
$times = [];
foreach ([['family' => 'all', 'sort' => 'az'], ['family' => 'music', 'sort' => 'year', 'group' => 1], ['family' => 'all', 'q' => 'bourrée label', 'sort' => 'kind'], ['family' => 'all', 'person' => 2, 'from' => '1800', 'to' => '1900', 'sort' => 'person'],
    ['family' => 'all', 'sort' => 'recent', 'offset' => 19000], ['family' => 'all', 'img' => 1, 'av' => 1]] as $g) {
    $t = microtime(true); $r = $L($g + ['limit' => 60]); $times[] = round(microtime(true) - $t, 3);
}
$t = microtime(true); creations_summary($pdo); $times[] = round(microtime(true) - $t, 3);
$out['big'] = [$L(['family' => 'all', 'limit' => 1])['total'], max($times), $times];
try { creations_api_get($pdo, ['op' => 'n_importe']); $out['bad_op'] = false; } catch (Throwable $e) { $out['bad_op'] = true; }
echo json_encode($out, JSON_UNESCAPED_UNICODE);
`;
const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media') } });
if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
const out = JSON.parse(r.stdout.trim().split('\n').pop());

// 1. serveur
assert.deepEqual(out.fam[0], ['all', 'music', 'stage', 'screen', 'writing', 'visual', 'craft', 'space', 'digital', 'hobby', 'taste', 'science', 'expeditions', 'politic', 'sport', 'school', 'mine'], 'les familles');
assert.deepEqual(out.fam.slice(1, 5), [true, true, true, true], 'concerto en musique ; mosaïque en métiers d’art ET en arts visuels ; publication en écrits ET en sciences');
assert.equal(out.fam[5], null, '« Tout » : toutes les sortes');
assert.equal(out.all[0], 11, 'la liste générale : 11 fiches (ni la fiche de profil, ni celle de la personne supprimée)');
assert.equal(out.all[1], false, 'fiche d’une personne supprimée : cachée');
assert.equal(out.all[2], 0, 'pas de fiche de profil');
assert.equal(out.all[3], false, 'pas en consultation');
assert.equal(out.music[0], 3, 'musique : morceau, album, enregistrement');
assert.deepEqual(out.music[1], ['La bourrée de Tulle', 'Prise 3', 'Valses 100 % musette'], 'A → Z');
assert.deepEqual(out.music[2], {master: 1, recording: 1, track_work: 1}, 'le compte par sorte');
assert.equal(out.music[3], '🎵', 'l’icône de la sorte');
assert.deepEqual(out.row, ['media/p.jpg', 'Polydor', '21 812', 'Joseph MARTIN', 1962], 'vignette, label à plat, n°, personne, année');
assert.deepEqual(out.credits.map(p => [p.pid, p.name, p.role]), [[2, 'Louise BORIE', 'accordéon']], 'les crédits');
assert.deepEqual(out.av, [['audio'], 1, 1], 'son ou vidéo ; avec image');
assert.deepEqual(out.kinds, [2, {master: 1, recording: 1, track_work: 1}], 'filtre Sorte ; le compte par sorte ne dépend pas du filtre Sorte');
assert.equal(out.person[0], 2, 'Louise : sa fiche à elle et celle où elle est créditée');
assert.deepEqual(out.person[1], ['<img src=x onerror=alert(1)>', 'Moulin à vent', 'Prise 3', 'Vase'], 'les fiches de Paul');
assert.deepEqual(out.place, [['La bourrée de Tulle'], ['Le bronze']], 'lieu de la base ; lieu en texte libre');
assert.deepEqual(out.period, [['Prise 3'], 5, 8], 'période (« vers 1784 » touche 1780–1790) ; bornes inversées remises dans l’ordre');
assert.deepEqual(out.q[0], ['La bourrée de Tulle'], 'recherche : titre');
assert.equal(out.q[1], 6, 'recherche : nom de la personne (4 de Paul, 1 de Louise, 1 où elle est créditée)');
assert.deepEqual(out.q[2], ['Valses 100 % musette'], 'recherche : « % » est une lettre');
assert.equal(out.q[3], 1, 'recherche « % » seule : seulement la fiche qui en contient un');
assert.deepEqual(out.q[4], ['Maire de Tulle'], 'recherche : année');
assert.deepEqual(out.q[5], ['Maire de Tulle'], 'recherche : tous les mots');
assert.deepEqual(out.sorts[0], ['Prise 3', 'La bourrée de Tulle', 'Valses 100 % musette'], 'par date');
assert.deepEqual(out.sorts[1], ['Valses 100 % musette', 'La bourrée de Tulle', 'Prise 3'], 'par date, récentes d’abord');
assert.deepEqual(out.sorts[2], ['Valses 100 % musette', 'Prise 3', 'La bourrée de Tulle'], 'Z → A');
assert.ok(out.sorts[3].every((k, i, l) => !i || l.indexOf(k) === i || l[i - 1] === k), 'par sorte : les sortes se suivent');
assert.equal(out.group, true, 'rangement par sorte : chaque sorte d’un seul tenant');
assert.deepEqual(out.page.slice(0, 4), [3, 3, [], 11], 'pagination sans doublon');
assert.equal(out.page[4], 200, 'pas plus de 200 par page');
assert.equal(out.bad_family, 'Liste inconnue.', 'famille inconnue refusée');
assert.equal(out.bad_kinds, 1, 'sorte forgée ignorée (seul « master » est une clé)');
assert.equal(out.bad_sort, 11, 'tri forgé : A → Z');
assert.equal(out.bad_q, true, 'recherche qui n’est pas un texte : refusée');
assert.equal(out.items_left, 13, 'rien n’a été supprimé');
assert.equal(out.summary.all, 11); assert.equal(out.summary.music, 3); assert.equal(out.summary.craft, 1); assert.equal(out.summary.school, 1); assert.equal(out.summary.politic, 1);
assert.equal(out.kiosk[0], true, 'consultation : lecture seule');
assert.equal(out.kiosk[1], 9, 'consultation : sans la vivante ni la confidentielle');
assert.equal(out.kiosk[2], false); assert.equal(out.kiosk[3], false);
assert.deepEqual(out.kiosk[4], [], 'consultation : la vivante n’est pas nommée dans les crédits');
assert.equal(out.kiosk[5], 9, 'consultation : le résumé aussi');
assert.equal(out.kiosk[6], 0, 'consultation : on ne cherche pas les fiches d’une personne vivante');
assert.ok(!/Louise|BORIE/i.test(out.kiosk[7]), 'consultation : la vivante n’est pas nommée dans les colonnes (champ « crédits ») : ' + out.kiosk[7]);
assert.equal(out.big[0], 20011, '20 000 fiches de plus');
assert.ok(out.big[1] < 1.5, `20 000 fiches : chaque page en moins d’une seconde et demie (${out.big[2].join(' / ')} s)`);
assert.equal(out.bad_op, true);

// 2. branchements dans les fichiers partagés
const read = f => fs.readFileSync(path.join(appRoot, f), 'utf8');
const app = read('assets/js/app.js'), listes = read('assets/js/app-listes.js'), index = read('index.php'), js = read('assets/js/heritage-creations.js'), api = read('api.php');
const keys = out.fam[0].map(k => `creations_${k}`);
keys.forEach(k => {
    assert.match(app, new RegExp(`\\['${k}','45[a-q]','[^']+'\\]`), `${k} dans defaultListTypes (Réordonner, recherche des listes)`);
    assert.ok(listes.includes(`'${k}'`) && /validTypes=\[[^\]]*'creations_all'/.test(listes), `${k} dans app-listes.js`);
});
assert.match(listes, /\['g_creations', '🎨', 'Créations et carrières', \['creations_all',[^\]]*'press_review', 'palmares'\]\]/, 'le groupe, avec Revue de presse et Palmarès (pas doublées)');
assert.equal((listes.match(/'press_review'/g) || []).length, 2, 'Revue de presse : une seule fois dans les groupes (+ validTypes)');
assert.match(index, /heritage-creations\.js\?v=\d+/); assert.match(index, /creations\.css\?v=\d+/);
assert.match(api, /'creations' => .*creations_api_get/);
const jsFams = [...js.matchAll(/\{key: '([a-z]+)', icon:/g)].map(m => m[1]);
assert.deepEqual(jsFams, out.fam[0], 'les familles du navigateur = celles du serveur');
assert.ok(!/innerHTML\s*=\s*[^;]*\$\{it\.title\}/.test(js), 'le titre passe toujours par esc()');
assert.match(read('assets/js/heritage-more.js'), /groupe « 🎨 Créations et carrières »/, 'FAQ');
console.log('test-creations : OK', `(20 000 fiches : ${out.big[2].join(' / ')} s)`);
