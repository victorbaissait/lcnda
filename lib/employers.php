<?php
declare(strict_types=1);

/**
 * 🏢 Fiche d'un employeur (Listes → Employeurs), à la façon d'une fiche d'entreprise : identité (raison sociale, forme,
 * SIREN, activité, capital, effectif, siège), dirigeants, établissements, chronologie, notes et sources, et les
 * personnes de la famille qui y ont travaillé (recensements et blocs « Métiers » des fiches).
 * Un employeur est reconnu par son nom (sans tenir compte des majuscules ni des espaces) : « Usine Renault »
 * saisi dans un recensement et dans une fiche donne la même fiche.
 */

const EMPLOYER_TEXT_FIELDS = ['legal_name', 'aliases', 'legal_form', 'siren', 'siret', 'naf', 'activity', 'status', 'founded', 'closed',
    'capital', 'workforce', 'address', 'city', 'postcode', 'country', 'phone', 'email', 'website', 'logo_url', 'notes', 'sources'];
const EMPLOYER_LIST_FIELDS = ['directors' => ['name', 'role', 'from', 'to', 'person_id'], 'establishments' => ['name', 'address', 'city', 'from', 'to', 'kind'],
    'history' => ['date', 'text'], 'products' => ['text']];

function employer_key(string $name): string
{
    return mb_strtolower(preg_replace('/\s+/u', ' ', trim($name)) ?? '');
}

/** Les mentions d'employeur dans les blocs à soi des fiches (un champ dont le nom commence par « Employeur ») */
function employer_block_mentions(PDO $pdo): array
{
    $out = [];
    try { $defs = $pdo->query('SELECT id, fields_json FROM custom_block_defs')->fetchAll(); } catch (Throwable) { return []; }
    foreach ($defs as $def) {
        $fields = json_decode((string) $def['fields_json'], true) ?: [];
        $emp = null; $occ = null; $from = null; $to = null; $place = null;
        foreach ($fields as $f) {
            $label = mb_strtolower(trim((string) ($f['label'] ?? '')));
            $key = (string) ($f['key'] ?? '');
            if ($key === '') { continue; }
            if ($emp === null && (str_starts_with($label, 'employeur') || str_starts_with($label, 'entreprise'))) { $emp = $key; }
            elseif ($occ === null && (str_starts_with($label, 'métier') || str_starts_with($label, 'profession') || str_starts_with($label, 'poste'))) { $occ = $key; }
            elseif ($from === null && $label === 'de') { $from = $key; }
            elseif ($to === null && $label === 'à') { $to = $key; }
            elseif ($place === null && $label === 'lieu') { $place = $key; }
        }
        if ($emp === null) { continue; }
        $s = $pdo->prepare('SELECT person_id, data_json FROM custom_block_entries WHERE block_id=?');
        $s->execute([(int) $def['id']]);
        foreach ($s->fetchAll() as $e) {
            $d = json_decode((string) $e['data_json'], true) ?: [];
            $name = trim((string) (is_scalar($d[$emp] ?? null) ? $d[$emp] : ''));
            if ($name === '') { continue; }
            $val = static fn(?string $k) => $k !== null && is_scalar($d[$k] ?? null) ? trim((string) $d[$k]) : (is_array($d[$k ?? ''] ?? null) ? trim((string) ($d[$k]['name'] ?? $d[$k]['text'] ?? '')) : '');
            $out[employer_key($name)][] = ['name' => $name, 'person_id' => (int) $e['person_id'], 'occupation' => $val($occ), 'from' => $val($from), 'to' => $val($to), 'place' => $val($place)];
        }
    }
    return $out;
}

/** Liste « Employeurs » : recensements + blocs des fiches + fiches d'employeur créées à la main */
function employer_list_all(PDO $pdo, string $like, int $limit = 500, int $offset = 0): array
{
    $needle = mb_strtolower(trim($like, '%'));
    $rows = [];
    $add = static function (string $name, int $n) use (&$rows, $needle) {
        $k = employer_key($name); if ($k === '' || ($needle !== '' && !str_contains($k, $needle))) { return; }
        $rows[$k] ??= ['id' => $k, 'name' => preg_replace('/\s+/u', ' ', trim($name)), 'person_count' => 0, 'has_record' => 0];
        $rows[$k]['person_count'] += $n;
    };
    foreach ($pdo->query("SELECT TRIM(employer) AS name, COUNT(*) AS n FROM census_members WHERE TRIM(COALESCE(employer,''))<>'' GROUP BY LOWER(TRIM(employer))") as $r) { $add((string) $r['name'], (int) $r['n']); }
    foreach (employer_block_mentions($pdo) as $list) { $ids = array_unique(array_column($list, 'person_id')); $add($list[0]['name'], count($ids)); }
    try {
        foreach ($pdo->query('SELECT key, name FROM employer_records') as $r) { $add((string) $r['name'], 0); if (isset($rows[$r['key']])) { $rows[$r['key']]['has_record'] = 1; $rows[$r['key']]['name'] = (string) $r['name']; } // le nom de la fiche l'emporte }
    } catch (Throwable) {}
    uasort($rows, static fn($a, $b) => strcoll(mb_strtolower($a['name']), mb_strtolower($b['name'])));
    return array_slice(array_values($rows), $offset, $limit);
}

/** Les personnes rattachées à un employeur (pour la liste et la fiche) : recensements et blocs des fiches */
function employer_people(PDO $pdo, string $key, ?array $mentions = null): array
{
    $people = [];
    $s = $pdo->prepare("SELECT cm.person_id, cm.display_name, cm.occupation, cm.age_text, cm.employer, cr.year AS census_year, COALESCE(pl.name,'') AS place,
            p.first_name, p.last_name, p.gender, p.living_status
        FROM census_members cm JOIN census_records cr ON cr.id=cm.census_id LEFT JOIN places pl ON pl.id=cr.place_id LEFT JOIN persons p ON p.id=cm.person_id
        WHERE TRIM(COALESCE(cm.employer,''))<>'' ORDER BY cr.year");
    $s->execute();
    foreach ($s->fetchAll() as $r) {
        if (employer_key((string) $r['employer']) !== $key) { continue; }
        $pid = (int) $r['person_id'];
        $k = $pid ? 'p' . $pid : 'n' . mb_strtolower((string) $r['display_name']);
        $people[$k] ??= ['id' => $pid, 'first_name' => $pid ? (string) $r['first_name'] : (string) $r['display_name'], 'last_name' => $pid ? (string) $r['last_name'] : '',
            'gender' => (string) ($r['gender'] ?? 'unknown'), 'living_status' => (string) ($r['living_status'] ?? 'unknown'), 'mentions' => []];
        $people[$k]['mentions'][] = ['kind' => 'census', 'year' => $r['census_year'] ? (int) $r['census_year'] : null, 'occupation' => (string) $r['occupation'], 'place' => (string) $r['place'], 'age' => (string) $r['age_text']];
    }
    $mentions ??= employer_block_mentions($pdo);
    $ids = array_unique(array_column($mentions[$key] ?? [], 'person_id'));
    $byId = $ids ? collection_people($pdo, $ids) : [];
    foreach ($mentions[$key] ?? [] as $m) {
        $p = $byId[$m['person_id']] ?? null; if (!$p) { continue; }
        $k = 'p' . $m['person_id'];
        $people[$k] ??= ['id' => (int) $p['id'], 'first_name' => (string) $p['first_name'], 'last_name' => (string) $p['last_name'], 'gender' => (string) $p['gender'], 'living_status' => (string) $p['living_status'], 'mentions' => []];
        $people[$k]['mentions'][] = ['kind' => 'block', 'from' => $m['from'], 'to' => $m['to'], 'occupation' => $m['occupation'], 'place' => $m['place']];
    }
    // dates de vie
    $pids = array_filter(array_map(static fn($p) => (int) $p['id'], $people));
    if ($pids) {
        $life = collection_people($pdo, $pids);
        foreach ($people as &$p) { if ($p['id'] && isset($life[$p['id']])) { $p['birth_year'] = $life[$p['id']]['birth_year']; $p['death_year'] = $life[$p['id']]['death_year']; $p['birth_date'] = $life[$p['id']]['birth_date']; $p['death_date'] = $life[$p['id']]['death_date']; } }
        unset($p);
    }
    $list = array_values($people);
    usort($list, static fn($a, $b) => strcoll(mb_strtolower($a['last_name'] . ' ' . $a['first_name']), mb_strtolower($b['last_name'] . ' ' . $b['first_name'])));
    return $list;
}

function employer_record_detail(PDO $pdo, string $name): array
{
    $key = employer_key($name);
    if ($key === '') { throw new RuntimeException('Employeur sans nom.'); }
    $s = $pdo->prepare('SELECT * FROM employer_records WHERE key=?'); $s->execute([$key]);
    $row = $s->fetch() ?: null;
    $data = $row ? (json_decode((string) $row['data_json'], true) ?: []) : [];
    $people = employer_people($pdo, $key);
    // nom affiché : celui de la fiche, sinon la première mention
    $display = $row['name'] ?? '';
    if ($display === '') {
        foreach (employer_list_all($pdo, '%') as $r) { if ($r['id'] === $key) { $display = $r['name']; break; } }
    }
    $years = [];
    foreach ($people as $p) { foreach ($p['mentions'] as $m) { foreach ([$m['year'] ?? null, $m['from'] ?? null, $m['to'] ?? null] as $y) { if (preg_match('/(\d{4})/', (string) $y, $mm)) { $years[] = (int) $mm[1]; } } } }
    return ['key' => $key, 'id' => $row ? (int) $row['id'] : 0, 'name' => $display ?: trim($name), 'data' => $data, 'people' => $people,
        'span' => $years ? [min($years), max($years)] : null, 'updated_at' => $row['updated_at'] ?? null];
}

function save_employer_record(PDO $pdo, array $data): array
{
    $name = preg_replace('/\s+/u', ' ', safe_text($data['name'] ?? '')) ?? '';
    if ($name === '') { throw new RuntimeException('Donne un nom à l’employeur.'); }
    $old = employer_key(safe_text($data['old_name'] ?? '')) ?: employer_key($name);
    $clean = [];
    foreach (EMPLOYER_TEXT_FIELDS as $f) { $clean[$f] = mb_substr(trim((string) ($data[$f] ?? '')), 0, in_array($f, ['notes', 'sources'], true) ? 40000 : 400); }
    if ($clean['website'] !== '' && !preg_match('~^https?://~i', $clean['website'])) { $clean['website'] = 'https://' . $clean['website']; }
    if ($clean['logo_url'] !== '' && !preg_match('~^https?://~i', $clean['logo_url'])) { $clean['logo_url'] = ''; }
    $clean['siren'] = preg_replace('/\D/', '', $clean['siren']) ?? '';
    $clean['siret'] = preg_replace('/\D/', '', $clean['siret']) ?? '';
    foreach (EMPLOYER_LIST_FIELDS as $list => $keys) {
        $clean[$list] = [];
        foreach (array_slice(is_array($data[$list] ?? null) ? $data[$list] : [], 0, 200) as $item) {
            if (!is_array($item)) { continue; }
            $it = [];
            foreach ($keys as $k) { $it[$k] = $k === 'person_id' ? max(0, (int) ($item[$k] ?? 0)) : mb_substr(trim((string) ($item[$k] ?? '')), 0, $k === 'text' ? 4000 : 300); }
            if (implode('', array_map('strval', $it)) !== '' && implode('', array_map('strval', $it)) !== '0') { $clean[$list][] = $it; }
        }
    }
    $key = employer_key($name);
    $own = !$pdo->inTransaction(); // les écritures de l'API sont déjà dans une transaction
    if ($own) { $pdo->beginTransaction(); }
    try {
        if ($old !== $key) { $pdo->prepare('DELETE FROM employer_records WHERE key=?')->execute([$key]); $pdo->prepare('UPDATE employer_records SET key=?, name=? WHERE key=?')->execute([$key, $name, $old]); }
        $pdo->prepare('INSERT INTO employer_records(key, name, data_json, updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET name=excluded.name, data_json=excluded.data_json, updated_at=CURRENT_TIMESTAMP')
            ->execute([$key, $name, json_encode($clean, JSON_UNESCAPED_UNICODE)]);
        // renommer aussi l'employeur dans les recensements, si on le demande
        if ($old !== $key && !empty($data['rename_mentions'])) {
            foreach ($pdo->query("SELECT id, employer FROM census_members WHERE TRIM(COALESCE(employer,''))<>''")->fetchAll() as $m) {
                if (employer_key((string) $m['employer']) === $old) { $pdo->prepare('UPDATE census_members SET employer=? WHERE id=?')->execute([$name, (int) $m['id']]); }
            }
        }
        if ($own) { $pdo->commit(); }
    } catch (Throwable $e) { if ($own) { $pdo->rollBack(); } throw $e; }
    log_change($pdo, 'meta', 0, 'update', 'Fiche employeur enregistrée : ' . $name);
    return ['key' => $key, 'name' => $name];
}

function delete_employer_record(PDO $pdo, array $data): array
{
    $key = employer_key(safe_text($data['name'] ?? ''));
    $pdo->prepare('DELETE FROM employer_records WHERE key=?')->execute([$key]);
    log_change($pdo, 'meta', 0, 'delete', 'Fiche employeur effacée : ' . safe_text($data['name'] ?? ''));
    return ['ok' => true];
}

/**
 * Recherche dans l'Annuaire des entreprises de l'État (recherche-entreprises.api.gouv.fr, libre et sans clé) :
 * pour pré-remplir la fiche d'une entreprise qui existe encore (ou a existé depuis 1973 environ).
 */
function employer_lookup(string $q): array
{
    $q = trim($q);
    if (mb_strlen($q) < 3) { return ['results' => []]; }
    if (!function_exists('curl_init')) { throw new RuntimeException('Recherche impossible : PHP n’a pas l’extension curl.'); }
    $ch = curl_init('https://recherche-entreprises.api.gouv.fr/search?' . http_build_query(['q' => $q, 'per_page' => 10, 'page' => 1]));
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 3, CURLOPT_CONNECTTIMEOUT => 8, CURLOPT_TIMEOUT => 15,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_USERAGENT => 'LCNDA (logiciel de genealogie)', CURLOPT_FAILONERROR => true] + lcnda_curl_tls());
    $body = curl_exec($ch); $err = curl_error($ch);
    if ($body === false) { throw new RuntimeException('Annuaire des entreprises injoignable' . ($err ? ' : ' . $err : '') . '.'); }
    $json = json_decode((string) $body, true) ?: [];
    $forms = ['1000' => 'Entrepreneur individuel', '5499' => 'SARL', '5710' => 'SAS', '5720' => 'SASU', '5599' => 'SA à conseil d’administration', '5699' => 'SA à directoire',
        '6540' => 'Société civile immobilière', '9220' => 'Association déclarée', '5202' => 'Société en nom collectif', '6599' => 'Société civile', '7344' => 'Établissement public local', '7210' => 'Commune'];
    $out = [];
    foreach (array_slice($json['results'] ?? [], 0, 10) as $r) {
        $siege = $r['siege'] ?? [];
        $dirs = [];
        foreach (array_slice($r['dirigeants'] ?? [], 0, 20) as $d) {
            $name = trim(($d['prenoms'] ?? '') . ' ' . ($d['nom'] ?? '')) ?: (string) ($d['denomination'] ?? '');
            if ($name !== '') { $dirs[] = ['name' => $name, 'role' => (string) ($d['qualite'] ?? ''), 'from' => '', 'to' => '', 'person_id' => 0]; }
        }
        $nj = (string) ($r['nature_juridique'] ?? '');
        $out[] = [
            'name' => (string) ($r['nom_raison_sociale'] ?? $r['nom_complet'] ?? ''), 'legal_name' => (string) ($r['nom_complet'] ?? ''),
            'siren' => (string) ($r['siren'] ?? ''), 'siret' => (string) ($siege['siret'] ?? ''), 'naf' => (string) ($r['activite_principale'] ?? ''),
            'legal_form' => $forms[$nj] ?? ($nj !== '' ? 'Catégorie juridique ' . $nj : ''), 'founded' => (string) ($r['date_creation'] ?? ''),
            'closed' => (string) ($r['date_fermeture'] ?? ''), 'status' => ($r['etat_administratif'] ?? '') === 'C' ? 'closed' : 'active',
            'workforce' => ['00' => '0 salarié', '01' => '1 ou 2 salariés', '02' => '3 à 5 salariés', '03' => '6 à 9 salariés', '11' => '10 à 19 salariés', '12' => '20 à 49 salariés', '21' => '50 à 99 salariés',
                '22' => '100 à 199 salariés', '31' => '200 à 249 salariés', '32' => '250 à 499 salariés', '41' => '500 à 999 salariés', '42' => '1 000 à 1 999 salariés', '51' => '2 000 à 4 999 salariés',
                '52' => '5 000 à 9 999 salariés', '53' => '10 000 salariés et plus'][(string) ($r['tranche_effectif_salarie'] ?? '')] ?? '', 'address' => trim((string) ($siege['adresse'] ?? '')),
            'postcode' => (string) ($siege['code_postal'] ?? ''), 'city' => (string) ($siege['libelle_commune'] ?? ''), 'country' => 'France',
            'establishments_count' => (int) ($r['nombre_etablissements'] ?? 0), 'directors' => $dirs,
        ];
    }
    return ['results' => $out];
}
