<?php
declare(strict_types=1);

/**
 * 🔄 Deux ordinateurs : la même généalogie sur deux ordinateurs, par un dossier partagé (clé USB, iCloud Drive, Dropbox,
 * OneDrive… : un simple dossier, l'app n'utilise aucun service en ligne). Mode d'emploi : docs/UI.md (« 🔄 Deux ordinateurs »).
 *
 *  - Chaque ordinateur garde SA base (jamais le même fichier .sqlite ouvert des deux côtés) et écrit dans le dossier des
 *    « paquets de modifications » — les mêmes que 🤝 Travail à deux (lib/heritage_tools.php : sync_diff, sync_items,
 *    sync_apply_core) : identifiants communs (uid), état de départ commun (sync_snapshot), conflits = « tu as aussi modifié ».
 *  - « 🔄 Synchroniser » (ou à l'ouverture) : lit les paquets de l'autre ordinateur, applique ce qui ne pose pas de question,
 *    garde les conflits pour les montrer côte à côte (garder l'un, l'autre, ou les deux pour une note), puis écrit son paquet.
 *    « ↶ Annuler » remet tout comme avant la fusion ; les paquets annulés sont mis de côté (« Revoir » = la revue manuelle).
 *  - 🔒 Verrou : un fichier à côté de la base dit quel ordinateur l'a ouverte ; un autre ordinateur reçoit un message clair
 *    au lieu d'écrire dans le même fichier (base rangée par erreur dans un dossier synchronisé).
 *
 * Disposition du dossier : <dossier>/LCNDA-deux-ordinateurs/<base_uid>/{paquets/, medias/, ordinateurs/, depart.db, depart.json}
 */

const SD_ROOT = 'LCNDA-deux-ordinateurs';
const SD_LOCK_STALE = 300;      // un ordinateur qui ne donne plus signe de vie depuis 5 min ne bloque plus
const SD_LOCK_BEAT = 60;        // le verrou est rafraîchi au plus une fois par minute
const SD_MAX_PACKAGE = 52428800; // 50 Mo au plus par paquet lu
const SD_MAX_MEDIA = 524288000;  // un fichier de média de plus de 500 Mo n'est pas recopié dans le dossier

/* ─── Structure (migration 80) ───────────────────────────────────────── */

function sd_schema(PDO $pdo): void
{
    $have = static fn(string $t) => (bool) $pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name=" . $pdo->quote($t))->fetchColumn();
    $added = [];
    foreach (['sources', 'media', 'media_links', 'source_links'] as $t) {
        if (!$have($t)) { continue; }
        if (!$pdo->query("SELECT 1 FROM pragma_table_info('{$t}') WHERE name='uid'")->fetchColumn()) { $pdo->exec("ALTER TABLE {$t} ADD COLUMN uid TEXT"); $added[] = $t; }
        $pdo->exec("CREATE INDEX IF NOT EXISTS idx_{$t}_uid ON {$t}(uid)");
    }
    $pdo->exec("CREATE TABLE IF NOT EXISTS sync_conflicts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        merge_id INTEGER,
        package_uid TEXT NOT NULL DEFAULT '',
        author TEXT NOT NULL DEFAULT '',
        machine_label TEXT NOT NULL DEFAULT '',
        tbl TEXT NOT NULL,
        uid TEXT NOT NULL,
        op TEXT NOT NULL,
        label TEXT NOT NULL DEFAULT '',
        mine_json TEXT,
        theirs_json TEXT,
        before_json TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        resolution TEXT NOT NULL DEFAULT '',
        undo_json TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        resolved_at TEXT
    )");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_sync_conflicts_open ON sync_conflicts(status, tbl, uid)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS sync_merges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        summary TEXT NOT NULL DEFAULT '',
        applied INTEGER NOT NULL DEFAULT 0,
        undo_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        undone_at TEXT
    )");
    // Travail à deux déjà commencé avant cette version : les lignes déjà là reçoivent le même identifiant sur les deux copies
    // (calculé d'après la base de départ et le numéro), et entrent dans l'état de départ commun (pas renvoyées comme « nouvelles »).
    $raw = $have('app_settings') ? $pdo->query("SELECT value FROM app_settings WHERE key='lcnda-sync'")->fetchColumn() : false;
    $s = $raw ? json_decode((string) $raw, true) : null;
    $base = is_array($s) ? (string) ($s['base_uid'] ?? '') : '';
    if ($base !== '' && $added && $have('sync_snapshot')) {
        $up = [];
        foreach ($added as $t) {
            $st = $pdo->prepare("UPDATE {$t} SET uid=? WHERE id=?");
            foreach ($pdo->query("SELECT id FROM {$t} WHERE uid IS NULL OR uid=''")->fetchAll(PDO::FETCH_COLUMN) as $id) {
                $uid = substr(sha1($base . '|' . $t . '|' . $id), 0, 20);
                $st->execute([$uid, (int) $id]);
                $up[] = [$t, $uid];
            }
        }
        if ($up && function_exists('sync_take_snapshot')) { sync_take_snapshot($pdo, $up); }
    }
}

/* ─── Cet ordinateur ─────────────────────────────────────────────────── */

/** Nom et clé de cet ordinateur (GENEALOGY_MACHINE_NAME pour les essais : deux « ordinateurs » sur la même machine). */
function sd_machine(): array
{
    $forced = trim((string) getenv('GENEALOGY_MACHINE_NAME'));
    $label = $forced !== '' ? $forced : (string) php_uname('n');
    $home = (string) (getenv('HOME') ?: (getenv('USERPROFILE') ?: ''));
    $label = mb_substr(preg_replace('/\.(local|lan|home)$/i', '', $label) ?: 'Cet ordinateur', 0, 60);
    return ['key' => substr(sha1($forced !== '' ? 'forced|' . $forced : $label . '|' . $home), 0, 16), 'label' => $label];
}

/* ─── 🔒 Verrou : un seul ordinateur à la fois sur un même fichier de base ───────────── */

function sd_lock_path(): string { return DB_PATH . '.ouvert.json'; }

function sd_lock_read(): ?array
{
    $f = sd_lock_path();
    if (!is_file($f)) { return null; }
    $j = json_decode((string) @file_get_contents($f), true);
    return is_array($j) && isset($j['key']) ? $j : null;
}

function sd_lock_write(): void
{
    $m = sd_machine();
    $cur = sd_lock_read();
    $data = ['key' => $m['key'], 'label' => $m['label'], 'since' => ($cur && $cur['key'] === $m['key']) ? (int) ($cur['since'] ?? time()) : time(), 'beat' => time()];
    $tmp = sd_lock_path() . '.' . bin2hex(random_bytes(3)) . '.part';
    if (@file_put_contents($tmp, json_encode($data, JSON_UNESCAPED_UNICODE)) !== false) { @rename($tmp, sd_lock_path()); } else { @unlink($tmp); }
}

/** Un autre ordinateur a la base ouverte (et donne signe de vie) : sa fiche, sinon null. */
function sd_lock_other(): ?array
{
    $l = sd_lock_read();
    if (!$l || $l['key'] === sd_machine()['key']) { return null; }
    if (time() - (int) ($l['beat'] ?? 0) > SD_LOCK_STALE) { return null; }
    return $l;
}

/** Appelé avant toute ouverture de la base (api.php) : refuse si un autre ordinateur l'a ouverte, sinon rafraîchit le verrou. */
function sd_lock_guard(string $action, bool $isWrite): void
{
    if (!is_file(DB_PATH)) { return; }
    if ($action === 'open_lock_take' && $isWrite) { sd_lock_write(); json_response(['ok' => true, 'lock' => sd_lock_read()]); }
    if ($action === 'open_lock_release' && $isWrite) {
        $l = sd_lock_read();
        if ($l && $l['key'] === sd_machine()['key']) { @unlink(sd_lock_path()); }
        json_response(['ok' => true]);
    }
    $other = sd_lock_other();
    if ($other) {
        if (in_array($action, ['kiosk_state', 'genealogies'], true)) { return; }
        json_response(['error' => i18n_t('Cette généalogie est déjà ouverte sur l’ordinateur « {name} ». Ferme-la là-bas d’abord : deux ordinateurs qui écrivent dans le même fichier peuvent l’abîmer.', ['name' => $other['label']]),
            'open_lock' => ['label' => (string) $other['label'], 'since' => date('c', (int) ($other['since'] ?? time())), 'beat' => date('c', (int) ($other['beat'] ?? time()))]], 423);
    }
    $l = sd_lock_read();
    if (!$l || $l['key'] !== sd_machine()['key'] || time() - (int) ($l['beat'] ?? 0) >= SD_LOCK_BEAT) { sd_lock_write(); }
    if ($action === 'open_lock_status') { json_response(['ok' => true, 'machine' => sd_machine()['label'], 'lock' => sd_lock_read()]); }
}

/* ─── Réglages et dossier ────────────────────────────────────────────── */

function sd_expand(string $dir): string
{
    $dir = trim(str_replace('\\', '/', $dir));
    $home = (string) (getenv('HOME') ?: (getenv('USERPROFILE') ?: ''));
    if ($home !== '' && ($dir === '~' || str_starts_with($dir, '~/'))) { $dir = str_replace('\\', '/', $home) . substr($dir, 1); }
    return rtrim($dir, '/') ?: $dir;
}

function sd_path_ok(string $dir): bool
{
    return $dir !== '' && !preg_match('/[\x00-\x1f]/', $dir) && !str_contains('/' . $dir . '/', '/../') && (str_starts_with($dir, '/') || (bool) preg_match('#^[A-Za-z]:/#', $dir));
}

/** Dossier choisi sur CET ordinateur (le chemin de Dropbox n'est pas le même sur les deux). */
function sd_folder(PDO $pdo): string
{
    $s = sync_settings($pdo);
    return (string) (($s['folders'] ?? [])[sd_machine()['key']] ?? '');
}

function sd_root(PDO $pdo): string
{
    $folder = sd_folder($pdo);
    $base = (string) sync_settings($pdo)['base_uid'];
    return ($folder === '' || $base === '' || !preg_match('/^[a-f0-9]{8,40}$/', $base)) ? '' : $folder . '/' . SD_ROOT . '/' . $base;
}

function sd_held(PDO $pdo): array
{
    $h = sync_settings($pdo)['held'] ?? [];
    return is_array($h) ? array_values(array_filter($h, 'is_string')) : [];
}

function sd_set(PDO $pdo, array $changes): array
{
    $s = sync_settings($pdo);
    foreach ($changes as $k => $v) { $s[$k] = $v; }
    ht_save_setting($pdo, 'lcnda-sync', $s);
    return $s;
}

/** Paquets du dossier écrits par un autre ordinateur : [['file', 'package', ...]] (non lus en entier s'ils sont trop gros). */
function sd_folder_packages(PDO $pdo, bool $onlyNew = true): array
{
    $root = sd_root($pdo);
    if ($root === '' || !is_dir($root . '/paquets')) { return []; }
    $me = sd_machine()['key'];
    $received = array_flip($pdo->query("SELECT package_uid FROM sync_packages WHERE direction='received'")->fetchAll(PDO::FETCH_COLUMN));
    $held = array_flip(sd_held($pdo));
    $out = [];
    foreach (glob($root . '/paquets/*.lcnda-changes.json') ?: [] as $file) {
        if ((int) @filesize($file) > SD_MAX_PACKAGE) { continue; }
        $pkg = json_decode((string) @file_get_contents($file), true);
        if (!is_array($pkg) || ($pkg['machine'] ?? '') === $me || !is_string($pkg['package_uid'] ?? null)) { continue; }
        $uid = $pkg['package_uid'];
        $state = isset($received[$uid]) ? 'received' : (isset($held[$uid]) ? 'held' : 'new');
        if ($onlyNew && $state !== 'new') { continue; }
        $out[] = ['file' => $file, 'package' => $pkg, 'state' => $state];
    }
    usort($out, static fn($a, $b) => [(string) ($a['package']['created_at'] ?? ''), basename($a['file'])] <=> [(string) ($b['package']['created_at'] ?? ''), basename($b['file'])]);
    return $out;
}

function sd_conflicts(PDO $pdo, string $status = 'open'): array
{
    $st = $pdo->prepare('SELECT * FROM sync_conflicts WHERE status=? ORDER BY id');
    $st->execute([$status]);
    $out = [];
    foreach ($st->fetchAll() as $c) {
        $mine = json_decode((string) $c['mine_json'], true); $theirs = json_decode((string) $c['theirs_json'], true);
        $fields = [];
        foreach (array_unique(array_merge(array_keys(is_array($mine) ? $mine : []), array_keys(is_array($theirs) ? $theirs : []))) as $k) {
            $a = is_array($mine) ? ($mine[$k] ?? null) : null; $b = is_array($theirs) ? ($theirs[$k] ?? null) : null;
            if (json_encode($a) === json_encode($b)) { continue; }
            $fields[] = ['field' => $k, 'mine' => is_array($a) ? ($a['label'] ?? '') : $a, 'theirs' => is_array($b) ? ($b['label'] ?? '') : $b];
        }
        $out[] = ['id' => (int) $c['id'], 'tbl' => $c['tbl'], 'uid' => $c['uid'], 'op' => $c['op'], 'label' => $c['label'], 'author' => $c['author'], 'machine_label' => $c['machine_label'],
            'created_at' => $c['created_at'], 'mine_exists' => is_array($mine), 'theirs_exists' => is_array($theirs), 'fields' => array_slice($fields, 0, 40),
            'can_both' => $c['tbl'] === 'notes' && is_array($mine) && is_array($theirs)];
    }
    return $out;
}

function sd_status(PDO $pdo): array
{
    $s = sync_settings($pdo);
    $m = sd_machine();
    $folder = sd_folder($pdo);
    $root = sd_root($pdo);
    $reachable = $root !== '' && is_dir($root);
    $others = [];
    if ($reachable) {
        foreach (glob($root . '/ordinateurs/*.json') ?: [] as $f) {
            $o = json_decode((string) @file_get_contents($f), true);
            if (is_array($o) && ($o['key'] ?? '') !== $m['key']) { $others[] = ['label' => (string) ($o['label'] ?? '?'), 'author' => (string) ($o['author'] ?? ''), 'seen_at' => (string) ($o['last_sync'] ?? '')]; }
        }
    }
    $held = [];
    if ($reachable) {
        foreach (sd_folder_packages($pdo, false) as $p) {
            if ($p['state'] !== 'held') { continue; }
            $held[] = ['package_uid' => $p['package']['package_uid'], 'author' => (string) ($p['package']['author'] ?? ''), 'machine_label' => (string) ($p['package']['machine_label'] ?? ''),
                'created_at' => (string) ($p['package']['created_at'] ?? ''), 'count' => count((array) ($p['package']['changes'] ?? []))];
        }
    }
    $merges = $pdo->query('SELECT id, summary, applied, created_at, undone_at FROM sync_merges ORDER BY id DESC LIMIT 5')->fetchAll();
    $openKeys = [];
    foreach ($pdo->query("SELECT tbl, uid FROM sync_conflicts WHERE status='open'") as $c) { $openKeys[$c['tbl'] . '|' . $c['uid']] = true; }
    // les fiches en conflit attendent ton choix : elles ne comptent pas dans « à envoyer »
    $pending = $s['base_uid'] !== '' ? count(array_filter(sync_diff($pdo), static fn($c) => !isset($openKeys[$c['tbl'] . '|' . $c['uid']]))) : null;
    return ['active' => $s['base_uid'] !== '', 'author' => (string) $s['author'], 'machine' => $m['label'], 'folder' => $folder, 'reachable' => $reachable,
        'cloud' => function_exists('offsite_is_cloud') && $folder !== '' && offsite_is_cloud($folder), 'auto' => !array_key_exists('auto', $s) || !empty($s['auto']),
        'pending' => $pending, 'incoming' => $reachable ? count(sd_folder_packages($pdo)) : 0, 'held' => $held, 'conflicts' => sd_conflicts($pdo),
        'others' => $others, 'last_sync' => (string) ($s['last_folder_sync'] ?? ''), 'starter' => $reachable && is_file($root . '/depart.db'),
        'merges' => $merges, 'suggestions' => function_exists('offsite_suggestions') ? offsite_suggestions() : []];
}

/** Choisir le dossier partagé (et commencer si besoin) ; la copie de départ pour l'autre ordinateur y est posée. */
function sd_setup(PDO $pdo, array $data): array
{
    $folder = sd_expand(safe_text($data['folder'] ?? ''));
    if (!sd_path_ok($folder)) { throw new RuntimeException('Écris le chemin complet du dossier partagé (par exemple /Volumes/MaCle ou ~/Dropbox).'); }
    if (!is_dir($folder)) {
        if (!is_dir(dirname($folder)) || !@mkdir($folder, 0775) ) { throw new RuntimeException(i18n_t('Dossier introuvable : {dir} (clé débranchée ?).', ['dir' => $folder])); }
    }
    if (!is_writable($folder)) { throw new RuntimeException('Ce dossier ne peut pas être modifié : ' . $folder); }
    $s = sync_settings($pdo);
    if ($s['base_uid'] === '') {
        $author = safe_text($data['author'] ?? '');
        sync_start($pdo, ['author' => $author !== '' ? $author : sd_machine()['label']]);
    } elseif (safe_text($data['author'] ?? '') !== '') {
        sync_set_author($pdo, ['author' => safe_text($data['author'])]);
    }
    $s = sync_settings($pdo);
    $folders = is_array($s['folders'] ?? null) ? $s['folders'] : [];
    $folders[sd_machine()['key']] = $folder;
    sd_set($pdo, ['folders' => $folders, 'auto' => array_key_exists('auto', $data) ? !empty($data['auto']) : (!array_key_exists('auto', $s) || !empty($s['auto']))]);
    $root = sd_root($pdo);
    foreach (['', '/paquets', '/medias', '/ordinateurs'] as $sub) {
        if (!is_dir($root . $sub) && !@mkdir($root . $sub, 0775, true) && !is_dir($root . $sub)) { throw new RuntimeException('Impossible de créer le rangement dans le dossier partagé.'); }
    }
    if (!is_file($root . '/depart.db')) { sd_write_starter($pdo, $root); }
    sd_seen($pdo, $root);
    return sd_status($pdo);
}

/** Copie de départ pour l'autre ordinateur : la base telle quelle (copie cohérente), à ouvrir là-bas. */
function sd_write_starter(PDO $pdo, string $root): void
{
    $pdo->exec('PRAGMA wal_checkpoint(FULL)');
    $part = $root . '/depart.db.' . bin2hex(random_bytes(3)) . '.part';
    $pdo->exec('VACUUM main INTO ' . $pdo->quote($part));
    if (!@rename($part, $root . '/depart.db')) { @unlink($part); throw new RuntimeException('Impossible d’écrire la copie de départ.'); }
    @file_put_contents($root . '/depart.json', json_encode(['base_uid' => sync_settings($pdo)['base_uid'], 'created_at' => date('c'), 'by' => sd_machine()['label'],
        'lisez-moi' => 'Sur l’autre ordinateur : ouvre depart.db dans LCNDA (écran de démarrage → Importer un fichier, ou une nouvelle généalogie vide), puis Réglages → Travail à deux → 🔄 Deux ordinateurs → choisis ce même dossier.'], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}

function sd_seen(PDO $pdo, string $root): void
{
    $m = sd_machine();
    @file_put_contents($root . '/ordinateurs/' . $m['key'] . '.json', json_encode(['key' => $m['key'], 'label' => $m['label'], 'author' => (string) sync_settings($pdo)['author'], 'last_sync' => date('c')], JSON_UNESCAPED_UNICODE));
}

/** Copie un média entre la généalogie et le dossier partagé (jamais d'écrasement, jamais hors du dossier). */
function sd_media_copy(string $name, string $fromDir, string $toDir): bool
{
    $name = str_replace('\\', '/', trim($name));
    if ($name === '' || preg_match('#^(https?:|/|[A-Za-z]:)#i', $name) || str_contains('/' . $name . '/', '/../') || str_contains($name, "\0") || preg_match('#(^|/)\.#', $name)) { return false; }
    $from = $fromDir . '/' . $name; $to = $toDir . '/' . $name;
    if (!is_file($from) || is_file($to) || (int) @filesize($from) > SD_MAX_MEDIA) { return false; }
    if (!is_dir(dirname($to)) && !@mkdir(dirname($to), 0775, true)) { return false; }
    $part = $to . '.' . bin2hex(random_bytes(3)) . '.part';
    if (!@copy($from, $part)) { @unlink($part); return false; }
    return @rename($part, $to);
}

/* ─── 🔄 Synchroniser ────────────────────────────────────────────────── */

function sd_snap_get(PDO $pdo, string $t, string $uid): ?array
{
    $st = $pdo->prepare('SELECT hash, row_json FROM sync_snapshot WHERE tbl=? AND uid=?'); $st->execute([$t, $uid]);
    $r = $st->fetch(); $st->closeCursor();
    return $r ?: null;
}

function sd_snap_set(PDO $pdo, string $t, string $uid, ?array $row): void
{
    if ($row === null) { $pdo->prepare('DELETE FROM sync_snapshot WHERE tbl=? AND uid=?')->execute([$t, $uid]); return; }
    $pdo->prepare('INSERT OR REPLACE INTO sync_snapshot(tbl, uid, hash, row_json) VALUES(?,?,?,?)')->execute([$t, $uid, sync_hash($row), json_encode($row, JSON_UNESCAPED_UNICODE)]);
}

/** Lit les paquets de l'autre ordinateur et applique tout ce qui ne pose pas de question ; garde les conflits. */
function sd_pull(PDO $pdo): array
{
    $root = sd_root($pdo);
    $packages = sd_folder_packages($pdo);
    $out = ['packages' => 0, 'applied' => 0, 'conflicts' => 0, 'errors' => [], 'locked_skipped' => 0, 'merge_id' => null, 'from' => []];
    if (!$packages) { return $out; }
    // copie de sécurité (les 5 dernières sont gardées ; jamais effacées par la rotation des sauvegardes)
    $backupDir = DATA_DIR . '/backups';
    if (!is_dir($backupDir)) { @mkdir($backupDir, 0775, true); }
    $pdo->exec('PRAGMA wal_checkpoint(FULL)');
    $pdo->exec('VACUUM main INTO ' . $pdo->quote($backupDir . '/genealogie-backup-' . date('Ymd-His') . '-' . bin2hex(random_bytes(2)) . '-avant-fusion-dossier.db'));
    $old = glob($backupDir . '/genealogie-backup-*-avant-fusion-dossier.db') ?: [];
    usort($old, static fn($a, $b) => filemtime($b) <=> filemtime($a));
    foreach (array_slice($old, 5) as $f) { @unlink($f); }

    $undoRows = []; $undoSnap = []; $pkgUids = []; $conflictIds = []; $touchedAll = []; $summaries = [];
    $pdo->beginTransaction();
    try {
        $pdo->prepare('INSERT INTO sync_merges(summary) VALUES(?)')->execute(['']);
        $mergeId = (int) $pdo->lastInsertId();
        foreach ($packages as $p) {
            $pkg = $p['package'];
            if (sync_package_problem($pdo, $pkg) !== '') { $out['errors'][] = basename($p['file']) . ' : ' . sync_package_problem($pdo, $pkg); continue; }
            $local = sync_portable_rows($pdo);
            $items = sync_items($pdo, $pkg, $local);
            $open = [];
            foreach ($pdo->query("SELECT tbl, uid FROM sync_conflicts WHERE status='open'") as $c) { $open[$c['tbl'] . '|' . $c['uid']] = true; }
            $accept = [];
            foreach ($items as $it) {
                $k = $it['tbl'] . '|' . $it['uid'];
                if (in_array($it['state'], ['new', 'ok'], true) && !isset($open[$k])) { $accept[] = $it['index']; continue; }
                if ($it['state'] === 'same') { continue; }
                // conflit (ou déjà en conflit) : gardé pour être réglé côte à côte ; un conflit plus ancien sur la même fiche est remplacé
                $pdo->prepare("UPDATE sync_conflicts SET status='replaced', resolved_at=CURRENT_TIMESTAMP WHERE status='open' AND tbl=? AND uid=?")->execute([$it['tbl'], $it['uid']]);
                $pdo->prepare('INSERT INTO sync_conflicts(merge_id, package_uid, author, machine_label, tbl, uid, op, label, mine_json, theirs_json, before_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
                    ->execute([$mergeId, $pkg['package_uid'], (string) ($pkg['author'] ?? ''), (string) ($pkg['machine_label'] ?? ''), $it['tbl'], $it['uid'], $it['op'], $it['label'],
                        $it['mine'] === null ? null : json_encode($it['mine'], JSON_UNESCAPED_UNICODE), $it['theirs'] === null ? null : json_encode($it['theirs'], JSON_UNESCAPED_UNICODE),
                        $it['before'] === null ? null : json_encode($it['before'], JSON_UNESCAPED_UNICODE)]);
                $conflictIds[] = (int) $pdo->lastInsertId();
                $out['conflicts']++;
            }
            $before = [];
            foreach ($items as $it) { if (in_array($it['index'], $accept, true)) { $before[$it['tbl'] . '|' . $it['uid']] = sd_snap_get($pdo, $it['tbl'], $it['uid']); } }
            $res = sync_apply_core($pdo, $pkg['changes'], $accept, $local);
            foreach ($res['touched'] as [$t, $uid]) {
                $k = $t . '|' . $uid;
                if (!array_key_exists($k, $undoSnap)) { $undoSnap[$k] = ['tbl' => $t, 'uid' => $uid, 'snap' => $before[$k] ?? null]; }
                $pdo->prepare("UPDATE sync_conflicts SET status='replaced', resolved_at=CURRENT_TIMESTAMP WHERE status='open' AND tbl=? AND uid=? AND merge_id<>?")->execute([$t, $uid, $mergeId]);
            }
            sync_take_snapshot($pdo, $res['touched']);
            foreach ($res['undo'] as $u) { $undoRows[] = $u; }
            $touchedAll = array_merge($touchedAll, $res['touched']);
            $out['applied'] += $res['applied']; $out['locked_skipped'] += $res['locked_skipped'];
            foreach ($res['errors'] as $e) { $out['errors'][] = $e; }
            $pdo->prepare("INSERT INTO sync_packages(direction, package_uid, author, change_count, accepted_count, summary) VALUES('received', ?, ?, ?, ?, ?)")
                ->execute([$pkg['package_uid'], (string) ($pkg['author'] ?? ''), count($pkg['changes']), $res['applied'], sync_summary(array_map(static fn($x) => $x[1], $res['indexed']))]);
            $pkgUids[] = $pkg['package_uid'];
            $who = trim((string) ($pkg['machine_label'] ?? '')) ?: (string) ($pkg['author'] ?? '?');
            $out['from'][$who] = true;
            if ($res['applied']) { $summaries[] = sync_summary(array_map(static fn($x) => $x[1], $res['indexed'])); }
            $out['packages']++;
            // médias reçus : le fichier vient du dossier partagé s'il y est
            foreach ($res['touched'] as [$t, $uid]) {
                if ($t !== 'media') { continue; }
                $st = $pdo->prepare('SELECT filename, thumbnail FROM media WHERE uid=?'); $st->execute([$uid]);
                foreach (($st->fetch() ?: []) as $name) { if ($name) { sd_media_copy((string) $name, $root . '/medias', MEDIA_DIR); } }
            }
        }
        $summary = implode(' ; ', array_filter($summaries));
        $pdo->prepare('UPDATE sync_merges SET summary=?, applied=?, undo_json=? WHERE id=?')->execute([$summary, $out['applied'],
            json_encode(['rows' => $undoRows, 'snap' => array_values($undoSnap), 'packages' => $pkgUids, 'conflicts' => $conflictIds], JSON_UNESCAPED_UNICODE), $mergeId]);
        if ($out['applied']) { log_change($pdo, 'meta', 0, 'update', '🔄 Deux ordinateurs : ' . $out['applied'] . ' changement(s) reçu(s) de ' . implode(', ', array_keys($out['from']))); }
        $pdo->commit();
        $out['merge_id'] = $mergeId;
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw new RuntimeException('Rien n’a été fusionné : ' . $e->getMessage());
    }
    $out['from'] = array_keys($out['from']);
    $out['summary'] = $summary;
    return $out;
}

/** Écrit le paquet de ce qui a changé ici (sans les fiches en conflit, gardées jusqu'au choix). */
function sd_push(PDO $pdo): array
{
    $root = sd_root($pdo);
    $open = [];
    foreach ($pdo->query("SELECT tbl, uid FROM sync_conflicts WHERE status='open'") as $c) { $open[$c['tbl'] . '|' . $c['uid']] = true; }
    $changes = array_values(array_filter(sync_diff($pdo), static fn($c) => !isset($open[$c['tbl'] . '|' . $c['uid']])));
    if (!$changes) { return ['sent' => 0]; }
    $m = sd_machine();
    $pdo->beginTransaction();
    try {
        $pkg = sync_build_package($pdo, $changes, ['machine' => $m['key'], 'machine_label' => $m['label']]);
        $name = date('Ymd-His') . '-' . $m['key'] . '-' . $pkg['package_uid'] . '.lcnda-changes.json';
        $part = $root . '/paquets/' . $name . '.part';
        if (@file_put_contents($part, json_encode($pkg, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) === false || !@rename($part, $root . '/paquets/' . $name)) {
            @unlink($part);
            throw new RuntimeException('Impossible d’écrire dans le dossier partagé.');
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        throw $e;
    }
    $media = 0;
    foreach ($changes as $c) {
        if ($c['tbl'] !== 'media' || !is_array($c['after'])) { continue; }
        foreach (['filename', 'thumbnail'] as $k) { if (!empty($c['after'][$k]) && sd_media_copy((string) $c['after'][$k], MEDIA_DIR, $root . '/medias')) { $media++; } }
    }
    return ['sent' => count($changes), 'media_copied' => $media, 'file' => $name, 'summary' => sync_summary($changes)];
}

/** 🔄 Synchroniser : d'abord recevoir (moins de conflits), puis envoyer. Dossier absent = un message, jamais un blocage. */
function sd_sync(PDO $pdo): array
{
    if (sync_settings($pdo)['base_uid'] === '') { throw new RuntimeException('Choisis d’abord le dossier partagé.'); }
    $folder = sd_folder($pdo);
    if ($folder === '') { return ['ok' => false, 'no_folder' => true, 'error' => 'Aucun dossier partagé n’est choisi sur cet ordinateur.']; }
    $root = sd_root($pdo);
    if (!is_dir($folder)) { return ['ok' => false, 'missing' => true, 'error' => i18n_t('Dossier partagé introuvable : {dir} (clé débranchée ?). Rien n’est perdu : tes changements partiront la prochaine fois.', ['dir' => $folder])]; }
    foreach (['', '/paquets', '/medias', '/ordinateurs'] as $sub) { if (!is_dir($root . $sub)) { @mkdir($root . $sub, 0775, true); } }
    $in = sd_pull($pdo);
    $outp = sd_push($pdo);
    sd_seen($pdo, $root);
    sd_set($pdo, ['last_folder_sync' => date('c')]);
    return ['ok' => true] + $in + ['sent' => $outp['sent'], 'sent_summary' => $outp['summary'] ?? '', 'open_conflicts' => count(sd_conflicts($pdo))];
}

/** ↶ Annuler une fusion : les fiches reviennent comme avant, et les paquets sont mis de côté (« Revoir » pour choisir un à un). */
function sd_undo(PDO $pdo, array $data): array
{
    $id = safe_int($data['merge_id'] ?? 0);
    $st = $pdo->prepare('SELECT * FROM sync_merges WHERE id=? AND undone_at IS NULL'); $st->execute([$id]);
    $merge = $st->fetch(); $st->closeCursor();
    if (!$merge) { throw new RuntimeException('Cette fusion est déjà annulée, ou introuvable.'); }
    $u = json_decode((string) $merge['undo_json'], true) ?: [];
    $errors = [];
    $pdo->beginTransaction();
    try {
        foreach (array_reverse((array) ($u['rows'] ?? [])) as $r) {
            if (!is_array($r) || !is_string($r['tbl'] ?? null) || !is_string($r['uid'] ?? null)) { continue; }
            $row = is_array($r['row'] ?? null) ? $r['row'] : null;
            sync_apply_row($pdo, $r['tbl'], $r['uid'], $row === null ? 'delete' : 'update', $row, $errors);
        }
        foreach ((array) ($u['snap'] ?? []) as $sn) {
            if (!is_array($sn) || !is_string($sn['tbl'] ?? null) || !is_string($sn['uid'] ?? null)) { continue; }
            if (is_array($sn['snap'] ?? null)) { $pdo->prepare('INSERT OR REPLACE INTO sync_snapshot(tbl, uid, hash, row_json) VALUES(?,?,?,?)')->execute([$sn['tbl'], $sn['uid'], (string) $sn['snap']['hash'], (string) $sn['snap']['row_json']]); }
            else { $pdo->prepare('DELETE FROM sync_snapshot WHERE tbl=? AND uid=?')->execute([$sn['tbl'], $sn['uid']]); }
        }
        $pkgs = array_values(array_filter((array) ($u['packages'] ?? []), 'is_string'));
        foreach ($pkgs as $p) { $pdo->prepare("DELETE FROM sync_packages WHERE direction='received' AND package_uid=?")->execute([$p]); }
        foreach ((array) ($u['conflicts'] ?? []) as $cid) { $pdo->prepare("DELETE FROM sync_conflicts WHERE id=?")->execute([(int) $cid]); }
        sd_set($pdo, ['held' => array_values(array_unique(array_merge(sd_held($pdo), $pkgs)))]);
        $pdo->prepare('UPDATE sync_merges SET undone_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$id]);
        log_change($pdo, 'meta', 0, 'update', '🔄 Deux ordinateurs : fusion annulée (' . count($pkgs) . ' paquet(s) mis de côté)');
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw new RuntimeException('Annulation impossible : ' . $e->getMessage());
    }
    return ['ok' => true, 'held' => count($pkgs), 'errors' => $errors];
}

/** ↷ Rétablir : les paquets mis de côté par cette annulation repassent dans la fusion. */
function sd_redo(PDO $pdo, array $data): array
{
    $id = safe_int($data['merge_id'] ?? 0);
    $st = $pdo->prepare('SELECT undo_json FROM sync_merges WHERE id=? AND undone_at IS NOT NULL'); $st->execute([$id]);
    $raw = $st->fetchColumn(); $st->closeCursor();
    $u = json_decode((string) ($raw ?: '{}'), true) ?: [];
    $pkgs = array_values(array_filter((array) ($u['packages'] ?? []), 'is_string'));
    sd_set($pdo, ['held' => array_values(array_diff(sd_held($pdo), $pkgs))]);
    return sd_pull($pdo) + ['ok' => true];
}

/** Paquet mis de côté revu à la main (Travail à deux → sync_apply) : il n'est plus « de côté ». */
function sd_after_manual_apply(PDO $pdo, array $package, array $touched): void
{
    $uid = (string) ($package['package_uid'] ?? '');
    if ($uid !== '' && in_array($uid, sd_held($pdo), true)) { sd_set($pdo, ['held' => array_values(array_diff(sd_held($pdo), [$uid]))]); }
}

/** « Revoir » un paquet mis de côté : la revue du Travail à deux (accepter ou refuser chaque changement). */
function sd_review(PDO $pdo, array $data): never
{
    $want = (string) ($data['package_uid'] ?? '');
    foreach (sd_folder_packages($pdo, false) as $p) {
        if ($p['package']['package_uid'] === $want && $p['state'] === 'held') { sync_preview_package($pdo, $p['package'], ['held' => true]); }
    }
    json_response(['error' => 'Paquet introuvable dans le dossier partagé.'], 422);
}

/** Régler un conflit : « mine » (garder la mienne), « theirs » (prendre l'autre), « both » (une note : garder les deux). */
function sd_resolve(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $choice = (string) ($data['choice'] ?? '');
    if (!in_array($choice, ['mine', 'theirs', 'both'], true)) { throw new RuntimeException('Choix inconnu.'); }
    $st = $pdo->prepare("SELECT * FROM sync_conflicts WHERE id=? AND status='open'"); $st->execute([$id]);
    $c = $st->fetch(); $st->closeCursor();
    if (!$c) { throw new RuntimeException('Ce conflit est déjà réglé.'); }
    $t = (string) $c['tbl']; $uid = (string) $c['uid'];
    if (!in_array($t, SYNC_TABLES, true)) { throw new RuntimeException('Conflit illisible.'); }
    $theirs = json_decode((string) $c['theirs_json'], true); $theirs = is_array($theirs) ? $theirs : null;
    $mineNow = sync_portable_rows($pdo)[$t][$uid] ?? null;
    if ($choice === 'both' && ($t !== 'notes' || $mineNow === null || $theirs === null)) { throw new RuntimeException('« Garder les deux » marche pour une note.'); }
    $errors = [];
    $undo = ['mine' => $mineNow, 'snap' => sd_snap_get($pdo, $t, $uid), 'extra' => null];
    $pdo->beginTransaction();
    try {
        if ($choice === 'theirs') {
            $res = sync_apply_row($pdo, $t, $uid, $theirs === null ? 'delete' : 'update', $theirs, $errors);
            if ($res === 'missing') { throw new RuntimeException($errors[0] ?? 'Une fiche liée manque.'); }
            if ($res === 'locked') { throw new RuntimeException('La fiche est verrouillée : déverrouille-la d’abord.'); }
        } elseif ($choice === 'both') {
            $copy = $theirs;
            $copy['title'] = trim(((string) ($copy['title'] ?? '')) . ' (' . ((string) $c['machine_label'] ?: (string) $c['author'] ?: 'autre ordinateur') . ')');
            $newUid = bin2hex(random_bytes(10));
            if (sync_apply_row($pdo, 'notes', $newUid, 'create', $copy, $errors) !== 'applied') { throw new RuntimeException($errors[0] ?? 'Note impossible à ajouter.'); }
            $undo['extra'] = ['tbl' => 'notes', 'uid' => $newUid];
        }
        // la photo prend la version de l'autre : « prendre l'autre » ne renvoie rien, « garder la mienne » repart chez lui sans nouveau conflit
        sd_snap_set($pdo, $t, $uid, $theirs);
        $pdo->prepare("UPDATE sync_conflicts SET status='resolved', resolution=?, undo_json=?, resolved_at=CURRENT_TIMESTAMP WHERE id=?")->execute([$choice, json_encode($undo, JSON_UNESCAPED_UNICODE), $id]);
        log_change($pdo, 'meta', 0, 'update', '🔄 Conflit réglé (' . ['mine' => 'garder la mienne', 'theirs' => 'prendre l’autre', 'both' => 'garder les deux'][$choice] . ') : ' . $c['label']);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        throw $e;
    }
    return ['ok' => true, 'id' => $id, 'choice' => $choice, 'open_conflicts' => count(sd_conflicts($pdo))];
}

/** ↶ Annuler le choix d'un conflit : la fiche revient comme avant et le conflit est de nouveau à régler. */
function sd_reopen(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $st = $pdo->prepare("SELECT * FROM sync_conflicts WHERE id=? AND status='resolved'"); $st->execute([$id]);
    $c = $st->fetch(); $st->closeCursor();
    if (!$c) { throw new RuntimeException('Ce conflit n’est pas réglé.'); }
    $u = json_decode((string) $c['undo_json'], true) ?: [];
    $errors = [];
    $pdo->beginTransaction();
    try {
        $mine = is_array($u['mine'] ?? null) ? $u['mine'] : null;
        sync_apply_row($pdo, (string) $c['tbl'], (string) $c['uid'], $mine === null ? 'delete' : 'update', $mine, $errors);
        if (is_array($u['extra'] ?? null)) { sync_apply_row($pdo, 'notes', (string) $u['extra']['uid'], 'delete', null, $errors); }
        if (is_array($u['snap'] ?? null)) { $pdo->prepare('INSERT OR REPLACE INTO sync_snapshot(tbl, uid, hash, row_json) VALUES(?,?,?,?)')->execute([(string) $c['tbl'], (string) $c['uid'], (string) $u['snap']['hash'], (string) $u['snap']['row_json']]); }
        else { $pdo->prepare('DELETE FROM sync_snapshot WHERE tbl=? AND uid=?')->execute([(string) $c['tbl'], (string) $c['uid']]); }
        $pdo->prepare("UPDATE sync_conflicts SET status='open', resolution='', resolved_at=NULL WHERE id=?")->execute([$id]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        throw $e;
    }
    return ['ok' => true, 'open_conflicts' => count(sd_conflicts($pdo))];
}

/** Réglages de cet ordinateur : synchroniser tout seul à l'ouverture (et toutes les 15 min), retirer le dossier. */
function sd_settings_save(PDO $pdo, array $data): array
{
    $ch = [];
    if (array_key_exists('auto', $data)) { $ch['auto'] = !empty($data['auto']); }
    if (!empty($data['forget_folder'])) {
        $s = sync_settings($pdo); $folders = is_array($s['folders'] ?? null) ? $s['folders'] : [];
        unset($folders[sd_machine()['key']]); $ch['folders'] = $folders;
    }
    if ($ch) { sd_set($pdo, $ch); }
    return sd_status($pdo);
}

function sd_dispatch(PDO $pdo, string $action, array $payload, bool $isWrite): array
{
    if (!$isWrite) {
        return match ($action) {
            'sd_status' => sd_status($pdo),
            'sd_auto' => ['folder' => sd_folder($pdo) !== '' && sync_settings($pdo)['base_uid'] !== '', 'auto' => (bool) (sync_settings($pdo)['auto'] ?? true)], // léger : pas de calcul des changements
            default => throw new RuntimeException('Action inconnue.'),
        };
    }
    return match ($action) {
        'sd_setup' => sd_setup($pdo, $payload),
        'sd_sync' => sd_sync($pdo),
        'sd_undo' => sd_undo($pdo, $payload),
        'sd_redo' => sd_redo($pdo, $payload),
        'sd_resolve' => sd_resolve($pdo, $payload),
        'sd_reopen' => sd_reopen($pdo, $payload),
        'sd_review' => sd_review($pdo, $payload),
        'sd_settings' => sd_settings_save($pdo, $payload),
        default => throw new RuntimeException('Action inconnue.'),
    };
}
