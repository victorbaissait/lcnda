<?php
declare(strict_types=1);

/**
 * 🧾 Tableur — lien avec la base (maquette validée « 🧾 Tableur », écran E « Lien avec la base — remplir, tenir à jour, envoyer »).
 * Interface : assets/js/heritage-tableur-base.js (branché sur l'éditeur heritage-tableur.js, menu Données).
 *
 *  GET  sheet_sources                 → ce qu'on peut prendre (sortes, colonnes, mes listes, dépouillements, communes recensées…)
 *  GET  sheet_fill&spec={source, filters, cols, privacy}
 *                                      → {columns:[{k,label,type}], rows:[{key, cells:{k: valeur | {v, ref:{kind,id}}}}], total, truncated, label}
 *       Une seule action pour toutes les sortes, qui réutilise l'existant : les règles de « Mes listes » (my_list_rows_for :
 *       mêmes filtres que les listes), « Compter dans ma base » des diagrammes (diagram_app_count) pour les statistiques,
 *       les recensements (census_records / census_members) et les relevés de dépouillement (archive_digest_people).
 *       privacy=1 (et toujours en mode consultation 🔒) : sans les vivants ni les fiches confidentielles (même règle que
 *       l'export pour partager : df_hidden_people, lib/dates_feter.php).
 *  POST sheet_push {target, rows, context, decisions, dry}
 *       target : persons (fiches), census (relevé d'une commune → foyers), events (événements). dry=1 : « Voilà ce qui va
 *       entrer », ligne par ligne (Déjà dans la base / Nouvelle fiche / À vérifier / Problème) ; sinon tout est écrit dans
 *       UNE transaction SQLite et un jeton d'annulation est rendu.
 *  POST sheet_push_undo {token}       → supprime exactement ce que l'envoi a créé et défait les liens (table sheet_pushes,
 *       migration schema_v58). CSRF et mode consultation : comme toutes les écritures (api.php, kiosk_guard).
 */

const SHEET_FILL_MAX = 10000;
const SHEET_PUSH_MAX = 5000;
const SHEET_PUSH_TABLES = ['persons', 'events', 'families', 'family_children', 'census_records', 'census_members', 'places', 'change_log'];
const SHEET_CENSUS_YEARS = [1836, 1841, 1846, 1851, 1856, 1861, 1866, 1872, 1876, 1881, 1886, 1891, 1896, 1901, 1906, 1911, 1921, 1926, 1931, 1936];

function sheet_link_schema(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS sheet_pushes (id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT NOT NULL UNIQUE, workbook_id INTEGER, label TEXT NOT NULL DEFAULT '',
        target TEXT NOT NULL DEFAULT '', journal_json TEXT NOT NULL DEFAULT '{}', summary_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, undone_at TEXT)");
}

function sheet_link_ready(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    sheet_link_schema($pdo); // une copie de base ouverte à part qui n'aurait pas encore la migration 58
    $done = true;
}

function sheet_link_dispatch(PDO $pdo, string $action, bool $isWrite, array $payload): never
{
    if (!$isWrite && $action === 'sheet_sources') { json_response(sheet_sources($pdo)); }
    if (!$isWrite && $action === 'sheet_fill') {
        $raw = $_GET['spec'] ?? '';
        if (!is_string($raw) || strlen($raw) > 20000) { throw new LcndaBadInput('Demande de remplissage de mauvaise forme.'); }
        $spec = json_decode($raw, true);
        if (!is_array($spec)) { throw new LcndaBadInput('Demande de remplissage illisible.'); }
        json_response(sheet_fill($pdo, $spec));
    }
    if (!$isWrite && $action === 'sheet_refs') { json_response(sheet_refs($pdo, $_GET)); }
    if ($isWrite && $action === 'sheet_push') { json_response(['result' => sheet_push($pdo, $payload)]); }
    if ($isWrite && $action === 'sheet_push_undo') { json_response(['result' => sheet_push_undo($pdo, $payload)]); }
    json_response(['error' => 'Action inconnue'], 404);
}

/* ═════════ Ce qu'on peut prendre ═════════ */

/** les colonnes de chaque sorte : [clé, libellé, sorte (text|number|date|person|place), montrée d'office] */
function sheet_columns(string $source): array
{
    $c = static fn(string $k, string $l, string $t = 'text', bool $d = false): array => ['k' => $k, 'label' => $l, 'type' => $t, 'def' => $d];
    return match ($source) {
        'persons' => [$c('person', 'Personne', 'person', true), $c('sosa', 'Sosa', 'number', true), $c('generation', 'Génération', 'number', true), $c('birth', 'Naissance', 'date', true),
            $c('birthplace', 'Lieu de naissance', 'place', true), $c('death', 'Décès', 'date', true), $c('deathplace', 'Lieu de décès', 'place'), $c('age', 'Âge au décès', 'number', true),
            $c('occupation', 'Métier', 'text', true), $c('father', 'Père', 'person'), $c('mother', 'Mère', 'person'), $c('spouse', 'Conjoint', 'person'), $c('last_name', 'Nom'), $c('first_name', 'Prénom'),
            $c('gender', 'Sexe'), $c('parents', 'Parents'), $c('children', 'Nombre d’enfants', 'number'), $c('marriages', 'Nombre d’unions', 'number'), $c('birth_country', 'Pays de naissance'),
            $c('labels', 'Étiquettes'), $c('sources', 'Sources', 'number'), $c('id', 'N° de fiche', 'number')],
        'events' => [$c('date', 'Date', 'date', true), $c('type', 'Événement', 'text', true), $c('person', 'Personne', 'person', true), $c('who', 'Personne(s)'), $c('place', 'Lieu', 'place', true),
            $c('description', 'Description', 'text', true), $c('age', 'Âge', 'number'), $c('year', 'Année', 'number'), $c('sources', 'Sources', 'number'), $c('id', 'N° d’événement', 'number')],
        'census' => [$c('year', 'Année', 'number', true), $c('place', 'Commune', 'place', true), $c('address', 'Adresse', 'text', true), $c('household', 'Foyer', 'number', true), $c('person', 'Personne', 'person', true),
            $c('last_name', 'Nom'), $c('first_name', 'Prénom'), $c('age', 'Âge', 'text', true), $c('birth_place', 'Né(e) à'), $c('occupation', 'Métier', 'text', true), $c('position', 'Lien avec le chef', 'text', true),
            $c('employer', 'Employeur'), $c('nationality', 'Nationalité'), $c('status', 'Situation'), $c('notes', 'Observations')],
        'digest' => [$c('street', 'Rue', 'text', true), $c('house', 'N°', 'text', true), $c('household', 'Foyer', 'text', true), $c('last_name', 'Nom', 'text', true), $c('first_name', 'Prénom', 'text', true),
            $c('age', 'Âge', 'text', true), $c('occupation', 'Métier', 'text', true), $c('position', 'Lien avec le chef', 'text', true), $c('person', 'Fiche', 'person'), $c('birth_place', 'Né(e) à'),
            $c('nationality', 'Nationalité'), $c('notes', 'Notes'), $c('page', 'Page'), $c('address', 'Adresse entière')],
        'stats' => [$c('label', 'Valeur', 'text', true), $c('value', 'Nombre', 'number', true)],
        default => [],
    };
}

/** les colonnes « tirées des données » en plus (comme ⚙️ Colonnes) : les champs simples de la table */
function sheet_extra_columns(PDO $pdo, string $source): array
{
    $table = ['persons' => 'persons', 'events' => 'events'][$source] ?? '';
    if ($table === '') { return []; }
    $skip = ['id', 'source_id', 'unique_id', 'uid', 'gedcom_id', 'military_data', 'work_fields', 'portrait_media_id', 'surname_group_id', 'person_id', 'family_id', 'event_type_id', 'place_id', 'confidence_media_id', 'precise_lat', 'precise_lon'];
    $labels = ['middle_name' => 'Deuxième prénom', 'prefix' => 'Titre', 'suffix' => 'Suffixe', 'nationality' => 'Nationalité', 'reference_number' => 'Référence', 'familysearch_id' => 'FamilySearch', 'height_text' => 'Taille',
        'physical_description' => 'Description physique', 'eye_color' => 'Yeux', 'skin_color' => 'Teint', 'ethnicity' => 'Origine', 'living_status' => 'Vivant ?', 'created_at' => 'Créé le', 'updated_at' => 'Modifié le',
        'address' => 'Adresse', 'cause' => 'Cause', 'agency' => 'Autorité', 'title' => 'Titre', 'fact_confidence' => 'Confiance', 'date_converted' => 'Date convertie', 'date_alternative' => 'Autre date', 'former_place_name' => 'Ancien nom du lieu',
        'extra_info' => 'Informations en plus', 'occupation' => 'Métier', 'first_name' => 'Prénom relevé', 'last_name' => 'Nom relevé', 'date_calendar' => 'Calendrier', 'verify_status' => 'À vérifier'];
    $out = [];
    foreach ($pdo->query("PRAGMA table_info({$table})")->fetchAll() as $col) {
        $n = (string) $col['name'];
        if (in_array($n, $skip, true) || !preg_match('/^[a-z][a-z0-9_]{0,40}$/', $n) || str_starts_with($n, 'show_') || str_starts_with($n, 'is_') || stripos((string) $col['type'], 'BLOB') !== false) { continue; }
        $out[] = ['k' => ($source === 'persons' ? 'f:' : 'e:') . $n, 'label' => $labels[$n] ?? ucfirst(str_replace('_', ' ', $n)), 'type' => in_array(strtoupper((string) $col['type']), ['INTEGER', 'REAL'], true) ? 'number' : 'text', 'def' => false];
    }
    return $out;
}

const SHEET_STATS = [
    ['first_name', 'Prénoms', ['what' => 'persons', 'by' => 'first_name']],
    ['last_name', 'Noms de famille', ['what' => 'persons', 'by' => 'last_name']],
    ['occupation', 'Métiers', ['what' => 'persons', 'by' => 'occupation']],
    ['age_death', 'Âges au décès', ['what' => 'deaths', 'by' => 'age10']],
    ['births_decade', 'Naissances par décennie', ['what' => 'births', 'by' => 'decade']],
    ['deaths_century', 'Décès par siècle', ['what' => 'deaths', 'by' => 'century']],
    ['marriages_decade', 'Mariages par décennie', ['what' => 'marriages', 'by' => 'decade']],
    ['birth_commune', 'Communes de naissance', ['what' => 'births', 'by' => 'commune']],
    ['birth_county', 'Départements de naissance', ['what' => 'births', 'by' => 'county']],
    ['births_month', 'Naissances par mois', ['what' => 'births', 'by' => 'month']],
    ['kids', 'Nombre d’enfants', ['what' => 'families', 'by' => 'kids']],
    ['generation', 'Personnes par génération', ['what' => 'persons', 'by' => 'generation']],
];

function sheet_kiosk(): bool { return function_exists('kiosk_state') && !empty(kiosk_state()['on']); }

function sheet_sources(PDO $pdo): array
{
    $n = static fn(string $sql): int => (int) $pdo->query($sql)->fetchColumn();
    $sources = [
        ['key' => 'persons', 'icon' => '👥', 'label' => 'Personnes', 'count' => $n("SELECT count(*) FROM persons WHERE COALESCE(kind,'human')<>'animal'")],
        ['key' => 'events', 'icon' => '📅', 'label' => 'Événements', 'count' => $n('SELECT count(*) FROM events')],
        ['key' => 'census', 'icon' => '🏠', 'label' => 'Recensements', 'count' => $n('SELECT count(*) FROM census_members')],
        ['key' => 'digest', 'icon' => '📜', 'label' => 'Relevés de dépouillement', 'count' => $n('SELECT count(*) FROM archive_digest_people')],
        ['key' => 'stats', 'icon' => '📈', 'label' => 'Statistiques', 'count' => count(SHEET_STATS)],
        ['key' => 'mylist', 'icon' => '📋', 'label' => 'Mes listes', 'count' => $n('SELECT count(*) FROM custom_lists')],
    ];
    foreach ($sources as &$s) { $s['columns'] = array_merge(sheet_columns($s['key']), sheet_extra_columns($pdo, $s['key'])); }
    unset($s);
    $lists = array_map(static fn($r) => ['id' => (int) $r['id'], 'name' => (string) $r['name'], 'icon' => (string) $r['icon'], 'source' => (string) $r['source']],
        $pdo->query("SELECT id, name, icon, source FROM custom_lists ORDER BY position, id")->fetchAll());
    $digests = array_map(static fn($r) => ['id' => (int) $r['id'], 'title' => trim(implode(' · ', array_filter([(string) $r['city_name'], (string) $r['record_type'], (string) $r['year_text'], (string) $r['archive_reference']]))) ?: 'Dépouillement n° ' . $r['id'], 'people' => (int) $r['n']],
        $pdo->query('SELECT d.id, d.city_name, d.record_type, d.year_text, d.archive_reference, (SELECT count(*) FROM archive_digest_people x WHERE x.archive_digest_id=d.id) AS n FROM archive_digest_entries d ORDER BY d.updated_at DESC, d.id DESC LIMIT 500')->fetchAll());
    $census = array_map(static fn($r) => ['place_id' => (int) $r['place_id'], 'name' => (string) ($r['name'] ?: 'Sans commune'), 'years' => array_map('intval', array_filter(explode(',', (string) $r['years']))), 'members' => (int) $r['n']],
        $pdo->query("SELECT COALESCE(c.place_id,0) AS place_id, pl.name, group_concat(DISTINCT c.year) AS years, (SELECT count(*) FROM census_members m JOIN census_records c2 ON c2.id=m.census_id WHERE COALESCE(c2.place_id,0)=COALESCE(c.place_id,0)) AS n
            FROM census_records c LEFT JOIN places pl ON pl.id=c.place_id GROUP BY COALESCE(c.place_id,0) ORDER BY pl.name COLLATE NOCASE LIMIT 500")->fetchAll());
    return ['sources' => $sources, 'my_lists' => $lists, 'digests' => $digests, 'census' => $census, 'census_years' => SHEET_CENSUS_YEARS,
        'stats' => array_map(static fn($s) => ['key' => $s[0], 'label' => $s[1]], SHEET_STATS), 'privacy_forced' => sheet_kiosk()];
}

/** les personnes et lieux choisis dans des cellules : leur nom d'aujourd'hui (la cellule suit un changement de nom)
 *  et ceux qui n'existent plus (la cellule redevient une pastille grise « ? ») ; en consultation, un vivant garde son texte */
function sheet_refs(PDO $pdo, array $q): array
{
    $out = ['person' => new stdClass(), 'place' => new stdClass(), 'gone' => ['person' => [], 'place' => []]];
    $hidden = sheet_kiosk() ? sheet_hidden($pdo, true) : [];
    foreach (['person' => 'persons', 'place' => 'places'] as $kind => $table) {
        $raw = $q[$kind] ?? ''; if (!is_string($raw)) { throw new LcndaBadInput('Liste de fiches de mauvaise forme.'); }
        $ids = array_slice(array_values(array_unique(array_filter(array_map('intval', explode(',', $raw)), static fn($i) => $i > 0))), 0, 5000);
        $found = [];
        foreach (array_chunk($ids, 400) as $chunk) {
            $sql = $kind === 'person' ? 'SELECT id, first_name, last_name FROM persons WHERE id IN (' . implode(',', $chunk) . ')' : 'SELECT id, name FROM places WHERE id IN (' . implode(',', $chunk) . ')';
            foreach ($pdo->query($sql) as $r) { $id = (int) $r['id']; $found[$id] = true; if (isset($hidden[$id]) && $kind === 'person') { continue; } $out[$kind]->{$id} = $kind === 'person' ? sheet_pname($r) : (string) $r['name']; }
        }
        $out['gone'][$kind] = array_values(array_filter($ids, static fn($i) => !isset($found[$i])));
    }
    return $out;
}

/* ═════════ ⤒ Remplir : source + filtres + colonnes → lignes ═════════ */

function sheet_pname(array $p): string
{
    $first = trim((string) ($p['first_name'] ?? '')); $last = trim((string) ($p['last_name'] ?? ''));
    return trim($first . ' ' . mb_strtoupper($last)) ?: ('Fiche n° ' . (int) ($p['id'] ?? 0));
}

function sheet_ref(string $kind, ?int $id, string $title): array|string
{
    if (!$id) { return $title; }
    return ['v' => $title, 'ref' => ['kind' => $kind, 'id' => $id]];
}

/** les vivants et les fiches confidentielles (id → 'living' | 'private') quand on doit les laisser de côté */
function sheet_hidden(PDO $pdo, bool $privacy): array
{
    if (!$privacy && !sheet_kiosk()) { return []; }
    if (!function_exists('df_hidden_people')) { require_once __DIR__ . '/dates_feter.php'; }
    return df_hidden_people($pdo);
}

/** un nombre pris dans un texte (« 34 ans » → 34) ; '' s'il n'y en a pas */
function sheet_num(mixed $v): int|float|string
{
    if (is_int($v) || is_float($v)) { return $v; }
    if (preg_match('/-?\d+(?:[.,]\d+)?/', (string) $v, $m)) { $x = str_replace(',', '.', $m[0]); return str_contains($x, '.') ? (float) $x : (int) $x; }
    return '';
}

function sheet_fill(PDO $pdo, array $spec): array
{
    $source = scalar_text($spec['source'] ?? '', 'source');
    $all = sheet_columns($source);
    if (!$all && $source !== 'mylist') { throw new LcndaBadInput('Je ne sais pas prendre cela dans la base.'); }
    $filters = is_array($spec['filters'] ?? null) ? $spec['filters'] : [];
    $want = array_values(array_unique(array_filter(array_map(static fn($k) => is_string($k) && preg_match('/^[a-z][a-z0-9_:]{0,44}$/', $k) ? $k : null, is_array($spec['cols'] ?? null) ? $spec['cols'] : []))));
    $hidden = sheet_hidden($pdo, !empty($spec['privacy']));
    $res = match ($source) {
        'persons' => sheet_fill_persons($pdo, $filters, $want, $hidden),
        'events' => sheet_fill_events($pdo, $filters, $want, $hidden),
        'census' => sheet_fill_census($pdo, $filters, $hidden),
        'digest' => sheet_fill_digest($pdo, $filters, $hidden),
        'stats' => sheet_fill_stats($pdo, $filters),
        'mylist' => sheet_fill_mylist($pdo, $filters, $hidden),
    };
    $cols = $res['columns'] ?? array_merge($all, sheet_extra_columns($pdo, $source));
    if ($want && $source !== 'stats') {
        $byK = []; foreach ($cols as $c) { $byK[$c['k']] = $c; }
        $cols = array_values(array_filter(array_map(static fn($k) => $byK[$k] ?? null, $want)));
    } elseif (!$want && !isset($res['columns'])) {
        $cols = array_values(array_filter($cols, static fn($c) => $c['def']));
    }
    $keys = array_column($cols, 'k');
    $rows = [];
    foreach (array_slice($res['rows'], 0, SHEET_FILL_MAX) as $r) {
        $cells = []; foreach ($keys as $k) { $v = $r['cells'][$k] ?? ''; if ($v !== '' && $v !== null) { $cells[$k] = $v; } }
        $rows[] = ['key' => (string) $r['key'], 'cells' => (object) $cells];
    }
    return ['source' => $source, 'label' => $res['label'] ?? '', 'columns' => array_map(static fn($c) => ['k' => $c['k'], 'label' => $c['label'], 'type' => $c['type']], $cols), 'rows' => $rows,
        'total' => count($res['rows']), 'truncated' => !empty($res['truncated']) || count($res['rows']) > SHEET_FILL_MAX, 'hidden' => (int) ($res['hidden'] ?? 0), 'privacy' => (bool) $hidden];
}

/** les règles de « Mes listes » faites des filtres H10 de la fenêtre */
function sheet_person_rules(PDO $pdo, array $f): array
{
    $rules = [];
    if (!empty($f['sosa'])) { $rules[] = ['field' => 'sosa']; }
    $label = safe_int(is_scalar($f['label_id'] ?? null) ? $f['label_id'] : 0); if ($label > 0) { $rules[] = ['field' => 'label', 'values' => [$label]]; }
    $from = safe_int(is_scalar($f['born_from'] ?? null) ? $f['born_from'] : 0); $to = safe_int(is_scalar($f['born_to'] ?? null) ? $f['born_to'] : 0);
    if ($from || $to) { $rules[] = ['field' => 'year', 'from' => $from ?: null, 'to' => $to ?: null]; }
    $placeId = safe_int(is_scalar($f['birth_place_id'] ?? null) ? $f['birth_place_id'] : 0);
    $placeTxt = mb_substr(trim(scalar_text(is_scalar($f['birth_place'] ?? null) ? $f['birth_place'] : '')), 0, 120);
    if ($placeId > 0) { $s = $pdo->prepare('SELECT name FROM places WHERE id=?'); $s->execute([$placeId]); $placeTxt = (string) $s->fetchColumn(); }
    if ($placeTxt !== '') { $rules[] = ['field' => 'place', 'value' => $placeTxt]; }
    $living = scalar_text(is_scalar($f['living'] ?? null) ? $f['living'] : '');
    if (in_array($living, ['living', 'deceased', 'unknown'], true)) { $rules[] = ['field' => 'living', 'value' => $living]; }
    return $rules;
}

function sheet_fold(string $s): string { return trim(preg_replace('/[^a-z0-9]+/', ' ', strtolower(ascii_fold($s))) ?? ''); }

/** l'ensemble des réponses d'un filtre « Sexe » (cases) */
function sheet_genders(array $f): array
{
    $g = $f['gender'] ?? [];
    if (is_string($g)) { $g = explode(',', $g); }
    return is_array($g) ? array_values(array_intersect(['male', 'female', 'unknown'], array_map('strval', $g))) : [];
}

function sheet_fill_persons(PDO $pdo, array $f, array $want, array $hidden): array
{
    $def = ['match' => 'all', 'rules' => sheet_person_rules($pdo, $f), 'columns' => array_keys(LIST_PERSON_COLUMNS), 'sort' => 'name'];
    $res = my_list_rows_for($pdo, ['id' => 0, 'name' => '', 'icon' => '', 'description' => '', 'source' => 'persons', 'definition_json' => json_encode($def)]);
    $q = sheet_fold(mb_substr(scalar_text(is_scalar($f['q'] ?? null) ? $f['q'] : ''), 0, 120));
    $genders = sheet_genders($f);
    $rows = []; $ids = []; $nHidden = 0;
    foreach ($res['rows'] as $r) {
        $p = $r['people'][0] ?? null; if (!$p) { continue; }
        $pid = (int) $p['id'];
        if (($p['kind'] ?? 'human') === 'animal' && empty($f['animals'])) { continue; } // comme la liste Personnes : les animaux ont leur liste
        if (isset($hidden[$pid])) { $nHidden++; continue; }
        if ($q !== '' && !str_contains(sheet_fold(($p['first_name'] ?? '') . ' ' . ($p['last_name'] ?? '') . ' ' . ($p['last_name'] ?? '') . ' ' . ($p['first_name'] ?? '')), $q)) { continue; }
        $g = in_array($p['gender'] ?? '', ['male', 'female'], true) ? $p['gender'] : 'unknown';
        if ($genders && count($genders) < 3 && !in_array($g, $genders, true)) { continue; }
        $rows[] = ['p' => $p, 'c' => $r['cells']]; $ids[] = $pid;
    }
    $extra = sheet_person_links($pdo, $ids, $hidden);
    $fcols = array_values(array_filter(array_map(static fn($k) => str_starts_with($k, 'f:') ? substr($k, 2) : null, $want)));
    $allowed = array_map(static fn($c) => substr($c['k'], 2), sheet_extra_columns($pdo, 'persons'));
    $fcols = array_values(array_intersect($fcols, $allowed));
    $fvals = [];
    if ($fcols && $ids) {
        foreach (array_chunk($ids, 400) as $chunk) {
            foreach ($pdo->query('SELECT id, ' . implode(', ', $fcols) . ' FROM persons WHERE id IN (' . implode(',', array_map('intval', $chunk)) . ')') as $x) { $fvals[(int) $x['id']] = $x; }
        }
    }
    $out = [];
    foreach ($rows as $r) {
        $p = $r['p']; $c = $r['c']; $pid = (int) $p['id']; $x = $extra[$pid] ?? [];
        $sosa = sheet_num(explode(',', (string) ($c['sosa'] ?? ''))[0] ?? '');
        $cells = ['person' => sheet_ref('person', $pid, sheet_pname($p)), 'sosa' => $sosa, 'generation' => is_int($sosa) && $sosa > 0 ? (int) floor(log($sosa, 2)) + 1 : '',
            'birth' => (string) ($c['birth'] ?? ''), 'birthplace' => sheet_ref('place', $x['birth_place_id'] ?? null, (string) ($c['birthplace'] ?? '')),
            'death' => (string) ($c['death'] ?? ''), 'deathplace' => sheet_ref('place', $x['death_place_id'] ?? null, (string) ($c['deathplace'] ?? '')),
            'age' => sheet_num($c['age'] ?? ''), 'occupation' => (string) ($c['occupation'] ?? ''), 'father' => $x['father'] ?? '', 'mother' => $x['mother'] ?? '', 'spouse' => $x['spouse'] ?? '',
            'last_name' => (string) ($c['last_name'] ?? ''), 'first_name' => trim((string) ($p['first_name'] ?? '')), 'gender' => (string) ($c['gender'] ?? ''), 'parents' => $hidden ? '' : (string) ($c['parents'] ?? ''),
            'children' => sheet_num($c['children'] ?? ''), 'marriages' => sheet_num($c['marriages'] ?? ''), 'birth_country' => (string) ($c['birth_country'] ?? ''), 'labels' => (string) ($c['labels'] ?? ''),
            'sources' => (int) ($c['sources'] ?? 0), 'id' => $pid];
        foreach ($fcols as $k) { $v = $fvals[$pid][$k] ?? ''; $cells['f:' . $k] = is_int($v) || is_float($v) ? $v : (string) $v; }
        $out[] = ['key' => 'p:' . $pid, 'cells' => $cells];
    }
    $label = 'Personnes' . (($f['sosa'] ?? false) ? ' · Sosa' : '');
    return ['rows' => $out, 'truncated' => !empty($res['truncated']), 'hidden' => $nHidden, 'label' => $label];
}

/** lieux de naissance et de décès (leurs numéros), père, mère, premier conjoint, pour des fiches */
function sheet_person_links(PDO $pdo, array $ids, array $hidden): array
{
    $out = []; $names = []; $need = [];
    foreach (array_chunk(array_values(array_unique(array_map('intval', $ids))), 400) as $chunk) {
        $in = implode(',', $chunk);
        foreach ($pdo->query("SELECT e.person_id, t.gedcom_tag, e.place_id FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id IN ({$in}) AND t.gedcom_tag IN ('BIRT','CHR','BAPM','DEAT','BURI') ORDER BY t.gedcom_tag IN ('BIRT','DEAT') DESC") as $e) {
            $k = in_array($e['gedcom_tag'], ['BIRT', 'CHR', 'BAPM'], true) ? 'birth_place_id' : 'death_place_id';
            $pid = (int) $e['person_id'];
            if (!array_key_exists($k, $out[$pid] ?? [])) { $out[$pid][$k] = $e['place_id'] ? (int) $e['place_id'] : null; }
        }
        foreach ($pdo->query("SELECT fc.child_id, f.partner1_id, f.partner2_id, p1.gender AS g1, p2.gender AS g2 FROM family_children fc JOIN families f ON f.id=fc.family_id LEFT JOIN persons p1 ON p1.id=f.partner1_id LEFT JOIN persons p2 ON p2.id=f.partner2_id WHERE fc.child_id IN ({$in}) ORDER BY fc.family_id") as $r) {
            $cid = (int) $r['child_id'];
            foreach ([[(int) $r['partner1_id'], (string) $r['g1'], 'father'], [(int) $r['partner2_id'], (string) $r['g2'], 'mother']] as [$pid, $g, $slot]) {
                if (!$pid) { continue; }
                $slot = $g === 'female' ? 'mother' : ($g === 'male' ? 'father' : $slot);
                if (!isset($out[$cid][$slot])) { $out[$cid][$slot] = $pid; $need[$pid] = true; }
            }
        }
        foreach ($pdo->query("SELECT id, partner1_id, partner2_id FROM families WHERE (partner1_id IN ({$in}) OR partner2_id IN ({$in})) AND partner1_id IS NOT NULL AND partner2_id IS NOT NULL ORDER BY id") as $r) {
            foreach ([[(int) $r['partner1_id'], (int) $r['partner2_id']], [(int) $r['partner2_id'], (int) $r['partner1_id']]] as [$a, $b]) {
                if (in_array($a, $chunk, true) && !isset($out[$a]['spouse'])) { $out[$a]['spouse'] = $b; $need[$b] = true; }
            }
        }
    }
    foreach (array_chunk(array_keys($need), 400) as $chunk) {
        foreach ($pdo->query('SELECT id, first_name, last_name FROM persons WHERE id IN (' . implode(',', array_map('intval', $chunk)) . ')') as $p) { $names[(int) $p['id']] = sheet_pname($p); }
    }
    foreach ($out as $pid => &$x) {
        foreach (['father', 'mother', 'spouse'] as $k) {
            if (!isset($x[$k])) { continue; }
            $id = (int) $x[$k];
            $x[$k] = isset($hidden[$id]) || !isset($names[$id]) ? '' : sheet_ref('person', $id, $names[$id]);
        }
    }
    unset($x);
    return $out;
}

function sheet_fill_events(PDO $pdo, array $f, array $want, array $hidden): array
{
    $rules = [];
    $types = array_values(array_filter(array_map('intval', is_array($f['event_types'] ?? null) ? $f['event_types'] : [])));
    if ($types) { $rules[] = ['field' => 'event_type', 'values' => $types]; }
    $from = safe_int(is_scalar($f['year_from'] ?? null) ? $f['year_from'] : 0); $to = safe_int(is_scalar($f['year_to'] ?? null) ? $f['year_to'] : 0);
    if ($from || $to) { $rules[] = ['field' => 'year', 'from' => $from ?: null, 'to' => $to ?: null]; }
    $placeTxt = mb_substr(trim(scalar_text(is_scalar($f['place'] ?? null) ? $f['place'] : '')), 0, 120);
    $placeId = safe_int(is_scalar($f['place_id'] ?? null) ? $f['place_id'] : 0);
    if ($placeId > 0) { $s = $pdo->prepare('SELECT name FROM places WHERE id=?'); $s->execute([$placeId]); $placeTxt = (string) $s->fetchColumn(); }
    if ($placeTxt !== '') { $rules[] = ['field' => 'place', 'value' => $placeTxt]; }
    if (!empty($f['sosa'])) { $rules[] = ['field' => 'sosa']; }
    $def = ['match' => 'all', 'rules' => $rules, 'columns' => array_keys(LIST_EVENT_COLUMNS), 'sort' => 'date'];
    $res = my_list_rows_for($pdo, ['id' => 0, 'name' => '', 'icon' => '', 'description' => '', 'source' => 'events', 'definition_json' => json_encode($def)]);
    $q = sheet_fold(mb_substr(scalar_text(is_scalar($f['q'] ?? null) ? $f['q'] : ''), 0, 120));
    $ids = [];
    foreach ($res['rows'] as $r) { $ids[] = (int) substr((string) $r['key'], 2); }
    $ev = [];
    $ecols = array_values(array_intersect(array_values(array_filter(array_map(static fn($k) => str_starts_with($k, 'e:') ? substr($k, 2) : null, $want))), array_map(static fn($c) => substr($c['k'], 2), sheet_extra_columns($pdo, 'events'))));
    foreach (array_chunk($ids, 400) as $chunk) {
        foreach ($pdo->query('SELECT e.id, e.place_id, e.year' . ($ecols ? ', ' . implode(', ', array_map(static fn($c) => 'e.' . $c, $ecols)) : '') . ' FROM events e WHERE e.id IN (' . implode(',', array_map('intval', $chunk)) . ')') as $x) { $ev[(int) $x['id']] = $x; }
    }
    $out = []; $nHidden = 0;
    foreach ($res['rows'] as $r) {
        $eid = (int) substr((string) $r['key'], 2); $people = $r['people'] ?? [];
        if (array_filter($people, static fn($p) => isset($hidden[(int) $p['id']]))) { $nHidden++; continue; }
        $who = implode(' et ', array_map('sheet_pname', $people));
        if ($q !== '' && !str_contains(sheet_fold($who . ' ' . ($r['cells']['type'] ?? '') . ' ' . ($r['cells']['place'] ?? '') . ' ' . ($r['cells']['description'] ?? '')), $q)) { continue; }
        $c = $r['cells']; $x = $ev[$eid] ?? [];
        $cells = ['date' => (string) ($c['date'] ?? ''), 'type' => (string) ($c['type'] ?? ''), 'person' => $people ? sheet_ref('person', (int) $people[0]['id'], sheet_pname($people[0])) : '', 'who' => $who,
            'place' => sheet_ref('place', ($x['place_id'] ?? null) ? (int) $x['place_id'] : null, (string) ($c['place'] ?? '')), 'description' => (string) ($c['description'] ?? ''), 'age' => sheet_num($c['age'] ?? ''),
            'year' => ($x['year'] ?? null) !== null ? (int) $x['year'] : '', 'sources' => (int) ($c['sources'] ?? 0), 'id' => $eid];
        foreach ($ecols as $k) { $v = $x[$k] ?? ''; $cells['e:' . $k] = is_int($v) || is_float($v) ? $v : (string) $v; }
        $out[] = ['key' => 'e:' . $eid, 'cells' => $cells];
    }
    return ['rows' => $out, 'truncated' => !empty($res['truncated']), 'hidden' => $nHidden, 'label' => 'Événements'];
}

function sheet_fill_census(PDO $pdo, array $f, array $hidden): array
{
    $where = []; $params = [];
    if (array_key_exists('place_id', $f) && is_scalar($f['place_id']) && $f['place_id'] !== '') { $pl = safe_int($f['place_id']); if ($pl > 0) { $where[] = 'cr.place_id=?'; $params[] = $pl; } else { $where[] = 'cr.place_id IS NULL'; } }
    $year = safe_int(is_scalar($f['year'] ?? null) ? $f['year'] : 0); if ($year) { $where[] = 'cr.year=?'; $params[] = $year; }
    $s = $pdo->prepare('SELECT cm.*, cr.year, cr.address AS cr_address, cr.place_id, pl.name AS place_name, p.first_name AS p_first, p.last_name AS p_last FROM census_members cm JOIN census_records cr ON cr.id=cm.census_id
        LEFT JOIN places pl ON pl.id=cr.place_id LEFT JOIN persons p ON p.id=cm.person_id' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY cr.year, pl.name COLLATE NOCASE, cr.address COLLATE NOCASE, cr.id, cm.is_primary DESC, cm.id LIMIT ' . (SHEET_FILL_MAX + 1));
    $s->execute($params);
    $out = []; $nHidden = 0; $label = 'Recensements';
    foreach ($s->fetchAll() as $m) {
        $pid = (int) ($m['person_id'] ?? 0);
        if ($pid && isset($hidden[$pid])) { $nHidden++; continue; }
        $name = trim(((string) $m['first_name']) . ' ' . mb_strtoupper((string) $m['display_name']));
        $out[] = ['key' => 'c:' . $m['id'], 'cells' => ['year' => (int) $m['year'], 'place' => sheet_ref('place', $m['place_id'] ? (int) $m['place_id'] : null, (string) ($m['place_name'] ?? '')), 'address' => (string) $m['cr_address'],
            'household' => (int) $m['census_id'], 'person' => $pid ? sheet_ref('person', $pid, sheet_pname(['id' => $pid, 'first_name' => $m['p_first'], 'last_name' => $m['p_last']])) : $name,
            'last_name' => (string) $m['display_name'], 'first_name' => (string) $m['first_name'], 'age' => (string) $m['age_text'], 'birth_place' => (string) $m['birth_place'], 'occupation' => (string) $m['occupation'],
            'position' => (string) $m['household_position'], 'employer' => (string) $m['employer'], 'nationality' => (string) $m['nationality'], 'status' => (string) $m['personal_status'], 'notes' => (string) $m['extra_info']]];
        $label = 'Recensements' . ($year ? ' ' . $year : '') . ($m['place_name'] && isset($pl) ? ' · ' . $m['place_name'] : '');
    }
    return ['rows' => $out, 'truncated' => count($out) > SHEET_FILL_MAX, 'hidden' => $nHidden, 'label' => $label];
}

/** « 3 bis rue de la Seine » → ['3 bis', 'rue de la Seine'] (comme l'écran des dépouillements) */
function sheet_split_address(string $a): array
{
    $a = trim($a);
    if (preg_match('/^(\d+\s*(?:bis|ter|quater|[a-d])?)(?:\s*,\s*|\s+)(.+)$/iu', $a, $m)) { return [trim($m[1]), trim($m[2])]; }
    if (preg_match('/^(\d+\s*(?:bis|ter|quater|[a-d])?)$/iu', $a, $m)) { return [trim($m[1]), '']; }
    return ['', $a];
}

function sheet_fill_digest(PDO $pdo, array $f, array $hidden): array
{
    $id = safe_int(is_scalar($f['digest_id'] ?? null) ? $f['digest_id'] : 0);
    if ($id <= 0) { throw new LcndaBadInput('Choisis un dépouillement.'); }
    $d = $pdo->prepare('SELECT * FROM archive_digest_entries WHERE id=?'); $d->execute([$id]); $entry = $d->fetch();
    if (!$entry) { throw new LcndaBadInput('Ce dépouillement n’existe plus.'); }
    $page = trim(scalar_text(is_scalar($f['page'] ?? null) ? (string) $f['page'] : ''));
    $s = $pdo->prepare('SELECT x.*, p.first_name AS p_first, p.last_name AS p_last FROM archive_digest_people x LEFT JOIN persons p ON p.id=x.person_id WHERE x.archive_digest_id=?' . ($page !== '' ? ' AND trim(x.page_number)=?' : '') . ' ORDER BY x.id');
    $s->execute($page !== '' ? [$id, $page] : [$id]);
    $rows = $s->fetchAll();
    // rue › numéro › foyer, dans l'ordre du document (première ligne saisie de chaque foyer)
    $first = [];
    foreach ($rows as $i => $x) { $hk = $x['page_number'] . '|' . ($x['household_uid'] ?: trim((string) $x['household_key'])); $first[$hk] ??= $i; $rows[$i]['_o'] = [$x['page_number'], $first[$hk], $i]; }
    usort($rows, static fn($a, $b) => strnatcasecmp((string) $a['_o'][0], (string) $b['_o'][0]) ?: ($a['_o'][1] <=> $b['_o'][1]) ?: ($a['_o'][2] <=> $b['_o'][2]));
    $out = []; $nHidden = 0;
    foreach ($rows as $x) {
        $pid = (int) ($x['person_id'] ?? 0);
        if ($pid && isset($hidden[$pid])) { $nHidden++; continue; }
        [$house, $street] = sheet_split_address((string) $x['address']);
        $out[] = ['key' => 'd:' . $x['id'], 'cells' => ['street' => $street, 'house' => $house, 'household' => (string) $x['household_key'], 'last_name' => (string) $x['last_name'], 'first_name' => (string) $x['first_name'],
            'age' => (string) $x['age_text'], 'occupation' => (string) $x['occupation'], 'position' => (string) $x['household_position'], 'person' => $pid ? sheet_ref('person', $pid, sheet_pname(['id' => $pid, 'first_name' => $x['p_first'], 'last_name' => $x['p_last']])) : '',
            'birth_place' => (string) $x['birth_place'], 'nationality' => (string) $x['nationality'], 'notes' => (string) $x['notes'], 'page' => (string) $x['page_number'], 'address' => (string) $x['address']]];
    }
    $title = trim(implode(' · ', array_filter([(string) $entry['city_name'], (string) $entry['year_text']]))) ?: 'Dépouillement n° ' . $id;
    return ['rows' => $out, 'hidden' => $nHidden, 'label' => 'Relevé ' . $title . ($page !== '' ? ', page ' . $page : '')];
}

function sheet_fill_stats(PDO $pdo, array $f): array
{
    $key = scalar_text(is_scalar($f['stat'] ?? null) ? $f['stat'] : 'first_name');
    $preset = null; foreach (SHEET_STATS as $s) { if ($s[0] === $key) { $preset = $s; } }
    if (!$preset) { throw new LcndaBadInput('Statistique inconnue.'); }
    require_once __DIR__ . '/diagram_appcount.php';
    $q = $preset[2] + ['limit' => '200', 'others' => '0'];
    if (!empty($f['sex'])) { $q['series'] = 'sex'; }
    $r = diagram_app_count($pdo, $q);
    $series = array_values(array_filter(array_map('strval', $r['series'] ?? [])));
    $cols = [['k' => 'label', 'label' => $preset[1], 'type' => 'text']];
    if ($series && count($series) > 1) { foreach ($series as $i => $n) { $cols[] = ['k' => 's' . $i, 'label' => $n, 'type' => 'number']; } }
    else { $cols[] = ['k' => 'value', 'label' => (string) ($r['unit_label'] ?? 'Nombre') ?: 'Nombre', 'type' => 'number']; }
    $out = [];
    foreach ($r['rows'] ?? [] as $row) {
        $cells = ['label' => (string) ($row['label'] ?? '')];
        if (count($cols) > 2) { foreach ($series as $i => $_) { $cells['s' . $i] = $row['values'][$i] ?? 0; } } else { $cells['value'] = $row['value'] ?? 0; }
        $out[] = ['key' => 's:' . sheet_fold((string) ($row['label'] ?? '')), 'cells' => $cells];
    }
    return ['rows' => $out, 'columns' => array_map(static fn($c) => $c + ['def' => true], $cols), 'label' => 'Statistique · ' . $preset[1]];
}

function sheet_fill_mylist(PDO $pdo, array $f, array $hidden): array
{
    $id = safe_int(is_scalar($f['list_id'] ?? null) ? $f['list_id'] : 0);
    if ($id <= 0) { throw new LcndaBadInput('Choisis une de tes listes.'); }
    $res = my_list_rows($pdo, $id);
    $def = $res['list']['definition'] ?? [];
    $cols = [['k' => 'person', 'label' => 'Personne', 'type' => 'person', 'def' => true]];
    foreach (($def['columns'] ?? []) as $k) { if ($k === 'name') { continue; } $cols[] = ['k' => 'c_' . $k, 'label' => (string) ($res['columns'][$k] ?? $k), 'type' => in_array($k, ['sosa', 'children', 'marriages', 'sources'], true) ? 'number' : 'text', 'def' => true]; }
    foreach (($def['custom'] ?? []) as $c) { $cols[] = ['k' => 'u_' . $c['key'], 'label' => (string) $c['label'], 'type' => $c['type'] === 'number' ? 'number' : 'text', 'def' => true]; }
    if (!($res['rows'][0]['people'] ?? null) && ($res['list']['source'] ?? '') !== 'persons' && ($res['list']['source'] ?? '') !== 'events') { array_shift($cols); }
    $out = []; $nHidden = 0;
    foreach ($res['rows'] as $r) {
        $people = $r['people'] ?? [];
        if (array_filter($people, static fn($p) => isset($hidden[(int) ($p['id'] ?? 0)]))) { $nHidden++; continue; }
        $cells = ['person' => $people ? sheet_ref('person', (int) $people[0]['id'], sheet_pname($people[0])) : ''];
        foreach (($r['cells'] ?? []) as $k => $v) { $cells['c_' . $k] = is_scalar($v) ? (in_array($k, ['sosa', 'children', 'marriages', 'sources'], true) ? sheet_num($v) : (string) $v) : ''; }
        foreach (($r['values'] ?? []) as $k => $v) { $cells['u_' . $k] = is_scalar($v) ? (string) $v : (is_array($v) ? (string) ($v['title'] ?? $v['text'] ?? '') : ''); }
        $out[] = ['key' => (string) ($r['key'] ?? ''), 'cells' => $cells];
    }
    return ['rows' => $out, 'columns' => $cols, 'truncated' => !empty($res['truncated']), 'hidden' => $nHidden, 'label' => ($res['list']['icon'] ?? '📋') . ' ' . ($res['list']['name'] ?? 'Ma liste')];
}

/* ═════════ 📤 Envoyer vers la base ═════════ */

const SHEET_PUSH_FIELDS = ['person_id', 'name', 'last_name', 'first_name', 'gender', 'birth', 'age', 'birthplace', 'birthplace_id', 'death', 'deathplace', 'deathplace_id', 'occupation', 'nationality',
    'household', 'house', 'street', 'position', 'employer', 'status', 'notes', 'event_type', 'event_date', 'event_place', 'event_place_id', 'year', 'place', 'place_id', 'key'];

/** « MARTIN Jean » ou « Jean MARTIN » : le mot en capitales est le nom de famille */
function sheet_split_name(string $s): array
{
    $words = preg_split('/\s+/u', trim($s)) ?: [];
    if (!$words || $words === ['']) { return ['', '']; }
    $caps = array_filter($words, static fn($w) => mb_strlen(preg_replace('/[^\p{L}]/u', '', $w) ?? '') >= 2 && mb_strtoupper($w) === $w && preg_match('/\p{L}/u', $w));
    if ($caps && count($caps) < count($words)) {
        return [implode(' ', array_values($caps)), implode(' ', array_values(array_diff_key($words, $caps)))];
    }
    if (count($words) === 1) { return [$words[0], '']; }
    $last = array_pop($words);
    return [$last, implode(' ', $words)];
}

function sheet_gender(string $g, string $pos): string
{
    $g = sheet_fold($g); $pos = sheet_fold($pos);
    if (preg_match('/^(h|m|homme|masculin|male|garcon|gars)$/', $g)) { return 'male'; }
    if (preg_match('/^(f|femme|feminin|female|fille)$/', $g)) { return 'female'; }
    if (preg_match('/\b(epouse|femme|fille|mere|veuve|belle mere|belle fille|soeur|niece|tante|grand mere|servante|bonne)\b/', $pos)) { return 'female'; }
    if (preg_match('/\b(fils|mari|epoux|pere|veuf|garcon|beau pere|beau fils|frere|neveu|oncle|grand pere|domestique male|valet)\b/', $pos)) { return 'male'; }
    return 'unknown';
}

/** le relevé reçu, ligne par ligne, nettoyé */
function sheet_push_rows(array $data): array
{
    $rows = $data['rows'] ?? null;
    if (!is_array($rows) || !array_is_list($rows)) { throw new LcndaBadInput('Il n’y a pas de lignes à envoyer.'); }
    if (count($rows) > SHEET_PUSH_MAX) { throw new LcndaBadInput('Trop de lignes d’un coup (' . SHEET_PUSH_MAX . ' au plus) : envoie le relevé en plusieurs fois.'); }
    $out = [];
    foreach ($rows as $i => $r) {
        if (!is_array($r)) { throw new LcndaBadInput('Ligne illisible.'); }
        $f = is_array($r['f'] ?? null) ? $r['f'] : [];
        $clean = [];
        foreach (SHEET_PUSH_FIELDS as $k) { $v = $f[$k] ?? ''; if (is_array($v) || is_object($v)) { throw new LcndaBadInput('Donnée incorrecte dans une ligne.'); } $clean[$k] = mb_substr(trim(safe_text((string) $v)), 0, 500); }
        if ($clean['last_name'] === '' && $clean['first_name'] === '' && $clean['name'] !== '') { [$clean['last_name'], $clean['first_name']] = sheet_split_name($clean['name']); }
        $out[] = ['i' => $i, 'row' => max(0, min(10000000, safe_int($r['row'] ?? ($i + 1)))), 'key' => mb_substr(safe_text((string) (is_scalar($r['key'] ?? null) ? $r['key'] : '')), 0, 40), 'f' => $clean];
    }
    return $out;
}

/** toutes les fiches (sans les animaux), rangées par nom de famille sans accents */
function sheet_people_index(PDO $pdo): array
{
    $idx = [];
    foreach ($pdo->query("SELECT p.id, p.first_name, p.last_name, p.gender, p.is_locked,
            (SELECT min(e.year) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('BIRT','CHR','BAPM')) AS birth_y,
            (SELECT min(e.year) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('DEAT','BURI')) AS death_y
        FROM persons p WHERE COALESCE(p.kind,'human')<>'animal'") as $p) {
        $p['by'] = $p['birth_y'] !== null ? (int) $p['birth_y'] : null; $p['dy'] = $p['death_y'] !== null ? (int) $p['death_y'] : null;
        $idx[sheet_fold((string) $p['last_name'])][] = $p;
    }
    return $idx;
}

function sheet_person_meta(array $p): string
{
    $parts = [];
    if ($p['by'] ?? null) { $parts[] = '° ' . $p['by']; }
    if ($p['dy'] ?? null) { $parts[] = '† ' . $p['dy']; }
    return implode(' · ', $parts) ?: 'n° ' . $p['id'];
}

/** la sorte d'événement d'un mot (« Baptême », « BAPM », « sépulture »…) */
function sheet_event_type(PDO $pdo, string $word): ?array
{
    static $types = null;
    $types ??= $pdo->query('SELECT id, scope, label, gedcom_tag FROM event_types WHERE is_active=1 ORDER BY is_custom, id')->fetchAll();
    $w = sheet_fold($word); if ($w === '') { return null; }
    $syn = ['naissance' => 'BIRT', 'ne' => 'BIRT', 'nee' => 'BIRT', 'bapteme' => 'BAPM', 'bapt' => 'BAPM', 'b' => 'BAPM', 'deces' => 'DEAT', 'mort' => 'DEAT', 'sepulture' => 'BURI', 'inhumation' => 'BURI', 's' => 'BURI',
        'mariage' => 'MARR', 'm' => 'MARR', 'recensement' => 'CENS', 'residence' => 'RESI', 'profession' => 'OCCU', 'confirmation' => 'CONF', 'communion' => 'FCOM', 'testament' => 'WILL', 'emigration' => 'EMIG', 'immigration' => 'IMMI'];
    foreach ($types as $t) { if (sheet_fold((string) $t['label']) === $w || strtolower((string) $t['gedcom_tag']) === $w) { return $t; } }
    $tag = $syn[$w] ?? null;
    if ($tag) { foreach ($types as $t) { if ($t['gedcom_tag'] === $tag) { return $t; } } if ($tag === 'BAPM') { foreach ($types as $t) { if ($t['gedcom_tag'] === 'CHR') { return $t; } } } }
    return null;
}

function sheet_tag_type(PDO $pdo, string $tag): ?int
{
    $s = $pdo->prepare("SELECT id FROM event_types WHERE gedcom_tag=? AND scope='person' ORDER BY is_active DESC, is_custom, id LIMIT 1"); $s->execute([$tag]);
    $id = $s->fetchColumn(); return $id ? (int) $id : null;
}

/** « 34 », « 34 ans », « 6 mois » → nombre d'années (null si rien) */
function sheet_age(string $a): ?int
{
    $a = trim($a); if ($a === '') { return null; }
    if (preg_match('/^\s*(\d{1,3})\s*(mois|m|jours?|j|semaines?)\b/iu', $a)) { return 0; }
    if (preg_match('/(\d{1,3})/', $a, $m)) { return (int) $m[1]; }
    return null;
}

/** analyse : que va-t-il se passer pour chaque ligne ? (sans rien écrire) */
function sheet_push_analyze(PDO $pdo, string $target, array $rows, array $ctx, array $decisions): array
{
    $idx = sheet_people_index($pdo);
    $byId = []; foreach ($idx as $list) { foreach ($list as $p) { $byId[(int) $p['id']] = $p; } }
    $now = (int) date('Y'); $year = (int) ($ctx['year'] ?? 0);
    $out = [];
    foreach ($rows as $r) {
        $f = $r['f']; $a = ['i' => $r['i'], 'row' => $r['row'], 'key' => $r['key'], 'f' => $f, 'status' => 'new', 'problem' => '', 'person' => null, 'candidates' => []];
        $a['line'] = trim(implode(', ', array_filter([trim(mb_strtoupper($f['last_name']) . ' ' . $f['first_name']), $f['age'], $f['occupation'] ?: $f['event_type'], $f['event_date']])));
        $age = sheet_age($f['age']);
        $by = $f['birth'] !== '' ? event_year_from_text($f['birth']) : null;
        if ($by === null && $age !== null && $year) { $by = $year - $age; }
        $dy = $f['death'] !== '' ? event_year_from_text($f['death']) : null;
        $a['by'] = $by;
        $problem = '';
        $future = static function (string $d) use ($now): ?int { if (preg_match_all('/(?<!\d)(\d{4})(?!\d)/', $d, $m)) { $y = max(array_map('intval', $m[1])); return $y > $now ? $y : null; } return null; };
        if ($f['last_name'] === '' && $f['first_name'] === '' && !safe_int($f['person_id'])) { $problem = 'Il manque le nom et le prénom'; }
        elseif ($age !== null && $age > 115) { $problem = 'Âge impossible (' . $age . ' ans)'; }
        elseif ($by !== null && $by > $now) { $problem = 'Naissance dans le futur (' . $by . ')'; }
        elseif (($fy = $future($f['birth'] . ' ' . $f['death'] . ' ' . $f['event_date'])) !== null) { $problem = 'Date dans le futur (' . $fy . ')'; }
        elseif ($by !== null && $dy !== null && $dy < $by) { $problem = 'Décès avant la naissance'; }
        elseif ($by !== null && $year && $by > $year) { $problem = 'Né(e) après le recensement'; }
        if ($target === 'events' && !$problem) {
            $t = sheet_event_type($pdo, $f['event_type']);
            if (!$t) { $problem = $f['event_type'] === '' ? 'Il manque la sorte d’événement' : 'Sorte d’événement inconnue : « ' . $f['event_type'] . ' »'; }
            elseif ($t['scope'] === 'family') { $problem = '« ' . $t['label'] . ' » se relie à un couple : ajoute-le depuis la fiche'; }
            else { $a['type'] = $t; $ey = $f['event_date'] !== '' ? event_year_from_text($f['event_date']) : null; if ($ey !== null && $ey > $now) { $problem = 'Date dans le futur (' . $ey . ')'; } }
        }
        if ($problem) { $a['status'] = 'problem'; $a['problem'] = $problem; $out[] = $a; continue; }
        // la fiche : choisie dans la cellule (menu de choix), sinon cherchée par le nom (comme la Fusion de doublons : nom, prénom, naissance)
        $pid = safe_int($f['person_id']);
        if ($pid) {
            if (!isset($byId[$pid])) { $a['status'] = 'problem'; $a['problem'] = 'La fiche n° ' . $pid . ' n’existe plus'; $out[] = $a; continue; }
            $a['status'] = 'linked'; $a['person'] = $byId[$pid];
        } else {
            $fn = sheet_fold(preg_split('/[\s,]+/u', $f['first_name'])[0] ?? '');
            $cands = array_values(array_filter($idx[sheet_fold($f['last_name'])] ?? [], static function ($p) use ($fn, $by) {
                $pf = sheet_fold(preg_split('/[\s,]+/u', (string) $p['first_name'])[0] ?? '');
                if ($fn === '' || $pf !== $fn) { return false; }
                return !($by !== null && $p['by'] !== null && abs((int) $p['by'] - $by) > 5);
            }));
            if (count($cands) === 1) { $a['status'] = 'linked'; $a['person'] = $cands[0]; }
            elseif (count($cands) > 1) { $a['status'] = 'check'; $a['candidates'] = array_slice($cands, 0, 12); }
        }
        // le choix de la personne (« choisis ▾ » d'une ligne à vérifier, ou une ligne changée à la main)
        $d = $decisions[(string) $r['i']] ?? null;
        if (is_array($d)) {
            $act = (string) ($d['action'] ?? '');
            if ($act === 'skip') { $a['status'] = 'skip'; }
            elseif ($act === 'new') { $a['status'] = 'new'; $a['person'] = null; }
            elseif ($act === 'link' && isset($byId[safe_int($d['person_id'] ?? 0)])) { $a['status'] = 'linked'; $a['person'] = $byId[safe_int($d['person_id'])]; }
        }
        if ($a['status'] === 'linked' && (int) ($a['person']['is_locked'] ?? 0) === 1 && $target !== 'persons') { $a['status'] = 'problem'; $a['problem'] = 'Fiche verrouillée : déverrouille-la d’abord'; }
        $out[] = $a;
    }
    if ($target === 'census') { sheet_census_households($out); }
    return $out;
}

/** les foyers d'un relevé : par n° de foyer, sinon par adresse, sinon un foyer qui commence à chaque « chef » */
function sheet_census_households(array &$rows): void
{
    $n = 0; $cur = null; $map = [];
    foreach ($rows as &$a) {
        $f = $a['f'];
        $k = $f['household'] !== '' ? 'h:' . sheet_fold($f['household']) : ($f['house'] !== '' ? 'a:' . sheet_fold($f['house'] . ' ' . $f['street']) : '');
        if ($k === '') { $k = $cur === null || preg_match('/\bchef\b/', sheet_fold($f['position'])) ? 'r:' . (++$n) : $cur; }
        $cur = $k; $map[$k] ??= count($map) + 1; $a['hh'] = $map[$k];
    }
    unset($a);
    // le chef de chaque foyer : « chef », sinon la première ligne gardée
    $chef = [];
    foreach ($rows as $j => $a) { if (in_array($a['status'], ['problem', 'skip', 'check'], true)) { continue; } if (preg_match('/\bchef\b/', sheet_fold($a['f']['position'])) && !isset($chef[$a['hh']])) { $chef[$a['hh']] = $j; } }
    foreach ($rows as $j => $a) { if (in_array($a['status'], ['problem', 'skip', 'check'], true)) { continue; } $chef[$a['hh']] ??= $j; }
    foreach ($rows as $j => &$a) { $a['chef'] = $chef[$a['hh'] ?? 0] ?? null; $a['is_chef'] = $a['chef'] === $j; }
    unset($a);
}

/** la phrase de chaque ligne (« Relier à Jean MARTIN + recensement 1836 », « ＋ Nouvelle fiche, épouse de Jean (ligne 2) ») */
function sheet_push_text(string $target, array $a, array $rows, array $ctx): string
{
    if ($a['status'] === 'problem') { return $a['problem'] . ' : la ligne est laissée de côté'; }
    if ($a['status'] === 'skip') { return 'Laissée de côté'; }
    if ($a['status'] === 'check') { return count($a['candidates']) . ' fiches possibles : choisis ▾'; }
    $rel = '';
    if ($target === 'census' && !$a['is_chef'] && $a['chef'] !== null) {
        $pos = sheet_fold($a['f']['position']); $c = $rows[$a['chef']];
        $who = trim($c['f']['first_name']) ?: mb_strtoupper($c['f']['last_name']);
        if (preg_match('/\b(epouse|femme|mari|epoux|conjoint)\b/', $pos) || preg_match('/\b(fils|fille|enfant)\b/', $pos)) { $rel = ', ' . trim($a['f']['position']) . ' de ' . $who . ' (ligne ' . $c['row'] . ')'; }
    }
    $extra = $target === 'census' ? ' + recensement ' . (int) ($ctx['year'] ?? 0) : ($target === 'events' && isset($a['type']) ? ' + ' . mb_strtolower((string) $a['type']['label']) . ($a['f']['event_date'] !== '' ? ' ' . $a['f']['event_date'] : '') : '');
    if ($a['status'] === 'linked') { return ($target === 'persons' ? 'Déjà dans la base : ' . sheet_pname($a['person']) . ', rien à changer' : 'Relier à ' . sheet_pname($a['person']) . $extra); }
    return '＋ Nouvelle fiche' . $rel . ($target !== 'persons' ? $extra : '');
}

function sheet_push(PDO $pdo, array $data): array
{
    sheet_link_ready($pdo);
    $target = scalar_text($data['target'] ?? '', 'target');
    if (!in_array($target, ['persons', 'census', 'events'], true)) { throw new LcndaBadInput('Je ne sais pas envoyer cela vers la base.'); }
    $ctxIn = is_array($data['context'] ?? null) ? $data['context'] : [];
    $ctx = ['year' => safe_int(is_scalar($ctxIn['year'] ?? null) ? $ctxIn['year'] : 0), 'place_id' => safe_int(is_scalar($ctxIn['place_id'] ?? null) ? $ctxIn['place_id'] : 0),
        'place_name' => mb_substr(trim(safe_text(is_scalar($ctxIn['place_name'] ?? null) ? (string) $ctxIn['place_name'] : '')), 0, 200), 'digest_id' => safe_int(is_scalar($ctxIn['digest_id'] ?? null) ? $ctxIn['digest_id'] : 0)];
    if ($target === 'census' && ($ctx['year'] < 1700 || $ctx['year'] > 2100)) { throw new LcndaBadInput('Donne l’année du recensement (par exemple 1836).'); }
    if ($ctx['place_id'] && !record_exists($pdo, 'places', $ctx['place_id'])) { $ctx['place_id'] = 0; }
    if ($ctx['digest_id'] && !$ctx['place_id'] && $ctx['place_name'] === '') { // un relevé de dépouillement : sa commune
        $d = $pdo->prepare('SELECT place_id, city_name FROM archive_digest_entries WHERE id=?'); $d->execute([$ctx['digest_id']]); $e = $d->fetch();
        if ($e) { $ctx['place_id'] = (int) ($e['place_id'] ?? 0); $ctx['place_name'] = $ctx['place_id'] ? '' : (string) $e['city_name']; }
    }
    $rows = sheet_push_rows($data);
    $decisions = is_array($data['decisions'] ?? null) ? $data['decisions'] : [];
    $an = sheet_push_analyze($pdo, $target, $rows, $ctx, $decisions);
    $counts = ['new' => 0, 'linked' => 0, 'check' => 0, 'problem' => 0, 'skip' => 0];
    foreach ($an as $a) { $counts[$a['status']]++; }
    $label = mb_substr(trim(safe_text(is_scalar($data['name'] ?? null) ? (string) $data['name'] : '')), 0, 200) ?: 'le tableur';
    if (!empty($data['dry'])) {
        return ['counts' => $counts, 'households' => $target === 'census' ? count(array_unique(array_column(array_filter($an, static fn($a) => in_array($a['status'], ['new', 'linked'], true)), 'hh'))) : 0,
            'rows' => array_map(static fn($a) => ['i' => $a['i'], 'row' => $a['row'], 'status' => $a['status'], 'line' => $a['line'], 'text' => sheet_push_text($target, $a, $an, $ctx),
                'person' => $a['person'] ? ['id' => (int) $a['person']['id'], 'title' => sheet_pname($a['person']), 'meta' => sheet_person_meta($a['person'])] : null,
                'candidates' => array_map(static fn($p) => ['id' => (int) $p['id'], 'title' => sheet_pname($p), 'meta' => sheet_person_meta($p)], $a['candidates'])], $an)];
    }
    if (!$counts['new'] && !$counts['linked']) { throw new LcndaBadInput('Rien à envoyer : toutes les lignes sont laissées de côté.'); }
    $max = [];
    foreach (SHEET_PUSH_TABLES as $t) { $max[$t] = (int) $pdo->query("SELECT COALESCE(max(id),0) FROM {$t}")->fetchColumn(); }
    $journal = ['created' => [], 'updated' => []];
    $done = ['persons' => 0, 'linked' => 0, 'events' => 0, 'households' => 0, 'members' => 0, 'families' => 0, 'skipped' => $counts['check'] + $counts['problem'] + $counts['skip']];
    $pdo->beginTransaction();
    try {
        $pids = []; // n° de ligne → fiche
        $birthT = sheet_tag_type($pdo, 'BIRT'); $deathT = sheet_tag_type($pdo, 'DEAT');
        foreach ($an as $j => $a) {
            if (!in_array($a['status'], ['new', 'linked'], true)) { continue; }
            $f = $a['f'];
            if ($a['status'] === 'linked') { $pids[$j] = (int) $a['person']['id']; $done['linked']++; }
            else {
                $p = save_person($pdo, ['first_name' => $f['first_name'], 'last_name' => $f['last_name'], 'gender' => sheet_gender($f['gender'], $f['position']), 'occupation' => $f['occupation'], 'nationality' => $f['nationality'], 'verify_status' => 'verify']);
                $pid = (int) $p['id']; $pids[$j] = $pid; $done['persons']++;
                $birth = $f['birth'] !== '' ? $f['birth'] : ($a['by'] !== null && $f['age'] !== '' ? 'vers ' . $a['by'] : '');
                if ($birthT && ($birth !== '' || $f['birthplace'] !== '' || safe_int($f['birthplace_id']))) { add_event($pdo, ['person_id' => $pid, 'event_type_id' => $birthT, 'date_text' => $birth, 'place_id' => safe_int($f['birthplace_id']) ?: '', 'place_name' => $f['birthplace'], 'country' => 'France']); $done['events']++; }
                if ($deathT && ($f['death'] !== '' || $f['deathplace'] !== '' || safe_int($f['deathplace_id']))) { add_event($pdo, ['person_id' => $pid, 'event_type_id' => $deathT, 'date_text' => $f['death'], 'place_id' => safe_int($f['deathplace_id']) ?: '', 'place_name' => $f['deathplace'], 'country' => 'France']); $done['events']++; }
            }
            if ($target === 'events') {
                add_event($pdo, ['person_id' => $pids[$j], 'event_type_id' => (int) $a['type']['id'], 'date_text' => $f['event_date'], 'place_id' => safe_int($f['event_place_id']) ?: '', 'place_name' => $f['event_place'], 'country' => 'France', 'description' => $f['notes']]);
                $done['events']++;
            }
            // une ligne d'un relevé de dépouillement : la personne relevée est reliée à sa fiche
            if (preg_match('/^d:(\d+)$/', $a['key'], $m)) {
                $s = $pdo->prepare('SELECT person_id FROM archive_digest_people WHERE id=?'); $s->execute([(int) $m[1]]); $old = $s->fetchColumn();
                if ($old !== false && !$old) { $pdo->prepare('UPDATE archive_digest_people SET person_id=? WHERE id=?')->execute([$pids[$j], (int) $m[1]]); $journal['updated'][] = ['archive_digest_people', (int) $m[1], 'person_id', null]; }
            }
        }
        if ($target === 'census') {
            $placeId = $ctx['place_id'] ?: ($ctx['place_name'] !== '' ? find_or_create_place($pdo, $ctx['place_name']) : null);
            $records = [];
            foreach ($an as $j => $a) {
                if (!isset($pids[$j])) { continue; }
                $f = $a['f']; $hh = $a['hh'];
                if (!isset($records[$hh])) {
                    $addr = ''; // l'adresse du foyer : la première écrite sur une de ses lignes
                    foreach ($an as $o) { if (($o['hh'] ?? 0) === $hh && trim($o['f']['house'] . ' ' . $o['f']['street']) !== '') { $addr = trim($o['f']['house'] . ' ' . $o['f']['street']); break; } }
                    $pdo->prepare("INSERT INTO census_records(year,date_text,is_special,status,address,place_id,notes) VALUES(?,?,0,'found',?,?,?)")->execute([$ctx['year'], '', $addr, $placeId ?: null, 'Depuis le tableur : ' . $label . ($f['household'] !== '' ? ' · foyer ' . $f['household'] : '')]);
                    $records[$hh] = (int) $pdo->lastInsertId(); $done['households']++;
                }
                $pdo->prepare('INSERT INTO census_members(census_id,person_id,first_name,display_name,age_text,birth_place,occupation,employer,nationality,household_position,personal_status,extra_info,is_primary) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
                    ->execute([$records[$hh], $pids[$j], $f['first_name'], $f['last_name'], $f['age'], $f['birthplace'], $f['occupation'], $f['employer'], $f['nationality'], $f['position'], $f['status'], $f['notes'], $a['is_chef'] ? 1 : 0]);
                $done['members']++;
            }
            // les liens de famille du foyer, pour les nouvelles fiches : épouse du chef, enfants du chef (et de son épouse)
            $spouseOf = [];
            foreach ($an as $j => $a) {
                if (!isset($pids[$j]) || $a['is_chef'] || $a['chef'] === null || !isset($pids[$a['chef']])) { continue; }
                $pos = sheet_fold($a['f']['position']);
                if (preg_match('/\b(epouse|femme|mari|epoux|conjoint)\b/', $pos) && ($a['status'] === 'new' || $an[$a['chef']]['status'] === 'new')) {
                    $chef = $pids[$a['chef']]; $sp = $pids[$j];
                    if (!couple_family_id($pdo, $chef, $sp)) {
                        $g = sheet_gender($an[$a['chef']]['f']['gender'], 'chef');
                        $pdo->prepare('INSERT INTO families(partner1_id,partner2_id) VALUES(?,?)')->execute($g === 'female' ? [$sp, $chef] : [$chef, $sp]); $done['families']++;
                    }
                    $spouseOf[$a['chef']] = $sp;
                }
            }
            foreach ($an as $j => $a) {
                if (!isset($pids[$j]) || $a['status'] !== 'new' || $a['is_chef'] || $a['chef'] === null || !isset($pids[$a['chef']])) { continue; }
                if (!preg_match('/\b(fils|fille|enfant)\b/', sheet_fold($a['f']['position']))) { continue; }
                $chef = $pids[$a['chef']]; $sp = $spouseOf[$a['chef']] ?? 0;
                $fam = $sp ? couple_family_id($pdo, $chef, $sp) : 0;
                if (!$fam) {
                    $s = $pdo->prepare('SELECT id FROM families WHERE (partner1_id=? AND partner2_id IS NULL) OR (partner2_id=? AND partner1_id IS NULL) ORDER BY id LIMIT 1'); $s->execute([$chef, $chef]); $fam = (int) $s->fetchColumn();
                    if (!$fam) { $pdo->prepare('INSERT INTO families(partner1_id,partner2_id) VALUES(?,NULL)')->execute([$chef]); $fam = (int) $pdo->lastInsertId(); $done['families']++; }
                }
                ensure_child_link($pdo, $fam, $pids[$j]);
            }
        }
        $msg = sheet_push_message($target, $done, $label);
        log_change($pdo, 'meta', 0, 'create', 'Envoyé depuis le tableur : ' . $msg);
        foreach (SHEET_PUSH_TABLES as $t) {
            $s = $pdo->prepare("SELECT id FROM {$t} WHERE id>? ORDER BY id"); $s->execute([$max[$t]]);
            $ids = array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN)); if ($ids) { $journal['created'][$t] = $ids; }
        }
        $token = bin2hex(random_bytes(16));
        $pdo->prepare('INSERT INTO sheet_pushes(token, workbook_id, label, target, journal_json, summary_json) VALUES(?,?,?,?,?,?)')
            ->execute([$token, safe_int($data['workbook_id'] ?? 0) ?: null, $label, $target, json_encode($journal), json_encode($done, JSON_UNESCAPED_UNICODE)]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        throw $e;
    }
    return ['token' => $token, 'done' => $done, 'message' => $msg, 'person_ids' => array_map(static fn($j) => ['i' => $an[$j]['i'], 'id' => $pids[$j]], array_keys($pids))];
}

function sheet_push_message(string $target, array $d, string $label): string
{
    $p = static fn(int $n, string $one, string $many) => $n . ' ' . ($n > 1 ? $many : $one);
    $parts = [];
    if ($d['persons']) { $parts[] = $p($d['persons'], 'fiche créée', 'fiches créées'); }
    if ($d['linked'] && $target !== 'persons') { $parts[] = $p($d['linked'], 'reliée', 'reliées'); }
    if ($target === 'census' && $d['households']) { $parts[] = $p($d['households'], 'foyer', 'foyers'); }
    if ($target === 'events' && $d['events']) { $parts[] = $p($d['events'], 'événement', 'événements'); }
    if (!$parts) { $parts[] = 'rien de nouveau'; }
    return implode(' et ', count($parts) > 2 ? [implode(', ', array_slice($parts, 0, -1)), end($parts)] : $parts) . ' depuis « ' . $label . ' »';
}

/** ↶ Annuler un envoi : ce qui a été créé est supprimé, les liens posés sont défaits (dans une transaction) */
function sheet_push_undo(PDO $pdo, array $data): array
{
    sheet_link_ready($pdo);
    $token = scalar_text($data['token'] ?? '', 'token');
    if (!preg_match('/^[0-9a-f]{32}$/', $token)) { throw new LcndaBadInput('Jeton d’annulation de mauvaise forme.'); }
    $s = $pdo->prepare('SELECT * FROM sheet_pushes WHERE token=?'); $s->execute([$token]); $push = $s->fetch();
    if (!$push) { throw new LcndaBadInput('Cet envoi est introuvable.'); }
    if ($push['undone_at']) { throw new LcndaBadInput('Cet envoi a déjà été annulé.'); }
    $j = json_decode((string) $push['journal_json'], true) ?: [];
    $created = is_array($j['created'] ?? null) ? $j['created'] : [];
    $ids = static fn(string $t): array => array_values(array_filter(array_map('intval', is_array($created[$t] ?? null) ? $created[$t] : [])));
    $del = static function (string $t, array $list, string $col = 'id') use ($pdo): int {
        $n = 0; foreach (array_chunk($list, 400) as $chunk) { $st = $pdo->prepare("DELETE FROM {$t} WHERE {$col} IN (" . implode(',', array_fill(0, count($chunk), '?')) . ')'); $st->execute($chunk); $n += $st->rowCount(); } return $n;
    };
    $pdo->beginTransaction();
    try {
        foreach (array_reverse(is_array($j['updated'] ?? null) ? $j['updated'] : []) as $u) {
            if (!is_array($u) || ($u[0] ?? '') !== 'archive_digest_people' || ($u[2] ?? '') !== 'person_id') { continue; }
            $pdo->prepare('UPDATE archive_digest_people SET person_id=? WHERE id=?')->execute([$u[3] ?? null, (int) $u[1]]);
        }
        $persons = $ids('persons'); $events = $ids('events');
        $removed = ['members' => $del('census_members', $ids('census_members')), 'households' => $del('census_records', $ids('census_records')), 'links' => $del('family_children', $ids('family_children'))];
        if ($events) { foreach (['media_links', 'source_links', 'notes', 'label_links'] as $t) { foreach (array_chunk($events, 400) as $chunk) { $pdo->prepare("DELETE FROM {$t} WHERE entity_type='event' AND entity_id IN (" . implode(',', array_fill(0, count($chunk), '?')) . ')')->execute($chunk); } } }
        $removed['events'] = $del('events', $events);
        $removed['families'] = $del('families', $ids('families'));
        if ($persons) {
            foreach (['media_links', 'source_links', 'notes', 'label_links'] as $t) { foreach (array_chunk($persons, 400) as $chunk) { $pdo->prepare("DELETE FROM {$t} WHERE entity_type='person' AND entity_id IN (" . implode(',', array_fill(0, count($chunk), '?')) . ')')->execute($chunk); } }
            foreach ($persons as $pid) { $pdo->prepare('DELETE FROM person_search WHERE person_id=CAST(? AS INTEGER)')->execute([$pid]); }
            foreach (['census_members', 'archive_digest_people'] as $t) { foreach (array_chunk($persons, 400) as $chunk) { $pdo->prepare("UPDATE {$t} SET person_id=NULL WHERE person_id IN (" . implode(',', array_fill(0, count($chunk), '?')) . ')')->execute($chunk); } }
        }
        $removed['persons'] = $del('persons', $persons);
        // un lieu créé par l'envoi, s'il ne sert plus à rien
        foreach ($ids('places') as $pl) {
            $used = (int) $pdo->query('SELECT (SELECT count(*) FROM events WHERE place_id=' . $pl . ') + (SELECT count(*) FROM census_records WHERE place_id=' . $pl . ')')->fetchColumn();
            if (!$used) { $pdo->prepare('DELETE FROM places WHERE id=?')->execute([$pl]); }
        }
        $del('change_log', $ids('change_log'));
        $pdo->prepare('UPDATE sheet_pushes SET undone_at=CURRENT_TIMESTAMP WHERE id=?')->execute([(int) $push['id']]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        throw $e;
    }
    return ['ok' => true, 'removed' => $removed];
}
