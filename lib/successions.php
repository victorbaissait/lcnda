<?php
declare(strict_types=1);

/**
 * 🏠 Héritages et successions (Listes → Médias et documents → « 🏠 Héritages et successions », assets/js/heritage-successions.js).
 * Qui a hérité de quoi d'après les actes : testament, partage, inventaire après décès, donation, vente entre héritiers,
 * contrat de mariage (dot), déclaration de succession. Construit sur l'existant :
 *  - les biens renvoient aux maisons (houses), aux parcelles du cadastre (cadastre_parcels), aux objets de famille
 *    (family_objects, dont la transmission family_object_transfers entre dans la chaîne des propriétaires) ;
 *  - un inventaire après décès peut être relié à sa fiche de la liste « Inventaires après décès » (probate_inventories) ;
 *  - personnes par le menu de choix à rôles, lieu, source, médias par la fenêtre unique.
 * Tables (migration 79) : succession_acts, succession_people, succession_goods. Supprimer = deleted_at (↶ Annuler).
 * Aucun conseil juridique : on note ce que disent les actes.
 */

const SUCC_KINDS = ['testament', 'partage', 'inventaire', 'donation', 'vente', 'contrat', 'declaration', 'autre'];
const SUCC_GOOD_KINDS = ['house', 'parcel', 'object', 'land', 'money', 'furniture', 'other'];
const SUCC_UNITS = ['', 'livre', 'sou', 'denier', 'ecu', 'franc', 'ancien', 'centime', 'euro'];
const SUCC_ZONES = ['main', 'primary', 'secondary'];
const SUCC_PEOPLE_MAX = 200;
const SUCC_GOODS_MAX = 300;

function successions_schema(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS succession_acts (id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL DEFAULT 'autre', title TEXT NOT NULL DEFAULT '', date_text TEXT NOT NULL DEFAULT '', year INTEGER,
        notary_person_id INTEGER, notary_text TEXT NOT NULL DEFAULT '', office_text TEXT NOT NULL DEFAULT '',
        place_id INTEGER, place_text TEXT NOT NULL DEFAULT '', cote TEXT NOT NULL DEFAULT '', source_id INTEGER, probate_id INTEGER,
        media_json TEXT NOT NULL DEFAULT '[]', notes TEXT NOT NULL DEFAULT '', deleted_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS succession_people (id INTEGER PRIMARY KEY AUTOINCREMENT, act_id INTEGER NOT NULL,
        person_id INTEGER, txt TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT '', zone TEXT NOT NULL DEFAULT 'primary', position INTEGER NOT NULL DEFAULT 0)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS succession_goods (id INTEGER PRIMARY KEY AUTOINCREMENT, act_id INTEGER NOT NULL,
        kind TEXT NOT NULL DEFAULT 'other', ref_id INTEGER, label TEXT NOT NULL DEFAULT '', value_amount REAL, value_unit TEXT NOT NULL DEFAULT '',
        value_text TEXT NOT NULL DEFAULT '', share_text TEXT NOT NULL DEFAULT '', to_json TEXT NOT NULL DEFAULT '[]', note TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_succ_people_act ON succession_people(act_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_succ_people_person ON succession_people(person_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_succ_goods_act ON succession_goods(act_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_succ_goods_ref ON succession_goods(kind, ref_id)');
}

/** lecture seule : les tables sont-elles là ? (jamais de CREATE pendant la lecture d'une fiche : « base verrouillée ») */
function successions_ready(PDO $pdo): bool
{
    static $ok = [];
    $k = spl_object_id($pdo);
    if (!empty($ok[$k])) { return true; }
    $n = (int) $pdo->query("SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('succession_acts','succession_people','succession_goods')")->fetchColumn();
    return $ok[$k] = $n === 3;
}

function succ_text(mixed $v, int $max): string
{
    return mb_substr(trim((string) preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', safe_text($v))), 0, $max);
}

function succ_year(string $date): ?int
{
    return preg_match('/\b(1[0-9]{3}|20[0-9]{2})\b/', $date, $m) ? (int) $m[1] : null;
}

function succ_exists(PDO $pdo, string $table, int $id): bool
{
    if ($id <= 0) { return false; }
    try { $s = $pdo->prepare("SELECT 1 FROM {$table} WHERE id=?"); $s->execute([$id]); return (bool) $s->fetchColumn(); } catch (Throwable $_) { return false; }
}

/** id → « Prénom NOM » (et le sexe) */
function succ_people_info(PDO $pdo, array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    $out = [];
    foreach (array_chunk($ids, 400) as $chunk) {
        foreach ($pdo->query('SELECT id, first_name, last_name, gender FROM persons WHERE id IN (' . implode(',', $chunk) . ')')->fetchAll(PDO::FETCH_ASSOC) as $p) {
            $out[(int) $p['id']] = ['name' => trim(trim((string) $p['first_name']) . ' ' . mb_strtoupper(trim((string) $p['last_name']))) ?: 'Sans nom', 'gender' => (string) $p['gender'],
                'first_name' => (string) $p['first_name'], 'last_name' => (string) $p['last_name']];
        }
    }
    return $out;
}

/** id → titre, pour une table qui peut manquer (ancienne base) */
function succ_titles(PDO $pdo, string $kind, array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    if (!$ids) { return []; }
    $in = implode(',', $ids);
    $out = [];
    try {
        if ($kind === 'house') { foreach ($pdo->query("SELECT id, name AS t, place_text AS m FROM houses WHERE id IN ($in)")->fetchAll(PDO::FETCH_ASSOC) as $r) { $out[(int) $r['id']] = ['title' => (string) $r['t'] ?: 'Maison', 'meta' => (string) $r['m']]; } }
        elseif ($kind === 'object') { foreach ($pdo->query("SELECT id, title AS t, kind AS m FROM family_objects WHERE id IN ($in)")->fetchAll(PDO::FETCH_ASSOC) as $r) { $out[(int) $r['id']] = ['title' => (string) $r['t'], 'meta' => (string) $r['m']]; } }
        elseif ($kind === 'parcel') {
            foreach ($pdo->query("SELECT id, section, numero, lieu_dit, commune_name FROM cadastre_parcels WHERE id IN ($in)")->fetchAll(PDO::FETCH_ASSOC) as $r) {
                $t = function_exists('cadastre_title') ? cadastre_title($r) : trim($r['section'] . ' ' . $r['numero']);
                $out[(int) $r['id']] = ['title' => $t . ($r['commune_name'] !== '' ? ' · ' . $r['commune_name'] : ''), 'meta' => (string) $r['lieu_dit']];
            }
        }
    } catch (Throwable $_) { return []; }
    return $out;
}

/* ─────────────── Lire ─────────────── */

/** Les actes (sans les supprimés), avec leurs personnes et leurs biens, noms relus. $ids = seulement ceux-là. */
function succession_rows(PDO $pdo, ?array $ids = null, bool $withDeleted = false): array
{
    if (!successions_ready($pdo)) { return []; }
    $where = $withDeleted ? '1' : 'a.deleted_at IS NULL';
    if ($ids !== null) {
        $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
        if (!$ids) { return []; }
        $where .= ' AND a.id IN (' . implode(',', $ids) . ')';
    }
    $acts = $pdo->query("SELECT a.*, pl.name AS place_name, s.title AS source_title FROM succession_acts a LEFT JOIN places pl ON pl.id=a.place_id LEFT JOIN sources s ON s.id=a.source_id WHERE {$where} ORDER BY COALESCE(a.year, 99999), a.date_text, a.id")->fetchAll(PDO::FETCH_ASSOC);
    if (!$acts) { return []; }
    $actIds = implode(',', array_map(static fn($a) => (int) $a['id'], $acts));
    $people = $pdo->query("SELECT * FROM succession_people WHERE act_id IN ($actIds) ORDER BY act_id, position, id")->fetchAll(PDO::FETCH_ASSOC);
    $goods = $pdo->query("SELECT * FROM succession_goods WHERE act_id IN ($actIds) ORDER BY act_id, position, id")->fetchAll(PDO::FETCH_ASSOC);
    $pIds = array_merge(array_column($people, 'person_id'), array_column($acts, 'notary_person_id'));
    $refs = [];
    foreach ($goods as $g) { if ((int) $g['ref_id'] > 0) { $refs[$g['kind']][] = (int) $g['ref_id']; } }
    $info = succ_people_info($pdo, $pIds);
    $titles = []; foreach (['house', 'parcel', 'object'] as $k) { $titles[$k] = succ_titles($pdo, $k, $refs[$k] ?? []); }
    $probates = [];
    $pr = array_values(array_filter(array_map('intval', array_column($acts, 'probate_id'))));
    if ($pr) { try { foreach ($pdo->query('SELECT id, date_text, notary FROM probate_inventories WHERE id IN (' . implode(',', $pr) . ')')->fetchAll(PDO::FETCH_ASSOC) as $r) { $probates[(int) $r['id']] = trim('Inventaire ' . $r['date_text'] . ($r['notary'] !== '' ? ' · ' . $r['notary'] : '')); } } catch (Throwable $_) {} }
    $mediaIds = [];
    foreach ($acts as $a) { foreach ((array) json_decode((string) $a['media_json'], true) as $m) { $mediaIds[] = (int) $m; } }
    $media = [];
    $mediaIds = array_values(array_unique(array_filter($mediaIds)));
    if ($mediaIds) { foreach ($pdo->query('SELECT id, title, filename, thumbnail, media_type FROM media WHERE id IN (' . implode(',', $mediaIds) . ')')->fetchAll(PDO::FETCH_ASSOC) as $m) { $media[(int) $m['id']] = ['id' => (int) $m['id'], 'title' => (string) ($m['title'] ?: $m['filename']), 'filename' => (string) $m['filename'], 'thumbnail' => (string) ($m['thumbnail'] ?? ''), 'media_type' => (string) $m['media_type']]; } }
    $byAct = [];
    foreach ($people as $p) {
        $pid = (int) $p['person_id'];
        $byAct[(int) $p['act_id']]['people'][] = ['id' => $pid ?: null, 'txt' => $pid ? '' : (string) $p['txt'], 'title' => $pid ? ($info[$pid]['name'] ?? 'Fiche supprimée') : (string) $p['txt'],
            'gender' => $pid ? ($info[$pid]['gender'] ?? '') : '', 'gone' => $pid && !isset($info[$pid]), 'role' => (string) $p['role'], 'zone' => (string) $p['zone']];
    }
    foreach ($goods as $g) {
        $k = (string) $g['kind']; $rid = (int) $g['ref_id'];
        $ref = $rid && isset($titles[$k][$rid]) ? $titles[$k][$rid] : null;
        $to = array_values(array_filter((array) json_decode((string) $g['to_json'], true), static fn($x) => is_scalar($x) && (string) $x !== ''));
        $byAct[(int) $g['act_id']]['goods'][] = ['kind' => $k, 'ref_id' => $rid ?: null, 'ref_title' => $ref['title'] ?? '', 'ref_meta' => $ref['meta'] ?? '', 'gone' => $rid && !$ref,
            'label' => (string) $g['label'], 'value_amount' => $g['value_amount'] === null ? null : (float) $g['value_amount'], 'value_unit' => (string) $g['value_unit'],
            'value_text' => (string) $g['value_text'], 'share_text' => (string) $g['share_text'], 'to' => array_map('strval', $to), 'note' => (string) $g['note']];
    }
    return array_map(static function ($a) use ($byAct, $info, $probates, $media) {
        $id = (int) $a['id']; $np = (int) $a['notary_person_id'];
        $mids = array_values(array_filter(array_map('intval', (array) json_decode((string) $a['media_json'], true))));
        return ['id' => $id, 'kind' => in_array($a['kind'], SUCC_KINDS, true) ? $a['kind'] : 'autre', 'title' => (string) $a['title'], 'date_text' => (string) $a['date_text'], 'year' => $a['year'] === null ? null : (int) $a['year'],
            'notary_person_id' => $np ?: null, 'notary' => $np ? ($info[$np]['name'] ?? 'Fiche supprimée') : (string) $a['notary_text'], 'notary_text' => (string) $a['notary_text'], 'office_text' => (string) $a['office_text'],
            'place_id' => (int) $a['place_id'] ?: null, 'place' => (string) ($a['place_name'] ?? '') ?: (string) $a['place_text'], 'cote' => (string) $a['cote'],
            'source_id' => (int) $a['source_id'] ?: null, 'source_title' => (string) ($a['source_title'] ?? ''), 'probate_id' => (int) $a['probate_id'] ?: null, 'probate_title' => $probates[(int) $a['probate_id']] ?? '',
            'media' => array_values(array_filter(array_map(static fn($m) => $media[$m] ?? null, $mids))), 'media_ids' => $mids,
            'notes' => (string) $a['notes'], 'deleted' => $a['deleted_at'] !== null, 'created_at' => (string) $a['created_at'], 'updated_at' => (string) $a['updated_at'],
            'people' => $byAct[$id]['people'] ?? [], 'goods' => $byAct[$id]['goods'] ?? []];
    }, $acts);
}

function successions_list(PDO $pdo): array
{
    return succession_rows($pdo);
}

function succession_get(PDO $pdo, int $id): array
{
    $r = succession_rows($pdo, [$id], true)[0] ?? null;
    if (!$r) { throw new RuntimeException('Acte introuvable (supprimé ?).'); }
    return $r;
}

/** la clé d'une personne d'un acte : « 12 » (fiche) ou « txt:Nom » */
function succ_key(array $p): string
{
    return !empty($p['id']) ? (string) (int) $p['id'] : 'txt:' . (string) ($p['txt'] ?: $p['title']);
}

/** qui reçoit un bien : les personnes cochées, sinon tous les bénéficiaires (zone « primary ») de l'acte */
function succ_recipients(array $act, array $good): array
{
    $ben = array_values(array_filter($act['people'], static fn($p) => $p['zone'] === 'primary'));
    if (!$good['to']) { return $ben; }
    $by = []; foreach ($act['people'] as $p) { $by[succ_key($p)] = $p; }
    return array_values(array_filter(array_map(static fn($k) => $by[$k] ?? null, $good['to'])));
}

/** 👤 la fiche d'une personne : « Ce qu'il a reçu / transmis » */
function successions_for_person(PDO $pdo, int $personId): array
{
    if ($personId <= 0 || !successions_ready($pdo)) { return []; }
    $s = $pdo->prepare('SELECT DISTINCT a.id FROM succession_people p JOIN succession_acts a ON a.id=p.act_id WHERE p.person_id=? AND a.deleted_at IS NULL');
    $s->execute([$personId]);
    $ids = array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN));
    if (!$ids) { return []; }
    $key = (string) $personId;
    $out = [];
    foreach (succession_rows($pdo, $ids) as $a) {
        $me = array_values(array_filter($a['people'], static fn($p) => (int) $p['id'] === $personId));
        $zone = in_array('main', array_column($me, 'zone'), true) ? 'main' : (in_array('primary', array_column($me, 'zone'), true) ? 'primary' : 'secondary');
        $received = [];
        foreach ($a['goods'] as $g) { if (in_array($key, array_map('succ_key', succ_recipients($a, $g)), true)) { $received[] = $g; } }
        $out[] = ['id' => $a['id'], 'kind' => $a['kind'], 'title' => $a['title'], 'date_text' => $a['date_text'], 'year' => $a['year'], 'place' => $a['place'], 'notary' => $a['notary'],
            'side' => $zone === 'main' ? 'gave' : ($zone === 'primary' ? 'got' : 'other'), 'role' => (string) ($me[0]['role'] ?? ''),
            'main' => array_values(array_filter($a['people'], static fn($p) => $p['zone'] === 'main')), 'received' => $received, 'goods' => $a['goods'],
            'beneficiaries' => array_values(array_filter($a['people'], static fn($p) => $p['zone'] === 'primary'))];
    }
    return $out;
}

/** 🏠 / ▦ / 🏺 la chaîne des propriétaires d'une maison, d'une parcelle ou d'un objet (actes, et transmission de l'objet) */
function succession_chain(PDO $pdo, string $kind, int $id): array
{
    if (!in_array($kind, ['house', 'parcel', 'object'], true) || $id <= 0) { throw new RuntimeException('Bien inconnu.'); }
    $steps = [];
    if (successions_ready($pdo)) {
        $s = $pdo->prepare('SELECT DISTINCT g.act_id FROM succession_goods g JOIN succession_acts a ON a.id=g.act_id WHERE g.kind=? AND g.ref_id=? AND a.deleted_at IS NULL');
        $s->execute([$kind, $id]);
        foreach (succession_rows($pdo, array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN))) as $a) {
            foreach ($a['goods'] as $g) {
                if ($g['kind'] !== $kind || (int) $g['ref_id'] !== $id) { continue; }
                $from = array_values(array_filter($a['people'], static fn($p) => $p['zone'] === 'main'));
                $steps[] = ['source' => 'act', 'act_id' => $a['id'], 'act_kind' => $a['kind'], 'act_title' => $a['title'], 'date_text' => $a['date_text'], 'year' => $a['year'],
                    'from' => array_map(static fn($p) => ['id' => $p['id'], 'title' => $p['title'], 'gender' => $p['gender'], 'role' => $p['role']], $from),
                    'to' => array_map(static fn($p) => ['id' => $p['id'], 'title' => $p['title'], 'gender' => $p['gender'], 'role' => $p['role']], succ_recipients($a, $g)),
                    'share' => $g['share_text'], 'value' => $g['value_text'], 'notary' => $a['notary'], 'place' => $a['place']];
            }
        }
    }
    if ($kind === 'object') { // la transmission notée sur l'objet de famille (Listes → Objets de famille)
        try {
            $t = $pdo->prepare('SELECT * FROM family_object_transfers WHERE object_id=? ORDER BY COALESCE(year, 99999), position, id'); $t->execute([$id]);
            $rows = $t->fetchAll(PDO::FETCH_ASSOC);
            $info = succ_people_info($pdo, array_merge(array_column($rows, 'from_person_id'), array_column($rows, 'to_person_id')));
            $who = static fn($pid, $txt) => (int) $pid > 0 ? ['id' => (int) $pid, 'title' => $info[(int) $pid]['name'] ?? 'Fiche supprimée', 'gender' => $info[(int) $pid]['gender'] ?? '', 'role' => ''] : ($txt !== '' ? ['id' => null, 'title' => (string) $txt, 'gender' => '', 'role' => ''] : null);
            foreach ($rows as $r) {
                $steps[] = ['source' => 'transfer', 'act_id' => null, 'act_kind' => '', 'act_title' => 'Transmission', 'date_text' => (string) $r['date_text'], 'year' => $r['year'] === null ? null : (int) $r['year'],
                    'from' => array_values(array_filter([$who($r['from_person_id'], $r['from_text'])])), 'to' => array_values(array_filter([$who($r['to_person_id'], $r['to_text'])])),
                    'share' => '', 'value' => '', 'notary' => '', 'place' => '', 'note' => (string) $r['note']];
            }
        } catch (Throwable $_) {}
    }
    usort($steps, static fn($a, $b) => [$a['year'] ?? 99999, $a['date_text']] <=> [$b['year'] ?? 99999, $b['date_text']]);
    $title = succ_titles($pdo, $kind, [$id])[$id]['title'] ?? '';
    return ['kind' => $kind, 'id' => $id, 'title' => $title, 'steps' => $steps];
}

/* ─────────────── Enregistrer, supprimer, remettre ─────────────── */

function succ_clean_people(PDO $pdo, mixed $v): array
{
    if (is_string($v)) { $v = json_decode($v, true); }
    if (!is_array($v)) { return []; }
    $out = []; $seen = [];
    $add = static function (mixed $x, string $zone) use ($pdo, &$out, &$seen): void {
        if (count($out) >= SUCC_PEOPLE_MAX) { throw new RuntimeException('Trop de personnes sur un seul acte (' . SUCC_PEOPLE_MAX . ' au plus).'); }
        if (is_numeric($x) || (is_string($x) && str_starts_with($x, 'txt:'))) { $x = is_numeric($x) ? ['id' => (int) $x] : ['txt' => substr($x, 4)]; }
        if (!is_array($x)) { return; }
        $id = safe_int($x['id'] ?? 0);
        $txt = $id > 0 ? '' : succ_text($x['txt'] ?? ($x['title'] ?? ''), 200);
        if ($id > 0 && !succ_exists($pdo, 'persons', $id)) { return; } // fiche supprimée entre-temps
        if ($id <= 0 && $txt === '') { return; }
        $k = ($id ?: 'txt:' . mb_strtolower($txt)) . '|' . $zone;
        if (isset($seen[$k])) { return; }
        $seen[$k] = true;
        $out[] = ['person_id' => $id > 0 ? $id : null, 'txt' => $txt, 'role' => succ_text($x['role'] ?? '', 80), 'zone' => $zone];
    };
    if (isset($v['main']) && $v['main'] !== null && $v['main'] !== '' && $v['main'] !== 0) { $add(is_array($v['main']) ? $v['main'] : $v['main'], 'main'); }
    foreach ((array) ($v['people'] ?? []) as $x) {
        if (!is_array($x)) { continue; }
        $zone = in_array($x['zone'] ?? '', SUCC_ZONES, true) ? $x['zone'] : (!empty($x['primary']) ? 'primary' : 'secondary');
        $add($x, $zone);
    }
    return $out;
}

function succ_clean_goods(PDO $pdo, mixed $v, array $people): array
{
    if (!is_array($v)) { return []; }
    if (count($v) > SUCC_GOODS_MAX) { throw new RuntimeException('Trop de biens sur un seul acte (' . SUCC_GOODS_MAX . ' au plus).'); }
    $keys = array_map(static fn($p) => $p['person_id'] ? (string) $p['person_id'] : 'txt:' . $p['txt'], $people);
    $tables = ['house' => 'houses', 'parcel' => 'cadastre_parcels', 'object' => 'family_objects'];
    $out = [];
    foreach (array_values($v) as $g) {
        if (!is_array($g)) { continue; }
        $kind = (string) ($g['kind'] ?? 'other');
        if (!in_array($kind, SUCC_GOOD_KINDS, true)) { throw new RuntimeException('Sorte de bien inconnue.'); }
        $ref = isset($tables[$kind]) ? safe_int($g['ref_id'] ?? 0) : 0;
        if ($ref > 0 && !succ_exists($pdo, $tables[$kind], $ref)) { $ref = 0; }
        $label = succ_text($g['label'] ?? '', 300);
        if ($ref <= 0 && $label === '' && succ_text($g['value_text'] ?? '', 10) === '' && (string) scalar_text($g['value_amount'] ?? '', 'valeur') === '') { continue; } // ligne vide
        $amount = $g['value_amount'] ?? null;
        $amount = $amount === null || $amount === '' ? null : (is_numeric($amount) ? max(0, min(1e15, (float) $amount)) : throw new RuntimeException('La valeur d’un bien est un nombre (ex. 1200).'));
        $unit = in_array($g['value_unit'] ?? '', SUCC_UNITS, true) ? (string) ($g['value_unit'] ?? '') : '';
        $to = [];
        foreach ((array) ($g['to'] ?? []) as $k) { $k = is_scalar($k) ? (string) $k : ''; if ($k !== '' && in_array($k, $keys, true) && !in_array($k, $to, true)) { $to[] = $k; } }
        $out[] = ['kind' => $kind, 'ref_id' => $ref ?: null, 'label' => $label, 'value_amount' => $amount, 'value_unit' => $unit, 'value_text' => succ_text($g['value_text'] ?? '', 200),
            'share_text' => succ_text($g['share_text'] ?? '', 200), 'to_json' => json_encode($to, JSON_UNESCAPED_UNICODE), 'note' => succ_text($g['note'] ?? '', 2000)];
    }
    return $out;
}

/** Enregistre (crée ou remplace) un acte ; rend {id, title, before} — before = l'acte d'avant, pour « ↶ Annuler » */
function save_succession(PDO $pdo, array $data): array
{
    successions_schema($pdo); // une ancienne base sans la migration (copie ouverte à part)
    $id = safe_int($data['id'] ?? 0);
    $kind = in_array($data['kind'] ?? '', SUCC_KINDS, true) ? (string) $data['kind'] : 'autre';
    $people = succ_clean_people($pdo, $data['people'] ?? []);
    $goods = succ_clean_goods($pdo, $data['goods'] ?? [], $people);
    $title = succ_text($data['title'] ?? '', 200);
    $date = succ_text($data['date_text'] ?? '', 120);
    if ($title === '' && !$people && !$goods) { throw new LcndaBadInput('Donne au moins le défunt (ou le donateur), un héritier ou un bien.'); }
    $np = safe_int($data['notary_person_id'] ?? 0); if (!succ_exists($pdo, 'persons', $np)) { $np = 0; }
    $place = safe_int($data['place_id'] ?? 0); if (!succ_exists($pdo, 'places', $place)) { $place = 0; }
    $source = safe_int($data['source_id'] ?? 0); if (!succ_exists($pdo, 'sources', $source)) { $source = 0; }
    $probate = safe_int($data['probate_id'] ?? 0); if (!succ_exists($pdo, 'probate_inventories', $probate)) { $probate = 0; }
    $media = [];
    foreach ((array) ($data['media_ids'] ?? []) as $m) { $m = safe_int($m); if ($m > 0 && !in_array($m, $media, true) && count($media) < 60 && succ_exists($pdo, 'media', $m)) { $media[] = $m; } }
    $row = [$kind, $title, $date, succ_year($date), $np ?: null, $np ? '' : succ_text($data['notary_text'] ?? '', 200), succ_text($data['office_text'] ?? '', 300),
        $place ?: null, $place ? '' : succ_text($data['place_text'] ?? '', 200), succ_text($data['cote'] ?? '', 200), $source ?: null, $probate ?: null, json_encode($media), succ_text($data['notes'] ?? '', 20000)];
    $before = null;
    $own = !$pdo->inTransaction(); // api.php ouvre déjà une transaction pour chaque écriture
    if ($own) { $pdo->beginTransaction(); }
    try {
        if ($id > 0) {
            $before = succession_rows($pdo, [$id], true)[0] ?? null;
            if (!$before) { throw new RuntimeException('Acte introuvable (supprimé ?).'); }
            $pdo->prepare('UPDATE succession_acts SET kind=?, title=?, date_text=?, year=?, notary_person_id=?, notary_text=?, office_text=?, place_id=?, place_text=?, cote=?, source_id=?, probate_id=?, media_json=?, notes=?, deleted_at=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$row, $id]);
        } else {
            $pdo->prepare('INSERT INTO succession_acts(kind, title, date_text, year, notary_person_id, notary_text, office_text, place_id, place_text, cote, source_id, probate_id, media_json, notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')->execute($row);
            $id = (int) $pdo->lastInsertId();
        }
        $pdo->prepare('DELETE FROM succession_people WHERE act_id=?')->execute([$id]);
        $pdo->prepare('DELETE FROM succession_goods WHERE act_id=?')->execute([$id]);
        $ip = $pdo->prepare('INSERT INTO succession_people(act_id, person_id, txt, role, zone, position) VALUES(?,?,?,?,?,?)');
        foreach ($people as $i => $p) { $ip->execute([$id, $p['person_id'], $p['txt'], $p['role'], $p['zone'], $i]); }
        $ig = $pdo->prepare('INSERT INTO succession_goods(act_id, kind, ref_id, label, value_amount, value_unit, value_text, share_text, to_json, note, position) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
        foreach ($goods as $i => $g) { $ig->execute([$id, $g['kind'], $g['ref_id'], $g['label'], $g['value_amount'], $g['value_unit'], $g['value_text'], $g['share_text'], $g['to_json'], $g['note'], $i]); }
        if ($own) { $pdo->commit(); }
    } catch (Throwable $e) { if ($own) { $pdo->rollBack(); } throw $e; }
    $shown = succession_rows($pdo, [$id])[0] ?? ['title' => $title];
    $label = succ_display_title($shown);
    log_change($pdo, 'succession', $id, $before ? 'update' : 'create', 'Héritage : ' . $label . ' enregistré');
    return ['id' => $id, 'title' => $label, 'before' => $before ? succ_payload($before) : null];
}

/** un acte relu → ce qu'il faut renvoyer à save_succession pour le remettre tel quel */
function succ_payload(array $a): array
{
    $main = null; $people = [];
    foreach ($a['people'] as $p) {
        $x = ['id' => $p['id'], 'txt' => $p['txt'], 'role' => $p['role'], 'zone' => $p['zone']];
        if ($p['zone'] === 'main' && $main === null) { $main = $x; continue; }
        $people[] = $x;
    }
    return ['id' => $a['id'], 'kind' => $a['kind'], 'title' => $a['title'], 'date_text' => $a['date_text'], 'notary_person_id' => $a['notary_person_id'], 'notary_text' => $a['notary_text'],
        'office_text' => $a['office_text'], 'place_id' => $a['place_id'], 'place_text' => $a['place_id'] ? '' : $a['place'], 'cote' => $a['cote'], 'source_id' => $a['source_id'],
        'probate_id' => $a['probate_id'], 'media_ids' => $a['media_ids'], 'notes' => $a['notes'], 'people' => ['main' => $main, 'people' => $people],
        'goods' => array_map(static fn($g) => ['kind' => $g['kind'], 'ref_id' => $g['ref_id'], 'label' => $g['label'], 'value_amount' => $g['value_amount'], 'value_unit' => $g['value_unit'],
            'value_text' => $g['value_text'], 'share_text' => $g['share_text'], 'to' => $g['to'], 'note' => $g['note']], $a['goods'])];
}

/** « Testament de Jean MARTIN (1850) » quand l'acte n'a pas de titre */
function succ_display_title(array $a): string
{
    if (trim((string) ($a['title'] ?? '')) !== '') { return (string) $a['title']; }
    $names = ['testament' => 'Testament', 'partage' => 'Partage', 'inventaire' => 'Inventaire après décès', 'donation' => 'Donation', 'vente' => 'Vente entre héritiers', 'contrat' => 'Contrat de mariage', 'declaration' => 'Déclaration de succession', 'autre' => 'Acte'];
    $main = array_values(array_filter($a['people'] ?? [], static fn($p) => $p['zone'] === 'main'))[0]['title'] ?? '';
    return trim(($names[$a['kind'] ?? 'autre'] ?? 'Acte') . ($main !== '' ? ' de ' . $main : '') . (!empty($a['year']) ? ' (' . $a['year'] . ')' : ''));
}

function delete_succession(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    if (!successions_ready($pdo) || !($a = succession_rows($pdo, [$id])[0] ?? null)) { throw new RuntimeException('Acte introuvable (déjà supprimé ?).'); }
    $pdo->prepare('UPDATE succession_acts SET deleted_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$id]);
    log_change($pdo, 'succession', $id, 'delete', 'Héritage : ' . succ_display_title($a) . ' supprimé');
    return ['id' => $id, 'title' => succ_display_title($a)];
}

/** « ↶ Annuler » une suppression */
function restore_succession(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    if (!successions_ready($pdo)) { throw new RuntimeException('Acte introuvable.'); }
    $s = $pdo->prepare('UPDATE succession_acts SET deleted_at=NULL WHERE id=? AND deleted_at IS NOT NULL'); $s->execute([$id]);
    if (!$s->rowCount()) { throw new RuntimeException('Acte introuvable (rien à remettre).'); }
    log_change($pdo, 'succession', $id, 'restore', 'Héritage remis');
    return ['id' => $id];
}

/* ─────────────── Menu de choix : objets de famille, inventaires après décès ─────────────── */

function picker_family_objects(PDO $pdo, string $q, int $offset, int $limit): array
{
    if (!picker_table_exists($pdo, 'family_objects')) { return ['total' => 0, 'items' => []]; }
    picker_register($pdo); // picker_fold() (déjà fait par picker_search ; utile appelée seule)
    $params = [];
    $where = picker_text_where(['o.title', 'o.kind', 'o.holder_text', 'o.location_text'], $q, $params);
    [$total, $rows] = picker_page($pdo, 'SELECT o.id, o.title, o.kind, o.holder_text, o.location_text', "FROM family_objects o WHERE {$where}", 'o.title COLLATE NOCASE', $params, $offset, $limit);
    return ['total' => $total, 'items' => array_map(static fn($r) => ['kind' => 'fobject', 'id' => (int) $r['id'], 'title' => (string) $r['title'],
        'meta' => implode(' · ', array_filter([(string) $r['kind'], (string) $r['location_text']])), 'badge' => '', 'badge_style' => '', 'group' => 'fobject', 'icon' => '🏺'], $rows)];
}

function picker_probates(PDO $pdo, string $q, int $offset, int $limit): array
{
    if (!picker_table_exists($pdo, 'probate_inventories')) { return ['total' => 0, 'items' => []]; }
    picker_register($pdo); // picker_fold() (déjà fait par picker_search ; utile appelée seule)
    $params = [];
    $where = picker_text_where(['p.first_name', 'p.last_name', 'i.notary', 'i.date_text', 'i.place_text', 'i.reference'], $q, $params);
    [$total, $rows] = picker_page($pdo, "SELECT i.id, i.date_text, i.notary, i.place_text, i.reference, trim(p.first_name||' '||upper(p.last_name)) AS who", "FROM probate_inventories i JOIN persons p ON p.id=i.person_id WHERE {$where}", 'i.year, i.id', $params, $offset, $limit);
    return ['total' => $total, 'items' => array_map(static fn($r) => ['kind' => 'probate', 'id' => (int) $r['id'], 'title' => 'Inventaire de ' . $r['who'] . ($r['date_text'] !== '' ? ' (' . $r['date_text'] . ')' : ''),
        'meta' => implode(' · ', array_filter([$r['notary'] !== '' ? 'chez ' . $r['notary'] : '', (string) $r['place_text'], (string) $r['reference']])), 'badge' => '', 'badge_style' => '', 'group' => 'probate', 'icon' => '⚖️'], $rows)];
}
