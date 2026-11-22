<?php
declare(strict_types=1);

/**
 * 🧩 Compléter quatre choses qui existent déjà (maquette validée docs/design/complements-existants.html) :
 *  A 🏛 études de notaire (lib/etudes_notaire.php) : une étude = un service d'archives de la sorte « notary » ; ses notaires et
 *    clercs (archive_service_people), ses dossiers (succ_cases.notary_service_id), ses courriers (courriers.archive_service_id),
 *    le délai de réponse constaté (courriers.recu_le, jamais un délai légal) ; regroupement des notaires tapés à la main, proposé ;
 *  B ⚠️ homonyme avant de contacter un héritier (lib/homonymes_contact.php : succ_homonyms() élargi à toute la base) ;
 *  C 📋 tous les doutes (lib/doutes.php : lecture seule des outils d'origine, marques « vu » dans app_settings) ;
 *  D 📱 visite aux archives sur téléphone (lib/visite_mobile.php : page .html autonome, retour en .zip vérifié, ↶ Annuler).
 * Chaque choix de la maquette est un réglage (COMPL_SPEC, la valeur conseillée d'abord), rangé dans app_settings
 * (clé « lcnda-complements », jamais écrite par save_settings ni en mode consultation).
 * Lecture : GET compl&op=… ; exports : GET compl_export&op=… (refusés en mode consultation, notés dans « Qui a vu quoi ») ;
 * écritures : POST compl_write {op} par handle_write (api.php), donc transaction, glock_guard et kiosk_guard d'abord.
 * L'app ne calcule aucun délai légal et ne rédige aucun texte juridique.
 */

require_once __DIR__ . '/etudes_notaire.php';
require_once __DIR__ . '/homonymes_contact.php';
require_once __DIR__ . '/doutes.php';
require_once __DIR__ . '/visite_mobile.php';

const COMPL_SETTINGS_KEY = 'lcnda-complements';
/** Les réglages : clé => options permises, la conseillée d'abord (c'est elle qui est réglée au départ). */
const COMPL_SPEC = [
    // A 🏛 études de notaire
    'etude_where' => ['services', 'separate'], 'delay_stat' => ['mean', 'median', 'none'], 'delay_min' => [3, 5, 1], 'delay_scope' => ['3y', 'all'],
    'picker_typed' => ['with', 'offices'], 'notary_pick' => ['optional', 'office'], 'group_check' => ['agree', 'none'], 'group_banner' => ['show', 'never'],
    // B ⚠️ homonymes
    'hom_years' => [2, 5, 10], 'hom_place' => ['dept', 'commune', 'any'], 'hom_when' => ['each', 'first', 'never'], 'hom_after_ok' => ['again', 'case'], 'hom_scope' => ['base', 'cases'],
    // C 📋 doutes
    'doutes_name' => ['all', 'verify', 'review'], 'doutes_nosource' => ['sosa', 'all', 'none'], 'doutes_seen_back' => ['again', 'never'], 'doutes_seen_show' => ['hide', 'pale'],
    'doutes_succ' => ['apart', 'with'], 'doutes_widget' => ['numbers', 'top5'],
    // D 📱 visite aux archives
    'visite_mode' => ['page', 'paper'], 'visite_living' => ['no', 'yes'], 'visite_photo_px' => [2000, 0], 'visite_found' => ['digest', 'propose'], 'visite_done' => ['auto', 'manual'],
];

function compl_defaults(): array { return array_map(static fn(array $o) => $o[0], COMPL_SPEC); }

function compl_settings(PDO $pdo): array
{
    $raw = null;
    try { $raw = $pdo->query("SELECT value FROM app_settings WHERE key='" . COMPL_SETTINGS_KEY . "'")->fetchColumn(); } catch (Throwable $_) {}
    $j = json_decode((string) ($raw ?: ''), true);
    $out = compl_defaults();
    if (is_array($j)) { foreach (COMPL_SPEC as $key => $opts) { if (array_key_exists($key, $j) && in_array($j[$key], $opts, true)) { $out[$key] = $j[$key]; } } }
    return $out;
}

/** Enregistre seulement les valeurs permises ; une clé ou une valeur inconnue est ignorée. Rend les réglages d'avant (↶). */
function compl_settings_save(PDO $pdo, array $d): array
{
    $prev = compl_settings($pdo);
    $in = is_array($d['settings'] ?? null) ? $d['settings'] : [];
    $next = $prev;
    foreach ($in as $key => $v) {
        if (!is_string($key) || !isset(COMPL_SPEC[$key])) { continue; }
        foreach (COMPL_SPEC[$key] as $opt) { if ((string) $opt === (string) $v) { $next[$key] = $opt; } }
    }
    $pdo->prepare('INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP')
        ->execute([COMPL_SETTINGS_KEY, json_encode($next, JSON_UNESCAPED_UNICODE)]);
    return ['settings' => $next, 'prev' => $prev];
}

/* ═════════ outils communs ═════════ */
function compl_kiosk(): bool { return function_exists('kiosk_state') && !empty(kiosk_state()['on']); }
function compl_has(PDO $pdo, string $table, string $col = ''): bool
{
    try {
        if ($col === '') { return (bool) $pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name=" . $pdo->quote($table))->fetchColumn(); }
        foreach ($pdo->query('PRAGMA table_info(' . preg_replace('/\W/', '', $table) . ')') as $c) { if ($c['name'] === $col) { return true; } }
    } catch (Throwable $_) {}
    return false;
}
function compl_txt(mixed $v, int $max, bool $multi = false): string
{
    $s = is_scalar($v) ? (string) $v : '';
    $s = (string) preg_replace($multi ? '/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u' : '/[\x00-\x1F\x7F]/u', $multi ? '' : ' ', $s);
    return mb_substr(trim($s), 0, $max);
}
function compl_date_ok(string $d): bool { return (bool) preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) && checkdate((int) substr($d, 5, 2), (int) substr($d, 8, 2), (int) substr($d, 0, 4)); }
function compl_fold(string $s): string { return trim((string) preg_replace('/\s+/', ' ', (string) preg_replace('/[^a-z0-9]+/', ' ', strtolower(function_exists('ascii_fold') ? ascii_fold($s) : $s)))); }
function compl_person_name(array $p): string { return trim(trim((string) ($p['first_name'] ?? '')) . ' ' . mb_strtoupper(trim((string) ($p['last_name'] ?? '')))); }
function compl_ids(mixed $raw, int $max = 500): array
{
    $list = is_array($raw) ? $raw : explode(',', is_scalar($raw) ? (string) $raw : '');
    return array_slice(array_values(array_unique(array_filter(array_map(static fn($v) => safe_int(is_string($v) ? trim($v) : $v), $list), static fn(int $v) => $v > 0))), 0, $max);
}

/** Structure n°98 (lib/migrations.php) : idempotente, chaque colonne n'est ajoutée que si elle manque. */
function compl_schema(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS archive_service_people (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        service_id INTEGER NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL DEFAULT 'notary',
        person_id INTEGER,
        phone TEXT NOT NULL DEFAULT '',
        since TEXT NOT NULL DEFAULT '',
        until TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        position INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_archive_service_people ON archive_service_people(service_id, deleted_at)');
    $add = static function (string $t, string $c, string $def) use ($pdo): void { if (compl_has($pdo, $t) && !compl_has($pdo, $t, $c)) { $pdo->exec("ALTER TABLE $t ADD COLUMN $c $def"); } };
    $add('succ_cases', 'notary_service_id', 'INTEGER');
    $add('succ_cases', 'notary_people_id', 'INTEGER');
    $add('courriers', 'archive_service_id', 'INTEGER');
    $add('courriers', 'recu_le', "TEXT NOT NULL DEFAULT ''");
    $add('archive_visit_plans', 'succ_case_id', 'INTEGER');
    $add('archive_visit_plans', 'export_uid', "TEXT NOT NULL DEFAULT ''");
    $add('archive_visit_plans', 'export_sum', "TEXT NOT NULL DEFAULT ''");
    $add('archive_visit_plans', 'imported_at', "TEXT NOT NULL DEFAULT ''");
    $add('archive_visit_plans', 'photos_off', 'INTEGER NOT NULL DEFAULT 0');
    $add('archive_visit_plans', 'import_json', "TEXT NOT NULL DEFAULT ''");
    $add('archive_visit_items', 'person_id', 'INTEGER');
    $add('archive_visit_items', 'act_kind', "TEXT NOT NULL DEFAULT ''");
    if (compl_has($pdo, 'succ_cases', 'notary_service_id')) { $pdo->exec('CREATE INDEX IF NOT EXISTS idx_succ_cases_notary_service ON succ_cases(notary_service_id)'); }
    if (compl_has($pdo, 'courriers', 'archive_service_id')) { $pdo->exec('CREATE INDEX IF NOT EXISTS idx_courriers_archive_service ON courriers(archive_service_id)'); }
}
function compl_ready(PDO $pdo): bool
{
    static $ok = [];
    $k = spl_object_id($pdo);
    return $ok[$k] ??= compl_has($pdo, 'archive_service_people') && compl_has($pdo, 'courriers', 'recu_le') && compl_has($pdo, 'archive_visit_items', 'act_kind');
}
function compl_need(PDO $pdo): void { if (!compl_ready($pdo)) { throw new RuntimeException('Ces outils ne sont pas encore prêts : relance l’app.'); } }

/* ═════════ 📮 la date de réponse d'un courrier (courriers.recu_le) ═════════ */
/** Après « ✓ Réponse reçue » (Registre, Ma semaine, cloche, dossier) : la date du jour si aucune n'est notée. Jamais deviné avec updated_at. */
function compl_courrier_received(PDO $pdo, int $id, ?string $day = null): void
{
    if ($id <= 0 || !compl_has($pdo, 'courriers', 'recu_le')) { return; }
    $day = $day !== null && compl_date_ok($day) ? $day : date('Y-m-d');
    $pdo->prepare("UPDATE courriers SET recu_le=? WHERE id=? AND COALESCE(recu_le,'')='' AND statut='reponse_recue'")->execute([$day, $id]);
}
/** Le formulaire du Registre : « Réponse reçue le » modifiable (vide = rien de noté). */
function compl_courrier_store(PDO $pdo, int $id, array $data, string $oldStatut): void
{
    if ($id <= 0 || !compl_has($pdo, 'courriers', 'recu_le')) { return; }
    $given = array_key_exists('recu_le', $data) ? compl_txt($data['recu_le'], 10) : null;
    if ($given !== null && ($given !== '' || $oldStatut === 'reponse_recue' || !compl_has_received($pdo, $id))) {
        if ($given !== '' && !compl_date_ok($given)) { throw new RuntimeException('Date de réponse incorrecte.'); }
        $pdo->prepare('UPDATE courriers SET recu_le=? WHERE id=?')->execute([$given, $id]);
    }
    if (array_key_exists('archive_service_id', $data) && compl_has($pdo, 'courriers', 'archive_service_id')) {
        $sid = safe_int($data['archive_service_id']);
        $pdo->prepare('UPDATE courriers SET archive_service_id=? WHERE id=?')->execute([$sid > 0 && archive_service_row($pdo, $sid) ? $sid : null, $id]);
    }
    if ($oldStatut !== 'reponse_recue' && ($given === null || $given === '')) { compl_courrier_received($pdo, $id); }
}
function compl_has_received(PDO $pdo, int $id): bool { $s = $pdo->prepare("SELECT statut='reponse_recue' FROM courriers WHERE id=?"); $s->execute([$id]); return (bool) $s->fetchColumn(); }

/* ═════════ lecture, exports, écritures ═════════ */
function compl_get(PDO $pdo, string $action): never
{
    try {
        $op = (string) ($_GET['op'] ?? '');
        if ($action === 'compl_export') {
            if (compl_kiosk()) { json_response(['error' => 'Mode consultation : pas d’export.', 'kiosk' => true], 423); }
            if ($op === 'doutes_csv') { doutes_csv($pdo, $_GET); }
            json_response(['error' => 'Export inconnu.'], 400);
        }
        $out = match ($op) {
            'settings' => ['settings' => compl_settings($pdo), 'spec' => COMPL_SPEC, 'kiosk' => compl_kiosk()],
            'etudes' => etudes_list($pdo),
            'etude' => etude_sheet($pdo, safe_int($_GET['id'] ?? 0)),
            'etudes_group' => etudes_group_proposals($pdo),
            'etude_case' => etude_case_info($pdo, safe_int($_GET['case_id'] ?? 0)),
            'homonym_check' => homonym_check($pdo, safe_int($_GET['case_id'] ?? 0), compl_ids($_GET['person_ids'] ?? '', 40), (string) ($_GET['where'] ?? 'letter')),
            'doutes' => doutes_data($pdo, $_GET),
            'doutes_summary' => doutes_summary($pdo),
            'visite' => visite_get($pdo, safe_int($_GET['id'] ?? 0)),
            default => throw new LcndaBadInput('Opération inconnue.'),
        };
        json_response($out);
    } catch (LcndaBadInput $e) {
        json_response(['error' => $e->getMessage()], 422);
    } catch (RuntimeException $e) {
        json_response(['error' => $e->getMessage()], str_contains($e->getMessage(), 'consultation') ? 403 : 422);
    }
}

/** POST compl_write (dans handle_write : transaction, verrou, mode consultation déjà vérifiés). */
function compl_write(PDO $pdo, array $d): array
{
    $op = scalar_text($d['op'] ?? '', 'op');
    if ($op !== 'settings_save') { compl_need($pdo); }
    return match ($op) {
        'settings_save' => compl_settings_save($pdo, $d),
        // A 🏛
        'etude_person_save' => etude_person_save($pdo, $d),
        'etude_person_delete' => etude_person_delete($pdo, $d, false),
        'etude_person_restore' => etude_person_delete($pdo, $d, true),
        'etude_case_set' => etude_case_set($pdo, $d),
        'etude_courrier_save' => etude_courrier_save($pdo, $d),
        'courrier_recu' => etude_courrier_recu($pdo, $d),
        'etudes_group_apply' => etudes_group_apply($pdo, $d),
        'etudes_group_undo' => etudes_group_undo($pdo),
        // B ⚠️
        'homonym_ok' => homonym_ok($pdo, $d),
        'homonym_no' => homonym_no($pdo, $d),
        'homonym_no_undo' => homonym_no_undo($pdo, $d),
        // C 📋
        'doute_vu' => doute_vu($pdo, $d),
        'doute_vu_undo' => doute_vu_undo($pdo, $d),
        // D 📱
        'visite_prepare' => visite_prepare($pdo, $d),
        'visite_prepare_undo' => visite_prepare_undo($pdo, $d),
        'visite_render' => visite_render($pdo, $d),
        'visite_analyze' => visite_analyze($pdo, $d, $_FILES['file'] ?? null),
        'visite_import' => visite_import($pdo, $d, $_FILES['file'] ?? null),
        'visite_import_undo' => visite_import_undo($pdo, $d),
        'visite_photos' => visite_photos_import($pdo, $d, $_FILES['photos'] ?? null),
        'visite_photos_undo' => visite_photos_undo($pdo, $d),
        default => throw new LcndaBadInput('Opération inconnue.'),
    };
}
