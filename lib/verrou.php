<?php
declare(strict_types=1);

/**
 * 🔐 B7 — Mot de passe d'une généalogie (verrou d'ouverture) et 📜 B8 — registre « Qui a vu quoi ».
 * Maquette : docs/design/onglets-et-successoral-outils.html (B7, B8). Écrans : assets/js/app-verrou.js (réglages, registre,
 * reverrouillage), assets/js/app-verrou-ecran.js + lib/verrou_page.php (l'écran « 🔐 … est verrouillée »).
 *
 * CE QUE LE VERROU PROTÈGE (et ce qu'il ne protège pas) :
 *  - c'est un verrou d'OUVERTURE dans l'app : tant que la séance n'est pas déverrouillée, le serveur PHP refuse toute
 *    lecture et toute écriture de la base (api.php, upload.php, médias servis par router.php, index.php, telecharger.php,
 *    index léger des dossiers lu depuis une autre généalogie…), sauf une petite liste blanche (glock_guard()) ;
 *  - le fichier SQLite N'EST PAS chiffré : qui copie le dossier des données peut le lire avec un autre logiciel. D'où le
 *    conseil de chiffrer le disque (FileVault, BitLocker) et les sauvegardes toujours protégées (AES-256, même mot de passe).
 *
 * OÙ EST LE MOT DE PASSE : nulle part. Seule son empreinte (password_hash : Argon2id si PHP le connaît, sinon bcrypt coût 12)
 * est gardée, à deux endroits :
 *  1. dans la base elle-même, table app_lock (une ligne) : c'est elle qui fait foi ; supprimer ou remplacer un fichier de
 *     réglages ne retire donc pas le verrou (il faudrait modifier la base avec un autre logiciel, ce qui suppose de pouvoir
 *     déjà la lire : c'est la limite écrite plus haut, pas une porte en plus) ;
 *  2. dans DATA_DIR/verrou.json (le dossier de la généalogie) : il couvre aussi les autres bases du dossier (bases/…) et
 *     une copie restaurée sans la ligne. Verrouillée = l'un OU l'autre existe. Pour ouvrir : l'empreinte de la base si elle
 *     existe, sinon celle du fichier (remplacer le fichier par une empreinte connue ne sert donc à rien tant que la base a
 *     la sienne). À chaque ouverture réussie les deux sont remis d'accord.
 *  Avant password_hash, le mot de passe passe par SHA-384 (glock_prehash) : bcrypt s'arrête à 72 octets et refuse l'octet
 *  nul ; ainsi 1024 caractères, l'unicode et l'octet nul comptent en entier.
 *
 * LA SÉANCE : la session PHP (cookie HttpOnly, SameSite=Strict, mode strict) garde seulement {lock_id, vu à, boot} ;
 * l'identifiant de session est changé au déverrouillage (l'ancien ne sert plus) ; reverrouillé après N minutes sans geste
 * (5, 15 par défaut, 60 ou jamais : seule une action « glock_touch » envoyée par la page quand on s'en sert repousse le délai,
 * pas les lectures de fond), au « 🔐 Verrouiller maintenant », au changement de généalogie, et à la fermeture de l'app
 * (GENEALOGY_BOOT_ID change à chaque lancement du serveur par l'app de bureau).
 *
 * LES ESSAIS : un seul à la fois (verrou de fichier), 0,25 s chacun, puis 1 s, 2 s, 4 s… jusqu'à 60 s après chaque
 * échec ; le compteur est dans DATA_DIR/verrou-essais.json (il survit à un redémarrage) ; chaque essai vérifié est noté au
 * registre (B8). Toujours le même message, quel que soit le refus.
 *
 * 📜 B8 : table access_log (migration 94), écrite par le serveur seulement (access_log_add) ; aucune action ne la modifie ni
 * ne l'efface, sauf la purge des lignes plus vieilles que la durée réglée (12 mois par défaut), elle-même notée. Jamais de
 * mot de passe, d'adresse ni de montant : la sorte, l'objet (n° + libellé court), le poste (nom de l'ordinateur), la date.
 */

const GLOCK_MINUTES = [5, 15, 60, 0];          // 0 = jamais (seulement à la fermeture, au changement de généalogie, à la main)
const GLOCK_DEFAULT_MINUTES = 15;
const GLOCK_MIN_LEN = 8;
const GLOCK_MAX_LEN = 1024;
const GLOCK_DELAY_CAP = 60;                    // secondes, après de nombreux échecs
const GLOCK_TOUCH_EVERY = 20;                  // un geste ne réécrit la session qu'au plus toutes les 20 s
const GLOCK_ERR = 'Mot de passe incorrect.';   // le seul message de refus (aucun détail utile à qui essaie au hasard)
const ACCESS_LOG_MONTHS = [3, 6, 12, 36, 0];   // 0 = tout garder
const ACCESS_LOG_SETTING = 'lcnda-qui-a-vu';   // clé d'app_settings hors « genealogie-… » : save_settings ne peut pas l'écrire

/* ═════════ Horloge, poste, séance ═════════ */

/** L'heure du serveur ; les essais automatiques avancent l'horloge par un fichier donné au lancement (variable d'environnement). */
/** Les portes d'essai (horloge avancée, nom d'ordinateur imposé) : seulement hors de l'app de bureau (pas de secret), ou
 *  quand un essai le dit (GENEALOGY_TEST=1, que l'app installée ne transmet jamais : electron/php-server.js). */
function lcnda_test_env_ok(): bool
{
    return getenv('GENEALOGY_TEST') === '1' || (string) getenv('GENEALOGY_APP_SECRET') === '';
}

function glock_now(): int
{
    $f = getenv('LCNDA_TEST_CLOCK_FILE');
    if (getenv('GENEALOGY_TEST') === '1' && (string) getenv('GENEALOGY_APP_SECRET') === '' && is_string($f) && $f !== '' && is_file($f)) { return time() + (int) trim((string) @file_get_contents($f)); }
    return time();
}

/** La même horloge, à la fraction de seconde près (freinage des essais : pas d'arrondi à la seconde qui laisserait passer un essai trop tôt). */
function glock_nowf(): float { return microtime(true) + (glock_now() - time()); }

/** Un lancement du serveur par l'app de bureau (electron/php-server.js) : change à chaque ouverture de l'app. */
function glock_boot(): string { return (string) (getenv('GENEALOGY_BOOT_ID') ?: ''); }

function glock_key(): string { return GENEALOGY_ID === '' ? 'main' : GENEALOGY_ID; }

/** Mêmes réglages de session partout (bootstrap.php, router.php) : cookie HttpOnly + SameSite=Strict, identifiants inconnus refusés. */
function lcnda_session_config(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) { return; }
    $sessionDir = getenv('GENEALOGY_SESSION_DIR');
    if (is_string($sessionDir) && $sessionDir !== '') {
        if (!is_dir($sessionDir)) { @mkdir($sessionDir, 0700, true); }
        if (is_dir($sessionDir)) { session_save_path($sessionDir); }
    }
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.use_trans_sid', '0');
    ini_set('session.cookie_httponly', '1');
    session_set_cookie_params(['path' => '/', 'httponly' => true, 'samesite' => 'Strict']);
}

/** Écrire dans la session déjà refermée (bootstrap.php la referme tout de suite) : on la rouvre le temps d'un changement. */
function glock_session_write(callable $fn): void
{
    if (PHP_SAPI === 'cli') { $fn(); return; }
    if (session_status() !== PHP_SESSION_ACTIVE) { lcnda_session_config(); @session_start(); }
    $fn();
    session_write_close();
}

/* ═════════ Où est le verrou ═════════ */

function glock_marker_path(?string $dataDir = null): string { return ($dataDir ?? DATA_DIR) . '/verrou.json'; }
function glock_tries_path(?string $dataDir = null): string { return ($dataDir ?? DATA_DIR) . '/verrou-essais.json'; }

/** La base active d'un dossier de généalogie (même règle que active_database_path() de bootstrap.php, sans la charger). */
function glock_db_path_of(string $dataDir): string
{
    $key = is_file($dataDir . '/active_database.txt') ? trim((string) @file_get_contents($dataDir . '/active_database.txt')) : '';
    $rel = preg_match('#^data/(bases/)?[A-Za-z0-9._ -]+\.(sqlite|db)$#i', $key) && is_file($dataDir . '/' . substr($key, 5)) ? substr($key, 5) : 'genealogy.sqlite';
    return $dataDir . '/' . $rel;
}
function glock_db_path(): string { return defined('DB_PATH') ? DB_PATH : glock_db_path_of(DATA_DIR); }

function glock_marker(string $dataDir): ?array
{
    $f = glock_marker_path($dataDir);
    if (!is_file($f)) { return null; }
    $j = json_decode((string) @file_get_contents($f), true);
    if (!is_array($j) || !is_string($j['hash'] ?? null) || $j['hash'] === '' || !is_string($j['lock_id'] ?? null)) {
        error_log('LCNDA : fichier verrou.json illisible, ignoré : ' . $f);
        return null;
    }
    return ['hash' => $j['hash'], 'lock_id' => $j['lock_id'], 'minutes' => glock_minutes_ok((int) ($j['minutes'] ?? GLOCK_DEFAULT_MINUTES))];
}

/** La ligne app_lock de la base, lue en lecture seule (aucune migration, rien d'autre n'est lu). */
function glock_db_row(string $dbPath): ?array
{
    if (!is_file($dbPath)) { return null; }
    try {
        $pdo = new PDO('sqlite:' . $dbPath, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
        $pdo->exec('PRAGMA busy_timeout = 5000');
        if (!$pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='app_lock'")->fetchColumn()) { return null; }
        $r = $pdo->query('SELECT hash, lock_id, minutes FROM app_lock WHERE id=1')->fetch();
        if (!$r || (string) $r['hash'] === '') { return null; }
        return ['hash' => (string) $r['hash'], 'lock_id' => (string) $r['lock_id'], 'minutes' => glock_minutes_ok((int) $r['minutes'])];
    } catch (Throwable $e) {
        // base tenue par un autre programme : db() le dira aussitôt, sans attendre une deuxième fois (lib/bootstrap.php)
        if (function_exists('db_error_is_busy') && db_error_is_busy($e)) { db_busy_seen($dbPath, true); }
        // base illisible (abîmée, pas une base) : on ne sait pas si elle est verrouillée — on le dit au journal PHP
        error_log('LCNDA : verrou illisible dans la base (' . basename($dbPath) . ') : ' . get_class($e));
        return null;
    }
}

function glock_minutes_ok(int $m): int { return in_array($m, GLOCK_MINUTES, true) ? $m : GLOCK_DEFAULT_MINUTES; }

/** État du verrou d'une généalogie : la base fait foi, sinon le fichier du dossier. */
function glock_info(?string $dataDir = null, ?string $dbPath = null): array
{
    $dataDir = $dataDir ?? DATA_DIR;
    $dbPath = $dbPath ?? ($dataDir === DATA_DIR ? glock_db_path() : glock_db_path_of($dataDir));
    $row = glock_db_row($dbPath);
    $mark = glock_marker($dataDir);
    $use = $row ?? $mark;
    return $use ? ['locked' => true, 'hash' => $use['hash'], 'lock_id' => $use['lock_id'], 'minutes' => $use['minutes'], 'in_db' => (bool) $row, 'in_file' => (bool) $mark]
        : ['locked' => false, 'hash' => '', 'lock_id' => '', 'minutes' => GLOCK_DEFAULT_MINUTES, 'in_db' => false, 'in_file' => false];
}

/** Une AUTRE généalogie (par son dossier ou le chemin de sa base) est-elle verrouillée ? (rien d'autre n'est lu) */
function glock_locked_at(string $dataDir, ?string $dbPath = null): bool
{
    if (is_file(glock_marker_path($dataDir))) { return true; } // même illisible : on ne lit pas la base « au cas où »
    return glock_db_row($dbPath ?? glock_db_path_of($dataDir)) !== null;
}
function glock_genealogy_locked(string $id): bool
{
    return glock_locked_at($id === '' ? SHARED_DATA_DIR : genealogy_dir($id));
}
/** Le chemin d'une base (autre généalogie) → est-elle dans un dossier verrouillé, ou verrouillée elle-même ? */
function glock_path_locked(string $dbPath): bool
{
    $dir = dirname($dbPath);
    if (basename($dir) === 'bases') { $dir = dirname($dir); }
    return is_file(glock_marker_path($dir)) || glock_db_row($dbPath) !== null;
}

/* ═════════ Dossiers choisis par la page : jamais un dossier interne de l'app ═════════ */

/** Le chemin réel : realpath, ou (s'il n'existe pas encore) celui du parent le plus proche qui existe, suivi du reste. */
function glock_real_near(string $path): string
{
    $path = str_replace('\\', '/', trim($path));
    if ($path === '' || str_contains($path, "\0")) { return ''; }
    $rest = [];
    $cur = rtrim($path, '/') ?: '/';
    for ($i = 0; $i < 64; $i++) {
        $r = @realpath($cur);
        if ($r !== false) {
            $r = rtrim(str_replace('\\', '/', $r), '/');
            foreach (array_reverse($rest) as $part) { if ($part === '..' || $part === '.') { return ''; } $r .= '/' . $part; }
            return $r === '' ? '/' : $r;
        }
        $parent = dirname($cur);
        if ($parent === $cur) { break; }
        $rest[] = basename($cur);
        $cur = $parent;
    }
    return '';
}

function glock_inside(string $p, string $root): bool
{
    if ($p === '' || $root === '') { return false; }
    $p = strtolower(rtrim($p, '/')) . '/'; $root = strtolower(rtrim($root, '/')) . '/'; // insensible à la casse : macOS, Windows
    return str_starts_with($p, $root);
}

/** Les dossiers internes de l'app : données et médias communs, l'app elle-même, chaque généalogie (même mise de côté). */
function glock_internal_roots(): array
{
    $roots = [];
    foreach ([SHARED_DATA_DIR, SHARED_MEDIA_DIR, APP_ROOT, DATA_DIR, MEDIA_DIR] as $d) { $r = glock_real_near((string) $d); if ($r !== '') { $roots[$r] = true; } }
    foreach (glob(SHARED_DATA_DIR . '/genealogies/*', GLOB_ONLYDIR) ?: [] as $d) { $r = glock_real_near($d); if ($r !== '') { $roots[$r] = true; } }
    return array_keys($roots);
}

/**
 * Un dossier (ou un fichier) choisi par la page est-il interdit ? Oui s'il est dans un dossier interne de l'app : les données
 * ou les médias d'une généalogie (celle-ci comprise), ses sauvegardes, son cache, l'app elle-même. $ownBackups : seulement
 * pour une sauvegarde de CETTE généalogie, son propre dossier backups/ reste permis (hors d'une autre généalogie rangée dessous).
 * Un chemin qui ne se résout pas est interdit.
 */
function glock_forbidden_dir(string $path, bool $ownBackups = false): bool
{
    $real = glock_real_near($path);
    if ($real === '') { return true; }
    if ($ownBackups) {
        $own = glock_real_near(DATA_DIR . '/backups');
        $gen = glock_real_near(SHARED_DATA_DIR . '/genealogies');
        if ($own !== '' && glock_inside($real, $own) && !(GENEALOGY_ID === '' && glock_inside($real, $gen))) { return false; }
    }
    foreach (glock_internal_roots() as $root) { if (glock_inside($real, $root)) { return true; } }
    return false;
}

/** Refus clair (422) quand la page désigne un dossier interne de l'app. */
function glock_refuse_dir(string $path, bool $ownBackups = false): void
{
    if ($path !== '' && glock_forbidden_dir($path, $ownBackups)) {
        throw new LcndaBadInput('Ce dossier appartient à l’app (données, médias ou sauvegardes d’une généalogie) : choisis un autre dossier.');
    }
}

/* ═════════ Empreinte ═════════ */

function glock_prehash(string $pw): string { return base64_encode(hash('sha384', "lcnda-verrou\0" . $pw, true)); }
function glock_hash(string $pw): string
{
    $p = glock_prehash($pw);
    if (defined('PASSWORD_ARGON2ID')) {
        try { return password_hash($p, PASSWORD_ARGON2ID); } catch (Throwable $_) { /* PHP sans Argon2 malgré la constante */ }
    }
    return password_hash($p, PASSWORD_BCRYPT, ['cost' => 12]);
}
function glock_verify(string $pw, string $hash): bool { return $hash !== '' && password_verify(glock_prehash($pw), $hash); }

/** Le mot de passe reçu : une chaîne, 8 à 1024 caractères (unicode compris). Jamais recopié dans un message. */
function glock_pw(mixed $v): string { return is_string($v) ? $v : ''; }
function glock_check_new(string $pw, string $again): void
{
    if (!mb_check_encoding($pw, 'UTF-8')) { throw new LcndaBadInput('Ce mot de passe contient des caractères illisibles.'); }
    $n = mb_strlen($pw, 'UTF-8');
    if ($n < GLOCK_MIN_LEN) { throw new LcndaBadInput('Le mot de passe doit faire au moins 8 caractères.'); }
    if ($n > GLOCK_MAX_LEN) { throw new LcndaBadInput('Le mot de passe est trop long (1024 caractères au plus).'); }
    if (!hash_equals($pw, $again)) { throw new LcndaBadInput('Les deux mots de passe ne sont pas pareils.'); }
}

/* ═════════ Écrire le verrou (base + fichier) ═════════ */

function glock_schema(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS app_lock (id INTEGER PRIMARY KEY CHECK (id = 1), hash TEXT NOT NULL, lock_id TEXT NOT NULL, minutes INTEGER NOT NULL DEFAULT 15,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    access_log_schema($pdo);
}

function glock_write_marker(?array $lock, ?string $dataDir = null): void
{
    $f = glock_marker_path($dataDir);
    if ($lock === null) { if (is_file($f) && !@unlink($f)) { throw new RuntimeException('Impossible de retirer le verrou (dossier des données en lecture seule ?).'); } return; }
    $tmp = $f . '.' . bin2hex(random_bytes(4)) . '.part';
    $json = json_encode(['v' => 1, 'hash' => $lock['hash'], 'lock_id' => $lock['lock_id'], 'minutes' => $lock['minutes'], 'since' => date('c')], JSON_UNESCAPED_SLASHES);
    if (@file_put_contents($tmp, $json, LOCK_EX) === false || !@rename($tmp, $f)) { @unlink($tmp); throw new RuntimeException('Impossible d’enregistrer le verrou (dossier des données en lecture seule ?).'); }
    @chmod($f, 0600);
}

function glock_write_db(PDO $pdo, ?array $lock): void
{
    glock_schema($pdo);
    if ($lock === null) { $pdo->exec('DELETE FROM app_lock'); return; }
    $pdo->prepare('INSERT INTO app_lock(id, hash, lock_id, minutes, updated_at) VALUES(1,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET hash=excluded.hash, lock_id=excluded.lock_id, minutes=excluded.minutes, updated_at=CURRENT_TIMESTAMP')
        ->execute([$lock['hash'], $lock['lock_id'], $lock['minutes']]);
}

/** Une connexion d'écriture à la base active, sans passer par db() (utilisable quand la généalogie est verrouillée). */
function glock_raw_pdo(): ?PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) { return $pdo; }
    $path = glock_db_path();
    if (!is_file($path)) { return null; }
    $pdo = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    $pdo->exec('PRAGMA busy_timeout = 30000');
    return $pdo;
}

/** Les deux endroits disent la même chose (après une ouverture réussie, une restauration, une base de test du dossier). */
function glock_heal(array $info): void
{
    try {
        $lock = ['hash' => $info['hash'], 'lock_id' => $info['lock_id'], 'minutes' => $info['minutes']];
        if (!$info['in_db'] && ($pdo = glock_raw_pdo())) { glock_write_db($pdo, $lock); }
        $m = glock_marker(DATA_DIR);
        if (!$m || $m['hash'] !== $lock['hash'] || $m['lock_id'] !== $lock['lock_id'] || $m['minutes'] !== $lock['minutes']) { glock_write_marker($lock); }
    } catch (Throwable $e) { error_log('LCNDA : verrou non recopié : ' . $e->getMessage()); }
}

/* ═════════ Restaurations et copies déjà faites ═════════ */

/** Après une restauration dans une généalogie protégée : la base remise garde le verrou d'avant (même empreinte, même délai). */
function glock_keep_after_restore(PDO $pdo, array $before): void
{
    if (empty($before['locked'])) { return; }
    $lock = ['hash' => $before['hash'], 'lock_id' => $before['lock_id'], 'minutes' => $before['minutes']];
    glock_write_db($pdo, $lock);
    glock_write_marker($lock);
}

/**
 * « Revenir à une copie » : '' si la copie peut être remise ici, sinon la raison. Refusée si elle est rangée dans un dossier
 * interne de l'app d'une autre généalogie, dans le sous-dossier « genealogie-<id> » d'une généalogie protégée (dossier de
 * sauvegarde choisi), ou si elle porte le verrou d'une AUTRE protection que celle d'ici.
 */
function glock_copy_refused(string $file, array $current): string
{
    $real = glock_real_near($file);
    if ($real === '' || glock_forbidden_dir($real, true)) {
        return 'Cette copie est rangée dans les dossiers d’une autre généalogie : elle ne peut pas être remise ici.';
    }
    if (preg_match_all('#/genealogie-([a-z0-9][a-z0-9-]{0,39})(?=/)#', $real, $mm)) { // tout dossier « genealogie-<id> » sur le chemin
        foreach ($mm[1] as $gid) {
            if ($gid !== GENEALOGY_ID && genealogy_id_ok($gid) && is_dir(genealogy_dir($gid)) && glock_genealogy_locked($gid)) { return 'Cette copie vient d’une généalogie protégée par un mot de passe : ouvre-la pour la restaurer.'; }
        }
    }
    $row = glock_db_row($real);
    if ($row && (empty($current['locked']) || !hash_equals((string) $current['lock_id'], $row['lock_id']))) {
        return 'Cette copie vient d’une généalogie protégée par un mot de passe : ouvre-la pour la restaurer.';
    }
    return '';
}

/**
 * À la pose du mot de passe : les copies EN CLAIR de cette généalogie déjà faites (sauvegardes du dossier de l'app, copies
 * « avant migration », dossier de sauvegarde automatique choisi, dossiers « hors de l'ordinateur ») sont chiffrées avec le
 * mot de passe (zip AES-256, rouvrable par « Importer un fichier ») puis effacées en clair. Choix : chiffrer plutôt que
 * supprimer — rien n'est perdu, et l'app ne peut plus s'en servir pour lire la généalogie sans le mot de passe.
 * Renvoie le nombre de copies chiffrées et celles qui n'ont pas pu l'être (laissées, et dites à l'écran).
 */
function glock_protect_old_copies(PDO $pdo, string $password): array
{
    $dirs = [DATA_DIR . '/backups'];
    if (function_exists('sa_settings') && function_exists('sa_folder')) {
        $s = sa_settings();
        if ($s['dir'] !== '') { $f = sa_folder($s, GENEALOGY_ID, DATA_DIR); if (!glock_forbidden_dir($f)) { $dirs[] = $f; } }
    }
    if (function_exists('offsite_settings') && function_exists('offsite_expand')) {
        foreach ((offsite_settings($pdo)['dirs'] ?? []) as $d) {
            $p = offsite_expand((string) ($d['path'] ?? '')); if ($p === '' || glock_forbidden_dir($p)) { continue; }
            $dirs[] = GENEALOGY_ID !== '' ? $p . '/genealogie-' . GENEALOGY_ID : $p;
        }
    }
    $done = 0; $left = [];
    foreach (array_unique($dirs) as $dir) {
        foreach (glob($dir . '/genealogie-backup-*.db') ?: [] as $file) {
            try {
                $zipPath = preg_replace('/\.db$/', '', $file) . '-protegee.zip';
                $zip = new ZipArchive();
                if ($zip->open($zipPath . '.part', ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) { throw new RuntimeException('zip'); }
                $zip->addFromString(defined('BACKUP_MARKER') ? BACKUP_MARKER : 'lcnda-sauvegarde.json', json_encode(['application' => 'LCNDA — Carnet numérique des ancêtres', 'created_at' => date(DATE_ATOM, (int) filemtime($file)), 'protected' => true, 'media_files' => 0]));
                $zip->addFile($file, 'genealogie.db');
                for ($i = 0; $i < $zip->numFiles; $i++) { if (!$zip->setEncryptionIndex($i, ZipArchive::EM_AES_256, $password)) { throw new RuntimeException('aes'); } }
                if (!$zip->close() || !@rename($zipPath . '.part', $zipPath)) { throw new RuntimeException('écriture'); }
                if (!@unlink($file)) { throw new RuntimeException('effacement'); }
                $done++;
            } catch (Throwable $e) {
                @unlink(($zipPath ?? '') . '.part');
                $left[] = basename($file);
                error_log('LCNDA : copie en clair non chiffrée à la pose du mot de passe : ' . basename($file));
            }
        }
    }
    return ['protected' => $done, 'left' => $left];
}

/* ═════════ La séance ═════════ */

function glock_session_entry(): ?array
{
    $e = $_SESSION['glock'][glock_key()] ?? null;
    return is_array($e) ? $e : null;
}

function glock_is_unlocked(array $info): bool
{
    if (!$info['locked']) { return true; }
    $e = glock_session_entry();
    if (!$e || !is_string($e['id'] ?? null) || !hash_equals($info['lock_id'], $e['id'])) { return false; }
    if ((string) ($e['boot'] ?? '') !== glock_boot()) { return false; }
    if ($info['minutes'] > 0 && glock_now() - (int) ($e['seen'] ?? 0) > $info['minutes'] * 60) { return false; }
    return true;
}

/** Oublie toute généalogie déverrouillée par cette séance (verrouiller maintenant, changer de généalogie). */
function glock_forget(bool $regenerate = true): void
{
    glock_session_write(static function () use ($regenerate): void {
        unset($_SESSION['glock'], $_SESSION['b8_open']);
        if ($regenerate && PHP_SAPI !== 'cli') { @session_regenerate_id(true); }
    });
}

function glock_mark_unlocked(array $info): void
{
    glock_session_write(static function () use ($info): void {
        if (PHP_SAPI !== 'cli') { @session_regenerate_id(true); } // l'ancien identifiant ne sert plus
        $_SESSION['glock'] = [glock_key() => ['id' => $info['lock_id'], 'seen' => glock_now(), 'boot' => glock_boot()]]; // une seule à la fois
        unset($_SESSION['b8_open']);
    });
}

/* ═════════ Les essais ═════════ */

/**
 * Un essai du mot de passe de cette généalogie (ouvrir, changer, retirer, sauvegarde protégée). Un seul à la fois, freiné,
 * compteur gardé sur le disque. Renvoie ['ok' => bool, 'wait' => secondes avant le prochain essai, 'throttled' => bool].
 */
function glock_try(array $info, string $pw, string $why): array
{
    $f = glock_tries_path();
    $fh = @fopen($f, 'c+');
    if ($fh === false) { throw new RuntimeException('Impossible de vérifier le mot de passe (dossier des données en lecture seule ?).'); }
    try {
        // un essai déjà en cours de vérification : celui-ci est freiné tout de suite (jamais deux vérifications à la suite)
        if (!flock($fh, LOCK_EX | LOCK_NB)) { fclose($fh); $fh = null; return ['ok' => false, 'wait' => 1, 'throttled' => true]; }
        $raw = stream_get_contents($fh);
        $t = json_decode((string) $raw, true);
        $t = is_array($t) ? $t : [];
        $fails = max(0, (int) ($t['fails'] ?? 0)); $next = (float) ($t['next'] ?? 0);
        $now = glock_now(); $nowF = glock_nowf();
        if ($nowF < $next) { return ['ok' => false, 'wait' => max(1, (int) ceil($next - $nowF)), 'throttled' => true]; }
        usleep(250000);
        $ok = glock_verify($pw, $info['hash']);
        if ($ok) { $fails = 0; $next = 0; }
        else { $fails++; $next = glock_nowf() + min(GLOCK_DELAY_CAP, 2 ** min(10, $fails - 1)); } // compté depuis la fin de la vérification
        ftruncate($fh, 0); rewind($fh);
        fwrite($fh, json_encode(['fails' => $fails, 'next' => $next, 'last' => $now]));
        fflush($fh);
    } finally {
        if ($fh) { flock($fh, LOCK_UN); fclose($fh); }
    }
    @chmod($f, 0600);
    access_log_add(null, $ok ? 'unlock_ok' : 'unlock_fail', 'genealogy', null, '', $why);
    return ['ok' => $ok, 'wait' => $ok ? 0 : max(1, (int) round($next - glock_nowf())), 'throttled' => false];
}

/** Refus d'un essai : toujours la même phrase ; 429 si on a essayé trop tôt (sans vérifier le mot de passe). */
function glock_refuse(array $r): never
{
    header('Retry-After: ' . max(1, (int) $r['wait']));
    if ($r['throttled']) { json_response(['error' => i18n_t('Patiente {n} s avant de réessayer.', ['n' => max(1, (int) $r['wait'])]), 'wait' => (int) $r['wait'], 'glock' => true], 429); }
    json_response(['error' => GLOCK_ERR, 'wait' => (int) $r['wait'], 'glock' => true], 401);
}

/* ═════════ Ce que voit l'écran ═════════ */

function glock_genealogy_name(): string
{
    $reg = genealogies_registry();
    if (GENEALOGY_ID === '') { return $reg['main_name']; }
    foreach ($reg['list'] as $g) { if ($g['id'] === GENEALOGY_ID) { return $g['name']; } }
    return GENEALOGY_ID;
}

function glock_state_out(array $info): array
{
    $unlocked = glock_is_unlocked($info);
    $t = is_file(glock_tries_path()) ? json_decode((string) @file_get_contents(glock_tries_path()), true) : null;
    $wait = is_array($t) ? max(0, (int) ceil((float) ($t['next'] ?? 0) - glock_nowf())) : 0;
    $out = ['locked' => $info['locked'], 'unlocked' => $unlocked, 'name' => glock_genealogy_name(), 'genealogy' => glock_key(), 'wait' => $wait];
    if ($info['locked'] && $unlocked) { $out['minutes'] = $info['minutes']; $e = glock_session_entry(); $out['idle'] = max(0, glock_now() - (int) ($e['seen'] ?? 0)); }
    if (!$info['locked']) { $out['minutes'] = GLOCK_DEFAULT_MINUTES; }
    $out['zip_aes'] = defined('ZipArchive::EM_AES_256');
    return $out;
}

/** « Mes généalogies » vu depuis l'écran de verrou : le nom, rien d'autre (ni taille, ni dossiers, ni base d'exemple). */
function glock_genealogies_min(): array
{
    $reg = genealogies_registry();
    $list = [['id' => '', 'name' => $reg['main_name'], 'main' => true, 'active' => GENEALOGY_ID === '', 'locked' => glock_genealogy_locked('')]];
    foreach ($reg['list'] as $g) { $list[] = ['id' => $g['id'], 'name' => $g['name'], 'main' => false, 'active' => GENEALOGY_ID === $g['id'], 'locked' => glock_genealogy_locked($g['id'])]; }
    return ['active' => GENEALOGY_ID, 'genealogies' => $list, 'locked_view' => true];
}

/* ═════════ Le garde (api.php, upload.php, telecharger.php) ═════════ */

/** Le refus quand la séance n'est pas déverrouillée : rien de la base, seulement « verrouillée ». */
function glock_locked_response(string $action = ''): never
{
    header('X-LCNDA-Glock: 1');
    if ($action === 'desk_widget_page') { // 🪟 widget sur le bureau (fenêtre sans l'app) : une petite page, rien de la base
        http_response_code(423);
        header('Content-Type: text/html; charset=utf-8'); header('Cache-Control: no-store, private'); header('X-Content-Type-Options: nosniff');
        echo '<!doctype html><meta charset="utf-8"><title>🔐</title><body style="margin:0;display:grid;place-items:center;height:100vh;font:600 15px system-ui,sans-serif;color:#555;background:#fbfbfb">🔐 ' . htmlspecialchars(i18n_t('Cette généalogie est verrouillée : donne son mot de passe pour l’ouvrir.'), ENT_QUOTES, 'UTF-8') . '</body>';
        exit;
    }
    json_response(['error' => 'Cette généalogie est verrouillée : donne son mot de passe pour l’ouvrir.', 'glock' => true, 'locked' => true], 423);
}

/**
 * Appelé tout au début d'api.php (avant le mode consultation, avant toute lecture). Liste blanche quand c'est verrouillé :
 * glock_state, glock_unlock, glock_lock_now, la liste des généalogies (noms seulement), changer de généalogie, la mise à
 * jour de la structure au lancement (schema_status : deux numéros) et la sauvegarde « à la fermeture » demandée par l'app
 * de bureau (secret du processus principal : sauvegarde_auto.php ne copie une généalogie verrouillée que dans son dossier).
 */
function glock_guard(string $action, bool $isWrite, array $payload): void
{
    $info = glock_info();
    if (!$isWrite && $action === 'glock_state') { json_response(glock_state_out($info)); }
    if ($isWrite && in_array($action, ['glock_unlock', 'glock_lock_now', 'glock_touch'], true)) { verify_csrf($payload); }
    if (!$info['locked']) {
        if ($isWrite && in_array($action, ['glock_unlock', 'glock_lock_now', 'glock_touch'], true)) { json_response(['ok' => true, 'locked' => false]); }
        if ($isWrite && in_array($action, ['genealogy_switch', 'genealogy_create', 'premier_example_open', 'premier_example_leave'], true)) { glock_forget_on_switch(); }
        return;
    }
    if ($isWrite && $action === 'glock_unlock') {
        $r = glock_try($info, glock_pw($payload['password'] ?? null), 'open');
        if (!$r['ok']) { glock_refuse($r); }
        glock_mark_unlocked($info);
        glock_heal($info);
        $backup = function_exists('sa_protected_copy') ? sa_protected_copy(glock_pw($payload['password'] ?? null)) : null; // 🗓 copie protégée à l'ouverture
        json_response(['ok' => true, 'unlocked' => true, 'backup' => $backup]);
    }
    if ($isWrite && $action === 'glock_lock_now') {
        $was = glock_is_unlocked($info);
        glock_forget();
        if ($was) { access_log_add(null, 'lock_now', 'genealogy'); }
        header('X-LCNDA-Glock: 1');
        json_response(['ok' => true, 'locked' => true]);
    }
    if (!$isWrite && $action === 'schema_status') { return; }
    if ($action === 'autobackup_close') {
        $secret = (string) getenv('GENEALOGY_LOCAL_SECRET');
        if ($secret !== '' && hash_equals($secret, (string) ($_SERVER['HTTP_X_CARNET_LOCAL'] ?? ''))) { return; }
    }
    $e = glock_session_entry();
    if (glock_is_unlocked($info)) {
        if ($isWrite && $action === 'glock_touch') {
            if (glock_now() - (int) ($e['seen'] ?? 0) >= GLOCK_TOUCH_EVERY) { glock_session_write(static function () use ($info): void { if (isset($_SESSION['glock'][glock_key()])) { $_SESSION['glock'][glock_key()]['seen'] = glock_now(); } }); }
            json_response(['ok' => true]);
        }
        if ($isWrite && in_array($action, ['genealogy_switch', 'genealogy_create', 'premier_example_open', 'premier_example_leave'], true)) { glock_forget_on_switch(); }
        return;
    }
    // la séance avait ouvert cette généalogie : le délai est passé (ou l'app a été relancée) → noté une fois, puis oublié
    if ($e && hash_equals($info['lock_id'], (string) ($e['id'] ?? ''))) {
        glock_forget(false);
        access_log_add(null, 'lock_idle', 'genealogy');
    }
    if (!$isWrite && $action === 'genealogies') { json_response(glock_genealogies_min()); }
    if ($isWrite && $action === 'genealogy_switch') { glock_forget_on_switch(); return; } // jeton vérifié ensuite par api.php
    glock_locked_response($action);
}

/** Changer de généalogie : celle qu'on quitte ne reste pas ouverte dans la séance. */
function glock_forget_on_switch(): void
{
    if (!empty($_SESSION['glock'])) { glock_forget(false); }
}

/** Pour router.php (médias) et index.php : la séance peut-elle lire cette généalogie ? (session lue sans la garder ouverte) */
function glock_request_blocked(): bool
{
    $info = glock_info();
    if (!$info['locked']) { return false; }
    if (session_status() !== PHP_SESSION_ACTIVE && empty($_SESSION)) {
        lcnda_session_config();
        if (isset($_COOKIE[session_name()])) { @session_start(['read_and_close' => true]); }
    }
    return !glock_is_unlocked($info);
}

/* ═════════ Poser, changer, retirer (api.php, après le mode consultation) ═════════ */

function glock_api_post(string $action, array $d): array
{
    $info = glock_info();
    $minutes = array_key_exists('minutes', $d) ? (int) $d['minutes'] : null;
    if ($minutes !== null && !in_array($minutes, GLOCK_MINUTES, true)) { throw new LcndaBadInput('Délai de reverrouillage inconnu.'); }
    $pdo = db();
    if ($action === 'glock_set') {
        if ($info['locked']) { throw new LcndaBadInput('Cette généalogie a déjà un mot de passe : change-le plutôt.'); }
        if (empty($d['ack'])) { throw new LcndaBadInput('Coche la case : sans ce mot de passe, tu ne pourras plus ouvrir cette généalogie dans l’app.'); }
        $pw = glock_pw($d['password'] ?? null); glock_check_new($pw, glock_pw($d['password2'] ?? null));
        $lock = ['hash' => glock_hash($pw), 'lock_id' => bin2hex(random_bytes(16)), 'minutes' => $minutes ?? GLOCK_DEFAULT_MINUTES];
        $pdo->beginTransaction();
        try { glock_write_db($pdo, $lock); $pdo->commit(); } catch (Throwable $e) { $pdo->rollBack(); throw $e; }
        glock_write_marker($lock);
        glock_mark_unlocked($lock + ['locked' => true]);
        @unlink(glock_tries_path());
        access_log_add($pdo, 'lock_set', 'genealogy', null, '', (string) $lock['minutes']);
        $old = defined('ZipArchive::EM_AES_256') ? glock_protect_old_copies($pdo, $pw) : ['protected' => 0, 'left' => []]; // 🔐 les copies en clair d'avant
        return ['ok' => true, 'locked' => true, 'minutes' => $lock['minutes'], 'copies' => $old];
    }
    if (!$info['locked']) { throw new LcndaBadInput('Cette généalogie n’a pas de mot de passe.'); }
    $r = glock_try($info, glock_pw($d['old'] ?? null), $action === 'glock_remove' ? 'remove' : ($action === 'glock_change' ? 'change' : 'minutes'));
    if (!$r['ok']) { glock_refuse($r); }
    if ($action === 'glock_remove') {
        $pdo->beginTransaction();
        try { glock_write_db($pdo, null); $pdo->commit(); } catch (Throwable $e) { $pdo->rollBack(); throw $e; }
        glock_write_marker(null);
        @unlink(glock_tries_path());
        glock_forget(false);
        access_log_add($pdo, 'lock_remove', 'genealogy');
        return ['ok' => true, 'locked' => false];
    }
    $lock = ['hash' => $info['hash'], 'lock_id' => $info['lock_id'], 'minutes' => $minutes ?? $info['minutes']];
    if ($action === 'glock_change') {
        $pw = glock_pw($d['password'] ?? null); glock_check_new($pw, glock_pw($d['password2'] ?? null));
        $lock['hash'] = glock_hash($pw); $lock['lock_id'] = bin2hex(random_bytes(16)); // les autres séances ouvertes sont refermées
    } elseif ($action !== 'glock_minutes') { throw new LcndaBadInput('Demande inconnue.'); }
    $pdo->beginTransaction();
    try { glock_write_db($pdo, $lock); $pdo->commit(); } catch (Throwable $e) { $pdo->rollBack(); throw $e; }
    glock_write_marker($lock);
    glock_mark_unlocked($lock + ['locked' => true]);
    access_log_add($pdo, $action === 'glock_change' ? 'lock_change' : 'lock_minutes', 'genealogy', null, '', (string) $lock['minutes']);
    return ['ok' => true, 'locked' => true, 'minutes' => $lock['minutes']];
}

/**
 * Les copies de la base qui QUITTENT le dossier de la généalogie (téléchargement, dossier choisi, clé, nuage…) d'une
 * généalogie verrouillée : refusées en clair. Les copies de sécurité rangées à côté de la base (DATA_DIR/backups) restent
 * permises : elles sont exactement aussi exposées que la base elle-même.
 */
function glock_refuse_plain_copy(string $why = ''): void
{
    if (!glock_info()['locked']) { return; }
    json_response(['error' => 'Cette généalogie est protégée par un mot de passe : ses sauvegardes le sont aussi. Utilise « Sauvegarde complète protégée » avec le même mot de passe.', 'glock_backup' => true, 'why' => $why], 423);
}

/** Sauvegarde complète d'une généalogie verrouillée : le mot de passe est obligatoire et c'est celui de la généalogie. */
function glock_backup_password(string $pw): void
{
    $info = glock_info();
    if (!$info['locked']) { return; }
    if ($pw === '') { json_response(['error' => 'Cette généalogie est protégée : sa sauvegarde l’est aussi, avec le même mot de passe.', 'glock_backup' => true, 'password_required' => true], 422); }
    $r = glock_try($info, $pw, 'backup');
    if (!$r['ok']) { glock_refuse($r); }
}

/* ═════════ 📜 B8 : Qui a vu quoi ═════════ */

const ACCESS_LOG_KINDS = ['case_open', 'print', 'export', 'letters', 'unlock_ok', 'unlock_fail', 'lock_now', 'lock_idle', 'lock_set', 'lock_change', 'lock_remove', 'lock_minutes', 'purge', 'retention',
    'lan_open', 'lan_close', 'lan_ok', 'lan_refuse', 'lan_remove', 'lan_connect', // 🖧 plusieurs ordinateurs (lib/reseau_local.php)
    'tw_depot', 'tw_refus', 'tw_liste', 'tw_relie']; // 📱 le téléphone par le wifi (lib/telephone_wifi.php)

/** Ce qui est noté quand on télécharge ou copie : l'action de l'API → un code court (le libellé est écrit par la page). */
const ACCESS_LOG_EXPORTS = ['export_csv' => 'csv', 'export_csv_global' => 'csv', 'export_gedcom' => 'gedcom', 'export_plus' => 'plus', 'export_json' => 'json',
    'export_sqlite' => 'sqlite', 'export_full_backup' => 'backup', 'export_research_report' => 'report', 'export_family_book' => 'book', 'sync_export' => 'sync',
    'vault_export' => 'vault', 'vault_download' => 'vault', 'museum_export' => 'museum', 'export_my_list' => 'list', 'export_custom_block_def' => 'block',
    'family_share_export' => 'share', 'website_export' => 'website', 'website_publish' => 'website_publish', 'offsite_copy_now' => 'offsite', 'access_log_csv' => 'access_csv',
    'sources_export' => 'sources']; // ⤓ toutes les sources en RIS / BibTeX (lib/imports_plus.php)

function access_log_schema(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS access_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, kind TEXT NOT NULL, obj_type TEXT NOT NULL DEFAULT '',
        obj_id INTEGER, obj_label TEXT NOT NULL DEFAULT '', what TEXT NOT NULL DEFAULT '', machine TEXT NOT NULL DEFAULT '', device TEXT NOT NULL DEFAULT '')");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_access_log_at ON access_log(at)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_access_log_obj ON access_log(obj_type, obj_id)');
}

/** La colonne « device » existe-t-elle ? (une base pas encore passée à la structure n°99 : on écrit sans elle) */
function access_log_has_device(PDO $pdo): bool
{
    try { return (bool) $pdo->query("SELECT count(*) FROM pragma_table_info('access_log') WHERE name='device'")->fetchColumn(); } catch (Throwable $_) { return false; }
}

function access_log_machine(): string
{
    if (function_exists('sd_machine')) { return sd_machine()['label']; }
    $forced = lcnda_test_env_ok() ? trim((string) getenv('GENEALOGY_MACHINE_NAME')) : '';
    return mb_substr(preg_replace('/\.(local|lan|home)$/i', '', $forced !== '' ? $forced : (string) php_uname('n')) ?: 'Cet ordinateur', 0, 60);
}

/** Un libellé court, sans caractère de contrôle ; jamais plus de 80 caractères. */
function access_log_label(string $s, int $max = 80): string
{
    $s = trim((string) preg_replace('/[\x00-\x1f\x7f]+/u', ' ', $s));
    return mb_substr($s, 0, $max);
}

/**
 * Note une ligne (le serveur seulement). $pdo : la connexion en cours (dans une transaction) ; null : une connexion à part
 * sur la base active (aussi quand elle est verrouillée : essais ratés). Jamais d'erreur visible : le registre ne bloque rien.
 */
function access_log_add(?PDO $pdo, string $kind, string $objType = '', ?int $objId = null, string $label = '', string $what = ''): void
{
    if (!in_array($kind, ACCESS_LOG_KINDS, true)) { return; }
    try {
        $pdo = $pdo ?? glock_raw_pdo();
        if (!$pdo) { return; }
        static $ready = [];
        $k = spl_object_id($pdo);
        if (!isset($ready[$k])) { access_log_schema($pdo); $ready[$k] = access_log_has_device($pdo); }
        $row = [date('Y-m-d H:i:s', glock_now()), $kind, access_log_label($objType, 20), $objId, access_log_label($label), access_log_label($what, 40), access_log_label(access_log_machine(), 60)];
        if ($ready[$k]) { // 🖧 l'appareil réel (vide : l'ordinateur principal) — colonne ajoutée par la migration 99
            $pdo->prepare('INSERT INTO access_log(at, kind, obj_type, obj_id, obj_label, what, machine, device) VALUES(?,?,?,?,?,?,?,?)')->execute([...$row, access_log_label(function_exists('lan_device_name') ? lan_device_name() : '', 40)]);
        } else {
            $pdo->prepare('INSERT INTO access_log(at, kind, obj_type, obj_id, obj_label, what, machine) VALUES(?,?,?,?,?,?,?)')->execute($row);
        }
    } catch (Throwable $e) {
        error_log('LCNDA : registre « Qui a vu quoi » non écrit : ' . get_class($e));
    }
}

/** Libellé court d'un dossier de succession : « 2026-014 · Succession de Paul MAZAUD » (ni adresse, ni montant). */
function access_case_label(PDO $pdo, int $caseId): string
{
    try {
        $s = $pdo->prepare('SELECT number, title FROM succ_cases WHERE id=?'); $s->execute([$caseId]); $r = $s->fetch(PDO::FETCH_ASSOC);
        return $r ? access_log_label(trim((string) $r['number'] . ' · ' . (string) $r['title'], ' ·'), 80) : '';
    } catch (Throwable $_) { return ''; }
}

/** 📂 Dossier ouvert : une fois par séance et par dossier (pas à chaque onglet). */
function access_case_open(PDO $pdo, int $caseId): void
{
    if ($caseId <= 0 || (function_exists('kiosk_state') && !empty(kiosk_state()['on']) && empty(kiosk_state()['guest']))) { return; } // 🖧 un appareil invité : noté (avec son nom)
    $key = glock_key() . ':' . $caseId;
    if (!empty($_SESSION['b8_open'][$key])) { return; }
    glock_session_write(static function () use ($key): void { $_SESSION['b8_open'][$key] = 1; });
    access_log_add($pdo, 'case_open', 'case', $caseId, access_case_label($pdo, $caseId));
}

function access_log_settings(PDO $pdo): array
{
    $v = function_exists('ht_setting') ? ht_setting($pdo, ACCESS_LOG_SETTING, ['months' => 12]) : ['months' => 12];
    $m = (int) ($v['months'] ?? 12);
    return ['months' => in_array($m, ACCESS_LOG_MONTHS, true) ? $m : 12];
}

/** Les lignes plus vieilles que la durée réglée sont effacées (une fois par jour, à l'ouverture de l'app) ; l'effacement est noté.
 *  Le repère « fait aujourd'hui » est un petit fichier (DATA_DIR/cache) : rien n'est écrit dans les réglages de la base à
 *  l'ouverture (l'interface y verrait un réglage changé), et la base n'est touchée que s'il y a des lignes à effacer. */
function access_log_purge(PDO $pdo, bool $force = false): int
{
    try {
        $s = access_log_settings($pdo);
        $today = date('Y-m-d', glock_now());
        $mark = DATA_DIR . '/cache/qui-a-vu-purge.txt';
        if (!$force && is_file($mark) && trim((string) @file_get_contents($mark)) === $today) { return 0; }
        $n = 0;
        if ($s['months'] > 0 && $pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='access_log'")->fetchColumn()) {
            $limit = date('Y-m-d H:i:s', strtotime('-' . $s['months'] . ' months', glock_now()));
            $old = $pdo->prepare('SELECT count(*) FROM access_log WHERE at < ?'); $old->execute([$limit]);
            if ((int) $old->fetchColumn() > 0) { $st = $pdo->prepare('DELETE FROM access_log WHERE at < ?'); $st->execute([$limit]); $n = $st->rowCount(); }
        }
        if (!is_dir(dirname($mark))) { @mkdir(dirname($mark), 0775, true); }
        @file_put_contents($mark, $today);
        if ($n > 0) { access_log_add($pdo, 'purge', '', null, '', (string) $n . '|' . $s['months']); }
        return $n;
    } catch (Throwable $e) { error_log('LCNDA : purge du registre impossible : ' . get_class($e)); return 0; }
}

function access_log_rows(PDO $pdo, array $q): array
{
    access_log_schema($pdo);
    $where = []; $p = [];
    $case = (int) ($q['case_id'] ?? 0);
    if ($case > 0) { $where[] = "obj_type='case' AND obj_id=?"; $p[] = $case; }
    $kind = (string) ($q['kind'] ?? '');
    if ($kind !== '' && in_array($kind, ACCESS_LOG_KINDS, true)) { $where[] = 'kind=?'; $p[] = $kind; }
    $limit = max(1, min(5000, (int) ($q['limit'] ?? 2000)));
    $dev = access_log_has_device($pdo);
    $sql = 'SELECT id, at, kind, obj_type, obj_id, obj_label, what, machine' . ($dev ? ', device' : ", '' AS device") . ' FROM access_log' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY id DESC LIMIT ' . $limit;
    $st = $pdo->prepare($sql); $st->execute($p);
    $rows = array_map(static fn($r) => ['id' => (int) $r['id'], 'at' => (string) $r['at'], 'kind' => (string) $r['kind'], 'obj_type' => (string) $r['obj_type'],
        'obj_id' => $r['obj_id'] === null ? null : (int) $r['obj_id'], 'obj_label' => (string) $r['obj_label'], 'what' => (string) $r['what'], 'machine' => (string) $r['machine'], 'device' => (string) $r['device']], $st->fetchAll(PDO::FETCH_ASSOC));
    return ['rows' => $rows, 'total' => (int) $pdo->query('SELECT count(*) FROM access_log')->fetchColumn(), 'months' => access_log_settings($pdo)['months'], 'kinds' => ACCESS_LOG_KINDS, 'machine' => access_log_machine()];
}

function access_log_csv(PDO $pdo): never
{
    $rows = access_log_rows($pdo, ['limit' => 5000])['rows'];
    $cell = static function (string $v): string { if ($v !== '' && strpbrk($v[0], '=+-@') !== false) { $v = "'" . $v; } return '"' . str_replace('"', '""', $v) . '"'; };
    $out = "\xEF\xBB\xBF" . implode(';', ['Date', 'Sorte', 'Objet', 'Numéro', 'Libellé', 'Détail', 'Poste', 'Appareil']) . "\r\n";
    foreach ($rows as $r) { $out .= implode(';', array_map($cell, [$r['at'], $r['kind'], $r['obj_type'], (string) ($r['obj_id'] ?? ''), $r['obj_label'], $r['what'], $r['machine'], $r['device']])) . "\r\n"; }
    while (ob_get_level() > 0) { ob_end_clean(); }
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="qui-a-vu-quoi-' . date('Ymd') . '.csv"');
    header('Cache-Control: no-store, private');
    header('X-Content-Type-Options: nosniff');
    echo $out;
    exit;
}

/** Lecture, réglage de la durée, export et une note d'une page (le tableau de bord des dossiers exporté en CSV). */
function access_log_dispatch(PDO $pdo, string $action, bool $isWrite, array $d): never
{
    if (function_exists('kiosk_state') && !empty(kiosk_state()['on'])) { json_response(['error' => 'Mode consultation : le registre ne se lit pas.', 'kiosk' => true], 403); }
    try {
        if (!$isWrite && $action === 'access_log') { json_response(access_log_rows($pdo, $_GET)); }
        if (!$isWrite && $action === 'access_log_csv') { access_log_csv($pdo); }
        if ($isWrite && $action === 'access_log_settings') {
            $m = (int) ($d['months'] ?? -1);
            if (!in_array($m, ACCESS_LOG_MONTHS, true)) { throw new LcndaBadInput('Durée inconnue.'); }
            $prev = access_log_settings($pdo)['months'];
            ht_save_setting($pdo, ACCESS_LOG_SETTING, ['months' => $m]);
            if ($m !== $prev) { access_log_add($pdo, 'retention', '', null, '', $prev . '|' . $m); }
            $n = access_log_purge($pdo, true);
            json_response(['ok' => true, 'months' => $m, 'prev' => $prev, 'purged' => $n]);
        }
        if ($isWrite && $action === 'access_note') {
            // seulement des choses connues, avec un nombre : jamais un texte venu de la page
            $what = (string) ($d['what'] ?? '');
            if ($what === 'map_export') { // 🗺️ une carte de Graphiques exportée ou imprimée (vague 2 : heritage-diagram-cartes-plus2.js) : la sorte et le format, connus d'avance
                $kind = (string) ($d['kind'] ?? ''); $fmt = (string) ($d['format'] ?? '');
                if (!in_array($kind, ['trademap', 'mirrormap', 'lifearea', 'linkmap', 'crisismap'], true) || !in_array($fmt, ['png', 'jpg', 'svg', 'print', 'csv', 'json', 'copy'], true)) { throw new LcndaBadInput('Demande inconnue.'); }
                access_log_add($pdo, 'export', '', null, '', 'map_' . $kind . '|' . $fmt);
                json_response(['ok' => true]);
            }
            if ($what !== 'dashboard_csv') { throw new LcndaBadInput('Demande inconnue.'); }
            access_log_add($pdo, 'export', '', null, '', 'dashboard_csv|' . max(0, min(100000, (int) ($d['n'] ?? 0))));
            json_response(['ok' => true]);
        }
    } catch (LcndaBadInput $e) { json_response(['error' => $e->getMessage()], 422); }
    json_response(['error' => 'Action inconnue.'], 400);
}
