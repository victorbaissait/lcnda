<?php
declare(strict_types=1);

/**
 * ⚖️ Dossiers de succession : rangement, filtre, rattachement, tableau de bord (maquette docs/design/successoral-dossiers.html).
 * Écrans : assets/js/heritage-successoral-dossiers.js ; le calcul de l'avancement : heritage-successoral-core.js (progress).
 *
 *  1. Où ranger les dossiers : dans cette généalogie, dans une généalogie à part pour tous les dossiers, ou une par dossier
 *     (« 🌳 Mes généalogies », lib/paths.php). Le choix et les réglages du mode successoral sont communs à toutes les
 *     généalogies : SHARED_DATA_DIR/successoral.json. « ⇄ Déplacer un dossier » copie le dossier et ses fiches dans l'autre
 *     généalogie (sauvegarde des deux avant), puis le retire d'ici ; une fiche aussi rattachée à un autre dossier ou à la
 *     famille est copiée, pas retirée (ou le déplacement est refusé, au choix).
 *  1d. La vue d'ensemble lit à la volée, en lecture seule, un petit résumé de succ_cases dans chaque généalogie (n°, titre,
 *     état, notaire, échéance, avancement gardé) : rien n'est recopié ; jamais les héritiers vivants ni leurs adresses.
 *  2. Le filtre ⚖️ : les lectures de Personnes, de la recherche, des listes et de la carte reçoivent « succ_cases » et ne
 *     voient que les fiches rattachées (tables temporaires du même nom, le temps de la requête) ; l'arbre les grise.
 *  3. Le rattachement (succ_case_persons) : défunt à l'ouverture, héritiers et intermédiaires d'après le calcul (jamais
 *     remis tout seul après un retrait à la main), à la main avec un rôle, d'office pour une fiche créée pendant le filtre.
 *  5. Garde-fous : fusion de fiches de dossiers différents (journal des deux), homonymes d'un autre dossier (jamais reliés
 *     seuls, « Pas la même » retenu), archive d'un dossier clos dans un fichier .lcnda-succ.zip, retrait, réimport.
 * Confidentialité : rien en mode consultation ; aucun export (GEDCOM, site, partage famille) ne lit ces tables.
 * Tables (migration 91) : succ_case_persons, succ_homonym_no ; colonnes succ_cases.progress, progress_json.
 * Migration 92 : succ_case_persons.contact_state ('' | 'introuvable' | 'silence') et contact_state_at : l'héritier qu'on ne
 * trouve pas ou qui ne répond pas (onglet 👥 Héritiers, « Héritiers à contacter », fiche ⋯ → « ⚖️ Dossiers… », badge).
 * Réglage « private_heirs » : les fiches confidentielles comptent-elles comme héritiers (oui par défaut ; non = retirées du
 * calcul, avec un avertissement dans 👥 Héritiers).
 */

const SUCC_ROLES = ['deceased', 'heir', 'inter', 'witness', 'verify'];
const SUCC_HOWS = ['open', 'calc', 'hand', 'filter', 'import', 'homonym', 'move'];
const SUCC_ROLE_LABELS = ['deceased' => 'défunt', 'heir' => 'héritier', 'inter' => 'intermédiaire', 'witness' => 'témoin', 'verify' => 'à vérifier'];
const SUCC_SETTINGS_DEFAULT = ['store' => '', 'apart_id' => '', 'outside' => 'grey', 'archive_addresses' => 'remove', 'refuse_done' => true,
    'weights' => [10, 15, 20, 10, 15, 20, 10], 'move_shared' => 'copy', 'nodossier' => 'fold', 'private_heirs' => true];
const SUCC_CONTACT_STATES = ['', 'introuvable', 'silence'];
const SUCC_CONTACT_LABELS = ['' => 'rien de noté', 'introuvable' => 'introuvable', 'silence' => 'ne répond pas'];
const SUCC_ARCHIVE_EXT = '.lcnda-succ.zip';

function succ_dossiers_schema(PDO $pdo): void
{
    if (!function_exists('successoral_schema')) { require_once __DIR__ . '/successoral.php'; }
    successoral_schema($pdo);
    $pdo->exec("CREATE TABLE IF NOT EXISTS succ_case_persons (id INTEGER PRIMARY KEY AUTOINCREMENT, case_id INTEGER NOT NULL, person_id INTEGER NOT NULL,
        role TEXT NOT NULL DEFAULT 'verify', how TEXT NOT NULL DEFAULT 'hand', removed_by TEXT NOT NULL DEFAULT '', deleted_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(case_id, person_id))");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_succ_cp_person ON succ_case_persons(person_id)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS succ_homonym_no (a INTEGER NOT NULL, b INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(a, b))');
    $has = static fn(string $c): bool => (bool) $pdo->query("SELECT 1 FROM pragma_table_info('succ_cases') WHERE name=" . $pdo->quote($c))->fetchColumn();
    if (!$has('progress')) { $pdo->exec('ALTER TABLE succ_cases ADD COLUMN progress INTEGER'); }
    if (!$has('progress_json')) { $pdo->exec("ALTER TABLE succ_cases ADD COLUMN progress_json TEXT NOT NULL DEFAULT ''"); }
    // les dossiers déjà ouverts : leur défunt est rattaché
    $pdo->exec("INSERT OR IGNORE INTO succ_case_persons(case_id, person_id, role, how) SELECT id, deceased_id, 'deceased', 'open' FROM succ_cases WHERE deceased_id IS NOT NULL AND deleted_at IS NULL");
}

function succ_dossiers_ready(PDO $pdo): bool
{
    static $ok = [];
    $k = spl_object_id($pdo);
    if (!empty($ok[$k])) { return true; }
    try {
        $n = (int) $pdo->query("SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('succ_case_persons','succ_homonym_no')")->fetchColumn();
        $c = (bool) $pdo->query("SELECT 1 FROM pragma_table_info('succ_cases') WHERE name='progress_json'")->fetchColumn();
        $cs = $n === 2 && (bool) $pdo->query("SELECT 1 FROM pragma_table_info('succ_case_persons') WHERE name='contact_state_at'")->fetchColumn();
    } catch (Throwable $_) { return false; }
    return $ok[$k] = $n === 2 && $c && $cs;
}
function succ_dossiers_ensure(PDO $pdo): void { if (!succ_dossiers_ready($pdo)) { succ_dossiers_schema($pdo); succ_contact_schema($pdo); } }
/** migration 92 : l'état de contact d'un héritier dans un dossier (introuvable, ne répond pas) et sa date */
function succ_contact_schema(PDO $pdo): void
{
    $t = (bool) $pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='succ_case_persons'")->fetchColumn();
    if (!$t) { succ_dossiers_schema($pdo); }
    $has = static fn(string $c): bool => (bool) $pdo->query("SELECT 1 FROM pragma_table_info('succ_case_persons') WHERE name=" . $pdo->quote($c))->fetchColumn();
    if (!$has('contact_state')) { $pdo->exec("ALTER TABLE succ_case_persons ADD COLUMN contact_state TEXT NOT NULL DEFAULT ''"); }
    if (!$has('contact_state_at')) { $pdo->exec('ALTER TABLE succ_case_persons ADD COLUMN contact_state_at TEXT'); }
}

/* ═════════ Réglages du mode successoral (communs à toutes les généalogies) ═════════ */
function succ_settings_path(): string { return SHARED_DATA_DIR . '/successoral.json'; }
function succ_settings(): array
{
    $raw = is_file(succ_settings_path()) ? json_decode((string) @file_get_contents(succ_settings_path()), true) : null;
    return succ_settings_clean(is_array($raw) ? $raw : []);
}
function succ_settings_clean(array $d, ?array $base = null): array
{
    $s = $base ?? SUCC_SETTINGS_DEFAULT;
    if (array_key_exists('store', $d) && in_array($d['store'], ['', 'here', 'apart', 'each'], true)) { $s['store'] = (string) $d['store']; }
    if (array_key_exists('apart_id', $d)) { $v = (string) $d['apart_id']; $s['apart_id'] = $v === '' || genealogy_id_ok($v) ? $v : ''; }
    if (array_key_exists('outside', $d) && in_array($d['outside'], ['grey', 'hide'], true)) { $s['outside'] = (string) $d['outside']; }
    if (array_key_exists('archive_addresses', $d) && in_array($d['archive_addresses'], ['keep', 'remove'], true)) { $s['archive_addresses'] = (string) $d['archive_addresses']; }
    if (array_key_exists('refuse_done', $d)) { $s['refuse_done'] = (bool) $d['refuse_done']; }
    if (array_key_exists('private_heirs', $d)) { $s['private_heirs'] = (bool) $d['private_heirs']; }
    if (array_key_exists('move_shared', $d) && in_array($d['move_shared'], ['copy', 'refuse'], true)) { $s['move_shared'] = (string) $d['move_shared']; }
    if (array_key_exists('nodossier', $d) && in_array($d['nodossier'], ['fold', 'hide'], true)) { $s['nodossier'] = (string) $d['nodossier']; }
    if (array_key_exists('weights', $d) && is_array($d['weights']) && count($d['weights']) === 7) {
        $w = array_map(static fn($x) => max(0, min(100, (int) $x)), array_values($d['weights']));
        if (array_sum($w) > 0) { $s['weights'] = $w; }
    }
    return $s;
}
function succ_settings_save(array $d): array
{
    $prev = succ_settings();
    $next = succ_settings_clean($d, $prev);
    $json = json_encode($next, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    $file = succ_settings_path();
    if ($json === false || @file_put_contents($file . '.tmp', $json, LOCK_EX) === false || !@rename($file . '.tmp', $file)) { throw new RuntimeException('Impossible d’enregistrer les réglages des dossiers.'); }
    return ['settings' => $next, 'prev' => $prev];
}

/* ═════════ Les généalogies et leurs bases ═════════ */
function succ_gid(): string { return GENEALOGY_ID; }
function succ_genealogies(): array
{
    $out = [];
    foreach (genealogies_list_data()['genealogies'] as $g) {
        $id = (string) $g['id'];
        $out[$id] = ['id' => $id, 'name' => (string) $g['name'], 'main' => !empty($g['main']), 'active' => !empty($g['active']), 'size' => (int) ($g['size'] ?? 0), 'example' => !empty($g['example']),
            'path' => function_exists('premier_genealogy_db_path') ? premier_genealogy_db_path($id) : ($id === '' ? SHARED_DATA_DIR . '/genealogy.sqlite' : genealogy_dir($id) . '/genealogy.sqlite')];
    }
    return $out;
}
/** une autre base, en lecture seule (aucune écriture, aucune migration) */
function succ_open_ro(string $path): ?PDO
{
    if (!is_file($path)) { return null; }
    $pdo = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::SQLITE_ATTR_OPEN_FLAGS => PDO::SQLITE_OPEN_READONLY]);
    $pdo->exec('PRAGMA busy_timeout = 5000');
    return $pdo;
}
/** une autre base, pour y écrire (créée et mise à jour si besoin) */
function succ_open_rw(string $id, bool $create = false): PDO
{
    $gs = succ_genealogies();
    if (!isset($gs[$id])) { throw new RuntimeException('Généalogie introuvable.'); }
    $path = $gs[$id]['path'];
    if (!is_file($path)) {
        if (!$create) { throw new RuntimeException('Cette généalogie est encore vide.'); }
        $dir = dirname($path);
        if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) { throw new RuntimeException('Impossible de créer le dossier de la généalogie.'); }
        $schema = is_file(APP_ROOT . '/data/schema.sql') ? (string) file_get_contents(APP_ROOT . '/data/schema.sql') : default_schema_sql();
        $init = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $init->exec('PRAGMA foreign_keys = OFF'); $init->exec($schema); $init = null;
    }
    $pdo = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    $pdo->exec('PRAGMA foreign_keys = ON');
    $pdo->exec('PRAGMA busy_timeout = 30000');
    if (function_exists('register_search_fold')) { register_search_fold($pdo); }
    if (function_exists('migrate_database')) { migrate_database($pdo, $path); }
    succ_dossiers_ensure($pdo);
    return $pdo;
}
/** une copie de sauvegarde (jamais effacée par la rotation) avant de déplacer ou de retirer */
function succ_backup(PDO $pdo, string $dir, string $why): string
{
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) { throw new RuntimeException('Impossible de créer le dossier de sauvegarde.'); }
    $name = 'genealogie-backup-' . date('Ymd-His') . '-' . bin2hex(random_bytes(2)) . '-avant-' . $why . '.db';
    $pdo->exec('VACUUM main INTO ' . $pdo->quote($dir . '/' . $name));
    return $name;
}
function succ_dir_of(string $id): string { return $id === '' ? SHARED_DATA_DIR : genealogy_dir($id); }
function succ_media_dir_of(string $id): string { return $id === '' ? SHARED_MEDIA_DIR : genealogy_dir($id) . '/media'; }

/* ═════════ 1d. La vue d'ensemble : un résumé lu dans chaque base ═════════ */
/** seulement succ_cases (et la prochaine échéance) : jamais un héritier vivant ni une adresse */
function succ_index_rows(PDO $pdo): array
{
    if (!(int) $pdo->query("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='succ_cases'")->fetchColumn()) { return []; }
    $hasProg = (bool) $pdo->query("SELECT 1 FROM pragma_table_info('succ_cases') WHERE name='progress_json'")->fetchColumn();
    $rows = $pdo->query("SELECT c.id, c.number, c.title, c.state, c.notary_text, c.notary_person_id, c.deceased_id, c.opened_at, c.updated_at, c.snapshot_json" . ($hasProg ? ', c.progress, c.progress_json' : ", NULL AS progress, '' AS progress_json") . ",
        (SELECT MIN(due) FROM succ_deadlines d WHERE d.case_id=c.id AND d.deleted_at IS NULL AND d.done=0) AS next_due,
        (SELECT COUNT(*) FROM succ_deadlines d WHERE d.case_id=c.id AND d.deleted_at IS NULL AND d.done=0 AND d.due<date('now','localtime')) AS late
        FROM succ_cases c WHERE c.deleted_at IS NULL ORDER BY c.number")->fetchAll(PDO::FETCH_ASSOC);
    $name = static function (PDO $pdo, int $id): string {
        if ($id <= 0) { return ''; }
        $s = $pdo->prepare('SELECT first_name, last_name FROM persons WHERE id=?'); $s->execute([$id]); $r = $s->fetch(PDO::FETCH_ASSOC);
        return $r ? succ_name($r) : '';
    };
    $out = [];
    foreach ($rows as $r) {
        $snap = json_decode((string) $r['snapshot_json'], true);
        $prog = json_decode((string) $r['progress_json'], true);
        $did = (int) $r['deceased_id'];
        $out[] = ['id' => (int) $r['id'], 'number' => (string) $r['number'], 'title' => (string) $r['title'], 'state' => (string) $r['state'],
            'deceased' => $name($pdo, $did), 'notary' => (int) $r['notary_person_id'] ? $name($pdo, (int) $r['notary_person_id']) : (string) $r['notary_text'],
            'next_due' => (string) ($r['next_due'] ?? ''), 'late' => (int) $r['late'], 'opened_at' => (string) $r['opened_at'], 'updated_at' => (string) $r['updated_at'],
            'heirs' => is_array($snap['shares'] ?? null) ? count($snap['shares']) : 0, 'unknown' => is_array($snap['unknown'] ?? null) ? count($snap['unknown']) : 0,
            'progress' => $r['progress'] === null ? null : (int) $r['progress'], 'steps' => is_array($prog['steps'] ?? null) ? $prog['steps'] : null,
            'pieces' => is_array($prog['pieces'] ?? null) ? $prog['pieces'] : null, 'found' => is_array($prog['heirs'] ?? null) ? $prog['heirs'] : null,
            'minutes' => (int) ($pdo->query('SELECT COALESCE(SUM(minutes),0) FROM succ_fees WHERE case_id=' . (int) $r['id'] . " AND kind='time' AND deleted_at IS NULL")->fetchColumn())];
    }
    return $out;
}
function succ_index(PDO $pdo): array
{
    $bases = [];
    foreach (succ_genealogies() as $id => $g) {
        $b = ['id' => $id, 'name' => $g['name'], 'main' => $g['main'], 'active' => $g['active'], 'cases' => [], 'error' => false];
        try {
            if ($g['active']) { $b['cases'] = succ_index_rows($pdo); }
            elseif ($ro = succ_open_ro($g['path'])) { $b['cases'] = succ_index_rows($ro); $ro = null; }
        } catch (Throwable $_) { $b['error'] = true; }
        $bases[] = $b;
    }
    return ['bases' => $bases, 'current' => succ_gid(), 'settings' => succ_settings()];
}

/* ═════════ 3. Le rattachement des personnes ═════════ */
function succ_cp_row(PDO $pdo, int $caseId, int $pid): ?array
{
    $s = $pdo->prepare('SELECT * FROM succ_case_persons WHERE case_id=? AND person_id=?'); $s->execute([$caseId, $pid]);
    return $s->fetch(PDO::FETCH_ASSOC) ?: null;
}
/** rattacher (ou changer le rôle) ; renvoie l'état d'avant pour « ↶ Annuler » */
function succ_attach(PDO $pdo, int $caseId, int $pid, string $role, string $how = 'hand', bool $force = true): array
{
    if (!in_array($role, SUCC_ROLES, true)) { throw new LcndaBadInput('Rôle inconnu.'); }
    if (!in_array($how, SUCC_HOWS, true)) { $how = 'hand'; }
    $old = succ_cp_row($pdo, $caseId, $pid);
    if ($old && $old['deleted_at'] !== null && !$force) { return ['prev' => $old, 'skipped' => true]; } // retiré à la main : jamais remis tout seul
    if ($old) { $pdo->prepare("UPDATE succ_case_persons SET role=?, how=?, deleted_at=NULL, removed_by='', updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([$role, $how, (int) $old['id']]); }
    else { $pdo->prepare('INSERT INTO succ_case_persons(case_id, person_id, role, how) VALUES(?,?,?,?)')->execute([$caseId, $pid, $role, $how]); }
    return ['prev' => $old];
}
function succ_detach(PDO $pdo, int $caseId, int $pid, string $by = 'hand'): array
{
    $old = succ_cp_row($pdo, $caseId, $pid);
    if (!$old || $old['deleted_at'] !== null) { return ['prev' => $old]; }
    $pdo->prepare('UPDATE succ_case_persons SET deleted_at=CURRENT_TIMESTAMP, removed_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$by, (int) $old['id']]);
    return ['prev' => $old];
}
/** remettre une ligne comme avant (↶ Annuler) */
function succ_cp_restore(PDO $pdo, int $caseId, int $pid, $prev): void
{
    if (!is_array($prev)) { $pdo->prepare('DELETE FROM succ_case_persons WHERE case_id=? AND person_id=?')->execute([$caseId, $pid]); return; }
    $role = in_array($prev['role'] ?? '', SUCC_ROLES, true) ? (string) $prev['role'] : 'verify';
    $how = in_array($prev['how'] ?? '', SUCC_HOWS, true) ? (string) $prev['how'] : 'hand';
    $del = isset($prev['deleted_at']) && $prev['deleted_at'] !== null && $prev['deleted_at'] !== '' ? (string) $prev['deleted_at'] : null;
    $by = in_array($prev['removed_by'] ?? '', ['', 'hand', 'calc'], true) ? (string) $prev['removed_by'] : '';
    $pdo->prepare('INSERT INTO succ_case_persons(case_id, person_id, role, how, deleted_at, removed_by) VALUES(?,?,?,?,?,?) ON CONFLICT(case_id, person_id) DO UPDATE SET role=excluded.role, how=excluded.how, deleted_at=excluded.deleted_at, removed_by=excluded.removed_by, updated_at=CURRENT_TIMESTAMP')
        ->execute([$caseId, $pid, $role, $how, $del, $by]);
}
/**
 * 🔎 Introuvable / 🔇 ne répond pas : l'état de contact d'un héritier dans un dossier, avec sa date ; une ligne au journal.
 * ↶ Annuler renvoie l'état d'avant avec sa date (« at »). Une fiche pas encore rattachée l'est (héritier, par le calcul).
 */
function succ_contact_set(PDO $pdo, array $d): array
{
    $c = succ_row($pdo, safe_int($d['case_id'] ?? 0)); $caseId = (int) $c['id'];
    $pid = safe_int($d['person_id'] ?? 0); if (!succ_person_ok($pdo, $pid)) { throw new LcndaBadInput('Fiche introuvable.'); }
    if ($pid === (int) $c['deceased_id']) { throw new LcndaBadInput('Le défunt n’est pas un héritier à contacter.'); }
    $st = is_scalar($d['state'] ?? null) ? (string) $d['state'] : '';
    if (!in_array($st, SUCC_CONTACT_STATES, true)) { throw new LcndaBadInput('Valeur inconnue.'); }
    $at = is_scalar($d['at'] ?? null) ? (string) $d['at'] : '';
    $at = $st === '' ? null : (preg_match('/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/', $at) ? $at : date('Y-m-d H:i:s'));
    $old = succ_cp_row($pdo, $caseId, $pid);
    $prev = ['state' => $old ? (string) ($old['contact_state'] ?? '') : '', 'at' => $old ? (string) ($old['contact_state_at'] ?? '') : ''];
    if ($old) { $pdo->prepare('UPDATE succ_case_persons SET contact_state=?, contact_state_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$st, $at, (int) $old['id']]); }
    else { $pdo->prepare("INSERT INTO succ_case_persons(case_id, person_id, role, how, contact_state, contact_state_at) VALUES(?,?,'heir','calc',?,?)")->execute([$caseId, $pid, $st, $at]); }
    if ($prev['state'] !== $st) { succ_journal($pdo, $caseId, 'edit', 'Contact : ' . succ_person_name($pdo, $pid) . ' — ' . SUCC_CONTACT_LABELS[$st] . (!empty($d['undo']) ? ' (annulé)' : '')); }
    return ['case_id' => $caseId, 'person_id' => $pid, 'state' => $st, 'at' => (string) $at, 'prev' => $prev];
}
/** les états de contact d'un dossier : {person_id: {state, at}} (seulement ceux qui ont un état) */
function succ_contacts_of(PDO $pdo, int $caseId): array
{
    $out = [];
    try {
        $s = $pdo->prepare("SELECT person_id, contact_state, contact_state_at FROM succ_case_persons WHERE case_id=? AND contact_state<>''"); $s->execute([$caseId]);
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { $out[(string) $r['person_id']] = ['state' => (string) $r['contact_state'], 'at' => (string) $r['contact_state_at']]; }
    } catch (Throwable $_) {}
    return $out;
}
/** le calcul de la dévolution : héritiers et intermédiaires ; une fiche retirée à la main n'est jamais remise toute seule */
function succ_sync_calc(PDO $pdo, int $caseId, array $heirs, array $inter): array
{
    $c = succ_row($pdo, $caseId);
    $want = [];
    foreach (array_slice($heirs, 0, 3000) as $id) { $id = (int) $id; if ($id > 0) { $want[$id] = 'heir'; } }
    foreach (array_slice($inter, 0, 3000) as $id) { $id = (int) $id; if ($id > 0 && !isset($want[$id])) { $want[$id] = 'inter'; } }
    unset($want[(int) $c['deceased_id']]);
    if ($want) {
        $in = implode(',', array_keys($want));
        $ok = array_map('intval', $pdo->query("SELECT id FROM persons WHERE id IN ($in)")->fetchAll(PDO::FETCH_COLUMN));
        $want = array_intersect_key($want, array_flip($ok));
    }
    $rows = [];
    $s = $pdo->prepare('SELECT * FROM succ_case_persons WHERE case_id=?'); $s->execute([$caseId]);
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { $rows[(int) $r['person_id']] = $r; }
    $added = 0; $removed = 0; $changed = 0;
    foreach ($want as $pid => $role) {
        $r = $rows[$pid] ?? null;
        if (!$r) { $pdo->prepare("INSERT INTO succ_case_persons(case_id, person_id, role, how) VALUES(?,?,?,'calc')")->execute([$caseId, $pid, $role]); $added++; continue; }
        if ($r['deleted_at'] !== null && $r['removed_by'] !== 'calc') { continue; } // retirée à la main
        if ($r['deleted_at'] !== null) { $pdo->prepare("UPDATE succ_case_persons SET deleted_at=NULL, removed_by='', role=?, how='calc', updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([$role, (int) $r['id']]); $added++; continue; }
        if ($r['how'] === 'calc' && $r['role'] !== $role) { $pdo->prepare('UPDATE succ_case_persons SET role=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$role, (int) $r['id']]); $changed++; }
    }
    foreach ($rows as $pid => $r) {
        if ($r['how'] === 'calc' && $r['deleted_at'] === null && !isset($want[$pid])) { $pdo->prepare("UPDATE succ_case_persons SET deleted_at=CURRENT_TIMESTAMP, removed_by='calc' WHERE id=?")->execute([(int) $r['id']]); $removed++; }
    }
    return ['added' => $added, 'removed' => $removed, 'changed' => $changed];
}
/** les fiches d'un dossier (onglet 🧑‍🤝‍🧑 Personnes) */
function succ_case_people(PDO $pdo, int $caseId): array
{
    succ_row($pdo, $caseId);
    $s = $pdo->prepare('SELECT cp.person_id, cp.role, cp.how, cp.deleted_at, cp.removed_by, cp.created_at, p.first_name, p.last_name, p.living_status FROM succ_case_persons cp JOIN persons p ON p.id=cp.person_id WHERE cp.case_id=? ORDER BY cp.deleted_at IS NOT NULL, p.last_name COLLATE NOCASE, p.first_name COLLATE NOCASE');
    $s->execute([$caseId]);
    $out = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $pid = (int) $r['person_id'];
        $out[] = ['person_id' => $pid, 'name' => succ_name($r), 'years' => succ_years($pdo, $pid), 'role' => (string) $r['role'], 'how' => (string) $r['how'],
            'removed' => $r['deleted_at'] !== null, 'removed_by' => (string) $r['removed_by']];
    }
    return $out;
}
/** les dossiers d'une fiche, avec le rôle (fenêtre « ⚖️ Dossiers… », badge) */
function succ_person_cases(PDO $pdo, int $pid): array
{
    $out = [];
    $s = $pdo->prepare("SELECT c.id, c.number, c.title, c.state, c.deceased_id, cp.role, cp.how, cp.deleted_at, cp.contact_state, cp.contact_state_at FROM succ_cases c LEFT JOIN succ_case_persons cp ON cp.case_id=c.id AND cp.person_id=? WHERE c.deleted_at IS NULL ORDER BY c.number");
    $s->execute([$pid]);
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $on = $r['role'] !== null && $r['deleted_at'] === null;
        $out[] = ['case_id' => (int) $r['id'], 'number' => (string) $r['number'], 'title' => (string) $r['title'], 'state' => (string) $r['state'], 'role' => $on ? (string) $r['role'] : '', 'how' => $on ? (string) $r['how'] : '',
            'contact' => (string) ($r['contact_state'] ?? ''), 'contact_at' => (string) ($r['contact_state_at'] ?? ''), 'deceased' => (int) $r['deceased_id'] === $pid];
    }
    return $out;
}
/** toutes les fiches rattachées : {person_id: [[case_id, role, état de contact], …]} (badges, vue par dossier) */
function succ_membership(PDO $pdo): array
{
    $out = [];
    foreach ($pdo->query('SELECT cp.person_id, cp.case_id, cp.role, cp.contact_state FROM succ_case_persons cp JOIN succ_cases c ON c.id=cp.case_id WHERE cp.deleted_at IS NULL AND c.deleted_at IS NULL') as $r) {
        $out[(string) $r['person_id']][] = [(int) $r['case_id'], (string) $r['role'], (string) $r['contact_state']];
    }
    return $out;
}
/** la vue par dossier : chaque dossier et ses fiches (nom, années), A → Z */
function succ_people_by_case(PDO $pdo, string $q = ''): array
{
    $cases = $pdo->query("SELECT id, number, title, deceased_id, state FROM succ_cases WHERE deleted_at IS NULL ORDER BY number")->fetchAll(PDO::FETCH_ASSOC);
    $rows = $pdo->query("SELECT cp.case_id, cp.role, p.id, p.first_name, p.last_name, p.living_status, p.portrait_media_id FROM succ_case_persons cp JOIN persons p ON p.id=cp.person_id JOIN succ_cases c ON c.id=cp.case_id
        WHERE cp.deleted_at IS NULL AND c.deleted_at IS NULL")->fetchAll(PDO::FETCH_ASSOC);
    $ids = array_values(array_unique(array_map(static fn($r) => (int) $r['id'], $rows)));
    $years = [];
    foreach (array_chunk($ids, 400) as $chunk) {
        $in = implode(',', $chunk);
        foreach ($pdo->query("SELECT e.person_id, t.gedcom_tag, MIN(e.year) AS y FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id IN ($in) AND t.gedcom_tag IN ('BIRT','DEAT') AND e.year IS NOT NULL GROUP BY e.person_id, t.gedcom_tag") as $e) {
            $years[(int) $e['person_id']][$e['gedcom_tag']] = (int) $e['y'];
        }
    }
    $fold = static fn(string $s): string => function_exists('ascii_fold') ? strtolower(ascii_fold($s)) : mb_strtolower($s);
    $qf = trim($fold($q));
    $by = [];
    foreach ($rows as $r) {
        $id = (int) $r['id'];
        $name = succ_name($r);
        if ($qf !== '' && !str_contains($fold($name), $qf)) { $by[(int) $r['case_id']] ??= []; continue; }
        $b = $years[$id]['BIRT'] ?? null; $d = $years[$id]['DEAT'] ?? null;
        $by[(int) $r['case_id']][] = ['id' => $id, 'first' => (string) $r['first_name'], 'last' => (string) $r['last_name'], 'name' => $name, 'role' => (string) $r['role'], 'living_status' => (string) $r['living_status'],
            'years' => $b || $d ? ($b ?: '?') . ($d ? '-' . $d : '') : ''];
    }
    $out = [];
    foreach ($cases as $c) {
        $list = $by[(int) $c['id']] ?? [];
        usort($list, static fn($a, $b) => strcmp($fold($a['last']), $fold($b['last'])) ?: strcmp($fold($a['first']), $fold($b['first'])) ?: $a['id'] <=> $b['id']);
        $out[] = ['id' => (int) $c['id'], 'number' => (string) $c['number'], 'title' => (string) $c['title'], 'state' => (string) $c['state'], 'deceased' => succ_person_name($pdo, (int) $c['deceased_id']), 'people' => $list];
    }
    $total = (int) $pdo->query("SELECT count(*) FROM persons WHERE COALESCE(kind,'person')<>'animal'")->fetchColumn();
    $attached = (int) $pdo->query("SELECT count(DISTINCT cp.person_id) FROM succ_case_persons cp JOIN succ_cases c ON c.id=cp.case_id WHERE cp.deleted_at IS NULL AND c.deleted_at IS NULL")->fetchColumn();
    return ['cases' => $out, 'without' => max(0, $total - $attached), 'total' => $total];
}
/** « Sans dossier » : les fiches qui ne sont dans aucun dossier (une page, A → Z) */
function succ_people_without(PDO $pdo, string $q, int $offset): array
{
    $where = ["COALESCE(p.kind,'person')<>'animal'", 'p.id NOT IN (SELECT cp.person_id FROM succ_case_persons cp JOIN succ_cases c ON c.id=cp.case_id WHERE cp.deleted_at IS NULL AND c.deleted_at IS NULL)'];
    $params = [];
    if ($q !== '') { $where[] = "(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,'')) LIKE ? COLLATE NOCASE"; $params[] = '%' . $q . '%'; }
    $s = $pdo->prepare('SELECT p.id, p.first_name, p.last_name, p.living_status FROM persons p WHERE ' . implode(' AND ', $where) . ' ORDER BY p.last_name COLLATE NOCASE, p.first_name COLLATE NOCASE, p.id LIMIT 181 OFFSET ' . max(0, $offset));
    $s->execute($params);
    $rows = $s->fetchAll(PDO::FETCH_ASSOC);
    $more = count($rows) > 180;
    return ['people' => array_map(static fn($r) => ['id' => (int) $r['id'], 'name' => succ_name($r), 'living_status' => (string) $r['living_status']], array_slice($rows, 0, 180)), 'more' => $more];
}

/* ═════════ 2. Le filtre ⚖️ ═════════ */
/** les dossiers du filtre, d'après la requête (« succ_cases=3,5 ») ; jamais en mode consultation */
function succ_filter_cases(): array
{
    if (succ_kiosk()) { return []; }
    $raw = (string) ($_GET['succ_cases'] ?? '');
    if ($raw === '' || !preg_match('/^\d{1,10}(,\d{1,10}){0,49}$/', $raw)) { return []; }
    return array_values(array_unique(array_map('intval', explode(',', $raw))));
}
function succ_filter_person_ids(PDO $pdo, array $caseIds): array
{
    if (!$caseIds || !succ_dossiers_ready($pdo)) { return []; }
    $in = implode(',', array_map('intval', $caseIds));
    return array_map('intval', $pdo->query("SELECT DISTINCT cp.person_id FROM succ_case_persons cp JOIN succ_cases c ON c.id=cp.case_id WHERE cp.case_id IN ($in) AND cp.deleted_at IS NULL AND c.deleted_at IS NULL")->fetchAll(PDO::FETCH_COLUMN));
}
/**
 * Le temps d'une lecture (GET) : des tables temporaires du même nom (persons, events, families, family_children, places,
 * media, media_links, sources, source_links) ne gardent que les fiches rattachées et ce qui les touche. SQLite lit la table
 * temporaire avant la vraie : Personnes, la recherche, les listes et la carte ne voient que le dossier. Rien n'est écrit.
 */
function succ_shadow_filter(PDO $pdo, array $caseIds): bool
{
    if (!$caseIds || !succ_dossiers_ready($pdo)) { return false; }
    $ids = succ_filter_person_ids($pdo, $caseIds);
    $pdo->exec('CREATE TEMP TABLE IF NOT EXISTS succ_f_ids (id INTEGER PRIMARY KEY)');
    $pdo->exec('DELETE FROM temp.succ_f_ids');
    $ins = $pdo->prepare('INSERT OR IGNORE INTO temp.succ_f_ids(id) VALUES(?)');
    foreach ($ids as $id) { $ins->execute([$id]); }
    $f = '(SELECT id FROM temp.succ_f_ids)';
    $sql = [
        'persons' => "SELECT * FROM main.persons WHERE id IN $f",
        'families' => "SELECT * FROM main.families WHERE partner1_id IN $f OR partner2_id IN $f",
        'family_children' => "SELECT * FROM main.family_children WHERE child_id IN $f",
        'events' => "SELECT * FROM main.events WHERE person_id IN $f OR family_id IN (SELECT id FROM main.families WHERE partner1_id IN $f OR partner2_id IN $f)",
    ];
    foreach ($sql as $t => $q) { $pdo->exec("DROP TABLE IF EXISTS temp.$t"); $pdo->exec("CREATE TEMP TABLE $t AS $q"); }
    $pdo->exec('CREATE INDEX IF NOT EXISTS temp.succ_f_ev_p ON events(person_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS temp.succ_f_ev_t ON events(event_type_id)');
    $pdo->exec('DROP TABLE IF EXISTS temp.places'); $pdo->exec('CREATE TEMP TABLE places AS SELECT * FROM main.places WHERE id IN (SELECT place_id FROM temp.events WHERE place_id IS NOT NULL)');
    $ent = "(entity_type='person' AND entity_id IN $f) OR (entity_type='event' AND entity_id IN (SELECT id FROM temp.events)) OR (entity_type='family' AND entity_id IN (SELECT id FROM temp.families))";
    $pdo->exec('DROP TABLE IF EXISTS temp.media_links'); $pdo->exec("CREATE TEMP TABLE media_links AS SELECT * FROM main.media_links WHERE $ent");
    $pdo->exec('DROP TABLE IF EXISTS temp.media'); $pdo->exec('CREATE TEMP TABLE media AS SELECT * FROM main.media WHERE id IN (SELECT media_id FROM temp.media_links)');
    $pdo->exec('DROP TABLE IF EXISTS temp.source_links'); $pdo->exec("CREATE TEMP TABLE source_links AS SELECT * FROM main.source_links WHERE $ent");
    $pdo->exec('DROP TABLE IF EXISTS temp.sources'); $pdo->exec('CREATE TEMP TABLE sources AS SELECT * FROM main.sources WHERE id IN (SELECT source_record_id FROM temp.source_links)');
    return true;
}
/** l'arbre et les graphiques : les fiches hors du filtre restent à leur place, sans nom (grisées ou cachées à l'écran) */
function succ_tree_mask(PDO $pdo, array &$people): void
{
    $cases = succ_filter_cases(); if (!$cases) { return; }
    $in = array_flip(succ_filter_person_ids($pdo, $cases));
    $mode = succ_settings()['outside'];
    foreach ($people as $id => &$p) {
        if (isset($in[(int) $id])) { continue; }
        foreach (['first_name', 'middle_name', 'last_name', 'prefix', 'suffix', 'birth_date', 'death_date', 'surname_group', 'portrait', 'nickname'] as $k) { if (array_key_exists($k, $p)) { $p[$k] = ''; } }
        foreach (['birth_year', 'death_year', 'portrait_media_id'] as $k) { if (array_key_exists($k, $p)) { $p[$k] = null; } }
        $p['succ_out'] = $mode;
    }
    unset($p);
}
/** une fiche créée pendant le filtre est rattachée d'office (rôle « à vérifier ») : appelé par log_change() */
function succ_auto_attach(PDO $pdo, int $pid): void
{
    if ($pid <= 0 || succ_kiosk()) { return; }
    $raw = (string) ($_SERVER['HTTP_X_LCNDA_SUCC'] ?? '');
    if ($raw === '' || !preg_match('/^\d{1,10}(,\d{1,10}){0,49}$/', $raw)) { return; }
    try {
        if (!succ_dossiers_ready($pdo)) { return; }
        foreach (array_unique(array_map('intval', explode(',', $raw))) as $cid) {
            $s = $pdo->prepare('SELECT 1 FROM succ_cases WHERE id=? AND deleted_at IS NULL'); $s->execute([$cid]);
            if ($s->fetchColumn()) { succ_attach($pdo, $cid, $pid, 'verify', 'filter', false); }
        }
    } catch (Throwable $_) {}
}
/** les rattachements d'office récents (pour le message « Rattachée au dossier … · ↶ Annuler ») */
function succ_auto_recent(PDO $pdo, int $afterId): array
{
    $s = $pdo->prepare("SELECT cp.id, cp.case_id, cp.person_id, c.number, p.first_name, p.last_name FROM succ_case_persons cp JOIN succ_cases c ON c.id=cp.case_id JOIN persons p ON p.id=cp.person_id
        WHERE cp.how='filter' AND cp.deleted_at IS NULL AND cp.id>? ORDER BY cp.id LIMIT 50");
    $s->execute([$afterId]);
    $rows = array_map(static fn($r) => ['id' => (int) $r['id'], 'case_id' => (int) $r['case_id'], 'person_id' => (int) $r['person_id'], 'number' => (string) $r['number'], 'name' => succ_name($r)], $s->fetchAll(PDO::FETCH_ASSOC));
    $last = (int) $pdo->query('SELECT COALESCE(MAX(id),0) FROM succ_case_persons')->fetchColumn();
    return ['items' => $rows, 'last' => $last];
}

/* ═════════ 5. Garde-fous : homonymes, fusion ═════════ */
function succ_fold_name(string $s): string { return trim((string) preg_replace('/[^a-z]+/', ' ', strtolower(function_exists('ascii_fold') ? ascii_fold($s) : $s))); }
/** les homonymes possibles : même nom et prénom, naissance à 2 ans près (ou inconnue), dans un autre dossier ; ou fiches
 *  semblables notées au réimport. « Pas la même » est retenu. */
function succ_homonyms(PDO $pdo, int $caseId): array
{
    $c = succ_row($pdo, $caseId);
    $mine = []; $s = $pdo->prepare('SELECT person_id FROM succ_case_persons WHERE case_id=? AND deleted_at IS NULL'); $s->execute([$caseId]);
    foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $id) { $mine[(int) $id] = true; }
    if (!$mine) { return []; }
    $others = [];
    $s = $pdo->prepare('SELECT cp.person_id, cp.case_id, c.number FROM succ_case_persons cp JOIN succ_cases c ON c.id=cp.case_id WHERE cp.case_id<>? AND cp.deleted_at IS NULL AND c.deleted_at IS NULL');
    $s->execute([$caseId]);
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { $others[(int) $r['person_id']][] = ['case_id' => (int) $r['case_id'], 'number' => (string) $r['number']]; }
    $opts = json_decode((string) $c['options_json'], true);
    $similar = is_array($opts['similar'] ?? null) ? $opts['similar'] : [];
    $all = array_keys($mine + $others);
    foreach ($similar as $pair) { if (is_array($pair) && count($pair) === 2) { $all[] = (int) $pair[0]; $all[] = (int) $pair[1]; } }
    $info = [];
    foreach (array_chunk(array_values(array_unique($all)), 400) as $chunk) {
        $in = implode(',', array_map('intval', $chunk));
        foreach ($pdo->query("SELECT p.id, p.first_name, p.last_name, (SELECT MIN(e.year) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('BIRT','CHR','BAPM')) AS by FROM persons p WHERE p.id IN ($in)") as $p) {
            $info[(int) $p['id']] = ['key' => succ_fold_name((string) $p['first_name']) . '|' . succ_fold_name((string) $p['last_name']), 'name' => succ_name($p), 'year' => $p['by'] === null ? null : (int) $p['by']];
        }
    }
    $no = [];
    foreach ($pdo->query('SELECT a, b FROM succ_homonym_no') as $r) { $no[(int) $r['a'] . ':' . (int) $r['b']] = true; }
    $isNo = static fn(int $a, int $b): bool => isset($no[min($a, $b) . ':' . max($a, $b)]);
    $byKey = [];
    foreach ($others as $pid => $cs) { if (!isset($mine[$pid]) && isset($info[$pid]) && $info[$pid]['key'] !== '|') { $byKey[$info[$pid]['key']][] = $pid; } }
    $out = []; $seen = [];
    foreach (array_keys($mine) as $pid) {
        $me = $info[$pid] ?? null; if (!$me || $me['key'] === '|' || str_starts_with($me['key'], '|') || str_ends_with($me['key'], '|')) { continue; }
        foreach ($byKey[$me['key']] ?? [] as $o) {
            $oy = $info[$o]['year']; if ($me['year'] !== null && $oy !== null && abs($me['year'] - $oy) > 2) { continue; }
            if ($isNo($pid, $o) || isset($seen["$pid:$o"])) { continue; }
            $seen["$pid:$o"] = true;
            $out[] = ['person_id' => $pid, 'other_id' => $o, 'name' => $me['name'], 'year' => $me['year'] ?? $oy, 'cases' => $others[$o], 'kind' => 'case'];
        }
    }
    foreach ($similar as $pair) {
        if (!is_array($pair) || count($pair) !== 2) { continue; }
        [$a, $b] = [(int) $pair[0], (int) $pair[1]];
        if (!isset($info[$a], $info[$b]) || $isNo($a, $b) || isset($seen["$a:$b"]) || !isset($mine[$a]) || isset($mine[$b])) { continue; }
        $seen["$a:$b"] = true;
        $out[] = ['person_id' => $a, 'other_id' => $b, 'name' => $info[$a]['name'], 'year' => $info[$a]['year'], 'cases' => $others[$b] ?? [], 'kind' => 'base'];
    }
    return $out;
}
function succ_homonym_no(PDO $pdo, int $a, int $b): array
{
    if ($a <= 0 || $b <= 0 || $a === $b) { throw new LcndaBadInput('Fiches inconnues.'); }
    $pdo->prepare('INSERT OR IGNORE INTO succ_homonym_no(a, b) VALUES(?,?)')->execute([min($a, $b), max($a, $b)]);
    return ['a' => min($a, $b), 'b' => max($a, $b)];
}
/** avant de fusionner deux fiches : leurs dossiers */
function succ_merge_check(PDO $pdo, int $a, int $b): array
{
    $cases = static function (int $pid) use ($pdo): array {
        $s = $pdo->prepare('SELECT c.id, c.number, cp.role FROM succ_case_persons cp JOIN succ_cases c ON c.id=cp.case_id WHERE cp.person_id=? AND cp.deleted_at IS NULL AND c.deleted_at IS NULL ORDER BY c.number');
        $s->execute([$pid]);
        return array_map(static fn($r) => ['case_id' => (int) $r['id'], 'number' => (string) $r['number'], 'role' => (string) $r['role']], $s->fetchAll(PDO::FETCH_ASSOC));
    };
    $ca = $cases($a); $cb = $cases($b);
    $ida = array_column($ca, 'case_id'); $idb = array_column($cb, 'case_id');
    $different = $ca && $cb && (array_diff($ida, $idb) || array_diff($idb, $ida));
    return ['a' => ['id' => $a, 'name' => succ_person_name($pdo, $a), 'cases' => $ca], 'b' => ['id' => $b, 'name' => succ_person_name($pdo, $b), 'cases' => $cb], 'different' => (bool) $different];
}
/** après une fusion (merge_people) : les rattachements de la fiche fusionnée passent à celle qui reste ; journal des dossiers */
function succ_after_merge(PDO $pdo, int $target, int $source): void
{
    try {
        if (!succ_dossiers_ready($pdo)) { return; }
        $name = succ_person_name($pdo, $target);
        $s = $pdo->prepare('SELECT * FROM succ_case_persons WHERE person_id=?'); $s->execute([$source]);
        $cases = [];
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $cid = (int) $r['case_id'];
            $t = succ_cp_row($pdo, $cid, $target);
            if (!$t) { $pdo->prepare('UPDATE succ_case_persons SET person_id=? WHERE id=?')->execute([$target, (int) $r['id']]); }
            else { if ($t['deleted_at'] !== null && $r['deleted_at'] === null) { $pdo->prepare("UPDATE succ_case_persons SET deleted_at=NULL, removed_by='', role=? WHERE id=?")->execute([(string) $r['role'], (int) $t['id']]); } $pdo->prepare('DELETE FROM succ_case_persons WHERE id=?')->execute([(int) $r['id']]); }
            if ($r['deleted_at'] === null) { $cases[$cid] = true; }
        }
        $t = $pdo->prepare('SELECT case_id FROM succ_case_persons WHERE person_id=? AND deleted_at IS NULL'); $t->execute([$target]);
        $all = array_map('intval', $t->fetchAll(PDO::FETCH_COLUMN));
        $pdo->prepare('UPDATE succ_cases SET deceased_id=? WHERE deceased_id=?')->execute([$target, $source]);
        $pdo->prepare('UPDATE succ_cases SET notary_person_id=? WHERE notary_person_id=?')->execute([$target, $source]);
        if (count(array_unique($all)) >= 2 || $cases) {
            $nums = [];
            foreach (array_unique($all) as $cid) { $q = $pdo->prepare('SELECT number FROM succ_cases WHERE id=?'); $q->execute([$cid]); $nums[$cid] = (string) $q->fetchColumn(); }
            foreach ($nums as $cid => $n) {
                succ_journal($pdo, $cid, 'calc', 'Fiches fusionnées : ' . $name . ' (fiche n° ' . $source . ' fusionnée dans n° ' . $target . ')' . (count($nums) > 1 ? ' ; dossiers reliés : ' . implode(', ', $nums) : '') . ' — dévolution à recalculer');
                $pdo->prepare('UPDATE succ_cases SET progress=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$cid]);
            }
        }
    } catch (Throwable $_) {}
}

/* ═════════ Copier des fiches d'une base à l'autre (déplacer, archiver, réimporter, reprendre depuis Ma généalogie) ═════════ */
function succ_cols(PDO $pdo, string $table): array
{
    static $cache = [];
    $k = spl_object_id($pdo) . ':' . $table;
    if (!isset($cache[$k])) {
        try { $cache[$k] = array_map(static fn($r) => (string) $r['name'], $pdo->query("SELECT name FROM pragma_table_info('" . str_replace("'", '', $table) . "')")->fetchAll(PDO::FETCH_ASSOC)); }
        catch (Throwable $_) { $cache[$k] = []; }
    }
    return $cache[$k];
}
function succ_has_table(PDO $pdo, string $t): bool { return (bool) succ_cols($pdo, $t); }
function succ_select_in(PDO $pdo, string $table, string $col, array $ids, string $extra = ''): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    if (!$ids || !succ_has_table($pdo, $table)) { return []; }
    $out = [];
    foreach (array_chunk($ids, 400) as $chunk) {
        foreach ($pdo->query("SELECT * FROM $table WHERE $col IN (" . implode(',', $chunk) . ")$extra")->fetchAll(PDO::FETCH_ASSOC) as $r) { $out[] = $r; }
    }
    return $out;
}
/** les fiches et ce qui les touche : événements, familles entre elles, lieux, sources, notes, variantes ; médias et adresses au choix */
function succ_bundle_persons(PDO $pdo, array $ids, array $opts = []): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    $set = array_flip($ids);
    $persons = succ_select_in($pdo, 'persons', 'id', $ids);
    $families = array_values(array_filter(array_merge(succ_select_in($pdo, 'families', 'partner1_id', $ids), succ_select_in($pdo, 'families', 'partner2_id', $ids)),
        static fn($f) => (!$f['partner1_id'] || isset($set[(int) $f['partner1_id']])) && (!$f['partner2_id'] || isset($set[(int) $f['partner2_id']]))));
    $byId = []; foreach ($families as $f) { $byId[(int) $f['id']] = $f; } $families = array_values($byId);
    // une famille avec un seul parent dans le lot, mais des enfants du lot : gardée (le parent hors lot n'est pas copié)
    foreach (succ_select_in($pdo, 'family_children', 'child_id', $ids) as $fc) {
        $fid = (int) $fc['family_id']; if (isset($byId[$fid])) { continue; }
        $f = succ_select_in($pdo, 'families', 'id', [$fid])[0] ?? null; if (!$f) { continue; }
        if (($f['partner1_id'] && isset($set[(int) $f['partner1_id']])) || ($f['partner2_id'] && isset($set[(int) $f['partner2_id']]))) {
            if ($f['partner1_id'] && !isset($set[(int) $f['partner1_id']])) { $f['partner1_id'] = null; }
            if ($f['partner2_id'] && !isset($set[(int) $f['partner2_id']])) { $f['partner2_id'] = null; }
            $byId[$fid] = $f;
        }
    }
    $families = array_values($byId);
    $famIds = array_map(static fn($f) => (int) $f['id'], $families);
    $children = array_values(array_filter(succ_select_in($pdo, 'family_children', 'family_id', $famIds), static fn($c) => isset($set[(int) $c['child_id']])));
    $events = array_merge(succ_select_in($pdo, 'events', 'person_id', $ids), succ_select_in($pdo, 'events', 'family_id', $famIds));
    $evIds = array_map(static fn($e) => (int) $e['id'], $events);
    $types = succ_select_in($pdo, 'event_types', 'id', array_map(static fn($e) => (int) $e['event_type_id'], $events));
    $places = succ_select_in($pdo, 'places', 'id', array_map(static fn($e) => (int) $e['place_id'], $events));
    $ent = static function (string $table) use ($pdo, $ids, $evIds, $famIds): array {
        if (!succ_has_table($pdo, $table)) { return []; }
        $rows = [];
        foreach (['person' => $ids, 'event' => $evIds, 'family' => $famIds] as $type => $list) {
            foreach (succ_select_in($pdo, $table, 'entity_id', $list, " AND entity_type='$type'") as $r) { $rows[] = $r; }
        }
        return $rows;
    };
    $sourceLinks = $ent('source_links');
    $sources = succ_select_in($pdo, 'sources', 'id', array_map(static fn($r) => (int) $r['source_record_id'], $sourceLinks));
    $notes = $ent('notes');
    $variants = succ_select_in($pdo, 'name_variants', 'person_id', $ids);
    $media = []; $mediaLinks = [];
    if (!empty($opts['media'])) {
        $mediaLinks = $ent('media_links');
        $media = succ_select_in($pdo, 'media', 'id', array_map(static fn($r) => (int) $r['media_id'], $mediaLinks));
    }
    $contacts = !empty($opts['contacts']) ? succ_select_in($pdo, 'living_contacts', 'person_id', $ids) : [];
    return ['persons' => $persons, 'families' => $families, 'family_children' => $children, 'events' => $events, 'event_types' => $types, 'places' => $places,
        'sources' => $sources, 'source_links' => $sourceLinks, 'notes' => $notes, 'name_variants' => $variants, 'media' => $media, 'media_links' => $mediaLinks, 'living_contacts' => $contacts];
}
/** un dossier entier, pour le déplacer ou l'archiver */
function succ_bundle_case(PDO $pdo, int $caseId, array $opts = []): array
{
    $c = succ_row($pdo, $caseId, true);
    $s = $pdo->prepare('SELECT * FROM succ_case_persons WHERE case_id=? AND deleted_at IS NULL'); $s->execute([$caseId]); $cp = $s->fetchAll(PDO::FETCH_ASSOC);
    $ids = array_map(static fn($r) => (int) $r['person_id'], $cp);
    if ((int) $c['deceased_id']) { $ids[] = (int) $c['deceased_id']; }
    $keepAddr = !empty($opts['addresses']);
    $b = succ_bundle_persons($pdo, $ids, ['media' => !empty($opts['media']), 'contacts' => $keepAddr]);
    $q = static function (string $sql) use ($pdo, $caseId): array { $s = $pdo->prepare($sql); $s->execute([$caseId]); return $s->fetchAll(PDO::FETCH_ASSOC); };
    $courriers = [];
    try { $courriers = $q('SELECT * FROM courriers WHERE succ_case_id=?'); } catch (Throwable $_) {}
    if (!$keepAddr) {
        $c['last_address'] = '';
        foreach ($courriers as &$k) { $j = json_decode((string) ($k['letter_json'] ?? ''), true); if (is_array($j)) { $j['recipient_address'] = ''; $j['recipient_email'] = ''; $k['letter_json'] = json_encode($j, JSON_UNESCAPED_UNICODE); } }
        unset($k);
    }
    return $b + ['format' => 'lcnda-succ', 'version' => 1, 'made_at' => date('c'), 'addresses' => $keepAddr,
        'case' => $c, 'case_persons' => $cp, 'deadlines' => $q('SELECT * FROM succ_deadlines WHERE case_id=?'), 'pieces' => $q('SELECT * FROM succ_pieces WHERE case_id=?'),
        'journal' => $q('SELECT * FROM succ_journal WHERE case_id=? ORDER BY id'), 'fees' => $q('SELECT * FROM succ_fees WHERE case_id=?'), 'courriers' => $courriers];
}
function succ_insert(PDO $to, string $table, array $row, array $set = [], bool $keepId = false): int
{
    $cols = succ_cols($to, $table);
    $row = array_merge($row, $set);
    if (!$keepId) { unset($row['id']); }
    if (in_array('source_id', $cols, true) && $table !== 'source_links' && $table !== 'name_variants') { $row['source_id'] = null; }
    $row = array_intersect_key($row, array_flip($cols));
    if (!$row) { $to->exec("INSERT INTO $table DEFAULT VALUES"); return (int) $to->lastInsertId(); }
    $k = array_keys($row);
    $to->prepare("INSERT INTO $table(" . implode(',', $k) . ') VALUES(' . implode(',', array_fill(0, count($k), '?')) . ')')->execute(array_values($row));
    return (int) $to->lastInsertId();
}
/**
 * Pose un lot dans une base : nouvelles fiches (nouveaux numéros), lieux et types d'événements retrouvés par leur nom,
 * médias recopiés ($mediaFrom : dossier des médias, ou fichiers lus dans l'archive), puis le dossier s'il y en a un.
 * Renvoie ['map' => [ancien n° de fiche => nouveau], 'case_id' => n° du dossier posé, 'similar' => [[nouveau, existant]]].
 */
function succ_bundle_import(PDO $to, array $b, string $mediaTo, ?callable $mediaRead = null, array $opts = []): array
{
    $pmap = []; $fmap = []; $emap = []; $plmap = []; $tmap = []; $smap = []; $mmap = [];
    // fiches qui ressemblent à des fiches déjà là (jamais fusionnées seules)
    $existing = [];
    foreach ($to->query("SELECT p.id, p.first_name, p.last_name, (SELECT MIN(e.year) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('BIRT','CHR','BAPM')) AS by FROM persons p") as $p) {
        $existing[succ_fold_name((string) $p['first_name']) . '|' . succ_fold_name((string) $p['last_name'])][] = [(int) $p['id'], $p['by'] === null ? null : (int) $p['by']];
    }
    $births = [];
    foreach ($b['events'] ?? [] as $e) { foreach ($b['event_types'] ?? [] as $t) { if ((int) $t['id'] === (int) $e['event_type_id'] && in_array($t['gedcom_tag'], ['BIRT', 'CHR', 'BAPM'], true) && $e['year'] !== null) { $births[(int) $e['person_id']] ??= (int) $e['year']; } } }
    $similar = [];
    foreach ($b['persons'] ?? [] as $p) {
        $old = (int) $p['id'];
        $new = succ_insert($to, 'persons', $p, ['surname_group_id' => null, 'portrait_media_id' => null, 'is_start' => 0, 'is_locked' => 0, 'unique_id' => null]);
        $pmap[$old] = $new;
        $key = succ_fold_name((string) $p['first_name']) . '|' . succ_fold_name((string) $p['last_name']);
        if (!str_starts_with($key, '|') && !str_ends_with($key, '|')) {
            foreach ($existing[$key] ?? [] as [$eid, $ey]) { $y = $births[$old] ?? null; if ($y === null || $ey === null || abs($y - $ey) <= 2) { $similar[] = [$new, $eid, succ_name($p)]; break; } }
        }
    }
    foreach ($b['event_types'] ?? [] as $t) {
        $s = $to->prepare('SELECT id FROM event_types WHERE scope=? AND (slug=? OR (gedcom_tag<>\'\' AND gedcom_tag=?)) ORDER BY (slug=?) DESC, id LIMIT 1'); $s->execute([$t['scope'], $t['slug'], (string) $t['gedcom_tag'], $t['slug']]);
        $id = (int) $s->fetchColumn();
        $tmap[(int) $t['id']] = $id ?: succ_insert($to, 'event_types', $t, ['is_custom' => 1]);
    }
    foreach ($b['places'] ?? [] as $pl) {
        $s = $to->prepare('SELECT id FROM places WHERE name=? AND COALESCE(country,\'\')=COALESCE(?,\'\') AND COALESCE(county,\'\')=COALESCE(?,\'\') ORDER BY id LIMIT 1'); $s->execute([(string) $pl['name'], $pl['country'] ?? '', $pl['county'] ?? '']);
        $id = (int) $s->fetchColumn();
        $plmap[(int) $pl['id']] = $id ?: succ_insert($to, 'places', $pl, array_intersect_key(['parent_id' => null, 'parent_place_id' => null], array_flip(succ_cols($to, 'places'))));
    }
    foreach ($b['families'] ?? [] as $f) {
        $fmap[(int) $f['id']] = succ_insert($to, 'families', $f, ['partner1_id' => $f['partner1_id'] ? ($pmap[(int) $f['partner1_id']] ?? null) : null, 'partner2_id' => $f['partner2_id'] ? ($pmap[(int) $f['partner2_id']] ?? null) : null]);
    }
    foreach ($b['family_children'] ?? [] as $fc) {
        if (!isset($fmap[(int) $fc['family_id']], $pmap[(int) $fc['child_id']])) { continue; }
        succ_insert($to, 'family_children', $fc, ['family_id' => $fmap[(int) $fc['family_id']], 'child_id' => $pmap[(int) $fc['child_id']]]);
    }
    foreach ($b['media'] ?? [] as $m) {
        $set = [];
        foreach (['filename', 'thumbnail'] as $col) {
            $fn = (string) ($m[$col] ?? ''); if ($fn === '' || str_contains($fn, '..') || preg_match('#^[a-z]+://#i', $fn)) { continue; }
            $data = $mediaRead ? $mediaRead($fn) : null;
            if ($data === null) { continue; }
            $dest = $fn; $i = 1;
            while (is_file($mediaTo . '/' . $dest)) { $dest = preg_replace('#(^|/)([^/]+)$#', '$1succ' . $i++ . '-$2', $fn); }
            $dir = dirname($mediaTo . '/' . $dest);
            if (!is_dir($dir)) { @mkdir($dir, 0775, true); }
            if (@file_put_contents($mediaTo . '/' . $dest, $data) !== false) { $set[$col] = $dest; }
        }
        $mmap[(int) $m['id']] = succ_insert($to, 'media', $m, $set);
    }
    foreach ($b['events'] ?? [] as $e) {
        $pid = $e['person_id'] ? ($pmap[(int) $e['person_id']] ?? null) : null; $fid = $e['family_id'] ? ($fmap[(int) $e['family_id']] ?? null) : null;
        if (!$pid && !$fid) { continue; }
        $emap[(int) $e['id']] = succ_insert($to, 'events', $e, ['person_id' => $pid, 'family_id' => $fid, 'event_type_id' => $tmap[(int) $e['event_type_id']] ?? (int) $e['event_type_id'],
            'place_id' => $e['place_id'] ? ($plmap[(int) $e['place_id']] ?? null) : null, 'confidence_media_id' => $e['confidence_media_id'] ? ($mmap[(int) $e['confidence_media_id']] ?? null) : null]);
    }
    $entMap = static fn(string $type, int $id): ?int => ['person' => $pmap, 'event' => $emap, 'family' => $fmap][$type][$id] ?? null;
    foreach ($b['sources'] ?? [] as $s) { $smap[(int) $s['id']] = succ_insert($to, 'sources', $s); }
    foreach ($b['source_links'] ?? [] as $l) { $eid = $entMap((string) $l['entity_type'], (int) $l['entity_id']); if ($eid && isset($smap[(int) $l['source_record_id']])) { succ_insert($to, 'source_links', $l, ['entity_id' => $eid, 'source_record_id' => $smap[(int) $l['source_record_id']], 'source_id' => null]); } }
    foreach ($b['notes'] ?? [] as $n) { $eid = $entMap((string) $n['entity_type'], (int) $n['entity_id']); if ($eid) { succ_insert($to, 'notes', $n, ['entity_id' => $eid]); } }
    foreach ($b['media_links'] ?? [] as $l) { $eid = $entMap((string) $l['entity_type'], (int) $l['entity_id']); if ($eid && isset($mmap[(int) $l['media_id']])) { succ_insert($to, 'media_links', $l, ['entity_id' => $eid, 'media_id' => $mmap[(int) $l['media_id']]]); } }
    foreach ($b['name_variants'] ?? [] as $v) { if (isset($pmap[(int) $v['person_id']])) { succ_insert($to, 'name_variants', $v, ['person_id' => $pmap[(int) $v['person_id']], 'source_id' => null, 'source_media_id' => null]); } }
    foreach ($b['living_contacts'] ?? [] as $lc) { if (isset($pmap[(int) $lc['person_id']])) { succ_insert($to, 'living_contacts', $lc, ['person_id' => $pmap[(int) $lc['person_id']]]); } }
    foreach (array_values($pmap) as $new) { if (function_exists('rebuild_search')) { try { rebuild_search($to, $new); } catch (Throwable $_) {} } }
    $caseId = 0;
    if (!empty($b['case']) && is_array($b['case'])) {
        $c = $b['case'];
        $mapKey = static function (string $k) use ($pmap, $fmap): ?string {
            if (!preg_match('/^([NDMVR]):(\d+)$/', $k, $m)) { return null; }
            $id = in_array($m[1], ['M', 'V'], true) ? ($fmap[(int) $m[2]] ?? null) : ($pmap[(int) $m[2]] ?? null);
            return $id ? $m[1] . ':' . $id : null;
        };
        $ov = json_decode((string) ($c['overrides_json'] ?? '{}'), true); $ov2 = [];
        foreach (is_array($ov) ? $ov : [] as $k => $v) { if (isset($pmap[(int) $k])) { $ov2[(string) $pmap[(int) $k]] = $v; } }
        $snap = json_decode((string) ($c['snapshot_json'] ?? ''), true);
        if (is_array($snap)) { $sh = []; foreach ((array) ($snap['shares'] ?? []) as $k => $v) { if (isset($pmap[(int) $k])) { $sh[(string) $pmap[(int) $k]] = $v; } } $snap['shares'] = $sh ?: new stdClass(); $snap['unknown'] = array_values(array_filter(array_map(static fn($x) => $pmap[(int) $x] ?? null, (array) ($snap['unknown'] ?? [])))); }
        $notary = (int) ($c['notary_person_id'] ?? 0);
        $options = json_decode((string) ($c['options_json'] ?? '{}'), true); if (!is_array($options)) { $options = []; }
        $options['similar'] = array_map(static fn($x) => [$x[0], $x[1]], $similar);
        $set = ['deceased_id' => $pmap[(int) $c['deceased_id']] ?? null, 'notary_person_id' => $notary ? ($pmap[$notary] ?? null) : null,
            'notary_text' => $notary && !isset($pmap[$notary]) ? ((string) ($opts['notary_name'] ?? '') ?: (string) $c['notary_text']) : (string) $c['notary_text'],
            'death_place_id' => null, 'overrides_json' => json_encode($ov2 ?: new stdClass(), JSON_UNESCAPED_UNICODE), 'snapshot_json' => is_array($snap) ? json_encode($snap, JSON_UNESCAPED_UNICODE) : '',
            'options_json' => json_encode($options ?: new stdClass(), JSON_UNESCAPED_UNICODE), 'deleted_at' => null, 'progress' => $c['progress'] ?? null, 'progress_json' => (string) ($c['progress_json'] ?? '')];
        if (!empty($opts['state'])) { $set['state'] = $opts['state']; $set['archived_at'] = null; }
        $caseId = succ_insert($to, 'succ_cases', $c, $set);
        foreach ($b['journal'] ?? [] as $j) { $to->prepare('INSERT INTO succ_journal(case_id, at, kind, text) VALUES(?,?,?,?)')->execute([$caseId, (string) $j['at'], (string) $j['kind'], (string) $j['text']]); }
        foreach ($b['deadlines'] ?? [] as $d) { succ_insert($to, 'succ_deadlines', $d, ['case_id' => $caseId]); }
        foreach ($b['fees'] ?? [] as $f) { succ_insert($to, 'succ_fees', $f, ['case_id' => $caseId, 'person_id' => $f['person_id'] ? ($pmap[(int) $f['person_id']] ?? null) : null]); }
        $cmap = [];
        if (succ_has_table($to, 'courriers')) {
            foreach ($b['courriers'] ?? [] as $k) {
                $cmap[(int) $k['id']] = succ_insert($to, 'courriers', $k, ['succ_case_id' => $caseId, 'person_id' => $k['person_id'] ? ($pmap[(int) $k['person_id']] ?? null) : null,
                    'event_id' => $k['event_id'] ? ($emap[(int) $k['event_id']] ?? null) : null, 'media_id' => $k['media_id'] ? ($mmap[(int) $k['media_id']] ?? null) : null]);
            }
        }
        foreach ($b['pieces'] ?? [] as $p) { $nk = $mapKey((string) $p['piece_key']); if ($nk) { succ_insert($to, 'succ_pieces', $p, ['case_id' => $caseId, 'piece_key' => $nk, 'courrier_id' => $p['courrier_id'] ? ($cmap[(int) $p['courrier_id']] ?? null) : null, 'media_id' => $p['media_id'] ? ($mmap[(int) $p['media_id']] ?? null) : null]); } }
        $how = (string) ($opts['how'] ?? 'move');
        foreach ($b['case_persons'] ?? [] as $r) { if (isset($pmap[(int) $r['person_id']])) { $to->prepare('INSERT OR IGNORE INTO succ_case_persons(case_id, person_id, role, how) VALUES(?,?,?,?)')->execute([$caseId, $pmap[(int) $r['person_id']], in_array($r['role'], SUCC_ROLES, true) ? $r['role'] : 'verify', in_array($how, SUCC_HOWS, true) ? $how : 'move']); } }
        if ($set['deceased_id']) { $to->prepare("INSERT OR IGNORE INTO succ_case_persons(case_id, person_id, role, how) VALUES(?,?, 'deceased', 'open')")->execute([$caseId, $set['deceased_id']]); }
    }
    return ['map' => $pmap, 'case_id' => $caseId, 'similar' => $similar];
}
/** les fiches qu'on peut retirer d'ici (seulement dans ce dossier, sans lien de famille hors du dossier) et celles qui restent */
function succ_case_removable(PDO $pdo, int $caseId): array
{
    $c = succ_row($pdo, $caseId, true);
    $s = $pdo->prepare('SELECT person_id FROM succ_case_persons WHERE case_id=? AND deleted_at IS NULL'); $s->execute([$caseId]);
    $ids = array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN));
    if ((int) $c['deceased_id']) { $ids[] = (int) $c['deceased_id']; }
    $ids = array_values(array_unique($ids)); $set = array_flip($ids);
    $other = [];
    foreach (succ_select_in($pdo, 'succ_case_persons', 'person_id', $ids, ' AND case_id<>' . $caseId . ' AND deleted_at IS NULL AND case_id IN (SELECT id FROM succ_cases WHERE deleted_at IS NULL)') as $r) { $other[(int) $r['person_id']] = true; }
    foreach ($pdo->query('SELECT notary_person_id FROM succ_cases WHERE deleted_at IS NULL AND id<>' . $caseId . ' AND notary_person_id IS NOT NULL') as $r) { $other[(int) $r['notary_person_id']] = true; }
    [$up, $down] = succ_links($pdo);
    $spouse = [];
    foreach ($pdo->query('SELECT partner1_id, partner2_id FROM families WHERE partner1_id IS NOT NULL AND partner2_id IS NOT NULL') as $f) { $spouse[(int) $f['partner1_id']][] = (int) $f['partner2_id']; $spouse[(int) $f['partner2_id']][] = (int) $f['partner1_id']; }
    $remove = []; $keep = [];
    foreach ($ids as $id) {
        $near = array_merge(array_keys($up[$id] ?? []), array_keys($down[$id] ?? []), $spouse[$id] ?? []);
        $family = array_filter($near, static fn($x) => !isset($set[$x]));
        if (isset($other[$id]) || $family) { $keep[] = ['id' => $id, 'name' => succ_person_name($pdo, $id), 'why' => isset($other[$id]) ? 'case' : 'family']; }
        else { $remove[] = $id; }
    }
    return ['remove' => $remove, 'keep' => $keep];
}
/** retirer des fiches de la base (avec ce qui en dépend) ; delete_person garde de quoi les restaurer */
function succ_remove_persons(PDO $pdo, array $ids): int
{
    $n = 0;
    foreach ($ids as $id) {
        $id = (int) $id;
        if (function_exists('delete_person')) { try { delete_person($pdo, ['id' => $id]); $n++; continue; } catch (Throwable $_) {} }
        foreach (['media_links', 'source_links', 'notes'] as $t) {
            if (!succ_has_table($pdo, $t)) { continue; }
            $pdo->prepare("DELETE FROM $t WHERE entity_type='event' AND entity_id IN (SELECT id FROM events WHERE person_id=?)")->execute([$id]);
            $pdo->prepare("DELETE FROM $t WHERE entity_type='person' AND entity_id=?")->execute([$id]);
        }
        $pdo->prepare('DELETE FROM events WHERE person_id=?')->execute([$id]);
        $pdo->prepare('DELETE FROM family_children WHERE child_id=?')->execute([$id]);
        $pdo->prepare('UPDATE families SET partner1_id=NULL WHERE partner1_id=?')->execute([$id]);
        $pdo->prepare('UPDATE families SET partner2_id=NULL WHERE partner2_id=?')->execute([$id]);
        $pdo->prepare('DELETE FROM persons WHERE id=?')->execute([$id]);
        $n++;
    }
    // familles devenues vides (ni conjoint ni enfant)
    $pdo->exec('DELETE FROM families WHERE partner1_id IS NULL AND partner2_id IS NULL AND id NOT IN (SELECT family_id FROM family_children)');
    if ($ids) { $in = implode(',', array_map('intval', $ids)); $pdo->exec("DELETE FROM succ_case_persons WHERE person_id IN ($in)"); }
    return $n;
}
/** le dossier quitte cette base : marqué supprimé (deleted_at), ses fiches propres retirées */
function succ_case_leave(PDO $pdo, int $caseId, string $why, array $remove): void
{
    succ_journal($pdo, $caseId, 'archive', $why);
    $pdo->prepare('UPDATE succ_cases SET deleted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$caseId]);
    $pdo->prepare('UPDATE succ_case_persons SET deleted_at=CURRENT_TIMESTAMP WHERE case_id=? AND deleted_at IS NULL')->execute([$caseId]);
    try { $pdo->prepare('UPDATE courriers SET succ_case_id=NULL WHERE succ_case_id=? AND succ_kind=\'acte\'')->execute([$caseId]); } catch (Throwable $_) {}
    succ_remove_persons($pdo, $remove);
}
function succ_gname(string $id): string { $g = succ_genealogies()[$id] ?? null; return $g ? $g['name'] : $id; }
function succ_fr_date(): string { $m = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']; return (int) date('j') . ' ' . $m[(int) date('n') - 1] . ' ' . date('Y'); }
function succ_media_reader(string $dir): callable
{
    return static function (string $fn) use ($dir): ?string { $p = $dir . '/' . $fn; return is_file($p) ? (string) file_get_contents($p) : null; };
}

/** ⇄ Déplacer un dossier dans une autre généalogie (sauvegarde des deux avant ; une fiche partagée est copiée, ou refus) */
function succ_move(PDO $pdo, array $d): array
{
    $caseId = safe_int($d['case_id'] ?? 0); $c = succ_row($pdo, $caseId);
    $to = (string) ($d['to'] ?? '');
    $gs = succ_genealogies();
    $here = succ_gid();
    if (($d['to_new'] ?? '') !== '') {
        $name = succ_txt($d['to_new'], 80); if ($name === '') { throw new LcndaBadInput('Donne un nom à la nouvelle généalogie.'); }
        $to = (string) genealogy_action('genealogy_create', ['name' => $name])['id'];
        $gs = succ_genealogies();
        succ_genealogy_init($to);
    }
    if ($to === $here || !isset($gs[$to])) { throw new LcndaBadInput('Choisis une autre généalogie.'); }
    $rm = succ_case_removable($pdo, $caseId);
    if ($rm['keep'] && succ_settings()['move_shared'] === 'refuse') {
        throw new LcndaBadInput(i18n_t('Déplacement refusé : ces fiches sont aussi dans ta famille ou dans un autre dossier : {names}.', ['names' => implode(', ', array_column($rm['keep'], 'name'))]));
    }
    $target = succ_open_rw($to, true);
    $bundle = succ_bundle_case($pdo, $caseId, ['media' => true, 'addresses' => true]);
    // de quoi annuler : le lot est gardé (cache du dossier de données)
    $token = bin2hex(random_bytes(12));
    $cache = DATA_DIR . '/cache/succ'; if (!is_dir($cache)) { @mkdir($cache, 0775, true); }
    file_put_contents($cache . '/move-' . $token . '.json', json_encode(['bundle' => $bundle, 'from' => $here, 'to' => $to, 'case_id' => $caseId], JSON_UNESCAPED_UNICODE));
    $line = 'Déplacé de ' . succ_gname($here) . ' vers ' . succ_gname($to) . ' le ' . succ_fr_date();
    $target->beginTransaction();
    try {
        $res = succ_bundle_import($target, $bundle, succ_media_dir_of($to), succ_media_reader(MEDIA_DIR), ['how' => 'move', 'notary_name' => (string) ($c['notary_person_id'] ? succ_person_name($pdo, (int) $c['notary_person_id']) : '')]);
        succ_journal($target, $res['case_id'], 'archive', $line);
        $target->commit();
    } catch (Throwable $e) { if ($target->inTransaction()) { $target->rollBack(); } throw $e; }
    $target = null;
    succ_case_leave($pdo, $caseId, $line, $rm['remove']);
    if (function_exists('log_change')) { log_change($pdo, 'succ_case', $caseId, 'update', 'Dossier de succession déplacé : ' . $c['title'] . ' → ' . succ_gname($to)); }
    return ['to' => $to, 'to_name' => succ_gname($to), 'new_case_id' => $res['case_id'], 'copied' => count($rm['keep']), 'moved' => count($rm['remove']), 'persons' => count($bundle['persons']), 'token' => $token,
        'kept' => $rm['keep']];
}
/** ↶ Annuler un déplacement : le dossier revient, ses fiches sont reposées ici ; la copie de l'autre généalogie est retirée */
function succ_move_undo(PDO $pdo, array $d): array
{
    $token = (string) ($d['token'] ?? ''); if (!preg_match('/^[a-f0-9]{24}$/', $token)) { throw new LcndaBadInput('Rien à annuler.'); }
    $file = DATA_DIR . '/cache/succ/move-' . $token . '.json';
    $saved = is_file($file) ? json_decode((string) file_get_contents($file), true) : null;
    if (!is_array($saved)) { throw new LcndaBadInput('Rien à annuler.'); }
    $newCase = safe_int($d['new_case_id'] ?? 0);
    $caseId = (int) $saved['case_id'];
    // dans l'autre généalogie : retirer la copie (seulement ce que le déplacement a posé)
    $target = succ_open_rw((string) $saved['to']);
    $target->beginTransaction();
    try {
        $s = $target->prepare("SELECT person_id FROM succ_case_persons WHERE case_id=? AND how='move'"); $s->execute([$newCase]);
        $ids = array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN));
        $s = $target->prepare('SELECT deceased_id FROM succ_cases WHERE id=?'); $s->execute([$newCase]); $did = (int) $s->fetchColumn(); if ($did) { $ids[] = $did; }
        $other = []; foreach (succ_select_in($target, 'succ_case_persons', 'person_id', $ids, ' AND case_id<>' . $newCase . ' AND deleted_at IS NULL') as $r) { $other[(int) $r['person_id']] = true; }
        $target->prepare('DELETE FROM succ_case_persons WHERE case_id=?')->execute([$newCase]);
        $target->prepare('UPDATE succ_cases SET deleted_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$newCase]);
        succ_remove_persons($target, array_values(array_filter(array_unique($ids), static fn($x) => !isset($other[$x]))));
        $target->commit();
    } catch (Throwable $e) { if ($target->inTransaction()) { $target->rollBack(); } throw $e; }
    $target = null;
    // ici : le dossier revient avec les fiches qui avaient été retirées (reposées ; celles qui étaient restées ne bougent pas)
    $b = $saved['bundle'];
    $still = [];
    foreach (succ_select_in($pdo, 'persons', 'id', array_map(static fn($p) => (int) $p['id'], $b['persons'])) as $p) { $still[(int) $p['id']] = true; }
    $missing = array_values(array_filter($b['persons'], static fn($p) => !isset($still[(int) $p['id']])));
    $sub = succ_bundle_subset($b, array_map(static fn($p) => (int) $p['id'], $missing));
    $res = succ_bundle_import($pdo, $sub + ['case' => null], MEDIA_DIR, null);
    $map = $res['map'] + array_combine(array_keys($still), array_keys($still));
    $pdo->prepare('UPDATE succ_cases SET deleted_at=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$caseId]);
    foreach ($b['case_persons'] as $r) { if (isset($map[(int) $r['person_id']])) { succ_cp_restore($pdo, $caseId, $map[(int) $r['person_id']], ['role' => $r['role'], 'how' => $r['how']]); } }
    $c = succ_row($pdo, $caseId);
    if (!succ_person_ok($pdo, (int) $c['deceased_id']) && isset($map[(int) $b['case']['deceased_id']])) { $pdo->prepare('UPDATE succ_cases SET deceased_id=? WHERE id=?')->execute([$map[(int) $b['case']['deceased_id']], $caseId]); }
    succ_journal($pdo, $caseId, 'archive', 'Déplacement annulé : le dossier revient dans ' . succ_gname(succ_gid()));
    @unlink($file);
    return ['case_id' => $caseId];
}
/** une partie d'un lot : seulement certaines fiches (et ce qui les touche) */
function succ_bundle_subset(array $b, array $ids): array
{
    $set = array_flip(array_map('intval', $ids));
    $persons = array_values(array_filter($b['persons'], static fn($p) => isset($set[(int) $p['id']])));
    $fam = array_values(array_filter($b['families'], static fn($f) => (!$f['partner1_id'] || isset($set[(int) $f['partner1_id']])) && (!$f['partner2_id'] || isset($set[(int) $f['partner2_id']])) && ($f['partner1_id'] || $f['partner2_id'])));
    $fset = array_flip(array_map(static fn($f) => (int) $f['id'], $fam));
    $ev = array_values(array_filter($b['events'], static fn($e) => ($e['person_id'] && isset($set[(int) $e['person_id']])) || ($e['family_id'] && isset($fset[(int) $e['family_id']]))));
    $eset = array_flip(array_map(static fn($e) => (int) $e['id'], $ev));
    $ent = static fn($r) => ($r['entity_type'] === 'person' && isset($set[(int) $r['entity_id']])) || ($r['entity_type'] === 'event' && isset($eset[(int) $r['entity_id']])) || ($r['entity_type'] === 'family' && isset($fset[(int) $r['entity_id']]));
    return ['persons' => $persons, 'families' => $fam, 'family_children' => array_values(array_filter($b['family_children'], static fn($c) => isset($set[(int) $c['child_id']]) && isset($fset[(int) $c['family_id']]))),
        'events' => $ev, 'event_types' => $b['event_types'], 'places' => $b['places'], 'sources' => $b['sources'], 'source_links' => array_values(array_filter($b['source_links'], $ent)),
        'notes' => array_values(array_filter($b['notes'], $ent)), 'name_variants' => array_values(array_filter($b['name_variants'], static fn($v) => isset($set[(int) $v['person_id']]))),
        'media' => [], 'media_links' => [], 'living_contacts' => array_values(array_filter($b['living_contacts'] ?? [], static fn($v) => isset($set[(int) $v['person_id']])))];
}
/** une généalogie neuve pour les dossiers : base créée, usage successoral allumé, premier écran ⚖️ Successions */
function succ_genealogy_init(string $id): void
{
    $pdo = succ_open_rw($id, true);
    $up = $pdo->prepare('INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING');
    $up->execute(['genealogie-premier', json_encode(['v' => 1, 'usages' => ['genealogie', 'successoral'], 'at' => date('c')])]);
    $up->execute(['genealogie-usage', json_encode(['usages' => ['genealogie', 'successoral'], 'start' => 'successoral'])]);
    $up->execute(['genealogie-menu-successoral', '1']);
}
/** « Dans une généalogie à part » / « Une généalogie par dossier » : la généalogie où ouvrir le prochain dossier */
function succ_target_for_new(array $d): array
{
    $st = succ_settings();
    $mode = in_array($d['store'] ?? '', ['here', 'apart', 'each'], true) ? (string) $d['store'] : $st['store'];
    $patch = ['store' => $mode];
    if ($mode === 'here' || $mode === '') { succ_settings_save($patch); return ['genealogy' => succ_gid(), 'here' => true]; }
    $gs = succ_genealogies();
    if ($mode === 'apart') {
        $id = $st['apart_id'];
        if ($id === '' || !isset($gs[$id])) {
            $id = (string) genealogy_action('genealogy_create', ['name' => i18n_t('⚖️ Dossiers de succession')])['id'];
            succ_genealogy_init($id);
        }
        $patch['apart_id'] = $id;
    } else {
        $name = succ_txt($d['name'] ?? '', 70) ?: i18n_t('⚖️ Dossier de succession');
        $id = (string) genealogy_action('genealogy_create', ['name' => (str_starts_with($name, '⚖️') ? '' : '⚖️ ') . $name])['id'];
        succ_genealogy_init($id);
    }
    succ_settings_save($patch);
    return ['genealogy' => $id, 'here' => $id === succ_gid(), 'name' => succ_gname($id), 'csrf' => function_exists('premier_csrf_for') ? premier_csrf_for($id) : ''];
}

/** ⤓ Reprendre la fiche depuis Ma généalogie : la fiche, jusqu'aux grands-parents et tous leurs descendants connus (sans photos) */
function succ_import_from(PDO $pdo, array $d): array
{
    $from = (string) ($d['from'] ?? '');
    $pid = safe_int($d['person_id'] ?? 0);
    if ($from === succ_gid()) { throw new LcndaBadInput('Choisis une autre généalogie.'); }
    $gs = succ_genealogies(); if (!isset($gs[$from])) { throw new LcndaBadInput('Généalogie introuvable.'); }
    $src = succ_open_ro($gs[$from]['path']); if (!$src) { throw new LcndaBadInput('Cette généalogie est encore vide.'); }
    $s = $src->prepare('SELECT 1 FROM persons WHERE id=?'); $s->execute([$pid]); if (!$s->fetchColumn()) { throw new LcndaBadInput('Fiche introuvable.'); }
    [$up, $down] = succ_links($src);
    $ids = [$pid => true]; $level = [$pid]; $anc = [];
    for ($g = 1; $g <= 2; $g++) { $next = []; foreach ($level as $x) { foreach (array_keys($up[$x] ?? []) as $p) { if (!isset($ids[$p])) { $ids[$p] = true; $next[] = $p; $anc[] = $p; } } } $level = $next; }
    $stack = array_merge([$pid], $anc);
    while ($stack && count($ids) < 5000) { $x = array_pop($stack); foreach (array_keys($down[$x] ?? []) as $k) { if (!isset($ids[$k])) { $ids[$k] = true; $stack[] = $k; } } }
    // les conjoints (le conjoint survivant, le nom d'épouse)
    foreach (array_chunk(array_keys($ids), 400) as $chunk) {
        $in = implode(',', $chunk);
        foreach ($src->query("SELECT partner1_id, partner2_id FROM families WHERE partner1_id IN ($in) OR partner2_id IN ($in)") as $f) { foreach (['partner1_id', 'partner2_id'] as $k) { if ((int) $f[$k]) { $ids[(int) $f[$k]] = true; } } }
    }
    $b = succ_bundle_persons($src, array_keys($ids), ['media' => false, 'contacts' => false]);
    $src = null;
    $res = succ_bundle_import($pdo, $b, MEDIA_DIR, null);
    return ['person_id' => $res['map'][$pid] ?? 0, 'count' => count($res['map']), 'similar' => count($res['similar'])];
}
/** chercher une fiche dans une autre généalogie (lecture seule) */
function succ_other_people(string $from, string $q): array
{
    $gs = succ_genealogies(); if (!isset($gs[$from]) || $from === succ_gid()) { return []; }
    $src = succ_open_ro($gs[$from]['path']); if (!$src) { return []; }
    $q = trim($q); if (mb_strlen($q) < 2) { return []; }
    $where = []; $params = [];
    foreach (array_slice(preg_split('/\s+/u', $q) ?: [], 0, 4) as $w) { $where[] = "(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,'')) LIKE ? COLLATE NOCASE"; $params[] = '%' . $w . '%'; }
    $s = $src->prepare("SELECT p.id, p.first_name, p.last_name, p.living_status, (SELECT MIN(e.year) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='BIRT') AS b,
        (SELECT MIN(e.year) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='DEAT') AS d FROM persons p WHERE " . implode(' AND ', $where) . " AND COALESCE(p.kind,'person')<>'animal' ORDER BY p.last_name COLLATE NOCASE, p.first_name COLLATE NOCASE LIMIT 12");
    $s->execute($params);
    return array_map(static fn($r) => ['id' => (int) $r['id'], 'name' => succ_name($r), 'years' => ($r['b'] || $r['d']) ? ($r['b'] ?: '?') . ($r['d'] ? '-' . $r['d'] : '') : '', 'living_status' => (string) $r['living_status']], $s->fetchAll(PDO::FETCH_ASSOC));
}

/* ═════════ 5c. Archiver un dossier clos dans un fichier, le retirer, le réimporter ═════════ */
function succ_archive_dir(): string { $d = DATA_DIR . '/backups/succ-archives'; if (!is_dir($d)) { @mkdir($d, 0775, true); } return $d; }
function succ_archive_name(array $c, PDO $pdo): string
{
    $dead = succ_person_name($pdo, (int) $c['deceased_id']);
    $last = '';
    if (preg_match('/\b([A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ\'’ -]{1,})$/u', $dead, $m)) { $last = $m[1]; }
    $slug = trim((string) preg_replace('/[^A-Za-z0-9]+/', '-', function_exists('ascii_fold') ? ascii_fold($last) : $last), '-');
    $num = trim((string) preg_replace('/[^A-Za-z0-9-]+/', '-', (string) $c['number']), '-') ?: (string) $c['id'];
    return 'dossier-' . $num . ($slug !== '' ? '-' . strtoupper($slug) : '') . SUCC_ARCHIVE_EXT;
}
/** 🗄 le fichier (dossier, journal, pièces et leurs images, courriers, arbre SVG, tableau du notaire, fiches), puis le retrait */
function succ_archive_file(PDO $pdo, array $d): array
{
    $caseId = safe_int($d['id'] ?? 0); $c = succ_row($pdo, $caseId);
    if (!in_array($c['state'], ['clos', 'archive'], true)) { throw new LcndaBadInput('Seul un dossier clos peut être archivé.'); }
    $keep = array_key_exists('keep_addresses', $d) ? !empty($d['keep_addresses']) : succ_settings()['archive_addresses'] === 'keep';
    $bundle = succ_bundle_case($pdo, $caseId, ['media' => true, 'addresses' => $keep]);
    $rm = succ_case_removable($pdo, $caseId);
    $name = succ_archive_name($c, $pdo);
    $path = succ_archive_dir() . '/' . date('Ymd-His') . '-' . $name;
    $zip = new ZipArchive();
    if ($zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) { throw new RuntimeException('Impossible de créer le fichier d’archive.'); }
    $zip->addFromString('dossier.json', (string) json_encode($bundle, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    $svg = is_string($d['svg'] ?? null) && str_starts_with(trim($d['svg']), '<svg') ? (string) $d['svg'] : '';
    if ($svg !== '' && strlen($svg) < 4000000) { $zip->addFromString('arbre-devolution.svg', $svg); }
    $html = is_string($d['notary_html'] ?? null) ? (string) $d['notary_html'] : '';
    if ($html !== '' && strlen($html) < 8000000) { $zip->addFromString('tableau-notaire.html', "<!doctype html><meta charset=\"utf-8\"><title>" . htmlspecialchars((string) $c['title'], ENT_QUOTES) . "</title>\n" . $html); }
    foreach ($bundle['media'] as $m) {
        foreach (['filename', 'thumbnail'] as $col) { $fn = (string) ($m[$col] ?? ''); if ($fn !== '' && !str_contains($fn, '..') && is_file(MEDIA_DIR . '/' . $fn)) { $zip->addFile(MEDIA_DIR . '/' . $fn, 'medias/' . $fn); } }
    }
    $zip->addFromString('LISEZMOI.txt', "Archive d’un dossier de succession (LCNDA). À réimporter dans l’app : ⚖️ Successions → ⋯ → ⤒ Réimporter un dossier archivé…\nAdresses des vivants : " . ($keep ? 'gardées' : 'retirées') . "\n");
    $zip->close();
    $line = 'Archivé dans le fichier ' . $name . ' (' . count($bundle['persons']) . ' fiches' . ($keep ? ', adresses gardées' : ', adresses retirées') . ') puis retiré de la base';
    succ_case_leave($pdo, $caseId, $line, $rm['remove']);
    if (function_exists('log_change')) { log_change($pdo, 'succ_case', $caseId, 'delete', 'Dossier de succession archivé dans un fichier : ' . $c['title']); }
    $token = substr(basename($path), 0, -strlen(SUCC_ARCHIVE_EXT));
    return ['file' => $name, 'token' => basename($path), 'persons' => count($bundle['persons']), 'removed' => count($rm['remove']), 'kept' => count($rm['keep']), 'addresses' => $keep, 'case_id' => $caseId, 'stem' => $token];
}
function succ_archive_path(string $token): string
{
    if (!preg_match('/^\d{8}-\d{6}-dossier-[A-Za-z0-9-]+\.lcnda-succ\.zip$/', $token)) { throw new LcndaBadInput('Fichier introuvable.'); }
    $p = succ_archive_dir() . '/' . $token;
    if (!is_file($p)) { throw new LcndaBadInput('Fichier introuvable.'); }
    return $p;
}
/** lire une archive : le lot et ses médias */
function succ_archive_read(string $path): array
{
    $zip = new ZipArchive();
    if ($zip->open($path) !== true) { throw new LcndaBadInput('Ce fichier n’est pas une archive de dossier de succession.'); }
    $raw = $zip->getFromName('dossier.json');
    $b = is_string($raw) ? json_decode($raw, true) : null;
    if (!is_array($b) || ($b['format'] ?? '') !== 'lcnda-succ' || !is_array($b['case'] ?? null) || !is_array($b['persons'] ?? null)) { $zip->close(); throw new LcndaBadInput('Ce fichier n’est pas une archive de dossier de succession.'); }
    foreach (['families', 'family_children', 'events', 'event_types', 'places', 'sources', 'source_links', 'notes', 'name_variants', 'media', 'media_links', 'living_contacts', 'case_persons', 'deadlines', 'pieces', 'journal', 'fees', 'courriers'] as $k) { if (!is_array($b[$k] ?? null)) { $b[$k] = []; } }
    return [$b, $zip];
}
function succ_archive_upload(): string
{
    $f = $_FILES['file'] ?? null;
    if (!$f || (int) ($f['error'] ?? 1) !== UPLOAD_ERR_OK || !is_uploaded_file((string) $f['tmp_name'])) { throw new LcndaBadInput('Le fichier n’a pas été reçu.'); }
    if ((int) $f['size'] > 200 * 1048576) { throw new LcndaBadInput('Fichier trop gros.'); }
    $name = date('Ymd-His') . '-dossier-reimport-' . bin2hex(random_bytes(3)) . SUCC_ARCHIVE_EXT;
    $dest = succ_archive_dir() . '/' . $name;
    if (!move_uploaded_file((string) $f['tmp_name'], $dest)) { throw new LcndaBadInput('Le fichier n’a pas été reçu.'); }
    [$b, $zip] = succ_archive_read($dest); $zip->close();
    return $name;
}
/** ⤒ ce que contient l'archive, avant de la réimporter (les fiches qui ressemblent à des fiches déjà là) */
function succ_reimport_preview(PDO $pdo, string $token, string $to): array
{
    [$b, $zip] = succ_archive_read(succ_archive_path($token)); $zip->close();
    $target = $to === succ_gid() ? $pdo : (succ_open_ro(succ_genealogies()[$to]['path'] ?? '') ?? null);
    $similar = [];
    if ($target) {
        $existing = [];
        foreach ($target->query('SELECT first_name, last_name FROM persons') as $p) { $existing[succ_fold_name((string) $p['first_name']) . '|' . succ_fold_name((string) $p['last_name'])] = true; }
        foreach ($b['persons'] as $p) { $k = succ_fold_name((string) $p['first_name']) . '|' . succ_fold_name((string) $p['last_name']); if (isset($existing[$k]) && !str_starts_with($k, '|')) { $similar[] = succ_name($p); } }
    }
    $dead = null; foreach ($b['persons'] as $p) { if ((int) $p['id'] === (int) $b['case']['deceased_id']) { $dead = $p; } }
    $closed = ''; foreach (array_reverse($b['journal']) as $j) { if (str_contains((string) $j['text'], '→ Clos')) { $closed = substr((string) $j['at'], 0, 10); break; } }
    return ['token' => $token, 'number' => (string) $b['case']['number'], 'title' => (string) $b['case']['title'], 'deceased' => $dead ? succ_name($dead) : '', 'closed' => $closed,
        'persons' => count($b['persons']), 'addresses' => !empty($b['addresses']), 'similar' => array_values(array_unique($similar)), 'media' => count($b['media'])];
}
function succ_reimport(PDO $pdo, array $d): array
{
    $token = (string) ($d['token'] ?? ''); $path = succ_archive_path($token);
    $to = (string) ($d['to'] ?? succ_gid());
    $gs = succ_genealogies(); if (!isset($gs[$to])) { throw new LcndaBadInput('Généalogie introuvable.'); }
    [$b, $zip] = succ_archive_read($path);
    $reader = static function (string $fn) use ($zip): ?string { $v = $zip->getFromName('medias/' . $fn); return is_string($v) ? $v : null; };
    $here = $to === succ_gid();
    $target = $here ? $pdo : succ_open_rw($to);
    if (!$here) { $target->beginTransaction(); }
    try {
        $res = succ_bundle_import($target, $b, succ_media_dir_of($to), $reader, ['how' => 'import', 'state' => 'clos']);
        succ_journal($target, $res['case_id'], 'archive', 'Réimporté depuis le fichier ' . preg_replace('/^\d{8}-\d{6}-/', '', basename($path)) . ($res['similar'] ? ' ; ' . count($res['similar']) . ' fiche(s) à comparer' : ''));
        if (!$here) { $target->commit(); }
    } catch (Throwable $e) { if (!$here && $target->inTransaction()) { $target->rollBack(); } $zip->close(); throw $e; }
    $zip->close();
    return ['case_id' => $res['case_id'], 'to' => $to, 'here' => $here, 'persons' => count($res['map']), 'similar' => array_map(static fn($x) => ['id' => $x[0], 'other_id' => $x[1], 'name' => $x[2]], $res['similar'])];
}
/** ↶ Annuler un réimport (ici) : le dossier et les fiches qu'il a posées sont retirés */
function succ_reimport_undo(PDO $pdo, array $d): array
{
    $caseId = safe_int($d['case_id'] ?? 0); succ_row($pdo, $caseId);
    $s = $pdo->prepare("SELECT person_id FROM succ_case_persons WHERE case_id=? AND how IN ('import','open')"); $s->execute([$caseId]);
    $ids = array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN));
    $other = []; foreach (succ_select_in($pdo, 'succ_case_persons', 'person_id', $ids, ' AND case_id<>' . $caseId . ' AND deleted_at IS NULL') as $r) { $other[(int) $r['person_id']] = true; }
    $pdo->prepare('UPDATE succ_cases SET deleted_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$caseId]);
    $pdo->prepare('DELETE FROM succ_case_persons WHERE case_id=?')->execute([$caseId]);
    succ_remove_persons($pdo, array_values(array_filter($ids, static fn($x) => !isset($other[$x]))));
    return ['ok' => true];
}
/** l'avancement calculé par le navigateur (heritage-successoral-core.js, progress) : gardé pour la vue d'ensemble */
function succ_progress_save(PDO $pdo, array $d): array
{
    $id = safe_int($d['case_id'] ?? 0); succ_row($pdo, $id);
    $pct = max(0, min(100, safe_int($d['pct'] ?? 0)));
    $steps = [];
    foreach (array_slice(is_array($d['steps'] ?? null) ? $d['steps'] : [], 0, 7) as $s) {
        if (!is_array($s)) { continue; }
        $steps[] = ['frac' => max(0, min(1, round((float) ($s['frac'] ?? 0), 3))), 'done' => max(0, safe_int($s['done'] ?? 0)), 'total' => max(0, safe_int($s['total'] ?? 0))];
    }
    $pieces = is_array($d['pieces'] ?? null) ? ['have' => max(0, safe_int($d['pieces']['have'] ?? 0)), 'total' => max(0, safe_int($d['pieces']['total'] ?? 0))] : null;
    $heirs = is_array($d['heirs'] ?? null) ? ['found' => max(0, safe_int($d['heirs']['found'] ?? 0)), 'unknown' => max(0, safe_int($d['heirs']['unknown'] ?? 0))] : null;
    $pdo->prepare('UPDATE succ_cases SET progress=?, progress_json=? WHERE id=?')->execute([$pct, json_encode(['steps' => $steps, 'pieces' => $pieces, 'heirs' => $heirs, 'at' => date('c')], JSON_UNESCAPED_UNICODE), $id]);
    return ['ok' => true];
}

/* ═════════ API (appelée par successoral_api_get / successoral_api_post) ═════════ */
function succ_dossiers_get(PDO $pdo, string $op, array $g): ?array
{
    succ_dossiers_ensure($pdo);
    return match ($op) {
        'index' => succ_index($pdo),
        'settings' => ['settings' => succ_settings(), 'genealogies' => array_values(array_map(static fn($x) => array_diff_key($x, ['path' => 1]), succ_genealogies())), 'current' => succ_gid()],
        'case_people' => ['items' => succ_case_people($pdo, safe_int($g['case_id'] ?? 0)), 'homonyms' => succ_homonyms($pdo, safe_int($g['case_id'] ?? 0))],
        'person_cases' => ['items' => succ_person_cases($pdo, safe_int($g['person_id'] ?? 0))],
        'membership' => ['members' => (object) succ_membership($pdo)],
        'by_case' => succ_people_by_case($pdo, scalar_text($g['q'] ?? '', 'q')),
        'without' => succ_people_without($pdo, scalar_text($g['q'] ?? '', 'q'), safe_int($g['offset'] ?? 0)),
        'filter_ids' => ['ids' => succ_filter_person_ids($pdo, array_map('intval', array_filter(explode(',', (string) ($g['cases'] ?? '')))))],
        'homonyms' => ['items' => succ_homonyms($pdo, safe_int($g['case_id'] ?? 0))],
        'merge_check' => succ_merge_check($pdo, safe_int($g['a'] ?? 0), safe_int($g['b'] ?? 0)),
        'removable' => succ_case_removable($pdo, safe_int($g['case_id'] ?? 0)),
        'auto_recent' => succ_auto_recent($pdo, safe_int($g['after'] ?? 0)),
        'other_people' => ['items' => succ_other_people((string) ($g['from'] ?? ''), scalar_text($g['q'] ?? '', 'q'))],
        'reimport_preview' => succ_reimport_preview($pdo, (string) ($g['token'] ?? ''), (string) ($g['to'] ?? succ_gid())),
        default => null,
    };
}
function succ_dossiers_post(PDO $pdo, string $op, array $d): ?array
{
    succ_dossiers_ensure($pdo);
    $cid = static fn() => safe_int($d['case_id'] ?? 0);
    return match ($op) {
        'settings_save' => succ_settings_save(is_array($d['settings'] ?? null) ? $d['settings'] : []),
        'target' => succ_target_for_new($d),
        'attach' => (static function () use ($pdo, $d, $cid) {
            $c = succ_row($pdo, $cid()); $pid = safe_int($d['person_id'] ?? 0); if (!succ_person_ok($pdo, $pid)) { throw new LcndaBadInput('Fiche introuvable.'); }
            $r = succ_attach($pdo, (int) $c['id'], $pid, (string) ($d['role'] ?? 'verify'), (string) ($d['how'] ?? 'hand'));
            if (empty($d['quiet'])) { succ_journal($pdo, (int) $c['id'], 'edit', 'Fiche rattachée : ' . succ_person_name($pdo, $pid) . ' (' . (SUCC_ROLE_LABELS[(string) ($d['role'] ?? 'verify')] ?? '') . ')'); }
            return ['case_id' => (int) $c['id'], 'person_id' => $pid, 'prev' => $r['prev']];
        })(),
        'detach' => (static function () use ($pdo, $d, $cid) {
            $c = succ_row($pdo, $cid()); $pid = safe_int($d['person_id'] ?? 0);
            if ($pid === (int) $c['deceased_id']) { throw new LcndaBadInput('Le défunt reste dans son dossier.'); }
            $r = succ_detach($pdo, (int) $c['id'], $pid);
            succ_journal($pdo, (int) $c['id'], 'edit', 'Fiche retirée du dossier : ' . succ_person_name($pdo, $pid));
            return ['case_id' => (int) $c['id'], 'person_id' => $pid, 'prev' => $r['prev']];
        })(),
        'contact_state' => succ_contact_set($pdo, $d),
        'cp_restore' => (static function () use ($pdo, $d, $cid) { $c = succ_row($pdo, $cid()); succ_cp_restore($pdo, (int) $c['id'], safe_int($d['person_id'] ?? 0), $d['prev'] ?? null); return ['ok' => true]; })(),
        'person_roles' => (static function () use ($pdo, $d) {
            $pid = safe_int($d['person_id'] ?? 0); if (!succ_person_ok($pdo, $pid)) { throw new LcndaBadInput('Fiche introuvable.'); }
            $prev = [];
            foreach (is_array($d['roles'] ?? null) ? $d['roles'] : [] as $caseId => $role) {
                $caseId = (int) $caseId; $c = succ_row($pdo, $caseId); $role = (string) $role;
                $old = succ_cp_row($pdo, $caseId, $pid);
                $was = $old && $old['deleted_at'] === null ? (string) $old['role'] : '';
                if ($was === $role) { continue; }
                if ($role === '' && $pid === (int) $c['deceased_id']) { throw new LcndaBadInput('Le défunt reste dans son dossier.'); }
                $prev[(string) $caseId] = $old;
                if ($role === '') { succ_detach($pdo, $caseId, $pid); succ_journal($pdo, $caseId, 'edit', 'Fiche retirée du dossier : ' . succ_person_name($pdo, $pid)); }
                else { succ_attach($pdo, $caseId, $pid, $role, 'hand'); succ_journal($pdo, $caseId, 'edit', 'Fiche rattachée : ' . succ_person_name($pdo, $pid) . ' (' . (SUCC_ROLE_LABELS[$role] ?? $role) . ')'); }
            }
            return ['person_id' => $pid, 'prev' => (object) $prev];
        })(),
        'person_roles_undo' => (static function () use ($pdo, $d) {
            $pid = safe_int($d['person_id'] ?? 0);
            foreach (is_array($d['prev'] ?? null) ? $d['prev'] : [] as $caseId => $old) { succ_row($pdo, (int) $caseId); succ_cp_restore($pdo, (int) $caseId, $pid, $old); }
            return ['ok' => true];
        })(),
        'sync_calc' => succ_sync_calc($pdo, $cid(), is_array($d['heirs'] ?? null) ? $d['heirs'] : [], is_array($d['inter'] ?? null) ? $d['inter'] : []),
        'progress' => succ_progress_save($pdo, $d),
        'homonym_no' => succ_homonym_no($pdo, safe_int($d['a'] ?? 0), safe_int($d['b'] ?? 0)),
        'homonym_no_undo' => (static function () use ($pdo, $d) { $a = safe_int($d['a'] ?? 0); $b = safe_int($d['b'] ?? 0); $pdo->prepare('DELETE FROM succ_homonym_no WHERE a=? AND b=?')->execute([min($a, $b), max($a, $b)]); return ['ok' => true]; })(),
        'homonym_same' => (static function () use ($pdo, $d, $cid) {
            $c = succ_row($pdo, $cid()); $other = safe_int($d['other_id'] ?? 0); if (!succ_person_ok($pdo, $other)) { throw new LcndaBadInput('Fiche introuvable.'); }
            $r = succ_attach($pdo, (int) $c['id'], $other, 'verify', 'homonym');
            succ_journal($pdo, (int) $c['id'], 'edit', 'Homonyme rattaché aussi (même personne ?) : ' . succ_person_name($pdo, $other));
            return ['case_id' => (int) $c['id'], 'person_id' => $other, 'prev' => $r['prev']];
        })(),
        'move' => succ_move($pdo, $d),
        'move_undo' => succ_move_undo($pdo, $d),
        'import_from' => succ_import_from($pdo, $d),
        'archive_file' => succ_archive_file($pdo, $d),
        'reimport_upload' => ['token' => succ_archive_upload()],
        'reimport' => succ_reimport($pdo, $d),
        'reimport_undo' => succ_reimport_undo($pdo, $d),
        'merge_journal' => (static function () use ($pdo, $d) { // « Fusionner quand même » : noté avant la fusion dans les deux dossiers
            $a = safe_int($d['a'] ?? 0); $b = safe_int($d['b'] ?? 0); $info = succ_merge_check($pdo, $a, $b);
            foreach (array_unique(array_merge(array_column($info['a']['cases'], 'case_id'), array_column($info['b']['cases'], 'case_id'))) as $id) { succ_journal($pdo, (int) $id, 'calc', 'Fusion demandée malgré l’avertissement : ' . $info['a']['name'] . ' et ' . $info['b']['name'] . ' (dossiers différents)'); }
            return ['ok' => true];
        })(),
        default => null,
    };
}
/** télécharger une archive (GET successoral&op=archive_download&token=…) */
function succ_archive_download(string $token): never
{
    $path = succ_archive_path($token);
    $name = preg_replace('/^\d{8}-\d{6}-/', '', basename($path));
    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="' . $name . '"');
    header('Content-Length: ' . filesize($path));
    header('X-Content-Type-Options: nosniff');
    readfile($path);
    exit;
}
