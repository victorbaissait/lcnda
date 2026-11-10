<?php
declare(strict_types=1);

/**
 * 🧾 Recensements SocFace (FranceArchives) : les listes nominatives des recensements de 1836 à 1936 lues par intelligence
 * artificielle (projet SocFace, ANR 2021-2026), dans la « base de noms – recensements » de FranceArchives.
 *
 * RÈGLES : l'app n'interroge jamais francearchives.gouv.fr (la recherche s'ouvre dans le navigateur de la personne,
 * assets/js/app-socface-core.js) ; elle lit les CSV téléchargés ou le texte copié d'une fiche (lu dans la page par le moteur
 * des tableaux) ; rien n'est relié à une fiche sans confirmation, aucune donnée de la fiche n'est écrasée ; chaque recensement
 * importé a sa source avec la mention « Transcription automatique SocFace… » ; tout reste « À vérifier » jusqu'à ce qu'on
 * coche « Vérifié sur l'image ».
 *
 * Stockage : les tables des Recensements (census_records, census_members) + colonnes origin, origin_url, image_url, cote,
 * page_line, household_key, verified, import_batch (foyer) et origin_data, verified (membre) ; socface_imports pour ↶ Annuler.
 *
 *  GET  socface_context (prénoms, noms, communes, métiers pour repérer les erreurs de lecture), socface_list, socface_person
 *  POST socface_preview (« c'est la même personne ? », écarts), socface_import, socface_undo, socface_verify, socface_fix
 *  + socface_gap_items() pour « Que manque-t-il ? » et socface_controle_alerts() pour le Contrôle de la base.
 */

const SOCFACE_YEARS = [1836, 1841, 1846, 1851, 1856, 1861, 1866, 1872, 1876, 1881, 1886, 1891, 1896, 1901, 1906, 1911, 1921, 1926, 1931, 1936];
const SOCFACE_MENTION = 'Transcription automatique SocFace (FranceArchives) — peut contenir des erreurs : à vérifier sur l’image';

function socface_schema(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    $done = true;
    $add = static function (string $table, array $cols) use ($pdo): void {
        if (!$pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='$table'")->fetchColumn()) { return; }
        $have = array_column($pdo->query("PRAGMA table_info('$table')")->fetchAll(PDO::FETCH_ASSOC), 'name');
        foreach ($cols as $c => $def) { if (!in_array($c, $have, true)) { $pdo->exec("ALTER TABLE $table ADD COLUMN $c $def"); } }
    };
    $add('census_records', ['origin' => "TEXT NOT NULL DEFAULT ''", 'origin_url' => "TEXT NOT NULL DEFAULT ''", 'image_url' => "TEXT NOT NULL DEFAULT ''", 'cote' => "TEXT NOT NULL DEFAULT ''",
        'page_line' => "TEXT NOT NULL DEFAULT ''", 'household_key' => "TEXT NOT NULL DEFAULT ''", 'verified' => 'INTEGER NOT NULL DEFAULT 0', 'import_batch' => "TEXT NOT NULL DEFAULT ''"]);
    $add('census_members', ['origin_data' => "TEXT NOT NULL DEFAULT ''", 'verified' => 'INTEGER NOT NULL DEFAULT 0']);
    $pdo->exec("CREATE TABLE IF NOT EXISTS socface_imports (
        batch TEXT PRIMARY KEY,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        summary TEXT NOT NULL DEFAULT '',
        ids TEXT NOT NULL DEFAULT '{}',
        undone_at TEXT NOT NULL DEFAULT '')");
    if ($pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='census_records'")->fetchColumn()) {
        $pdo->exec('CREATE INDEX IF NOT EXISTS idx_census_records_origin ON census_records(origin, household_key)');
    }
}

function socface_norm(string $s): string
{
    $s = mb_strtolower(trim($s));
    $s = (string) (class_exists('Normalizer') ? preg_replace('/\p{Mn}/u', '', Normalizer::normalize($s, Normalizer::FORM_D)) : strtr($s, ['é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'à' => 'a', 'â' => 'a', 'ô' => 'o', 'î' => 'i', 'ï' => 'i', 'û' => 'u', 'ù' => 'u', 'ç' => 'c']));
    $s = (string) preg_replace('/^(st|ste)\b\.?/u', 'saint', $s);
    return trim((string) preg_replace('/[^a-z0-9]+/', ' ', $s));
}

/** l'année de naissance lue par SocFace (« né en 1922 » ou « 27 ans en 1906 » → 1879) */
function socface_member_born(array $m, int $year): ?int
{
    $by = (int) ($m['birth_year'] ?? 0);
    if ($by >= 1700 && $by <= 2000) { return $by; }
    if (preg_match('/\d{1,3}/', (string) ($m['age'] ?? $m['age_text'] ?? ''), $x) && (int) $x[0] < 130 && $year) { return $year - (int) $x[0]; }
    return null;
}

/** Ce que SocFace lit, comparé à une fiche : [{what, level, text}] ; jamais 🔴 (la machine peut se tromper). */
function socface_compare(array $m, int $year, array $p, string $relation = 'unknown', int $tol = 2): array
{
    $out = [];
    $sfBorn = socface_member_born($m, $year);
    $pBorn = (int) ($p['birth_year'] ?? 0) ?: null;
    $g = ($p['gender'] ?? '') === 'female';
    // 🌐 « text » dans la langue de la page (i18n_t) ; « fr » = la même phrase en français, pour l'empreinte des exceptions du Contrôle
    $say = static fn(string $tpl, array $v): array => ['text' => i18n_t($tpl, $v), 'fr' => (string) preg_replace_callback('/\{([a-z_]+)\}/', static fn($x) => (string) ($v[$x[1]] ?? $x[0]), $tpl)];
    if ($sfBorn && $pBorn && abs($sfBorn - $pBorn) > $tol) {
        $tpl = !empty($m['birth_year']) ? ($g ? 'SocFace lit « née en {sf} », ta fiche dit {p} — l’IA a pu mal lire : vérifie sur l’image.' : 'SocFace lit « né en {sf} », ta fiche dit {p} — l’IA a pu mal lire : vérifie sur l’image.')
            : ($g ? 'SocFace lit « née vers {sf} », ta fiche dit {p} — l’IA a pu mal lire : vérifie sur l’image.' : 'SocFace lit « né vers {sf} », ta fiche dit {p} — l’IA a pu mal lire : vérifie sur l’image.');
        $out[] = ['what' => 'birth', 'level' => abs($sfBorn - $pBorn) > 2 * $tol + 3 ? 'orange' : 'yellow'] + $say($tpl, ['sf' => $sfBorn, 'p' => $pBorn]);
    }
    $sfPlace = trim((string) ($m['birth_place'] ?? ''));
    $pPlace = trim((string) ($p['birth_place'] ?? ''));
    if ($sfPlace !== '' && $pPlace !== '') {
        $a = socface_norm($sfPlace); $b = socface_norm(explode(',', $pPlace)[0]);
        if ($a !== '' && $b !== '' && !str_contains($a, $b) && !str_contains($b, $a) && levenshtein($a, $b) > 2) {
            $out[] = ['what' => 'place', 'level' => 'yellow'] + $say($g ? 'SocFace lit « née à {sf} », ta fiche dit {p} — l’IA a pu mal lire : vérifie sur l’image.' : 'SocFace lit « né à {sf} », ta fiche dit {p} — l’IA a pu mal lire : vérifie sur l’image.', ['sf' => $sfPlace, 'p' => explode(',', $pPlace)[0]]);
        }
    }
    $sg = socface_gender((string) ($m['gender'] ?? ''));
    $pg = ($p['gender'] ?? '') === 'female' ? 'f' : (($p['gender'] ?? '') === 'male' ? 'h' : '');
    if ($sg !== '' && $pg !== '' && $sg !== $pg) {
        $out[] = ['what' => 'gender', 'level' => 'orange'] + $say($sg === 'f' ? 'SocFace lit « femme », ta fiche dit homme — l’IA a pu mal lire : vérifie sur l’image.' : 'SocFace lit « homme », ta fiche dit femme — l’IA a pu mal lire : vérifie sur l’image.', []);
    }
    $role = socface_norm((string) ($m['role'] ?? $m['household_position'] ?? ''));
    $want = preg_match('/^(fils|fille|enfant)$/', $role) ? 'child' : (preg_match('/^(epouse|epoux|femme|mari)$/', $role) ? 'spouse' : (preg_match('/^(pere|mere)$/', $role) ? 'parent' : ''));
    if ($want !== '' && $relation !== 'unknown' && $relation !== $want) {
        $tpl = ['child' => 'SocFace lit « {role} » du chef de ménage, ta fiche dit enfant — l’IA a pu mal lire : vérifie sur l’image.', 'spouse' => 'SocFace lit « {role} » du chef de ménage, ta fiche dit conjoint — l’IA a pu mal lire : vérifie sur l’image.',
            'parent' => 'SocFace lit « {role} » du chef de ménage, ta fiche dit parent — l’IA a pu mal lire : vérifie sur l’image.', '' => 'SocFace lit « {role} » du chef de ménage, ta fiche ne les relie pas — l’IA a pu mal lire : vérifie sur l’image.'][$relation] ?? 'SocFace lit « {role} » du chef de ménage, ta fiche dit rien — l’IA a pu mal lire : vérifie sur l’image.';
        $out[] = ['what' => 'relation', 'level' => 'yellow'] + $say($tpl, ['role' => $m['role'] ?? $m['household_position']]);
    }
    return $out;
}

function socface_gender(string $v): string
{
    $g = socface_norm($v);
    return preg_match('/^(f|femme|feminin|female)/', $g) ? 'f' : (preg_match('/^(h|homme|m|masculin|male)\b/', $g) ? 'h' : '');
}

/** le lien entre le chef et un membre dans l'arbre : child (b enfant de a), spouse, parent, '' (aucun) */
function socface_relation(PDO $pdo, int $a, int $b): string
{
    if (!$a || !$b || $a === $b) { return 'unknown'; }
    $s = $pdo->prepare('SELECT 1 FROM families WHERE (partner1_id=? AND partner2_id=?) OR (partner1_id=? AND partner2_id=?) LIMIT 1'); $s->execute([$a, $b, $b, $a]);
    if ($s->fetchColumn()) { return 'spouse'; }
    $s = $pdo->prepare('SELECT 1 FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=? AND (f.partner1_id=? OR f.partner2_id=?) LIMIT 1');
    $s->execute([$b, $a, $a]); if ($s->fetchColumn()) { return 'child'; }
    $s->execute([$a, $b, $b]); if ($s->fetchColumn()) { return 'parent'; }
    return '';
}

/** les fiches (pas les animaux) : nom, prénom, genre, années, lieu de naissance ; une seule lecture */
function socface_people(PDO $pdo, array $ids = []): array
{
    $hasKind = (bool) $pdo->query("SELECT 1 FROM pragma_table_info('persons') WHERE name='kind'")->fetchColumn();
    $where = $hasKind ? "WHERE COALESCE(p.kind,'')<>'animal'" : 'WHERE 1';
    $args = [];
    if ($ids) { $where .= ' AND p.id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')'; $args = array_values($ids); }
    $sql = "SELECT p.id, p.first_name, p.last_name, p.gender,
            (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('BIRT','BAPM','CHR') AND e.year IS NOT NULL ORDER BY t.gedcom_tag='BIRT' DESC, e.id LIMIT 1) AS birth_year,
            (SELECT COALESCE(pl.name,'') FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('BIRT','BAPM','CHR') ORDER BY t.gedcom_tag='BIRT' DESC, e.id LIMIT 1) AS birth_place,
            (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('DEAT','BURI') AND e.year IS NOT NULL ORDER BY t.gedcom_tag='DEAT' DESC, e.id LIMIT 1) AS death_year
        FROM persons p $where";
    $s = $pdo->prepare($sql); $s->execute($args);
    $out = [];
    foreach ($s->fetchAll() as $r) { $out[(int) $r['id']] = $r; }
    return $out;
}

/** « c'est la même personne ? » : les fiches qui pourraient être ce membre (3 au plus), avec la raison et les écarts */
function socface_candidates(array $people, array $byLast, array $m, int $year): array
{
    $ln = socface_norm((string) ($m['last'] ?? '')); $fn = socface_norm(explode(' ', trim((string) ($m['first'] ?? '')))[0] ?? '');
    if ($ln === '' && $fn === '') { return []; }
    $keys = [];
    foreach ($byLast as $k => $_) { if ($k === $ln || ($ln !== '' && abs(strlen($k) - strlen($ln)) <= 2 && levenshtein($k, $ln) <= ($ln === '' ? 0 : (strlen($ln) <= 4 ? 1 : 2)))) { $keys[] = $k; } }
    $sfBorn = socface_member_born($m, $year);
    $out = [];
    foreach ($keys as $k) {
        foreach ($byLast[$k] as $id) {
            $p = $people[$id]; $why = []; $score = 0;
            $score += $k === $ln ? 40 : 25; $why[] = $k === $ln ? 'même nom' : 'nom proche';
            $pf = socface_norm((string) $p['first_name']); $pf1 = explode(' ', $pf)[0] ?? '';
            if ($fn !== '' && ($pf1 === $fn || str_contains(' ' . $pf . ' ', ' ' . $fn . ' '))) { $score += 35; $why[] = 'même prénom'; }
            elseif ($fn !== '' && $pf1 !== '' && levenshtein($pf1, $fn) <= 2) { $score += 18; $why[] = 'prénom proche'; }
            else { continue; }
            $by = (int) ($p['birth_year'] ?? 0); $dy = (int) ($p['death_year'] ?? 0);
            if ($by && ($year < $by - 1 || $year - $by > 105)) { continue; }
            if ($dy && $year > $dy + 1) { continue; }
            if ($sfBorn && $by) { $d = abs($sfBorn - $by); if ($d <= 2) { $score += 20; $why[] = 'même année de naissance'; } elseif ($d <= 6) { $score += 5; } else { $score -= 15; } }
            $sg = socface_gender((string) ($m['gender'] ?? '')); $pg = $p['gender'] === 'female' ? 'f' : ($p['gender'] === 'male' ? 'h' : '');
            if ($sg && $pg && $sg !== $pg) { $score -= 20; }
            if ($score < 50) { continue; }
            $out[] = ['id' => (int) $id, 'first_name' => (string) $p['first_name'], 'last_name' => (string) $p['last_name'], 'gender' => (string) $p['gender'], 'birth_year' => $by ?: null, 'death_year' => $dy ?: null,
                'birth_place' => (string) ($p['birth_place'] ?? ''), 'score' => min(100, $score), 'why' => implode(', ', $why)];
        }
    }
    usort($out, static fn($a, $b) => $b['score'] <=> $a['score']);
    return array_slice($out, 0, 3);
}

/** les ménages envoyés par la page, bornés et nettoyés */
function socface_clean_households(mixed $raw): array
{
    if (!is_array($raw)) { throw new RuntimeException('Rien à importer.'); }
    if (count($raw) > 400) { throw new RuntimeException('Trop de ménages d’un coup (400 au plus) : coupe le fichier.'); }
    $t = static fn($v, int $n = 300) => mb_substr(safe_text(is_scalar($v) || $v === null ? $v : ''), 0, $n);
    $fa = static fn($v) => preg_match('#^https://francearchives\.gouv\.fr/[^\s<>"]+$#', (string) $v) && strlen((string) $v) < 600 ? (string) $v : '';
    $web = static function ($v): string { $v = (string) $v; return filter_var($v, FILTER_VALIDATE_URL) && in_array(parse_url($v, PHP_URL_SCHEME), ['http', 'https'], true) && strlen($v) < 1000 ? $v : ''; };
    $out = [];
    foreach ($raw as $h) {
        if (!is_array($h)) { continue; }
        $year = (int) ($h['year'] ?? 0);
        if ($year < 1800 || $year > 1950) { continue; }
        $members = [];
        foreach (array_slice(is_array($h['members'] ?? null) ? $h['members'] : [], 0, 80) as $m) {
            if (!is_array($m)) { continue; }
            $row = ['last' => $t($m['last'] ?? '', 120), 'first' => $t($m['first'] ?? '', 120), 'age' => $t($m['age'] ?? '', 20), 'birth_year' => ($by = (int) ($m['birth_year'] ?? 0)) >= 1700 && $by <= 1950 ? $by : null,
                'birth_text' => $t($m['birth_text'] ?? '', 60), 'birth_place' => $t($m['birth_place'] ?? '', 150), 'role' => $t($m['role'] ?? '', 80), 'gender' => socface_gender((string) ($m['gender'] ?? '')),
                'occupation' => $t($m['occupation'] ?? '', 200), 'employer' => $t($m['employer'] ?? '', 200), 'nationality' => $t($m['nationality'] ?? '', 80), 'civil_status' => $t($m['civil_status'] ?? '', 80),
                'notes' => $t($m['notes'] ?? '', 500), 'page' => $t($m['page'] ?? '', 20), 'line' => $t($m['line'] ?? '', 20), 'url' => $fa($m['url'] ?? ''), 'partial' => !empty($m['partial']) ? 1 : 0,
                'person_id' => max(0, (int) ($m['person_id'] ?? 0)), 'skip' => !empty($m['skip'])];
            if ($row['last'] === '' && $row['first'] === '') { continue; }
            $members[] = $row;
        }
        if (!$members) { continue; }
        $commune = $t($h['commune'] ?? '', 150);
        $urls = array_values(array_filter(array_column($members, 'url'))); sort($urls);
        $key = $t($h['household'] ?? '', 120) !== '' ? 'h:' . $t($h['household'], 120)
            : 'n:' . md5($year . '|' . socface_norm($commune) . '|' . ($urls ? implode(',', $urls) : implode(',', array_map(static fn($m) => socface_norm($m['last'] . ' ' . $m['first']), $members))));
        $out[] = ['year' => $year, 'commune' => $commune, 'department' => $t($h['department'] ?? '', 80), 'country' => $t($h['country'] ?? '', 60) ?: 'France',
            'cote' => $t($h['cote'] ?? '', 120), 'page' => $t($h['page'] ?? '', 20), 'service' => $t($h['service'] ?? '', 200), 'url' => $fa($h['url'] ?? '') ?: ($urls[0] ?? ''),
            'image_url' => $web($h['image_url'] ?? ''), 'key' => $key, 'members' => $members];
    }
    return $out;
}

/** déjà importé ? (même ménage, ou une des notices déjà dans un foyer SocFace) */
function socface_existing(PDO $pdo, array $h): int
{
    $s = $pdo->prepare("SELECT id FROM census_records WHERE origin='socface' AND household_key=? LIMIT 1"); $s->execute([$h['key']]);
    if ($id = (int) $s->fetchColumn()) { return $id; }
    foreach ($h['members'] as $m) {
        if ($m['url'] === '') { continue; }
        $s = $pdo->prepare("SELECT cm.census_id FROM census_members cm JOIN census_records cr ON cr.id=cm.census_id WHERE cr.origin='socface' AND cm.origin_data LIKE ? LIMIT 1");
        $s->execute(['%' . str_replace(['%', '_'], ['\%', '\_'], json_encode($m['url'], JSON_UNESCAPED_SLASHES)) . '%']);
        if ($id = (int) $s->fetchColumn()) { return $id; }
    }
    return 0;
}

/** POST socface_preview : pour chaque membre, les fiches possibles (« c'est la même personne ? ») et les écarts ; rien n'est écrit. */
function socface_preview(PDO $pdo, array $data): array
{
    socface_schema($pdo);
    $hs = socface_clean_households($data['households'] ?? null);
    $people = socface_people($pdo);
    $byLast = [];
    foreach ($people as $id => $p) { $byLast[socface_norm((string) $p['last_name'])][] = $id; }
    $tol = socface_tolerance($pdo);
    $out = [];
    foreach ($hs as $hi => $h) {
        $members = [];
        foreach ($h['members'] as $m) {
            $c = socface_candidates($people, $byLast, $m, $h['year']);
            foreach ($c as &$x) { $x['ecarts'] = socface_compare($m, $h['year'], $x, 'unknown', $tol); }
            unset($x);
            $members[] = ['candidates' => $c];
        }
        // une fiche déjà dans un recensement de cette année : on le dit (le foyer SocFace s'ajoute à côté, rien n'est remplacé)
        $already = [];
        foreach ($members as $mi => $mm) {
            foreach ($mm['candidates'] as $c) {
                $s = $pdo->prepare('SELECT 1 FROM census_members cm JOIN census_records cr ON cr.id=cm.census_id WHERE cm.person_id=? AND cr.year=? LIMIT 1'); $s->execute([$c['id'], $h['year']]);
                if ($s->fetchColumn()) { $already[$mi][] = $c['id']; }
            }
        }
        $out[] = ['index' => $hi, 'key' => $h['key'], 'existing' => socface_existing($pdo, $h), 'members' => $members, 'already' => $already];
    }
    return ['households' => $out, 'mention' => SOCFACE_MENTION];
}

function socface_tolerance(PDO $pdo): int
{
    if (function_exists('controle_seuils')) { try { return (int) (controle_seuils($pdo)['socface_years'] ?? 2); } catch (Throwable $_) {} }
    return 2;
}

/** POST socface_import : chaque ménage → un foyer de recensement + sa source ; seules les fiches confirmées sont reliées. */
function socface_import(PDO $pdo, array $data): array
{
    socface_schema($pdo);
    $hs = socface_clean_households($data['households'] ?? null);
    if (!$hs) { throw new RuntimeException('Rien à importer : aucun ménage avec une année de recensement.'); }
    $batch = 'sf-' . bin2hex(random_bytes(6));
    $ids = ['census' => [], 'sources' => [], 'links' => [], 'places' => []];
    $created = 0; $skipped = 0; $linked = 0;
    $own = !$pdo->inTransaction(); // api.php ouvre déjà une transaction pour chaque écriture
    if ($own) { $pdo->beginTransaction(); }
    try {
        foreach ($hs as $h) {
            if (socface_existing($pdo, $h)) { $skipped++; continue; }
            $members = array_values(array_filter($h['members'], static fn($m) => !$m['skip']));
            if (!$members) { continue; }
            // les fiches confirmées : elles doivent exister, ne pas être verrouillées, et pas deux fois dans le même foyer
            $seen = [];
            foreach ($members as &$m) {
                if ($m['person_id'] && (!person_exists($pdo, $m['person_id']) || isset($seen[$m['person_id']]))) { $m['person_id'] = 0; }
                if ($m['person_id']) { assert_person_unlocked($pdo, $m['person_id']); $seen[$m['person_id']] = true; }
            }
            unset($m);
            $placeId = null;
            if ($h['commune'] !== '') {
                $before = (int) $pdo->query('SELECT COALESCE(max(id),0) FROM places')->fetchColumn();
                $placeId = find_or_create_place($pdo, $h['commune'], $h['country'] ?: 'France');
                if ($placeId && $placeId > $before) {
                    $ids['places'][] = $placeId;
                    if ($h['department'] !== '') { $pdo->prepare("UPDATE places SET county=? WHERE id=? AND COALESCE(county,'')=''")->execute([$h['department'], $placeId]); }
                }
            }
            $pageLine = $h['page'] !== '' ? 'page ' . $h['page'] : '';
            $notes = SOCFACE_MENTION . '.' . ($h['service'] !== '' ? "\nConservé par : " . $h['service'] : '');
            $pdo->prepare("INSERT INTO census_records(year,date_text,is_special,status,address,place_id,notes,origin,origin_url,image_url,cote,page_line,household_key,verified,import_batch) VALUES(?,?,0,'found','',?,?,'socface',?,?,?,?,?,0,?)")
                ->execute([$h['year'], '', $placeId, $notes, $h['url'], $h['image_url'], $h['cote'], $pageLine, $h['key'], $batch]);
            $cid = (int) $pdo->lastInsertId(); $ids['census'][] = $cid; $created++;
            $chef = 0; foreach ($members as $i => $m) { if (preg_match('/^chef/i', $m['role'])) { $chef = $i; break; } }
            $ins = $pdo->prepare('INSERT INTO census_members(census_id,person_id,first_name,display_name,age_text,birth_place,occupation,employer,nationality,household_position,personal_status,extra_info,is_primary,origin_data,verified) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)');
            foreach ($members as $i => $m) {
                $origin = ['src' => 'socface', 'birth_year' => $m['birth_year'], 'birth_text' => $m['birth_text'], 'gender' => $m['gender'], 'page' => $m['page'], 'line' => $m['line'], 'url' => $m['url'], 'partial' => $m['partial']];
                $ins->execute([$cid, $m['person_id'] ?: null, $m['first'], $m['last'], $m['age'] !== '' ? $m['age'] . ' ans' : ($m['birth_year'] ? 'né' . ($m['gender'] === 'f' ? 'e' : '') . ' en ' . $m['birth_year'] : ''),
                    $m['birth_place'], $m['occupation'], $m['employer'], $m['nationality'], $m['role'], $m['civil_status'], $m['notes'], $i === $chef ? 1 : 0, json_encode($origin, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
                if ($m['person_id']) { $linked++; }
            }
            // la source : une par recensement, avec le lien vers la notice et vers l'image, et la mention
            $place = trim($h['commune'] . ($h['department'] !== '' ? ' (' . $h['department'] . ')' : ''));
            $title = 'Recensement de ' . $h['year'] . ($place !== '' ? ' — ' . $place : '');
            $text = SOCFACE_MENTION . '.' . ($h['image_url'] !== '' ? (preg_match('/(ficheFocus|page|vue|focus)=$/i', $h['image_url']) ? "\nLien vers le registre (la page n’est pas précisée) : " : "\nImage : ") . $h['image_url'] : '') . ($h['cote'] !== '' ? "\nCote : " . $h['cote'] : '') . ($pageLine !== '' ? "\n" . ucfirst($pageLine) : '');
            $pdo->prepare("INSERT INTO sources(source_type,title,author,agency,publication,url,text) VALUES('archive',?,?,?,?,?,?)")
                ->execute([$title, 'Projet SocFace (transcription automatique)', $h['service'] !== '' ? $h['service'] : 'FranceArchives', 'FranceArchives — base de noms (recensements)', $h['url'], $text]);
            $sid = (int) $pdo->lastInsertId(); $ids['sources'][] = $sid;
            $link = $pdo->prepare('INSERT INTO source_links(entity_type,entity_id,source_record_id,page,quality,note) VALUES(?,?,?,?,?,?)');
            $link->execute(['census', $cid, $sid, $pageLine, '', SOCFACE_MENTION]); $ids['links'][] = (int) $pdo->lastInsertId();
            foreach ($members as $m) {
                if (!$m['person_id']) { continue; }
                $pl = trim(($m['page'] !== '' ? 'page ' . $m['page'] : $pageLine) . ($m['line'] !== '' ? ', ligne ' . $m['line'] : ''), ', ');
                $link->execute(['person', $m['person_id'], $sid, $pl, '', SOCFACE_MENTION]); $ids['links'][] = (int) $pdo->lastInsertId();
            }
            log_change($pdo, 'census', $cid, 'create', 'Recensement de ' . $h['year'] . ' importé de SocFace (FranceArchives), à vérifier sur l’image');
        }
        $summary = $created . ' foyer' . ($created > 1 ? 's' : '') . ', ' . $linked . ' fiche' . ($linked > 1 ? 's' : '') . ' reliée' . ($linked > 1 ? 's' : '');
        $pdo->prepare('INSERT INTO socface_imports(batch,summary,ids) VALUES(?,?,?)')->execute([$batch, $summary, json_encode($ids)]);
        if ($own) { $pdo->commit(); }
    } catch (Throwable $e) { if ($own && $pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
    return ['batch' => $batch, 'created' => $created, 'skipped' => $skipped, 'linked' => $linked, 'census_ids' => $ids['census']];
}

/** POST socface_undo : retire tout ce qu'un import a ajouté (foyers, membres, sources, lieux créés et restés vides). */
function socface_undo(PDO $pdo, array $data): array
{
    socface_schema($pdo);
    $batch = safe_text($data['batch'] ?? '');
    $s = $pdo->prepare("SELECT * FROM socface_imports WHERE batch=? AND undone_at=''"); $s->execute([$batch]); $row = $s->fetch();
    if (!$row) { throw new RuntimeException('Cet import est déjà annulé, ou introuvable.'); }
    $ids = json_decode((string) $row['ids'], true) ?: [];
    $own = !$pdo->inTransaction();
    if ($own) { $pdo->beginTransaction(); }
    try {
        foreach (array_map('intval', $ids['links'] ?? []) as $id) { $pdo->prepare('DELETE FROM source_links WHERE id=?')->execute([$id]); }
        foreach (array_map('intval', $ids['sources'] ?? []) as $id) {
            $n = $pdo->prepare('SELECT count(*) FROM source_links WHERE source_record_id=?'); $n->execute([$id]);
            if (!(int) $n->fetchColumn()) { $pdo->prepare('DELETE FROM sources WHERE id=?')->execute([$id]); }
        }
        foreach (array_map('intval', $ids['census'] ?? []) as $id) {
            $pdo->prepare("DELETE FROM media_links WHERE entity_type='census' AND entity_id=?")->execute([$id]);
            $pdo->prepare("DELETE FROM label_links WHERE entity_type='census' AND entity_id=?")->execute([$id]);
            $pdo->prepare('DELETE FROM census_members WHERE census_id=?')->execute([$id]);
            $pdo->prepare("DELETE FROM census_records WHERE id=? AND origin='socface'")->execute([$id]);
            log_change($pdo, 'census', $id, 'delete', 'Import SocFace annulé');
        }
        foreach (array_map('intval', $ids['places'] ?? []) as $id) {
            $used = $pdo->prepare('SELECT (SELECT count(*) FROM events WHERE place_id=?) + (SELECT count(*) FROM census_records WHERE place_id=?)'); $used->execute([$id, $id]);
            if (!(int) $used->fetchColumn()) { try { $pdo->prepare('DELETE FROM places WHERE id=?')->execute([$id]); } catch (Throwable $_) {} }
        }
        $pdo->prepare("UPDATE socface_imports SET undone_at=CURRENT_TIMESTAMP WHERE batch=?")->execute([$batch]);
        if ($own) { $pdo->commit(); }
    } catch (Throwable $e) { if ($own && $pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
    return ['batch' => $batch, 'removed' => count($ids['census'] ?? [])];
}

/** POST socface_verify : « Vérifié sur l'image » (ou le retirer) pour un foyer importé. */
function socface_verify(PDO $pdo, array $data): array
{
    socface_schema($pdo);
    $id = safe_int($data['census_id'] ?? 0); $v = !empty($data['verified']) ? 1 : 0;
    $s = $pdo->prepare("SELECT verified,year FROM census_records WHERE id=? AND origin='socface'"); $s->execute([$id]); $row = $s->fetch();
    if (!$row) { throw new RuntimeException('Foyer SocFace introuvable.'); }
    if (function_exists('census_assert_unlocked')) { census_assert_unlocked($pdo, $id); }
    $pdo->prepare('UPDATE census_records SET verified=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$v, $id]);
    $pdo->prepare('UPDATE census_members SET verified=?,updated_at=CURRENT_TIMESTAMP WHERE census_id=?')->execute([$v, $id]);
    log_change($pdo, 'census', $id, 'update', $v ? 'Recensement ' . $row['year'] . ' (SocFace) vérifié sur l’image' : 'Recensement ' . $row['year'] . ' (SocFace) de nouveau à vérifier');
    return ['census_id' => $id, 'verified' => $v, 'before' => (int) $row['verified']];
}

/** POST socface_fix : la correction d'une lecture, choisie par la personne (l'ancienne lecture est gardée pour ↶ Annuler). */
function socface_fix(PDO $pdo, array $data): array
{
    socface_schema($pdo);
    $id = safe_int($data['member_id'] ?? 0); $field = safe_text($data['field'] ?? ''); $value = mb_substr(safe_text($data['value'] ?? ''), 0, 200);
    $cols = ['first' => 'first_name', 'last' => 'display_name', 'age' => 'age_text', 'birth_place' => 'birth_place', 'occupation' => 'occupation', 'nationality' => 'nationality', 'role' => 'household_position', 'civil_status' => 'personal_status', 'employer' => 'employer'];
    $s = $pdo->prepare("SELECT cm.* FROM census_members cm JOIN census_records cr ON cr.id=cm.census_id WHERE cm.id=? AND cr.origin='socface'"); $s->execute([$id]); $m = $s->fetch();
    if (!$m) { throw new RuntimeException('Ligne SocFace introuvable.'); }
    if (function_exists('census_assert_unlocked')) { census_assert_unlocked($pdo, (int) $m['census_id']); }
    $origin = json_decode((string) $m['origin_data'], true) ?: [];
    if (isset($cols[$field])) {
        $col = $cols[$field]; $old = (string) $m[$col];
        if ($field === 'age' && preg_match('/^\d{1,3}$/', $value)) { $value .= ' ans'; }
        $origin['orig'][$field] ??= $old;
        $pdo->prepare("UPDATE census_members SET $col=?,origin_data=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([$value, json_encode($origin, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $id]);
    } elseif (in_array($field, ['birth_year', 'gender'], true)) {
        $old = (string) ($origin[$field] ?? '');
        $origin['orig'][$field] ??= $old;
        $origin[$field] = $field === 'birth_year' ? ((int) $value ?: null) : socface_gender($value);
        $pdo->prepare('UPDATE census_members SET origin_data=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([json_encode($origin, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $id]);
    } else { throw new RuntimeException('Champ inconnu.'); }
    log_change($pdo, 'census', (int) $m['census_id'], 'update-member', 'Lecture SocFace corrigée (' . $field . ' : « ' . $old . ' » → « ' . $value . ' »)');
    return ['member_id' => $id, 'field' => $field, 'old' => preg_replace('/ ans$/', '', $old), 'value' => $value];
}

/** les foyers SocFace d'une liste de fiches, avec les membres (pour la liste, la fiche et la fenêtre « Vérifier ») */
function socface_records(PDO $pdo, string $where, array $args, int $limit = 500): array
{
    socface_schema($pdo);
    $s = $pdo->prepare("SELECT cr.id, cr.year, cr.verified, cr.origin_url, cr.image_url, cr.cote, cr.page_line, cr.created_at, cr.updated_at, cr.place_id, COALESCE(pl.name,'') AS place, COALESCE(pl.county,'') AS county
        FROM census_records cr LEFT JOIN places pl ON pl.id=cr.place_id WHERE cr.origin='socface' AND $where ORDER BY cr.created_at DESC, cr.id DESC LIMIT " . max(1, min(2000, $limit)));
    $s->execute($args); $rows = $s->fetchAll();
    if (!$rows) { return []; }
    $in = implode(',', array_map(static fn($r) => (int) $r['id'], $rows));
    $mem = [];
    foreach ($pdo->query("SELECT cm.id, cm.census_id, cm.person_id, cm.first_name, cm.display_name, cm.age_text, cm.birth_place, cm.occupation, cm.employer, cm.nationality, cm.household_position, cm.personal_status, cm.extra_info, cm.is_primary, cm.origin_data, cm.verified,
            p.first_name AS p_first, p.last_name AS p_last, p.gender AS p_gender FROM census_members cm LEFT JOIN persons p ON p.id=cm.person_id WHERE cm.census_id IN ($in) ORDER BY cm.id") as $m) {
        $o = json_decode((string) $m['origin_data'], true) ?: [];
        $mem[(int) $m['census_id']][] = ['id' => (int) $m['id'], 'person_id' => (int) $m['person_id'] ?: null, 'person_name' => trim(($m['p_first'] ?? '') . ' ' . ($m['p_last'] ?? '')), 'person_gender' => (string) ($m['p_gender'] ?? ''),
            'last' => (string) $m['display_name'], 'first' => (string) $m['first_name'], 'age' => (string) preg_replace('/\s*ans?$/', '', (string) $m['age_text']), 'birth_year' => $o['birth_year'] ?? null, 'birth_text' => $o['birth_text'] ?? '',
            'birth_place' => (string) $m['birth_place'], 'occupation' => (string) $m['occupation'], 'employer' => (string) $m['employer'], 'nationality' => (string) $m['nationality'], 'role' => (string) $m['household_position'],
            'civil_status' => (string) $m['personal_status'], 'notes' => (string) $m['extra_info'], 'gender' => $o['gender'] ?? '', 'page' => $o['page'] ?? '', 'line' => $o['line'] ?? '', 'url' => $o['url'] ?? '', 'partial' => !empty($o['partial']),
            'orig' => $o['orig'] ?? (object) [], 'is_primary' => (int) $m['is_primary']];
    }
    foreach ($rows as &$r) { $r['members'] = $mem[(int) $r['id']] ?? []; $r['verified'] = (int) $r['verified']; }
    unset($r);
    return $rows;
}

/** les écarts SocFace ↔ fiche d'un foyer (membres reliés seulement) */
function socface_record_ecarts(PDO $pdo, array $r, array $people, int $tol): array
{
    $chef = 0; foreach ($r['members'] as $m) { if ($m['is_primary'] && $m['person_id']) { $chef = (int) $m['person_id']; } }
    $out = [];
    foreach ($r['members'] as $m) {
        if (!$m['person_id'] || !isset($people[$m['person_id']])) { continue; }
        $rel = $chef && $chef !== (int) $m['person_id'] ? socface_relation($pdo, $chef, (int) $m['person_id']) : 'unknown';
        foreach (socface_compare($m, (int) $r['year'], $people[$m['person_id']], $rel, $tol) as $e) { $out[] = $e + ['member_id' => $m['id'], 'person_id' => (int) $m['person_id']]; }
    }
    return $out;
}

/** GET socface_list / socface_person / socface_context */
function socface_api_get(PDO $pdo, string $action, array $q): array
{
    socface_schema($pdo);
    if ($action === 'socface_person') {
        $pid = safe_int($q['person_id'] ?? 0);
        $rows = socface_records($pdo, 'cr.id IN (SELECT census_id FROM census_members WHERE person_id=?)', [$pid], 200);
        $ids = []; foreach ($rows as $r) { foreach ($r['members'] as $m) { if ($m['person_id']) { $ids[$m['person_id']] = $m['person_id']; } } }
        $people = $ids ? socface_people($pdo, array_values($ids)) : [];
        $tol = socface_tolerance($pdo);
        foreach ($rows as &$r) { $r['ecarts'] = socface_record_ecarts($pdo, $r, $people, $tol); }
        unset($r);
        return ['records' => $rows, 'mention' => SOCFACE_MENTION];
    }
    if ($action === 'socface_list') {
        $where = ['1']; $args = [];
        $st = (string) ($q['status'] ?? 'all');
        if ($st === 'todo') { $where[] = 'cr.verified=0'; } elseif ($st === 'verified') { $where[] = 'cr.verified=1'; }
        $text = trim(safe_text($q['q'] ?? ''));
        if ($text !== '') { $like = '%' . $text . '%'; $where[] = '(pl.name LIKE ? OR cr.year LIKE ? OR cr.cote LIKE ? OR EXISTS(SELECT 1 FROM census_members m WHERE m.census_id=cr.id AND (m.display_name LIKE ? OR m.first_name LIKE ? OR m.occupation LIKE ?)))'; array_push($args, $like, $like, $like, $like, $like, $like); }
        if ($cid = safe_int($q['census_id'] ?? 0)) { $where[] = 'cr.id=?'; $args[] = $cid; }
        $rows = socface_records($pdo, implode(' AND ', $where), $args, 500);
        $counts = $pdo->query("SELECT count(*) AS n, total(verified) AS v FROM census_records WHERE origin='socface'")->fetch();
        $imports = $pdo->query("SELECT batch, created_at, summary, undone_at FROM socface_imports ORDER BY created_at DESC LIMIT 5")->fetchAll();
        return ['records' => $rows, 'counts' => ['all' => (int) $counts['n'], 'verified' => (int) $counts['v'], 'todo' => (int) $counts['n'] - (int) $counts['v']], 'imports' => $imports, 'mention' => SOCFACE_MENTION];
    }
    if ($action === 'socface_context') {
        $sur = []; $first = [];
        foreach ($pdo->query("SELECT last_name AS v, count(*) AS n FROM persons WHERE TRIM(COALESCE(last_name,''))<>'' GROUP BY last_name COLLATE NOCASE ORDER BY n DESC LIMIT 6000") as $r) { $sur[] = ['value' => (string) $r['v'], 'weight' => (int) $r['n']]; }
        $fc = [];
        foreach ($pdo->query("SELECT first_name FROM persons WHERE TRIM(COALESCE(first_name,''))<>'' LIMIT 200000") as $r) { foreach (preg_split('/[\s,]+/u', trim((string) $r['first_name'])) as $w) { if (mb_strlen($w) >= 3) { $fc[$w] = ($fc[$w] ?? 0) + 1; } } }
        arsort($fc); foreach (array_slice($fc, 0, 4000, true) as $w => $n) { $first[] = ['value' => (string) $w, 'weight' => $n]; }
        $places = [];
        foreach ($pdo->query("SELECT name AS v, count(*) AS n FROM places WHERE TRIM(COALESCE(name,''))<>'' GROUP BY name COLLATE NOCASE ORDER BY n DESC LIMIT 6000") as $r) { $places[] = ['value' => (string) $r['v'], 'weight' => 5]; }
        $dep = socface_department_code((string) ($q['department'] ?? ''), (string) ($q['commune'] ?? ''), $pdo);
        if ($dep !== '') { foreach (socface_communes($dep) as $c) { $places[] = ['value' => $c, 'weight' => 1]; } }
        $trades = [];
        $f = APP_ROOT . '/assets/data/metiers-anciens.json';
        if (is_file($f)) { $d = json_decode((string) file_get_contents($f), true); foreach ($d['trades'] ?? [] as $t) { if (!empty($t['name'])) { $trades[] = (string) $t['name']; } if (!empty($t['fem'])) { $trades[] = (string) $t['fem']; } } }
        return ['surnames' => $sur, 'firstNames' => $first, 'places' => $places, 'trades' => $trades, 'department' => $dep, 'mention' => SOCFACE_MENTION];
    }
    throw new RuntimeException('Action inconnue');
}

/** le code du département (« 19 ») d'un nom (« Corrèze »), d'un code, ou de la commune connue dans la base */
function socface_department_code(string $dep, string $commune, PDO $pdo): string
{
    $deps = function_exists('gaps_departments') ? gaps_departments() : [];
    $d = trim($dep);
    if ($d !== '' && isset($deps[strtoupper($d)])) { return strtoupper($d); }
    if ($d !== '') { foreach ($deps as $code => $x) { if (socface_norm($x['name']) === socface_norm($d)) { return (string) $code; } } }
    if ($commune !== '') {
        try { $s = $pdo->prepare("SELECT admin2_code FROM places WHERE name=? COLLATE NOCASE AND COALESCE(admin2_code,'')<>'' LIMIT 1"); $s->execute([$commune]); $c = strtoupper((string) $s->fetchColumn()); if (isset($deps[$c])) { return $c; } } catch (Throwable $_) {}
    }
    return '';
}

/** les noms des communes d'un département depuis 1943, anciens noms compris (fichier de l'INSEE livré : frontieres/com.csv) */
function socface_communes(string $dep): array
{
    $f = '';
    foreach ([function_exists('cp_front_dir') ? cp_front_dir() . '/com.csv' : '', APP_ROOT . '/data/reference/frontieres/com.csv'] as $c) { if ($c !== '' && is_file($c)) { $f = $c; break; } }
    if ($f === '' || $dep === '') { return []; }
    $out = [];
    if (($h = fopen($f, 'r')) === false) { return []; }
    fgetcsv($h, 0, ',', '"', '');
    while (($r = fgetcsv($h, 0, ',', '"', '')) !== false) {
        if (count($r) < 6 || !str_starts_with((string) $r[1], $dep) || strlen((string) $r[1]) - strlen($dep) !== (strlen($dep) === 3 ? 2 : 3)) { continue; }
        $out[(string) $r[5]] = true;
    }
    fclose($h);
    return array_keys($out);
}

/**
 * « Que manque-t-il ? » : pour chaque ancêtre vivant à une année de recensement dans une commune connue (un événement à
 * 15 ans au plus), une ligne « Recensement de 1906 à Tulle : chercher sur SocFace » — sauf si le foyer est déjà là, ou si
 * « ✓ Trouvé / Pas trouvé » a déjà été noté (Journal des recherches : dépouillement « FranceArchives (SocFace) »).
 */
function socface_gap_items(PDO $pdo, array $ids, array $sosaOf, array $people, int $max = 300): array
{
    if (!$ids) { return []; }
    socface_schema($pdo);
    $marks = implode(',', array_fill(0, count($ids), '?'));
    $ev = [];
    $s = $pdo->prepare("SELECT e.person_id, e.year, pl.name, COALESCE(pl.country,'') AS country, COALESCE(pl.admin2_code,'') AS dep FROM events e JOIN places pl ON pl.id=e.place_id WHERE e.person_id IN ($marks) AND e.year IS NOT NULL
        UNION ALL SELECT f.partner1_id, e.year, pl.name, COALESCE(pl.country,''), COALESCE(pl.admin2_code,'') FROM events e JOIN families f ON f.id=e.family_id JOIN places pl ON pl.id=e.place_id WHERE f.partner1_id IN ($marks) AND e.year IS NOT NULL
        UNION ALL SELECT f.partner2_id, e.year, pl.name, COALESCE(pl.country,''), COALESCE(pl.admin2_code,'') FROM events e JOIN families f ON f.id=e.family_id JOIN places pl ON pl.id=e.place_id WHERE f.partner2_id IN ($marks) AND e.year IS NOT NULL");
    try { $s->execute(array_merge($ids, $ids, $ids)); } catch (Throwable $_) { return []; }
    foreach ($s->fetchAll() as $r) { $ev[(int) $r['person_id']][] = [(int) $r['year'], (string) $r['name'], (string) $r['country'], (string) $r['dep']]; }
    $have = [];
    $s = $pdo->prepare("SELECT cm.person_id, cr.year FROM census_members cm JOIN census_records cr ON cr.id=cm.census_id WHERE cm.person_id IN ($marks)"); $s->execute($ids);
    foreach ($s->fetchAll() as $r) { $have[(int) $r['person_id'] . ':' . (int) $r['year']] = true; }
    try {
        $s = $pdo->prepare("SELECT ds.person_id, a.year_text FROM archive_digest_sought ds JOIN archive_digest_entries a ON a.id=ds.archive_digest_id WHERE a.record_type='recensement' AND a.archive_service LIKE '%SocFace%' AND ds.person_id IN ($marks)"); $s->execute($ids);
        foreach ($s->fetchAll() as $r) { if (preg_match('/\d{4}/', (string) $r['year_text'], $m)) { $have[(int) $r['person_id'] . ':' . (int) $m[0]] = true; } }
    } catch (Throwable $_) {}
    $now = (int) date('Y');
    $out = [];
    foreach ($ids as $pid) {
        $p = $people[$pid] ?? null; if (!$p) { continue; }
        $by = $p['by'] ?? null; $dy = $p['dy'] ?? null;
        if (!$by && !$dy) { continue; }
        $a = $by ?? ($dy - 60); $b = $dy ?? min($now, $a + 85);
        foreach (SOCFACE_YEARS as $y) {
            if ($y < $a || $y > $b || isset($have[$pid . ':' . $y])) { continue; }
            $best = null; $bd = 99;
            foreach ($ev[$pid] ?? [] as [$ey, $name, $country, $dep]) {
                $d = abs($ey - $y) + ($ey > $y ? 0.5 : 0);
                if ($d <= 15 && $d < $bd && ($country === '' || preg_match('/^(france|fr|fra)$/i', $country))) { $bd = $d; $best = [$name, $dep]; }
            }
            if (!$best) { // la même commune avant et après l'année (mariage en 1885, décès en 1930 à Tulle) : il y vivait sans doute
                $before = []; $after = [];
                foreach ($ev[$pid] ?? [] as [$ey, $name, $country, $dep]) { if ($country !== '' && !preg_match('/^(france|fr|fra)$/i', $country)) { continue; } if ($ey <= $y) { $before[$name] = $dep; } else { $after[$name] = $dep; } }
                foreach ($before as $name => $dep) { if (isset($after[$name])) { $best = [$name, $dep]; $bd = 1; break; } }
            }
            if (!$best) { continue; }
            $s2 = $sosaOf[$pid] ?? 0; $g = ($p['gender'] ?? '') === 'female';
            $out[] = ['sosa' => $s2, 'generation' => $s2 ? (int) floor(log($s2, 2)) + 1 : 0, 'person_id' => $pid, 'kind' => 'socface', 'what' => 'recensement de ' . $y, 'from' => $y, 'to' => $y, 'place' => $best[0],
                'why' => i18n_t($bd < 1 ? ($g ? 'vivante en {y}, à {place} vers {y} d’après un événement de la même année' : 'vivant en {y}, à {place} vers {y} d’après un événement de la même année') : ($g ? 'vivante en {y}, à {place} vers {y} d’après un événement proche' : 'vivant en {y}, à {place} vers {y} d’après un événement proche'), ['y' => $y, 'place' => $best[0]]),
                'name' => trim($p['first_name'] . ' ' . $p['last_name']) ?: 'Personne #' . $pid, 'gender' => $p['gender'],
                'sf' => ['last' => (string) $p['last_name'], 'first' => (string) $p['first_name'], 'place' => $best[0], 'year' => $y, 'gender' => $g ? 'f' : (($p['gender'] ?? '') === 'male' ? 'h' : '')]];
            if (count($out) >= $max) { return $out; }
        }
    }
    return $out;
}

/** ✅ Contrôle de la base : les écarts SocFace ↔ fiches (sorte « 🧾 Recensement SocFace », 🟡 ou 🟠, jamais 🔴). */
function socface_controle_alerts(PDO $pdo, array $th): array
{
    try { socface_schema($pdo); } catch (Throwable $_) { return []; }
    if (!$pdo->query("SELECT 1 FROM pragma_table_info('census_records') WHERE name='origin'")->fetchColumn()) { return []; }
    $rows = socface_records($pdo, 'EXISTS(SELECT 1 FROM census_members m WHERE m.census_id=cr.id AND m.person_id IS NOT NULL)', [], 2000);
    if (!$rows) { return []; }
    $ids = []; foreach ($rows as $r) { foreach ($r['members'] as $m) { if ($m['person_id']) { $ids[$m['person_id']] = $m['person_id']; } } }
    $people = socface_people($pdo, array_values($ids));
    $tol = (int) ($th['socface_years'] ?? 2);
    $titles = ['birth' => 'année de naissance', 'place' => 'lieu de naissance', 'gender' => 'genre', 'relation' => 'lien de parenté'];
    $titleT = static fn(string $what, $year, string $place) => i18n_t($place !== '' ? 'Recensement de {y} à {place} (SocFace) : {what}' : 'Recensement de {y} (SocFace) : {what}', ['y' => $year, 'place' => $place, 'what' => i18n_t($titles[$what], [], 'socface')]);
    $out = [];
    foreach ($rows as $r) {
        foreach (socface_record_ecarts($pdo, $r, $people, $tol) as $e) {
            $out[] = ['key' => 'socface:' . $e['member_id'] . ':' . $e['what'], 'check' => 'socface-' . $e['what'], 'sort' => 'socface', 'level' => $e['level'],
                'title' => $titleT($e['what'], $r['year'], (string) $r['place']),
                'detail' => $r['verified'] ? i18n_t('{text} (foyer coché « Vérifié sur l’image »)', ['text' => $e['text']]) : $e['text'], 'people' => [$e['person_id']],
                'socface' => ['census_id' => (int) $r['id'], 'member_id' => $e['member_id'], 'image_url' => $r['image_url'], 'origin_url' => $r['origin_url']], 'fp' => md5($e['fr'] ?? $e['text'])];
        }
    }
    return $out;
}
