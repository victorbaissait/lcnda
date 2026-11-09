<?php
/**
 * Petite généalogie pour tester les douze diagrammes de plus (tests/test-diagrammes-plus.js) : celle des diagrammes « de
 * famille » (tests/fixtures/diagram-famille-seed.php : 7 générations, implexe, coordonnées, vivants, fratrie du n° 2 et
 * leurs enfants), plus une fiche confidentielle (la tante Hélène), des correspondances ADN avec leurs correspondances en
 * commun (méthode de Leeds).
 *   GENEALOGY_DATA_DIR=… php tests/fixtures/diagram-plus-seed.php
 * Écrit : « ok plus root=… cousin=… aunt=… private=… paul=… ».
 */
$argv = [$argv[0]];
ob_start(); require __DIR__ . '/diagram-famille-seed.php'; $out = ob_get_clean();
if (!preg_match('/^ok famille (\d+)/m', $out, $m)) { fwrite(STDERR, $out); exit(1); }
$root = (int) $m[1];
require_once __DIR__ . '/../../lib/dna.php';
dna_ensure($pdo);
$one = static fn(string $sql) => (int) $pdo->query($sql)->fetchColumn();
$cousin = $one("SELECT id FROM persons WHERE first_name='Enfant0' ORDER BY id LIMIT 1");          // fils de l'oncle Paul : cousin germain de la racine
$paul = $one("SELECT id FROM persons WHERE first_name='Paul' AND last_name='MARTIN' ORDER BY id LIMIT 1");
$claire = $one("SELECT f.partner2_id FROM families f WHERE f.partner1_id=$paul AND f.partner2_id IS NOT NULL LIMIT 1"); // l'épouse de l'oncle
$helene = $one("SELECT id FROM persons WHERE first_name='Hélène' ORDER BY id LIMIT 1");
$pdo->exec("UPDATE persons SET is_private=1 WHERE id=$helene");
// Hélène a une naissance au jour près (fratrie) : elle ne doit jamais sortir dans la roue de l'année
// ADN : un test pour la racine, 12 correspondances en 3 groupes + 2 seules
$pdo->prepare("INSERT INTO dna_kits(person_id,label,company) VALUES(?,?,?)")->execute([$root, 'Mon test', 'MyHeritage']); $kit = (int) $pdo->lastInsertId();
$groups = [['Paul R.', 'Marc R.', 'Lise R.', 'Hervé B.'], ['Anne C.', 'Yves C.', 'Rose D.'], ['Jean P.', 'Sylvie P.', 'Noël T.']];
foreach ($groups as $g => $list) {
    foreach ($list as $i => $name) {
        $shared = array_values(array_filter($list, static fn($x) => $x !== $name));
        $pdo->prepare('INSERT INTO dna_matches(kit_id,name,shared_cm,segments,data_json) VALUES(?,?,?,?,?)')->execute([$kit, $name, 380 - $g * 60 - $i * 25, 8, json_encode(['shared_matches' => $shared], JSON_UNESCAPED_UNICODE)]);
    }
}
foreach ([['Seul A.', 150], ['Très proche', 1700]] as [$name, $cm]) { $pdo->prepare('INSERT INTO dna_matches(kit_id,name,shared_cm,segments,data_json) VALUES(?,?,?,?,?)')->execute([$kit, $name, $cm, 5, '{}']); }
echo "ok plus root=$root cousin=$cousin aunt=$claire private=$helene paul=$paul\n";
