<?php
declare(strict_types=1);

/**
 * 📍 Lieux en double probables : les trouver, les fusionner pour de bon, et ↶ revenir exactement en arrière.
 *
 * Le cas d'origine : un import GEDCOM crée « Pernay, Indre-et-Loire, Centre-Val de Loire, France » (le texte entier
 * devient le nom, pas de département) à côté de « Pernay » (Indre-et-Loire, 82 événements).
 *
 * Détection (ld_detect, une seule fonction partagée par le menu de choix, les Réglages, le Contrôle et l'ancienne
 * action merge_duplicate_places) :
 *  - nom découpé aux virgules (et « Pernay (Indre-et-Loire) ») : la 1re partie est le nom, les suivantes
 *    département / région / pays ;
 *  - même nom (sans accents, majuscules, tirets) et rien de contradictoire : département, pays, code INSEE, et pas
 *    plus de 10 km entre les deux points ;
 *  - confiance « sure » : même code INSEE, points à moins de 1 km, ou même département des deux côtés ;
 *    « medium » : l'un des deux n'a pas de département ; « low » : sans département et plusieurs communes possibles
 *    (Saint-Amand du Cher ou du Nord ?) — jamais fusionné tout seul, et deux départements différents ne sont jamais
 *    regroupés.
 *
 * Fusion (ld_merge_pair) : toutes les colonnes qui désignent un lieu (place_id, *_place_id, clé étrangère vers places)
 * et les liens « type = 'place' » (entity_type/entity_id, a_type/a_id, kind/ref_id…) passent au lieu gardé. Une ligne
 * qui ferait doublon (même année de population, même étiquette…) est mise de côté (gardée pour ↶) au lieu de faire
 * échouer la fusion sur « UNIQUE constraint failed ». Le lieu gardé prend ce qui lui manque (coordonnées, INSEE,
 * département, région, pays…) et le nom du doublon devient un autre nom (alternate_names) s'il diffère.
 * Journal (log_change) et ↶ (table ro_undo, kind « ld_merge »).
 *
 * Routes « ld_* » (api.php) : GET ld_groups, ld_preview ; POST ld_merge, ld_merge_safe, ld_undo.
 * Interface : assets/js/app-lieux-doublons.js. Essai : tests/test-lieux-doublons.js
 */

require_once __DIR__ . '/recherche_outils.php'; // ro_undo_save, ro_undo_row, ro_ident, ro_ensure

const LD_COUNTRIES = ['france', 'belgique', 'suisse', 'italie', 'espagne', 'allemagne', 'luxembourg', 'canada', 'algerie', 'pays bas', 'portugal',
    'royaume uni', 'etats unis', 'usa', 'monaco', 'andorre', 'pologne', 'autriche', 'tunisie', 'maroc', 'quebec', 'irlande', 'angleterre'];

function ld_fold(?string $s): string
{
    $s = ascii_fold(mb_strtolower(trim((string) $s)));
    $s = preg_replace('/[\s\-’\'.]+/u', ' ', $s) ?? $s;
    return trim($s);
}

/** « Pernay, Indre-et-Loire, Centre-Val de Loire, France » → nom + ce que disent les autres parties */
function ld_parse(array $r): array
{
    $name = (string) $r['name'];
    $name = preg_replace('/\s*\(([^)]*)\)\s*$/u', ', $1', $name) ?? $name;
    $parts = array_values(array_filter(array_map('trim', explode(',', $name)), static fn($x) => $x !== ''));
    $base = $parts[0] ?? '';
    $rest = array_slice($parts, 1);
    $county = ''; $state = ''; $country = ''; $code = '';
    $rest = array_values(array_filter($rest, static function ($x) use (&$code) { if (preg_match('/^(\d{2,3}|2a|2b)$/i', $x)) { $code = strtoupper($x); return false; } return true; }));
    $isCountry = static fn($x) => in_array(ld_fold($x), LD_COUNTRIES, true);
    $n = count($rest);
    if ($n === 1) { if ($isCountry($rest[0])) { $country = $rest[0]; } else { $county = $rest[0]; } }
    elseif ($n === 2) { if ($isCountry($rest[1])) { $county = $rest[0]; $country = $rest[1]; } else { $county = $rest[0]; $state = $rest[1]; } }
    elseif ($n >= 3) { $county = $rest[0]; $state = $rest[$n - 2]; $country = $rest[$n - 1]; }
    $f = static fn($k) => trim((string) ($r[$k] ?? ''));
    $lat = $r['latitude'] ?? null; $lon = $r['longitude'] ?? null;
    $hasXY = $lat !== null && $lon !== null && $lat !== '' && $lon !== '' && !((float) $lat == 0.0 && (float) $lon == 0.0);
    return [
        'id' => (int) $r['id'], 'name' => (string) $r['name'], 'key' => ld_fold($base), 'base' => $base, 'split' => count($parts) > 1,
        'county' => $f('county') !== '' ? $f('county') : $county, 'state' => $f('state') !== '' ? $f('state') : $state,
        'country' => $f('country') !== '' ? $f('country') : $country, 'code' => $f('admin2_code') !== '' ? $f('admin2_code') : $code,
        'insee' => $f('admin4_code'), 'lat' => $hasXY ? (float) $lat : null, 'lon' => $hasXY ? (float) $lon : null,
        'own_county' => $f('county'), 'row' => $r,
    ];
}

function ld_km(float $la1, float $lo1, float $la2, float $lo2): float
{
    $a = sin(deg2rad($la2 - $la1) / 2) ** 2 + cos(deg2rad($la1)) * cos(deg2rad($la2)) * sin(deg2rad($lo2 - $lo1) / 2) ** 2;
    return 6371 * 2 * asin(min(1, sqrt($a)));
}

/** Deux lieux du même nom : null s'ils se contredisent, sinon [confiance, raison] */
function ld_pair(array $a, array $b): ?array
{
    if ($a['key'] === '' || $a['key'] !== $b['key']) { return null; }
    foreach (['county', 'country'] as $k) { if ($a[$k] !== '' && $b[$k] !== '' && ld_fold($a[$k]) !== ld_fold($b[$k])) { return null; } }
    if ($a['code'] !== '' && $b['code'] !== '' && ltrim($a['code'], '0') !== ltrim($b['code'], '0')) { return null; }
    if ($a['insee'] !== '' && $b['insee'] !== '' && $a['insee'] !== $b['insee']) { return null; }
    $km = $a['lat'] !== null && $b['lat'] !== null ? ld_km($a['lat'], $a['lon'], $b['lat'], $b['lon']) : null;
    if ($km !== null && $km > 10) { return null; }
    if ($a['insee'] !== '' && $a['insee'] === $b['insee']) { return ['sure', 'insee']; }
    if ($km !== null && $km <= 1) { return ['sure', 'coords']; }
    if ($a['county'] !== '' && $b['county'] !== '') { return ['sure', $a['split'] || $b['split'] ? 'full_name' : 'same_county']; }
    if ($a['code'] !== '' && $b['code'] !== '') { return ['sure', 'same_county']; }
    return ['medium', 'no_county'];
}

/** Qui garder : un nom propre (sans virgules), puis le plus de liens, puis le plus complet, puis le plus ancien */
function ld_score(array $p): float
{
    return ($p['split'] ? 0 : 1000) + min(900, (int) ($p['links'] ?? 0)) + ($p['lat'] !== null ? 50 : 0) + ($p['insee'] !== '' ? 30 : 0) + ($p['own_county'] !== '' ? 20 : 0) - (int) $p['id'] / 1e9;
}

/* ═════ les colonnes qui désignent un lieu ═════ */

/** [[table, colonne, colonne_type|null]] : place_id, *_place_id, clés étrangères vers places, liens « type = 'place' » */
function ld_refs(PDO $pdo): array
{
    $out = [];
    foreach ($pdo->query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")->fetchAll(PDO::FETCH_COLUMN) as $t) {
        if ($t === 'places' || !preg_match('/^[a-z_][a-z0-9_]*$/', $t)) { continue; }
        $journal = (bool) preg_match('/(^|_)(log|undo|trash|history_log|journal)($|_)|^change_log$|^ro_undo$/', $t);
        $cols = array_map(static fn($c) => (string) $c['name'], $pdo->query("PRAGMA table_info({$t})")->fetchAll(PDO::FETCH_ASSOC));
        $seen = [];
        foreach ($cols as $c) { if (preg_match('/^(place_id|[a-z0-9_]+_place_id)$/', $c)) { $seen[$c] = true; } }
        foreach ($pdo->query("PRAGMA foreign_key_list({$t})")->fetchAll(PDO::FETCH_ASSOC) as $fk) { if ($fk['table'] === 'places' && in_array($fk['from'], $cols, true)) { $seen[(string) $fk['from']] = true; } }
        if ($journal) { $seen = []; }
        foreach (array_keys($seen) as $c) { $out[] = [$t, $c, null]; }
        if ($journal) { continue; }
        foreach ($cols as $c) {
            $idCol = null;
            if (preg_match('/^(.+)_type$/', $c, $m) && in_array($m[1] . '_id', $cols, true)) { $idCol = $m[1] . '_id'; }
            elseif ($c === 'kind' && in_array('ref_id', $cols, true)) { $idCol = 'ref_id'; }
            if ($idCol && !isset($seen[$idCol])) { $out[] = [$t, $idCol, $c]; }
        }
    }
    return $out;
}

/** Nombre de liens de chaque lieu demandé (toutes les tables) */
function ld_links(PDO $pdo, array $ids, ?array $refs = null): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    $out = array_fill_keys($ids, 0);
    if (!$ids) { return $out; }
    foreach ($refs ?? ld_refs($pdo) as [$t, $c, $tc]) {
        foreach (array_chunk($ids, 400) as $chunk) {
            $in = implode(',', $chunk);
            try {
                foreach ($pdo->query("SELECT {$c} AS pid, count(*) AS n FROM {$t} WHERE {$c} IN ({$in})" . ($tc ? " AND {$tc}='place'" : '') . " GROUP BY {$c}")->fetchAll(PDO::FETCH_ASSOC) as $r) { $out[(int) $r['pid']] = ($out[(int) $r['pid']] ?? 0) + (int) $r['n']; }
            } catch (Throwable $_) {}
        }
    }
    return $out;
}

/** Ce qui bouge, table par table */
function ld_counts(PDO $pdo, int $id, ?array $refs = null): array
{
    $out = [];
    foreach ($refs ?? ld_refs($pdo) as [$t, $c, $tc]) {
        try { $n = (int) $pdo->query("SELECT count(*) FROM {$t} WHERE {$c}={$id}" . ($tc ? " AND {$tc}='place'" : ''))->fetchColumn(); } catch (Throwable $_) { $n = 0; }
        if ($n) { $out[$t] = ($out[$t] ?? 0) + $n; }
    }
    return $out;
}

/* ═════ détection ═════ */

/** Lieux « de ta généalogie » (pas les communes livrées jamais utilisées) */
function ld_base_where(PDO $pdo): string
{
    return function_exists('picker_place_used_sql') ? picker_place_used_sql($pdo, 'pl') : '1';
}

/**
 * Les groupes : [{key, survivor, duplicates: [{place, confidence, reason, links}], confidence}]
 * $names : seulement ces noms (le menu de choix) ; null : toute la base.
 */
function ld_detect(PDO $pdo, ?array $names = null): array
{
    $where = ld_base_where($pdo);
    $rows = [];
    $cols = 'pl.id, pl.name, pl.county, pl.state, pl.country, pl.subdivision, pl.latitude, pl.longitude, pl.admin2_code, pl.admin4_code, pl.population, pl.geoname_id, pl.alternate_names';
    if ($names === null) {
        $rows = $pdo->query("SELECT {$cols} FROM places pl WHERE trim(COALESCE(pl.name,''))<>'' AND {$where}")->fetchAll(PDO::FETCH_ASSOC);
    } else {
        $seen = [];
        foreach (array_slice(array_values(array_unique(array_filter(array_map(static fn($n) => trim(explode(',', preg_replace('/\s*\(.*$/u', '', (string) $n) ?? '')[0]), $names)))), 0, 20) as $n) {
            if (mb_strlen($n) < 2) { continue; }
            $s = $pdo->prepare("SELECT {$cols} FROM places pl WHERE (pl.name = ? COLLATE NOCASE OR pl.name LIKE ? OR pl.name LIKE ?) AND {$where} LIMIT 200");
            $s->execute([$n, $n . ',%', $n . ' (%']);
            foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { $seen[(int) $r['id']] = $r; }
        }
        $rows = array_values($seen);
    }
    $buckets = [];
    foreach ($rows as $r) { $p = ld_parse($r); if ($p['key'] !== '') { $buckets[$p['key']][] = $p; } }
    $buckets = array_filter($buckets, static fn($b) => count($b) > 1);
    if (!$buckets) { return []; }
    $refs = ld_refs($pdo);
    $links = ld_links($pdo, array_merge(...array_map(static fn($b) => array_column($b, 'id'), array_values($buckets))), $refs);
    $groups = [];
    foreach ($buckets as $key => $items) {
        foreach ($items as &$it) { $it['links'] = $links[$it['id']] ?? 0; }
        unset($it);
        // d'abord ceux qui disent leur département (ils forment les groupes), puis les autres
        usort($items, static fn($a, $b) => [($a['county'] === '' && $a['code'] === '') ? 1 : 0, -ld_score($a)] <=> [($b['county'] === '' && $b['code'] === '') ? 1 : 0, -ld_score($b)]);
        $clusters = [];
        $loose = [];
        foreach ($items as $it) {
            $ok = [];
            foreach ($clusters as $ci => $cl) {
                $all = true;
                foreach ($cl as $m) { if (ld_pair($it, $m) === null) { $all = false; break; } }
                if ($all) { $ok[] = $ci; }
            }
            if (!$ok) { $clusters[] = [$it]; continue; }
            if (count($ok) === 1) { $clusters[$ok[0]][] = $it; continue; }
            $loose[] = [$it, $ok]; // sans département : plusieurs communes possibles
        }
        foreach ($clusters as $ci => $cl) {
            $amb = array_values(array_filter($loose, static fn($l) => $l[1][0] === $ci));
            if (count($cl) < 2 && !$amb) { continue; }
            usort($cl, static fn($a, $b) => ld_score($b) <=> ld_score($a));
            $surv = $cl[0];
            $dups = [];
            foreach (array_slice($cl, 1) as $d) { [$conf, $why] = ld_pair($d, $surv) ?? ['medium', 'no_county']; $dups[] = ld_dup_out($d, $conf, $why); }
            foreach ($amb as [$d, $ok]) { $dups[] = ld_dup_out($d, 'low', 'ambiguous') + ['choices' => count($ok)]; }
            $rank = ['sure' => 0, 'medium' => 1, 'low' => 2];
            usort($dups, static fn($a, $b) => $rank[$a['confidence']] <=> $rank[$b['confidence']]);
            $groups[] = ['key' => $key, 'survivor' => ld_place_out($surv), 'duplicates' => $dups, 'confidence' => $dups[0]['confidence'] ?? 'low'];
        }
    }
    usort($groups, static fn($a, $b) => strcmp($a['key'], $b['key']));
    return $groups;
}

function ld_place_out(array $p): array
{
    $r = $p['row'];
    return ['id' => $p['id'], 'name' => $p['name'], 'county' => (string) ($r['county'] ?? ''), 'state' => (string) ($r['state'] ?? ''), 'country' => (string) ($r['country'] ?? ''),
        'insee' => $p['insee'], 'lat' => $p['lat'], 'lon' => $p['lon'], 'links' => (int) ($p['links'] ?? 0), 'seen_county' => $p['county']];
}

const LD_REASONS = [
    'insee' => 'Même code INSEE',
    'coords' => 'Au même endroit (moins de 1 km)',
    'full_name' => 'Le nom complet reprend ce lieu (import)',
    'same_county' => 'Même nom, même département',
    'no_county' => 'Même nom ; l’un des deux n’a pas de département',
    'ambiguous' => 'Même nom, sans département : plusieurs communes possibles',
];

function ld_dup_out(array $d, string $conf, string $why): array
{
    return ['place' => ld_place_out($d), 'confidence' => $conf, 'reason' => $why, 'reason_text' => LD_REASONS[$why] ?? $why, 'empty' => (int) ($d['links'] ?? 0) === 0];
}

/** Le menu de choix : sur la ligne la plus faible, « ≈ même lieu que Pernay (Indre-et-Loire) ? » */
function ld_picker_hints(PDO $pdo, array &$items): void
{
    if (!$items || (function_exists('kiosk_state') && !empty(kiosk_state()['on']))) { return; }
    try {
        $groups = ld_detect($pdo, array_map(static fn($it) => (string) ($it['name'] ?? $it['title'] ?? ''), $items));
    } catch (Throwable $e) { error_log('[lieux_doublons] ' . $e->getMessage()); return; }
    $of = [];
    foreach ($groups as $g) { foreach ($g['duplicates'] as $d) { if ($d['confidence'] !== 'low') { $of[(int) $d['place']['id']] = ['id' => $g['survivor']['id'], 'name' => $g['survivor']['name'], 'county' => $g['survivor']['county'] ?: $g['survivor']['seen_county'], 'confidence' => $d['confidence'], 'reason' => $d['reason_text'], 'empty' => $d['empty']]; } } }
    foreach ($items as &$it) { if (isset($it['id'], $of[(int) $it['id']])) { $it['dup_of'] = $of[(int) $it['id']]; } }
    unset($it);
}

/* ═════ aperçu, fusion, ↶ ═════ */

function ld_row(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT * FROM places WHERE id=?'); $s->execute([$id]);
    $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { throw new LcndaBadInput('Ce lieu n’existe plus (déjà fusionné ou supprimé ?). Recharge la liste.'); }
    return $r;
}

function ld_ids(array $q): array
{
    $from = safe_int($q['from'] ?? 0); $to = safe_int($q['to'] ?? 0);
    if ($from <= 0 || $to <= 0) { throw new LcndaBadInput('Choisis les deux lieux.'); }
    if ($from === $to) { throw new LcndaBadInput('Choisis deux lieux différents.'); }
    return [$from, $to];
}

/** Ce que le lieu gardé recevra du doublon (seulement ce qui lui manque) */
function ld_enrich(array $keep, array $dup): array
{
    $k = ld_parse($keep); $d = ld_parse($dup);
    $set = [];
    $empty = static fn($v) => $v === null || trim((string) $v) === '';
    if ($k['lat'] === null && $d['lat'] !== null) { $set['latitude'] = $dup['latitude']; $set['longitude'] = $dup['longitude']; }
    foreach (['admin4_code', 'admin2_code', 'admin1_code', 'admin3_code', 'subdivision', 'geoname_id', 'feature_code', 'altitude', 'description', 'uid'] as $c) {
        if (array_key_exists($c, $keep) && $empty($keep[$c]) && !$empty($dup[$c] ?? null)) { $set[$c] = $dup[$c]; }
    }
    foreach (['county', 'state', 'country'] as $c) { if ($empty($keep[$c] ?? null) && $d[$c] !== '') { $set[$c] = $d[$c]; } }
    if ((int) ($dup['population'] ?? 0) > (int) ($keep['population'] ?? 0) && $empty($keep['population'] ?? null)) { $set['population'] = $dup['population']; }
    // le nom du doublon devient un autre nom du lieu gardé (s'il dit autre chose)
    $alts = array_values(array_filter(array_map('trim', explode(',', (string) ($keep['alternate_names'] ?? ''))), static fn($x) => $x !== ''));
    $foldAlts = array_map('ld_fold', $alts);
    $add = [];
    foreach (array_merge([$d['base']], array_filter(array_map('trim', explode(',', (string) ($dup['alternate_names'] ?? ''))))) as $n) {
        $f = ld_fold($n);
        if ($f === '' || $f === ld_fold($k['base']) || in_array($f, $foldAlts, true)) { continue; }
        $add[] = $n; $foldAlts[] = $f;
    }
    if ($add) { $set['alternate_names'] = implode(', ', array_merge($alts, $add)); }
    return $set;
}

function ld_preview(PDO $pdo, array $q): array
{
    [$from, $to] = ld_ids($q);
    $a = ld_row($pdo, $from); $b = ld_row($pdo, $to);
    $refs = ld_refs($pdo);
    $moves = ld_counts($pdo, $from, $refs);
    $back = ld_counts($pdo, $to, $refs);
    $pair = ld_pair(ld_parse($a), ld_parse($b));
    return ['from' => $a + ['links' => array_sum($moves)], 'to' => $b + ['links' => array_sum($back)], 'moves' => $moves, 'total' => array_sum($moves),
        'events' => $moves['events'] ?? 0, 'gets' => ld_enrich($b, $a),
        'confidence' => $pair[0] ?? null, 'reason' => $pair ? (LD_REASONS[$pair[1]] ?? '') : '',
        'warning' => $pair === null ? 'Ces deux lieux ne semblent pas être le même (département, pays, code INSEE ou position différents). Vérifie avant de fusionner.' : ''];
}

/** Fusion d'un lieu dans un autre (dans la transaction de l'appelant). Rend ce qu'il faut pour ↶. */
function ld_merge_pair(PDO $pdo, int $from, int $to, ?array $refs = null): array
{
    $dup = ld_row($pdo, $from); $keep = ld_row($pdo, $to);
    $changes = []; $deleted = [];
    foreach ($refs ?? ld_refs($pdo) as [$t, $c, $tc]) {
        try { $rids = $pdo->query("SELECT rowid FROM {$t} WHERE {$c}={$from}" . ($tc ? " AND {$tc}='place'" : ''))->fetchAll(PDO::FETCH_COLUMN); } catch (Throwable $_) { continue; }
        foreach ($rids as $rid) {
            $rid = (int) $rid;
            try {
                $pdo->exec("UPDATE {$t} SET {$c}={$to} WHERE rowid={$rid}");
                $changes[] = [$t, $c, $rid];
            } catch (PDOException $e) {
                if (stripos($e->getMessage(), 'UNIQUE') === false) { throw $e; }
                // le lieu gardé a déjà la même ligne (même année de population, même étiquette…) : celle du doublon est mise de côté
                $row = $pdo->query("SELECT rowid AS ld_rowid, * FROM {$t} WHERE rowid={$rid}")->fetch(PDO::FETCH_ASSOC);
                $pdo->exec("DELETE FROM {$t} WHERE rowid={$rid}");
                $deleted[] = [$t, $row];
            }
        }
    }
    $set = ld_enrich($keep, $dup);
    $pdo->prepare('DELETE FROM places WHERE id=?')->execute([$from]);
    if ($set) {
        $pdo->prepare('UPDATE places SET ' . implode(', ', array_map(static fn($c) => ro_ident($c) . '=?', array_keys($set))) . ' WHERE id=?')->execute([...array_values($set), $to]);
    }
    return ['from' => $from, 'to' => $to, 'dup' => $dup, 'keep_before' => $keep, 'set' => $set, 'changes' => $changes, 'deleted' => $deleted];
}

function ld_summary(array $m): string
{
    return sprintf('Lieu « %s » (n° %d) fusionné dans « %s » (n° %d) : %d lien(s) déplacé(s)', $m['dup']['name'], $m['from'], $m['keep_before']['name'], $m['to'], count($m['changes']) + count($m['deleted']));
}

function ld_merge(PDO $pdo, array $data): array
{
    [$from, $to] = ld_ids($data);
    ro_ensure($pdo);
    $m = ld_merge_pair($pdo, $from, $to);
    $summary = ld_summary($m);
    $undoId = ro_undo_save($pdo, 'ld_merge', $summary, ['merges' => [$m]]);
    log_change($pdo, 'place', $to, 'merge', $summary, ['kept' => $m['keep_before'], 'removed' => $m['dup']], ['place_id' => $to, 'filled' => $m['set'], 'moved' => count($m['changes']), 'set_aside' => count($m['deleted']), 'undo_id' => $undoId]);
    return ['undo_id' => $undoId, 'moved' => count($m['changes']), 'set_aside' => count($m['deleted']), 'kept' => ['id' => $to, 'name' => $m['keep_before']['name']], 'removed' => ['id' => $from, 'name' => $m['dup']['name']]];
}

/** « Tout fusionner (sûrs seulement) » : les groupes de confiance « sure », un seul ↶ pour tout */
function ld_merge_safe(PDO $pdo, array $data): array
{
    ro_ensure($pdo);
    $refs = ld_refs($pdo);
    $merges = [];
    foreach (ld_detect($pdo) as $g) {
        foreach ($g['duplicates'] as $d) {
            if ($d['confidence'] !== 'sure') { continue; }
            $merges[] = ld_merge_pair($pdo, (int) $d['place']['id'], (int) $g['survivor']['id'], $refs);
        }
    }
    if (!$merges) { return ['merged' => 0, 'undo_id' => 0]; }
    $summary = sprintf('Lieux en double : %d fusion(s) sûre(s)', count($merges));
    $undoId = ro_undo_save($pdo, 'ld_merge', $summary, ['merges' => $merges]);
    log_change($pdo, 'place', null, 'merge-duplicates', $summary, null, ['merges' => array_map(static fn($m) => ['survivor_id' => $m['to'], 'removed_id' => $m['from'], 'name' => $m['dup']['name']], $merges), 'undo_id' => $undoId]);
    return ['merged' => count($merges), 'undo_id' => $undoId, 'moved' => array_sum(array_map(static fn($m) => count($m['changes']), $merges))];
}

/** ↶ : le lieu gardé reprend ses valeurs, le doublon revient avec son n°, chaque ligne repart vers lui, les lignes mises de côté reviennent */
function ld_undo(PDO $pdo, array $data): array
{
    $row = ro_undo_row($pdo, safe_int($data['id'] ?? 0));
    if ($row['kind'] !== 'ld_merge') { throw new LcndaBadInput('Rien à annuler ici.'); }
    if ((int) $row['undone'] === 1) { return ['already' => true]; }
    $n = 0;
    foreach (array_reverse($row['payload']['merges'] ?? []) as $m) {
        $from = (int) $m['from']; $to = (int) $m['to'];
        if ($m['set']) {
            $cols = array_keys($m['set']);
            $pdo->prepare('UPDATE places SET ' . implode(', ', array_map(static fn($c) => ro_ident((string) $c) . '=?', $cols)) . ' WHERE id=?')->execute([...array_map(static fn($c) => $m['keep_before'][$c] ?? null, $cols), $to]);
        }
        $ex = $pdo->prepare('SELECT 1 FROM places WHERE id=?'); $ex->execute([$from]);
        if ($ex->fetchColumn()) { throw new RuntimeException('Impossible d’annuler : le lieu n° ' . $from . ' existe de nouveau.'); }
        insert_snapshot_row($pdo, 'places', $m['dup']);
        foreach ($m['changes'] as [$t, $c, $rid]) {
            $t = ro_ident((string) $t); $c = ro_ident((string) $c);
            $n += $pdo->exec("UPDATE {$t} SET {$c}={$from} WHERE rowid=" . (int) $rid . " AND {$c}={$to}");
        }
        foreach ($m['deleted'] as [$t, $r]) {
            $t = ro_ident((string) $t);
            $rid = (int) ($r['ld_rowid'] ?? 0); unset($r['ld_rowid']);
            $cols = array_values(array_intersect(table_columns($pdo, $t), array_keys($r)));
            $withRowid = $rid && !in_array('id', $cols, true);
            $sql = "INSERT INTO {$t}(" . ($withRowid ? 'rowid,' : '') . implode(',', $cols) . ') VALUES(' . implode(',', array_fill(0, count($cols) + ($withRowid ? 1 : 0), '?')) . ')';
            $pdo->prepare($sql)->execute([...($withRowid ? [$rid] : []), ...array_map(static fn($c) => $r[$c], $cols)]);
            $n++;
        }
    }
    $pdo->prepare('UPDATE ro_undo SET undone=1 WHERE id=?')->execute([(int) $row['id']]);
    log_change($pdo, 'ro_undo', (int) $row['id'], 'restore', 'Annulé : ' . $row['summary'], null, ['count' => $n]);
    return ['undone' => $n];
}

/** Toutes les listes (Réglages) : les groupes, et combien sont sûrs */
function ld_groups(PDO $pdo): array
{
    $g = ld_detect($pdo);
    $safe = 0;
    foreach ($g as $x) { foreach ($x['duplicates'] as $d) { if ($d['confidence'] === 'sure') { $safe++; } } }
    return ['groups' => $g, 'safe' => $safe, 'total' => array_sum(array_map(static fn($x) => count($x['duplicates']), $g))];
}

/** Alertes du ✅ Contrôle de la base : « Lieu en double probable » */
function ld_controle_alerts(PDO $pdo): array
{
    $out = [];
    foreach (ld_detect($pdo) as $g) {
        foreach ($g['duplicates'] as $d) {
            if ($d['confidence'] === 'low') { continue; }
            $p = $d['place']; $s = $g['survivor'];
            $out[] = ['key' => 'place-dup:' . $p['id'] . ':' . $s['id'], 'check' => 'place-dup', 'sort' => 'lieux', 'sub' => 'dup', 'level' => 'yellow',
                'title' => 'Lieu en double probable : « ' . $p['name'] . ' »',
                'detail' => '≈ ' . $s['name'] . ($s['county'] ? ' (' . $s['county'] . ')' : '') . ' · ' . $d['reason_text'] . ' · ' . ($p['links'] ? $p['links'] . ' lien(s)' : 'aucun lien'),
                'people' => [], 'place' => ['id' => $p['id'], 'name' => $p['name'], 'county' => $p['county'], 'country' => $p['country'], 'lat' => (float) ($p['lat'] ?? 0), 'lon' => (float) ($p['lon'] ?? 0), 'n' => $p['links']],
                'dup' => ['from' => $p['id'], 'to' => $s['id']], 'fp' => md5($p['name'] . '|' . $s['name'])];
        }
    }
    return $out;
}

function ld_dispatch(PDO $pdo, string $action, bool $isWrite, array $data): never
{
    require_once __DIR__ . '/recherche_outils.php';
    ro_ensure($pdo);
    try {
        if (!$isWrite) {
            json_response(match ($action) {
                'ld_groups' => ld_groups($pdo),
                'ld_preview' => ld_preview($pdo, $_GET),
                default => throw new LcndaBadInput('Action inconnue'),
            });
        }
        $pdo->beginTransaction();
        try {
            $result = match ($action) {
                'ld_merge' => ld_merge($pdo, $data),
                'ld_merge_safe' => ld_merge_safe($pdo, $data),
                'ld_undo' => ld_undo($pdo, $data),
                default => throw new LcndaBadInput('Action d’écriture inconnue'),
            };
            $pdo->commit();
        } catch (Throwable $e) { if ($pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
        json_response(['ok' => true, 'result' => $result]);
    } catch (Throwable $e) {
        json_response(['error' => function_exists('readable_error_message') ? readable_error_message($e) : $e->getMessage()], 422);
    }
}
