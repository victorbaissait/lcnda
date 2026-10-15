<?php
declare(strict_types=1);

/**
 * 📋 Mes listes (Maintenance → Mes listes, structure n°15) : des listes faites sur mesure.
 *  - ce qu'on liste : des événements (ex. les divorces) ou des personnes ;
 *  - des critères qu'on combine (période, type d'événement, lieu, nom, métier, étiquette, sexe, ancêtres Sosa,
 *    parents inconnus…), tous ensemble (ET) ou l'un ou l'autre (OU) ;
 *  - les colonnes reprises des fiches, et des colonnes à soi (texte, menu déroulant, case à cocher, date, nombre)
 *    remplies ligne par ligne (ex. « à demander au salon », « fait ») ;
 *  - des personnes ajoutées ou retirées à la main.
 *  - ou des lignes écrites soi-même, sans rien venir de la base (« free » : stands d'un salon, courses aux archives…),
 *    avec seulement ses propres colonnes (dont « lien internet » et « personne de la base », facultative).
 * definition_json = {match: all|any, rules: [{field, value, from, to, values}], columns: [...], custom: [{key, label, type, options}]}
 */

const LIST_EVENT_COLUMNS = ['date' => 'Date', 'type' => 'Événement', 'who' => 'Personne(s)', 'place' => 'Lieu', 'description' => 'Description', 'age' => 'Âge', 'sources' => 'Sources'];
const LIST_PERSON_COLUMNS = ['name' => 'Personne', 'birth' => 'Naissance', 'birthplace' => 'Lieu de naissance', 'death' => 'Décès', 'deathplace' => 'Lieu de décès', 'age' => 'Âge au décès', 'occupation' => 'Métier', 'gender' => 'Sexe', 'parents' => 'Parents', 'sosa' => 'Sosa', 'sources' => 'Sources', 'labels' => 'Étiquettes',
    'last_name' => 'Nom de famille', 'first_name' => 'Prénom (le premier)', 'children' => 'Nombre d’enfants', 'marriages' => 'Nombre d’unions', 'birth_country' => 'Pays de naissance'];
const LIST_CUSTOM_TYPES = ['text', 'select', 'checkbox', 'date', 'number', 'url', 'person'];

/**
 * Les listes de l'onglet Listes, comme point de départ d'une de « Mes listes » : une requête par sorte, ses colonnes,
 * et (facultatif) la personne reliée à chaque ligne. Le tri et les filtres se font ensuite colonne par colonne.
 */
const LIST_TABLE_SOURCES = [
    'places' => ['label' => 'Lieux', 'columns' => ['name' => 'Lieu', 'county' => 'Département / comté', 'state' => 'Région', 'country' => 'Pays', 'events' => 'Événements', 'people' => 'Personnes'],
        'sql' => "SELECT pl.id, pl.name, pl.county, pl.state, pl.country, (SELECT count(*) FROM events e WHERE e.place_id=pl.id) AS events,
            (SELECT count(DISTINCT e.person_id) FROM events e WHERE e.place_id=pl.id) AS people, NULL AS person_id FROM places pl WHERE EXISTS (SELECT 1 FROM events e WHERE e.place_id=pl.id) ORDER BY pl.name COLLATE NOCASE"],
    'media' => ['label' => 'Médias', 'columns' => ['title' => 'Titre', 'kind' => 'Sorte', 'date' => 'Date', 'person' => 'Personne', 'reference' => 'Cote', 'labels' => 'Étiquettes'],
        'sql' => "SELECT m.id, m.title, m.media_type AS kind, m.date_text AS date, m.document_reference AS reference, m.filename, m.thumbnail,
            (SELECT group_concat(l.name, ', ') FROM label_links ll JOIN labels l ON l.id=ll.label_id WHERE ll.entity_type='media' AND ll.entity_id=m.id) AS labels,
            (SELECT ml.entity_id FROM media_links ml WHERE ml.media_id=m.id AND ml.entity_type='person' ORDER BY ml.position LIMIT 1) AS person_id FROM media m ORDER BY m.id DESC"],
    'occupations' => ['label' => 'Métiers', 'columns' => ['occupation' => 'Métier', 'people' => 'Personnes', 'names' => 'Qui'],
        'sql' => "SELECT 0 AS id, lower(trim(occupation)) AS group_key, trim(occupation) AS occupation, count(*) AS people,
            group_concat(trim(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')), ', ') AS names, NULL AS person_id FROM persons WHERE trim(COALESCE(occupation,''))<>'' GROUP BY lower(trim(occupation)) ORDER BY occupation COLLATE NOCASE"],
    'census' => ['label' => 'Recensements', 'columns' => ['year' => 'Année', 'date' => 'Date', 'place' => 'Lieu', 'address' => 'Adresse', 'members' => 'Membres', 'names' => 'Qui'],
        'sql' => "SELECT c.id, c.year, c.date_text AS date, pl.name AS place, c.address, (SELECT count(*) FROM census_members cm WHERE cm.census_id=c.id) AS members,
            (SELECT group_concat(trim(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')), ', ') FROM census_members cm JOIN persons p ON p.id=cm.person_id WHERE cm.census_id=c.id) AS names,
            NULL AS person_id FROM census_records c LEFT JOIN places pl ON pl.id=c.place_id ORDER BY c.year, pl.name"],
    'reminders' => ['label' => 'Rappels', 'columns' => ['title' => 'Rappel', 'due' => 'Échéance', 'category' => 'Catégorie', 'done' => 'Fait', 'notes' => 'Notes'],
        'sql' => "SELECT id, title, reminder_due_at AS due, reminder_category AS category, CASE WHEN reminder_done THEN 'oui' ELSE '' END AS done, notes, NULL AS person_id FROM standalone_reminders ORDER BY reminder_due_at"],
    'sources' => ['label' => 'Sources', 'columns' => ['title' => 'Source', 'author' => 'Auteur', 'agency' => 'Dépôt', 'publication' => 'Publication', 'url' => 'Lien', 'citations' => 'Citations'],
        'sql' => "SELECT s.id, s.title, s.author, s.agency, s.publication, s.url, (SELECT count(*) FROM source_links sl WHERE sl.source_record_id=s.id) AS citations, NULL AS person_id FROM sources s ORDER BY s.title COLLATE NOCASE"],
    'family_objects' => ['label' => 'Objets de famille', 'columns' => ['title' => 'Objet', 'kind' => 'Nature', 'person' => 'Le garde', 'location' => 'Où', 'origin' => 'Origine'],
        'sql' => "SELECT o.id, o.title, o.kind, o.location_text AS location, o.origin_text AS origin, o.holder_text, o.holder_person_id AS person_id FROM family_objects o ORDER BY o.title COLLATE NOCASE"],
    'courriers' => ['label' => 'Registre de courriers', 'columns' => ['organisme' => 'Organisme', 'destinataire' => 'Destinataire', 'objet' => 'Objet', 'sent' => 'Envoyé le', 'statut' => 'Statut', 'relance' => 'Relance'],
        'sql' => "SELECT id, organisme, destinataire, objet, date_envoi AS sent, statut, relance_date AS relance, NULL AS person_id FROM courriers ORDER BY date_envoi DESC"],
    'graves' => ['label' => 'Sépultures', 'columns' => ['cemetery' => 'Cimetière', 'city' => 'Commune', 'country' => 'Pays', 'plan' => 'Emplacement', 'state' => 'État', 'names' => 'Qui'],
        'sql' => "SELECT g.id, g.cemetery_name AS cemetery, g.city, g.country, g.plan_ref AS plan, g.condition_state AS state,
            (SELECT group_concat(trim(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')), ', ') FROM grave_persons gp JOIN persons p ON p.id=gp.person_id WHERE gp.grave_id=g.id) AS names, NULL AS person_id FROM graves g ORDER BY g.city, g.cemetery_name"],
    'budget' => ['label' => 'Budget de recherche', 'columns' => ['title' => 'Dépense', 'category' => 'Catégorie', 'amount' => 'Montant', 'date' => 'Date', 'vendor' => 'Fournisseur'],
        'sql' => "SELECT id, title, category, trim(COALESCE(amount,'') || ' ' || COALESCE(currency,'')) AS amount, expense_date AS date, vendor, NULL AS person_id FROM research_budget ORDER BY expense_date DESC"],
    'living' => ['label' => 'Répertoire des vivants', 'columns' => ['name' => 'Nom', 'relationship' => 'Lien de parenté', 'city' => 'Ville', 'email' => 'E-mail', 'phone' => 'Téléphone'],
        'sql' => "SELECT id, trim(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')) AS name, relationship, city, email, COALESCE(NULLIF(phone_mobile,''), NULLIF(phone,''), phone_landline) AS phone, person_id FROM living_contacts ORDER BY last_name COLLATE NOCASE"],
];
const LIST_SOURCES = ['events', 'persons', 'free', 'records', ...['places', 'media', 'occupations', 'census', 'reminders', 'sources', 'family_objects', 'courriers', 'graves', 'budget', 'living']];

/** Colonnes de chaque sorte de liste (pour l'écran). */
function my_list_columns(): array
{
    $out = ['events' => LIST_EVENT_COLUMNS, 'persons' => LIST_PERSON_COLUMNS];
    foreach (LIST_TABLE_SOURCES as $k => $t) { $out[$k] = $t['columns']; }
    return $out;
}
function my_list_source_labels(): array
{
    return array_map(static fn($t) => $t['label'], LIST_TABLE_SOURCES);
}

function my_lists(PDO $pdo): array
{
    $rows = $pdo->query('SELECT * FROM custom_lists ORDER BY position, id')->fetchAll();
    foreach ($rows as &$r) { $r['definition'] = json_decode((string) $r['definition_json'], true) ?: []; unset($r['definition_json']); }
    unset($r);
    return with_labels($pdo, 'custom_list', $rows);
}

function my_list_clean_definition(array $d, string $source): array
{
    if ($source === 'records') { return my_list_records_definition($d); }
    $fields = ['event_type', 'year', 'death_year', 'date_range', 'place', 'any_place', 'near_place', 'last_name', 'first_name', 'occupation', 'gender', 'age_at', 'lifespan', 'children_count', 'unions_count', 'event_count', 'label', 'sosa', 'no_parents', 'no_source', 'text',
        'death_place', 'county', 'spouse_name', 'parent_name', 'has_media', 'living', 'bookmarked', 'sosa_generation', 'birth_month', 'death_cause', 'source_count', 'note', 'of_person'];
    $isoDate = static function ($v): string { $v = trim((string) $v); if (preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $v, $m) && checkdate((int) $m[2], (int) $m[3], (int) $m[1])) { return $v; } return function_exists('exact_date') ? (string) (exact_date($v) ?? '') : ''; };
    $rules = [];
    foreach (is_array($d['rules'] ?? null) ? $d['rules'] : [] as $r) {
        if (!is_array($r) || !in_array($r['field'] ?? '', $fields, true)) { continue; }
        $counting = in_array($r['field'], ['children_count', 'unions_count', 'event_count', 'source_count'], true); // 0 est une vraie valeur (« aucun enfant »)
        $num = static fn($v) => $counting ? (is_numeric($v) ? max(0, (int) $v) : null) : (safe_int($v ?? 0) ?: null);
        $rules[] = ['field' => $r['field'], 'value' => mb_substr(safe_text($r['value'] ?? ''), 0, 200), 'from' => $num($r['from'] ?? null), 'to' => $num($r['to'] ?? null),
            'values' => array_values(array_filter(array_map('intval', is_array($r['values'] ?? null) ? $r['values'] : []))), 'not' => !empty($r['not']),
            'date_from' => $isoDate($r['date_from'] ?? ''), 'date_to' => $isoDate($r['date_to'] ?? ''), 'km' => max(0, min(1000, safe_int($r['km'] ?? 0)))];
    }
    if ($source !== 'events' && $source !== 'persons') { $rules = []; } // listes écrites à la main ou reprises de l'onglet Listes : on trie avec les filtres de colonnes
    $allowed = $source === 'free' ? [] : array_keys(my_list_columns()[$source] ?? LIST_PERSON_COLUMNS);
    $columns = $source === 'free' ? [] : (array_values(array_intersect(is_array($d['columns'] ?? null) ? $d['columns'] : [], $allowed)) ?: array_slice($allowed, 0, 4));
    $custom = [];
    foreach (is_array($d['custom'] ?? null) ? $d['custom'] : [] as $c) {
        if (!is_array($c) || !in_array($c['type'] ?? '', LIST_CUSTOM_TYPES, true)) { continue; }
        $custom[] = ['key' => preg_replace('/[^a-z0-9_]/', '', strtolower((string) ($c['key'] ?? ''))) ?: 'c' . bin2hex(random_bytes(3)), 'label' => mb_substr(safe_text($c['label'] ?? ''), 0, 60) ?: 'Colonne',
            'type' => $c['type'], 'options' => array_values(array_filter(array_map(static fn($o) => mb_substr(safe_text($o), 0, 60), is_array($c['options'] ?? null) ? $c['options'] : [])))];
    }
    // Filtres par colonne : ne garder que certaines valeurs, un texte, ou une période (années)
    $filters = [];
    $filterable = array_merge($allowed, array_column($custom, 'key'));
    foreach (is_array($d['filters'] ?? null) ? $d['filters'] : [] as $col => $f) {
        if (!is_array($f) || !in_array((string) $col, $filterable, true)) { continue; }
        $clean = [];
        if (isset($f['values']) && is_array($f['values'])) { $clean['values'] = array_values(array_slice(array_map(static fn($v) => mb_substr(trim((string) $v), 0, 4000), array_filter($f['values'], 'is_scalar')), 0, 2000)); }
        if (trim((string) ($f['contains'] ?? '')) !== '') { $clean['contains'] = mb_substr(trim((string) $f['contains']), 0, 200); }
        if (safe_int($f['from'] ?? 0)) { $clean['from'] = safe_int($f['from']); }
        if (safe_int($f['to'] ?? 0)) { $clean['to'] = safe_int($f['to']); }
        if ($clean) { $filters[(string) $col] = $clean; }
    }
    return ['match' => ($d['match'] ?? '') === 'any' ? 'any' : 'all', 'rules' => $rules, 'columns' => $columns, 'custom' => $custom, 'filters' => $filters,
        'sort' => in_array($d['sort'] ?? '', ['date', 'name', 'place'], true) ? $d['sort'] : ($source === 'events' ? 'date' : 'name'),
        'in_lists' => !empty($d['in_lists']), // aussi affichée dans l'onglet Listes
        'display' => my_list_clean_display(is_array($d['display'] ?? null) ? $d['display'] : [], $filterable)];
}

const LIST_DISPLAY_MODES = ['table', 'cards', 'grouped', 'kanban', 'timeline', 'gallery'];
/** Apparence d'une liste : tableau, cartes, groupes, tableau Kanban, frise, galerie ; graphique, totaux, couleurs selon une valeur. */
function my_list_clean_display(array $x, array $cols): array
{
    $col = static fn($v) => in_array((string) $v, $cols, true) ? (string) $v : '';
    $hex = static fn($v) => preg_match('/^#[0-9a-f]{6}$/i', (string) $v) ? (string) $v : '';
    $rules = [];
    foreach (array_slice(is_array($x['colors'] ?? null) ? $x['colors'] : [], 0, 20) as $r) {
        if (!is_array($r) || $col($r['col'] ?? '') === '' || $hex($r['color'] ?? '') === '' || !in_array($r['op'] ?? '', ['eq', 'contains', 'empty', 'notempty'], true)) { continue; }
        $rules[] = ['col' => (string) $r['col'], 'op' => (string) $r['op'], 'value' => mb_substr(trim((string) ($r['value'] ?? '')), 0, 200), 'color' => (string) $r['color']];
    }
    return ['mode' => in_array($x['mode'] ?? '', LIST_DISPLAY_MODES, true) ? $x['mode'] : 'table',
        'title' => $col($x['title'] ?? ''), 'subtitle' => array_values(array_slice(array_filter(array_map($col, is_array($x['subtitle'] ?? null) ? $x['subtitle'] : [])), 0, 6)),
        'badge' => $col($x['badge'] ?? ''), 'group' => $col($x['group'] ?? ''), 'kanban' => $col($x['kanban'] ?? ''), 'date' => $col($x['date'] ?? ''),
        'chart' => $col($x['chart'] ?? ''), 'chart_style' => ($x['chart_style'] ?? '') === 'pie' ? 'pie' : 'bars', 'totals' => !empty($x['totals']),
        'size' => in_array($x['size'] ?? '', ['s', 'm', 'l'], true) ? $x['size'] : 'm', 'accent' => $hex($x['accent'] ?? '') ?: '#0066cc', 'colors' => $rules];
}

/** Enregistre seulement l'apparence d'une liste (depuis la liste elle-même). */
function save_my_list_display(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $s = $pdo->prepare('SELECT source, definition_json FROM custom_lists WHERE id=?'); $s->execute([$id]);
    $l = $s->fetch();
    if (!$l) { throw new RuntimeException('Liste introuvable.'); }
    $def = json_decode((string) $l['definition_json'], true) ?: [];
    $def['display'] = is_array($data['display'] ?? null) ? $data['display'] : [];
    $def = my_list_clean_definition($def, (string) $l['source']);
    $pdo->prepare('UPDATE custom_lists SET definition_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([json_encode($def, JSON_UNESCAPED_UNICODE), $id]);
    return ['display' => $def['display']];
}

function save_my_list(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $name = mb_substr(safe_text($data['name'] ?? ''), 0, 80);
    if ($name === '') { throw new RuntimeException('Donne un nom à la liste.'); }
    $source = in_array($data['source'] ?? '', LIST_SOURCES, true) ? $data['source'] : 'persons';
    $def = my_list_clean_definition(is_array($data['definition'] ?? null) ? $data['definition'] : [], $source);
    if ($source === 'free' && !$def['custom']) { throw new RuntimeException('Ajoute au moins une colonne à remplir.'); }
    if ($source === 'records' && !array_filter($def['fields'], static fn($f) => $f['type'] !== 'heading')) { throw new RuntimeException('Ajoute au moins un champ au formulaire.'); }
    $vals = [$name, mb_substr(safe_text($data['icon'] ?? '📋'), 0, 16) ?: '📋', h_long($data, 'description', 2000), $source, json_encode($def, JSON_UNESCAPED_UNICODE)];
    if ($id) { $pdo->prepare('UPDATE custom_lists SET name=?, icon=?, description=?, source=?, definition_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$vals, $id]); }
    else { $pdo->prepare('INSERT INTO custom_lists(name, icon, description, source, definition_json, position) VALUES(?,?,?,?,?,(SELECT COALESCE(max(position),0)+1 FROM custom_lists))')->execute($vals); $id = (int) $pdo->lastInsertId(); }
    return ['id' => $id];
}

function delete_my_list(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $pdo->prepare('DELETE FROM custom_list_rows WHERE list_id=?')->execute([$id]);
    foreach ($pdo->query('SELECT id FROM custom_list_records WHERE list_id=' . $id)->fetchAll(PDO::FETCH_COLUMN) as $rid) { my_list_record_unlink($pdo, (int) $rid); }
    $pdo->prepare('DELETE FROM custom_list_records WHERE list_id=?')->execute([$id]);
    $pdo->prepare("DELETE FROM label_links WHERE entity_type='custom_list' AND entity_id=?")->execute([$id]);
    $pdo->prepare('DELETE FROM custom_lists WHERE id=?')->execute([$id]);
    return ['ok' => true];
}

/** Une case d'une colonne à soi, ou l'ajout / le retrait d'une ligne à la main. */
function save_my_list_row(PDO $pdo, array $data): array
{
    $listId = safe_int($data['list_id'] ?? 0);
    $key = safe_text($data['row_key'] ?? '');
    $exists = $pdo->prepare('SELECT 1 FROM custom_lists WHERE id=?'); $exists->execute([$listId]);
    if (!$exists->fetchColumn()) { throw new RuntimeException('Liste introuvable.'); }
    if ($key === 'f:new') { // nouvelle ligne écrite à la main
        $n = (int) $pdo->query("SELECT COALESCE(max(CAST(substr(row_key,3) AS INTEGER)),0)+1 FROM custom_list_rows WHERE list_id=" . $listId . " AND row_key LIKE 'f:%'")->fetchColumn();
        $key = 'f:' . $n;
        $pdo->prepare("INSERT INTO custom_list_rows(list_id, row_key, included, data_json) VALUES(?,?,1,'{}')")->execute([$listId, $key]);
        if (!isset($data['field'])) { return ['ok' => true, 'row_key' => $key]; }
    }
    if (!preg_match('/^[peft]:\d+$/', $key)) { throw new RuntimeException('Ligne invalide.'); }
    $s = $pdo->prepare('SELECT * FROM custom_list_rows WHERE list_id=? AND row_key=?'); $s->execute([$listId, $key]);
    $row = $s->fetch() ?: ['included' => 0, 'data_json' => '{}'];
    $values = json_decode((string) $row['data_json'], true) ?: [];
    if (array_key_exists('included', $data)) { $row['included'] = max(-1, min(1, (int) $data['included'])); }
    if (isset($data['field'])) { $values[preg_replace('/[^a-z0-9_]/', '', strtolower((string) $data['field']))] = mb_substr(safe_text($data['value'] ?? ''), 0, 2000); }
    if (str_starts_with($key, 'f:') && (int) $row['included'] === -1) { // ligne écrite à la main supprimée
        $pdo->prepare('DELETE FROM custom_list_rows WHERE list_id=? AND row_key=?')->execute([$listId, $key]);
        return ['ok' => true];
    }
    $pdo->prepare('INSERT OR REPLACE INTO custom_list_rows(list_id, row_key, included, data_json) VALUES(?,?,?,?)')->execute([$listId, $key, (int) $row['included'], json_encode($values, JSON_UNESCAPED_UNICODE)]);
    return ['ok' => true, 'row_key' => $key];
}

/** Les numéros Sosa de la personne de départ (si l'application sait les calculer). */
function my_list_sosas(PDO $pdo): array
{
    if (!function_exists('sosa_positions') || !function_exists('dashboard_sosa_root')) { return []; }
    $root = dashboard_sosa_root($pdo);
    return $root ? (sosa_positions($pdo, (int) $root['id'])['personSosas'] ?? []) : [];
}

/** Calcule les lignes d'une liste. */
function my_list_rows(PDO $pdo, int $listId): array
{
    $s = $pdo->prepare('SELECT * FROM custom_lists WHERE id=?'); $s->execute([$listId]);
    $list = $s->fetch();
    if (!$list) { throw new RuntimeException('Liste introuvable.'); }
    return my_list_rows_for($pdo, $list);
}

/**
 * Widgets à soi (tableau de bord) : les lignes d'une de « Mes listes », ou d'une source décrite dans le widget
 * (personnes, événements ou une liste de l'app, avec des critères), sans l'enregistrer comme liste.
 */
function widget_rows(PDO $pdo, array $q): array
{
    // La personne de la fiche où le widget est posé (bloc d'une fiche) : pour le critère « par rapport à la personne »
    $GLOBALS['LCNDA_LIST_CONTEXT_PERSON'] = safe_int($q['person_id'] ?? 0);
    if (safe_int($q['list_id'] ?? 0)) { return my_list_rows($pdo, safe_int($q['list_id'])); }
    $source = in_array($q['source'] ?? '', LIST_SOURCES, true) && ($q['source'] ?? '') !== 'free' ? (string) $q['source'] : 'persons';
    $def = is_array($q['definition'] ?? null) ? $q['definition'] : [];
    $def['columns'] = array_keys(my_list_columns()[$source] ?? LIST_PERSON_COLUMNS); // toutes : le widget choisit à l'affichage
    return my_list_rows_for($pdo, ['id' => 0, 'name' => '', 'icon' => '', 'description' => '', 'source' => $source, 'definition_json' => json_encode($def)], !empty($q['count']));
}

/** $countOnly : seulement le nombre de lignes (widget « Chiffres »), sans limite et sans calculer les colonnes. */
function my_list_rows_for(PDO $pdo, array $list, bool $countOnly = false): array
{
    $listId = (int) $list['id'];
    $def = my_list_clean_definition(json_decode((string) $list['definition_json'], true) ?: [], (string) $list['source']);
    if ($list['source'] === 'free') { return my_list_free_rows($pdo, $list, $def); }
    if ($list['source'] === 'records') { return $countOnly ? ['count' => my_list_record_count($pdo, $listId)] : my_list_record_rows($pdo, $list, $def); }
    if ($countOnly && isset(LIST_TABLE_SOURCES[$list['source']])) { return ['count' => (int) $pdo->query('SELECT count(*) FROM (' . LIST_TABLE_SOURCES[$list['source']]['sql'] . ')')->fetchColumn()]; }
    if (isset(LIST_TABLE_SOURCES[$list['source']])) { return my_list_table_rows($pdo, $list, $def); }
    $isEvents = $list['source'] === 'events';
    $sosas = (in_array('sosa', $def['columns'], true) || array_filter($def['rules'], static fn($r) => $r['field'] === 'sosa')) ? my_list_sosas($pdo) : [];
    $conds = []; $params = [];
    // Personnes concernées : celle de l'événement, ou les deux conjoints d'un événement de couple
    $personMatch = static fn(string $sqlOnPerson) => $isEvents
        ? "(EXISTS (SELECT 1 FROM persons x WHERE x.id IN (e.person_id, f.partner1_id, f.partner2_id) AND {$sqlOnPerson}))"
        : "(EXISTS (SELECT 1 FROM persons x WHERE x.id = p.id AND {$sqlOnPerson}))";
    foreach ($def['rules'] as $r) {
        $like = '%' . $r['value'] . '%';
        $c = null;
        switch ($r['field']) {
            case 'event_type':
                if (!$r['values']) { $c = '0'; break; } // aucune valeur choisie (ou type absent de cette base) : ne garde rien, au lieu de toute la base
                $in = implode(',', $r['values']);
                $yr = ($r['from'] ? ' AND ee.year >= ' . (int) $r['from'] : '') . ($r['to'] ? ' AND ee.year <= ' . (int) $r['to'] : '');
                $c = $isEvents ? "(e.event_type_id IN ({$in}))"
                    : "(EXISTS (SELECT 1 FROM events ee LEFT JOIN families ff ON ff.id=ee.family_id WHERE ee.event_type_id IN ({$in}){$yr} AND (ee.person_id=p.id OR ff.partner1_id=p.id OR ff.partner2_id=p.id)))";
                break;
            case 'year':
                $col = $isEvents ? 'e.year' : "(SELECT min(ee.year) FROM events ee JOIN event_types tt ON tt.id=ee.event_type_id WHERE ee.person_id=p.id AND tt.gedcom_tag IN ('BIRT','CHR','BAPM'))";
                $parts = [];
                if ($r['from']) { $parts[] = "{$col} >= " . (int) $r['from']; }
                if ($r['to']) { $parts[] = "{$col} <= " . (int) $r['to']; }
                if ($parts) { $c = '(' . implode(' AND ', $parts) . ')'; }
                break;
            case 'date_range': // entre deux dates précises (12 mars 1750 → 3 juin 1752) ; une année seule compte si elle est dans la période
                if ($r['date_from'] === '' && $r['date_to'] === '') { break; }
                $ids = my_list_events_between($pdo, $r['date_from'], $r['date_to'], $isEvents ? null : ['BIRT', 'CHR', 'BAPM']);
                $in = implode(',', $ids ?: [0]);
                $c = $isEvents ? "(e.id IN ({$in}))" : "(EXISTS (SELECT 1 FROM events ee WHERE ee.person_id=p.id AND ee.id IN ({$in})))";
                break;
            case 'near_place': // à moins de N km d'une ville (lieux qui ont des coordonnées)
                if ($r['value'] === '' || !$r['km']) { break; }
                $in = implode(',', my_list_places_near($pdo, $r['value'], $r['km']) ?: [0]);
                $c = $isEvents ? "(e.place_id IN ({$in}))"
                    : "(EXISTS (SELECT 1 FROM events ee LEFT JOIN families ff ON ff.id=ee.family_id WHERE (ee.person_id=p.id OR ff.partner1_id=p.id OR ff.partner2_id=p.id) AND ee.place_id IN ({$in})))";
                break;
            case 'age_at': // âge à un événement (ou à n'importe lequel si aucun n'est choisi), d'après l'année de naissance
                if (!$r['from'] && !$r['to']) { break; }
                $birth = "(SELECT min(bb.year) FROM events bb JOIN event_types bt ON bt.id=bb.event_type_id WHERE bb.person_id=%s AND bt.gedcom_tag IN ('BIRT','CHR','BAPM'))";
                $range = static fn(string $age) => ($r['from'] ? " AND {$age} >= " . (int) $r['from'] : '') . ($r['to'] ? " AND {$age} <= " . (int) $r['to'] : '');
                $types = $r['values'] ? ' AND ee.event_type_id IN (' . implode(',', $r['values']) . ')' : '';
                $c = $isEvents
                    ? '(e.year IS NOT NULL' . ($r['values'] ? ' AND e.event_type_id IN (' . implode(',', $r['values']) . ')' : '') . $range('(e.year - ' . sprintf($birth, 'COALESCE(e.person_id, f.partner1_id)') . ')') . ')'
                    : '(EXISTS (SELECT 1 FROM events ee LEFT JOIN families ff ON ff.id=ee.family_id WHERE (ee.person_id=p.id OR ff.partner1_id=p.id OR ff.partner2_id=p.id) AND ee.year IS NOT NULL' . $types . $range('(ee.year - ' . sprintf($birth, 'p.id') . ')') . '))';
                break;
            case 'lifespan': // a vécu entre X et Y ans (années de naissance et de décès)
                if (!$r['from'] && !$r['to']) { break; }
                $span = "((SELECT min(dd.year) FROM events dd JOIN event_types dt ON dt.id=dd.event_type_id WHERE dd.person_id=x.id AND dt.gedcom_tag IN ('DEAT','BURI')) - (SELECT min(bb.year) FROM events bb JOIN event_types bt ON bt.id=bb.event_type_id WHERE bb.person_id=x.id AND bt.gedcom_tag IN ('BIRT','CHR','BAPM')))";
                $c = $personMatch("{$span} IS NOT NULL" . ($r['from'] ? " AND {$span} >= " . (int) $r['from'] : '') . ($r['to'] ? " AND {$span} <= " . (int) $r['to'] : ''));
                break;
            case 'children_count': // nombre d'enfants (toutes unions) : « 2 et 2 » = exactement deux
                if ($r['from'] === null && $r['to'] === null && $r['value'] === '') { break; }
                $n = '(SELECT count(DISTINCT fc.child_id) FROM family_children fc JOIN families fz ON fz.id=fc.family_id WHERE fz.partner1_id=x.id OR fz.partner2_id=x.id)';
                $c = $personMatch(my_list_count_range($n, $r));
                break;
            case 'unions_count': // nombre d'unions (familles avec un conjoint)
                if ($r['from'] === null && $r['to'] === null && $r['value'] === '') { break; }
                $n = '(SELECT count(*) FROM families fz WHERE (fz.partner1_id=x.id AND fz.partner2_id IS NOT NULL) OR (fz.partner2_id=x.id AND fz.partner1_id IS NOT NULL))';
                $c = $personMatch(my_list_count_range($n, $r));
                break;
            case 'event_count': // nombre d'événements d'un type (ex. au moins 3 résidences, aucun voyage…)
                if (!$r['values'] || ($r['from'] === null && $r['to'] === null && $r['value'] === '')) { break; }
                $n = '(SELECT count(*) FROM events ec LEFT JOIN families fe ON fe.id=ec.family_id WHERE ec.event_type_id IN (' . implode(',', $r['values']) . ') AND (ec.person_id=x.id OR fe.partner1_id=x.id OR fe.partner2_id=x.id))';
                $c = $personMatch(my_list_count_range($n, $r));
                break;
            case 'death_place': // mort(e) ou inhumé(e) à (lieu contient)
                if ($r['value'] === '') { break; }
                $c = $personMatch("EXISTS (SELECT 1 FROM events ee JOIN event_types tt ON tt.id=ee.event_type_id JOIN places pp ON pp.id=ee.place_id WHERE ee.person_id=x.id AND tt.gedcom_tag IN ('DEAT','BURI') AND (pp.name LIKE ? OR pp.county LIKE ? OR pp.state LIKE ? OR pp.country LIKE ?))");
                array_push($params, $like, $like, $like, $like);
                break;
            case 'county': // un événement dans le département, la région ou le pays (contient)
                if ($r['value'] === '') { break; }
                $c = $isEvents ? '(pl.county LIKE ? OR pl.state LIKE ? OR pl.country LIKE ?)'
                    : "(EXISTS (SELECT 1 FROM events ee LEFT JOIN families ff ON ff.id=ee.family_id JOIN places pp ON pp.id=ee.place_id WHERE (ee.person_id=p.id OR ff.partner1_id=p.id OR ff.partner2_id=p.id) AND (pp.county LIKE ? OR pp.state LIKE ? OR pp.country LIKE ?)))";
                array_push($params, $like, $like, $like);
                break;
            case 'spouse_name': // un conjoint dont le nom ou le prénom contient…
                if ($r['value'] === '') { break; }
                $c = $personMatch("EXISTS (SELECT 1 FROM families fs JOIN persons sp ON sp.id = CASE WHEN fs.partner1_id=x.id THEN fs.partner2_id ELSE fs.partner1_id END WHERE (fs.partner1_id=x.id OR fs.partner2_id=x.id) AND (sp.last_name LIKE ? OR sp.first_name LIKE ? OR (sp.first_name || ' ' || sp.last_name) LIKE ?))");
                array_push($params, $like, $like, $like);
                break;
            case 'parent_name': // un parent dont le nom ou le prénom contient…
                if ($r['value'] === '') { break; }
                $c = $personMatch("EXISTS (SELECT 1 FROM family_children fp JOIN families fq ON fq.id=fp.family_id JOIN persons pa ON pa.id IN (fq.partner1_id, fq.partner2_id) WHERE fp.child_id=x.id AND (pa.last_name LIKE ? OR pa.first_name LIKE ? OR (pa.first_name || ' ' || pa.last_name) LIKE ?))");
                array_push($params, $like, $like, $like);
                break;
            case 'has_media': // a au moins une photo ou un document
                $c = $isEvents ? "(EXISTS (SELECT 1 FROM media_links ml WHERE ml.entity_type='event' AND ml.entity_id=e.id))" : "(EXISTS (SELECT 1 FROM media_links ml WHERE (ml.entity_type='person' AND ml.entity_id=p.id) OR (ml.entity_type='event' AND ml.entity_id IN (SELECT id FROM events WHERE person_id=p.id))))";
                break;
            case 'living':
                if (!in_array($r['value'], ['living', 'deceased', 'unknown'], true)) { break; }
                $c = $personMatch('x.living_status = ?'); $params[] = $r['value'];
                break;
            case 'bookmarked':
                $c = $personMatch('x.is_bookmarked = 1');
                break;
            case 'sosa_generation': // génération dans la lignée Sosa (1 = le de cujus, 2 = ses parents…)
                if (!$r['from'] && !$r['to']) { break; }
                $ids = [];
                foreach ($sosaAll ??= my_list_sosas($pdo) as $pid => $nums) { $g = (int) floor(log((float) min((array) $nums), 2)) + 1; if ((!$r['from'] || $g >= $r['from']) && (!$r['to'] || $g <= $r['to'])) { $ids[] = (int) $pid; } }
                $in = implode(',', $ids ?: [0]);
                $c = $isEvents ? "(e.person_id IN ({$in}) OR f.partner1_id IN ({$in}) OR f.partner2_id IN ({$in}))" : "(p.id IN ({$in}))";
                break;
            case 'birth_month': // né(e) en janvier, en juin… (dates complètes seulement)
                if (!$r['values']) { break; }
                $months = array_values(array_filter($r['values'], static fn($m) => $m >= 1 && $m <= 12));
                $ids = [];
                $bt = $pdo->query("SELECT e.id, e.person_id, e.date_text FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE t.gedcom_tag IN ('BIRT','CHR','BAPM') AND e.date_text<>''");
                foreach ($bt as $b) { $d = function_exists('exact_date') ? exact_date((string) $b['date_text']) : null; if ($d && in_array((int) substr($d, 5, 2), $months, true)) { $ids[] = (int) $b['person_id']; } }
                $in = implode(',', array_unique($ids) ?: [0]);
                $c = $isEvents ? "(e.person_id IN ({$in}))" : "(p.id IN ({$in}))";
                break;
            case 'death_cause':
                if ($r['value'] === '') { break; }
                $c = $isEvents ? '(e.cause LIKE ?)' : "(EXISTS (SELECT 1 FROM events ee JOIN event_types tt ON tt.id=ee.event_type_id WHERE ee.person_id=p.id AND tt.gedcom_tag IN ('DEAT','BURI') AND (ee.cause LIKE ? OR ee.description LIKE ?)))";
                $params[] = $like; if (!$isEvents) { $params[] = $like; }
                break;
            case 'source_count':
                if ($r['from'] === null && $r['to'] === null) { break; }
                $n = $isEvents ? "(SELECT count(*) FROM source_links sl WHERE sl.entity_type='event' AND sl.entity_id=e.id)"
                    : "(SELECT count(*) FROM source_links sl WHERE (sl.entity_type='person' AND sl.entity_id=p.id) OR (sl.entity_type='event' AND sl.entity_id IN (SELECT id FROM events WHERE person_id=p.id OR family_id IN (SELECT id FROM families WHERE partner1_id=p.id OR partner2_id=p.id))))";
                $c = '(' . my_list_count_range($n, $r) . ')';
                break;
            case 'note': // une note (de la fiche ou de l'événement) contient…
                if ($r['value'] === '') { break; }
                $c = $isEvents ? "(EXISTS (SELECT 1 FROM notes nn WHERE nn.entity_type='event' AND nn.entity_id=e.id AND (nn.body LIKE ? OR nn.title LIKE ?)))"
                    : "(EXISTS (SELECT 1 FROM notes nn WHERE nn.entity_type='person' AND nn.entity_id=p.id AND (nn.body LIKE ? OR nn.title LIKE ?)))";
                array_push($params, $like, $like);
                break;
            case 'of_person': // par rapport à la personne de la fiche (ou au de cujus) : ses ancêtres, ses descendants, sa famille…
                $ids = my_list_relatives($pdo, (int) ($GLOBALS['LCNDA_LIST_CONTEXT_PERSON'] ?? 0), $r['value'] ?: 'ancestors');
                $in = implode(',', $ids ?: [0]);
                $c = $isEvents ? "(e.person_id IN ({$in}) OR f.partner1_id IN ({$in}) OR f.partner2_id IN ({$in}))" : "(p.id IN ({$in}))";
                break;
            case 'death_year':
                if ($isEvents) { break; }
                $col = "(SELECT min(ee.year) FROM events ee JOIN event_types tt ON tt.id=ee.event_type_id WHERE ee.person_id=p.id AND tt.gedcom_tag IN ('DEAT','BURI'))";
                $parts = [];
                if ($r['from']) { $parts[] = "{$col} >= " . (int) $r['from']; }
                if ($r['to']) { $parts[] = "{$col} <= " . (int) $r['to']; }
                if ($parts) { $c = '(' . implode(' AND ', $parts) . ')'; }
                break;
            case 'place':
                if ($r['value'] === '') { break; }
                $c = $isEvents ? '(pl.name LIKE ? OR pl.county LIKE ? OR pl.state LIKE ? OR pl.country LIKE ?)'
                    : "(EXISTS (SELECT 1 FROM events ee JOIN event_types tt ON tt.id=ee.event_type_id JOIN places pp ON pp.id=ee.place_id WHERE ee.person_id=p.id AND tt.gedcom_tag IN ('BIRT','CHR','BAPM') AND (pp.name LIKE ? OR pp.county LIKE ? OR pp.state LIKE ? OR pp.country LIKE ?)))";
                array_push($params, $like, $like, $like, $like);
                break;
            case 'any_place':
                if ($r['value'] === '') { break; }
                $c = $isEvents ? '(pl.name LIKE ? OR pl.county LIKE ? OR pl.state LIKE ? OR pl.country LIKE ?)'
                    : "(EXISTS (SELECT 1 FROM events ee LEFT JOIN families ff ON ff.id=ee.family_id JOIN places pp ON pp.id=ee.place_id WHERE (ee.person_id=p.id OR ff.partner1_id=p.id OR ff.partner2_id=p.id) AND (pp.name LIKE ? OR pp.county LIKE ? OR pp.state LIKE ? OR pp.country LIKE ?)))";
                array_push($params, $like, $like, $like, $like);
                break;
            case 'last_name': case 'first_name': case 'occupation':
                if ($r['value'] === '') { break; }
                $c = $personMatch("x.{$r['field']} LIKE ?"); $params[] = $like;
                break;
            case 'gender':
                if (!in_array($r['value'], ['male', 'female', 'unknown'], true)) { break; }
                $c = $personMatch('x.gender = ?'); $params[] = $r['value'];
                break;
            case 'label':
                if (!$r['values']) { $c = '0'; break; } // aucune valeur choisie (ou type absent de cette base) : ne garde rien, au lieu de toute la base
                $in = implode(',', $r['values']);
                $c = $isEvents ? "(EXISTS (SELECT 1 FROM label_links ll WHERE ll.label_id IN ({$in}) AND ((ll.entity_type='event' AND ll.entity_id=e.id) OR (ll.entity_type='person' AND ll.entity_id IN (e.person_id, f.partner1_id, f.partner2_id)))))"
                    : "(EXISTS (SELECT 1 FROM label_links ll WHERE ll.label_id IN ({$in}) AND ll.entity_type='person' AND ll.entity_id=p.id))";
                break;
            case 'sosa':
                $ids = array_map('intval', array_keys($sosas)) ?: [0];
                $c = $isEvents ? '(e.person_id IN (' . implode(',', $ids) . ') OR f.partner1_id IN (' . implode(',', $ids) . ') OR f.partner2_id IN (' . implode(',', $ids) . '))' : '(p.id IN (' . implode(',', $ids) . '))';
                break;
            case 'no_parents':
                $c = $personMatch('NOT EXISTS (SELECT 1 FROM family_children fc WHERE fc.child_id = x.id)');
                break;
            case 'no_source':
                $c = $isEvents ? "(NOT EXISTS (SELECT 1 FROM source_links sl WHERE sl.entity_type='event' AND sl.entity_id=e.id))"
                    : "(NOT EXISTS (SELECT 1 FROM source_links sl WHERE (sl.entity_type='person' AND sl.entity_id=p.id) OR (sl.entity_type='event' AND sl.entity_id IN (SELECT id FROM events WHERE person_id=p.id OR family_id IN (SELECT id FROM families WHERE partner1_id=p.id OR partner2_id=p.id)))))";
                break;
            case 'text':
                if ($r['value'] === '') { break; }
                $c = $isEvents ? '(e.description LIKE ? OR e.title LIKE ?)' : '(p.physical_description LIKE ? OR p.occupation LIKE ?)';
                array_push($params, $like, $like);
                break;
        }
        if ($c !== null) { $conds[] = $r['not'] ? "NOT COALESCE({$c}, 0)" : $c; } // « pas » garde aussi ce qui n'a pas de valeur
    }
    // Ajouts et retraits à la main
    $manual = [];
    $ms = $pdo->prepare('SELECT row_key, included, data_json FROM custom_list_rows WHERE list_id=?'); $ms->execute([$listId]);
    foreach ($ms->fetchAll() as $m) { $manual[$m['row_key']] = ['included' => (int) $m['included'], 'values' => json_decode((string) $m['data_json'], true) ?: []]; }
    $prefix = $isEvents ? 'e:' : 'p:'; // une liste changée de sorte ne reprend pas les ajouts de l'autre sorte
    $added = array_map(static fn($k) => (int) substr($k, 2), array_keys(array_filter($manual, static fn($m, $k) => $m['included'] === 1 && str_starts_with((string) $k, $prefix), ARRAY_FILTER_USE_BOTH)));
    $where = $conds ? '(' . implode($def['match'] === 'any' ? ' OR ' : ' AND ', $conds) . ')' : '1';
    if ($added) { $where = "({$where} OR " . ($isEvents ? 'e.id' : 'p.id') . ' IN (' . implode(',', $added) . '))'; }
    if ($isEvents) {
        $sql = "SELECT e.id, e.year, e.date_text, e.description, e.person_id, e.family_id, t.label AS type_label, pl.name AS place, pl.county,
                f.partner1_id, f.partner2_id, (SELECT count(*) FROM source_links sl WHERE sl.entity_type='event' AND sl.entity_id=e.id) AS sources
            FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id LEFT JOIN families f ON f.id=e.family_id
            WHERE {$where} ORDER BY " . ($def['sort'] === 'place' ? 'pl.name COLLATE NOCASE, ' : '') . "COALESCE(e.year, 9999), e.id LIMIT 3000";
    } else {
        $sql = "SELECT p.id FROM persons p WHERE {$where} ORDER BY p.last_name COLLATE NOCASE, p.first_name COLLATE NOCASE LIMIT 3000";
    }
    // seulement les fiches qui répondent aux critères, sans limite (critères des distributions de Graphiques)
    if (!empty($list['ids_only']) && !$isEvents) {
        $st = $pdo->prepare("SELECT p.id FROM persons p WHERE {$where}"); $st->execute($params);
        return ['ids' => array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN))];
    }
    if ($countOnly) { // liste jamais enregistrée : pas de lignes ajoutées ou retirées à la main
        $c = $pdo->prepare('SELECT count(*) FROM (' . preg_replace('/ ORDER BY .*$/s', '', $sql) . ')'); $c->execute($params);
        return ['count' => (int) $c->fetchColumn()];
    }
    $st = $pdo->prepare($sql); $st->execute($params);
    $raw = $st->fetchAll();
    $pids = [];
    foreach ($raw as $r) { foreach ($isEvents ? [$r['person_id'], $r['partner1_id'], $r['partner2_id']] : [$r['id']] as $x) { if ($x) { $pids[] = (int) $x; } } }
    $people = collection_people($pdo, $pids);
    $life = my_list_life($pdo, array_keys($people));
    // Colonnes « Nombre d'enfants », « Nombre d'unions », « Pays de naissance » : calculées seulement si on les montre
    $counts = [];
    if (!$isEvents && $people && array_intersect(['children', 'marriages', 'birth_country'], $def['columns'])) {
        $in = implode(',', array_map('intval', array_keys($people)));
        foreach ($pdo->query("SELECT p.id,
                (SELECT count(DISTINCT fc.child_id) FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE f.partner1_id=p.id OR f.partner2_id=p.id) AS children,
                (SELECT count(*) FROM families f WHERE (f.partner1_id=p.id AND f.partner2_id IS NOT NULL) OR (f.partner2_id=p.id AND f.partner1_id IS NOT NULL)) AS marriages,
                (SELECT pl.country FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN places pl ON pl.id=e.place_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('BIRT','CHR','BAPM') ORDER BY t.gedcom_tag='BIRT' DESC LIMIT 1) AS country
            FROM persons p WHERE p.id IN ({$in})") as $c) { $counts[(int) $c['id']] = $c; }
    }
    $out = [];
    foreach ($raw as $r) {
        $key = ($isEvents ? 'e:' : 'p:') . $r['id'];
        if (($manual[$key]['included'] ?? 0) === -1) { continue; }
        $row = ['key' => $key, 'values' => $manual[$key]['values'] ?? [], 'manual' => ($manual[$key]['included'] ?? 0) === 1];
        if ($isEvents) {
            $ps = array_values(array_filter(array_map(static fn($x) => $x ? ($people[(int) $x] ?? null) : null, [$r['person_id'], $r['partner1_id'], $r['partner2_id']])));
            $main = $ps[0] ?? null;
            $row['people'] = $ps;
            $row['cells'] = ['date' => $r['date_text'] ?: (string) ($r['year'] ?? ''), 'type' => $r['type_label'], 'place' => trim(($r['place'] ?? '') . ($r['county'] ? ' (' . $r['county'] . ')' : '')), 'description' => (string) $r['description'],
                'age' => $main && $r['year'] && !empty($life[(int) $main['id']]['by']) ? ((int) $r['year'] - $life[(int) $main['id']]['by']) . ' ans' : '', 'sources' => (int) $r['sources']];
            $row['year'] = $r['year'] ? (int) $r['year'] : null;
        } else {
            $p = $people[(int) $r['id']] ?? null;
            if (!$p) { continue; }
            $l = $life[(int) $p['id']] ?? [];
            $row['people'] = [$p];
            $row['cells'] = ['birth' => $l['birth'] ?? '', 'birthplace' => $l['birthplace'] ?? '', 'death' => $l['death'] ?? '', 'deathplace' => $l['deathplace'] ?? '',
                'age' => !empty($l['by']) && !empty($l['dy']) ? ($l['dy'] - $l['by']) . ' ans' : '', 'occupation' => (string) ($p['occupation'] ?? ''),
                'gender' => ['male' => 'Homme', 'female' => 'Femme'][$p['gender'] ?? ''] ?? '', 'parents' => $l['parents'] ?? '', 'sosa' => isset($sosas[(int) $p['id']]) ? implode(', ', (array) $sosas[(int) $p['id']]) : '',
                'sources' => (int) ($l['sources'] ?? 0), 'labels' => $l['labels'] ?? '',
                'last_name' => trim((string) ($p['last_name'] ?? '')), 'first_name' => (string) (preg_split('/[\s,]+/u', trim((string) ($p['first_name'] ?? '')))[0] ?? ''),
                'children' => isset($counts[(int) $p['id']]) ? (string) $counts[(int) $p['id']]['children'] : '', 'marriages' => isset($counts[(int) $p['id']]) ? (string) $counts[(int) $p['id']]['marriages'] : '',
                'birth_country' => (string) ($counts[(int) $p['id']]['country'] ?? '')];
            $row['year'] = $l['by'] ?? null;
        }
        $out[] = $row;
    }
    my_list_link_people($pdo, $out, $def);
    if (!$isEvents && $def['sort'] === 'date') { usort($out, static fn($a, $b) => ($a['year'] ?? 9999) <=> ($b['year'] ?? 9999)); }
    if (!$isEvents && $def['sort'] === 'place') { usort($out, static fn($a, $b) => strcmp((string) $a['cells']['birthplace'], (string) $b['cells']['birthplace'])); }
    $list['definition'] = $def; unset($list['definition_json']);
    $list['labels'] = collection_labels($pdo, 'custom_list', [(int) $list['id']])[(int) $list['id']] ?? [];
    return ['list' => $list, 'rows' => $out, 'columns' => $isEvents ? LIST_EVENT_COLUMNS : LIST_PERSON_COLUMNS, 'truncated' => count($raw) >= 3000];
}

/** Naissance, décès, parents, sources et étiquettes d'un lot de personnes (pour les colonnes). */
/** Les proches d'une personne (0 = le de cujus) : ancêtres, descendants, les deux, famille proche, même nom */
function my_list_relatives(PDO $pdo, int $pid, string $what): array
{
    if (!$pid) { $pid = (int) $pdo->query('SELECT id FROM persons ORDER BY is_start DESC, id LIMIT 1')->fetchColumn(); }
    if (!$pid) { return []; }
    $ids = [];
    if (in_array($what, ['ancestors', 'branch', 'self_ancestors'], true) && function_exists('sosa_positions')) { $ids = array_merge($ids, array_values(sosa_positions($pdo, $pid, 60000)['positions'] ?? [])); }
    if (in_array($what, ['descendants', 'branch'], true) && function_exists('daboville_positions')) { $ids = array_merge($ids, array_values(daboville_positions($pdo, $pid, 60000)['positions'] ?? [])); }
    if ($what === 'family') {
        $st = $pdo->prepare("SELECT x FROM (
            SELECT CASE WHEN f.partner1_id=:p THEN f.partner2_id ELSE f.partner1_id END AS x FROM families f WHERE f.partner1_id=:p OR f.partner2_id=:p
            UNION SELECT fc.child_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE f.partner1_id=:p OR f.partner2_id=:p
            UNION SELECT f.partner1_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=:p
            UNION SELECT f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=:p
            UNION SELECT s.child_id FROM family_children fc JOIN family_children s ON s.family_id=fc.family_id WHERE fc.child_id=:p) WHERE x IS NOT NULL");
        $st->execute([':p' => $pid]);
        $ids = array_merge([$pid], array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN)));
    }
    if ($what === 'surname') {
        $st = $pdo->prepare("SELECT p.id FROM persons p, persons me WHERE me.id=? AND trim(me.last_name)<>'' AND lower(trim(p.last_name))=lower(trim(me.last_name))");
        $st->execute([$pid]); $ids = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
    }
    $ids = array_values(array_unique(array_map('intval', $ids)));
    if (in_array($what, ['ancestors', 'descendants'], true)) { $ids = array_values(array_filter($ids, static fn($id) => $id !== $pid)); }
    return $ids;
}

/** « entre from et to » sur un nombre (l'un des deux peut manquer ; « exactement » = from et to égaux) */
function my_list_count_range(string $n, array $r): string
{
    $parts = [];
    if ($r['from'] !== null) { $parts[] = "{$n} >= " . (int) $r['from']; }
    if ($r['to'] !== null) { $parts[] = "{$n} <= " . (int) $r['to']; }
    return $parts ? implode(' AND ', $parts) : '1';
}

/** Événements datés entre deux dates précises (AAAA-MM-JJ, l'une peut manquer) ; seulement de ces sortes si $tags. */
function my_list_events_between(PDO $pdo, string $from, string $to, ?array $tags = null): array
{
    $fy = $from !== '' ? (int) substr($from, 0, 4) : null; $ty = $to !== '' ? (int) substr($to, 0, 4) : null;
    $sql = 'SELECT e.id, e.date_text, e.year FROM events e' . ($tags ? ' JOIN event_types t ON t.id=e.event_type_id' : '') . ' WHERE e.year IS NOT NULL'
        . ($fy ? ' AND e.year >= ' . $fy : '') . ($ty ? ' AND e.year <= ' . $ty : '') . ($tags ? " AND t.gedcom_tag IN ('" . implode("','", array_map(static fn($t) => preg_replace('/[^A-Z_]/', '', $t), $tags)) . "')" : '');
    $ids = [];
    foreach ($pdo->query($sql) as $e) {
        $d = function_exists('exact_date') ? exact_date((string) $e['date_text']) : null;
        if ($d) { if (($from === '' || $d >= $from) && ($to === '' || $d <= $to)) { $ids[] = (int) $e['id']; } continue; }
        // année seule (ou date incomplète) : gardée si toute l'année est dans la période
        $y = (int) $e['year'];
        if (($from === '' || sprintf('%04d-01-01', $y) >= $from) && ($to === '' || sprintf('%04d-12-31', $y) <= $to)) { $ids[] = (int) $e['id']; }
    }
    return $ids;
}

/** Lieux à moins de $km kilomètres du lieu nommé (le plus utilisé de ce nom qui a des coordonnées). */
function my_list_places_near(PDO $pdo, string $name, int $km): array
{
    $c = $pdo->prepare("SELECT pl.latitude, pl.longitude FROM places pl WHERE pl.latitude IS NOT NULL AND pl.longitude IS NOT NULL AND (pl.name = ? COLLATE NOCASE OR pl.name LIKE ?)
        ORDER BY pl.name = ? COLLATE NOCASE DESC, (SELECT count(*) FROM events e WHERE e.place_id=pl.id) DESC LIMIT 1");
    $c->execute([trim($name), trim($name) . '%', trim($name)]);
    $center = $c->fetch();
    if (!$center) { return []; }
    [$lat0, $lon0] = [deg2rad((float) $center['latitude']), deg2rad((float) $center['longitude'])];
    $ids = [];
    foreach ($pdo->query('SELECT id, latitude, longitude FROM places WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND id IN (SELECT place_id FROM events WHERE place_id IS NOT NULL)') as $p) {
        $lat = deg2rad((float) $p['latitude']); $lon = deg2rad((float) $p['longitude']);
        $a = sin(($lat - $lat0) / 2) ** 2 + cos($lat0) * cos($lat) * sin(($lon - $lon0) / 2) ** 2;
        if (6371 * 2 * asin(min(1, sqrt($a))) <= $km) { $ids[] = (int) $p['id']; }
    }
    return $ids;
}

function my_list_life(PDO $pdo, array $ids): array
{
    $out = [];
    foreach (array_chunk(array_values(array_unique(array_map('intval', $ids))), 400) as $chunk) {
        $in = implode(',', $chunk);
        foreach ($pdo->query("SELECT e.person_id, t.gedcom_tag, e.date_text, e.year, pl.name AS place FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id
            WHERE e.person_id IN ({$in}) AND t.gedcom_tag IN ('BIRT','CHR','BAPM','DEAT','BURI') ORDER BY t.gedcom_tag IN ('BIRT','DEAT') DESC") as $e) {
            $pid = (int) $e['person_id'];
            $k = in_array($e['gedcom_tag'], ['BIRT', 'CHR', 'BAPM'], true) ? 'birth' : 'death';
            if (isset($out[$pid][$k])) { continue; }
            $out[$pid][$k] = $e['date_text'] ?: (string) ($e['year'] ?? '');
            $out[$pid][$k . 'place'] = (string) $e['place'];
            $out[$pid][$k === 'birth' ? 'by' : 'dy'] = $e['year'] ? (int) $e['year'] : null;
        }
        foreach ($pdo->query("SELECT fc.child_id, group_concat(trim(COALESCE(pp.first_name,'')||' '||COALESCE(pp.last_name,'')), ' et ') AS names FROM family_children fc JOIN families f ON f.id=fc.family_id
            JOIN persons pp ON pp.id IN (f.partner1_id, f.partner2_id) WHERE fc.child_id IN ({$in}) GROUP BY fc.child_id") as $r) { $out[(int) $r['child_id']]['parents'] = (string) $r['names']; }
        foreach ($pdo->query("SELECT entity_id, count(*) AS n FROM source_links WHERE entity_type='person' AND entity_id IN ({$in}) GROUP BY entity_id") as $r) { $out[(int) $r['entity_id']]['sources'] = (int) $r['n']; }
        foreach ($pdo->query("SELECT ll.entity_id, group_concat(l.name, ', ') AS names FROM label_links ll JOIN labels l ON l.id=ll.label_id WHERE ll.entity_type='person' AND ll.entity_id IN ({$in}) GROUP BY ll.entity_id") as $r) { $out[(int) $r['entity_id']]['labels'] = (string) $r['names']; }
    }
    return $out;
}

/** Liste aux lignes écrites à la main : dans l'ordre où elles ont été ajoutées ; les personnes choisies sont reliées à leur fiche. */
function my_list_free_rows(PDO $pdo, array $list, array $def): array
{
    $s = $pdo->prepare("SELECT row_key, data_json FROM custom_list_rows WHERE list_id=? AND row_key LIKE 'f:%' AND included>=0 ORDER BY CAST(substr(row_key,3) AS INTEGER)");
    $s->execute([(int) $list['id']]);
    $rows = [];
    $personCols = array_column(array_filter($def['custom'], static fn($c) => $c['type'] === 'person'), 'key');
    $ids = [];
    foreach ($s->fetchAll() as $r) {
        $values = json_decode((string) $r['data_json'], true) ?: [];
        foreach ($personCols as $k) { if (!empty($values[$k])) { $ids[] = (int) $values[$k]; } }
        $rows[] = ['key' => $r['row_key'], 'values' => $values, 'manual' => true, 'people' => [], 'cells' => []];
    }
    $people = collection_people($pdo, $ids);
    foreach ($rows as &$r) {
        foreach ($personCols as $k) { $id = (int) ($r['values'][$k] ?? 0); $r['linked'][$k] = $id && isset($people[$id]) ? $people[$id] : null; }
    }
    unset($r);
    $list['definition'] = $def; unset($list['definition_json']);
    $list['labels'] = collection_labels($pdo, 'custom_list', [(int) $list['id']])[(int) $list['id']] ?? [];
    return ['list' => $list, 'rows' => $rows, 'columns' => [], 'truncated' => false];
}


/**
 * Partage d'une liste : un fichier que n'importe quel utilisateur de LCNDA importe (Maintenance → Mes listes).
 * Les types d'événements et les étiquettes y sont désignés par leur nom (leurs numéros changent d'une base à l'autre) ;
 * pour une liste écrite à la main, les lignes partent avec, sans les liens vers les fiches (propres à chaque base).
 */
function export_my_list(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT * FROM custom_lists WHERE id=?'); $s->execute([$id]);
    $list = $s->fetch();
    if (!$list) { throw new RuntimeException('Liste introuvable.'); }
    $def = my_list_clean_definition(json_decode((string) $list['definition_json'], true) ?: [], (string) $list['source']);
    $types = []; foreach ($pdo->query('SELECT id, label, gedcom_tag FROM event_types') as $t) { $types[(int) $t['id']] = ['tag' => (string) $t['gedcom_tag'], 'label' => (string) $t['label']]; }
    $labels = []; foreach ($pdo->query('SELECT id, name, color FROM labels') as $l) { $labels[(int) $l['id']] = ['name' => (string) $l['name'], 'color' => (string) $l['color']]; }
    foreach ($def['rules'] as &$r) {
        if ($r['field'] === 'event_type') { $r['values'] = array_values(array_filter(array_map(static fn($v) => $types[$v] ?? null, $r['values']))); }
        if ($r['field'] === 'label') { $r['values'] = array_values(array_filter(array_map(static fn($v) => $labels[$v] ?? null, $r['values']))); }
    }
    unset($r);
    $rows = [];
    if ($list['source'] === 'free') {
        $personKeys = array_column(array_filter($def['custom'], static fn($c) => $c['type'] === 'person'), 'key');
        $q = $pdo->prepare("SELECT data_json FROM custom_list_rows WHERE list_id=? AND row_key LIKE 'f:%' ORDER BY CAST(substr(row_key,3) AS INTEGER)"); $q->execute([$id]);
        foreach ($q->fetchAll(PDO::FETCH_COLUMN) as $json) { $rows[] = array_diff_key(json_decode((string) $json, true) ?: [], array_flip($personKeys)); }
    }
    if ($list['source'] === 'records') { // fiches partagées sans les liens vers les personnes ni les photos (propres à chaque base)
        $q = $pdo->prepare('SELECT data_json, status FROM custom_list_records WHERE list_id=? ORDER BY position, id'); $q->execute([$id]);
        $drop = array_column(array_filter($def['fields'], static fn($f) => in_array($f['type'], ['person', 'people', 'media'], true)), 'key');
        foreach ($q->fetchAll() as $r) {
            $data = array_diff_key(json_decode((string) $r['data_json'], true) ?: [], array_flip($drop));
            foreach ($def['fields'] as $f) { if ($f['type'] === 'steps' && is_array($data[$f['key']] ?? null)) { $pk = array_column(array_filter($f['fields'], static fn($x) => $x['type'] === 'person'), 'key'); $data[$f['key']] = array_map(static fn($it) => array_diff_key($it, array_flip($pk)), $data[$f['key']]); } }
            $rows[] = ['data' => $data, 'status' => $r['status']];
        }
    }
    return ['type' => 'lcnda-liste', 'version' => 1, 'name' => $list['name'], 'icon' => $list['icon'], 'description' => $list['description'], 'source' => $list['source'], 'definition' => $def, 'rows' => $rows];
}

function import_my_list(PDO $pdo, array $data): array
{
    $pkg = json_decode((string) ($data['json'] ?? ''), true);
    if (!is_array($pkg) || ($pkg['type'] ?? '') !== 'lcnda-liste' || !is_array($pkg['definition'] ?? null)) { throw new RuntimeException('Ce fichier n’est pas une liste LCNDA.'); }
    $def = $pkg['definition'];
    $typeByTag = []; $typeByLabel = [];
    foreach ($pdo->query('SELECT id, label, gedcom_tag FROM event_types') as $t) { if ($t['gedcom_tag'] !== '' && $t['gedcom_tag'] !== null) { $typeByTag[(string) $t['gedcom_tag']] ??= (int) $t['id']; } $typeByLabel[mb_strtolower((string) $t['label'])] = (int) $t['id']; }
    $missing = [];
    foreach (is_array($def['rules'] ?? null) ? $def['rules'] : [] as $i => $r) {
        if (!is_array($r)) { continue; }
        $ids = [];
        foreach (is_array($r['values'] ?? null) ? $r['values'] : [] as $v) {
            if (!is_array($v)) { continue; }
            if (($r['field'] ?? '') === 'event_type') {
                $id = $typeByLabel[mb_strtolower((string) ($v['label'] ?? ''))] ?? ($typeByTag[(string) ($v['tag'] ?? '')] ?? 0);
                if ($id) { $ids[] = $id; } else { $missing[] = 'type d’événement « ' . ($v['label'] ?? '?') . ' »'; }
            }
            if (($r['field'] ?? '') === 'label') { // étiquette absente : elle est créée
                $name = mb_substr(safe_text($v['name'] ?? ''), 0, 80);
                if ($name === '') { continue; }
                $q = $pdo->prepare('SELECT id FROM labels WHERE name=? COLLATE NOCASE'); $q->execute([$name]);
                $id = (int) $q->fetchColumn();
                if (!$id) { $pdo->prepare('INSERT INTO labels(name, color) VALUES(?,?)')->execute([$name, preg_match('/^#[0-9a-f]{6}$/i', (string) ($v['color'] ?? '')) ? $v['color'] : '#0066cc']); $id = (int) $pdo->lastInsertId(); }
                $ids[] = $id;
            }
        }
        // Un critère dont aucun choix n'existe ici serait ignoré et la liste montrerait tout : on refuse plutôt
        if (!$ids && ($r['field'] ?? '') === 'event_type' && !empty($r['values'])) {
            throw new RuntimeException('Cette liste utilise ' . implode(', ', array_unique($missing)) . ', absent de ta base. Crée-le d’abord (Maintenance → Types d’événements), puis importe la liste de nouveau.');
        }
        $def['rules'][$i]['values'] = $ids;
    }
    $def['in_lists'] = false; // une liste reçue ne s'ajoute pas d'elle-même au menu des Listes
    $saved = save_my_list($pdo, ['name' => (string) ($pkg['name'] ?? 'Liste importée'), 'icon' => (string) ($pkg['icon'] ?? '📋'), 'description' => (string) ($pkg['description'] ?? ''), 'source' => (string) ($pkg['source'] ?? 'persons'), 'definition' => $def]);
    $count = 0;
    if (($pkg['source'] ?? '') === 'free') {
        $s = $pdo->prepare('SELECT definition_json FROM custom_lists WHERE id=?'); $s->execute([$saved['id']]);
        $keys = array_column(json_decode((string) $s->fetchColumn(), true)['custom'] ?? [], 'key');
        $ins = $pdo->prepare('INSERT INTO custom_list_rows(list_id, row_key, included, data_json) VALUES(?,?,1,?)');
        foreach (array_slice(is_array($pkg['rows'] ?? null) ? $pkg['rows'] : [], 0, 5000) as $row) {
            if (!is_array($row)) { continue; }
            $values = [];
            foreach ($keys as $k) { if (isset($row[$k]) && is_scalar($row[$k])) { $values[$k] = mb_substr(safe_text((string) $row[$k]), 0, 2000); } }
            $ins->execute([$saved['id'], 'f:' . (++$count), json_encode($values, JSON_UNESCAPED_UNICODE)]);
        }
    }
    if (($pkg['source'] ?? '') === 'records') {
        foreach (array_slice(is_array($pkg['rows'] ?? null) ? $pkg['rows'] : [], 0, 5000) as $row) {
            if (!is_array($row) || !is_array($row['data'] ?? null)) { continue; }
            save_my_list_record($pdo, ['list_id' => $saved['id'], 'data' => $row['data'], 'status' => $row['status'] ?? 'todo', 'no_geocode' => 1]); $count++;
        }
    }
    return ['id' => $saved['id'], 'rows' => $count, 'missing' => array_values(array_unique($missing))];
}

/** Une liste reprise de l'onglet Listes (lieux, médias, métiers…) : toutes ses lignes, avec mes colonnes à remplir. */
function my_list_table_rows(PDO $pdo, array $list, array $def): array
{
    $src = LIST_TABLE_SOURCES[$list['source']];
    $raw = $pdo->query($src['sql'] . ' LIMIT 5000')->fetchAll();
    $manual = [];
    $ms = $pdo->prepare("SELECT row_key, included, data_json FROM custom_list_rows WHERE list_id=? AND row_key LIKE 't:%'"); $ms->execute([(int) $list['id']]);
    foreach ($ms->fetchAll() as $m) { $manual[$m['row_key']] = ['included' => (int) $m['included'], 'values' => json_decode((string) $m['data_json'], true) ?: []]; }
    $people = collection_people($pdo, array_filter(array_map(static fn($r) => (int) ($r['person_id'] ?? 0), $raw)));
    $out = [];
    foreach ($raw as $r) {
        if ($list['source'] === 'occupations') { $r['id'] = crc32((string) $r['group_key']); } // un métier n'a pas de numéro : on en tire un de son nom (le même regroupement que la requête)
        $key = 't:' . (int) $r['id'];
        if (($manual[$key]['included'] ?? 0) === -1) { continue; }
        $cells = [];
        foreach (array_keys($src['columns']) as $c) { $cells[$c] = $c === 'person' ? '' : (string) ($r[$c] ?? ''); }
        $p = $people[(int) ($r['person_id'] ?? 0)] ?? null;
        if (array_key_exists('person', $cells)) { $cells['person'] = $p ? trim(($p['first_name'] ?? '') . ' ' . ($p['last_name'] ?? '')) : (string) ($r['holder_text'] ?? ''); }
        $row = ['key' => $key, 'values' => $manual[$key]['values'] ?? [], 'manual' => false, 'people' => $p ? [$p] : [], 'cells' => $cells];
        // un média : de quoi l'ouvrir dans la visionneuse (widgets, listes)
        if ($list['source'] === 'media') { $row['media'] = ['id' => (int) $r['id'], 'title' => (string) $r['title'], 'filename' => (string) $r['filename'], 'thumbnail' => (string) ($r['thumbnail'] ?? ''), 'media_type' => (string) $r['kind']]; }
        $out[] = $row;
    }
    my_list_link_people($pdo, $out, $def);
    $list['definition'] = $def; unset($list['definition_json']);
    $list['labels'] = collection_labels($pdo, 'custom_list', [(int) $list['id']])[(int) $list['id']] ?? [];
    return ['list' => $list, 'rows' => $out, 'columns' => $src['columns'], 'truncated' => count($raw) >= 5000];
}

/** Colonnes à soi de sorte « personne de la base » : la fiche choisie, pour l'afficher (lien), la filtrer et l'exporter. */
function my_list_link_people(PDO $pdo, array &$rows, array $def): void
{
    $cols = array_column(array_filter($def['custom'] ?? [], static fn($c) => $c['type'] === 'person'), 'key');
    if (!$cols) { return; }
    $ids = [];
    foreach ($rows as $r) { foreach ($cols as $k) { if (!empty($r['values'][$k])) { $ids[] = (int) $r['values'][$k]; } } }
    $people = collection_people($pdo, $ids);
    foreach ($rows as &$r) { foreach ($cols as $k) { $id = (int) ($r['values'][$k] ?? 0); $r['linked'][$k] = $id && isset($people[$id]) ? $people[$id] : null; } }
    unset($r);
}

/** Enregistre les filtres de colonnes d'une liste (choisis depuis la liste elle-même). */
function save_my_list_filters(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $s = $pdo->prepare('SELECT source, definition_json FROM custom_lists WHERE id=?'); $s->execute([$id]);
    $l = $s->fetch();
    if (!$l) { throw new RuntimeException('Liste introuvable.'); }
    $def = json_decode((string) $l['definition_json'], true) ?: [];
    $def['filters'] = is_array($data['filters'] ?? null) ? $data['filters'] : [];
    $def = my_list_clean_definition($def, (string) $l['source']);
    $pdo->prepare('UPDATE custom_lists SET definition_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([json_encode($def, JSON_UNESCAPED_UNICODE), $id]);
    return ['filters' => $def['filters']];
}

/* ─── 📇 Listes de fiches (Éditeur de listes) : un formulaire à soi, des fiches, des étapes, « à faire / fait » ─── */

const LIST_RECORD_FIELD_TYPES = ['text', 'longtext', 'date', 'time', 'number', 'select', 'checkbox', 'url', 'person', 'people', 'place', 'media', 'steps', 'heading'];
const LIST_STEP_FIELD_TYPES = ['text', 'longtext', 'date', 'time', 'number', 'select', 'checkbox', 'url', 'place', 'person'];

function my_list_record_fields(array $fields, bool $sub = false): array
{
    $out = []; $seen = [];
    foreach (array_slice($fields, 0, $sub ? 25 : 80) as $f) {
        if (!is_array($f)) { continue; }
        $type = (string) ($f['type'] ?? '');
        if (!in_array($type, $sub ? LIST_STEP_FIELD_TYPES : LIST_RECORD_FIELD_TYPES, true)) { continue; }
        $key = preg_replace('/[^a-z0-9_]/', '', strtolower((string) ($f['key'] ?? ''))) ?: 'f' . bin2hex(random_bytes(3));
        while (isset($seen[$key]) || in_array($key, ['done', 'id', 'status'], true)) { $key .= bin2hex(random_bytes(1)); }
        $seen[$key] = true;
        $c = ['key' => $key, 'type' => $type, 'label' => mb_substr(safe_text($f['label'] ?? ''), 0, 80) ?: ($type === 'heading' ? 'Section' : 'Champ'),
            'help' => mb_substr(safe_text($f['help'] ?? ''), 0, 300), 'placeholder' => mb_substr(safe_text($f['placeholder'] ?? ''), 0, 120),
            'width' => ($f['width'] ?? '') === 'half' ? 'half' : 'full', 'required' => !empty($f['required'])];
        if ($type === 'select') { $c['options'] = array_values(array_slice(array_filter(array_map(static fn($o) => mb_substr(safe_text($o), 0, 80), is_array($f['options'] ?? null) ? $f['options'] : []), static fn($o) => $o !== ''), 0, 60)); }
        if ($type === 'media') { $c['accept'] = in_array($f['accept'] ?? '', ['image', 'video', 'audio', 'all'], true) ? $f['accept'] : 'all'; }
        if ($type === 'steps') {
            $c['fields'] = my_list_record_fields(is_array($f['fields'] ?? null) ? $f['fields'] : [], true) ?: [['key' => 'titre', 'type' => 'text', 'label' => 'Titre', 'help' => '', 'placeholder' => '', 'width' => 'full', 'required' => false]];
            $c['item'] = mb_substr(safe_text($f['item'] ?? ''), 0, 40) ?: 'Étape';
            $c['checkable'] = !array_key_exists('checkable', $f) || !empty($f['checkable']);
        }
        $out[] = $c;
    }
    return $out;
}

function my_list_records_definition(array $d): array
{
    $fields = my_list_record_fields(is_array($d['fields'] ?? null) ? $d['fields'] : []);
    $keys = array_column(array_filter($fields, static fn($f) => !in_array($f['type'], ['heading', 'steps', 'media'], true)), 'key');
    $r = is_array($d['record'] ?? null) ? $d['record'] : [];
    $txt = static fn($k, $def, $max = 60) => mb_substr(safe_text($r[$k] ?? ''), 0, $max) ?: $def;
    $title = in_array($r['title'] ?? '', $keys, true) ? (string) $r['title'] : ($keys[0] ?? '');
    return ['fields' => $fields, 'record' => [
            'status' => !array_key_exists('status', $r) || !empty($r['status']), 'todo' => $txt('todo', 'À faire'), 'done' => $txt('done', 'Faits'), 'mark' => $txt('mark', 'Marquer fait'),
            'item' => $txt('item', 'fiche', 40), 'new' => $txt('new', '+ Nouvelle fiche'), 'form' => $txt('form', 'Nouvelle fiche'), 'title' => $title,
            'meta' => array_values(array_slice(array_intersect(is_array($r['meta'] ?? null) ? $r['meta'] : [], $keys), 0, 6)),
            'sort' => in_array($r['sort'] ?? '', ['manual', 'title', 'created', 'date'], true) ? $r['sort'] : 'created',
            'map' => !empty($r['map'])],
        'columns' => [], 'custom' => [], 'filters' => [], 'rules' => [], 'match' => 'all', 'sort' => 'name', 'in_lists' => !empty($d['in_lists']),
        'display' => my_list_clean_display(is_array($d['display'] ?? null) ? $d['display'] : [], $keys)];
}

function my_list_record_list(PDO $pdo, int $listId): array
{
    $s = $pdo->prepare("SELECT * FROM custom_lists WHERE id=? AND source='records'"); $s->execute([$listId]);
    $list = $s->fetch();
    if (!$list) { throw new RuntimeException('Liste introuvable.'); }
    $list['definition'] = my_list_records_definition(json_decode((string) $list['definition_json'], true) ?: []);
    return $list;
}

function my_list_record_count(PDO $pdo, int $listId): int
{
    $s = $pdo->prepare('SELECT count(*) FROM custom_list_records WHERE list_id=?'); $s->execute([$listId]);
    return (int) $s->fetchColumn();
}

/** Les personnes qui existent dans la base, dans l'ordre donné. */
function my_list_existing_people(PDO $pdo, array $ids): array
{
    if (!$ids) { return []; }
    $s = $pdo->prepare('SELECT id FROM persons WHERE id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')'); $s->execute($ids);
    $ok = array_flip(array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN)));
    return array_values(array_filter($ids, static fn($i) => isset($ok[$i])));
}

/** Une valeur d'un champ, nettoyée selon sa sorte. */
function my_list_record_value(PDO $pdo, array $f, mixed $v, bool $geocode)
{
    switch ($f['type']) {
        case 'checkbox': return !empty($v) && $v !== '0' ? 1 : 0;
        case 'number': $t = str_replace([',', ' ', "\u{202f}"], ['.', '', ''], (string) ($v ?? '')); return is_numeric($t) ? $t + 0 : '';
        case 'person': $id = safe_int(is_scalar($v) ? $v : 0); return $id && my_list_existing_people($pdo, [$id]) ? $id : '';
        case 'people': return my_list_existing_people($pdo, array_values(array_unique(array_filter(array_map('intval', array_slice(is_array($v) ? $v : [], 0, 100))))));
        case 'url': $u = safe_text(is_scalar($v) ? (string) $v : ''); return preg_match('#^https?://#i', $u) ? $u : '';
        case 'longtext': return mb_substr(is_scalar($v) ? (string) $v : '', 0, 40000);
        case 'select': $t = safe_text(is_scalar($v) ? (string) $v : ''); return in_array($t, $f['options'] ?? [], true) ? $t : '';
        case 'place':
            $p = is_array($v) ? ['text' => mb_substr(safe_text($v['text'] ?? ''), 0, 300), 'lat' => h_coord($v['lat'] ?? null, 90), 'lon' => h_coord($v['lon'] ?? null, 180)] : ['text' => mb_substr(safe_text(is_scalar($v) ? (string) $v : ''), 0, 300), 'lat' => null, 'lon' => null];
            if ($p['lat'] === null || $p['lon'] === null) { $p['lat'] = $p['lon'] = null; if ($geocode && $p['text'] !== '' && ($g = heritage_geocode($pdo, $p['text']))) { $p['lat'] = $g['lat']; $p['lon'] = $g['lon']; } }
            return $p;
        default: return mb_substr(safe_text(is_scalar($v) ? (string) $v : ''), 0, 2000);
    }
}

function my_list_record_clean(PDO $pdo, array $fields, array $in, bool $geocode): array
{
    $out = [];
    foreach ($fields as $f) {
        if (in_array($f['type'], ['heading', 'media'], true)) { continue; }
        if ($f['type'] === 'steps') {
            $items = [];
            foreach (array_slice(is_array($in[$f['key']] ?? null) ? $in[$f['key']] : [], 0, 500) as $it) {
                if (!is_array($it)) { continue; }
                $c = ['done' => !empty($it['done']) ? 1 : 0];
                foreach ($f['fields'] as $sf) { $c[$sf['key']] = my_list_record_value($pdo, $sf, $it[$sf['key']] ?? null, $geocode); }
                $empty = !array_filter($f['fields'], static fn($sf) => !in_array($c[$sf['key']], ['', 0, [], null], true) && !($sf['type'] === 'place' && $c[$sf['key']]['text'] === ''));
                if (!$empty || $c['done']) { $items[] = $c; }
            }
            $out[$f['key']] = $items;
            continue;
        }
        $out[$f['key']] = my_list_record_value($pdo, $f, $in[$f['key']] ?? null, $geocode);
        $v = $out[$f['key']];
        if ($f['required'] && ($v === '' || $v === [] || ($f['type'] === 'place' && $v['text'] === ''))) { throw new RuntimeException('Le champ « ' . $f['label'] . ' » est à remplir.'); }
    }
    return $out;
}

/** Enregistre une fiche (création ou modification). */
function save_my_list_record(PDO $pdo, array $data): array
{
    $list = my_list_record_list($pdo, safe_int($data['list_id'] ?? 0));
    $id = safe_int($data['id'] ?? 0);
    $clean = my_list_record_clean($pdo, $list['definition']['fields'], is_array($data['data'] ?? null) ? $data['data'] : [], empty($data['no_geocode']));
    $json = json_encode($clean, JSON_UNESCAPED_UNICODE);
    $status = ($data['status'] ?? '') === 'done' ? 'done' : 'todo';
    if ($id) {
        $own = $pdo->prepare('SELECT status FROM custom_list_records WHERE id=? AND list_id=?'); $own->execute([$id, (int) $list['id']]);
        $was = $own->fetchColumn();
        if ($was === false) { throw new RuntimeException('Cette fiche n’est pas dans cette liste.'); }
        if (!isset($data['status'])) { $status = (string) $was; }
        $pdo->prepare("UPDATE custom_list_records SET data_json=?, status=?, done_at=CASE WHEN ?='done' THEN COALESCE(done_at, CURRENT_TIMESTAMP) ELSE NULL END, updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([$json, $status, $status, $id]);
    } else {
        $pdo->prepare("INSERT INTO custom_list_records(list_id, data_json, status, done_at, position) VALUES(?,?,?,CASE WHEN ?='done' THEN CURRENT_TIMESTAMP END,(SELECT COALESCE(max(position),0)+1 FROM custom_list_records WHERE list_id=?))")->execute([(int) $list['id'], $json, $status, $status, (int) $list['id']]);
        $id = (int) $pdo->lastInsertId();
    }
    return ['id' => $id];
}

function my_list_record_owned(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT * FROM custom_list_records WHERE id=?'); $s->execute([$id]);
    $r = $s->fetch();
    if (!$r) { throw new RuntimeException('Fiche introuvable.'); }
    return $r;
}

function set_my_list_record_status(PDO $pdo, array $data): array
{
    $r = my_list_record_owned($pdo, safe_int($data['id'] ?? 0));
    $status = ($data['status'] ?? '') === 'done' ? 'done' : 'todo';
    $pdo->prepare("UPDATE custom_list_records SET status=?, done_at=CASE WHEN ?='done' THEN CURRENT_TIMESTAMP ELSE NULL END, updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([$status, $status, (int) $r['id']]);
    return ['status' => $status];
}

/** Cocher / décocher une ligne d'étapes depuis la liste ou la fiche, sans rouvrir le formulaire. */
function set_my_list_record_step(PDO $pdo, array $data): array
{
    $r = my_list_record_owned($pdo, safe_int($data['id'] ?? 0));
    $values = json_decode((string) $r['data_json'], true) ?: [];
    $field = preg_replace('/[^a-z0-9_]/', '', strtolower((string) ($data['field'] ?? '')));
    $i = safe_int($data['index'] ?? -1, -1);
    if (!isset($values[$field][$i]) || !is_array($values[$field][$i])) { throw new RuntimeException('Ligne introuvable.'); }
    $values[$field][$i]['done'] = !empty($data['done']) ? 1 : 0;
    $pdo->prepare('UPDATE custom_list_records SET data_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([json_encode($values, JSON_UNESCAPED_UNICODE), (int) $r['id']]);
    return ['ok' => true];
}

function move_my_list_record(PDO $pdo, array $data): array
{
    $r = my_list_record_owned($pdo, safe_int($data['id'] ?? 0));
    $ids = array_map('intval', $pdo->query('SELECT id FROM custom_list_records WHERE list_id=' . (int) $r['list_id'] . ' ORDER BY position, id')->fetchAll(PDO::FETCH_COLUMN));
    $i = array_search((int) $r['id'], $ids, true); $j = $i + ((int) ($data['direction'] ?? 0) < 0 ? -1 : 1);
    if ($i !== false && $j >= 0 && $j < count($ids)) { [$ids[$i], $ids[$j]] = [$ids[$j], $ids[$i]]; }
    $upd = $pdo->prepare('UPDATE custom_list_records SET position=? WHERE id=?');
    foreach ($ids as $p => $rid) { $upd->execute([$p, $rid]); }
    return ['ok' => true];
}

function my_list_record_unlink(PDO $pdo, int $id): void
{
    heritage_delete_media_links($pdo, 'custom_list_record', $id);
    $pdo->prepare("DELETE FROM label_links WHERE entity_type='custom_list_record' AND entity_id=?")->execute([$id]);
}

function delete_my_list_record(PDO $pdo, array $data): array
{
    $r = my_list_record_owned($pdo, safe_int($data['id'] ?? 0));
    my_list_record_unlink($pdo, (int) $r['id']);
    $pdo->prepare('DELETE FROM custom_list_records WHERE id=?')->execute([(int) $r['id']]);
    return ['ok' => true];
}

/** Texte d'une valeur (colonnes, recherche, export). */
function my_list_record_text(array $f, mixed $v, array $people): string
{
    return match ($f['type']) {
        'checkbox' => $v ? 'oui' : 'non',
        'person' => $v && isset($people[(int) $v]) ? trim($people[(int) $v]['first_name'] . ' ' . $people[(int) $v]['last_name']) : '',
        'people' => implode(', ', array_map(static fn($i) => isset($people[$i]) ? trim($people[$i]['first_name'] . ' ' . $people[$i]['last_name']) : '', is_array($v) ? $v : [])),
        'place' => is_array($v) ? (string) ($v['text'] ?? '') : '',
        'steps' => is_array($v) ? count($v) . '' : '',
        default => is_scalar($v) ? (string) $v : '',
    };
}

/** Les fiches d'une liste, avec personnes, photos, étiquettes et avancement des étapes. */
function my_list_record_rows(PDO $pdo, array $list, array $def): array
{
    $s = $pdo->prepare('SELECT * FROM custom_list_records WHERE list_id=? ORDER BY position, id'); $s->execute([(int) $list['id']]);
    $recs = $s->fetchAll();
    $ids = array_map(static fn($r) => (int) $r['id'], $recs);
    $media = heritage_media($pdo, 'custom_list_record', $ids);
    $labels = $ids ? collection_labels($pdo, 'custom_list_record', $ids) : [];
    $pids = [];
    foreach ($recs as &$r) {
        $r['data'] = json_decode((string) $r['data_json'], true) ?: []; unset($r['data_json']);
        foreach ($def['fields'] as $f) {
            if ($f['type'] === 'person' && !empty($r['data'][$f['key']])) { $pids[] = (int) $r['data'][$f['key']]; }
            if ($f['type'] === 'people') { array_push($pids, ...array_map('intval', (array) ($r['data'][$f['key']] ?? []))); }
            if ($f['type'] === 'steps') { foreach ((array) ($r['data'][$f['key']] ?? []) as $it) { foreach ($f['fields'] as $sf) { if ($sf['type'] === 'person' && !empty($it[$sf['key']])) { $pids[] = (int) $it[$sf['key']]; } } } }
        }
    }
    unset($r);
    $people = collection_people($pdo, $pids);
    $cols = [];
    foreach ($def['fields'] as $f) { if (!in_array($f['type'], ['heading', 'media'], true)) { $cols[$f['key']] = $f['label']; } }
    $rows = [];
    foreach ($recs as $r) {
        $steps = 0; $stepsDone = 0; $cells = [];
        foreach ($def['fields'] as $f) {
            if ($f['type'] === 'steps') { $items = (array) ($r['data'][$f['key']] ?? []); if ($f['checkable']) { $steps += count($items); $stepsDone += count(array_filter($items, static fn($x) => !empty($x['done']))); } }
            if (isset($cols[$f['key']])) { $cells[$f['key']] = my_list_record_text($f, $r['data'][$f['key']] ?? null, $people); }
        }
        $cells['status'] = $r['status'] === 'done' ? $def['record']['done'] : $def['record']['todo'];
        $rows[] = ['key' => 'r:' . $r['id'], 'id' => (int) $r['id'], 'data' => $r['data'], 'status' => $r['status'], 'done_at' => $r['done_at'], 'created_at' => $r['created_at'], 'updated_at' => $r['updated_at'],
            'steps' => $steps, 'steps_done' => $stepsDone, 'media' => $media[(int) $r['id']] ?? [], 'labels' => $labels[(int) $r['id']] ?? [], 'cells' => $cells, 'values' => [], 'people' => []];
    }
    $list['definition'] = $def; unset($list['definition_json']);
    $list['labels'] = collection_labels($pdo, 'custom_list', [(int) $list['id']])[(int) $list['id']] ?? [];
    $counts = ['todo' => count(array_filter($rows, static fn($r) => $r['status'] !== 'done')), 'done' => count(array_filter($rows, static fn($r) => $r['status'] === 'done'))];
    return ['list' => $list, 'rows' => $rows, 'columns' => $cols + ['status' => 'Suivi'], 'people' => (object) $people, 'counts' => $counts, 'truncated' => false];
}
