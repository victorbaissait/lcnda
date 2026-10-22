<?php
declare(strict_types=1);

/**
 * 🏛 Services d'archives (F14) : la liste de MES services (Archives départementales, municipales, nationales, diocésaines,
 * notaires, Service historique de la Défense…) avec leur fiche (adresse, horaires, site, séries) et tout ce qui a déjà été
 * consulté chez eux. Rien n'est recopié : on relit le Journal des recherches (lib/research_journal.php : dépouillements,
 * visites faites, demandes…), les visites d'archives (archive_visit_plans), les sources et les médias reliés.
 *
 *  - table archive_services (structure n°50, lib/migrations.php) ; sources et médias : archive_service_id, archive_series
 *    (+ archive_cote pour une source ; la cote d'un média reste document_reference) ;
 *  - GET archive_services                → {services:[…], kinds, departments}
 *  - GET archive_service&id=             → la fiche + consulted (par série), sources, media, visits
 *  - POST save_archive_service / delete_archive_service (↶ Annuler : restore_last_delete, sorte « archive_service ») ;
 *  - POST save_media_archive {media_id, archive_service_id, archive_series} (fenêtre d'un média) ;
 *  - archive_service_store_source() : appelé par save_source / add_web_source (api.php) ;
 *  - picker_archive_services() : le menu de choix (kind « archive_service », lib/picker.php).
 * Écran : assets/js/heritage-archive-services.js (Listes → Archives et sources → « Services d'archives »).
 */

const ARCHIVE_SERVICE_KINDS = [
    'ad' => 'Archives départementales', 'am' => 'Archives municipales', 'an' => 'Archives nationales',
    'diocese' => 'Archives diocésaines', 'notary' => 'Étude de notaire', 'military' => 'Archives militaires (SHD…)',
    'hospital' => 'Hôpital, assistance publique', 'library' => 'Bibliothèque, médiathèque', 'foreign' => 'Archives à l’étranger', 'other' => 'Autre service',
];

function archive_services_ready(PDO $pdo): bool
{
    static $ok = null;
    if ($ok === null) {
        $s = $pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='archive_services'");
        $ok = (bool) $s->fetchColumn();
    }
    return $ok;
}

/** Une colonne présente ? (anciennes bases) */
function archive_services_has_col(PDO $pdo, string $table, string $col): bool
{
    static $cache = [];
    $k = $table . '.' . $col;
    if (!isset($cache[$k])) {
        $cache[$k] = false;
        try { foreach ($pdo->query('PRAGMA table_info(' . preg_replace('/\W/', '', $table) . ')') as $c) { if ($c['name'] === $col) { $cache[$k] = true; break; } } } catch (Throwable $_) {}
    }
    return $cache[$k];
}

/** Texte comparable : sans accents, ni ponctuation, ni espaces doublés (« A.D. de la Corrèze » → « a d de la correze »). */
function archive_service_fold(string $s): string
{
    if (function_exists('picker_fold')) { return picker_fold($s); }
    return trim((string) preg_replace('/[^a-z0-9]+/', ' ', strtolower(function_exists('ascii_fold') ? ascii_fold($s) : $s)));
}

/** Les noms reconnus pour un service : nom, sigle, autres noms, et pour des AD « AD 19 », « AD Corrèze »… */
function archive_service_keys(array $s): array
{
    $names = [(string) ($s['name'] ?? ''), (string) ($s['short_name'] ?? '')];
    foreach (preg_split('/[\n,;]+/u', (string) ($s['aliases'] ?? '')) ?: [] as $a) { $names[] = $a; }
    $code = trim((string) ($s['dept_code'] ?? ''));
    if (($s['kind'] ?? '') === 'ad' && $code !== '') {
        $dep = archive_departments()[$code] ?? '';
        array_push($names, 'AD ' . $code, 'AD' . $code, 'Archives départementales ' . $code);
        if ($dep !== '') { array_push($names, 'AD ' . $dep, 'Archives départementales ' . $dep, 'Archives départementales de ' . $dep, 'Archives départementales de la ' . $dep, 'Archives départementales du ' . $dep, 'Archives départementales des ' . $dep, 'Archives départementales de l ' . $dep); }
    }
    $out = [];
    foreach ($names as $n) {
        $f = archive_service_fold($n);
        if ($f === '') { continue; }
        $out[$f] = str_replace(' ', '', $f);
    }
    return $out; // fold => compact
}

/** Ce texte (service écrit à la main dans un dépouillement, une visite…) désigne-t-il ce service ? */
function archive_service_matches(array $keys, string $text): bool
{
    $f = archive_service_fold($text);
    if ($f === '') { return false; }
    $compact = str_replace(' ', '', $f);
    foreach ($keys as $fold => $c) {
        if ($compact === $c) { return true; }
        if (mb_strlen($fold) >= 8 && preg_match('/(^| )' . preg_quote($fold, '/') . '( |$)/', $f)) { return true; }
    }
    return false;
}

/** La série d'une cote : « 3 E 12/4 » → « 3 E », « 2Mi 45 » → « 2 MI », « E dépôt 12 » → « E » ; '' si rien de reconnaissable. */
function archive_series_of(string $cote): string
{
    $c = trim($cote);
    if ($c === '' || !preg_match('/^\s*(\d{0,3})\s*([A-Za-z]{1,4})(?=$|[\s\d\/._-])/u', $c, $m)) { return ''; }
    return trim(($m[1] !== '' ? $m[1] . ' ' : '') . mb_strtoupper($m[2]));
}

/** Clé comparable d'une série (« 3E » = « 3 E »). */
function archive_series_key(string $s): string
{
    return strtolower((string) preg_replace('/[^A-Za-z0-9]+/', '', $s));
}

/** Les séries déclarées sur la fiche : une par ligne, « 3 E — Notaires » ou « 4 E : état civil ». */
function archive_service_series(string $text): array
{
    $out = [];
    foreach (preg_split('/\R/u', $text) ?: [] as $line) {
        $line = trim($line);
        if ($line === '') { continue; }
        $parts = preg_split('/\s*[—–:]\s*|\s+-\s+/u', $line, 2) ?: [$line];
        $code = trim($parts[0]);
        $out[] = ['code' => mb_substr($code, 0, 40), 'label' => mb_substr(trim($parts[1] ?? ''), 0, 160), 'key' => archive_series_key($code)];
        if (count($out) >= 200) { break; }
    }
    return $out;
}

/** Départements (code → nom), pour proposer « Partir des Archives départementales de… ». */
function archive_departments(): array
{
    static $deps = null;
    if ($deps === null) {
        $deps = [];
        if (function_exists('departmental_archives_seed')) { foreach (departmental_archives_seed() as $r) { $deps[(string) $r['code']] = (string) $r['department']; } }
    }
    return $deps;
}

/** Les modèles des Archives départementales (nom, site de recherche, fonds numérisés), tirés de la liste « Archives ». */
function archive_department_templates(): array
{
    $out = [];
    if (function_exists('departmental_archives_seed')) {
        foreach (departmental_archives_seed() as $r) {
            $out[] = ['code' => (string) $r['code'], 'department' => (string) $r['department'], 'name' => (string) $r['service'], 'search_url' => (string) $r['search_url'], 'digitized' => (string) $r['digitized']];
        }
    }
    return $out;
}

function archive_service_row(PDO $pdo, int $id): ?array
{
    if (!$id || !archive_services_ready($pdo)) { return null; }
    $s = $pdo->prepare('SELECT * FROM archive_services WHERE id=?');
    $s->execute([$id]);
    $r = $s->fetch(PDO::FETCH_ASSOC);
    return $r ?: null;
}

/** Tout ce qui a été consulté chez ce service : lignes du journal des recherches (dépouillements, visites faites, demandes…). */
function archive_service_consulted(PDO $pdo, array $service, ?array $journal = null): array
{
    $keys = archive_service_keys($service);
    if (!$keys || !function_exists('research_journal_data')) { return []; }
    $journal ??= research_journal_data($pdo, ['limit' => 3000])['rows'] ?? [];
    $out = [];
    foreach ($journal as $r) {
        if (!in_array($r['kind'], ['digest', 'visit', 'request', 'lead'], true)) { continue; }
        if (!archive_service_matches($keys, (string) ($r['service'] ?? ''))) { continue; }
        $r['series'] = archive_series_of((string) ($r['cote'] ?? ''));
        $out[] = $r;
    }
    return $out;
}

/** Les visites d'archives (feuilles de mission) chez ce service. */
function archive_service_visits(PDO $pdo, array $service): array
{
    $keys = archive_service_keys($service);
    $out = [];
    try {
        $done = archive_services_has_col($pdo, 'archive_visit_plans', 'done_at') ? 'done_at' : "'' AS done_at";
        foreach ($pdo->query("SELECT id, title, visit_date, archive_center, {$done}, updated_at, (SELECT count(*) FROM archive_visit_items i WHERE i.visit_id=p.id) AS n FROM archive_visit_plans p ORDER BY visit_date DESC, id DESC") as $v) {
            if (archive_service_matches($keys, (string) $v['archive_center'])) {
                $out[] = ['id' => (int) $v['id'], 'title' => (string) ($v['title'] ?: $v['archive_center']), 'visit_date' => (string) $v['visit_date'], 'done_at' => (string) $v['done_at'], 'items' => (int) $v['n'], 'updated_at' => (string) $v['updated_at']];
            }
        }
    } catch (Throwable $_) {}
    return $out;
}

/** Sources reliées (par la fiche du service, ou par le nom écrit dans « Site, archive ou éditeur »). */
function archive_service_sources(PDO $pdo, array $service): array
{
    $keys = archive_service_keys($service);
    $id = (int) $service['id'];
    $hasId = archive_services_has_col($pdo, 'sources', 'archive_service_id');
    $cols = $hasId ? 's.archive_service_id, s.archive_series, s.archive_cote' : "NULL AS archive_service_id, '' AS archive_series, '' AS archive_cote";
    $out = [];
    foreach ($pdo->query("SELECT s.id, s.title, s.author, s.agency, s.source_type, {$cols}, (SELECT count(*) FROM source_links sl WHERE sl.source_record_id=s.id) AS n FROM sources s ORDER BY s.title COLLATE NOCASE, s.id") as $s) {
        if ((int) $s['archive_service_id'] === $id || (!(int) $s['archive_service_id'] && archive_service_matches($keys, (string) $s['agency']))) {
            $cote = (string) $s['archive_cote'];
            $out[] = ['id' => (int) $s['id'], 'title' => (string) ($s['title'] ?: 'Source sans titre'), 'agency' => (string) $s['agency'], 'cote' => $cote,
                'series' => trim((string) $s['archive_series']) ?: archive_series_of($cote), 'citations' => (int) $s['n'], 'linked' => (int) $s['archive_service_id'] === $id];
            if (count($out) >= 500) { break; }
        }
    }
    return $out;
}

/** Médias reliés au service (avec leur série et leur cote). */
function archive_service_media(PDO $pdo, array $service): array
{
    if (!archive_services_has_col($pdo, 'media', 'archive_service_id')) { return []; }
    $s = $pdo->prepare('SELECT id, title, filename, thumbnail, media_type, date_text, document_reference, document_title, archive_series, created_at FROM media WHERE archive_service_id=? ORDER BY COALESCE(document_reference,\'\'), id LIMIT 500');
    $s->execute([(int) $service['id']]);
    return array_map(static fn($m) => ['id' => (int) $m['id'], 'title' => (string) ($m['title'] ?: $m['document_title'] ?: $m['filename']), 'filename' => (string) $m['filename'], 'thumbnail' => (string) $m['thumbnail'],
        'media_type' => (string) $m['media_type'], 'date_text' => (string) $m['date_text'], 'cote' => (string) $m['document_reference'],
        'series' => trim((string) $m['archive_series']) ?: archive_series_of((string) $m['document_reference']), 'created_at' => (string) $m['created_at']], $s->fetchAll(PDO::FETCH_ASSOC));
}

/** La fiche publique d'un service (champs + séries lues). */
function archive_service_public(array $r): array
{
    $kinds = ARCHIVE_SERVICE_KINDS;
    return ['id' => (int) $r['id'], 'name' => (string) $r['name'], 'short_name' => (string) $r['short_name'], 'aliases' => (string) $r['aliases'],
        'kind' => (string) $r['kind'], 'kind_label' => $kinds[$r['kind']] ?? $kinds['other'], 'dept_code' => (string) $r['dept_code'],
        'address' => (string) $r['address'], 'city' => (string) $r['city'], 'opening_hours' => (string) $r['opening_hours'],
        'website_url' => (string) $r['website_url'], 'search_url' => (string) $r['search_url'], 'phone' => (string) $r['phone'], 'email' => (string) $r['email'],
        'series_text' => (string) $r['series_text'], 'series' => archive_service_series((string) $r['series_text']), 'notes' => (string) $r['notes'],
        'created_at' => (string) $r['created_at'], 'updated_at' => (string) $r['updated_at']];
}

/** GET archive_services : la liste, avec pour chacun le nombre de choses consultées, de sources et de médias. */
function archive_services_data(PDO $pdo): array
{
    $deps = archive_department_templates();
    if (!archive_services_ready($pdo)) { return ['services' => [], 'kinds' => ARCHIVE_SERVICE_KINDS, 'departments' => $deps]; }
    $journal = function_exists('research_journal_data') ? (research_journal_data($pdo, ['limit' => 3000])['rows'] ?? []) : [];
    $mediaCount = [];
    if (archive_services_has_col($pdo, 'media', 'archive_service_id')) { foreach ($pdo->query('SELECT archive_service_id AS s, count(*) AS n FROM media WHERE archive_service_id IS NOT NULL GROUP BY archive_service_id') as $m) { $mediaCount[(int) $m['s']] = (int) $m['n']; } }
    $out = [];
    $allKeys = [];
    foreach ($pdo->query('SELECT * FROM archive_services ORDER BY name COLLATE NOCASE, id') as $r) {
        $allKeys[] = archive_service_keys($r);
        $consulted = archive_service_consulted($pdo, $r, $journal);
        $last = '';
        foreach ($consulted as $c) { if ((string) $c['date'] > $last) { $last = (string) $c['date']; } }
        $out[] = archive_service_public($r) + ['consulted_count' => count($consulted), 'found_count' => count(array_filter($consulted, static fn($c) => $c['result'] === 'found')),
            'last_consulted' => $last, 'sources_count' => count(archive_service_sources($pdo, $r)), 'media_count' => $mediaCount[(int) $r['id']] ?? 0, 'visits_count' => count(archive_service_visits($pdo, $r))];
    }
    // les services écrits à la main dans les recherches (dépouillements, visites, demandes) qui n'ont pas encore de fiche
    $unmatched = [];
    foreach ($journal as $j) {
        $name = trim((string) ($j['service'] ?? ''));
        if ($name === '' || !in_array($j['kind'], ['digest', 'visit', 'request'], true)) { continue; }
        $k = archive_service_fold($name);
        if ($k === '') { continue; }
        if (!isset($unmatched[$k])) {
            $known = false;
            foreach ($allKeys as $keys) { if (archive_service_matches($keys, $name)) { $known = true; break; } }
            $unmatched[$k] = ['name' => $name, 'count' => 0, 'known' => $known];
        }
        $unmatched[$k]['count']++;
    }
    $unmatched = array_values(array_filter($unmatched, static fn($u) => !$u['known']));
    usort($unmatched, static fn($a, $b) => $b['count'] <=> $a['count'] ?: strcmp($a['name'], $b['name']));
    $unmatched = array_map(static fn($u) => ['name' => mb_substr($u['name'], 0, 200), 'count' => $u['count']], array_slice($unmatched, 0, 12));
    return ['services' => $out, 'kinds' => ARCHIVE_SERVICE_KINDS, 'departments' => $deps, 'unmatched' => $unmatched];
}

/** GET archive_service&id= : la fiche, et tout ce qui a été consulté chez eux, rangé par série. */
function archive_service_data(PDO $pdo, int $id): array
{
    $r = archive_service_row($pdo, $id);
    if (!$r) { throw new RuntimeException('Service d’archives introuvable.'); }
    $consulted = archive_service_consulted($pdo, $r);
    $sources = archive_service_sources($pdo, $r);
    $media = archive_service_media($pdo, $r);
    $declared = archive_service_series((string) $r['series_text']);
    // le tableau des séries : celles de la fiche, puis celles rencontrées dans les cotes
    $series = [];
    foreach ($declared as $d) { $series[$d['key']] = ['code' => $d['code'], 'label' => $d['label'], 'declared' => true, 'consulted' => 0, 'found' => 0, 'sources' => 0, 'media' => 0]; }
    $bump = static function (string $code, string $what, bool $found = false) use (&$series): void {
        $k = archive_series_key($code);
        if ($k === '') { $k = '_'; $code = ''; }
        $series[$k] ??= ['code' => $code, 'label' => '', 'declared' => false, 'consulted' => 0, 'found' => 0, 'sources' => 0, 'media' => 0];
        $series[$k][$what]++;
        if ($found) { $series[$k]['found']++; }
    };
    foreach ($consulted as $c) { $bump((string) $c['series'], 'consulted', $c['result'] === 'found'); }
    foreach ($sources as $s) { $bump((string) $s['series'], 'sources'); }
    foreach ($media as $m) { $bump((string) $m['series'], 'media'); }
    return ['service' => archive_service_public($r), 'consulted' => $consulted, 'sources' => $sources, 'media' => $media,
        'visits' => archive_service_visits($pdo, $r), 'series' => array_values($series), 'kinds' => ARCHIVE_SERVICE_KINDS];
}

/** Un lien web accepté (http/https) ou ''. */
function archive_service_url(mixed $v, string $what): string
{
    $u = mb_substr(safe_text($v ?? ''), 0, 600);
    if ($u === '') { return ''; }
    if (!preg_match('#^https?://#i', $u) || !filter_var($u, FILTER_VALIDATE_URL)) { throw new RuntimeException('Adresse du ' . $what . ' invalide : elle commence par https://'); }
    return $u;
}

function save_archive_service(PDO $pdo, array $data): array
{
    if (!archive_services_ready($pdo)) { throw new RuntimeException('Les services d’archives ne sont pas encore prêts : relance l’app.'); }
    $id = safe_int($data['id'] ?? 0);
    $name = mb_substr(safe_text($data['name'] ?? ''), 0, 200);
    if ($name === '') { throw new RuntimeException('Donne le nom du service d’archives.'); }
    $kind = safe_text($data['kind'] ?? 'other');
    if (!isset(ARCHIVE_SERVICE_KINDS[$kind])) { $kind = 'other'; }
    $email = mb_substr(safe_text($data['email'] ?? ''), 0, 200);
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) { throw new RuntimeException('Adresse e-mail invalide.'); }
    $dept = mb_substr(strtoupper(safe_text($data['dept_code'] ?? '')), 0, 3);
    if ($dept !== '' && !preg_match('/^(\d{2,3}|2[AB])$/', $dept)) { $dept = ''; }
    $vals = [
        'name' => $name, 'short_name' => mb_substr(safe_text($data['short_name'] ?? ''), 0, 60), 'aliases' => mb_substr(safe_text($data['aliases'] ?? ''), 0, 1000),
        'kind' => $kind, 'dept_code' => $dept, 'address' => mb_substr(safe_text($data['address'] ?? ''), 0, 500), 'city' => mb_substr(safe_text($data['city'] ?? ''), 0, 120),
        'opening_hours' => mb_substr(safe_text($data['opening_hours'] ?? ''), 0, 1000), 'website_url' => archive_service_url($data['website_url'] ?? '', 'site'),
        'search_url' => archive_service_url($data['search_url'] ?? '', 'site de recherche'), 'phone' => mb_substr(safe_text($data['phone'] ?? ''), 0, 60), 'email' => $email,
        'series_text' => mb_substr(safe_text($data['series_text'] ?? ''), 0, 8000), 'notes' => mb_substr(safe_text($data['notes'] ?? ''), 0, 8000),
    ];
    if ($id) {
        $old = archive_service_row($pdo, $id);
        if (!$old) { throw new RuntimeException('Service d’archives introuvable.'); }
        $set = implode(',', array_map(static fn($k) => "{$k}=?", array_keys($vals)));
        $pdo->prepare("UPDATE archive_services SET {$set}, updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([...array_values($vals), $id]);
        log_change($pdo, 'archive_service', $id, 'update', 'Service d’archives modifié : ' . $name, $old, null);
    } else {
        $pdo->prepare('INSERT INTO archive_services(' . implode(',', array_keys($vals)) . ') VALUES(' . implode(',', array_fill(0, count($vals), '?')) . ')')->execute(array_values($vals));
        $id = (int) $pdo->lastInsertId();
        log_change($pdo, 'archive_service', $id, 'create', 'Service d’archives ajouté : ' . $name, null, null);
    }
    return archive_service_public(archive_service_row($pdo, $id));
}

/** Supprimer un service : sources et médias le perdent (SET NULL) ; « ↶ Annuler » le remet avec ses liens. */
function delete_archive_service(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $old = archive_service_row($pdo, $id);
    if (!$old) { throw new RuntimeException('Service d’archives introuvable.'); }
    $links = [];
    foreach (['sources', 'media'] as $t) {
        if (archive_services_has_col($pdo, $t, 'archive_service_id')) {
            $s = $pdo->prepare("SELECT id FROM {$t} WHERE archive_service_id=?"); $s->execute([$id]);
            $links[$t] = array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN));
        }
    }
    $own = !$pdo->inTransaction(); if ($own) { $pdo->beginTransaction(); }
    try {
        foreach (array_keys($links) as $t) { $pdo->prepare("UPDATE {$t} SET archive_service_id=NULL WHERE archive_service_id=?")->execute([$id]); }
        $pdo->prepare('DELETE FROM archive_services WHERE id=?')->execute([$id]);
        log_change($pdo, 'archive_service', $id, 'delete', 'Service d’archives supprimé : ' . $old['name'], $old + ['_links' => $links], null);
        if ($own) { $pdo->commit(); }
    } catch (Throwable $e) { if ($own && $pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
    return ['id' => $id];
}

/** « ↶ Annuler » d'une suppression : le service revient, et les sources / médias qui y étaient reliés aussi. */
function restore_archive_service(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $s = $pdo->prepare("SELECT before_json FROM change_log WHERE action='delete' AND entity_type='archive_service' AND entity_id=? ORDER BY id DESC LIMIT 1");
    $s->execute([$id]);
    $row = json_decode((string) $s->fetchColumn(), true);
    if (!is_array($row) || (int) ($row['id'] ?? 0) !== $id) { throw new RuntimeException('Cette suppression n’a pas été trouvée dans le journal.'); }
    if (archive_service_row($pdo, $id)) { throw new RuntimeException('Ce service existe déjà.'); }
    $links = is_array($row['_links'] ?? null) ? $row['_links'] : [];
    unset($row['_links']);
    $cols = array_values(array_filter(array_keys($row), static fn($k) => is_string($k) && preg_match('/^[a-z_]+$/', $k) && archive_services_has_col($pdo, 'archive_services', $k)));
    $own = !$pdo->inTransaction(); if ($own) { $pdo->beginTransaction(); }
    try {
        $pdo->prepare('INSERT INTO archive_services(' . implode(',', $cols) . ') VALUES(' . implode(',', array_fill(0, count($cols), '?')) . ')')->execute(array_map(static fn($k) => $row[$k], $cols));
        foreach (['sources', 'media'] as $t) {
            if (!isset($links[$t]) || !is_array($links[$t]) || !archive_services_has_col($pdo, $t, 'archive_service_id')) { continue; }
            $u = $pdo->prepare("UPDATE {$t} SET archive_service_id=? WHERE id=? AND archive_service_id IS NULL");
            foreach (array_slice($links[$t], 0, 5000) as $lid) { $u->execute([$id, (int) $lid]); }
        }
        log_change($pdo, 'archive_service', $id, 'restore', 'Suppression annulée : ' . $row['name'], null, null);
        if ($own) { $pdo->commit(); }
    } catch (Throwable $e) { if ($own && $pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
    return ['id' => $id];
}

/** Le service choisi dans un formulaire : un id existant, ou null (« txt:… » et ids forgés écartés). */
function archive_service_id_from(PDO $pdo, mixed $raw): ?int
{
    $id = safe_int(is_string($raw) ? trim($raw) : $raw);
    return $id > 0 && archive_service_row($pdo, $id) ? $id : null;
}

/** Après save_source / add_web_source : service, série et cote de la source (seulement si le formulaire les envoie). */
function archive_service_store_source(PDO $pdo, int $sourceId, array $data): void
{
    if (!$sourceId || !archive_services_has_col($pdo, 'sources', 'archive_service_id')) { return; }
    if (!array_key_exists('archive_service_id', $data) && !array_key_exists('archive_series', $data) && !array_key_exists('archive_cote', $data)) { return; }
    $cur = $pdo->prepare('SELECT archive_service_id, archive_series, archive_cote FROM sources WHERE id=?');
    $cur->execute([$sourceId]);
    $old = $cur->fetch(PDO::FETCH_ASSOC) ?: ['archive_service_id' => null, 'archive_series' => '', 'archive_cote' => ''];
    $svc = array_key_exists('archive_service_id', $data) ? archive_service_id_from($pdo, $data['archive_service_id']) : ($old['archive_service_id'] !== null ? (int) $old['archive_service_id'] : null);
    $series = array_key_exists('archive_series', $data) ? mb_substr(safe_text($data['archive_series']), 0, 120) : (string) $old['archive_series'];
    $cote = array_key_exists('archive_cote', $data) ? mb_substr(safe_text($data['archive_cote']), 0, 200) : (string) $old['archive_cote'];
    $pdo->prepare('UPDATE sources SET archive_service_id=?, archive_series=?, archive_cote=? WHERE id=?')->execute([$svc, $series, $cote, $sourceId]);
}

/** POST save_media_archive : le service, la série (et la cote) d'un média, depuis sa fenêtre. */
function save_media_archive(PDO $pdo, array $data): array
{
    $id = safe_int($data['media_id'] ?? 0);
    if (!archive_services_has_col($pdo, 'media', 'archive_service_id')) { throw new RuntimeException('Les services d’archives ne sont pas encore prêts : relance l’app.'); }
    $s = $pdo->prepare('SELECT id, title, archive_service_id, archive_series, document_reference FROM media WHERE id=?');
    $s->execute([$id]);
    $old = $s->fetch(PDO::FETCH_ASSOC);
    if (!$old) { throw new RuntimeException('Média introuvable.'); }
    $svc = archive_service_id_from($pdo, $data['archive_service_id'] ?? '');
    $series = mb_substr(safe_text($data['archive_series'] ?? ''), 0, 120);
    $pdo->prepare('UPDATE media SET archive_service_id=?, archive_series=? WHERE id=?')->execute([$svc, $series, $id]);
    if (array_key_exists('document_reference', $data)) { $pdo->prepare('UPDATE media SET document_reference=? WHERE id=?')->execute([mb_substr(safe_text($data['document_reference']), 0, 300), $id]); }
    log_change($pdo, 'media', $id, 'update', 'Service d’archives du média « ' . ($old['title'] ?: '#' . $id) . ' »', $old, null);
    return ['media_id' => $id, 'archive_service_id' => $svc, 'archive_series' => $series];
}

/** GET media_archive&id= : le service et la série d'un média (pour sa fenêtre). */
function media_archive_data(PDO $pdo, int $id): array
{
    if (!archive_services_has_col($pdo, 'media', 'archive_service_id')) { return ['media_id' => $id, 'service' => null, 'archive_series' => '']; }
    $s = $pdo->prepare('SELECT archive_service_id, archive_series FROM media WHERE id=?');
    $s->execute([$id]);
    $m = $s->fetch(PDO::FETCH_ASSOC);
    if (!$m) { throw new RuntimeException('Média introuvable.'); }
    $svc = $m['archive_service_id'] ? archive_service_row($pdo, (int) $m['archive_service_id']) : null;
    return ['media_id' => $id, 'service' => $svc ? archive_service_picker_item($svc) : null, 'archive_series' => (string) $m['archive_series']];
}

/** Une ligne du menu de choix : 🏛 nom, « sorte · ville · sigle », badge = nombre de recherches consultées. */
function archive_service_picker_item(array $r, int $n = -1): array
{
    $kinds = ARCHIVE_SERVICE_KINDS;
    return ['kind' => 'archive_service', 'id' => (int) $r['id'], 'title' => (string) $r['name'],
        'meta' => implode(' · ', array_filter([$kinds[$r['kind']] ?? '', trim((string) $r['city']), trim((string) $r['short_name'])])),
        'badge' => $n >= 0 ? (function_exists('picker_plural') ? picker_plural($n, 'source') : $n . ' sources') : '', 'badge_style' => '', 'group' => 'archive_service', 'icon' => '🏛',
        'short' => trim((string) ($r['short_name'] ?: $r['city']))];
}

/** Menu de choix, sorte « archive_service ». */
function picker_archive_services(PDO $pdo, string $q, int $offset, int $limit): array
{
    if (!archive_services_ready($pdo)) { return ['total' => 0, 'items' => []]; }
    $params = [];
    $where = picker_text_where(['a.name', 'a.short_name', 'a.aliases', 'a.city', 'a.dept_code'], $q, $params);
    $n = archive_services_has_col($pdo, 'sources', 'archive_service_id') ? '(SELECT count(*) FROM sources s WHERE s.archive_service_id=a.id)' : '0';
    [$total, $rows] = picker_page($pdo, "SELECT a.*, {$n} AS n", "FROM archive_services a WHERE {$where}", 'a.name COLLATE NOCASE, a.id', $params, $offset, $limit);
    return ['total' => $total, 'items' => array_map(static fn($r) => archive_service_picker_item($r, (int) $r['n']), $rows)];
}

/** Structure n°50 : la table des services, et le service / la série / la cote sur les sources et les médias. */
function archive_services_schema(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS archive_services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        short_name TEXT NOT NULL DEFAULT '',
        aliases TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL DEFAULT 'other',
        dept_code TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        city TEXT NOT NULL DEFAULT '',
        opening_hours TEXT NOT NULL DEFAULT '',
        website_url TEXT NOT NULL DEFAULT '',
        search_url TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        series_text TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $has = static function (string $t, string $c) use ($pdo): bool { foreach ($pdo->query('PRAGMA table_info(' . $t . ')') as $r) { if ($r['name'] === $c) { return true; } } return false; };
    if (!$has('sources', 'archive_service_id')) { $pdo->exec('ALTER TABLE sources ADD COLUMN archive_service_id INTEGER REFERENCES archive_services(id) ON DELETE SET NULL'); }
    if (!$has('sources', 'archive_series')) { $pdo->exec("ALTER TABLE sources ADD COLUMN archive_series TEXT NOT NULL DEFAULT ''"); }
    if (!$has('sources', 'archive_cote')) { $pdo->exec("ALTER TABLE sources ADD COLUMN archive_cote TEXT NOT NULL DEFAULT ''"); }
    if (!$has('media', 'archive_service_id')) { $pdo->exec('ALTER TABLE media ADD COLUMN archive_service_id INTEGER REFERENCES archive_services(id) ON DELETE SET NULL'); }
    if (!$has('media', 'archive_series')) { $pdo->exec("ALTER TABLE media ADD COLUMN archive_series TEXT NOT NULL DEFAULT ''"); }
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_sources_archive_service ON sources(archive_service_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_media_archive_service ON media(archive_service_id)');
}
