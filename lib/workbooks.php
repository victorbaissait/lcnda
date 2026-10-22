<?php
declare(strict_types=1);

/**
 * 🧮 Tableur (interface : assets/js/heritage-tableur.js ; moteur commun : assets/js/app-tableur-engine.js) :
 * les classeurs (plusieurs feuilles, formules, mise en forme, validation…) gardés en JSON dans la table workbooks
 * (migration schema_v50). kind = 'book' (un classeur) ou 'template' (« Mes modèles »).
 * Le serveur ne calcule rien : il vérifie la forme et la taille, et tient un petit résumé (info) pour la liste.
 */

const WORKBOOK_MAX = 40000000;   // octets de JSON (≈ 10 000 lignes × 30 colonnes et leurs formules, largement)
const WORKBOOK_SHEETS_MAX = 200;

function workbook_ready(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    // ancienne base qui n'aurait pas encore la migration (copie ouverte à part) : même table que schema_v50
    $pdo->exec("CREATE TABLE IF NOT EXISTS workbooks (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'book' CHECK(kind IN ('book','template')),
        data_json TEXT NOT NULL DEFAULT '{}', info_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $done = true;
}

/** « B12 » → [ligne (0…), colonne (0…)] ; null si ce n'est pas une adresse */
function workbook_addr(string $k): ?array
{
    if (!preg_match('/^([A-Z]{1,3})([1-9]\d{0,6})$/', $k, $m)) { return null; }
    $c = 0;
    foreach (str_split($m[1]) as $ch) { $c = $c * 26 + (ord($ch) - 64); }
    return [(int) $m[2] - 1, $c - 1];
}

/** le classeur reçu : forme vérifiée (feuilles, cellules, styles), tailles bornées ; renvoie [données nettoyées, résumé] */
function workbook_check(mixed $data): array
{
    if (!is_array($data) || !isset($data['sheets']) || !is_array($data['sheets']) || !array_is_list($data['sheets'])) {
        throw new RuntimeException('Classeur illisible : il manque ses feuilles.');
    }
    if (count($data['sheets']) < 1 || count($data['sheets']) > WORKBOOK_SHEETS_MAX) {
        throw new RuntimeException('Un classeur a de 1 à ' . WORKBOOK_SHEETS_MAX . ' feuilles.');
    }
    $sheets = []; $rows = 0; $cells = 0; $names = []; $preview = [];
    foreach ($data['sheets'] as $i => $sh) {
        if (!is_array($sh)) { throw new RuntimeException('Feuille illisible.'); }
        $name = mb_substr(trim(preg_replace('/[\[\]*?:\/\\\\]/u', ' ', (string) ($sh['name'] ?? '')) ?? ''), 0, 100);
        if ($name === '') { $name = 'Feuille ' . ($i + 1); }
        $cellsIn = $sh['cells'] ?? [];
        if (!is_array($cellsIn)) { $cellsIn = []; }
        $clean = []; $maxR = 0;
        foreach ($cellsIn as $k => $v) {
            $p = workbook_addr((string) $k);
            if (!$p) { continue; }
            if (is_array($v)) {
                $val = $v['v'] ?? null;
                if (!(is_null($val) || is_string($val) || is_int($val) || is_float($val) || is_bool($val))) { $val = null; }
                if (is_string($val) && mb_strlen($val) > 32767) { $val = mb_substr($val, 0, 32767); }
                $o = ['v' => $val];
                if (isset($v['s']) && is_int($v['s']) && $v['s'] > 0 && $v['s'] < 5000) { $o['s'] = $v['s']; }
                if (isset($v['ref']) && is_array($v['ref']) && in_array($v['ref']['kind'] ?? '', ['person', 'place', 'source'], true) && (int) ($v['ref']['id'] ?? 0) > 0) { $o['ref'] = ['kind' => $v['ref']['kind'], 'id' => (int) $v['ref']['id']]; }
                if (isset($v['note']) && is_string($v['note']) && $v['note'] !== '') { $o['note'] = mb_substr($v['note'], 0, 2000); }
                $clean[$k] = $o;
            } elseif (is_string($v) || is_int($v) || is_float($v) || is_bool($v)) {
                $clean[$k] = is_string($v) && mb_strlen($v) > 32767 ? mb_substr($v, 0, 32767) : $v;
            } else { continue; }
            if (++$cells > 2000000) { throw new RuntimeException('Classeur trop grand : plus de 2 millions de cellules.'); }
            $maxR = max($maxR, $p[0] + 1);
            if ($i === 0 && $p[0] < 3 && $p[1] < 3) {
                $raw = is_array($clean[$k]) ? $clean[$k]['v'] : $clean[$k];
                $preview[$p[0]][$p[1]] = is_string($raw) ? (str_starts_with($raw, '=') ? '' : mb_substr(ltrim($raw, "'"), 0, 30)) : (is_bool($raw) ? ($raw ? 'VRAI' : 'FAUX') : $raw);
            }
        }
        $out = ['id' => preg_match('/^[\w-]{1,30}$/', (string) ($sh['id'] ?? '')) ? (string) $sh['id'] : 's' . ($i + 1), 'name' => $name, 'cells' => (object) $clean];
        foreach (['cols', 'rows'] as $key) { $out[$key] = is_array($sh[$key] ?? null) ? (object) array_slice($sh[$key], 0, 200000, true) : new stdClass(); }
        foreach (['merges', 'cf', 'dv'] as $key) { $out[$key] = is_array($sh[$key] ?? null) && array_is_list($sh[$key]) ? array_slice($sh[$key], 0, $key === 'merges' ? 10000 : 60) : []; }
        $fz = is_array($sh['freeze'] ?? null) ? $sh['freeze'] : [];
        $out['freeze'] = ['r' => max(0, min(500, (int) ($fz['r'] ?? 0))), 'c' => max(0, min(100, (int) ($fz['c'] ?? 0)))];
        foreach (['color' => 'string', 'filter' => 'array'] as $key => $type) { if (isset($sh[$key]) && gettype($sh[$key]) === $type) { $out[$key] = $sh[$key]; } }
        if (!empty($sh['hidden'])) { $out['hidden'] = true; }
        if (!empty($sh['zebra'])) { $out['zebra'] = true; }
        $sheets[] = $out; $rows += $maxR; $names[] = $name;
    }
    $styles = is_array($data['styles'] ?? null) && array_is_list($data['styles']) ? array_slice($data['styles'], 0, 5000) : [new stdClass()];
    $clean = ['v' => 1, 'active' => max(0, min(count($sheets) - 1, (int) ($data['active'] ?? 0))), 'styles' => $styles, 'names' => is_array($data['names'] ?? null) ? (object) array_slice($data['names'], 0, 300, true) : new stdClass(), 'sheets' => $sheets];
    $grid = [];
    for ($r = 0; $r < 3; $r++) { $line = []; for ($c = 0; $c < 3; $c++) { $line[] = $preview[$r][$c] ?? ''; } $grid[] = $line; }
    return [$clean, ['sheets' => count($sheets), 'rows' => $rows, 'cells' => $cells, 'names' => array_slice($names, 0, 12), 'preview' => $grid]];
}

function workbooks_list(PDO $pdo, string $kind = 'book'): array
{
    workbook_ready($pdo);
    $s = $pdo->prepare('SELECT id, name, kind, info_json, created_at, updated_at FROM workbooks WHERE kind=? ORDER BY updated_at DESC, id DESC');
    $s->execute([$kind === 'template' ? 'template' : 'book']);
    return array_map(static fn($r) => ['id' => (int) $r['id'], 'name' => (string) $r['name'], 'kind' => (string) $r['kind'], 'created_at' => $r['created_at'], 'updated_at' => $r['updated_at'],
        'info' => json_decode((string) $r['info_json'], true) ?: new stdClass()], $s->fetchAll());
}

function workbook_get(PDO $pdo, int $id): array
{
    workbook_ready($pdo);
    $s = $pdo->prepare('SELECT * FROM workbooks WHERE id=?'); $s->execute([$id]); $r = $s->fetch();
    if (!$r) { throw new RuntimeException('Classeur introuvable.'); }
    return ['id' => (int) $r['id'], 'name' => (string) $r['name'], 'kind' => (string) $r['kind'], 'data' => json_decode((string) $r['data_json'], true) ?: new stdClass(), 'updated_at' => $r['updated_at'], 'created_at' => $r['created_at']];
}

function save_workbook(PDO $pdo, array $data): array
{
    workbook_ready($pdo);
    $id = safe_int($data['id'] ?? 0);
    $name = mb_substr(safe_text($data['name'] ?? ''), 0, 200) ?: 'Mon classeur';
    $kind = ($data['kind'] ?? '') === 'template' ? 'template' : 'book';
    [$clean, $info] = workbook_check($data['data'] ?? null);
    $json = json_encode($clean, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
    if ($json === false || strlen($json) > WORKBOOK_MAX) { throw new RuntimeException('Classeur trop lourd (plus de 40 Mo) : partage-le en plusieurs classeurs.'); }
    $infoJson = json_encode($info, JSON_UNESCAPED_UNICODE) ?: '{}';
    if ($id > 0) {
        $s = $pdo->prepare('UPDATE workbooks SET name=?, kind=?, data_json=?, info_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'); $s->execute([$name, $kind, $json, $infoJson, $id]);
        if (!$s->rowCount()) { throw new RuntimeException('Classeur introuvable.'); }
    } else {
        $pdo->prepare('INSERT INTO workbooks(name, kind, data_json, info_json) VALUES(?,?,?,?)')->execute([$name, $kind, $json, $infoJson]);
        $id = (int) $pdo->lastInsertId();
    }
    log_change($pdo, 'meta', 0, 'update', ($kind === 'template' ? 'Modèle de classeur enregistré : ' : 'Classeur enregistré : ') . $name);
    $u = $pdo->prepare('SELECT updated_at FROM workbooks WHERE id=?'); $u->execute([$id]);
    return ['id' => $id, 'updated_at' => $u->fetchColumn()];
}

function rename_workbook(PDO $pdo, array $data): array
{
    workbook_ready($pdo);
    $id = safe_int($data['id'] ?? 0); $name = mb_substr(safe_text($data['name'] ?? ''), 0, 200);
    if ($id <= 0 || $name === '') { throw new RuntimeException('Nom manquant.'); }
    $s = $pdo->prepare('UPDATE workbooks SET name=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'); $s->execute([$name, $id]);
    if (!$s->rowCount()) { throw new RuntimeException('Classeur introuvable.'); }
    return ['id' => $id];
}

/** supprime et rend le classeur entier (l'écran peut le remettre avec « ↶ Annuler ») */
function delete_workbook(PDO $pdo, array $data): array
{
    workbook_ready($pdo);
    $id = safe_int($data['id'] ?? 0);
    $old = workbook_get($pdo, $id);
    $pdo->prepare('DELETE FROM workbooks WHERE id=?')->execute([$id]);
    log_change($pdo, 'meta', 0, 'delete', 'Classeur supprimé : ' . $old['name']);
    return ['id' => $id, 'workbook' => $old];
}

function duplicate_workbook(PDO $pdo, array $data): array
{
    workbook_ready($pdo);
    $old = workbook_get($pdo, safe_int($data['id'] ?? 0));
    $name = mb_substr(safe_text($data['name'] ?? '') ?: ($old['name'] . ' (copie)'), 0, 200);
    $kind = in_array($data['kind'] ?? '', ['book', 'template'], true) ? $data['kind'] : $old['kind'];
    return save_workbook($pdo, ['name' => $name, 'kind' => $kind, 'data' => $old['data']]);
}
