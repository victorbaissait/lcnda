<?php
declare(strict_types=1);

/**
 * 🔎 Recherche et 🛠 Réglages — les outils ajoutés par l'audit des onglets (docs/design/audit-onglets.html, §11, §17, manques transversaux).
 *
 * Recherche (assets/js/app-recherche-outils.js) :
 *  - 🔁 Chercher et remplacer dans les données : prénoms, métiers, lieux, notes, descriptions ; aperçu ligne par ligne,
 *    puis « Remplacer » ; « ↶ Annuler » remet exactement l'ancien texte (seulement là où il n'a pas changé depuis) ;
 *  - 🧬 Recherche par lien de parenté (ancêtres, descendants, frères et sœurs, cousins germains… + vivants, nés après…) ;
 *  - 📊 Comparer deux recherches enregistrées (dans A et pas dans B, dans les deux, dans l'une ou l'autre) ;
 *  - 🧾 Recherche dans les sources et les citations (titre, auteur, texte de la source ; page et note de la citation) ;
 *  - ☑ Agir sur les résultats : étiqueter, ajouter à une de « Mes listes » (+ ↶ Annuler) ;
 *  - 🗑 Supprimer un dépouillement d'archive (ou une personne relevée, une lacune, un acte à commander, une ligne de transcription)
 *    tout de suite, « ↶ Annuler » le remet avec ses personnes, pages, médias liés.
 * Réglages (assets/js/app-maintenance.js) :
 *  - 🗄 Santé de la base : taille de la base et des médias, lignes par table, compacter (VACUUM) ;
 *  - 🔁 Remplacer un lieu par un autre (Modifications groupées) ;
 *  - 🏷 Étiquettes : règles automatiques (« Poilu » à tout homme né entre 1870 et 1900).
 *
 * Toutes les écritures sont journalisées (log_change) et chaque geste de masse garde de quoi revenir en arrière
 * dans la table ro_undo (créée ici, à la demande). Routes : « ro_* » (api.php appelle ro_dispatch()).
 * Essai : tests/test-audit-recherche.js
 */

function ro_ensure(PDO $pdo): void
{
    static $done = false; if ($done) { return; }
    $pdo->exec("CREATE TABLE IF NOT EXISTS ro_undo (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '',
        payload_json TEXT NOT NULL DEFAULT '{}', undone INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS ro_label_rules (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL DEFAULT '', label_id INTEGER NOT NULL,
        criteria_json TEXT NOT NULL DEFAULT '{}', created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)");
    $done = true;
}

/** Les routes « ro_* » : lecture (GET) ou écriture (POST, dans une transaction ; VACUUM hors transaction). */
function ro_dispatch(PDO $pdo, string $action, bool $isWrite, array $data): never
{
    ro_ensure($pdo);
    try {
        if (!$isWrite) {
            $q = $_GET;
            json_response(match ($action) {
                'ro_replace_preview' => ro_replace_preview($pdo, $q),
                'ro_kinship' => ro_kinship($pdo, $q),
                'ro_compare' => ro_compare($pdo, $q),
                'ro_sources' => ro_sources($pdo, $q),
                'ro_db_health' => ro_db_health($pdo),
                'ro_place_replace_preview' => ro_place_replace_preview($pdo, $q),
                'ro_label_rules' => ro_label_rules($pdo),
                'ro_label_rule_preview' => ro_label_rule_preview($pdo, $q),
                default => throw new RuntimeException('Action inconnue'),
            });
        }
        if ($action === 'ro_db_vacuum') { json_response(['ok' => true, 'result' => ro_db_vacuum($pdo)]); }
        $pdo->beginTransaction();
        try {
            $result = match ($action) {
                'ro_replace_apply' => ro_replace_apply($pdo, $data),
                'ro_undo' => ro_undo($pdo, $data),
                'ro_redo' => ro_redo($pdo, $data),
                'ro_people_label' => ro_people_label($pdo, $data),
                'ro_people_to_list' => ro_people_to_list($pdo, $data),
                'ro_digest_trash' => ro_digest_trash($pdo, $data),
                'ro_row_trash' => ro_row_trash($pdo, $data),
                'ro_place_replace_apply' => ro_place_replace_apply($pdo, $data),
                'ro_label_rule_save' => ro_label_rule_save($pdo, $data),
                'ro_label_rule_delete' => ro_label_rule_delete($pdo, $data),
                'ro_label_rule_apply' => ro_label_rule_apply($pdo, $data),
                default => throw new RuntimeException('Action d’écriture inconnue'),
            };
            $pdo->commit();
        } catch (Throwable $e) { if ($pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
        json_response(['ok' => true, 'result' => $result]);
    } catch (Throwable $e) {
        json_response(['error' => function_exists('readable_error_message') ? readable_error_message($e) : $e->getMessage()], 422);
    }
}

/* ═════ ↶ Annuler : ce qu'il faut pour revenir en arrière, gardé en base ═════ */

function ro_undo_save(PDO $pdo, string $kind, string $summary, array $payload): int
{
    $pdo->prepare('INSERT INTO ro_undo(kind, summary, payload_json) VALUES(?,?,?)')->execute([$kind, $summary, json_encode($payload, JSON_UNESCAPED_UNICODE)]);
    return (int) $pdo->lastInsertId();
}

function ro_undo_row(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT * FROM ro_undo WHERE id=?'); $s->execute([$id]);
    $row = $s->fetch(PDO::FETCH_ASSOC);
    if (!$row) { throw new RuntimeException('Rien à annuler.'); }
    $row['payload'] = json_decode((string) $row['payload_json'], true) ?: [];
    return $row;
}

/** « ↶ Annuler » : remet l'avant ; un deuxième clic répond « déjà » (pas une erreur). */
function ro_undo(PDO $pdo, array $data): array
{
    $row = ro_undo_row($pdo, safe_int($data['id'] ?? 0));
    if ((int) $row['undone'] === 1) { return ['already' => true]; }
    $p = $row['payload']; $n = 0;
    switch ($row['kind']) {
        case 'replace':
        case 'place_replace':
            if (!empty($p['deleted_place'])) { $snap = $p['deleted_place']; $ex = $pdo->prepare('SELECT 1 FROM places WHERE id=?'); $ex->execute([(int) $snap['id']]); if (!$ex->fetchColumn()) { insert_snapshot_row($pdo, 'places', $snap); $n++; } } // le lieu d'abord : les lignes pointent vers lui
            foreach (array_reverse($p['changes'] ?? []) as $c) { $n += ro_set_if($pdo, (string) $c['t'], (string) $c['c'], (int) $c['id'], $c['after'], $c['before']); }
            break;
        case 'labels':
            $del = $pdo->prepare("DELETE FROM label_links WHERE label_id=? AND entity_type='person' AND entity_id=?");
            foreach ($p['added'] ?? [] as $pid) { $del->execute([(int) $p['label_id'], (int) $pid]); $n += $del->rowCount(); }
            if (!empty($p['created_label'])) { $c = $pdo->prepare('SELECT count(*) FROM label_links WHERE label_id=?'); $c->execute([(int) $p['label_id']]); if (!(int) $c->fetchColumn()) { $pdo->prepare('DELETE FROM labels WHERE id=?')->execute([(int) $p['label_id']]); } }
            break;
        case 'list_rows':
            foreach ($p['rows'] ?? [] as $r) {
                if ($r['was'] === null) { $pdo->prepare('DELETE FROM custom_list_rows WHERE list_id=? AND row_key=?')->execute([(int) $p['list_id'], (string) $r['key']]); }
                else { $pdo->prepare('UPDATE custom_list_rows SET included=? WHERE list_id=? AND row_key=?')->execute([(int) $r['was'], (int) $p['list_id'], (string) $r['key']]); }
                $n++;
            }
            break;
        case 'snapshot': // une ligne supprimée et ses lignes liées : remises telles quelles
            $n = ro_snapshot_restore($pdo, $p);
            break;
        case 'label_rule_delete':
            $ex = $pdo->prepare('SELECT 1 FROM ro_label_rules WHERE id=?'); $ex->execute([(int) $p['rule']['id']]);
            if (!$ex->fetchColumn()) { insert_snapshot_row($pdo, 'ro_label_rules', $p['rule']); $n = 1; }
            break;
        default: throw new RuntimeException('Rien à annuler.');
    }
    $pdo->prepare('UPDATE ro_undo SET undone=1 WHERE id=?')->execute([(int) $row['id']]);
    log_change($pdo, 'ro_undo', (int) $row['id'], 'restore', 'Annulé : ' . $row['summary'], null, ['count' => $n]);
    return ['undone' => $n, 'kind' => $row['kind']];
}

/** « ↷ Rétablir » après « ↶ Annuler » : refait le même geste (remplacements, étiquettes, liste, suppression). */
function ro_redo(PDO $pdo, array $data): array
{
    $row = ro_undo_row($pdo, safe_int($data['id'] ?? 0));
    if ((int) $row['undone'] !== 1) { return ['already' => true]; }
    $p = $row['payload']; $n = 0;
    switch ($row['kind']) {
        case 'replace':
        case 'place_replace':
            foreach ($p['changes'] ?? [] as $c) { $n += ro_set_if($pdo, (string) $c['t'], (string) $c['c'], (int) $c['id'], $c['before'], $c['after']); }
            if (!empty($p['deleted_place'])) { $pdo->prepare('DELETE FROM places WHERE id=? AND NOT EXISTS (SELECT 1 FROM events WHERE place_id=?)')->execute([(int) $p['deleted_place']['id'], (int) $p['deleted_place']['id']]); }
            break;
        case 'labels':
            if (!empty($p['created_label']) && !empty($p['label_row'])) { $ex = $pdo->prepare('SELECT 1 FROM labels WHERE id=?'); $ex->execute([(int) $p['label_id']]); if (!$ex->fetchColumn()) { insert_snapshot_row($pdo, 'labels', $p['label_row']); } }
            $ins = $pdo->prepare("INSERT OR IGNORE INTO label_links(label_id, entity_type, entity_id) VALUES(?, 'person', ?)");
            foreach ($p['added'] ?? [] as $pid) { $ins->execute([(int) $p['label_id'], (int) $pid]); $n += $ins->rowCount(); }
            break;
        case 'list_rows':
            foreach ($p['rows'] ?? [] as $r) { $pdo->prepare('INSERT OR REPLACE INTO custom_list_rows(list_id, row_key, included, data_json) VALUES(?,?,1,COALESCE((SELECT data_json FROM custom_list_rows WHERE list_id=? AND row_key=?),\'{}\'))')->execute([(int) $p['list_id'], (string) $r['key'], (int) $p['list_id'], (string) $r['key']]); $n++; }
            break;
        case 'snapshot':
            if ($p['table'] === 'archive_digest_entries') { delete_archive_digest($pdo, ['id' => (int) $p['row']['id']]); }
            else { $pdo->prepare('DELETE FROM ' . ro_ident($p['table']) . ' WHERE id=?')->execute([(int) $p['row']['id']]); }
            $n = 1;
            break;
        case 'label_rule_delete':
            $pdo->prepare('DELETE FROM ro_label_rules WHERE id=?')->execute([(int) $p['rule']['id']]); $n = 1;
            break;
    }
    $pdo->prepare('UPDATE ro_undo SET undone=0 WHERE id=?')->execute([(int) $row['id']]);
    log_change($pdo, 'ro_undo', (int) $row['id'], 'update', 'Rétabli : ' . $row['summary'], null, ['count' => $n]);
    return ['redone' => $n];
}

function ro_ident(string $name): string
{
    if (!preg_match('/^[a-z_][a-z0-9_]*$/', $name)) { throw new RuntimeException('Nom de table invalide.'); }
    return $name;
}

/** Remet $to dans table.colonne si la case vaut encore $expected (rien n'est écrasé si elle a changé depuis). */
function ro_set_if(PDO $pdo, string $table, string $col, int $id, mixed $expected, mixed $to): int
{
    $t = ro_ident($table); $c = ro_ident($col);
    $s = $pdo->prepare("SELECT {$c} FROM {$t} WHERE id=?"); $s->execute([$id]);
    $cur = $s->fetchColumn();
    if ($cur === false) { return 0; }
    if ((string) $cur !== (string) $expected && !($cur === null && $expected === null)) { return 0; }
    $pdo->prepare("UPDATE {$t} SET {$c}=? WHERE id=?")->execute([$to, $id]);
    if (in_array($t, ['persons', 'events'], true)) { $pdo->prepare("UPDATE {$t} SET updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([$id]); }
    return 1;
}

/* ═════ 🔁 Chercher et remplacer dans les données ═════ */

const RO_REPLACE_FIELDS = [
    'first_name' => [['persons', 'first_name', 'person'], ['persons', 'middle_name', 'person'], ['name_variants', 'first_name', 'variant']],
    'occupation' => [['persons', 'occupation', 'person'], ['events', 'title', 'occu'], ['events', 'description', 'occu'], ['census_members', 'occupation', 'census']],
    'place' => [['places', 'name', 'place']],
    'note' => [['notes', 'title', 'note'], ['notes', 'body', 'note']],
    'description' => [['events', 'description', 'event']],
];

/** Le motif : texte exact (pas une expression), majuscules respectées ou non, mot entier ou non. */
function ro_replace_regex(string $find, bool $case, bool $word): string
{
    $p = preg_quote($find, '/');
    if ($word) { $p = '(?<![\p{L}\p{N}])' . $p . '(?![\p{L}\p{N}])'; }
    return '/' . $p . '/u' . ($case ? '' : 'i');
}

function ro_replace_params(array $q): array
{
    $field = (string) ($q['field'] ?? '');
    if (!isset(RO_REPLACE_FIELDS[$field])) { throw new RuntimeException('Choisis où chercher.'); }
    $find = (string) ($q['find'] ?? '');
    if (trim($find) === '') { throw new RuntimeException('Tape le texte à chercher.'); }
    if (mb_strlen($find) > 200) { throw new RuntimeException('Texte à chercher trop long.'); }
    $replace = mb_substr((string) ($q['replace'] ?? ''), 0, 200);
    $case = !empty($q['case']) && $q['case'] !== '0' && $q['case'] !== 'false';
    $word = !empty($q['word']) && $q['word'] !== '0' && $q['word'] !== 'false';
    return [$field, $find, $replace, $case, $word, ro_replace_regex($find, $case, $word)];
}

function ro_has_table_col(PDO $pdo, string $table, string $col): bool
{
    static $cache = [];
    $k = "$table.$col";
    if (!isset($cache[$k])) { $s = $pdo->prepare("SELECT 1 FROM pragma_table_info(?) WHERE name=?"); $s->execute([$table, $col]); $cache[$k] = (bool) $s->fetchColumn(); }
    return $cache[$k];
}

/** Les lignes qui contiennent le texte, pour une cible [table, colonne, sorte] : id, valeur, personne liée, fiche verrouillée. */
function ro_replace_candidates(PDO $pdo, array $target, string $regex, int $limit = 5000): array
{
    [$t, $c, $kind] = $target;
    if (!ro_has_table_col($pdo, $t, $c)) { return []; }
    $pdo->sqliteCreateFunction('ro_has', static fn($v): int => ($v !== null && $v !== '' && preg_match($regex, (string) $v)) ? 1 : 0, 1);
    $who = "'' AS who, NULL AS person_id, 0 AS locked";
    $join = '';
    $where = "x.{$c} IS NOT NULL AND x.{$c}<>'' AND ro_has(x.{$c})=1";
    switch ($kind) {
        case 'person':
            $who = "trim(COALESCE(x.first_name,'')||' '||COALESCE(x.last_name,'')) AS who, x.id AS person_id, COALESCE(x.is_locked,0) AS locked"; break;
        case 'variant':
            $join = 'LEFT JOIN persons p ON p.id=x.person_id';
            $who = "trim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,'')) AS who, x.person_id AS person_id, COALESCE(p.is_locked,0) AS locked"; break;
        case 'occu':
        case 'event':
            $join = 'LEFT JOIN families f ON f.id=x.family_id LEFT JOIN persons p ON p.id=COALESCE(x.person_id, f.partner1_id) JOIN event_types et ON et.id=x.event_type_id';
            $who = "trim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,'')) || ' · ' || et.label AS who, p.id AS person_id, COALESCE(p.is_locked,0) AS locked";
            if ($kind === 'occu') { $where .= " AND et.gedcom_tag='OCCU'"; }
            break;
        case 'census':
            $join = 'LEFT JOIN persons p ON p.id=x.person_id';
            $who = "COALESCE(NULLIF(trim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,'')),''), x.display_name) || ' · recensement' AS who, x.person_id AS person_id, COALESCE(p.is_locked,0) AS locked"; break;
        case 'place':
            $who = "(SELECT count(*) FROM events e WHERE e.place_id=x.id) || ' événement(s)' AS who, NULL AS person_id, 0 AS locked"; break;
        case 'note':
            $join = "LEFT JOIN persons p ON x.entity_type='person' AND p.id=x.entity_id";
            $who = "COALESCE(NULLIF(trim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,'')),''), 'note · ' || x.entity_type) AS who, p.id AS person_id, COALESCE(p.is_locked,0) AS locked"; break;
    }
    $sql = "SELECT x.id, x.{$c} AS val, {$who} FROM {$t} x {$join} WHERE {$where} ORDER BY x.id LIMIT " . (int) $limit;
    return $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);
}

/** Aperçu : chaque case qui changerait, avant → après (rien n'est écrit). */
function ro_replace_preview(PDO $pdo, array $q): array
{
    [$field, $find, $replace, $case, $word, $regex] = ro_replace_params($q);
    $rows = []; $total = 0; $locked = 0;
    foreach (RO_REPLACE_FIELDS[$field] as $target) {
        foreach (ro_replace_candidates($pdo, $target, $regex) as $r) {
            $after = preg_replace_callback($regex, static fn() => $replace, (string) $r['val']);
            if ($after === null || $after === $r['val']) { continue; }
            $total++;
            if ((int) $r['locked']) { $locked++; }
            if (count($rows) < 1000) {
                $rows[] = ['key' => "{$target[0]}:{$target[1]}:{$r['id']}", 'table' => $target[0], 'col' => $target[1], 'id' => (int) $r['id'], 'before' => (string) $r['val'], 'after' => $after,
                    'who' => (string) $r['who'], 'person_id' => $r['person_id'] !== null ? (int) $r['person_id'] : null, 'locked' => (int) $r['locked'] ? 1 : 0];
            }
        }
    }
    return ['rows' => $rows, 'total' => $total, 'locked' => $locked, 'shown' => count($rows), 'field' => $field];
}

/** « Remplacer » : seulement les lignes cochées (keys), recalculées ici ; les fiches verrouillées ne changent pas. */
function ro_replace_apply(PDO $pdo, array $data): array
{
    [$field, $find, $replace, $case, $word, $regex] = ro_replace_params($data);
    $keys = is_array($data['keys'] ?? null) ? array_flip(array_map('strval', $data['keys'])) : null;
    $changes = [];
    foreach (RO_REPLACE_FIELDS[$field] as $target) {
        [$t, $c] = $target;
        foreach (ro_replace_candidates($pdo, $target, $regex, 100000) as $r) {
            if ($keys !== null && !isset($keys["$t:$c:{$r['id']}"])) { continue; }
            if ((int) $r['locked']) { continue; }
            $after = preg_replace_callback($regex, static fn() => $replace, (string) $r['val']);
            if ($after === null || $after === $r['val']) { continue; }
            $changes[] = ['t' => $t, 'c' => $c, 'id' => (int) $r['id'], 'before' => (string) $r['val'], 'after' => $after];
        }
    }
    foreach ($changes as $ch) {
        $pdo->prepare('UPDATE ' . ro_ident($ch['t']) . ' SET ' . ro_ident($ch['c']) . '=? WHERE id=?')->execute([$ch['after'], $ch['id']]);
        if (in_array($ch['t'], ['persons', 'events'], true)) { $pdo->prepare('UPDATE ' . $ch['t'] . ' SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$ch['id']]); }
    }
    if (!$changes) { return ['count' => 0, 'undo_id' => 0]; }
    $summary = sprintf('Chercher et remplacer « %s » → « %s » (%d)', mb_substr($find, 0, 60), mb_substr($replace, 0, 60), count($changes));
    $undoId = ro_undo_save($pdo, 'replace', $summary, ['field' => $field, 'changes' => $changes]);
    log_change($pdo, 'search_replace', $undoId, 'update', $summary,
        ['changes' => array_map(static fn($c) => [$c['t'], $c['c'], $c['id'], $c['before']], array_slice($changes, 0, 500))],
        ['changes' => array_map(static fn($c) => [$c['t'], $c['c'], $c['id'], $c['after']], array_slice($changes, 0, 500))]);
    return ['count' => count($changes), 'undo_id' => $undoId];
}

/* ═════ 🧬 Recherche par lien de parenté ═════ */

const RO_KIN_RELATIONS = ['ancestors', 'descendants', 'parents', 'grandparents', 'children', 'grandchildren', 'siblings', 'uncles', 'nephews', 'cousins', 'second_cousins', 'spouses'];

function ro_family_maps(PDO $pdo): array
{
    $parents = []; $children = []; $spouses = [];
    foreach ($pdo->query('SELECT fc.child_id, f.partner1_id, f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id')->fetchAll(PDO::FETCH_NUM) as [$c, $a, $b]) {
        foreach ([$a, $b] as $par) { if ($par) { $parents[(int) $c][(int) $par] = true; $children[(int) $par][(int) $c] = true; } }
    }
    foreach ($pdo->query('SELECT partner1_id, partner2_id FROM families WHERE partner1_id IS NOT NULL AND partner2_id IS NOT NULL')->fetchAll(PDO::FETCH_NUM) as [$a, $b]) {
        $spouses[(int) $a][(int) $b] = true; $spouses[(int) $b][(int) $a] = true;
    }
    return [$parents, $children, $spouses];
}

/** Les personnes à n générations au-dessus (up) ou au-dessous (down) : [id => génération] */
function ro_kin_walk(array $map, array $start, int $max): array
{
    $out = []; $front = $start; $g = 0;
    while ($front && $g < $max) {
        $g++; $next = [];
        foreach ($front as $id) { foreach (array_keys($map[$id] ?? []) as $x) { if (!isset($out[$x])) { $out[$x] = $g; $next[] = $x; } } }
        $front = $next;
    }
    return $out;
}

function ro_kin_ids(PDO $pdo, int $pid, string $rel): array
{
    [$P, $C, $S] = ro_family_maps($pdo);
    $up = fn(array $ids, int $n) => array_keys(array_filter(ro_kin_walk($P, $ids, $n), static fn($g) => $g === $n));
    $down = fn(array $ids, int $n) => array_keys(array_filter(ro_kin_walk($C, $ids, $n), static fn($g) => $g === $n));
    $siblingsOf = function (array $ids) use ($P, $C): array { $out = []; foreach ($ids as $id) { foreach (array_keys($P[$id] ?? []) as $par) { foreach (array_keys($C[$par] ?? []) as $sib) { if ($sib !== $id) { $out[$sib] = true; } } } } return array_keys(array_diff_key($out, array_flip($ids))); };
    $ids = match ($rel) {
        'ancestors' => ro_kin_walk($P, [$pid], 40),
        'descendants' => ro_kin_walk($C, [$pid], 40),
        'parents' => array_fill_keys($up([$pid], 1), 1),
        'grandparents' => array_fill_keys($up([$pid], 2), 2),
        'children' => array_fill_keys($down([$pid], 1), 1),
        'grandchildren' => array_fill_keys($down([$pid], 2), 2),
        'siblings' => array_fill_keys($siblingsOf([$pid]), 0),
        'uncles' => array_fill_keys($siblingsOf($up([$pid], 1)), 1),
        'nephews' => array_fill_keys($down($siblingsOf([$pid]), 1), 1),
        'cousins' => array_fill_keys($down($siblingsOf($up([$pid], 1)), 1), 0),
        'second_cousins' => array_fill_keys($down($siblingsOf($up([$pid], 2)), 2), 0),
        'spouses' => array_fill_keys(array_keys($S[$pid] ?? []), 0),
        default => throw new RuntimeException('Lien de parenté inconnu.'),
    };
    unset($ids[$pid]);
    return $ids;
}

function ro_kinship(PDO $pdo, array $q): array
{
    $pid = safe_int($q['person_id'] ?? 0);
    if (!$pid) { throw new RuntimeException('Choisis une personne.'); }
    $rel = (string) ($q['relation'] ?? 'cousins');
    if (!in_array($rel, RO_KIN_RELATIONS, true)) { throw new RuntimeException('Lien de parenté inconnu.'); }
    $gens = ro_kin_ids($pdo, $pid, $rel);
    $people = collection_people($pdo, array_keys($gens));
    $from = safe_int($q['born_after'] ?? 0); $to = safe_int($q['born_before'] ?? 0);
    $living = (string) ($q['living'] ?? ''); $gender = (string) ($q['gender'] ?? '');
    $nowY = (int) date('Y');
    $out = [];
    foreach ($people as $id => $p) {
        if (($p['kind'] ?? 'human') === 'animal') { continue; }
        $by = (int) ($p['birth_year'] ?: ($p['bapt_year'] ?? 0));
        $dead = ($p['living_status'] ?? '') === 'deceased' || !empty($p['death_year']) || !empty($p['death_date']) || !empty($p['buri_year']);
        $alive = !$dead && (($p['living_status'] ?? '') === 'living' || ($by && $by >= $nowY - 100));
        if ($from && (!$by || $by < $from)) { continue; }
        if ($to && (!$by || $by > $to)) { continue; }
        if ($living === 'living' && !$alive) { continue; }
        if ($living === 'deceased' && !$dead) { continue; }
        if (in_array($gender, ['male', 'female'], true) && ($p['gender'] ?? '') !== $gender) { continue; }
        $out[] = ['id' => (int) $id, 'first_name' => $p['first_name'] ?? '', 'last_name' => $p['last_name'] ?? '', 'gender' => $p['gender'] ?? 'unknown',
            'birth_year' => $by ?: null, 'birth_date' => $p['birth_date'] ?? '', 'death_year' => $p['death_year'] ?? null, 'death_date' => $p['death_date'] ?? '',
            'living_status' => $alive ? 'living' : ($p['living_status'] ?? 'unknown'), 'generation' => (int) $gens[$id]];
    }
    usort($out, static fn($a, $b) => [$a['generation'], $a['birth_year'] ?? 9999, $a['last_name']] <=> [$b['generation'], $b['birth_year'] ?? 9999, $b['last_name']]);
    $s = $pdo->prepare("SELECT trim(COALESCE(first_name,'')||' '||COALESCE(last_name,'')) FROM persons WHERE id=?"); $s->execute([$pid]);
    return ['people' => $out, 'person' => ['id' => $pid, 'name' => (string) $s->fetchColumn()], 'relation' => $rel, 'total_before_filters' => count($gens)];
}

/* ═════ 📊 Comparer deux recherches enregistrées ═════ */

function ro_compare(PDO $pdo, array $q): array
{
    if (!function_exists('run_saved_search')) { throw new RuntimeException('Les recherches enregistrées ne sont pas disponibles.'); }
    $get = function (int $id) use ($pdo): array {
        $s = $pdo->prepare('SELECT * FROM saved_searches WHERE id=?'); $s->execute([$id]); $r = $s->fetch(PDO::FETCH_ASSOC);
        if (!$r) { throw new RuntimeException('Choisis deux recherches enregistrées.'); }
        return [$r['name'], array_map('intval', run_saved_search($pdo, json_decode((string) $r['criteria'], true) ?: []))];
    };
    [$na, $a] = $get(safe_int($q['a'] ?? 0)); [$nb, $b] = $get(safe_int($q['b'] ?? 0));
    $op = (string) ($q['op'] ?? 'minus');
    $ids = match ($op) {
        'minus' => array_values(array_diff($a, $b)),
        'and' => array_values(array_intersect($a, $b)),
        'or' => array_values(array_unique(array_merge($a, $b))),
        'xor' => array_values(array_merge(array_diff($a, $b), array_diff($b, $a))),
        default => throw new RuntimeException('Opération inconnue.'),
    };
    $people = array_values(array_map(static fn($p) => ['id' => (int) $p['id'], 'first_name' => $p['first_name'] ?? '', 'last_name' => $p['last_name'] ?? '', 'gender' => $p['gender'] ?? 'unknown',
        'birth_year' => $p['birth_year'] ?? null, 'birth_date' => $p['birth_date'] ?? '', 'death_year' => $p['death_year'] ?? null, 'death_date' => $p['death_date'] ?? '', 'living_status' => $p['living_status'] ?? ''],
        collection_people($pdo, array_slice($ids, 0, 2000))));
    usort($people, static fn($x, $y) => strcasecmp($x['last_name'] . ' ' . $x['first_name'], $y['last_name'] . ' ' . $y['first_name']));
    return ['people' => $people, 'count' => count($ids), 'a' => ['name' => $na, 'count' => count($a)], 'b' => ['name' => $nb, 'count' => count($b)], 'op' => $op];
}

/* ═════ 🧾 Recherche dans les sources et les citations ═════ */

function ro_sources(PDO $pdo, array $q): array
{
    $text = trim((string) ($q['q'] ?? ''));
    if (mb_strlen($text) < 2) { throw new RuntimeException('Tape au moins deux lettres.'); }
    $regex = ro_replace_regex($text, false, false);
    $pdo->sqliteCreateFunction('ro_has', static fn($v): int => ($v !== null && $v !== '' && preg_match($regex, (string) $v)) ? 1 : 0, 1);
    $snip = static function (string $v) use ($regex): string {
        if (!preg_match($regex, $v, $m, PREG_OFFSET_CAPTURE)) { return mb_substr($v, 0, 160); }
        $pos = mb_strlen(substr($v, 0, $m[0][1])); $start = max(0, $pos - 60);
        return ($start ? '…' : '') . mb_substr($v, $start, 180) . (mb_strlen($v) > $start + 180 ? '…' : '');
    };
    $sources = [];
    foreach ($pdo->query("SELECT s.id, s.title, s.author, s.publication, s.agency, s.url, s.text, (SELECT count(*) FROM source_links l WHERE l.source_record_id=s.id) AS uses
        FROM sources s WHERE ro_has(s.title)=1 OR ro_has(s.author)=1 OR ro_has(s.publication)=1 OR ro_has(s.agency)=1 OR ro_has(s.text)=1 ORDER BY s.title COLLATE NOCASE LIMIT 500")->fetchAll(PDO::FETCH_ASSOC) as $s) {
        $where = null;
        foreach (['title' => 'Titre', 'author' => 'Auteur', 'publication' => 'Publication', 'agency' => 'Dépôt', 'text' => 'Texte'] as $k => $lab) { if (preg_match($regex, (string) $s[$k])) { $where = [$lab, $snip((string) $s[$k])]; break; } }
        $sources[] = ['id' => (int) $s['id'], 'title' => (string) $s['title'], 'author' => (string) $s['author'], 'url' => (string) $s['url'], 'uses' => (int) $s['uses'], 'field' => $where[0] ?? '', 'snippet' => $where[1] ?? ''];
    }
    $citations = [];
    foreach ($pdo->query("SELECT l.id, l.entity_type, l.entity_id, l.page, l.note, l.quality, s.id AS source_id, s.title,
        CASE WHEN l.entity_type='person' THEN l.entity_id WHEN l.entity_type='event' THEN (SELECT COALESCE(e.person_id, f.partner1_id) FROM events e LEFT JOIN families f ON f.id=e.family_id WHERE e.id=l.entity_id) ELSE NULL END AS person_id
        FROM source_links l JOIN sources s ON s.id=l.source_record_id WHERE ro_has(l.page)=1 OR ro_has(l.note)=1 ORDER BY s.title COLLATE NOCASE, l.id LIMIT 500")->fetchAll(PDO::FETCH_ASSOC) as $c) {
        $citations[] = ['id' => (int) $c['id'], 'source_id' => (int) $c['source_id'], 'title' => (string) $c['title'], 'entity_type' => (string) $c['entity_type'], 'entity_id' => (int) $c['entity_id'],
            'person_id' => $c['person_id'] !== null ? (int) $c['person_id'] : null, 'page' => (string) $c['page'], 'snippet' => $snip(preg_match($regex, (string) $c['note']) ? (string) $c['note'] : (string) $c['page'])];
    }
    $pids = array_values(array_unique(array_filter(array_map(static fn($c) => $c['person_id'], $citations))));
    $names = [];
    foreach (array_chunk($pids, 400) as $chunk) {
        $s = $pdo->prepare("SELECT id, trim(COALESCE(first_name,'')||' '||COALESCE(last_name,'')) FROM persons WHERE id IN (" . implode(',', array_fill(0, count($chunk), '?')) . ')');
        $s->execute($chunk); foreach ($s->fetchAll(PDO::FETCH_NUM) as [$id, $n]) { $names[(int) $id] = $n; }
    }
    foreach ($citations as &$c) { $c['person_name'] = $c['person_id'] ? ($names[$c['person_id']] ?? '') : ''; }
    unset($c);
    return ['sources' => $sources, 'citations' => $citations, 'q' => $text];
}

/* ═════ ☑ Agir sur les résultats ═════ */

function ro_ids(array $data): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', is_array($data['ids'] ?? null) ? $data['ids'] : []))));
    if (!$ids) { throw new RuntimeException('Coche au moins une personne.'); }
    return array_slice($ids, 0, 20000);
}

/** 🏷 Étiqueter les personnes cochées (étiquette existante, ou créée avec le nom donné). */
function ro_people_label(PDO $pdo, array $data): array
{
    $ids = ro_ids($data);
    $labelId = safe_int($data['label_id'] ?? 0); $created = false;
    if (!$labelId) {
        $name = mb_substr(safe_text($data['label_name'] ?? ''), 0, 80);
        if ($name === '') { throw new RuntimeException('Choisis ou écris une étiquette.'); }
        $s = $pdo->prepare('SELECT id FROM labels WHERE name=? COLLATE NOCASE'); $s->execute([$name]); $labelId = (int) $s->fetchColumn();
        if (!$labelId) { $pdo->prepare('INSERT INTO labels(name, color) VALUES(?, ?)')->execute([$name, '#0066cc']); $labelId = (int) $pdo->lastInsertId(); $created = true; }
    }
    $s = $pdo->prepare('SELECT * FROM labels WHERE id=?'); $s->execute([$labelId]); $label = $s->fetch(PDO::FETCH_ASSOC);
    if (!$label) { throw new RuntimeException('Étiquette introuvable.'); }
    $ins = $pdo->prepare("INSERT OR IGNORE INTO label_links(label_id, entity_type, entity_id) SELECT ?, 'person', id FROM persons WHERE id=?");
    $added = [];
    foreach ($ids as $pid) { $ins->execute([$labelId, $pid]); if ($ins->rowCount()) { $added[] = $pid; } }
    $summary = sprintf('Étiquette « %s » posée sur %d personne(s)', $label['name'], count($added));
    $undoId = ro_undo_save($pdo, 'labels', $summary, ['label_id' => $labelId, 'added' => $added, 'created_label' => $created, 'label_row' => $label]);
    log_change($pdo, 'label', $labelId, 'labels', $summary, null, ['people' => array_slice($added, 0, 500)]);
    return ['added' => count($added), 'already' => count($ids) - count($added), 'label' => $label['name'], 'undo_id' => $undoId];
}

/** 📋 Ajouter les personnes cochées à une de « Mes listes » (liste de personnes). */
function ro_people_to_list(PDO $pdo, array $data): array
{
    $ids = ro_ids($data);
    $listId = safe_int($data['list_id'] ?? 0);
    $s = $pdo->prepare('SELECT id, name, source FROM custom_lists WHERE id=?'); $s->execute([$listId]); $list = $s->fetch(PDO::FETCH_ASSOC);
    if (!$list) { throw new RuntimeException('Liste introuvable.'); }
    if ($list['source'] !== 'persons') { throw new RuntimeException('Cette liste ne contient pas des personnes.'); }
    $cur = $pdo->prepare('SELECT included FROM custom_list_rows WHERE list_id=? AND row_key=?');
    $rows = [];
    foreach ($ids as $pid) {
        $key = 'p:' . $pid; $cur->execute([$listId, $key]); $was = $cur->fetchColumn();
        if ($was !== false && (int) $was === 1) { continue; }
        if ($was === false) { $pdo->prepare("INSERT INTO custom_list_rows(list_id, row_key, included, data_json) VALUES(?,?,1,'{}')")->execute([$listId, $key]); }
        else { $pdo->prepare('UPDATE custom_list_rows SET included=1 WHERE list_id=? AND row_key=?')->execute([$listId, $key]); }
        $rows[] = ['key' => $key, 'was' => $was === false ? null : (int) $was];
    }
    $summary = sprintf('%d personne(s) ajoutée(s) à la liste « %s »', count($rows), $list['name']);
    $undoId = ro_undo_save($pdo, 'list_rows', $summary, ['list_id' => $listId, 'rows' => $rows]);
    log_change($pdo, 'custom_list', $listId, 'update', $summary, null, ['people' => array_slice(array_column($rows, 'key'), 0, 500)]);
    return ['added' => count($rows), 'list' => $list['name'], 'undo_id' => $undoId];
}

/* ═════ 🗑 Dépouillement supprimé tout de suite, « ↶ Annuler » le remet ═════ */

const RO_DIGEST_CHILDREN = ['archive_digest_media', 'archive_digest_gaps', 'archive_digest_transcription_lines', 'archive_digest_transcription_versions', 'archive_digest_people',
    'battue_item_archive_digests', 'investigation_item_archive_digests', 'archive_digest_sought'];
const RO_DIGEST_REFS = ['archive_digest_requests', 'archive_visit_items', 'battue_search_items', 'investigation_items'];

function ro_table_exists(PDO $pdo, string $t): bool
{
    $s = $pdo->prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"); $s->execute([$t]); return (bool) $s->fetchColumn();
}

function ro_digest_trash(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $s = $pdo->prepare('SELECT * FROM archive_digest_entries WHERE id=?'); $s->execute([$id]); $row = $s->fetch(PDO::FETCH_ASSOC);
    if (!$row) { throw new RuntimeException('Dépouillement introuvable'); }
    $children = []; $refs = [];
    foreach (RO_DIGEST_CHILDREN as $t) { if (ro_table_exists($pdo, $t) && ro_has_table_col($pdo, $t, 'archive_digest_id')) { $q = $pdo->prepare("SELECT * FROM {$t} WHERE archive_digest_id=?"); $q->execute([$id]); $children[$t] = $q->fetchAll(PDO::FETCH_ASSOC); } }
    foreach (RO_DIGEST_REFS as $t) { if (ro_table_exists($pdo, $t) && ro_has_table_col($pdo, $t, 'archive_digest_id')) { $q = $pdo->prepare("SELECT id FROM {$t} WHERE archive_digest_id=?"); $q->execute([$id]); $refs[$t] = array_map('intval', $q->fetchAll(PDO::FETCH_COLUMN)); } }
    delete_archive_digest($pdo, ['id' => $id]); // la suppression habituelle (api.php), journalisée
    $label = trim(implode(' · ', array_filter([$row['city_name'] ?? '', $row['year_text'] ?? '', $row['archive_reference'] ?? ''])));
    $undoId = ro_undo_save($pdo, 'snapshot', 'Dépouillement supprimé' . ($label !== '' ? " ($label)" : ''), ['table' => 'archive_digest_entries', 'row' => $row, 'children' => $children, 'refs' => $refs, 'ref_col' => 'archive_digest_id']);
    return ['id' => $id, 'undo_id' => $undoId];
}

/** Une ligne simple supprimée tout de suite (personne relevée, lacune, acte à commander, ligne de transcription) par sa
 *  suppression habituelle (api.php, journalisée) ; « ↶ Annuler » la remet telle quelle. */
const RO_ROW_TRASH = ['archive_digest_people' => ['delete_archive_digest_person', 'Personne relevée retirée'], 'archive_digest_gaps' => ['delete_archive_digest_gap', 'Lacune supprimée'],
    'archive_digest_requests' => ['delete_archive_digest_request', 'Acte à commander supprimé'], 'archive_digest_transcription_lines' => ['delete_archive_digest_transcription_line', 'Ligne de transcription supprimée'],
    'event_types' => ['delete_event_type', 'Type d’événement supprimé'], 'personal_dictionary_entries' => ['delete_personal_dictionary_entry', 'Définition supprimée']];

function ro_row_trash(PDO $pdo, array $data): array
{
    $table = (string) ($data['table'] ?? ''); $id = safe_int($data['id'] ?? 0);
    if (!isset(RO_ROW_TRASH[$table])) { throw new RuntimeException('Suppression impossible ici.'); }
    $s = $pdo->prepare("SELECT * FROM {$table} WHERE id=?"); $s->execute([$id]); $row = $s->fetch(PDO::FETCH_ASSOC);
    if (!$row) { throw new RuntimeException('Élément introuvable.'); }
    [$fn, $summary] = RO_ROW_TRASH[$table];
    $fn($pdo, ['id' => $id]);
    return ['id' => $id, 'undo_id' => ro_undo_save($pdo, 'snapshot', $summary, ['table' => $table, 'row' => $row, 'children' => [], 'refs' => []])];
}

function ro_snapshot_restore(PDO $pdo, array $p): int
{
    $table = ro_ident((string) $p['table']); $row = $p['row'] ?? [];
    if ($table !== 'archive_digest_entries' && !isset(RO_ROW_TRASH[$table])) { throw new RuntimeException('Rien à remettre.'); }
    $ex = $pdo->prepare("SELECT 1 FROM {$table} WHERE id=?"); $ex->execute([(int) ($row['id'] ?? 0)]);
    if ($ex->fetchColumn()) { return 0; }
    insert_snapshot_row($pdo, $table, $row);
    $n = 1;
    foreach (($p['children'] ?? []) as $t => $rows) { if (!in_array($t, RO_DIGEST_CHILDREN, true)) { continue; } foreach ($rows as $r) { insert_snapshot_row($pdo, $t, $r, true); $n++; } }
    foreach (($p['refs'] ?? []) as $t => $ids) {
        if (!in_array($t, RO_DIGEST_REFS, true) || !$ids) { continue; }
        $u = $pdo->prepare('UPDATE ' . ro_ident($t) . ' SET archive_digest_id=? WHERE id=? AND archive_digest_id IS NULL');
        foreach ($ids as $rid) { $u->execute([(int) $row['id'], (int) $rid]); }
    }
    log_change($pdo, $table === 'archive_digest_entries' ? 'archive_digest' : $table, (int) $row['id'], 'restore', 'Suppression annulée #' . (int) $row['id'], null, null);
    return $n;
}

/* ═════ 🗄 Santé de la base ═════ */

function ro_dir_size(string $dir, int &$files, float $deadline): int
{
    $size = 0;
    if (!is_dir($dir)) { return 0; }
    try {
        $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS));
        foreach ($it as $f) { if ($f->isFile()) { $size += $f->getSize(); $files++; } if (microtime(true) > $deadline) { break; } }
    } catch (Throwable $_) {}
    return $size;
}

function ro_db_health(PDO $pdo): array
{
    $path = defined('DB_PATH') ? DB_PATH : '';
    $dbSize = $path && is_file($path) ? (int) filesize($path) : 0;
    $wal = $path && is_file($path . '-wal') ? (int) filesize($path . '-wal') : 0;
    $pageSize = (int) $pdo->query('PRAGMA page_size')->fetchColumn();
    $free = (int) $pdo->query('PRAGMA freelist_count')->fetchColumn() * $pageSize;
    $tables = [];
    foreach ($pdo->query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")->fetchAll(PDO::FETCH_COLUMN) as $t) {
        try { $tables[] = ['name' => $t, 'rows' => (int) $pdo->query('SELECT count(*) FROM "' . str_replace('"', '""', $t) . '"')->fetchColumn()]; } catch (Throwable $_) {}
    }
    usort($tables, static fn($a, $b) => $b['rows'] <=> $a['rows'] ?: strcmp($a['name'], $b['name']));
    $files = 0;
    $media = defined('MEDIA_DIR') ? ro_dir_size(MEDIA_DIR, $files, microtime(true) + 3.0) : 0;
    return ['db_size' => $dbSize, 'wal_size' => $wal, 'free_size' => $free, 'media_size' => $media, 'media_files' => $files,
        'tables' => $tables, 'rows_total' => array_sum(array_column($tables, 'rows')), 'path_name' => $path ? basename($path) : ''];
}

/** Compacter : le fichier reprend la place laissée par les suppressions (rien n'est effacé). Hors transaction. */
function ro_db_vacuum(PDO $pdo): array
{
    $path = defined('DB_PATH') ? DB_PATH : '';
    clearstatcache();
    $before = $path && is_file($path) ? (int) filesize($path) + (is_file($path . '-wal') ? (int) filesize($path . '-wal') : 0) : 0;
    try { $pdo->exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch (Throwable $_) {}
    $pdo->exec('VACUUM');
    try { $pdo->exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch (Throwable $_) {}
    clearstatcache();
    $after = $path && is_file($path) ? (int) filesize($path) + (is_file($path . '-wal') ? (int) filesize($path . '-wal') : 0) : 0;
    log_change($pdo, 'database', null, 'update', 'Base compactée', ['size' => $before], ['size' => $after]);
    return ['before' => $before, 'after' => $after];
}

/* ═════ 🔁 Remplacer un lieu par un autre ═════ */

/** Les tables qui pointent vers un lieu (colonne place_id) */
function ro_place_tables(PDO $pdo): array
{
    $out = [];
    foreach ($pdo->query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'places'")->fetchAll(PDO::FETCH_COLUMN) as $t) {
        if (!preg_match('/^[a-z_][a-z0-9_]*$/', $t)) { continue; }
        if (ro_has_table_col($pdo, $t, 'place_id') && ro_has_table_col($pdo, $t, 'id')) { $out[] = $t; }
    }
    return $out;
}

function ro_place_row(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT * FROM places WHERE id=?'); $s->execute([$id]); $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { throw new RuntimeException('Lieu introuvable.'); }
    return $r;
}

function ro_place_replace_preview(PDO $pdo, array $q): array
{
    $from = safe_int($q['from'] ?? 0); $to = safe_int($q['to'] ?? 0);
    if (!$from || !$to) { throw new RuntimeException('Choisis les deux lieux.'); }
    if ($from === $to) { throw new RuntimeException('Choisis deux lieux différents.'); }
    $a = ro_place_row($pdo, $from); $b = ro_place_row($pdo, $to);
    $counts = []; $total = 0;
    foreach (ro_place_tables($pdo) as $t) { $n = (int) $pdo->query("SELECT count(*) FROM {$t} WHERE place_id=" . $from)->fetchColumn(); if ($n) { $counts[$t] = $n; $total += $n; } }
    $events = $pdo->query("SELECT e.id, e.year, e.date_text, et.label AS type, trim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,'')) AS who, COALESCE(e.person_id, f.partner1_id) AS person_id
        FROM events e JOIN event_types et ON et.id=e.event_type_id LEFT JOIN families f ON f.id=e.family_id LEFT JOIN persons p ON p.id=COALESCE(e.person_id, f.partner1_id)
        WHERE e.place_id=" . $from . ' ORDER BY e.year, e.id LIMIT 200')->fetchAll(PDO::FETCH_ASSOC);
    return ['from' => $a, 'to' => $b, 'counts' => $counts, 'total' => $total, 'events' => $events];
}

function ro_place_replace_apply(PDO $pdo, array $data): array
{
    $from = safe_int($data['from'] ?? 0); $to = safe_int($data['to'] ?? 0);
    if (!$from || !$to || $from === $to) { throw new RuntimeException('Choisis deux lieux différents.'); }
    $a = ro_place_row($pdo, $from); $b = ro_place_row($pdo, $to);
    $changes = [];
    foreach (ro_place_tables($pdo) as $t) {
        foreach ($pdo->query("SELECT id FROM {$t} WHERE place_id=" . $from)->fetchAll(PDO::FETCH_COLUMN) as $rid) { $changes[] = ['t' => $t, 'c' => 'place_id', 'id' => (int) $rid, 'before' => $from, 'after' => $to]; }
        $pdo->exec("UPDATE OR IGNORE {$t} SET place_id=" . $to . ' WHERE place_id=' . $from); // OR IGNORE : une ligne que le lieu gardé a déjà (population de la même année…) reste au lieu remplacé au lieu de « UNIQUE constraint failed »
    }
    $deleted = null;
    if (!empty($data['delete_from']) && $data['delete_from'] !== '0') { $deleted = $a; $pdo->prepare('DELETE FROM places WHERE id=?')->execute([$from]); }
    $summary = sprintf('Lieu « %s » remplacé par « %s » (%d)', $a['name'], $b['name'], count($changes));
    $undoId = ro_undo_save($pdo, 'place_replace', $summary, ['changes' => $changes, 'deleted_place' => $deleted]);
    log_change($pdo, 'place', $from, 'update', $summary, ['place' => $a, 'rows' => count($changes)], ['place_id' => $to]);
    return ['count' => count($changes), 'deleted' => (bool) $deleted, 'undo_id' => $undoId];
}

/* ═════ 🏷 Étiquettes : règles automatiques ═════ */

function ro_rule_criteria(array $c): array
{
    $g = (string) ($c['gender'] ?? '');
    return ['gender' => in_array($g, ['male', 'female'], true) ? $g : '', 'born_from' => safe_int($c['born_from'] ?? 0), 'born_to' => safe_int($c['born_to'] ?? 0),
        'place' => mb_substr(safe_text($c['place'] ?? ''), 0, 100), 'occupation' => mb_substr(safe_text($c['occupation'] ?? ''), 0, 100),
        'last_name' => mb_substr(safe_text($c['last_name'] ?? ''), 0, 100), 'saved_search' => safe_int($c['saved_search'] ?? 0), 'living' => in_array($c['living'] ?? '', ['living', 'deceased'], true) ? $c['living'] : ''];
}

function ro_rule_describe(array $c): string
{
    $parts = [];
    if ($c['gender']) { $parts[] = $c['gender'] === 'male' ? 'homme' : 'femme'; }
    if ($c['born_from'] && $c['born_to']) { $parts[] = "né(e) entre {$c['born_from']} et {$c['born_to']}"; }
    elseif ($c['born_from']) { $parts[] = "né(e) à partir de {$c['born_from']}"; }
    elseif ($c['born_to']) { $parts[] = "né(e) jusqu’en {$c['born_to']}"; }
    if ($c['place'] !== '') { $parts[] = "lieu « {$c['place']} »"; }
    if ($c['occupation'] !== '') { $parts[] = "métier « {$c['occupation']} »"; }
    if ($c['last_name'] !== '') { $parts[] = "nom « {$c['last_name']} »"; }
    if ($c['living']) { $parts[] = $c['living'] === 'living' ? 'vivant(e)' : 'décédé(e)'; }
    if ($c['saved_search']) { $parts[] = 'dans une recherche enregistrée'; }
    return $parts ? implode(' · ', $parts) : 'tout le monde';
}

function ro_rule_ids(PDO $pdo, array $c): array
{
    $where = ["COALESCE(p.kind,'human')<>'animal'"]; $params = [];
    if ($c['gender']) { $where[] = 'p.gender=?'; $params[] = $c['gender']; }
    $by = "(SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('BIRT','CHR','BAPM') AND e.year IS NOT NULL ORDER BY t.gedcom_tag<>'BIRT', e.id LIMIT 1)";
    if ($c['born_from']) { $where[] = "$by>=?"; $params[] = $c['born_from']; }
    if ($c['born_to']) { $where[] = "$by<=?"; $params[] = $c['born_to']; }
    if ($c['place'] !== '') { $where[] = 'EXISTS (SELECT 1 FROM events e JOIN places pl ON pl.id=e.place_id WHERE e.person_id=p.id AND (pl.name LIKE ? OR pl.county LIKE ?))'; $params[] = '%' . $c['place'] . '%'; $params[] = '%' . $c['place'] . '%'; }
    if ($c['occupation'] !== '') { $where[] = "(p.occupation LIKE ? OR EXISTS (SELECT 1 FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='OCCU' AND (e.title LIKE ? OR e.description LIKE ?)))"; array_push($params, '%' . $c['occupation'] . '%', '%' . $c['occupation'] . '%', '%' . $c['occupation'] . '%'); }
    if ($c['last_name'] !== '') { $where[] = 'p.last_name LIKE ?'; $params[] = '%' . $c['last_name'] . '%'; }
    if ($c['living'] === 'deceased') { $where[] = "(p.living_status='deceased' OR EXISTS (SELECT 1 FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('DEAT','BURI')))"; }
    if ($c['living'] === 'living') { $where[] = "p.living_status<>'deceased' AND NOT EXISTS (SELECT 1 FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('DEAT','BURI'))"; }
    $s = $pdo->prepare('SELECT p.id FROM persons p WHERE ' . implode(' AND ', $where) . ' ORDER BY p.id'); $s->execute($params);
    $ids = array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN));
    if ($c['saved_search'] && function_exists('run_saved_search')) {
        $q = $pdo->prepare('SELECT criteria FROM saved_searches WHERE id=?'); $q->execute([$c['saved_search']]);
        $crit = $q->fetchColumn();
        if ($crit !== false) { $ids = array_values(array_intersect($ids, array_map('intval', run_saved_search($pdo, json_decode((string) $crit, true) ?: [])))); }
    }
    return $ids;
}

function ro_label_rules(PDO $pdo): array
{
    $rules = [];
    foreach ($pdo->query('SELECT r.*, l.name AS label_name, l.color AS label_color FROM ro_label_rules r LEFT JOIN labels l ON l.id=r.label_id ORDER BY r.id')->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $c = ro_rule_criteria(json_decode((string) $r['criteria_json'], true) ?: []);
        $rules[] = ['id' => (int) $r['id'], 'name' => $r['name'], 'label_id' => (int) $r['label_id'], 'label_name' => (string) $r['label_name'], 'label_color' => (string) $r['label_color'], 'criteria' => $c, 'describe' => ro_rule_describe($c)];
    }
    $labels = $pdo->query('SELECT id, name, color FROM labels ORDER BY name COLLATE NOCASE')->fetchAll(PDO::FETCH_ASSOC);
    $searches = ro_table_exists($pdo, 'saved_searches') ? $pdo->query('SELECT id, name FROM saved_searches ORDER BY name COLLATE NOCASE')->fetchAll(PDO::FETCH_ASSOC) : [];
    return ['rules' => $rules, 'labels' => $labels, 'searches' => $searches];
}

function ro_label_rule_preview(PDO $pdo, array $q): array
{
    $c = ro_rule_criteria(is_string($q['criteria'] ?? null) ? (json_decode($q['criteria'], true) ?: []) : $q);
    $ids = ro_rule_ids($pdo, $c);
    $labelId = safe_int($q['label_id'] ?? 0); $already = 0;
    if ($labelId && $ids) { $s = $pdo->prepare("SELECT count(*) FROM label_links WHERE label_id=? AND entity_type='person' AND entity_id IN (" . implode(',', $ids) . ')'); $s->execute([$labelId]); $already = (int) $s->fetchColumn(); }
    $sample = array_values(array_map(static fn($p) => ['id' => (int) $p['id'], 'name' => trim(($p['first_name'] ?? '') . ' ' . ($p['last_name'] ?? '')), 'birth_year' => $p['birth_year'] ?? null], collection_people($pdo, array_slice($ids, 0, 30))));
    return ['count' => count($ids), 'already' => $already, 'sample' => $sample, 'describe' => ro_rule_describe($c)];
}

function ro_label_rule_save(PDO $pdo, array $data): array
{
    $c = ro_rule_criteria(is_array($data['criteria'] ?? null) ? $data['criteria'] : []);
    $labelId = safe_int($data['label_id'] ?? 0);
    if (!$labelId) {
        $name = mb_substr(safe_text($data['label_name'] ?? ''), 0, 80);
        if ($name === '') { throw new RuntimeException('Choisis ou écris une étiquette.'); }
        $s = $pdo->prepare('SELECT id FROM labels WHERE name=? COLLATE NOCASE'); $s->execute([$name]); $labelId = (int) $s->fetchColumn();
        if (!$labelId) { $pdo->prepare('INSERT INTO labels(name, color) VALUES(?, ?)')->execute([$name, '#0066cc']); $labelId = (int) $pdo->lastInsertId(); }
    }
    $name = mb_substr(safe_text($data['name'] ?? ''), 0, 120) ?: ro_rule_describe($c);
    $id = safe_int($data['id'] ?? 0);
    if ($id) { $pdo->prepare('UPDATE ro_label_rules SET name=?, label_id=?, criteria_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$name, $labelId, json_encode($c, JSON_UNESCAPED_UNICODE), $id]); }
    else { $pdo->prepare('INSERT INTO ro_label_rules(name, label_id, criteria_json) VALUES(?,?,?)')->execute([$name, $labelId, json_encode($c, JSON_UNESCAPED_UNICODE)]); $id = (int) $pdo->lastInsertId(); }
    log_change($pdo, 'label_rule', $id, 'update', 'Règle d’étiquette enregistrée : ' . $name, null, ['criteria' => $c, 'label_id' => $labelId]);
    return ['id' => $id, 'label_id' => $labelId];
}

function ro_label_rule_delete(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $s = $pdo->prepare('SELECT * FROM ro_label_rules WHERE id=?'); $s->execute([$id]); $rule = $s->fetch(PDO::FETCH_ASSOC);
    if (!$rule) { throw new RuntimeException('Règle introuvable.'); }
    $pdo->prepare('DELETE FROM ro_label_rules WHERE id=?')->execute([$id]);
    log_change($pdo, 'label_rule', $id, 'delete', 'Règle d’étiquette supprimée : ' . $rule['name'], $rule, null);
    return ['id' => $id, 'undo_id' => ro_undo_save($pdo, 'label_rule_delete', 'Règle supprimée', ['rule' => $rule])];
}

/** ▶ Appliquer une règle : l'étiquette est posée sur chaque personne qui y répond (celles qui l'ont déjà ne bougent pas). */
function ro_label_rule_apply(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $s = $pdo->prepare('SELECT * FROM ro_label_rules WHERE id=?'); $s->execute([$id]); $rule = $s->fetch(PDO::FETCH_ASSOC);
    if (!$rule) { throw new RuntimeException('Règle introuvable.'); }
    $ids = ro_rule_ids($pdo, ro_rule_criteria(json_decode((string) $rule['criteria_json'], true) ?: []));
    if (!$ids) { return ['added' => 0, 'already' => 0, 'undo_id' => 0]; }
    return ro_people_label($pdo, ['ids' => $ids, 'label_id' => (int) $rule['label_id']]);
}
