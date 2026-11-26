<?php
declare(strict_types=1);

/**
 * 👤 Listes → Données : relier les noms propres d'une liste (maires, préfets, évêques, Morts pour la France…) aux fiches.
 * Écran : assets/js/app-listes-personnes.js. Rien ne part sur Internet : tout se lit et s'écrit dans la base.
 *
 *   GET  lp_index                       → les personnes de la base, en bref, pour reconnaître les noms (sur cet ordinateur)
 *          {v, people: [[id, prénom, nom, naissance, décès, 1re année, dernière année, drapeaux, lieux]], variants: [[id, prénom, nom]]}
 *          drapeaux : 1 = fiche confidentielle, 2 = personne vivante ; lieux : [[insee, nom plié, département plié]].
 *          En consultation : ni fiches confidentielles ni vivants.
 *   GET  lp_links&list=dp_maires        → {links: [{id, row_key, person_id, verdict 'yes'|'no', name, years}]}
 *   GET  lp_person&person_id=12         → {links: [...]} : les lignes reliées à cette fiche (avec la source)
 *   POST lp_write {op: link|unlink|reject|unreject|create|uncreate, …}
 *          link : list, row_key, person_id, list_label, role, source, licence, url, summary → aussi une source sur la fiche
 *          create : + first_name, last_name, gender, event {tag, title, date_text, year, place_insee, place_name}
 *                   → la fiche, l'événement (le rôle) cité avec la source de la liste, et le lien ; uncreate l'enlève (corbeille).
 * Table list_person_links (créée à la première écriture).
 * Essai : tests/test-listes-personnes.js
 */

function lp_table_exists(PDO $pdo): bool
{
    static $ok = null;
    if ($ok) { return true; }
    $ok = (bool) $pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='list_person_links'")->fetchColumn();
    return $ok;
}

function lp_ensure(PDO $pdo): void
{
    if (lp_table_exists($pdo)) { return; }
    $pdo->exec("CREATE TABLE IF NOT EXISTS list_person_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        list_id TEXT NOT NULL,
        row_key TEXT NOT NULL,
        person_id INTEGER NOT NULL,
        verdict TEXT NOT NULL DEFAULT 'yes' CHECK(verdict IN ('yes','no')),
        list_label TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT '',
        licence TEXT NOT NULL DEFAULT '',
        url TEXT NOT NULL DEFAULT '',
        summary TEXT NOT NULL DEFAULT '',
        source_id INTEGER,
        created_person INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(list_id, row_key, person_id)
    )");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_lpl_person ON list_person_links(person_id)');
}

function lp_kiosk(): bool { return function_exists('kiosk_state') && !empty(kiosk_state()['on']); }

function lp_fold(string $s): string
{
    $s = function_exists('ascii_fold') ? ascii_fold($s) : $s;
    return trim((string) preg_replace('/[^a-z0-9]+/', ' ', strtolower($s)));
}

/** les personnes de la base, en bref (voir en tête) */
function lp_index(PDO $pdo): array
{
    $kiosk = lp_kiosk();
    $cols = array_column($pdo->query('PRAGMA table_info(persons)')->fetchAll(PDO::FETCH_ASSOC), 'name');
    $animal = in_array('kind', $cols, true) ? "AND COALESCE(p.kind,'human') <> 'animal'" : '';
    $rows = $pdo->query("SELECT p.id, p.first_name, p.last_name, p.is_private, p.living_status FROM persons p WHERE (p.first_name <> '' OR p.last_name <> '') $animal")->fetchAll(PDO::FETCH_ASSOC);
    $people = [];
    foreach ($rows as $r) {
        $flags = ((int) $r['is_private'] ? 1 : 0) | ($r['living_status'] === 'living' ? 2 : 0);
        if ($kiosk && $flags) { continue; }
        $people[(int) $r['id']] = ['id' => (int) $r['id'], 'f' => (string) $r['first_name'], 'l' => (string) $r['last_name'], 'b' => null, 'd' => null, 'lo' => null, 'hi' => null, 'flags' => $flags, 'pl' => []];
    }
    $ev = $pdo->query("SELECT e.person_id AS pid, COALESCE(t.gedcom_tag,'') AS tag, e.year, COALESCE(pl.admin4_code,'') AS insee, COALESCE(pl.name,'') AS name, COALESCE(pl.county,'') AS county
        FROM events e LEFT JOIN event_types t ON t.id = e.event_type_id LEFT JOIN places pl ON pl.id = e.place_id WHERE e.scope = 'person' AND e.person_id IS NOT NULL");
    foreach ($ev as $e) {
        $pid = (int) $e['pid']; if (!isset($people[$pid])) { continue; }
        $p = &$people[$pid];
        $y = is_numeric($e['year']) ? (int) $e['year'] : null;
        if ($y) {
            if ($e['tag'] === 'BIRT' || (in_array($e['tag'], ['CHR', 'BAPM'], true) && $p['b'] === null)) { $p['b'] = $y; }
            if (in_array($e['tag'], ['DEAT', 'BURI', 'CREM'], true) && ($p['d'] === null || $e['tag'] === 'DEAT')) { $p['d'] = $y; }
            $p['lo'] = $p['lo'] === null ? $y : min($p['lo'], $y); $p['hi'] = $p['hi'] === null ? $y : max($p['hi'], $y);
        }
        if ($e['name'] !== '' || $e['insee'] !== '') {
            $name = trim((string) preg_replace('/\s*[,(].*$/u', '', (string) $e['name']));
            $k = [preg_match('/^\d[\dAB]\d{3}$/', (string) $e['insee']) ? (string) $e['insee'] : '', lp_fold($name), lp_fold((string) $e['county'])];
            if (!in_array($k, $p['pl'], true) && count($p['pl']) < 24) { $p['pl'][] = $k; }
        }
        unset($p);
    }
    $out = [];
    foreach ($people as $p) {
        $out[] = [$p['id'], $p['f'], $p['l'], $p['b'], $p['d'], $p['lo'], $p['hi'], $p['flags'], $p['pl']]; // vivants : les années servent à reconnaître, l'écran ne les montre pas
    }
    $variants = [];
    try {
        foreach ($pdo->query("SELECT person_id, first_name, last_name FROM name_variants WHERE last_name <> '' OR first_name <> ''") as $v) {
            if (isset($people[(int) $v['person_id']])) { $variants[] = [(int) $v['person_id'], (string) $v['first_name'], (string) $v['last_name']]; }
        }
    } catch (Throwable $_) {}
    return ['v' => count($out) . ':' . (string) $pdo->query('SELECT COALESCE(MAX(updated_at),\'\') FROM persons')->fetchColumn(), 'people' => $out, 'variants' => $variants, 'kiosk' => $kiosk];
}

/** une ligne de la table, avec le nom de la fiche (null : fiche partie, ou cachée en consultation) */
function lp_row_out(array $r): ?array
{
    if ($r['first_name'] === null && $r['last_name'] === null) { return null; }
    $flags = ((int) $r['is_private'] ? 1 : 0) | ($r['living_status'] === 'living' ? 2 : 0);
    if ($flags && lp_kiosk()) { return null; }
    return ['id' => (int) $r['id'], 'list_id' => (string) $r['list_id'], 'row_key' => (string) $r['row_key'], 'person_id' => (int) $r['person_id'], 'verdict' => (string) $r['verdict'],
        'name' => trim(($r['first_name'] ?? '') . ' ' . ($r['last_name'] ?? '')), 'flags' => $flags,
        'list_label' => (string) $r['list_label'], 'role' => (string) $r['role'], 'source' => (string) $r['source'], 'licence' => (string) $r['licence'], 'url' => (string) $r['url'],
        'summary' => (string) $r['summary'], 'created_at' => (string) $r['created_at']];
}

function lp_links(PDO $pdo, string $list, int $personId = 0): array
{
    if (!lp_table_exists($pdo)) { return ['links' => []]; }
    $where = $personId ? 'l.person_id = ? AND l.verdict = \'yes\'' : 'l.list_id = ?';
    $s = $pdo->prepare("SELECT l.*, p.first_name, p.last_name, p.is_private, p.living_status FROM list_person_links l LEFT JOIN persons p ON p.id = l.person_id WHERE $where ORDER BY l.id");
    $s->execute([$personId ?: $list]);
    return ['links' => array_values(array_filter(array_map('lp_row_out', $s->fetchAll(PDO::FETCH_ASSOC))))];
}

function lp_api_get(PDO $pdo, string $action, array $q): array
{
    return match ($action) {
        'lp_index' => lp_index($pdo),
        'lp_links' => lp_links($pdo, mb_substr((string) ($q['list'] ?? ''), 0, 80)),
        'lp_person' => lp_links($pdo, '', safe_int($q['person_id'] ?? 0)),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}

/** le texte d'une case : court, sans balises */
function lp_txt(array $d, string $k, int $max = 300): string { return mb_substr(trim(safe_text(is_scalar($d[$k] ?? '') ? (string) ($d[$k] ?? '') : '')), 0, $max); }
function lp_url(string $u): string { return $u !== '' && filter_var($u, FILTER_VALIDATE_URL) && in_array(parse_url($u, PHP_URL_SCHEME), ['http', 'https'], true) ? $u : ''; }

/** la source sur la fiche (ou sur l'événement) : « Maires (connus de Wikidata) — Maire d'Ailleville (2014–2020) », ↗ la ligne */
function lp_add_source(PDO $pdo, int $pid, array $d, int $eventId = 0): ?int
{
    $title = lp_txt($d, 'list_label', 200) . (lp_txt($d, 'role', 200) !== '' ? ' — ' . lp_txt($d, 'role', 200) : '');
    $src = lp_txt($d, 'source', 200); $lic = lp_txt($d, 'licence', 120);
    $agency = $src . ($lic !== '' && !str_contains($src, $lic) ? ' (' . $lic . ')' : '');
    $data = ['person_id' => $pid, 'title' => $title !== '' ? $title : i18n_t('Liste de données'), 'url' => lp_url(lp_txt($d, 'url', 2000)), 'source_type' => 'internet', 'website' => $agency,
        'accessed_at' => date('Y-m-d'), 'text' => lp_txt($d, 'summary', 2000), 'note' => i18n_t('Relié depuis Listes → Données')];
    if ($eventId) { $data['entity_type'] = 'event'; $data['event_id'] = $eventId; }
    try { return (int) (add_web_source($pdo, $data)['id'] ?? 0) ?: null; } catch (Throwable $_) { return null; } // fiche verrouillée : le lien se fait quand même
}

function lp_drop_source(PDO $pdo, ?int $sourceId): void
{
    if (!$sourceId) { return; }
    try { delete_source($pdo, ['id' => $sourceId]); } catch (Throwable $_) {
        $pdo->prepare('DELETE FROM source_links WHERE source_record_id = ?')->execute([$sourceId]);
        $pdo->prepare('DELETE FROM sources WHERE id = ?')->execute([$sourceId]);
    }
}

function lp_insert(PDO $pdo, array $d, int $pid, string $verdict, ?int $sourceId, int $created = 0): int
{
    $list = lp_txt($d, 'list', 80); $key = lp_txt($d, 'row_key', 400);
    if ($list === '' || $key === '') { throw new LcndaBadInput(i18n_t('Ligne de liste manquante.')); }
    $pdo->prepare('DELETE FROM list_person_links WHERE list_id = ? AND row_key = ? AND person_id = ?')->execute([$list, $key, $pid]);
    $pdo->prepare('INSERT INTO list_person_links(list_id, row_key, person_id, verdict, list_label, role, source, licence, url, summary, source_id, created_person) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
        ->execute([$list, $key, $pid, $verdict, lp_txt($d, 'list_label', 200), lp_txt($d, 'role', 300), lp_txt($d, 'source', 200), lp_txt($d, 'licence', 120), lp_url(lp_txt($d, 'url', 2000)), lp_txt($d, 'summary', 2000), $sourceId, $created]);
    return (int) $pdo->lastInsertId();
}

function lp_link_row(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT * FROM list_person_links WHERE id = ?'); $s->execute([$id]);
    $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { throw new LcndaBadInput(i18n_t('Lien introuvable : il a peut-être déjà été retiré.')); }
    return $r;
}

/** un type d'événement de personne d'après sa balise (dans l'ordre de préférence) */
function lp_event_type(PDO $pdo, array $tags): int
{
    foreach ($tags as $tag) {
        $s = $pdo->prepare("SELECT id FROM event_types WHERE scope = 'person' AND gedcom_tag = ? AND is_active = 1 ORDER BY is_custom, id LIMIT 1"); $s->execute([$tag]);
        if ($id = (int) $s->fetchColumn()) { return $id; }
    }
    return 0;
}

function lp_api_post(PDO $pdo, array $d): array
{
    lp_ensure($pdo);
    $op = (string) ($d['op'] ?? '');
    $pid = safe_int($d['person_id'] ?? 0);
    if (function_exists('begin_write_transaction')) { begin_write_transaction($pdo); } else { $pdo->beginTransaction(); } // le verrou d'écriture tout de suite (double clic : chacun son tour)
    try {
        $out = match ($op) {
            'link' => (static function () use ($pdo, $d, $pid) {
                if (!$pid || !person_exists($pdo, $pid)) { throw new LcndaBadInput(i18n_t('Fiche introuvable.')); }
                $src = lp_add_source($pdo, $pid, $d);
                return ['id' => lp_insert($pdo, $d, $pid, 'yes', $src), 'source_id' => $src];
            })(),
            'reject' => (static function () use ($pdo, $d, $pid) {
                if (!$pid) { throw new LcndaBadInput(i18n_t('Fiche introuvable.')); }
                return ['id' => lp_insert($pdo, $d, $pid, 'no', null)];
            })(),
            'unlink', 'unreject' => (static function () use ($pdo, $d) {
                $r = lp_link_row($pdo, safe_int($d['id'] ?? 0));
                lp_drop_source($pdo, $r['source_id'] !== null ? (int) $r['source_id'] : null);
                $pdo->prepare('DELETE FROM list_person_links WHERE id = ?')->execute([(int) $r['id']]);
                return ['ok' => true, 'row' => $r];
            })(),
            'create' => (static function () use ($pdo, $d) {
                $first = lp_txt($d, 'first_name', 200); $last = lp_txt($d, 'last_name', 200);
                if ($first === '' && $last === '') { throw new LcndaBadInput(i18n_t('Indique au moins un prénom ou un nom')); }
                $gender = in_array($d['gender'] ?? '', ['male', 'female'], true) ? (string) $d['gender'] : 'unknown';
                $person = save_person($pdo, ['first_name' => $first, 'last_name' => $last, 'gender' => $gender, 'living_status' => 'unknown']);
                $newId = (int) $person['id'];
                $eventId = 0; $e = is_array($d['event'] ?? null) ? $d['event'] : null;
                if ($e) {
                    $tags = array_values(array_filter(array_map(static fn($t) => preg_replace('/[^A-Z_]/', '', (string) $t), (array) ($e['tags'] ?? ['OCCU']))));
                    $type = 0;
                    foreach (array_slice((array) ($e['slugs'] ?? []), 0, 5) as $slug) { $s = $pdo->prepare("SELECT id FROM event_types WHERE scope = 'person' AND slug = ? AND is_active = 1 LIMIT 1"); $s->execute([(string) $slug]); if ($type = (int) $s->fetchColumn()) { break; } }
                    $type = $type ?: (lp_event_type($pdo, $tags ?: ['OCCU']) ?: lp_event_type($pdo, ['OCCU', 'EVEN']));
                    if ($type) {
                        $placeId = 0; $insee = lp_txt($e, 'place_insee', 10); $pname = lp_txt($e, 'place_name', 200);
                        if (preg_match('/^\d[\dAB]\d{3}$/', $insee)) { $s = $pdo->prepare('SELECT id FROM places WHERE admin4_code = ? ORDER BY id LIMIT 1'); $s->execute([$insee]); $placeId = (int) $s->fetchColumn(); }
                        if (!$placeId && $pname !== '') { $s = $pdo->prepare('SELECT id FROM places WHERE name = ? COLLATE NOCASE ORDER BY id LIMIT 1'); $s->execute([$pname]); $placeId = (int) $s->fetchColumn(); }
                        $ev = add_event($pdo, ['person_id' => $newId, 'event_type_id' => $type, 'date_text' => lp_txt($e, 'date_text', 120), 'title' => lp_txt($e, 'title', 300),
                            'description' => lp_txt($e, 'description', 2000), 'place_id' => $placeId ?: '']);
                        $eventId = (int) ($ev['id'] ?? 0);
                    }
                }
                $src = lp_add_source($pdo, $newId, $d, $eventId);
                $id = lp_insert($pdo, $d, $newId, 'yes', $src, 1);
                return ['id' => $id, 'person_id' => $newId, 'event_id' => $eventId, 'source_id' => $src, 'name' => trim($first . ' ' . $last)];
            })(),
            'uncreate' => (static function () use ($pdo, $d) {
                $r = lp_link_row($pdo, safe_int($d['id'] ?? 0));
                if (!(int) $r['created_person']) { throw new LcndaBadInput(i18n_t('Cette fiche n’a pas été créée depuis la liste.')); }
                lp_drop_source($pdo, $r['source_id'] !== null ? (int) $r['source_id'] : null);
                $pdo->prepare('DELETE FROM list_person_links WHERE person_id = ?')->execute([(int) $r['person_id']]);
                if (person_exists($pdo, (int) $r['person_id'])) { delete_person($pdo, ['id' => (int) $r['person_id']]); }
                return ['ok' => true];
            })(),
            default => throw new LcndaBadInput(i18n_t('Action inconnue.')),
        };
        $pdo->commit();
        return $out;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        throw $e;
    }
}
