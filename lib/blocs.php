<?php
declare(strict_types=1);

/**
 * 📰 🏆 🎓 Les blocs communs à TOUTE personne (maquettes O, AB, AC de docs/design/profils-et-oeuvres.html) :
 *  - « 📰 Dans les médias » : passages dans la presse, à la radio, à la télé, en podcast, sur le web… (liste « Revue de presse ») ;
 *  - « 🏆 Concours et récompenses » : prix, décorations, championnats, concours sérieux ou insolites (liste « Palmarès ») ;
 *  - « 🎓 Diplômes et formation » : étapes de scolarité, diplômes, établissements, camarades, bulletins.
 * Construit SUR le moteur des fiches (lib/art_engine.php, docs/TYPES.md) : mêmes tables (items, item_people, item_links,
 * item_rows, layout_prefs), mêmes index refaits à chaque enregistrement (art_reindex), mêmes conventions JSON.
 * Différence avec les catalogues d'artistes : la personne n'a pas besoin d'être cochée « Artiste ».
 * Interface : assets/js/heritage-blocs*.js. Points d'entrée : blocs_api_get() (GET action=blocs) et blocs_api_post()
 * (POST action=blocs_write). Pas de nouvelle table : les sortes sont rangées dans item_types (origin « builtin », famille « blocs »).
 */

/** clé => [nom, pluriel, icône, domaine] */
const BLOCS_TYPES = [
    'press_item' => ['Passage dans les médias', 'Passages dans les médias', '📰', 'press'],
    'award' => ['Récompense', 'Récompenses', '🏆', 'awards'],
    'contest' => ['Concours', 'Concours', '🏅', 'awards'],
    'school_step' => ['Étape de scolarité', 'Étapes de scolarité', '🏫', 'school'],
    'diploma' => ['Diplôme', 'Diplômes', '🎓', 'school'],
    'school' => ['Établissement', 'Établissements', '🏛', 'school'],
];

function blocs_kind_ok(string $kind): bool { return isset(BLOCS_TYPES[$kind]); }

/** les kinds demandés (« press_item,award ») : seulement les nôtres */
function blocs_kinds_of(mixed $raw): array
{
    $l = is_array($raw) ? $raw : explode(',', (string) $raw);
    $l = array_values(array_unique(array_filter(array_map('strval', $l), 'blocs_kind_ok')));
    return $l ?: array_keys(BLOCS_TYPES);
}

/** les sortes dans item_types (nom et icône dans le menu de choix « artwork ») — à l'écriture seulement */
function blocs_ensure_types(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    art_ensure($pdo);
    $ti = $pdo->prepare("INSERT OR IGNORE INTO item_types(key, label, plural, icon, family, domain, parent_type, origin) VALUES(?,?,?,?,'blocs',?,'','builtin')");
    foreach (BLOCS_TYPES as $k => [$l, $pl, $ic, $dom]) { $ti->execute([$k, $l, $pl, $ic, $dom]); }
    $done = true;
}

function blocs_readonly(): bool { return function_exists('kiosk_state') && !empty(kiosk_state()['on']); }

/* ═════════ Lire ═════════ */

/** les fiches (avec le nom et le sexe de leur personne, et si sa fiche est verrouillée) ; celles d'une personne supprimée
 *  restent dans la base (elles reviennent si on remet la personne) mais ne s'affichent plus (Revue de presse, Palmarès…) */
function blocs_rows(PDO $pdo, string $where, array $params, int $limit = 5000): array
{
    $s = $pdo->prepare('SELECT i.*, ' . art_person_name_sql() . " AS owner, p.gender AS owner_gender, COALESCE(p.is_locked,0) AS owner_locked
        FROM items i JOIN persons p ON p.id=i.person_id WHERE {$where} ORDER BY COALESCE(i.date_min, i.year, 9999), i.sort_order, i.id LIMIT " . max(1, min(20000, $limit)));
    $s->execute($params);
    return array_map(static fn($r) => art_row($r) + ['owner' => trim((string) $r['owner']), 'owner_gender' => (string) ($r['owner_gender'] ?? ''), 'owner_locked' => (int) $r['owner_locked'] === 1,
        'date_text' => (string) $r['date_text']], $s->fetchAll(PDO::FETCH_ASSOC));
}

/** les fiches d'une personne : les siennes, puis celles des autres qui la citent (jury, camarade, invité…) */
function blocs_person(PDO $pdo, int $personId, ?array $kinds = null): array
{
    if ($personId <= 0) { return ['items' => [], 'cited' => [], 'people' => []]; }
    try { art_ensure($pdo); } catch (Throwable $e) { return ['items' => [], 'cited' => [], 'people' => []]; }
    $kinds = $kinds ?: array_keys(BLOCS_TYPES);
    $in = implode(',', array_fill(0, count($kinds), '?'));
    $own = blocs_rows($pdo, "i.person_id=? AND i.type_key IN ({$in})", [$personId, ...$kinds]);
    $cited = blocs_rows($pdo, "i.person_id<>? AND i.type_key IN ({$in}) AND i.id IN (SELECT item_id FROM item_people WHERE person_id=?)", [$personId, ...$kinds, $personId], 500);
    $ids = array_merge(array_column($own, 'id'), array_column($cited, 'id'));
    $people = art_people_of($pdo, $ids);
    $roles = [];
    foreach ($people as $p) { if ($p['person_id'] === $personId) { $roles[$p['item_id']][] = $p['role'] !== '' ? $p['role'] : $p['field']; } }
    foreach ($cited as &$c) { $c['my_roles'] = array_values(array_unique($roles[$c['id']] ?? [])); }
    unset($c);
    return ['items' => $own, 'cited' => $cited, 'people' => $people];
}

/** tout ce qu'il faut pour ouvrir la fenêtre : les fiches de ces sortes (toutes les personnes, ou une seule), liens, personnes, réglages */
function blocs_boot(PDO $pdo, array $g): array
{
    art_ensure($pdo);
    $kinds = blocs_kinds_of($g['kinds'] ?? '');
    $pid = safe_int($g['person_id'] ?? 0);
    $in = implode(',', array_fill(0, count($kinds), '?'));
    $person = null;
    if ($pid > 0) {
        $p = $pdo->prepare('SELECT id, first_name, last_name, gender, COALESCE(is_locked,0) AS is_locked FROM persons WHERE id=?'); $p->execute([$pid]);
        $person = $p->fetch(PDO::FETCH_ASSOC) ?: null;
        if (!$person) { throw new RuntimeException('Fiche introuvable.'); }
    }
    $items = scalar_text($g['scope'] ?? 'all', 'scope') === 'person' && $pid > 0
        ? blocs_rows($pdo, "i.type_key IN ({$in}) AND (i.person_id=? OR i.id IN (SELECT item_id FROM item_people WHERE person_id=?))", [...$kinds, $pid, $pid])
        : blocs_rows($pdo, "i.type_key IN ({$in})", $kinds);
    $ids = array_column($items, 'id');
    return ['person' => $person, 'items' => $items, 'links' => art_links_of($pdo, $ids), 'people' => art_people_of($pdo, $ids),
        'settings' => ['global' => art_setting($pdo, 'global'), 'person' => null, 'presets' => art_setting($pdo, 'presets') ?? []],
        'readonly' => blocs_readonly(), 'kinds' => $kinds];
}

/* ═════════ Écrire ═════════ */

function blocs_person_check(PDO $pdo, int $personId): void
{
    $p = $pdo->prepare('SELECT 1 FROM persons WHERE id=?'); $p->execute([$personId]);
    if (!$p->fetchColumn()) { throw new RuntimeException('Personne introuvable : choisis d’abord à qui se rattache cette fiche.'); }
    if (function_exists('assert_person_unlocked')) { assert_person_unlocked($pdo, $personId); return; }
    $l = $pdo->prepare('SELECT COALESCE(is_locked,0) FROM persons WHERE id=?'); $l->execute([$personId]);
    if ((int) $l->fetchColumn() === 1) { throw new RuntimeException('Fiche verrouillée. Déverrouille-la avant de modifier ou supprimer cette personne.'); }
}

/** une fiche d'une de nos sortes ; la personne peut être n'importe qui (pas besoin d'« Artiste ») */
function blocs_save_item(PDO $pdo, array $d): array
{
    blocs_ensure_types($pdo);
    $personId = safe_int($d['person_id'] ?? 0);
    blocs_person_check($pdo, $personId);
    $kind = scalar_text($d['kind'] ?? '', 'kind'); if (!blocs_kind_ok($kind)) { throw new RuntimeException('Sorte de fiche inconnue.'); }
    $data = artist_clean(is_array($d['data'] ?? null) ? $d['data'] : []); $data = is_array($data) ? $data : [];
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (strlen((string) $json) > 3_000_000) { throw new RuntimeException('Fiche trop volumineuse.'); }
    $title = mb_substr(trim(safe_text($data['title'] ?? '')), 0, 500); if ($title === '') { $title = 'Sans titre'; }
    $year = artist_year($data); $dt = art_date_text($data); [$dmin, $dmax] = art_date_bounds($dt);
    $parent = safe_int($d['parent_id'] ?? 0) ?: null;
    $placeId = is_array($data['place'] ?? null) && (int) ($data['place']['plid'] ?? 0) > 0 ? (int) $data['place']['plid'] : null;
    $id = safe_int($d['id'] ?? 0);
    if ($id) {
        $u = $pdo->prepare('UPDATE items SET title=?, year=?, date_text=?, date_min=?, date_max=?, parent_id=?, place_id=?, data=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND person_id=? AND type_key=?');
        $u->execute([$title, $year, $dt, $dmin, $dmax, $parent, $placeId, $json, $id, $personId, $kind]);
        if (!$u->rowCount()) { throw new RuntimeException('Fiche introuvable : elle a peut-être été supprimée.'); }
    } else {
        $n = $pdo->prepare('SELECT COALESCE(MAX(sort_order),0)+1 FROM items WHERE person_id=? AND type_key=?'); $n->execute([$personId, $kind]);
        $pdo->prepare('INSERT INTO items(type_key, person_id, parent_id, title, date_text, date_min, date_max, year, place_id, data, sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
            ->execute([$kind, $personId, $parent, $title, $dt, $dmin, $dmax, $year, $placeId, $json, (int) $n->fetchColumn()]);
        $id = (int) $pdo->lastInsertId();
    }
    art_reindex($pdo, $id, $data);
    if (function_exists('log_change')) { try { log_change($pdo, 'person', $personId, !empty($d['id']) ? 'update' : 'create', BLOCS_TYPES[$kind][0] . ' : ' . $title); } catch (Throwable $e) {} }
    return ['id' => $id];
}

/** supprimer (renvoie la ligne pour « ↶ Annuler ») */
function blocs_delete_item(PDO $pdo, array $d): array
{
    art_ensure($pdo);
    $id = safe_int($d['id'] ?? 0);
    $s = $pdo->prepare('SELECT person_id, type_key FROM items WHERE id=?'); $s->execute([$id]); $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r || !blocs_kind_ok((string) $r['type_key'])) { throw new RuntimeException('Fiche introuvable : elle a peut-être déjà été supprimée.'); }
    blocs_person_check($pdo, (int) $r['person_id']);
    return art_delete_item($pdo, ['person_id' => (int) $r['person_id'], 'id' => $id]);
}

/** remettre une fiche supprimée : même numéro, mêmes liens */
function blocs_restore_item(PDO $pdo, array $d): array
{
    art_ensure($pdo);
    $it = is_array($d['item'] ?? null) ? $d['item'] : [];
    $id = safe_int($it['id'] ?? 0); $pid = safe_int($it['person_id'] ?? 0); $kind = (string) ($it['kind'] ?? '');
    if ($id <= 0 || !blocs_kind_ok($kind)) { throw new RuntimeException('Rien à remettre.'); }
    $e = $pdo->prepare('SELECT 1 FROM items WHERE id=?'); $e->execute([$id]);
    if ($e->fetchColumn()) { return ['id' => $id, 'already' => true]; }
    blocs_person_check($pdo, $pid);
    $data = artist_clean(is_array($it['data'] ?? null) ? $it['data'] : []); $data = is_array($data) ? $data : [];
    $dt = art_date_text($data); [$dmin, $dmax] = art_date_bounds($dt);
    $pdo->prepare('INSERT INTO items(id, type_key, person_id, parent_id, title, date_text, date_min, date_max, year, place_id, data, sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')->execute([$id, $kind, $pid,
        safe_int($it['parent_id'] ?? 0) ?: null, mb_substr((string) ($it['title'] ?? ''), 0, 500) ?: 'Sans titre', $dt, $dmin, $dmax, artist_year($data), safe_int($it['place_id'] ?? 0) ?: null,
        json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), safe_int($it['sort'] ?? 0)]);
    art_reindex($pdo, $id, $data);
    return ['id' => $id];
}

/** changer la personne à qui se rattache une fiche (le passage était rangé chez le mauvais frère…) */
function blocs_move_item(PDO $pdo, array $d): array
{
    art_ensure($pdo);
    $id = safe_int($d['id'] ?? 0); $to = safe_int($d['person_id'] ?? 0);
    $s = $pdo->prepare('SELECT person_id, type_key FROM items WHERE id=?'); $s->execute([$id]); $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r || !blocs_kind_ok((string) $r['type_key'])) { throw new RuntimeException('Fiche introuvable.'); }
    blocs_person_check($pdo, (int) $r['person_id']); blocs_person_check($pdo, $to);
    $pdo->prepare('UPDATE items SET person_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$to, $id]);
    return ['ok' => true, 'from' => (int) $r['person_id']];
}

/* ═════════ Points d'entrée (api.php) ═════════ */

function blocs_api_get(PDO $pdo, array $g): array
{
    return match (scalar_text($g['op'] ?? '', 'op')) {
        'boot' => blocs_boot($pdo, $g),
        'person' => blocs_person($pdo, safe_int($g['person_id'] ?? 0), blocs_kinds_of($g['kinds'] ?? '')),
        default => throw new RuntimeException('Demande inconnue.'),
    };
}

function blocs_api_post(PDO $pdo, array $d): array
{
    art_ensure($pdo);
    if (blocs_readonly()) { throw new RuntimeException('Mode consultation : rien ne peut être modifié.'); }
    return match (scalar_text($d['op'] ?? '', 'op')) {
        'save_item' => blocs_save_item($pdo, $d),
        'delete_item' => blocs_delete_item($pdo, $d),
        'restore_item' => blocs_restore_item($pdo, $d),
        'move_item' => blocs_move_item($pdo, $d),
        default => throw new RuntimeException('Demande inconnue.'),
    };
}
