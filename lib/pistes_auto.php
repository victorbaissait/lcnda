<?php
declare(strict_types=1);

/**
 * 🔎 Pistes automatiques pour tout l'arbre (comme les « indices » des grands sites, mais avec des sources ouvertes) :
 * une liste d'« actes probables à vérifier », cherchés À LA DEMANDE pour tout l'arbre, une branche, les ancêtres (Sosa)
 * ou les descendants d'une personne. Écran : assets/js/heritage-pistes-auto.js (style : assets/css/pistes-branches-celebres.css).
 *
 * Où l'on cherche (rien n'est ajouté tout seul : chaque piste attend « ✓ Rattacher » ou « ✗ Pas lui ») :
 *  - 🇳🇱🇧🇪 Open Archives (api.openarch.nl, la même recherche que « Où chercher ? », lib/ou_chercher_openarch.php) : une
 *    question par personne (prénom + nom + période), au plus UNE requête réseau par pas et ~2 s entre deux pas (soit moins de
 *    30 par minute, sous la limite de 4 requêtes par seconde de la documentation de l'API, relue le 25/11/2026 :
 *    « API calls are throttled per IP address to 4 requests per second », « Please use a descriptive user-agent ») ;
 *    réponses gardées 30 jours (table ouc_oa_cache) : relancer ne redemande rien ; licences : celles de chaque archive
 *    (le plus souvent CC0 1.0, parfois CC BY-SA 4.0 — llms.txt du site) ; l'archive est citée sur chaque piste ;
 *  - ⚰️ Décès INSEE (table insee_deces, si elle est installée ; Licence Ouverte 2.0) ;
 *  - 🎖️ Morts pour la France et 🏅 Léonore (lib/bases_officielles.php, bo_matches) ;
 *  - 📇 Annuaires de Paris (lib/brevets_annuaires.php, ba_matches).
 * Vie privée : une fiche vivante, confidentielle, sans date de décès et née il y a moins de 100 ans (ou sans aucune date)
 * n'est JAMAIS envoyée à Open Archives (elle n'est même pas regardée dans les bases installées).
 *
 *  GET  pistes_list&status=new|added|no|all&person_id=&src=&min=&q=&offset=&limit=   · pistes_count · pistes_job · pistes_about
 *  POST pistes_start {scope: all|sosa|branch:N|desc:N|person:N, sources[]} · pistes_step {id} · pistes_pause / pistes_resume / pistes_stop {id}
 *  POST pistes_accept {id, mode: source|event} → {undo}   · pistes_undo {id}   · pistes_reject {id}   · pistes_unreject {id}
 * Essais : GENEALOGY_TEST=1 + LCNDA_TEST_OPENARCH_DIR (comme ou_chercher_openarch.php : search.json, show-<archive>-<id>.json,
 * une seule réponse enregistrée pour toutes les questions : les noms qui ne correspondent pas sont écartés par la note).
 */

const PA_SOURCES = ['oa', 'insee', 'mpf', 'leonore', 'annuaire'];
const PA_MIN_SCORE = 55;
const PA_STEP_SECONDS = 2.5;
const PA_NET_WAIT_MS = 2100; // une requête réseau toutes les ~2 s : < 30 par minute, comme le demande ouc_oa_throttle()

function pst_schema(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    $pdo->exec("CREATE TABLE IF NOT EXISTS pistes (id INTEGER PRIMARY KEY AUTOINCREMENT, person_id INTEGER NOT NULL, src TEXT NOT NULL, rec_key TEXT NOT NULL,
        score INTEGER NOT NULL DEFAULT 0, title TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '', data TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'new',
        undo TEXT NOT NULL DEFAULT '', found_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, decided_at TEXT NOT NULL DEFAULT '', UNIQUE(person_id, src, rec_key))");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_pistes_status ON pistes(status, score)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_pistes_person ON pistes(person_id)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS lcnda_bg_jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, label TEXT NOT NULL DEFAULT '', state TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'running', message TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $done = true;
}

/* ═════════════════════ petits outils (aussi pour lib/parents_celebres.php) ═════════════════════ */

/** MAJUSCULES sans accents ni signes : « Lacombe-Durand » → « LACOMBEDURAND » */
function pst_key(string $s): string
{
    $s = str_replace(['œ', 'Œ', 'æ', 'Æ', 'ß'], ['oe', 'OE', 'ae', 'AE', 'ss'], $s);
    $s = function_exists('ascii_fold') ? ascii_fold($s) : $s;
    if (class_exists('Normalizer')) { $n = Normalizer::normalize($s, Normalizer::FORM_KD); if (is_string($n)) { $s = (string) preg_replace('/\p{Mn}+/u', '', $n); } }
    return (string) preg_replace('/[^A-Z]+/', '', strtoupper($s));
}
/** les mots d'un nom, chacun en clé : « Jean-Marie Victor » → [JEAN, MARIE, VICTOR, JEANMARIE] */
function pst_words(string $s): array
{
    $out = [];
    foreach (preg_split('/[\s,]+/u', trim($s)) ?: [] as $w) { if ($w === '') { continue; } foreach (explode('-', $w) as $p) { $k = pst_key($p); if ($k !== '') { $out[] = $k; } } if (str_contains($w, '-')) { $out[] = pst_key($w); } }
    return array_values(array_unique($out));
}
function pst_town(string $place): string { return trim((string) preg_split('/[,(]/u', $place)[0]); }

/** une fiche vue par les pistes : nom, prénoms, dates, lieux, parents, conjoint */
function pst_facts(PDO $pdo, int $pid): ?array
{
    static $memo = [];
    if (isset($memo[$pid])) { return $memo[$pid]; }
    if (count($memo) > 400) { $memo = []; }
    $cols = array_column($pdo->query("PRAGMA table_info(persons)")->fetchAll(PDO::FETCH_ASSOC), 'name');
    $extra = (in_array('kind', $cols, true) ? ', kind' : ", 'human' AS kind") . (in_array('outside_genealogy', $cols, true) ? ', outside_genealogy' : ', 0 AS outside_genealogy');
    $s = $pdo->prepare("SELECT id, first_name, last_name, gender, living_status, is_private$extra FROM persons WHERE id=?"); $s->execute([$pid]);
    $p = $s->fetch(PDO::FETCH_ASSOC);
    if (!$p) { return $memo[$pid] = null; }
    $ev = $pdo->prepare("SELECT e.year, COALESCE(t.gedcom_tag,'') AS tag, COALESCE(pl.name,'') AS place FROM events e LEFT JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id
        WHERE e.person_id=? OR e.family_id IN (SELECT id FROM families WHERE partner1_id=? OR partner2_id=?) ORDER BY COALESCE(e.year, 9999)");
    $ev->execute([$pid, $pid, $pid]);
    $by = null; $dy = null; $bplace = ''; $dplace = ''; $hasDeath = false; $years = []; $towns = []; $tags = [];
    foreach ($ev->fetchAll(PDO::FETCH_ASSOC) as $e) {
        $y = $e['year'] !== null && $e['year'] !== '' ? (int) $e['year'] : null;
        $tag = (string) $e['tag']; $tags[$tag] = true;
        if ($y) { $years[] = $y; }
        if (in_array($tag, ['BIRT', 'CHR', 'BAPM'], true)) { if ($by === null && $y) { $by = $y; } if ($bplace === '' && $e['place'] !== '') { $bplace = (string) $e['place']; } }
        if (in_array($tag, ['DEAT', 'BURI', 'CREM'], true)) { $hasDeath = true; if ($dy === null && $y) { $dy = $y; } if ($dplace === '' && $e['place'] !== '') { $dplace = (string) $e['place']; } }
        $town = pst_town((string) $e['place']);
        if ($town !== '' && !in_array($town, $towns, true)) { $towns[] = $town; }
    }
    $estimated = false;
    if ($by === null && $years) { $by = min($years) - 25; $estimated = true; }
    $nm = static function (?int $id) use ($pdo): array { if (!$id) { return []; } $s = $pdo->prepare('SELECT first_name, last_name FROM persons WHERE id=?'); $s->execute([$id]); $r = $s->fetch(PDO::FETCH_ASSOC); return $r ? ['first' => trim((string) $r['first_name']), 'last' => trim((string) $r['last_name'])] : []; };
    [$fa, $mo] = function_exists('sosa_parent_ids') ? sosa_parent_ids($pdo, $pid) : [null, null];
    return $memo[$pid] = ['id' => $pid, 'first' => trim((string) $p['first_name']), 'last' => trim((string) $p['last_name']), 'gender' => (string) $p['gender'],
        'living' => (string) $p['living_status'], 'private' => (int) $p['is_private'] === 1, 'animal' => ($p['kind'] ?? 'human') === 'animal', 'outside' => (int) ($p['outside_genealogy'] ?? 0) === 1,
        'birth' => $by, 'death' => $dy, 'has_death' => $hasDeath, 'estimated' => $estimated, 'birth_place' => $bplace, 'death_place' => $dplace, 'towns' => array_slice($towns, 0, 15),
        'father' => $nm($fa ? (int) $fa : null), 'mother' => $nm($mo ? (int) $mo : null), 'tags' => array_keys($tags)];
}

/** pourquoi cette fiche ne part pas sur Internet ('' : elle peut) — vivante, confidentielle, peut-être vivante, animal */
function pst_private_reason(?array $f): string
{
    if (!$f) { return 'introuvable'; }
    if ($f['animal'] || $f['outside']) { return 'hors_genealogie'; }
    if ($f['living'] === 'living') { return 'vivante'; }
    if ($f['private']) { return 'confidentielle'; }
    if ($f['living'] !== 'deceased' && !$f['has_death'] && ($f['birth'] === null || $f['birth'] > (int) date('Y') - 100)) { return 'peut_etre_vivante'; }
    return '';
}

/* ═════════════════════ les tâches de fond (une ligne par recherche ; aussi pour les parents célèbres) ═════════════════════ */

function pst_job_get(PDO $pdo, int $id, string $kind): ?array
{
    pst_schema($pdo);
    $s = $pdo->prepare('SELECT * FROM lcnda_bg_jobs WHERE id=? AND kind=?'); $s->execute([$id, $kind]);
    $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { return null; }
    $r['state'] = json_decode((string) $r['state'], true) ?: [];
    $r['id'] = (int) $r['id'];
    return $r;
}
function pst_job_last(PDO $pdo, string $kind): ?array
{
    pst_schema($pdo);
    $s = $pdo->prepare('SELECT id FROM lcnda_bg_jobs WHERE kind=? ORDER BY id DESC LIMIT 1'); $s->execute([$kind]);
    $id = (int) $s->fetchColumn();
    return $id ? pst_job_get($pdo, $id, $kind) : null;
}
function pst_job_save(PDO $pdo, array $job): void
{
    $pdo->prepare('UPDATE lcnda_bg_jobs SET state=?, status=?, message=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
        ->execute([json_encode($job['state'], JSON_UNESCAPED_UNICODE), $job['status'], mb_substr((string) ($job['message'] ?? ''), 0, 500), $job['id']]);
}
function pst_job_new(PDO $pdo, string $kind, string $label, array $state): array
{
    pst_schema($pdo);
    $pdo->prepare("UPDATE lcnda_bg_jobs SET status='stopped', updated_at=CURRENT_TIMESTAMP WHERE kind=? AND status IN ('running','paused')")->execute([$kind]);
    $pdo->prepare('INSERT INTO lcnda_bg_jobs(kind, label, state, status) VALUES(?,?,?,?)')->execute([$kind, $label, json_encode($state, JSON_UNESCAPED_UNICODE), 'running']);
    $old = $pdo->prepare('DELETE FROM lcnda_bg_jobs WHERE kind=? AND id NOT IN (SELECT id FROM lcnda_bg_jobs WHERE kind=? ORDER BY id DESC LIMIT 10)'); $old->execute([$kind, $kind]);
    return pst_job_get($pdo, (int) $pdo->lastInsertId(), $kind) ?? throw new RuntimeException('Recherche impossible.');
}
/** ce que l'écran montre d'une tâche (sans la liste des fiches) */
function pst_job_out(?array $job): ?array
{
    if (!$job) { return null; }
    $st = $job['state'];
    $total = count($st['ids'] ?? []);
    return ['id' => $job['id'], 'label' => (string) $job['label'], 'status' => (string) $job['status'], 'message' => (string) $job['message'], 'pos' => min($total, (int) ($st['pos'] ?? 0)), 'total' => $total,
        'counts' => $st['counts'] ?? [], 'sources' => $st['sources'] ?? [], 'scope' => (string) ($st['scope'] ?? ''), 'started' => (string) $job['created_at'], 'updated' => (string) $job['updated_at']];
}
/** les fiches d'une portée : tout l'arbre, les ancêtres (Sosa), une branche, les descendants, une personne */
function pst_scope_ids(PDO $pdo, string $scope): array
{
    if ($scope === 'all' || $scope === '') { return array_map('intval', $pdo->query('SELECT id FROM persons ORDER BY id')->fetchAll(PDO::FETCH_COLUMN)); }
    if (preg_match('/^person:(\d+)$/', $scope, $m)) { return person_exists($pdo, (int) $m[1]) ? [(int) $m[1]] : []; }
    if ($scope === 'sosa' || preg_match('/^(branch|desc):\d+$/', $scope)) {
        if ($scope === 'sosa') { // dans l'ordre des Sosa : les plus proches générations d'abord
            $root = (int) $pdo->query('SELECT id FROM persons ORDER BY is_start DESC, id LIMIT 1')->fetchColumn();
            $pos = $root && function_exists('sosa_positions') ? (sosa_positions($pdo, $root, 60000)['positions'] ?? []) : [];
            ksort($pos);
            return array_values(array_unique(array_map('intval', $pos)));
        }
        return function_exists('controle_scope_ids') ? controle_scope_ids($pdo, $scope) : [];
    }
    throw new LcndaBadInput('Portée inconnue.');
}
function pst_scope_label(PDO $pdo, string $scope): string
{
    if ($scope === 'all' || $scope === '') { return i18n_t('Tout l’arbre'); }
    if ($scope === 'sosa') { return i18n_t('Mes ancêtres (Sosa)'); }
    $name = static function (int $id) use ($pdo): string { $s = $pdo->prepare('SELECT first_name, last_name FROM persons WHERE id=?'); $s->execute([$id]); $r = $s->fetch(PDO::FETCH_ASSOC); return $r ? trim($r['first_name'] . ' ' . mb_strtoupper((string) $r['last_name'])) : '#' . $id; };
    if (preg_match('/^desc:(\d+)$/', $scope, $m)) { return i18n_t('Descendants de {n}', ['n' => $name((int) $m[1])]); }
    if (preg_match('/^person:(\d+)$/', $scope, $m)) { return $name((int) $m[1]); }
    if (preg_match('/^branch:(\d+)$/', $scope, $m)) { $s = $pdo->prepare('SELECT name FROM branches WHERE id=?'); $s->execute([(int) $m[1]]); return i18n_t('Branche {n}', ['n' => (string) ($s->fetchColumn() ?: $m[1])]); }
    return $scope;
}

/* ═════════════════════ la note d'une piste ═════════════════════ */

/** [ok|q|no, texte] → « ✓ même nom » ; le score va de 0 à 100 */
function pst_check(string $k, string $text): array { return [$k, $text]; }

/** une ligne de résultat d'Open Archives (ouc_oa_row) comparée à la fiche → null (écartée) ou {score, why[], tag, main} */
function pst_oa_score(array $f, array $row): ?array
{
    $last = pst_key($f['last']);
    $words = pst_words((string) $row['name']);
    if ($last === '' || !$words) { return null; }
    $full = implode('', $words);
    if (!str_contains($full, $last)) { return null; }
    $why = [pst_check('ok', i18n_t('même nom ({n})', ['n' => $f['last']]))]; $score = 30;
    // les prénoms de l'acte : ce qui précède le nom
    $lastWords = pst_words($f['last']);
    $given = array_values(array_filter($words, static fn($w) => !in_array($w, $lastWords, true) && !in_array($w, ['VAN', 'DE', 'DER', 'DEN', 'LE', 'LA', 'DU', 'TER', 'TEN'], true)));
    $mine = pst_words($f['first']);
    if ($given && $mine) {
        if ($given[0] === $mine[0]) { $score += 25; $why[] = pst_check('ok', i18n_t('même prénom ({p})', ['p' => explode(' ', trim($f['first']))[0]])); }
        elseif (array_intersect($given, $mine)) { $score += 16; $why[] = pst_check('q', i18n_t('un de ses prénoms')); }
        else { return null; } // un autre prénom écrit en toutes lettres : quelqu'un d'autre
    } elseif ($mine) { $why[] = pst_check('q', i18n_t('prénom absent de l’acte')); }
    $tag = function_exists('ouc_oa_tag') ? ouc_oa_tag((string) ($row['type_nl'] ?: $row['type'])) : '';
    $role = mb_strtolower((string) ($row['role_nl'] ?: $row['role']));
    $main = defined('OUC_OA_MAIN_ROLES') && in_array($role, OUC_OA_MAIN_ROLES, true);
    $y = (int) $row['year'];
    $by = $f['birth']; $dy = $f['death'];
    if ($y && $by !== null) {
        $hi = ($dy ?? $by + 100) + 1;
        if ($y < $by - 1 - ($f['estimated'] ? 15 : 0) || $y > $hi) { return null; } // hors de sa vie
        if ($main && in_array($tag, ['BIRT', 'BAPM'], true)) {
            $d = abs($y - $by);
            if ($f['estimated']) { $score += 8; $why[] = pst_check('q', i18n_t('naissance en {y} (sa fiche n’a pas de date de naissance)', ['y' => $y])); }
            elseif ($d === 0) { $score += 25; $why[] = pst_check('ok', i18n_t('né(e) la même année ({y})', ['y' => $y])); }
            elseif ($d === 1) { $score += 18; $why[] = pst_check('ok', i18n_t('né(e) à un an près ({y} ; sa fiche : {z})', ['y' => $y, 'z' => $by])); }
            elseif ($d <= 3) { $score += 6; $why[] = pst_check('q', i18n_t('naissance en {y} (sa fiche : {z})', ['y' => $y, 'z' => $by])); }
            else { return null; }
        } elseif ($main && in_array($tag, ['DEAT', 'BURI'], true)) {
            if ($dy !== null) { $d = abs($y - $dy); if ($d === 0) { $score += 25; $why[] = pst_check('ok', i18n_t('mort(e) la même année ({y})', ['y' => $y])); } elseif ($d <= 1) { $score += 15; $why[] = pst_check('ok', i18n_t('mort(e) à un an près ({y})', ['y' => $y])); } else { return null; } }
            else { $score += 10; $why[] = pst_check('q', i18n_t('décès en {y}, à {a} ans environ (sa fiche n’a pas de décès)', ['y' => $y, 'a' => $y - $by])); }
        } elseif ($main && $tag === 'MARR') {
            $age = $y - $by;
            if ($age < 14 || $age > 75) { return null; }
            $score += 12; $why[] = pst_check('ok', i18n_t('marié(e) en {y}, à {a} ans environ', ['y' => $y, 'a' => $age]));
        } else {
            $score += 4; $why[] = pst_check('q', i18n_t('cité(e) en {y}, de son vivant', ['y' => $y]));
        }
    } elseif ($y) { $why[] = pst_check('q', i18n_t('acte de {y} (sa fiche n’a pas de date)', ['y' => $y])); }
    $town = pst_key(pst_town((string) $row['place']));
    if ($town !== '') {
        $hit = null; foreach ($f['towns'] as $t) { if (pst_key($t) === $town) { $hit = $t; break; } }
        if ($hit !== null) { $score += 15; $why[] = pst_check('ok', i18n_t('même lieu ({l})', ['l' => $hit])); }
        elseif ($f['towns']) { $why[] = pst_check('q', i18n_t('lieu : {l} (sa fiche : {m})', ['l' => pst_town((string) $row['place']), 'm' => implode(', ', array_slice($f['towns'], 0, 2))])); }
    }
    if (!$main) { $score -= 10; $why[] = pst_check('q', i18n_t('cité(e) dans l’acte comme : {r}', ['r' => (string) ($row['role'] ?: $row['role_nl'])])); }
    return ['score' => max(0, min(100, $score)), 'why' => $why, 'tag' => $tag, 'main' => $main];
}

/** l'acte lu (ouc_oa_parse_record) : ses parents comparés à ceux de la fiche → [bonus, why[]] */
function pst_oa_parents(array $f, array $rec, string $pid): array
{
    $roles = ['father' => ['vader', 'père', 'pere', 'vader van de bruidegom', 'vader van de bruid', 'father'], 'mother' => ['moeder', 'mère', 'mere', 'moeder van de bruidegom', 'moeder van de bruid', 'mother']];
    $isBride = false;
    foreach ($rec['persons'] as $p) { if (preg_replace('/\D/', '', $p['pid']) === preg_replace('/\D/', '', $pid)) { $isBride = in_array(mb_strtolower($p['role_raw']), ['bruid', 'mariée', 'mariee'], true); } }
    $bonus = 0; $why = [];
    foreach (['father' => 'père', 'mother' => 'mère'] as $k => $word) {
        $mine = $f[$k] ?? [];
        if (!$mine || ($mine['first'] ?? '') === '') { continue; }
        foreach ($rec['persons'] as $p) {
            $r = mb_strtolower($p['role_raw']);
            if (!in_array($r, $roles[$k], true)) { continue; }
            if (str_contains($r, 'bruid')) { $forBride = str_ends_with($r, 'bruid'); if ($forBride !== $isBride) { continue; } }
            $a = pst_words($p['first'] ?: $p['name']); $b = pst_words($mine['first']);
            if (!$a) { continue; }
            if ($a[0] === ($b[0] ?? '')) { $bonus += 10; $why[] = pst_check('ok', i18n_t('même {w} : {n}', ['w' => i18n_t($word), 'n' => $p['name']])); }
            elseif (array_intersect($a, $b)) { $bonus += 5; $why[] = pst_check('q', i18n_t('{w} : {n} (sa fiche : {m})', ['w' => i18n_t($word), 'n' => $p['name'], 'm' => trim($mine['first'] . ' ' . $mine['last'])])); }
            else { $bonus -= 15; $why[] = pst_check('no', i18n_t('{w} : {n} (sa fiche : {m})', ['w' => i18n_t($word), 'n' => $p['name'], 'm' => trim($mine['first'] . ' ' . $mine['last'])])); }
            break;
        }
    }
    return [$bonus, $why];
}

/* ═════════════════════ les sources ═════════════════════ */

/** les pistes déjà décidées pour une fiche : src|clé → statut */
function pst_decided(PDO $pdo, int $pid): array
{
    $s = $pdo->prepare("SELECT src, rec_key, status FROM pistes WHERE person_id=? AND status<>'new'"); $s->execute([$pid]);
    $out = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { $out[$r['src'] . '|' . $r['rec_key']] = (string) $r['status']; }
    try { foreach (ouc_oa_marks($pdo, $pid) as $k => $m) { $out['oa|' . $k] ??= $m['verdict'] === 'added' ? 'added' : 'no'; } } catch (Throwable $_) {}
    return $out;
}
/** garde une piste (jamais une piste déjà décidée : « ✗ Pas lui » ne revient pas) ; renvoie vrai si elle est nouvelle */
function pst_save(PDO $pdo, int $pid, string $src, string $key, int $score, string $title, string $url, array $data): bool
{
    $s = $pdo->prepare('SELECT status FROM pistes WHERE person_id=? AND src=? AND rec_key=?'); $s->execute([$pid, $src, $key]);
    $old = $s->fetchColumn();
    if ($old !== false && $old !== 'new') { return false; }
    $pdo->prepare("INSERT INTO pistes(person_id, src, rec_key, score, title, url, data) VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(person_id, src, rec_key) DO UPDATE SET score=excluded.score, title=excluded.title, url=excluded.url, data=excluded.data WHERE pistes.status='new'")
        ->execute([$pid, $src, $key, $score, mb_substr($title, 0, 300), mb_substr($url, 0, 1000), json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
    return $old === false;
}

/** ⚰️ Décès INSEE : même nom, même premier prénom, né(e) à un an près ; le lieu et l'année du décès s'ajoutent à la note */
function pst_insee(PDO $pdo, array $f): array
{
    static $has = null;
    $has ??= (bool) $pdo->query("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='insee_deces'")->fetchColumn() && (bool) $pdo->query('SELECT 1 FROM insee_deces LIMIT 1')->fetchColumn();
    if (!$has || $f['birth'] === null || $f['estimated'] || $f['birth'] < 1860) { return []; }
    if ($f['death'] !== null && $f['death'] < 1970) { return []; }
    $nom = pst_key($f['last']); $mine = pst_words($f['first']);
    if ($nom === '' || !$mine) { return []; }
    $s = $pdo->prepare("SELECT * FROM insee_deces WHERE nom GLOB ? AND annee_naissance BETWEEN ? AND ? LIMIT 300");
    $s->execute([strtoupper(ascii_fold(trim($f['last']))) . '*', $f['birth'] - 1, $f['birth'] + 1]);
    $out = []; $seen = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
        if (pst_key((string) $r['nom']) !== $nom) { continue; }
        $theirs = pst_words((string) ($r['prenoms'] ?: $r['prenom']));
        if (!$theirs || !in_array($mine[0], $theirs, true)) { continue; }
        $sx = strtoupper((string) $r['sexe']); $sx = $sx === '1' ? 'M' : ($sx === '2' ? 'F' : $sx);
        if (in_array($sx, ['M', 'F'], true) && in_array($f['gender'], ['male', 'female'], true) && ($sx === 'F') !== ($f['gender'] === 'female')) { continue; }
        $dy = (int) $r['annee_deces'];
        if ($f['death'] !== null && $dy && abs($dy - $f['death']) > 1) { continue; }
        $key = 'i:' . substr(sha1($nom . '|' . pst_key((string) $r['prenoms']) . '|' . $r['date_naissance'] . '|' . $r['date_deces'] . '|' . $r['numero_acte_deces']), 0, 20);
        if (isset($seen[$key])) { continue; } $seen[$key] = true;
        $why = [pst_check('ok', i18n_t('même nom ({n})', ['n' => $f['last']])), $theirs[0] === $mine[0] ? pst_check('ok', i18n_t('même prénom ({p})', ['p' => ucfirst(strtolower($mine[0]))])) : pst_check('q', i18n_t('un de ses prénoms'))];
        $score = 30 + ($theirs[0] === $mine[0] ? 25 : 15);
        $ry = (int) $r['annee_naissance'];
        if ($ry === $f['birth']) { $score += 25; $why[] = pst_check('ok', i18n_t('né(e) la même année ({y})', ['y' => $ry])); } else { $score += 15; $why[] = pst_check('ok', i18n_t('né(e) à un an près ({y} ; sa fiche : {z})', ['y' => $ry, 'z' => $f['birth']])); }
        $bt = pst_key(pst_town($f['birth_place']));
        if ($bt !== '' && pst_key((string) $r['commune_naissance']) === $bt) { $score += 15; $why[] = pst_check('ok', i18n_t('même lieu de naissance ({l})', ['l' => (string) $r['commune_naissance']])); }
        elseif ($bt !== '' && trim((string) $r['commune_naissance']) !== '') { $score -= 10; $why[] = pst_check('q', i18n_t('né(e) à {l} (sa fiche : {m})', ['l' => (string) $r['commune_naissance'], 'm' => pst_town($f['birth_place'])])); }
        if ($f['death'] !== null && $dy) { $score += 5; $why[] = pst_check('ok', i18n_t('mort(e) la même année ({y})', ['y' => $dy])); }
        elseif ($dy) { $why[] = pst_check('q', i18n_t('mort(e) en {y} (sa fiche n’a pas de décès)', ['y' => $dy])); }
        $dd = (string) $r['date_deces'];
        $ddTxt = preg_match('/^(\d{4})-?(\d\d)-?(\d\d)$/', $dd, $m) ? ((int) $m[3] . '/' . $m[2] . '/' . $m[1]) : ($dy ? (string) $dy : $dd);
        $first = ucwords(strtolower(trim((string) ($r['prenoms'] ?: $r['prenom']))));
        $out[] = ['src' => 'insee', 'key' => $key, 'score' => min(100, $score), 'why' => $why,
            'title' => i18n_t('Décès — {p} {n}, {d}{l}', ['p' => $first, 'n' => (string) $r['nom'], 'd' => $ddTxt, 'l' => trim((string) $r['commune_deces']) !== '' ? ', ' . $r['commune_deces'] : '']),
            'url' => 'https://deces.matchid.io/search?q=' . rawurlencode(trim($first . ' ' . $r['nom'])) . ($ry ? '&birthDate=' . $ry : ''),
            'data' => ['insee_id' => (int) $r['id'], 'tag' => 'DEAT', 'date' => $ddTxt, 'year' => $dy, 'place' => (string) $r['commune_deces'], 'acte' => (string) $r['numero_acte_deces'],
                'born' => (string) $r['date_naissance'], 'born_place' => (string) $r['commune_naissance'], 'archive' => 'INSEE — Fichier des personnes décédées', 'licence' => 'Licence Ouverte 2.0',
                'source_url' => 'https://www.data.gouv.fr/fr/datasets/fichier-des-personnes-decedees/']];
    }
    return $out;
}

/** 🎖️ Morts pour la France / 🏅 Léonore (bases à installer : rien si elles ne le sont pas) */
function pst_bo(PDO $pdo, array $f, string $kind): array
{
    if (!function_exists('bo_matches')) { require_once __DIR__ . '/bases_officielles.php'; }
    try { $bf = bo_person_facts($pdo, $f['id']); $m = bo_matches($kind, $bf, 3); } catch (Throwable $_) { return []; }
    $out = [];
    foreach ($m as $r) {
        $why = array_map(static fn($w) => pst_check('ok', (string) $w), $r['why']);
        $title = ($kind === 'leonore' ? i18n_t('Légion d’honneur — ') : i18n_t('Mort pour la France — ')) . trim(mb_strtoupper($r['nom']) . ' ' . $r['prenoms']) . ($r['annee'] ? ' (' . $r['annee'] . ')' : '');
        $out[] = ['src' => $kind, 'key' => $r['key'], 'score' => min(98, 55 + 6 * (int) $r['score']), 'why' => $why, 'title' => $title, 'url' => $r['url'] !== '' ? $r['url'] : $r['home'],
            'data' => ['bo_id' => $r['id'], 'tag' => $kind === 'mpf' ? 'DEAT' : '', 'date' => $r['deces'], 'place' => $r['lieu_deces'], 'archive' => $r['source'] ?: ($kind === 'leonore' ? 'Archives nationales' : 'Mémoire des hommes'), 'licence' => $r['licence'], 'source_url' => $r['source_url'], 'cote' => $r['cote']]];
    }
    return $out;
}

/** 📇 Annuaires de Paris (pack à installer) */
function pst_annuaire(PDO $pdo, array $f): array
{
    if (!function_exists('ba_matches')) { require_once __DIR__ . '/brevets_annuaires.php'; }
    try { if (!ba_pdo()) { return []; } $bf = ba_person_facts($pdo, $f['id']); $m = ba_matches($bf, 2); } catch (Throwable $_) { return []; }
    $out = [];
    foreach ($m['groups'] ?? [] as $g) {
        $b = $g['best'];
        $why = array_map(static fn($w) => pst_check('ok', (string) $w), array_values(array_unique($g['why'])));
        $out[] = ['src' => 'annuaire', 'key' => $g['key'], 'score' => min(95, 50 + 5 * (int) $g['score']), 'why' => $why,
            'title' => i18n_t('Annuaire de Paris {y} — {e}', ['y' => $g['from'] === $g['to'] ? (string) $g['from'] : $g['from'] . '–' . $g['to'], 'e' => trim($b['name'] . ($b['act'] !== '' ? ', ' . $b['act'] : '') . ($b['address'] !== '' ? ', ' . $b['address'] : ''))]),
            'url' => (string) ($b['url'] ?? ''), 'data' => ['ba_id' => (int) $b['id'], 'tag' => 'RESI', 'date' => (string) $g['from'], 'place' => 'Paris', 'archive' => 'SoDUCo — annuaires (BnF Gallica)', 'licence' => 'Licence Ouverte 2.0']];
    }
    return $out;
}

/** 🇳🇱🇧🇪 la question posée à Open Archives pour une fiche (null : pas assez pour chercher) */
function pst_oa_query(array $f): ?array
{
    $clean = static fn(string $x) => trim(preg_replace('/\s+/u', ' ', preg_replace('/[&"*?~$%>()\-]+/u', ' ', $x) ?? '') ?? '');
    $last = $clean($f['last']); $first = $clean(trim(preg_split('/[\s,]+/', trim($f['first']))[0] ?? ''));
    if ($last === '' || $f['birth'] === null) { return null; }
    $y1 = max(1400, $f['birth'] - ($f['estimated'] ? 20 : 2)); $y2 = min((int) date('Y'), ($f['death'] ?? $f['birth'] + 95) + 2);
    $name = $first !== '' ? '"' . $first . ' ' . $last . '"' : '>' . str_replace(' ', ' >', $last);
    return ['name' => "$name $y1-$y2", 'lang' => 'fr', 'number_show' => 50, 'sort' => 4];
}
function pst_oa_title(array $row): string
{
    $type = OUC_OA_EVENT_FR[mb_strtolower((string) $row['type_nl'])] ?? ($row['type'] ?: i18n_t('Acte'));
    return trim($type . ' — ' . $row['name'] . ($row['role'] !== '' ? ' (' . $row['role'] . ')' : '') . ($row['year'] ? ', ' . $row['year'] : '') . ($row['place'] !== '' ? ', ' . $row['place'] : ''));
}

/* ═════════════════════ la recherche, pas à pas ═════════════════════ */

/** POST pistes_start : une nouvelle recherche (l'ancienne s'arrête) */
function pst_start(PDO $pdo, array $d): array
{
    pst_schema($pdo);
    $scope = (string) ($d['scope'] ?? 'all');
    $ids = pst_scope_ids($pdo, $scope);
    if (!$ids) { throw new LcndaBadInput(i18n_t('Aucune fiche dans ce choix.')); }
    $src = array_values(array_intersect(PA_SOURCES, array_map('strval', (array) ($d['sources'] ?? PA_SOURCES))));
    if (!$src) { throw new LcndaBadInput(i18n_t('Choisis au moins une source.')); }
    $job = pst_job_new($pdo, 'pistes', pst_scope_label($pdo, $scope), ['scope' => $scope, 'ids' => $ids, 'pos' => 0, 'sources' => $src, 'sub' => null,
        'counts' => ['done' => 0, 'found' => 0, 'private' => 0, 'net' => 0, 'cached' => 0, 'errors' => 0]]);
    return ['job' => pst_job_out($job)];
}

/** POST pistes_step {id} : avance la recherche (au plus ~2,5 s de travail et UNE requête réseau) */
function pst_step(PDO $pdo, array $d): array
{
    $job = pst_job_get($pdo, safe_int($d['id'] ?? 0), 'pistes');
    if (!$job) { throw new LcndaBadInput(i18n_t('Recherche introuvable.')); }
    if ($job['status'] !== 'running') { return ['job' => pst_job_out($job), 'wait_ms' => 0]; }
    $st = &$job['state'];
    $ids = $st['ids']; $n = count($ids);
    $deadline = microtime(true) + PA_STEP_SECONDS;
    $net = false; $wait = 0; $job['message'] = '';
    while ((int) $st['pos'] < $n && microtime(true) < $deadline) {
        $pid = (int) $ids[$st['pos']];
        if (($st['sub']['pid'] ?? 0) !== $pid) { $st['sub'] = ['pid' => $pid, 'phase' => 'local', 'todo' => []]; }
        $sub = &$st['sub'];
        $f = pst_facts($pdo, $pid);
        if (($why = pst_private_reason($f)) !== '') { $st['counts']['private'] += $why === 'introuvable' ? 0 : 1; $st['pos']++; $st['sub'] = null; $st['counts']['done']++; unset($sub); continue; }
        $decided = null;
        if ($sub['phase'] === 'local') {
            $decided = pst_decided($pdo, $pid);
            $found = [];
            if (in_array('insee', $st['sources'], true)) { $found = array_merge($found, pst_insee($pdo, $f)); }
            foreach (['mpf', 'leonore'] as $k) { if (in_array($k, $st['sources'], true)) { $found = array_merge($found, pst_bo($pdo, $f, $k)); } }
            if (in_array('annuaire', $st['sources'], true)) { $found = array_merge($found, pst_annuaire($pdo, $f)); }
            foreach ($found as $x) {
                if ($x['score'] < PA_MIN_SCORE || isset($decided[$x['src'] . '|' . $x['key']])) { continue; }
                if (pst_save($pdo, $pid, $x['src'], $x['key'], $x['score'], $x['title'], $x['url'], $x['data'] + ['why' => $x['why']])) { $st['counts']['found']++; }
            }
            $sub['phase'] = in_array('oa', $st['sources'], true) && pst_oa_query($f) ? 'oa_search' : 'done';
        }
        if ($sub['phase'] === 'oa_search') {
            if ($net) { unset($sub); break; }
            try { [$j, $cached] = ouc_oa_cached($pdo, 'records/search.json', pst_oa_query($f)); }
            catch (Throwable $e) {
                $msg = $e->getMessage();
                if (preg_match('/attends|moins vite|minute|429/i', $msg)) { $wait = 30000; $job['message'] = $msg; unset($sub); break; } // Open Archives demande d'aller moins vite : on attend, puis on reprend ici
                $st['counts']['errors']++;
                if ($st['counts']['errors'] >= 3 && $st['counts']['net'] === 0) { $job['status'] = 'paused'; $job['message'] = $msg; unset($sub); break; } // hors ligne : en pause, « Reprendre » plus tard
                $sub['phase'] = 'done'; $j = null; $cached = true;
            }
            if (!$cached) { $net = true; $st['counts']['net']++; } elseif ($j !== null) { $st['counts']['cached']++; }
            if ($j !== null) {
                $decided ??= pst_decided($pdo, $pid);
                $rows = [];
                foreach ((array) ($j['response']['docs'] ?? []) as $doc) {
                    if (!is_array($doc) || !($row = ouc_oa_row($doc))) { continue; }
                    if (isset($decided['oa|' . $row['key']])) { continue; }
                    $sc = pst_oa_score($f, $row);
                    if (!$sc || $sc['score'] < PA_MIN_SCORE - 10) { continue; }
                    $rows[$row['key']] ??= [$row, $sc];
                    if ($sc['score'] > $rows[$row['key']][1]['score']) { $rows[$row['key']] = [$row, $sc]; } // une personne citée deux fois dans le même acte : la meilleure lecture
                }
                uasort($rows, static fn($a, $b) => $b[1]['score'] <=> $a[1]['score']);
                $rows = array_slice($rows, 0, 6, true);
                $todo = [];
                foreach ($rows as $k => [$row, $sc]) {
                    if ($sc['score'] >= PA_MIN_SCORE) {
                        if (pst_save($pdo, $pid, 'oa', $k, $sc['score'], pst_oa_title($row), $row['url'], ['archive_code' => $row['archive_code'], 'identifier' => $row['identifier'], 'pid' => $row['pid'],
                            'tag' => $sc['tag'], 'main' => $sc['main'], 'date' => (string) ($row['year'] ?: ''), 'year' => $row['year'], 'place' => $row['place'], 'archive' => $row['archive'], 'role' => $row['role'], 'type' => $row['type'],
                            'source' => $row['source'], 'licence' => i18n_t('celle de l’archive (le plus souvent CC0 1.0)'), 'source_url' => 'https://www.openarchieven.nl/', 'why' => $sc['why']])) { $st['counts']['found']++; }
                    }
                    if (count($todo) < 2 && $sc['main'] && in_array($sc['tag'], ['BIRT', 'BAPM', 'MARR'], true) && (($f['father']['first'] ?? '') !== '' || ($f['mother']['first'] ?? '') !== '')) { $todo[] = [$k, $sc['score']]; }
                }
                $sub['todo'] = $todo;
                $sub['phase'] = $todo ? 'oa_show' : 'done';
            }
        }
        if ($sub['phase'] === 'oa_show') {
            while ($sub['todo']) {
                [$k, $base] = $sub['todo'][0];
                [$arch, $ident] = explode(':', $k, 2);
                $q = ['archive' => $arch, 'identifier' => $ident, 'lang' => 'fr'];
                if ($net) {
                    $chk = $pdo->prepare('SELECT 1 FROM ouc_oa_cache WHERE qkey=?'); $q2 = $q; ksort($q2); $chk->execute(['records/show.json?' . http_build_query($q2)]);
                    if (!$chk->fetchColumn()) { break 2; } // déjà une requête dans ce pas : la suivante au prochain
                }
                array_shift($sub['todo']);
                try { [$j, $cached] = ouc_oa_cached($pdo, 'records/show.json', $q); } catch (Throwable $_) { continue; }
                if (!$cached) { $net = true; $st['counts']['net']++; }
                $s = $pdo->prepare("SELECT id, score, data FROM pistes WHERE person_id=? AND src='oa' AND rec_key=?"); $s->execute([$pid, $k]);
                $row = $s->fetch(PDO::FETCH_ASSOC);
                $data = $row ? (json_decode((string) $row['data'], true) ?: []) : null;
                [$bonus, $why] = pst_oa_parents($f, ouc_oa_parse_record($j, $arch, $ident), (string) ($data['pid'] ?? ''));
                if (!$why) { continue; }
                $score = max(0, min(100, $base + $bonus));
                if ($row) {
                    $data['why'] = array_merge($data['why'] ?? [], $why); $data['parents_checked'] = true;
                    if ($score < PA_MIN_SCORE) { $pdo->prepare("DELETE FROM pistes WHERE id=? AND status='new'")->execute([(int) $row['id']]); $st['counts']['found'] = max(0, $st['counts']['found'] - 1); }
                    else { $pdo->prepare("UPDATE pistes SET score=?, data=? WHERE id=? AND status='new'")->execute([$score, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), (int) $row['id']]); }
                }
            }
            if (!$sub['todo']) { $sub['phase'] = 'done'; }
        }
        if ($sub['phase'] === 'done') { $st['pos']++; $st['sub'] = null; $st['counts']['done']++; }
        unset($sub);
    }
    if ((int) $st['pos'] >= $n && $job['status'] === 'running') { $job['status'] = 'done'; }
    unset($st);
    pst_job_save($pdo, $job);
    return ['job' => pst_job_out($job), 'wait_ms' => $job['status'] !== 'running' ? 0 : ($wait ?: ($net ? PA_NET_WAIT_MS : 0)), 'new' => pst_count($pdo)['new']];
}

function pst_set_status(PDO $pdo, array $d, string $to): array
{
    $job = pst_job_get($pdo, safe_int($d['id'] ?? 0), 'pistes');
    if (!$job) { throw new LcndaBadInput(i18n_t('Recherche introuvable.')); }
    if ($to === 'running' && !in_array($job['status'], ['paused', 'running'], true)) { throw new LcndaBadInput(i18n_t('Cette recherche est finie : relance-en une.')); }
    if ($to !== 'running' && $job['status'] === 'done') { return ['job' => pst_job_out($job)]; }
    $job['status'] = $to; $job['message'] = '';
    pst_job_save($pdo, $job);
    return ['job' => pst_job_out($job)];
}

/* ═════════════════════ la liste ═════════════════════ */

function pst_row_out(array $r): array
{
    $d = json_decode((string) $r['data'], true) ?: [];
    $years = trim(($r['by'] ?? '') . '–' . ($r['dy'] ?? ''), '–');
    return ['id' => (int) $r['id'], 'person_id' => (int) $r['person_id'], 'person' => trim(($r['first_name'] ?? '') . ' ' . mb_strtoupper((string) ($r['last_name'] ?? ''))), 'gender' => (string) ($r['gender'] ?? ''),
        'years' => $years, 'src' => (string) $r['src'], 'key' => (string) $r['rec_key'], 'score' => (int) $r['score'], 'title' => (string) $r['title'], 'url' => (string) $r['url'], 'status' => (string) $r['status'],
        'why' => $d['why'] ?? [], 'tag' => (string) ($d['tag'] ?? ''), 'main' => (bool) ($d['main'] ?? true), 'date' => (string) ($d['date'] ?? ''), 'place' => (string) ($d['place'] ?? ''), 'archive' => (string) ($d['archive'] ?? ''),
        'licence' => (string) ($d['licence'] ?? ''), 'source_url' => (string) ($d['source_url'] ?? ''), 'found' => (string) $r['found_at'], 'decided' => (string) $r['decided_at'], 'parents_checked' => !empty($d['parents_checked'])];
}

/** GET pistes_list */
function pst_list(PDO $pdo, array $q): array
{
    pst_schema($pdo);
    $where = []; $args = [];
    $status = (string) ($q['status'] ?? 'new');
    if (in_array($status, ['new', 'added', 'no'], true)) { $where[] = 'p.status=?'; $args[] = $status; }
    if (($pid = safe_int($q['person_id'] ?? 0)) > 0) { $where[] = 'p.person_id=?'; $args[] = $pid; }
    if (in_array($q['src'] ?? '', PA_SOURCES, true)) { $where[] = 'p.src=?'; $args[] = (string) $q['src']; }
    if (($min = safe_int($q['min'] ?? 0)) > 0) { $where[] = 'p.score>=?'; $args[] = $min; }
    $text = trim(safe_text($q['q'] ?? ''));
    if ($text !== '') { $where[] = "(p.title LIKE ? OR pe.last_name LIKE ? OR pe.first_name LIKE ?)"; array_push($args, "%$text%", "%$text%", "%$text%"); }
    $w = $where ? 'WHERE ' . implode(' AND ', $where) : '';
    $total = $pdo->prepare("SELECT count(*) FROM pistes p JOIN persons pe ON pe.id=p.person_id $w"); $total->execute($args);
    $limit = max(1, min(500, safe_int($q['limit'] ?? 100) ?: 100)); $offset = max(0, safe_int($q['offset'] ?? 0));
    $order = ($q['sort'] ?? '') === 'name' ? 'pe.last_name COLLATE NOCASE, pe.first_name COLLATE NOCASE, p.score DESC' : (($q['sort'] ?? '') === 'recent' ? 'p.id DESC' : 'p.score DESC, p.id');
    $s = $pdo->prepare("SELECT p.*, pe.first_name, pe.last_name, pe.gender,
        (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.person_id AND t.gedcom_tag IN ('BIRT','BAPM','CHR') AND e.year IS NOT NULL ORDER BY e.year LIMIT 1) AS by,
        (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.person_id AND t.gedcom_tag IN ('DEAT','BURI') AND e.year IS NOT NULL ORDER BY e.year LIMIT 1) AS dy
        FROM pistes p JOIN persons pe ON pe.id=p.person_id $w ORDER BY $order LIMIT $limit OFFSET $offset");
    $s->execute($args);
    return ['total' => (int) $total->fetchColumn(), 'rows' => array_map('pst_row_out', $s->fetchAll(PDO::FETCH_ASSOC)), 'counts' => pst_count($pdo)];
}
/** GET pistes_count : combien à vérifier (widget, bandeau) */
function pst_count(PDO $pdo): array
{
    pst_schema($pdo);
    $by = [];
    foreach ($pdo->query("SELECT src, count(*) n FROM pistes p JOIN persons pe ON pe.id=p.person_id WHERE p.status='new' GROUP BY src") as $r) { $by[$r['src']] = (int) $r['n']; }
    $people = (int) $pdo->query("SELECT count(DISTINCT person_id) FROM pistes p JOIN persons pe ON pe.id=p.person_id WHERE p.status='new'")->fetchColumn();
    $done = []; foreach ($pdo->query("SELECT status, count(*) n FROM pistes GROUP BY status") as $r) { $done[$r['status']] = (int) $r['n']; }
    return ['new' => array_sum($by), 'by_src' => $by, 'people' => $people, 'added' => $done['added'] ?? 0, 'no' => $done['no'] ?? 0];
}

/* ═════════════════════ ✓ Rattacher, ✗ Pas lui, ↶ ═════════════════════ */

function pst_row(PDO $pdo, int $id): array
{
    pst_schema($pdo);
    $s = $pdo->prepare('SELECT * FROM pistes WHERE id=?'); $s->execute([$id]);
    $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { throw new LcndaBadInput(i18n_t('Piste introuvable.')); }
    $r['data'] = json_decode((string) $r['data'], true) ?: [];
    return $r;
}

/** POST pistes_accept {id, mode} : la source (et au choix l'événement « à vérifier ») sur la fiche, par la fonction de chaque source */
function pst_accept(PDO $pdo, array $d): array
{
    $r = pst_row($pdo, safe_int($d['id'] ?? 0));
    if ($r['status'] === 'added') { throw new RuntimeException(i18n_t('Cette piste est déjà rattachée.')); }
    $pid = (int) $r['person_id']; $D = $r['data'];
    $mode = (string) ($d['mode'] ?? 'source') === 'event' ? 'event' : 'source';
    $undo = []; $notes = [];
    switch ($r['src']) {
        case 'oa':
            $res = ouc_oa_add($pdo, ['person_id' => $pid, 'archive' => $D['archive_code'] ?? '', 'identifier' => $D['identifier'] ?? '', 'pid' => $D['pid'] ?? '', 'mode' => $mode]);
            $undo = ['batch' => $res['batch']]; $notes = $res['notes'] ?? [];
            break;
        case 'mpf': case 'leonore':
            if (!function_exists('bo_add')) { require_once __DIR__ . '/bases_officielles.php'; }
            $res = bo_add($pdo, ['person_id' => $pid, 'kind' => $r['src'], 'id' => (int) ($D['bo_id'] ?? 0)]);
            $undo = ['source_id' => $res['source_id'], 'link_id' => $res['link_id']];
            break;
        case 'annuaire':
            if (!function_exists('ba_add')) { require_once __DIR__ . '/brevets_annuaires.php'; }
            $res = ba_add($pdo, ['person_id' => $pid, 'id' => (int) ($D['ba_id'] ?? 0)]);
            $undo = ['key' => $res['key']];
            break;
        case 'insee':
            $undo = pst_insee_add($pdo, $r, $mode); $notes = $undo['notes'] ?? [];
            break;
        default: throw new LcndaBadInput('Source inconnue.');
    }
    $pdo->prepare("UPDATE pistes SET status='added', undo=?, decided_at=CURRENT_TIMESTAMP WHERE id=?")->execute([json_encode($undo), (int) $r['id']]);
    return ['ok' => true, 'id' => (int) $r['id'], 'person_id' => $pid, 'notes' => $notes, 'title' => $r['title']];
}

/** ⚰️ Décès INSEE : une source (relue dans la table : rien de l'écran n'est recopié), et au choix le décès « à vérifier » */
function pst_insee_add(PDO $pdo, array $r, string $mode): array
{
    $pid = (int) $r['person_id'];
    if (!person_exists($pdo, $pid)) { throw new RuntimeException(i18n_t('Fiche introuvable.')); }
    assert_person_unlocked($pdo, $pid);
    $s = $pdo->prepare('SELECT * FROM insee_deces WHERE id=?'); $s->execute([(int) ($r['data']['insee_id'] ?? 0)]); $row = $s->fetch(PDO::FETCH_ASSOC);
    if (!$row) { throw new RuntimeException(i18n_t('Cette ligne du fichier INSEE n’est plus là (fichier retiré ?).')); }
    $f = pst_facts($pdo, $pid);
    $who = trim(($f['first'] ?? '') . ' ' . mb_strtoupper((string) ($f['last'] ?? '')));
    $D = $r['data'];
    $lines = [i18n_t('Trouvé dans le fichier des personnes décédées de l’INSEE avec « 🔎 Pistes » le {date}. À VÉRIFIER : est-ce bien {name} ?', ['date' => date('d/m/Y'), 'name' => $who]),
        trim($row['nom'] . ' ' . ($row['prenoms'] ?: $row['prenom'])) . ', ' . i18n_t('né(e) le {d} à {l}', ['d' => (string) $row['date_naissance'], 'l' => trim((string) $row['commune_naissance'] . ' ' . (string) $row['pays_naissance'])]),
        i18n_t('Décédé(e) le {d} à {l}, acte n° {n}', ['d' => (string) $D['date'], 'l' => (string) $row['commune_deces'], 'n' => (string) ($row['numero_acte_deces'] ?: '—')]),
        i18n_t('Données : INSEE, Fichier des personnes décédées — Licence Ouverte 2.0.')];
    $ids = ['sources' => [], 'source_links' => [], 'events' => []]; $notes = [];
    $own = !$pdo->inTransaction();
    if ($own) { $pdo->beginTransaction(); }
    try {
        $pdo->prepare('INSERT INTO sources(title, author, agency, publication, url, text) VALUES(?,?,?,?,?,?)')
            ->execute([mb_substr('INSEE — ' . $r['title'], 0, 240), '', 'INSEE', 'Fichier des personnes décédées (INSEE)', (string) $D['source_url'], implode("\n", $lines)]);
        $sid = (int) $pdo->lastInsertId(); $ids['sources'][] = $sid;
        $link = $pdo->prepare('INSERT INTO source_links(entity_type, entity_id, source_record_id, page, quality, note) VALUES(?,?,?,?,?,?)');
        $link->execute(['person', $pid, $sid, mb_substr((string) $row['numero_acte_deces'], 0, 120), '', i18n_t('À vérifier (fichier INSEE)')]); $ids['source_links'][] = (int) $pdo->lastInsertId();
        if ($mode === 'event') {
            $has = $pdo->prepare("SELECT count(*) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=? AND t.gedcom_tag='DEAT'"); $has->execute([$pid]);
            if ((int) $has->fetchColumn()) { $notes[] = i18n_t('sa fiche a déjà un décès : gardé tel quel, seule la source est ajoutée'); }
            else {
                $type = (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='DEAT' AND scope='person' ORDER BY id LIMIT 1")->fetchColumn();
                if ($type) {
                    $e = add_event($pdo, ['person_id' => $pid, 'event_type_id' => $type, 'date_text' => (string) $D['date'], 'place_name' => (string) $row['commune_deces'], 'country' => '',
                        'description' => i18n_t('D’après le fichier des décès de l’INSEE — à vérifier'), 'fact_confidence' => 'doubt', 'confidence_origin' => 'INSEE — Fichier des personnes décédées',
                        'research_note' => i18n_t('À vérifier : trouvé dans le fichier de l’INSEE, pas encore confronté à l’acte de décès.')]);
                    $eid = (int) ($e['id'] ?? 0);
                    if ($eid) { $ids['events'][] = $eid; $link->execute(['event', $eid, $sid, '', '', i18n_t('À vérifier (fichier INSEE)')]); $ids['source_links'][] = (int) $pdo->lastInsertId(); $notes[] = i18n_t('événement ajouté, marqué « doute »'); }
                }
            }
        }
        if (function_exists('log_change')) { log_change($pdo, 'person', $pid, 'update', 'Pistes : source INSEE ajoutée (à vérifier) — ' . $r['title']); }
        if ($own) { $pdo->commit(); }
    } catch (Throwable $e) { if ($own && $pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
    return ['ids' => $ids, 'notes' => $notes];
}

/** POST pistes_undo {id} : retire ce que « ✓ Rattacher » a ajouté ; la piste redevient « à vérifier » */
function pst_undo(PDO $pdo, array $d): array
{
    $r = pst_row($pdo, safe_int($d['id'] ?? 0));
    if ($r['status'] !== 'added') { throw new RuntimeException(i18n_t('Rien à annuler.')); }
    $u = json_decode((string) $r['undo'], true) ?: [];
    $pid = (int) $r['person_id'];
    switch ($r['src']) {
        case 'oa': ouc_oa_undo($pdo, ['batch' => $u['batch'] ?? '']); break;
        case 'mpf': case 'leonore': if (!function_exists('bo_undo')) { require_once __DIR__ . '/bases_officielles.php'; } bo_undo($pdo, ['person_id' => $pid, 'source_id' => $u['source_id'] ?? 0, 'link_id' => $u['link_id'] ?? 0]); break;
        case 'annuaire': if (!function_exists('ba_undo')) { require_once __DIR__ . '/brevets_annuaires.php'; } ba_undo($pdo, ['person_id' => $pid, 'key' => $u['key'] ?? '']); break;
        case 'insee':
            assert_person_unlocked($pdo, $pid);
            $ids = $u['ids'] ?? [];
            foreach (array_map('intval', $ids['source_links'] ?? []) as $id) { $pdo->prepare('DELETE FROM source_links WHERE id=?')->execute([$id]); }
            foreach (array_map('intval', $ids['events'] ?? []) as $id) { $pdo->prepare("DELETE FROM source_links WHERE entity_type='event' AND entity_id=?")->execute([$id]); $pdo->prepare('DELETE FROM events WHERE id=? AND person_id=?')->execute([$id, $pid]); }
            foreach (array_map('intval', $ids['sources'] ?? []) as $id) { $n = $pdo->prepare('SELECT count(*) FROM source_links WHERE source_record_id=?'); $n->execute([$id]); if (!(int) $n->fetchColumn()) { $pdo->prepare('DELETE FROM sources WHERE id=?')->execute([$id]); } }
            if (function_exists('log_change')) { log_change($pdo, 'person', $pid, 'update', 'Pistes : ajout INSEE annulé'); }
            break;
    }
    $pdo->prepare("UPDATE pistes SET status='new', undo='', decided_at='' WHERE id=?")->execute([(int) $r['id']]);
    return ['ok' => true, 'id' => (int) $r['id'], 'person_id' => $pid];
}

/** POST pistes_reject {id} : « ✗ Pas lui » (retenu : la piste ne revient pas, même à la prochaine recherche) */
function pst_reject(PDO $pdo, array $d): array
{
    $r = pst_row($pdo, safe_int($d['id'] ?? 0));
    if ($r['status'] === 'added') { throw new RuntimeException(i18n_t('Cette piste est rattachée à sa fiche : annule l’ajout d’abord.')); }
    $pdo->prepare("UPDATE pistes SET status='no', decided_at=CURRENT_TIMESTAMP WHERE id=?")->execute([(int) $r['id']]);
    try {
        if ($r['src'] === 'oa') { ouc_oa_mark($pdo, ['person_id' => $r['person_id'], 'key' => $r['rec_key'], 'verdict' => 'no']); }
        if ($r['src'] === 'annuaire') { if (!function_exists('ba_mark')) { require_once __DIR__ . '/brevets_annuaires.php'; } ba_mark($pdo, ['person_id' => $r['person_id'], 'key' => $r['rec_key'], 'verdict' => 'no']); }
    } catch (Throwable $_) {} // la même décision côté « Où chercher » / annuaires : un plus, pas une obligation
    return ['ok' => true, 'id' => (int) $r['id'], 'prev' => (string) $r['status']];
}
/** POST pistes_unreject {id} : ↶ après « ✗ Pas lui » */
function pst_unreject(PDO $pdo, array $d): array
{
    $r = pst_row($pdo, safe_int($d['id'] ?? 0));
    if ($r['status'] !== 'no') { return ['ok' => true, 'id' => (int) $r['id']]; }
    $pdo->prepare("UPDATE pistes SET status='new', decided_at='' WHERE id=?")->execute([(int) $r['id']]);
    try {
        if ($r['src'] === 'oa') { ouc_oa_mark($pdo, ['person_id' => $r['person_id'], 'key' => $r['rec_key'], 'verdict' => '']); }
        if ($r['src'] === 'annuaire') { if (!function_exists('ba_mark')) { require_once __DIR__ . '/brevets_annuaires.php'; } ba_mark($pdo, ['person_id' => $r['person_id'], 'key' => $r['rec_key'], 'verdict' => '']); }
    } catch (Throwable $_) {}
    return ['ok' => true, 'id' => (int) $r['id']];
}

/* ═════════════════════ à propos, aiguillage ═════════════════════ */

function pst_about(PDO $pdo): array
{
    $insee = false; try { $insee = (bool) $pdo->query('SELECT 1 FROM insee_deces LIMIT 1')->fetchColumn(); } catch (Throwable $_) {}
    $bo = ['mpf' => false, 'leonore' => false];
    try { if (!function_exists('bo_pdo')) { require_once __DIR__ . '/bases_officielles.php'; } $bo = ['mpf' => (bool) bo_pdo('mpf'), 'leonore' => (bool) bo_pdo('leonore')]; } catch (Throwable $_) {}
    $ba = false; try { if (!function_exists('ba_pdo')) { require_once __DIR__ . '/brevets_annuaires.php'; } $ba = (bool) ba_pdo(); } catch (Throwable $_) {}
    $branches = [];
    try { $branches = $pdo->query('SELECT b.id, b.name, (SELECT count(*) FROM branch_people bp WHERE bp.branch_id=b.id) AS n FROM branches b ORDER BY b.name COLLATE NOCASE')->fetchAll(PDO::FETCH_ASSOC); } catch (Throwable $_) {}
    return ['sources' => [
        ['id' => 'oa', 'icon' => '🇳🇱', 'label' => 'Open Archives', 'online' => true, 'installed' => true, 'what' => i18n_t('Actes indexés des Pays-Bas, de Belgique, d’une partie de l’Allemagne, du Suriname et de l’Indonésie (et quelques autres)'),
            'licence' => i18n_t('celle de chaque archive (le plus souvent CC0 1.0, parfois CC BY-SA 4.0)'), 'url' => 'https://www.openarchieven.nl/', 'terms_url' => 'https://www.openarchieven.nl/api/docs/',
            'rules' => i18n_t('Lu le 25/11/2026 : au plus 4 requêtes par seconde, un nom de programme reconnaissable, citer l’archive. L’app : une requête toutes les 2 secondes au plus, réponses gardées 30 jours.')],
        ['id' => 'insee', 'icon' => '⚰️', 'label' => i18n_t('Décès INSEE'), 'online' => false, 'installed' => $insee, 'what' => i18n_t('Décès en France depuis 1970'), 'licence' => 'Licence Ouverte 2.0', 'url' => 'https://www.data.gouv.fr/fr/datasets/fichier-des-personnes-decedees/'],
        ['id' => 'mpf', 'icon' => '🎖️', 'label' => i18n_t('Morts pour la France 1914–1918'), 'online' => false, 'installed' => $bo['mpf'], 'what' => i18n_t('Fiches de Mémoire des hommes'), 'licence' => i18n_t('voir Réglages → Bases officielles'), 'url' => 'https://www.memoiredeshommes.sga.defense.gouv.fr/'],
        ['id' => 'leonore', 'icon' => '🏅', 'label' => i18n_t('Légion d’honneur (Léonore)'), 'online' => false, 'installed' => $bo['leonore'], 'what' => i18n_t('Dossiers des décorés'), 'licence' => i18n_t('voir Réglages → Bases officielles'), 'url' => 'https://www.leonore.archives-nationales.culture.gouv.fr/'],
        ['id' => 'annuaire', 'icon' => '📇', 'label' => i18n_t('Annuaires de Paris'), 'online' => false, 'installed' => $ba, 'what' => i18n_t('Annuaires du commerce 1798–1914'), 'licence' => 'Licence Ouverte 2.0', 'url' => 'https://nakala.fr/10.34847/nkl.98eem49t']],
        'branches' => $branches, 'job' => pst_job_out(pst_job_last($pdo, 'pistes')), 'counts' => pst_count($pdo)];
}

function pst_api_get(PDO $pdo, string $action, array $q): array
{
    pst_schema($pdo);
    return match ($action) {
        'pistes_list' => pst_list($pdo, $q),
        'pistes_count' => pst_count($pdo) + ['job' => pst_job_out(pst_job_last($pdo, 'pistes'))],
        'pistes_job' => ['job' => pst_job_out(pst_job_last($pdo, 'pistes'))],
        'pistes_about' => pst_about($pdo),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
function pst_api_post(PDO $pdo, string $action, array $d): array
{
    pst_schema($pdo);
    return match ($action) {
        'pistes_start' => pst_start($pdo, $d),
        'pistes_step' => pst_step($pdo, $d),
        'pistes_pause' => pst_set_status($pdo, $d, 'paused'),
        'pistes_resume' => pst_set_status($pdo, $d, 'running'),
        'pistes_stop' => pst_set_status($pdo, $d, 'stopped'),
        'pistes_accept' => pst_accept($pdo, $d),
        'pistes_undo' => pst_undo($pdo, $d),
        'pistes_reject' => pst_reject($pdo, $d),
        'pistes_unreject' => pst_unreject($pdo, $d),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
