<?php
declare(strict_types=1);

/**
 * ＋ Mes listes (Listes → 🧰 Données → « ＋ Créer ma liste ») : une liste faite avec des données qu'on importe soi-même
 * (fichier CSV, TSV, XLSX, ODS, JSON, tableau collé, adresse d'un fichier). Écran : assets/js/app-listes-perso.js.
 * Les lignes sont gardées DANS LA BASE (donc dans ses sauvegardes) ; rien ne part sur Internet.
 *
 *   GET  ulist_index                     → {lists: [{id, name, icon, grp, source, licence, source_url, columns, row_count, ver, prev_ver, updated_at}]}
 *   GET  ulist_rows&id=&offset=&limit=   → {rows: [{_r, c0: …}], total, places: {valeur: [insee, nom, lat, lon, département]}} (places : au début seulement)
 *   POST ulist_write {op, …}
 *        places {values}                      → {places}   (les communes reconnues : nom, « Tulle (19) », « Tulle, Corrèze », code Insee)
 *        create {name, icon, source, licence, source_url, columns} → {id, stage}   (la liste n'apparaît qu'au « commit »)
 *        begin {id, mode: replace|merge}      → {stage}     (merge : les lignes actuelles sont recopiées dans la nouvelle version)
 *        append {id, stage, rows}             → {count}     (5 000 lignes par envoi ; 500 000 au plus)
 *        commit {id, stage, columns?}         → {row_count} ; revert {id} : ↶ revient à la version d'avant (remplacer / fusionner)
 *        abort {id, stage}                    → les lignes envoyées sont oubliées (et la liste, si elle n'était pas finie)
 *        meta {id, name, icon, source, licence, source_url, columns} → {before}   (↶ : renvoyer before)
 *        add_rows {id, rows} → {batch} ; remove_batch {id, batch} (↶) ; delete {id} (mise de côté) ; restore {id} (↶)
 * Tables ulist_lists, ulist_rows : créées à la première lecture ou écriture (rejouable : CREATE … IF NOT EXISTS).
 * Mode consultation : écritures refusées par kiosk_guard (api.php) ; jeton CSRF vérifié par api.php.
 * Essai : tests/test-listes-perso.js
 */

const ULIST_MAX_ROWS = 500000;
const ULIST_MAX_CHUNK = 5000;
const ULIST_MAX_COLS = 200;
const ULIST_MAX_CELL = 5000;
const ULIST_MAX_LISTS = 500;
const ULIST_TYPES = ['text', 'enum', 'number', 'date', 'year', 'place', 'lat', 'lon', 'url', 'person'];

function ulist_t(string $s, array $v = []): string
{
    $t = function_exists('i18n_t') ? i18n_t($s) : $s;
    foreach ($v as $k => $x) { $t = str_replace('{' . $k . '}', (string) $x, $t); }
    return $t;
}

function ulist_ensure(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    $pdo->exec("CREATE TABLE IF NOT EXISTS ulist_lists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL DEFAULT '',
        icon TEXT NOT NULL DEFAULT '📋',
        grp TEXT NOT NULL DEFAULT 'Mes listes',
        source TEXT NOT NULL DEFAULT '',
        licence TEXT NOT NULL DEFAULT '',
        source_url TEXT NOT NULL DEFAULT '',
        columns_json TEXT NOT NULL DEFAULT '[]',
        ver INTEGER NOT NULL DEFAULT 0,
        prev_ver INTEGER,
        ready INTEGER NOT NULL DEFAULT 0,
        row_count INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS ulist_rows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        list_id INTEGER NOT NULL,
        ver INTEGER NOT NULL DEFAULT 0,
        batch TEXT NOT NULL DEFAULT '',
        data_json TEXT NOT NULL DEFAULT '{}'
    )");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_ulist_rows_list ON ulist_rows(list_id, ver, id)');
    $done = true;
}

function ulist_str(mixed $v, int $max): string
{
    $s = is_scalar($v) ? (string) $v : '';
    $s = (string) preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $s);
    if (!mb_check_encoding($s, 'UTF-8')) { $s = mb_convert_encoding($s, 'UTF-8', 'UTF-8'); }
    return mb_substr(trim($s), 0, $max);
}

function ulist_url(mixed $v): string
{
    $u = ulist_str($v, 1000);
    return preg_match('#^https?://[^\s<>"]+$#i', $u) ? $u : '';
}

/** les colonnes envoyées par la page, nettoyées : [{key, label, type, hidden}] */
function ulist_columns(mixed $cols): array
{
    if (!is_array($cols)) { throw new LcndaBadInput(ulist_t('Colonnes manquantes.')); }
    $out = []; $seen = [];
    foreach (array_values($cols) as $c) {
        if (!is_array($c)) { continue; }
        $key = (string) preg_replace('/[^a-z0-9_]/', '', strtolower((string) ($c['key'] ?? '')));
        if ($key === '' || $key[0] === '_' || isset($seen[$key])) { continue; }
        $seen[$key] = true;
        $type = in_array($c['type'] ?? '', ULIST_TYPES, true) ? (string) $c['type'] : 'text';
        $out[] = ['key' => $key, 'label' => ulist_str($c['label'] ?? $key, 120) ?: $key, 'type' => $type, 'hidden' => !empty($c['hidden'])];
        if (count($out) >= ULIST_MAX_COLS) { break; }
    }
    if (!$out) { throw new LcndaBadInput(ulist_t('Il faut au moins une colonne.')); }
    return $out;
}

function ulist_get_list(PDO $pdo, int $id, bool $withDeleted = false): array
{
    $s = $pdo->prepare('SELECT * FROM ulist_lists WHERE id = ?' . ($withDeleted ? '' : ' AND deleted_at IS NULL')); $s->execute([$id]);
    $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { throw new LcndaBadInput(ulist_t('Liste introuvable.')); }
    return $r;
}

function ulist_public(array $r): array
{
    $cols = json_decode((string) $r['columns_json'], true);
    return ['id' => (int) $r['id'], 'name' => (string) $r['name'], 'icon' => (string) $r['icon'], 'grp' => (string) $r['grp'], 'source' => (string) $r['source'],
        'licence' => (string) $r['licence'], 'source_url' => (string) $r['source_url'], 'columns' => is_array($cols) ? $cols : [], 'row_count' => (int) $r['row_count'],
        'ver' => (int) $r['ver'], 'prev_ver' => $r['prev_ver'] === null ? null : (int) $r['prev_ver'], 'updated_at' => (string) $r['updated_at']];
}

function ulist_index(PDO $pdo): array
{
    ulist_ensure($pdo);
    // les listes mises de côté depuis plus de 30 jours, et les envois jamais finis depuis plus d'un jour, sont effacés pour de bon
    foreach ($pdo->query("SELECT id FROM ulist_lists WHERE (deleted_at IS NOT NULL AND deleted_at < datetime('now','-30 days')) OR (ready = 0 AND created_at < datetime('now','-1 day'))")->fetchAll(PDO::FETCH_COLUMN) as $old) {
        $pdo->prepare('DELETE FROM ulist_rows WHERE list_id = ?')->execute([(int) $old]);
        $pdo->prepare('DELETE FROM ulist_lists WHERE id = ?')->execute([(int) $old]);
    }
    $rows = $pdo->query('SELECT * FROM ulist_lists WHERE ready = 1 AND deleted_at IS NULL ORDER BY name COLLATE NOCASE, id')->fetchAll(PDO::FETCH_ASSOC);
    return ['lists' => array_map('ulist_public', $rows)];
}

function ulist_rows(PDO $pdo, array $g): array
{
    ulist_ensure($pdo);
    $l = ulist_get_list($pdo, safe_int($g['id'] ?? 0));
    $offset = max(0, safe_int($g['offset'] ?? 0)); $limit = max(1, min(50000, safe_int($g['limit'] ?? 20000, 20000)));
    $s = $pdo->prepare('SELECT id, data_json FROM ulist_rows WHERE list_id = ? AND ver = ? ORDER BY id LIMIT ' . $limit . ' OFFSET ' . $offset);
    $s->execute([(int) $l['id'], (int) $l['ver']]);
    $rows = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { $d = json_decode((string) $r['data_json'], true); $rows[] = (is_array($d) ? $d : []) + ['_r' => (int) $r['id']]; }
    $out = ['rows' => $rows, 'total' => (int) $l['row_count']];
    if ($offset === 0) { // les communes des colonnes « lieu » (toute la liste, une fois)
        $placeKeys = array_values(array_map(static fn($c) => $c['key'], array_filter(json_decode((string) $l['columns_json'], true) ?: [], static fn($c) => ($c['type'] ?? '') === 'place')));
        $vals = [];
        if ($placeKeys) {
            $q = $pdo->prepare('SELECT data_json FROM ulist_rows WHERE list_id = ? AND ver = ?'); $q->execute([(int) $l['id'], (int) $l['ver']]);
            while (($dj = $q->fetchColumn()) !== false) { $d = json_decode((string) $dj, true); foreach ($placeKeys as $k) { $v = trim((string) ($d[$k] ?? '')); if ($v !== '' && count($vals) < 40000) { $vals[$v] = true; } } }
        }
        $out['places'] = (object) ulist_places($pdo, array_keys($vals));
    }
    return $out;
}

/* ═════════════ les communes : un nom (accents, majuscules, tirets ignorés), « Tulle (19) », « Tulle, Corrèze », un code Insee ═════════════ */
function ulist_fold(string $s): string
{
    $s = function_exists('ascii_fold') ? ascii_fold($s) : strtolower($s);
    $s = strtolower(trim((string) preg_replace('/[^a-z0-9]+/i', ' ', $s)));
    return (string) preg_replace(['/^st /', '/^ste /', '/ st /', '/ ste /'], ['saint ', 'sainte ', ' saint ', ' sainte '], $s);
}

function ulist_place_index(PDO $pdo): array
{
    static $idx = null;
    if ($idx !== null) { return $idx; }
    $idx = ['name' => [], 'insee' => []];
    try {
        $s = $pdo->query("SELECT name, COALESCE(admin4_code,'') AS insee, COALESCE(admin2_code,'') AS a2, COALESCE(county,'') AS county, latitude, longitude, COALESCE(population,0) AS pop
            FROM places WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND name <> ''");
        while ($r = $s->fetch(PDO::FETCH_NUM)) {
            $e = [(string) $r[1], (string) $r[0], (float) $r[4], (float) $r[5], (string) $r[3], (string) $r[2], (int) $r[6]];
            $idx['name'][ulist_fold((string) $r[0])][] = $e;
            if (preg_match('/^\d[\dAB]\d{3}$/', $e[0])) { $idx['insee'][$e[0]] ??= $e; }
        }
    } catch (Throwable) { /* base sans lieux */ }
    return $idx;
}

/** @return array<string, array{0:string,1:string,2:float,3:float,4:string}> */
function ulist_places(PDO $pdo, array $values): array
{
    $idx = ulist_place_index($pdo); $out = [];
    foreach (array_slice($values, 0, 40000) as $v) {
        $v = ulist_str($v, 200); if ($v === '' || isset($out[$v])) { continue; }
        if (preg_match('/^\d[\dAB]\d{3}$/', $v)) { if (isset($idx['insee'][$v])) { $out[$v] = array_slice($idx['insee'][$v], 0, 5); } continue; }
        $name = $v; $hint = '';
        if (preg_match('/^(.+?)\s*\(([^)]+)\)\s*$/u', $v, $m)) { $name = $m[1]; $hint = $m[2]; }
        elseif (preg_match('/^(.+?)\s*,\s*(.+)$/u', $v, $m)) { $name = $m[1]; $hint = (string) preg_replace('/\s*,.*$/u', '', $m[2]); }
        elseif (preg_match('/^(.+?)\s+-\s+(\d[\dAB]?\d?)$/u', $v, $m)) { $name = $m[1]; $hint = $m[2]; }
        $cands = $idx['name'][ulist_fold($name)] ?? [];
        if (!$cands) { continue; }
        if ($hint !== '') {
            $h = ulist_fold($hint);
            $f = array_values(array_filter($cands, static fn($c) => $c[5] === $hint || ltrim($c[5], '0') === ltrim($hint, '0') || ulist_fold($c[4]) === $h || ($c[0] !== '' && str_starts_with($c[0], $hint))));
            if ($f) { $cands = $f; }
        }
        usort($cands, static fn($a, $b) => [($b[0] !== '' ? 1 : 0), $b[6]] <=> [($a[0] !== '' ? 1 : 0), $a[6]]);
        $out[$v] = array_slice($cands[0], 0, 5);
    }
    return $out;
}

/* ═════════════ écrire ═════════════ */
function ulist_clean_row(mixed $r, array $keys): ?array
{
    if (!is_array($r)) { return null; }
    $o = []; $any = false;
    foreach ($keys as $k) {
        $v = ulist_str($r[$k] ?? '', ULIST_MAX_CELL);
        if ($v !== '') { $o[$k] = $v; $any = true; }
    }
    return $any ? $o : null;
}

function ulist_keys_of(PDO $pdo, int $id, mixed $cols = null): array
{
    if ($cols !== null) { return array_map(static fn($c) => $c['key'], ulist_columns($cols)); }
    $l = ulist_get_list($pdo, $id, true);
    return array_map(static fn($c) => (string) $c['key'], json_decode((string) $l['columns_json'], true) ?: []);
}

function ulist_insert_rows(PDO $pdo, int $id, int $ver, array $rows, array $keys, string $batch = ''): int
{
    if (count($rows) > ULIST_MAX_CHUNK) { throw new LcndaBadInput(ulist_t('Trop de lignes d’un coup.')); }
    $c = $pdo->prepare('SELECT COUNT(*) FROM ulist_rows WHERE list_id = ? AND ver = ?'); $c->execute([$id, $ver]);
    $have = (int) $c->fetchColumn();
    $ins = $pdo->prepare('INSERT INTO ulist_rows(list_id, ver, batch, data_json) VALUES(?,?,?,?)'); $n = 0;
    foreach ($rows as $r) {
        $o = ulist_clean_row($r, $keys); if ($o === null) { continue; }
        if ($have + $n >= ULIST_MAX_ROWS) { throw new LcndaBadInput(ulist_t('Trop de lignes : {n} au plus dans une liste.', ['n' => number_format(ULIST_MAX_ROWS, 0, ',', ' ')])); }
        $ins->execute([$id, $ver, $batch, json_encode($o, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE)]); $n++;
    }
    return $n;
}

function ulist_meta_of(array $d): array
{
    $icon = ulist_str($d['icon'] ?? '', 16);
    return ['name' => ulist_str($d['name'] ?? '', 120) ?: ulist_t('Ma liste'), 'icon' => $icon !== '' ? $icon : '📋', 'source' => ulist_str($d['source'] ?? '', 300),
        'licence' => ulist_str($d['licence'] ?? '', 120), 'source_url' => ulist_url($d['source_url'] ?? '')];
}

function ulist_count(PDO $pdo, int $id, int $ver): int
{
    $c = $pdo->prepare('SELECT COUNT(*) FROM ulist_rows WHERE list_id = ? AND ver = ?'); $c->execute([$id, $ver]); return (int) $c->fetchColumn();
}

function ulist_api_post(PDO $pdo, array $d): array
{
    ulist_ensure($pdo);
    $op = (string) ($d['op'] ?? ''); $id = safe_int($d['id'] ?? 0);
    if ($op === 'places') { return ['places' => (object) ulist_places($pdo, array_values(array_filter(is_array($d['values'] ?? null) ? $d['values'] : [], 'is_scalar')))]; }
    $pdo->beginTransaction();
    try {
        $out = match ($op) {
            'create' => (static function () use ($pdo, $d) {
                if ((int) $pdo->query('SELECT COUNT(*) FROM ulist_lists WHERE deleted_at IS NULL')->fetchColumn() >= ULIST_MAX_LISTS) { throw new LcndaBadInput(ulist_t('Trop de listes : {n} au plus.', ['n' => ULIST_MAX_LISTS])); }
                $m = ulist_meta_of($d); $cols = ulist_columns($d['columns'] ?? null);
                $pdo->prepare('INSERT INTO ulist_lists(name, icon, source, licence, source_url, columns_json, ver, ready) VALUES(?,?,?,?,?,?,0,0)')
                    ->execute([$m['name'], $m['icon'], $m['source'], $m['licence'], $m['source_url'], json_encode($cols, JSON_UNESCAPED_UNICODE)]);
                return ['id' => (int) $pdo->lastInsertId(), 'stage' => 1];
            })(),
            'begin' => (static function () use ($pdo, $d, $id) {
                $l = ulist_get_list($pdo, $id); $stage = (int) $pdo->query('SELECT COALESCE(MAX(ver),0) FROM ulist_rows WHERE list_id = ' . $id)->fetchColumn();
                $stage = max($stage, (int) $l['ver']) + 1;
                if (($d['mode'] ?? '') === 'merge') { $pdo->prepare("INSERT INTO ulist_rows(list_id, ver, batch, data_json) SELECT list_id, ?, '', data_json FROM ulist_rows WHERE list_id = ? AND ver = ? ORDER BY id")->execute([$stage, $id, (int) $l['ver']]); }
                return ['stage' => $stage];
            })(),
            'append' => (static function () use ($pdo, $d, $id) {
                $l = ulist_get_list($pdo, $id); $stage = safe_int($d['stage'] ?? 0);
                if ($stage <= (int) $l['ver']) { throw new LcndaBadInput(ulist_t('Envoi périmé : recommence.')); }
                $keys = ulist_keys_of($pdo, $id, $d['columns'] ?? null);
                return ['count' => ulist_insert_rows($pdo, $id, $stage, is_array($d['rows'] ?? null) ? array_values($d['rows']) : [], $keys)];
            })(),
            'commit' => (static function () use ($pdo, $d, $id) {
                $l = ulist_get_list($pdo, $id); $stage = safe_int($d['stage'] ?? 0);
                if ($stage <= (int) $l['ver']) { throw new LcndaBadInput(ulist_t('Envoi périmé : recommence.')); }
                $n = ulist_count($pdo, $id, $stage);
                $cols = isset($d['columns']) ? json_encode(ulist_columns($d['columns']), JSON_UNESCAPED_UNICODE) : (string) $l['columns_json'];
                $prev = (int) $l['ready'] ? (int) $l['ver'] : null;
                $prevCols = (string) $l['columns_json'];
                $pdo->prepare("UPDATE ulist_lists SET ver = ?, prev_ver = ?, ready = 1, row_count = ?, columns_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")->execute([$stage, $prev, $n, $cols, $id]);
                $pdo->prepare('DELETE FROM ulist_rows WHERE list_id = ? AND ver NOT IN (?, ?)')->execute([$id, $stage, $prev ?? -1]);
                return ['row_count' => $n, 'prev_columns' => json_decode($prevCols, true)];
            })(),
            'revert' => (static function () use ($pdo, $d, $id) {
                $l = ulist_get_list($pdo, $id);
                if ($l['prev_ver'] === null) { throw new LcndaBadInput(ulist_t('Rien à annuler.')); }
                $prev = (int) $l['prev_ver']; $n = ulist_count($pdo, $id, $prev);
                $cols = isset($d['columns']) ? json_encode(ulist_columns($d['columns']), JSON_UNESCAPED_UNICODE) : (string) $l['columns_json'];
                $pdo->prepare('UPDATE ulist_lists SET ver = ?, prev_ver = NULL, row_count = ?, columns_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')->execute([$prev, $n, $cols, $id]);
                $pdo->prepare('DELETE FROM ulist_rows WHERE list_id = ? AND ver <> ?')->execute([$id, $prev]);
                return ['row_count' => $n];
            })(),
            'abort' => (static function () use ($pdo, $d, $id) {
                $l = ulist_get_list($pdo, $id, true); $stage = safe_int($d['stage'] ?? 0);
                if ($stage > (int) $l['ver']) { $pdo->prepare('DELETE FROM ulist_rows WHERE list_id = ? AND ver = ?')->execute([$id, $stage]); }
                if (!(int) $l['ready']) { $pdo->prepare('DELETE FROM ulist_rows WHERE list_id = ?')->execute([$id]); $pdo->prepare('DELETE FROM ulist_lists WHERE id = ?')->execute([$id]); }
                return ['ok' => true];
            })(),
            'meta' => (static function () use ($pdo, $d, $id) {
                $l = ulist_get_list($pdo, $id); $before = ulist_public($l);
                $m = ulist_meta_of($d + ['name' => $l['name'], 'icon' => $l['icon']]);
                $cols = isset($d['columns']) ? json_encode(ulist_columns($d['columns']), JSON_UNESCAPED_UNICODE) : (string) $l['columns_json'];
                $pdo->prepare('UPDATE ulist_lists SET name = ?, icon = ?, source = ?, licence = ?, source_url = ?, columns_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                    ->execute([$m['name'], $m['icon'], array_key_exists('source', $d) ? $m['source'] : $l['source'], array_key_exists('licence', $d) ? $m['licence'] : $l['licence'], array_key_exists('source_url', $d) ? $m['source_url'] : $l['source_url'], $cols, $id]);
                return ['before' => $before];
            })(),
            'add_rows' => (static function () use ($pdo, $d, $id) {
                $l = ulist_get_list($pdo, $id); $batch = 'b' . bin2hex(random_bytes(6));
                $n = ulist_insert_rows($pdo, $id, (int) $l['ver'], is_array($d['rows'] ?? null) ? array_values($d['rows']) : [], ulist_keys_of($pdo, $id), $batch);
                $pdo->prepare('UPDATE ulist_lists SET row_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')->execute([ulist_count($pdo, $id, (int) $l['ver']), $id]);
                return ['batch' => $batch, 'count' => $n];
            })(),
            'remove_batch' => (static function () use ($pdo, $d, $id) {
                $l = ulist_get_list($pdo, $id); $b = ulist_str($d['batch'] ?? '', 40);
                if ($b === '') { throw new LcndaBadInput(ulist_t('Rien à annuler.')); }
                $pdo->prepare('DELETE FROM ulist_rows WHERE list_id = ? AND batch = ?')->execute([$id, $b]);
                $pdo->prepare('UPDATE ulist_lists SET row_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')->execute([ulist_count($pdo, $id, (int) $l['ver']), $id]);
                return ['ok' => true];
            })(),
            'delete' => (static function () use ($pdo, $id) {
                ulist_get_list($pdo, $id);
                $pdo->prepare('UPDATE ulist_lists SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?')->execute([$id]);
                return ['ok' => true];
            })(),
            'restore' => (static function () use ($pdo, $id) {
                ulist_get_list($pdo, $id, true);
                $pdo->prepare('UPDATE ulist_lists SET deleted_at = NULL WHERE id = ?')->execute([$id]);
                return ['ok' => true];
            })(),
            default => throw new LcndaBadInput(ulist_t('Opération inconnue.')),
        };
        $pdo->commit();
        return $out;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        throw $e;
    }
}

function ulist_api_get(PDO $pdo, string $action, array $g): array
{
    return match ($action) {
        'ulist_index' => ulist_index($pdo),
        'ulist_rows' => ulist_rows($pdo, $g),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
