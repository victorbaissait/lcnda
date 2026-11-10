<?php
declare(strict_types=1);

/**
 * 🗓 Sauvegarde automatique (Réglages → 🗓 Sauvegarde automatique ; mode d'emploi : docs/UI.md).
 *
 *  - Quand : toutes les N heures, chaque jour, chaque semaine, et/ou à la fermeture de l'app ; la page ouverte demande chaque
 *    minute « c'est l'heure ? » (autobackup_tick, GET sans effet si rien n'est dû) ; l'app de bureau appelle autobackup_close
 *    en quittant (secret du processus principal), le navigateur en fermant l'onglet (POST avec le jeton).
 *  - Où : un dossier choisi (clé USB, iCloud Drive, Dropbox, OneDrive… : un simple dossier), sinon les sauvegardes de la
 *    généalogie (DATA_DIR/backups). Dossier absent (clé débranchée) : un message, jamais un blocage ; on réessaie plus tard.
 *  - Quoi : une copie cohérente de SQLite (VACUUM INTO, jamais le fichier ouvert recopié), vérifiée (PRAGMA integrity_check)
 *    avant d'avoir son vrai nom ; les N dernières gardées (10 par défaut) ; médias en plus si demandé (recopiés une fois,
 *    seulement les nouveaux) ; toutes les généalogies si demandé (chacune dans son sous-dossier, comme la copie hors de l'ordinateur).
 *  - Revenir à une copie : la base actuelle est d'abord gardée (« -avant-restauration »), puis remplacée — avant db().
 *
 * Réglages : SHARED_DATA_DIR/sauvegarde-auto.json (cet ordinateur) ; état : sauvegarde-auto-etat.json.
 */

const SA_KINDS = ['auto', 'fermeture', 'manual'];
const SA_DEFAULTS = ['freq' => 'off', 'every_hours' => 6, 'on_close' => false, 'dir' => '', 'keep' => 10, 'media' => false, 'all' => false];
const SA_INDEX = 'lcnda-sauvegardes.json';

function sa_settings_path(): string { return SHARED_DATA_DIR . '/sauvegarde-auto.json'; }
function sa_state_path(): string { return SHARED_DATA_DIR . '/sauvegarde-auto-etat.json'; }

function sa_read_json(string $f): ?array
{
    if (!is_file($f)) { return null; }
    $j = json_decode((string) @file_get_contents($f), true);
    return is_array($j) ? $j : null;
}

function sa_write_json(string $f, array $data): void
{
    $dir = dirname($f);
    if (!is_dir($dir)) { @mkdir($dir, 0775, true); }
    $tmp = $f . '.' . bin2hex(random_bytes(3)) . '.part';
    if (@file_put_contents($tmp, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) === false || !@rename($tmp, $f)) {
        @unlink($tmp);
        throw new RuntimeException('Impossible d’enregistrer les réglages de la sauvegarde.');
    }
}

/** Réglages lus et remis d'aplomb (valeurs forgées ramenées dans leurs bornes). */
function sa_clean(array $in): array
{
    $s = SA_DEFAULTS;
    $s['freq'] = in_array($in['freq'] ?? '', ['off', 'hours', 'day', 'week'], true) ? $in['freq'] : 'off';
    $s['every_hours'] = max(1, min(168, (int) ($in['every_hours'] ?? 6)));
    $s['on_close'] = !empty($in['on_close']);
    $dir = trim(str_replace('\\', '/', (string) ($in['dir'] ?? '')));
    $s['dir'] = mb_substr(preg_match('/[\x00-\x1f]/', $dir) ? '' : $dir, 0, 500);
    $s['keep'] = max(2, min(100, (int) ($in['keep'] ?? 10)));
    $s['media'] = !empty($in['media']);
    $s['all'] = !empty($in['all']);
    return $s;
}

function sa_settings(): array { return sa_clean(sa_read_json(sa_settings_path()) ?? []); }

function sa_state(): array { return (sa_read_json(sa_state_path()) ?? []) + ['last' => null, 'last_try' => 0, 'sig' => []]; }

function sa_expand(string $dir): string
{
    $dir = trim(str_replace('\\', '/', $dir));
    $home = (string) (getenv('HOME') ?: (getenv('USERPROFILE') ?: ''));
    if ($home !== '' && ($dir === '~' || str_starts_with($dir, '~/'))) { $dir = str_replace('\\', '/', $home) . substr($dir, 1); }
    return rtrim($dir, '/') ?: $dir;
}

function sa_dir_ok(string $dir): bool
{
    return $dir !== '' && !str_contains('/' . $dir . '/', '/../') && (str_starts_with($dir, '/') || (bool) preg_match('#^[A-Za-z]:/#', $dir));
}

/** Généalogies à sauvegarder : celle qui est ouverte, ou toutes (sauf la base d'exemple). */
function sa_targets(bool $all): array
{
    $reg = genealogies_registry();
    $make = static function (string $id, string $name): ?array {
        $data = $id === '' ? SHARED_DATA_DIR : genealogy_dir($id);
        $key = is_file($data . '/active_database.txt') ? trim((string) @file_get_contents($data . '/active_database.txt')) : '';
        $rel = preg_match('#^data/(bases/)?[A-Za-z0-9._ -]+\.(sqlite|db)$#i', $key) ? substr($key, 5) : 'genealogy.sqlite';
        $db = $id === GENEALOGY_ID ? DB_PATH : $data . '/' . $rel;
        if (!is_file($db)) { return null; }
        return ['id' => $id, 'name' => $name, 'db' => $db, 'data' => $data, 'media' => $id === '' ? SHARED_MEDIA_DIR : genealogy_dir($id) . '/media'];
    };
    $names = ['' => $reg['main_name']];
    foreach ($reg['list'] as $g) { if (empty($g['example'])) { $names[$g['id']] = $g['name']; } }
    $out = [];
    foreach ($names as $id => $name) {
        if (!$all && $id !== GENEALOGY_ID) { continue; }
        $t = $make((string) $id, (string) $name);
        if ($t) { $out[] = $t; }
    }
    return $out;
}

/** Dossier des copies d'une généalogie ; '' + raison si le dossier choisi n'est pas là. */
function sa_folder(array $s, string $gid, string $dataDir): string
{
    $dir = sa_expand($s['dir']);
    if ($dir === '') { return $dataDir . '/backups'; }
    return $gid === '' ? $dir : $dir . '/genealogie-' . $gid;
}

/** Le dossier choisi est-il là ? (une seule marche créée : jamais un dossier « clé » fantôme sur le disque interne) */
function sa_check_dir(array $s, bool $create): array
{
    $dir = sa_expand($s['dir']);
    if ($dir === '') { return ['ok' => true, 'custom' => false, 'dir' => DATA_DIR . '/backups']; }
    if (!sa_dir_ok($dir)) { return ['ok' => false, 'custom' => true, 'dir' => $dir, 'error' => 'Écris le chemin complet du dossier (par exemple /Volumes/MaCle/LCNDA ou ~/Dropbox/LCNDA).']; }
    if (!is_dir($dir)) {
        if ($create && is_dir(dirname($dir)) && is_writable(dirname($dir)) && @mkdir($dir, 0775)) { return ['ok' => true, 'custom' => true, 'dir' => $dir]; }
        return ['ok' => false, 'custom' => true, 'missing' => true, 'dir' => $dir, 'error' => i18n_t('Dossier introuvable : {dir} (clé ou disque débranché ?). La sauvegarde se fera dès qu’il sera de retour.', ['dir' => $dir])];
    }
    if (!is_writable($dir)) { return ['ok' => false, 'custom' => true, 'dir' => $dir, 'error' => 'Ce dossier ne peut pas être modifié : ' . $dir]; }
    return ['ok' => true, 'custom' => true, 'dir' => $dir];
}

/** Signature de la base (taille et date du fichier et du journal) : rien n'a changé = pas de nouvelle copie automatique. */
function sa_sig(string $db): string
{
    clearstatcache();
    $p = [];
    foreach (['', '-wal'] as $x) { $p[] = is_file($db . $x) ? ((int) @filesize($db . $x) . ':' . (int) @filemtime($db . $x)) : '-'; }
    return implode('|', $p);
}

function sa_index_read(string $folder): array { return sa_read_json($folder . '/' . SA_INDEX) ?? []; }

/** Copies d'un dossier (les plus récentes d'abord), avec le résultat du contrôle d'intégrité. */
function sa_copies(string $folder): array
{
    if (!is_dir($folder)) { return []; }
    $idx = sa_index_read($folder);
    $out = [];
    foreach (glob($folder . '/genealogie-backup-*.db') ?: [] as $f) {
        $n = basename($f);
        $kind = preg_match('/-(auto|fermeture|manual)\.db$/', $n, $m) ? $m[1] : (str_contains($n, '-migration-') ? 'migration' : (str_contains($n, '-avant-') ? 'avant' : 'autre'));
        $out[] = ['name' => $n, 'size' => (int) @filesize($f), 'time' => date('c', (int) @filemtime($f)), 'mtime' => (int) @filemtime($f), 'kind' => $kind,
            'integrity' => (string) ($idx[$n]['integrity'] ?? ''), 'persons' => isset($idx[$n]['persons']) ? (int) $idx[$n]['persons'] : null];
    }
    usort($out, static fn($a, $b) => $b['mtime'] <=> $a['mtime'] ?: strcmp($b['name'], $a['name']));
    return $out;
}

/** Contrôle d'une copie : PRAGMA integrity_check et nombre de personnes. */
function sa_verify(string $file): array
{
    try {
        $c = new PDO('sqlite:' . $file, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $c->exec('PRAGMA busy_timeout = 5000');
        $rows = $c->query('PRAGMA integrity_check')->fetchAll(PDO::FETCH_COLUMN);
        $ok = count($rows) === 1 && $rows[0] === 'ok';
        $persons = $ok ? (int) $c->query('SELECT count(*) FROM persons')->fetchColumn() : null;
        $c = null;
        return ['ok' => $ok, 'integrity' => $ok ? 'ok' : mb_substr(implode(' ; ', $rows), 0, 200), 'persons' => $persons];
    } catch (Throwable $e) {
        return ['ok' => false, 'integrity' => 'illisible : ' . mb_substr($e->getMessage(), 0, 150), 'persons' => null];
    }
}

/** Médias recopiés à côté des copies (une fois : seulement les nouveaux ou les changés). */
function sa_mirror_media(string $from, string $to): int
{
    if (!is_dir($from)) { return 0; }
    $n = 0;
    $base = rtrim(str_replace('\\', '/', $from), '/') . '/';
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($from, FilesystemIterator::SKIP_DOTS));
    foreach ($it as $info) {
        if (!$info->isFile()) { continue; }
        $rel = substr(str_replace('\\', '/', $info->getPathname()), strlen($base));
        if ($rel === '' || preg_match('#(^|/)\.#', $rel) || str_ends_with($rel, '.part')) { continue; }
        $dest = $to . '/' . $rel;
        if (is_file($dest) && (int) filesize($dest) === $info->getSize() && (int) filemtime($dest) >= $info->getMTime()) { continue; }
        if (!is_dir(dirname($dest)) && !@mkdir(dirname($dest), 0775, true)) { continue; }
        $part = $dest . '.' . bin2hex(random_bytes(3)) . '.part';
        if (@copy($info->getPathname(), $part) && @rename($part, $dest)) { @touch($dest, $info->getMTime()); $n++; } else { @unlink($part); }
    }
    return $n;
}

/** Une copie d'une généalogie dans son dossier ; rotation à N. */
function sa_copy_one(array $t, string $folder, string $kind, int $keep, bool $media): array
{
    if (!is_dir($folder) && !@mkdir($folder, 0775, true) && !is_dir($folder)) { throw new RuntimeException('impossible de créer ' . $folder); }
    $name = 'genealogie-backup-' . date('Ymd-His') . '-' . bin2hex(random_bytes(2)) . '-' . $kind . '.db';
    $part = $folder . '/.' . $name . '.part';
    $src = new PDO('sqlite:' . $t['db'], null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $src->exec('PRAGMA busy_timeout = 30000');
    try { $src->exec('PRAGMA wal_checkpoint(PASSIVE)'); } catch (Throwable $_) {}
    // VACUUM INTO : une photo cohérente de la base (même pendant une écriture), jamais le fichier ouvert recopié tel quel
    $src->exec('VACUUM main INTO ' . $src->quote($part));
    $src = null;
    $check = sa_verify($part);
    if (!$check['ok']) { @unlink($part); throw new RuntimeException('la copie n’a pas passé le contrôle d’intégrité (' . $check['integrity'] . ')'); }
    if (!@rename($part, $folder . '/' . $name)) { @unlink($part); throw new RuntimeException('impossible de nommer la copie'); }
    $idx = sa_index_read($folder);
    $idx[$name] = ['integrity' => 'ok', 'checked_at' => date('c'), 'persons' => $check['persons'], 'genealogy' => $t['name'], 'kind' => $kind];
    $deleted = [];
    $ours = array_values(array_filter(sa_copies($folder), static fn($c) => in_array($c['kind'], SA_KINDS, true)));
    foreach (array_slice($ours, $keep) as $old) {
        if (@unlink($folder . '/' . $old['name'])) { $deleted[] = $old['name']; unset($idx[$old['name']]); }
    }
    foreach (array_keys($idx) as $n) { if (!is_file($folder . '/' . $n)) { unset($idx[$n]); } }
    try { sa_write_json($folder . '/' . SA_INDEX, $idx); } catch (Throwable $_) {}
    $copied = $media ? sa_mirror_media($t['media'], $folder . '/media') : 0;
    return ['genealogy' => $t['name'], 'id' => $t['id'], 'file' => $name, 'size' => (int) @filesize($folder . '/' . $name), 'persons' => $check['persons'], 'integrity' => 'ok', 'deleted' => $deleted, 'media_copied' => $copied];
}

/**
 * Lance une sauvegarde (kind : auto, fermeture, manual). Une seule à la fois (verrou de fichier).
 * $force : même si la base n'a pas changé depuis la dernière copie.
 */
function sa_run(string $kind, bool $force = false): array
{
    @set_time_limit(0);
    $kind = in_array($kind, SA_KINDS, true) ? $kind : 'manual';
    $s = sa_settings();
    $lockFile = SHARED_DATA_DIR . '/sauvegarde-auto.lock';
    $lock = @fopen($lockFile, 'c');
    if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) { return ['ok' => false, 'busy' => true, 'error' => 'Une sauvegarde est déjà en cours.']; }
    try {
        $state = sa_state();
        $state['last_try'] = time();
        $dir = sa_check_dir($s, true);
        if (!$dir['ok']) {
            $state['missing'] = !empty($dir['missing']) ? ['dir' => $dir['dir'], 'since' => (int) ($state['missing']['since'] ?? time())] : null;
            $state['last_error'] = ['time' => time(), 'error' => $dir['error'], 'kind' => $kind];
            sa_write_json(sa_state_path(), $state);
            return ['ok' => false, 'missing' => !empty($dir['missing']), 'error' => $dir['error'], 'dir' => $dir['dir']];
        }
        $state['missing'] = null;
        $done = []; $errors = []; $skipped = [];
        foreach (sa_targets($s['all']) as $t) {
            $sig = sa_sig($t['db']);
            $key = $t['id'] === '' ? 'main' : $t['id'];
            if (!$force && $kind !== 'manual' && ($state['sig'][$key] ?? '') === $sig) { $skipped[] = $t['name']; continue; }
            try {
                $done[] = sa_copy_one($t, sa_folder($s, $t['id'], $t['data']), $kind, $s['keep'], $s['media']);
                $state['sig'][$key] = $sig;
            } catch (Throwable $e) {
                $errors[] = $t['name'] . ' : ' . $e->getMessage();
            }
        }
        if ($done || $skipped) {
            $state['last'] = ['time' => time(), 'kind' => $kind, 'ok' => !$errors, 'files' => $done, 'skipped' => $skipped, 'dir' => $dir['dir'], 'errors' => $errors];
            $state['last_ok_time'] = time();
        }
        $state['last_error'] = $errors ? ['time' => time(), 'error' => implode(' ; ', $errors), 'kind' => $kind] : null;
        sa_write_json(sa_state_path(), $state);
        return ['ok' => !$errors, 'files' => $done, 'skipped' => $skipped, 'errors' => $errors, 'error' => $errors ? implode(' ; ', $errors) : null, 'dir' => $dir['dir']];
    } finally {
        flock($lock, LOCK_UN); fclose($lock);
    }
}

/** C'est l'heure ? (toutes les N heures, une fois par jour, une fois par semaine) */
function sa_due(array $s, array $state, int $now): bool
{
    $last = (int) ($state['last_ok_time'] ?? 0);
    return match ($s['freq']) {
        'hours' => $now - $last >= $s['every_hours'] * 3600,
        'day' => date('Y-m-d', $last) !== date('Y-m-d', $now),
        'week' => $now - $last >= 7 * 86400,
        default => false,
    };
}

function sa_tick(): array
{
    $s = sa_settings();
    $state = sa_state();
    $now = time();
    if (!sa_due($s, $state, $now)) { return ['ran' => false, 'due' => false]; }
    // dossier absent : on réessaie au plus toutes les 10 minutes (pas de travail inutile chaque minute)
    if (!empty($state['missing']) && $now - (int) ($state['last_try'] ?? 0) < 600) { return ['ran' => false, 'due' => true, 'missing' => true, 'error' => (string) ($state['last_error']['error'] ?? '')]; }
    return ['ran' => true] + sa_run('auto');
}

/** À la fermeture de l'app : une copie si la base a changé depuis la dernière (et pas plus d'une toutes les 2 minutes). */
function sa_close(): array
{
    $s = sa_settings();
    if (!$s['on_close']) { return ['ran' => false]; }
    $state = sa_state();
    if (time() - (int) ($state['last_ok_time'] ?? 0) < 120) { return ['ran' => false, 'recent' => true]; }
    return ['ran' => true] + sa_run('fermeture');
}

function sa_status(): array
{
    $s = sa_settings();
    $state = sa_state();
    $dir = sa_check_dir($s, false);
    $folder = $dir['ok'] ? sa_folder($s, GENEALOGY_ID, DATA_DIR) : '';
    $exp = sa_expand($s['dir']);
    $last = $state['last'] ?? null;
    return ['settings' => $s, 'fresh' => !is_file(sa_settings_path()), 'last' => $last, 'last_ok_time' => isset($state['last_ok_time']) ? date('c', (int) $state['last_ok_time']) : null,
        'last_error' => $state['last_error'] ?? null, 'missing' => !$dir['ok'] && !empty($dir['missing']), 'dir_error' => $dir['ok'] ? null : $dir['error'],
        'folder' => $folder ?: $dir['dir'], 'custom' => $dir['custom'], 'cloud' => $exp !== '' && function_exists('offsite_is_cloud') && offsite_is_cloud($exp),
        'same_disk' => $dir['ok'] && $dir['custom'] && function_exists('offsite_same_disk') && offsite_same_disk($dir['dir']) && !(function_exists('offsite_is_cloud') && offsite_is_cloud($exp)),
        'copies' => $folder !== '' ? array_slice(sa_copies($folder), 0, 60) : [], 'genealogies' => count(sa_targets(true)),
        'next' => sa_next($s, $state), 'suggestions' => function_exists('offsite_suggestions') ? offsite_suggestions() : []];
}

/** Prochaine sauvegarde prévue (pour la phrase « Prochaine : … »). */
function sa_next(array $s, array $state): ?string
{
    $last = (int) ($state['last_ok_time'] ?? 0);
    if ($s['freq'] === 'off') { return null; }
    if (!$last) { return date('c'); }
    $t = match ($s['freq']) { 'hours' => $last + $s['every_hours'] * 3600, 'day' => strtotime('tomorrow', $last), 'week' => $last + 7 * 86400, default => 0 };
    return date('c', max(time(), (int) $t));
}

/**
 * Revenir à une copie (avant db() : aucune connexion n'est ouverte sur la base remplacée). La base actuelle est d'abord
 * gardée dans les sauvegardes (« -avant-restauration », jamais effacée par la rotation).
 */
function sa_restore(array $data): never
{
    @set_time_limit(0);
    $name = basename(trim((string) ($data['name'] ?? '')));
    if (!preg_match('/^genealogie-backup-[A-Za-z0-9._-]+\.db$/', $name)) { json_response(['error' => 'Copie introuvable.'], 422); }
    $s = sa_settings();
    $dir = sa_check_dir($s, false);
    $folders = array_unique(array_filter([$dir['ok'] ? sa_folder($s, GENEALOGY_ID, DATA_DIR) : '', DATA_DIR . '/backups']));
    $file = '';
    foreach ($folders as $f) { if (is_file($f . '/' . $name)) { $file = $f . '/' . $name; break; } }
    if ($file === '') { json_response(['error' => $dir['ok'] ? 'Copie introuvable.' : $dir['error']], 422); }
    $incoming = dirname(DB_PATH) . '/.restauration-' . bin2hex(random_bytes(6)) . '.sqlite';
    try {
        if (!@copy($file, $incoming)) { throw new RuntimeException('Impossible de lire la copie.'); }
        $check = sa_verify($incoming);
        if (!$check['ok']) { throw new RuntimeException('Cette copie est abîmée (contrôle d’intégrité : ' . $check['integrity'] . ') : choisis-en une autre.'); }
        validate_restore_database($incoming); // tables de l'app, version, déclencheurs retirés
        // la base actuelle d'abord, en lieu sûr
        $safeDir = DATA_DIR . '/backups';
        if (!is_dir($safeDir) && !@mkdir($safeDir, 0775, true)) { throw new RuntimeException('Impossible de créer le dossier des sauvegardes.'); }
        $safety = 'genealogie-backup-' . date('Ymd-His') . '-' . bin2hex(random_bytes(2)) . '-avant-restauration.db';
        if (is_file(DB_PATH)) {
            $cur = new PDO('sqlite:' . DB_PATH, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
            $cur->exec('PRAGMA busy_timeout = 30000');
            $cur->exec('VACUUM main INTO ' . $cur->quote($safeDir . '/' . $safety));
            $cur = null;
        }
        foreach ([DB_PATH . '-wal', DB_PATH . '-shm', DB_PATH . '-journal', DB_PATH] as $old) {
            if (is_file($old) && !@unlink($old)) { throw new RuntimeException('Impossible de remplacer la base (est-elle ouverte ailleurs ?).'); }
        }
        if (!@rename($incoming, DB_PATH)) { throw new RuntimeException('Impossible de mettre la copie en place.'); }
    } catch (Throwable $e) {
        if (is_file($incoming)) { @unlink($incoming); }
        json_response(['error' => $e->getMessage()], 422);
    }
    $pdo = db(); // mode WAL remis, structure mise à jour si la copie est plus ancienne
    log_change($pdo, 'meta', 0, 'update', '🗓 Base remise comme dans la copie « ' . $name . ' » (la base d’avant est gardée : ' . $safety . ')');
    json_response(['ok' => true, 'restored' => $name, 'safety' => $safety, 'persons' => $check['persons']]);
}

/** Actions de la sauvegarde automatique, avant db() (la base peut être remplacée, ou fermée). */
function sa_early(string $action, bool $isWrite, array $payload): void
{
    if (!in_array($action, ['autobackup_status', 'autobackup_tick', 'autobackup_now', 'autobackup_settings', 'autobackup_close', 'autobackup_restore', 'autobackup_check'], true)) { return; }
    // l'app de bureau en quittant : seul le processus principal connaît ce secret (pas de jeton de session)
    if ($action === 'autobackup_close') {
        $secret = (string) getenv('GENEALOGY_LOCAL_SECRET');
        $given = (string) ($_SERVER['HTTP_X_CARNET_LOCAL'] ?? '');
        $local = $secret !== '' && hash_equals($secret, $given);
        if (!$local && !$isWrite) { json_response(['error' => 'Refusé.'], 403); } // POST : jeton déjà vérifié par api.php
        ignore_user_abort(true);
        $r = sa_close();
        // l'app de bureau se ferme : le verrou d'ouverture de la base est rendu (🔄 deux ordinateurs, lib/sync_dossier.php)
        if ($local && function_exists('sd_lock_read') && is_file(DB_PATH)) { $l = sd_lock_read(); if ($l && $l['key'] === sd_machine()['key']) { @unlink(sd_lock_path()); } }
        json_response($r);
    }
    if (!$isWrite) {
        if ($action === 'autobackup_status') { json_response(sa_status()); }
        if ($action === 'autobackup_tick') { json_response(sa_tick()); }
        if ($action === 'autobackup_check') {
            $s = sa_clean(['dir' => (string) ($_GET['dir'] ?? '')] + sa_settings());
            $d = sa_check_dir($s, false);
            $exp = sa_expand($s['dir']);
            json_response($d + ['cloud' => $exp !== '' && function_exists('offsite_is_cloud') && offsite_is_cloud($exp)]);
        }
        json_response(['error' => 'Action inconnue.'], 400);
    }
    if ($action === 'autobackup_settings') {
        $s = sa_clean(array_merge(sa_settings(), array_intersect_key($payload, SA_DEFAULTS)));
        sa_write_json(sa_settings_path(), $s);
        json_response(['ok' => true] + sa_status());
    }
    if ($action === 'autobackup_now') {
        json_response(sa_run('manual', true) + ['status' => sa_status()]);
    }
    if ($action === 'autobackup_restore') { sa_restore($payload); }
}
