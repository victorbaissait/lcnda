<?php
declare(strict_types=1);

/**
 * 🧭 Premier lancement (maquette docs/design/premier-lancement.html) : l'écran d'installation d'une base vide propose
 * « Qu'est-ce que tu veux faire ? » (les usages : généalogie, animaux, maison, artiste, archives, nom, entreprise,
 * souvenirs), « Commencer avec une base vide » et « 🧪 Essayer avec une base d'exemple ».
 *
 *  - premier_db_ready() : une base « prête » (on n'y montre plus jamais l'écran) a des fiches, ou a déjà été commencée
 *    (réglage « genealogie-premier ») ; une base d'avant cette version qui a des fiches ne voit donc rien de neuf ;
 *  - premier_start : crée la base vide et y range les réglages d'affichage de l'usage choisi (onglets montrés ou
 *    cachés : les mêmes clés que Réglages → Apparence → ordre du menu, réversibles), plus le premier animal (P2) ;
 *    refusé si la base a déjà des données (rien n'est jamais écrasé) ;
 *  - la base d'exemple est une généalogie À PART (« Mes généalogies », lib/paths.php) : premier_example_open la crée
 *    (ou reprend celle déjà faite) et l'ouvre ; premier_example_build la remplit (lib/exemple.php) dans sa propre
 *    requête, où DB_PATH et MEDIA_DIR sont les siens ; premier_example_leave revient à la généalogie d'où l'on vient.
 *    La vraie base n'est jamais touchée.
 */

/** Une base qui a des fiches (personnes ou animaux) ou qui a déjà été commencée depuis l'écran du premier lancement */
function premier_db_ready(string $path): bool
{
    if (!is_file($path)) { return false; }
    try {
        $pdo = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        if ((int) $pdo->query('SELECT count(*) FROM persons')->fetchColumn() > 0) { return true; }
        $has = $pdo->query("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='app_settings'")->fetchColumn();
        if ($has && $pdo->query("SELECT 1 FROM app_settings WHERE key='genealogie-premier'")->fetchColumn()) { return true; }
    } catch (Throwable) {
        return false;
    }
    return false;
}

/** Le fichier de base d'une généalogie (« » = la principale, avec son éventuel choix de base dans active_database.txt) */
function premier_genealogy_db_path(string $id): string
{
    if ($id !== '') { return genealogy_dir($id) . '/genealogy.sqlite'; }
    $selector = SHARED_DATA_DIR . '/active_database.txt';
    if (is_file($selector)) {
        $key = trim((string) @file_get_contents($selector));
        if (preg_match('#^data/(bases/)?[A-Za-z0-9._ -]+\.(sqlite|db)$#i', $key) && is_file(SHARED_DATA_DIR . '/' . substr($key, 5))) {
            return SHARED_DATA_DIR . '/' . substr($key, 5);
        }
    }
    return SHARED_DATA_DIR . '/genealogy.sqlite';
}

/** Le jeton CSRF d'une autre généalogie (même calcul que csrf_token()), pour enchaîner sans recharger la page */
function premier_csrf_for(string $id): string
{
    $s = (string) ($_SESSION['csrf'] ?? '');
    if ($s === '') { return ''; }
    return $id === '' ? $s : substr(hash_hmac('sha256', 'genealogy:' . $id, $s), 0, 48);
}

/** L'entrée « exemple » de la liste des généalogies, si celle qui est ouverte en est une */
function premier_example_entry(?string $id = null): ?array
{
    $id ??= GENEALOGY_ID;
    if ($id === '') { return null; }
    foreach (genealogies_registry()['list'] as $g) {
        if ($g['id'] === $id && !empty($g['example'])) { return $g; }
    }
    return null;
}

/** Les réglages d'affichage envoyés par l'écran (clés « genealogie-… » permises, texte court, 40 au plus) */
function premier_clean_settings($raw): array
{
    $out = [];
    if (!is_array($raw)) { return $out; }
    foreach ($raw as $key => $value) {
        $key = (string) $key;
        if (count($out) >= 40 || !app_setting_key_allowed($key) || $key === 'genealogie-premier' || !is_string($value) || strlen($value) > 65536) { continue; }
        $out[$key] = $value;
    }
    return $out;
}

const PREMIER_USAGES = ['genealogie', 'lignee', 'recensement', 'maison', 'artiste', 'archives', 'nom', 'entreprise', 'souvenirs'];

function premier_dispatch(string $action, array $data): array
{
    if ($action === 'premier_start') { return premier_start($data); }
    if ($action === 'premier_example_open') { return premier_example_open(); }
    if ($action === 'premier_example_build') { return premier_example_build(); }
    if ($action === 'premier_example_leave') { return premier_example_leave(); }
    throw new RuntimeException('Action inconnue.');
}

/** « Commencer avec une base vide » (ou « Créer le premier animal ») : la base est créée avec les réglages de l'usage */
function premier_start(array $data): array
{
    if (premier_db_ready(DB_PATH)) {
        throw new RuntimeException('Cette généalogie a déjà des données : rien n’a été changé.');
    }
    $usages = array_values(array_intersect(PREMIER_USAGES, array_map('strval', is_array($data['usages'] ?? null) ? $data['usages'] : [])));
    if (!$usages) { $usages = ['genealogie']; }
    $animal = is_array($data['animal'] ?? null) ? $data['animal'] : null;
    $animalName = $animal ? mb_substr(trim((string) ($animal['name'] ?? '')), 0, 120) : '';
    if ($animal && $animalName === '') { throw new RuntimeException('Donne un nom à ton animal.'); }
    init_empty_database();
    $pdo = db();
    $settings = premier_clean_settings($data['settings'] ?? null);
    $settings['genealogie-premier'] = json_encode(['v' => 1, 'usages' => $usages, 'at' => date('c')], JSON_UNESCAPED_UNICODE);
    $up = $pdo->prepare('INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP');
    $pdo->beginTransaction();
    try {
        foreach ($settings as $k => $v) { $up->execute([$k, $v]); }
        $animalId = 0;
        if ($animal) {
            $sex = in_array($animal['sex'] ?? '', ['M', 'F'], true) ? (string) $animal['sex'] : '';
            $pdo->prepare("INSERT INTO persons(first_name,gender,living_status,kind,is_start) VALUES(?,?,'unknown','animal',1)")
                ->execute([$animalName, $sex === 'M' ? 'male' : ($sex === 'F' ? 'female' : 'unknown')]);
            $animalId = (int) $pdo->lastInsertId();
            $petId = pet_of_person($pdo, $animalId, true);
            $species = (string) ($animal['species'] ?? '');
            $idKind = (string) ($animal['id_kind'] ?? 'microchip');
            $pet = ['name' => $animalName, 'species' => array_key_exists($species, PET_SPECIES) ? $species : 'autre', 'breed' => (string) ($animal['breed'] ?? ''),
                'sex' => $sex, 'affix' => (string) ($animal['affix'] ?? '')];
            $idField = ['microchip' => 'microchip', 'tattoo' => 'tattoo', 'pedigree' => 'pedigree_number'][$idKind] ?? 'microchip';
            $pet[$idField] = (string) ($animal['id_value'] ?? '');
            if ($petId) { $pdo->prepare('UPDATE pets SET data_json=? WHERE id=?')->execute([json_encode(pet_clean($pet), JSON_UNESCAPED_UNICODE), $petId]); }
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        throw $e;
    }
    if (function_exists('log_change')) {
        log_change($pdo, 'meta', 0, 'create', 'Premier lancement : ' . implode(', ', $usages), null, ['usages' => $usages]);
    }
    return ['ok' => true, 'usages' => $usages, 'animal_id' => $animalId];
}

/** 🧪 Ouvre la généalogie d'exemple (la crée la première fois) ; renvoie le jeton pour la remplir sans recharger */
function premier_example_open(): array
{
    if (premier_example_entry()) { throw new RuntimeException('La base d’exemple est déjà ouverte.'); }
    $reg = genealogies_registry();
    $id = '';
    foreach ($reg['list'] as $g) {
        if (!empty($g['example']) && is_dir(genealogy_dir($g['id']))) { $id = $g['id']; break; }
    }
    if ($id === '') {
        require_once __DIR__ . '/exemple.php';
        $id = (string) genealogy_action('genealogy_create', ['name' => EXEMPLE_NAME])['id'];
        $reg = genealogies_registry();
    }
    foreach ($reg['list'] as &$g) {
        if ($g['id'] === $id) { $g['example'] = true; $g['from'] = GENEALOGY_ID; }
    }
    unset($g);
    $reg['active'] = $id;
    genealogies_registry_save($reg);
    return ['ok' => true, 'id' => $id, 'csrf' => premier_csrf_for($id)];
}

/** 🧪 Remplit la base d'exemple ouverte (une seule fois : déjà remplie, rien n'est refait) */
function premier_example_build(): array
{
    if (!premier_example_entry()) { throw new RuntimeException('Ce n’est pas la base d’exemple : rien n’a été fait.'); }
    require_once __DIR__ . '/exemple.php';
    init_empty_database();
    $pdo = db();
    if ((int) $pdo->query('SELECT count(*) FROM persons')->fetchColumn() > 0) { return ['ok' => true, 'already' => true]; }
    $stats = exemple_build($pdo, MEDIA_DIR);
    $pdo->prepare('INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
        ->execute(['genealogie-premier', json_encode(['v' => 1, 'usages' => ['genealogie'], 'example' => true, 'at' => date('c')])]);
    return ['ok' => true] + $stats;
}

/** 🧪 Quitter la base d'exemple : retour à la généalogie d'où l'on vient (elle est dite « prête » ou encore vide) */
function premier_example_leave(): array
{
    $entry = premier_example_entry();
    if (!$entry) { throw new RuntimeException('Ce n’est pas la base d’exemple.'); }
    $reg = genealogies_registry();
    $from = (string) ($entry['from'] ?? '');
    if ($from !== '' && !in_array($from, array_column($reg['list'], 'id'), true)) { $from = ''; }
    $reg['active'] = $from;
    genealogies_registry_save($reg);
    return ['ok' => true, 'id' => $from, 'genealogy' => $from === '' ? 'main' : $from, 'csrf' => premier_csrf_for($from), 'ready' => premier_db_ready(premier_genealogy_db_path($from))];
}
