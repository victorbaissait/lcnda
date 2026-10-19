<?php
declare(strict_types=1);

/**
 * 🧩 Puzzle (outil Jeu, assets/js/app-puzzle.js) : parties en cours, terminées et records rangés dans la base de la
 * généalogie (table puzzle_games), pour qu'ils suivent la sauvegarde, les autres ordinateurs et chaque généalogie.
 *
 *   GET  api.php?action=puzzle               → {games: [...en cours], history: [...terminées], records: {clé: ms}}
 *   GET  api.php?action=puzzle&uid=puz-…     → {game: {uid, status, meta, state, …}}
 *   POST api.php?action=puzzle_write {op: 'save' | 'finish' | 'delete', uid, meta, state, saved_at, csrf}
 *
 * La table est créée au premier enregistrement (CREATE TABLE IF NOT EXISTS, comme periodicals_ensure) : pas de nouveau
 * numéro de structure pour un jeu. Une base qui ne l'a pas encore se lit comme « aucune partie ».
 * Tout ce qui arrive du navigateur est relu champ par champ (liste blanche, types, bornes) ; une partie abîmée ou forgée
 * est refusée en entier. Mode consultation : puzzle_write est refusé par kiosk_guard() (api.php), comme toute écriture.
 */

const PUZZLE_MAX_BYTES = 2 * 1024 * 1024;   // une partie (description + pièces) : 2 Mo au plus
const PUZZLE_MAX_PIECES = 1000;
const PUZZLE_MAX_PLAYING = 30;              // parties en cours
const PUZZLE_MAX_DONE = 300;                // parties terminées gardées (les plus anciennes partent)
const PUZZLE_ACTIONS = ['puzzle', 'puzzle_write'];

function puzzle_ensure(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS puzzle_games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'playing',
        name TEXT NOT NULL DEFAULT '',
        meta_json TEXT NOT NULL DEFAULT '{}',
        state_json TEXT NOT NULL DEFAULT '',
        pieces INTEGER NOT NULL DEFAULT 0,
        placed INTEGER NOT NULL DEFAULT 0,
        elapsed_ms INTEGER NOT NULL DEFAULT 0,
        record_key TEXT NOT NULL DEFAULT '',
        client_ts INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        finished_at TEXT
    )");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_puzzle_games_status ON puzzle_games(status, updated_at)');
}

function puzzle_table_exists(PDO $pdo): bool
{
    return (bool) $pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='puzzle_games'")->fetchColumn();
}

function puzzle_uid(mixed $v): string
{
    $uid = is_string($v) ? $v : '';
    if (!preg_match('/^puz-[a-z0-9-]{1,60}$/', $uid)) { throw new RuntimeException('Partie de puzzle inconnue.'); }
    return $uid;
}

function puzzle_text(mixed $v, int $max): string
{
    return is_scalar($v) ? mb_substr(trim(str_replace(["\r", "\n", "\0"], ' ', (string) $v)), 0, $max) : '';
}

function puzzle_int(mixed $v, int $min, int $max, int $default = 0): int
{
    if (!is_int($v) && !(is_float($v) && is_finite($v)) && !(is_string($v) && is_numeric($v))) { return $default; }
    return max($min, min($max, (int) round((float) $v)));
}

/** L'image : un média de la base (« media/… ») ou, en secours, une copie réduite intégrée (« data:image/… »). */
function puzzle_clean_image(mixed $img): array
{
    if (!is_array($img)) { throw new RuntimeException('Image du puzzle absente.'); }
    $url = is_string($img['url'] ?? null) ? $img['url'] : '';
    $okUrl = (str_starts_with($url, 'media/') && strlen($url) <= 600 && !str_contains($url, '..') && !preg_match('/[\s"\'<>\\\\]/', $url))
        || (preg_match('#^data:image/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$#', $url) === 1 && strlen($url) <= 1_600_000);
    if (!$okUrl) { throw new RuntimeException('Image du puzzle refusée.'); }
    $w = puzzle_int($img['w'] ?? 0, 0, 200000); $h = puzzle_int($img['h'] ?? 0, 0, 200000);
    if ($w < 1 || $h < 1) { throw new RuntimeException('Taille d’image du puzzle invalide.'); }
    return array_filter([
        'key' => puzzle_text($img['key'] ?? '', 300) ?: mb_substr($url, 0, 300),
        'url' => $url,
        'title' => puzzle_text($img['title'] ?? '', 200),
        'mediaId' => puzzle_int($img['mediaId'] ?? 0, 0, PHP_INT_MAX),
        'personId' => puzzle_int($img['personId'] ?? 0, 0, PHP_INT_MAX),
        'w' => $w, 'h' => $h,
        'note' => puzzle_text($img['note'] ?? '', 200),
    ], static fn($x) => $x !== '' && $x !== 0);
}

/**
 * La description d'une partie (sans les pièces). $old = celle déjà enregistrée : un envoi partiel (au moment de quitter
 * la page, sans l'image pour rester petit) garde ce qui n'est pas renvoyé.
 */
function puzzle_clean_meta(mixed $meta, array $old = []): array
{
    if (!is_array($meta)) { throw new RuntimeException('Partie de puzzle illisible.'); }
    $m = $old;
    if (array_key_exists('image', $meta) || !$old) { $m['image'] = puzzle_clean_image($meta['image'] ?? null); }
    foreach (['cols', 'rows'] as $k) { if (array_key_exists($k, $meta) || !$old) { $m[$k] = puzzle_int($meta[$k] ?? 0, 0, PUZZLE_MAX_PIECES); } }
    $n = (int) ($m['cols'] ?? 0) * (int) ($m['rows'] ?? 0);
    if (($m['cols'] ?? 0) < 1 || ($m['rows'] ?? 0) < 1 || $n < 4 || $n > PUZZLE_MAX_PIECES) { throw new RuntimeException('Nombre de pièces invalide (4 à 1000).'); }
    if ($old && ((int) $old['cols'] !== (int) $m['cols'] || (int) $old['rows'] !== (int) $m['rows'])) { throw new RuntimeException('On ne peut pas changer le nombre de pièces d’une partie commencée.'); }
    if (array_key_exists('name', $meta) || !$old) { $m['name'] = puzzle_text($meta['name'] ?? '', 120) ?: 'Mon puzzle'; }
    if (array_key_exists('shape', $meta) || !$old) { $m['shape'] = ($meta['shape'] ?? '') === 'square' ? 'square' : 'jigsaw'; }
    foreach (['rotate', 'model', 'edges'] as $k) { if (array_key_exists($k, $meta)) { $m[$k] = (bool) $meta[$k]; } elseif (!$old) { $m[$k] = $k === 'model'; } }
    if (array_key_exists('seed', $meta) || !$old) { $m['seed'] = puzzle_int($meta['seed'] ?? 1, 0, 4294967295, 1); }
    if (array_key_exists('createdAt', $meta) || !$old) { $m['createdAt'] = puzzle_int($meta['createdAt'] ?? 0, 0, 32503680000000); }
    if (array_key_exists('elapsed', $meta)) { $m['elapsed'] = puzzle_int($meta['elapsed'], 0, 315576000000); }
    if (array_key_exists('placed', $meta)) { $m['placed'] = puzzle_int($meta['placed'], 0, $n); }
    $m['elapsed'] = (int) ($m['elapsed'] ?? 0); $m['placed'] = (int) ($m['placed'] ?? 0);
    return $m;
}

/** Les pièces : positions, rotation, groupes, posées, ordre d'affichage — tout est vérifié (n valeurs, bornes, entiers). */
function puzzle_clean_state(mixed $st, int $n): array
{
    if (!is_array($st)) { throw new RuntimeException('Pièces du puzzle illisibles.'); }
    $list = static function (string $k) use ($st, $n): array {
        $a = $st[$k] ?? null;
        if (!is_array($a) || !array_is_list($a) || count($a) !== $n) { throw new RuntimeException("Pièces du puzzle abîmées ({$k})."); }
        return $a;
    };
    $num = static function (array $a, string $k): array {
        return array_map(static function ($v) use ($k) {
            if (!(is_int($v) || (is_float($v) && is_finite($v))) || abs((float) $v) > 1e7) { throw new RuntimeException("Pièces du puzzle abîmées ({$k})."); }
            return round((float) $v, 1);
        }, $a);
    };
    $ints = static function (array $a, string $k, int $max): array {
        return array_map(static function ($v) use ($k, $max) {
            if (!is_int($v) || $v < 0 || $v > $max) { throw new RuntimeException("Pièces du puzzle abîmées ({$k})."); }
            return $v;
        }, $a);
    };
    $order = $ints($list('order'), 'order', $n - 1);
    if (count(array_unique($order)) !== $n) { throw new RuntimeException('Pièces du puzzle abîmées (order).'); }
    return ['v' => 1, 'cx' => $num($list('cx'), 'cx'), 'cy' => $num($list('cy'), 'cy'), 'rot' => $ints($list('rot'), 'rot', 3),
        'grp' => $ints($list('grp'), 'grp', $n - 1), 'lk' => $ints($list('lk'), 'lk', 1), 'order' => $order];
}

function puzzle_record_key(array $meta): string
{
    return mb_substr((string) ($meta['image']['key'] ?? ''), 0, 300) . '|' . ((int) $meta['cols'] * (int) $meta['rows']);
}

function puzzle_row(PDO $pdo, string $uid): ?array
{
    $s = $pdo->prepare('SELECT * FROM puzzle_games WHERE uid=?'); $s->execute([$uid]);
    $r = $s->fetch(PDO::FETCH_ASSOC);
    return $r ?: null;
}

function puzzle_out(array $r, bool $withState = false): array
{
    $meta = json_decode((string) $r['meta_json'], true) ?: [];
    $meta['id'] = $r['uid']; $meta['name'] = $r['name']; $meta['elapsed'] = (int) $r['elapsed_ms']; $meta['placed'] = (int) $r['placed'];
    if ($r['status'] === 'done') { $meta['time'] = (int) $r['elapsed_ms']; $meta['finishedAt'] = $r['finished_at'] ? strtotime((string) $r['finished_at'] . ' UTC') * 1000 : 0; }
    $out = ['uid' => $r['uid'], 'status' => $r['status'], 'meta' => $meta, 'updated_at' => $r['updated_at'], 'saved_at' => (int) $r['client_ts']];
    if ($withState) { $out['state'] = $r['state_json'] !== '' ? json_decode((string) $r['state_json'], true) : null; }
    return $out;
}

function puzzle_list(PDO $pdo): array
{
    // repère de la base (pour ranger le secours du navigateur par généalogie, jamais un chemin en clair)
    $base = substr(hash('sha256', (defined('GENEALOGY_ID') ? (string) GENEALOGY_ID : '') . '|' . (defined('DB_PATH') ? (string) DB_PATH : '')), 0, 16);
    if (!puzzle_table_exists($pdo)) { return ['base' => $base, 'games' => [], 'history' => [], 'records' => new stdClass()]; }
    $games = array_map(static fn($r) => puzzle_out($r)['meta'], $pdo->query("SELECT uid,status,name,meta_json,elapsed_ms,placed,updated_at,finished_at,client_ts FROM puzzle_games WHERE status='playing' ORDER BY updated_at DESC, id DESC")->fetchAll(PDO::FETCH_ASSOC));
    $history = array_map(static fn($r) => puzzle_out($r)['meta'], $pdo->query("SELECT uid,status,name,meta_json,elapsed_ms,placed,updated_at,finished_at,client_ts FROM puzzle_games WHERE status='done' ORDER BY finished_at DESC, id DESC LIMIT " . PUZZLE_MAX_DONE)->fetchAll(PDO::FETCH_ASSOC));
    $records = [];
    foreach ($pdo->query("SELECT record_key, MIN(elapsed_ms) AS best FROM puzzle_games WHERE status='done' AND elapsed_ms>0 GROUP BY record_key") as $r) { $records[(string) $r['record_key']] = (int) $r['best']; }
    return ['base' => $base, 'games' => $games, 'history' => $history, 'records' => $records ?: new stdClass()];
}

function puzzle_get(PDO $pdo, string $uid): array
{
    $r = puzzle_table_exists($pdo) ? puzzle_row($pdo, puzzle_uid($uid)) : null;
    if (!$r) { throw new RuntimeException('Partie de puzzle introuvable dans cette généalogie.'); }
    return ['game' => puzzle_out($r, true)];
}

/** Enregistre une partie en cours (création ou suite). Un envoi plus ancien que le dernier reçu est ignoré. */
function puzzle_save(PDO $pdo, array $data): array
{
    $uid = puzzle_uid($data['uid'] ?? null);
    $ts = puzzle_int($data['saved_at'] ?? 0, 0, 32503680000000);
    puzzle_ensure($pdo);
    $old = puzzle_row($pdo, $uid);
    if ($old && $old['status'] === 'done') { return ['ok' => true, 'ignored' => 'done', 'uid' => $uid]; }
    if ($old && $ts && $ts < (int) $old['client_ts']) { return ['ok' => true, 'ignored' => 'older', 'uid' => $uid, 'saved_at' => (int) $old['client_ts']]; }
    if (!$old && (int) $pdo->query("SELECT count(*) FROM puzzle_games WHERE status='playing'")->fetchColumn() >= PUZZLE_MAX_PLAYING) {
        throw new RuntimeException('Les ' . PUZZLE_MAX_PLAYING . ' puzzles en cours sont gardés : termine ou supprime-en un pour en commencer un autre.');
    }
    $meta = puzzle_clean_meta($data['meta'] ?? null, $old ? (json_decode((string) $old['meta_json'], true) ?: []) + ['name' => $old['name']] : []);
    $n = (int) $meta['cols'] * (int) $meta['rows'];
    $stateJson = $old ? (string) $old['state_json'] : '';
    if (array_key_exists('state', $data) && $data['state'] !== null) {
        $state = puzzle_clean_state($data['state'], $n);
        $stateJson = json_encode($state, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $meta['placed'] = array_sum($state['lk']);
    }
    if ($stateJson === '') { throw new RuntimeException('Pièces du puzzle absentes.'); }
    $name = (string) $meta['name']; unset($meta['name'], $meta['id'], $meta['time'], $meta['finishedAt']);
    $metaJson = json_encode($meta, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    if (strlen($metaJson) + strlen($stateJson) > PUZZLE_MAX_BYTES) { throw new RuntimeException('Partie trop grosse pour être enregistrée (2 Mo au plus).'); }
    $vals = [$name, $metaJson, $stateJson, $n, (int) $meta['placed'], (int) $meta['elapsed'], puzzle_record_key($meta), $ts];
    if ($old) {
        $pdo->prepare("UPDATE puzzle_games SET name=?, meta_json=?, state_json=?, pieces=?, placed=?, elapsed_ms=?, record_key=?, client_ts=?, updated_at=CURRENT_TIMESTAMP WHERE uid=? AND status='playing'")->execute([...$vals, $uid]);
    } else {
        $pdo->prepare("INSERT INTO puzzle_games(name, meta_json, state_json, pieces, placed, elapsed_ms, record_key, client_ts, uid, status) VALUES(?,?,?,?,?,?,?,?,?,'playing')")->execute([...$vals, $uid]);
    }
    return ['ok' => true, 'uid' => $uid, 'saved_at' => $ts, 'placed' => (int) $meta['placed'], 'elapsed' => (int) $meta['elapsed']];
}

/** Partie terminée : le temps final, les pièces ne sont plus gardées (toutes à leur place), record comparé. */
function puzzle_finish(PDO $pdo, array $data): array
{
    $uid = puzzle_uid($data['uid'] ?? null);
    puzzle_ensure($pdo);
    $old = puzzle_row($pdo, $uid);
    if ($old && $old['status'] === 'done') { return ['ok' => true, 'uid' => $uid, 'already' => true]; }
    $meta = puzzle_clean_meta($data['meta'] ?? null, $old ? (json_decode((string) $old['meta_json'], true) ?: []) + ['name' => $old['name']] : []);
    $time = puzzle_int($data['time'] ?? ($meta['elapsed'] ?? 0), 0, 315576000000);
    $n = (int) $meta['cols'] * (int) $meta['rows'];
    $meta['elapsed'] = $time; $meta['placed'] = $n;
    $key = puzzle_record_key($meta);
    $s = $pdo->prepare("SELECT MIN(elapsed_ms) FROM puzzle_games WHERE status='done' AND record_key=? AND elapsed_ms>0"); $s->execute([$key]);
    $before = (int) $s->fetchColumn();
    $name = (string) $meta['name']; unset($meta['name'], $meta['id'], $meta['time'], $meta['finishedAt']);
    $metaJson = json_encode($meta, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    if (strlen($metaJson) > PUZZLE_MAX_BYTES) { throw new RuntimeException('Partie trop grosse pour être enregistrée (2 Mo au plus).'); }
    $vals = [$name, $metaJson, $n, $n, $time, $key, puzzle_int($data['saved_at'] ?? 0, 0, 32503680000000)];
    if ($old) {
        $pdo->prepare("UPDATE puzzle_games SET status='done', name=?, meta_json=?, state_json='', pieces=?, placed=?, elapsed_ms=?, record_key=?, client_ts=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE uid=?")->execute([...$vals, $uid]);
    } else {
        $pdo->prepare("INSERT INTO puzzle_games(name, meta_json, state_json, pieces, placed, elapsed_ms, record_key, client_ts, uid, status, finished_at) VALUES(?,?,'',?,?,?,?,?,?,'done',CURRENT_TIMESTAMP)")->execute([...$vals, $uid]);
    }
    // les plus anciennes parties terminées partent au-delà de PUZZLE_MAX_DONE (les records restent dans les plus récentes)
    $pdo->exec("DELETE FROM puzzle_games WHERE status='done' AND id NOT IN (SELECT id FROM puzzle_games WHERE status='done' ORDER BY finished_at DESC, id DESC LIMIT " . PUZZLE_MAX_DONE . ')');
    return ['ok' => true, 'uid' => $uid, 'time' => $time, 'record_before' => $before, 'best' => !$before || $time < $before];
}

function puzzle_delete(PDO $pdo, array $data): array
{
    $uid = puzzle_uid($data['uid'] ?? null);
    if (!puzzle_table_exists($pdo)) { return ['ok' => true, 'deleted' => 0]; }
    $s = $pdo->prepare('DELETE FROM puzzle_games WHERE uid=?'); $s->execute([$uid]);
    return ['ok' => true, 'deleted' => $s->rowCount()];
}

/** Aiguillage depuis api.php (après verify_csrf et kiosk_guard). */
function puzzle_dispatch(PDO $pdo, string $action, bool $isWrite, array $payload): never
{
    try {
        if (!$isWrite && $action === 'puzzle') {
            $uid = scalar_text($_GET['uid'] ?? '', 'uid');
            json_response($uid !== '' ? puzzle_get($pdo, $uid) : puzzle_list($pdo));
        }
        if ($isWrite && $action === 'puzzle_write') {
            $op = scalar_text($payload['op'] ?? '', 'op');
            $pdo->beginTransaction();
            try {
                $out = match ($op) {
                    'save' => puzzle_save($pdo, $payload),
                    'finish' => puzzle_finish($pdo, $payload),
                    'delete' => puzzle_delete($pdo, $payload),
                    default => throw new RuntimeException('Opération de puzzle inconnue.'),
                };
                $pdo->commit();
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) { $pdo->rollBack(); }
                throw $e;
            }
            json_response($out);
        }
        json_response(['error' => 'Action de puzzle inconnue.'], 400);
    } catch (JsonException $e) {
        json_response(['error' => 'Partie de puzzle illisible.'], 422);
    } catch (RuntimeException $e) {
        json_response(['error' => $e->getMessage()], str_contains($e->getMessage(), 'introuvable') ? 404 : 422);
    }
}
