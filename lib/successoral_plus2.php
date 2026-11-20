<?php
declare(strict_types=1);

/**
 * ⚖️ Successoral : quinze outils de plus et cinq idées (maquette validée docs/design/successoral-plus-2.html).
 * Écrans : assets/js/heritage-successoral-plus2.js (et -plus2b.js) ; calculs sans écran : heritage-successoral-plus2-core.js ;
 * factures, fonds et activité : lib/successoral_factures.php ; essais : tests/test-successoral-plus2*.js.
 *
 * Règle commune : l'app range, compare, rappelle et met en page ; elle ne décide jamais. Aucun héritier n'est déclaré mort
 * sans un clic, aucun texte juridique n'est écrit par l'app, aucun délai légal n'est calculé, aucun taux de TVA ni mention
 * légale n'est choisi, aucun service extérieur n'est interrogé (ni La Poste, ni une adresse envoyée en ligne).
 * Chaque choix de la maquette est un réglage (successoral.json, clé « p2 » ; « cabinet » pour 🏢 Mon cabinet), l'option
 * conseillée par défaut.
 *
 *  1 ⚰️ décès INSEE (succ_insee_checks) · 2 📋 questionnaire (succ_questionnaires) · 3 📞 échanges (succ_calls) ·
 *  4 📮 recommandés (colonnes de courriers) · 5 🧾 factures · 6 📈 activité · 10 💶 fonds (successoral_factures.php) ·
 *  7 🤝 copie pour le notaire (fabriquée et chiffrée dans le navigateur ; ici, seulement la liste des copies et le registre) ·
 *  8 🗺 carte (lecture seule, aucune adresse envoyée) · 9 📝 contrat (succ_template_versions, courriers.template_version) ·
 *  11 🔗 double preuve (options_json.one_piece_ok) · 12 🗓 dates importantes (colonnes de succ_deadlines) ·
 *  13 👥 fusion (succ_cases.merged_into, origin_case_id) · 14 🕵️ recherches (lecture du Journal des recherches) ·
 *  15 📦 archive chiffrée ; idées : dossier lié, une lettre par service, délai par organisme, date de délivrance, écran partagé.
 * Migration 97 (96 : recherche à la française, autre chantier).
 */

require_once __DIR__ . '/successoral_factures.php';

/** les réglages : [valeur par défaut, valeurs permises (ou 'int:min:max' / 'text:max' / 'url')] */
const SUCC_P2_SPEC = [
    'insee_write' => ['both', ['both', 'case']], 'insee_threshold' => [40, 'int:1:100'], 'insee_auto' => ['auto', ['auto', 'manual']],
    'q_format' => ['json', ['json', 'html']], 'q_prefill' => ['yes', ['yes', 'no']],
    'calls_place' => ['tab', ['tab', 'heirs']], 'calls_mail' => ['grey', ['grey', 'hidden']],
    'rec_relance' => [15, 'int:1:120'], 'rec_link' => ['yes', ['yes', 'no']], 'rec_url' => ['https://www.laposte.fr/outils/suivre-vos-envois?code={numero}', 'url'],
    'inv_register' => ['cabinet', ['cabinet', 'genealogy']], 'inv_numbering' => ['yearly', ['yearly', 'single']], 'inv_time' => ['unchecked', ['unchecked', 'checked']],
    'inv_prefix_f' => ['F', 'prefix'], 'inv_prefix_a' => ['A', 'prefix'], 'inv_prefix_d' => ['D', 'prefix'],
    'act_period' => ['year', ['year', '12m']], 'act_amounts' => ['ttc', ['ttc', 'ht', 'choice']],
    'nc_password' => ['yes', ['yes', 'no']], 'nc_addresses' => ['no', ['no', 'yes']],
    'map_precision' => ['commune', ['commune', 'ban']], 'map_notaries' => ['known', ['known', 'none']],
    'contract_builtin' => ['removed', ['removed', 'example']], 'contract_versions' => ['all', ['all', 'last']],
    'funds_commission' => ['calc', ['calc', 'manual']], 'funds_print' => ['print', ['print', 'screen']],
    'proof_min' => ['2', ['2', '1']], 'proof_block' => ['review', ['review', 'block']],
    'dates_reminders' => ['30,7,1', ['30,7,1', '7']], 'dates_place' => ['same', ['same', 'apart']],
    'merge_mode' => ['two', ['two', 'linked']], 'merge_undo' => ['30d', ['30d', 'untouched']],
    'research_join' => ['no', ['no', 'yes']], 'archive_password' => ['proposed', ['proposed', 'required', 'none']],
    'linked_attach' => ['descendants', ['descendants', 'none']], 'group_scope' => ['missing', ['missing', 'missing_asked']],
    'delay_stat' => ['mean', ['mean', 'median']], 'delay_min' => [3, 'int:1:20'], 'validity_warn' => [15, 'int:1:120'],
    'share_names' => ['initials', ['initials', 'numbers']], 'share_amounts' => ['yes', ['yes', 'no']],
];
const SUCC_P2_CABINET = ['name' => '', 'address' => '', 'siret' => '', 'vat' => '', 'mentions' => '', 'required' => ['name']];
const SUCC_P2_CABINET_REQ = ['name', 'address', 'siret', 'vat', 'mentions'];
const SUCC_CALL_MEANS = ['phone', 'mail', 'visit', 'post', 'other'];
const SUCC_REC_KINDS = ['', 'ar', 'sans', 'suivie'];
const SUCC_AR_STATES = ['', 'npai', 'inconnu'];

/* ═════════ Réglages ═════════ */
function succ_p2_defaults(): array { $o = []; foreach (SUCC_P2_SPEC as $k => [$def]) { $o[$k] = $def; } return $o; }
function succ_p2_settings_clean(mixed $d, ?array $base = null): array
{
    $s = array_merge(succ_p2_defaults(), is_array($base) ? array_intersect_key($base, SUCC_P2_SPEC) : []);
    if (!is_array($d)) { return $s; }
    foreach ($d as $k => $v) {
        if (!isset(SUCC_P2_SPEC[$k]) || !is_scalar($v)) { continue; }
        $rule = SUCC_P2_SPEC[$k][1];
        if (is_array($rule)) { if (in_array((string) $v, array_map('strval', $rule), true)) { $s[$k] = is_int(SUCC_P2_SPEC[$k][0]) ? (int) $v : (string) $v; } continue; }
        if (str_starts_with($rule, 'int:')) { [, $min, $max] = explode(':', $rule); $n = (int) $v; if ((string) $n === trim((string) $v) && $n >= (int) $min && $n <= (int) $max) { $s[$k] = $n; } continue; }
        if ($rule === 'prefix') { $t = strtoupper(trim((string) $v)); if (preg_match('/^[A-Z0-9]{1,6}$/', $t)) { $s[$k] = $t; } continue; }
        if ($rule === 'url') { $u = trim((string) $v); if ($u === '' || (strlen($u) <= 300 && preg_match('{^https://[a-z0-9.-]+(/[^\s<>"]*)?$}i', $u) && str_contains($u, '{numero}'))) { $s[$k] = $u; } }
    }
    // 🧾 trois préfixes différents (factures, avoirs, devis) : sinon l'avoir prendrait le numéro d'une facture et ne serait jamais émis.
    // Un préfixe qui en double un autre est refusé : l'ancien est gardé, sinon la valeur par défaut.
    $P = ['inv_prefix_f', 'inv_prefix_a', 'inv_prefix_d'];
    $old = array_merge(succ_p2_defaults(), is_array($base) ? array_intersect_key($base, SUCC_P2_SPEC) : []);
    $order = array_merge(array_filter($P, static fn($k) => $s[$k] !== $old[$k]), ['inv_prefix_a', 'inv_prefix_d', 'inv_prefix_f']); // le préfixe changé d'abord ; celui des factures en dernier
    foreach (array_unique($order) as $k) {
        $others = static fn() => array_map(static fn($j) => $s[$j], array_values(array_diff($P, [$k])));
        if (!in_array($s[$k], $others(), true)) { continue; }
        foreach ([$old[$k], SUCC_P2_SPEC[$k][0]] as $try) { if (preg_match('/^[A-Z0-9]{1,6}$/', (string) $try) && !in_array($try, $others(), true)) { $s[$k] = $try; continue 2; } }
        for ($i = 2; in_array($s[$k], $others(), true) && $i < 100; $i++) { $s[$k] = SUCC_P2_SPEC[$k][0] . $i; }
    }
    return $s;
}
function succ_p2_cabinet_clean(mixed $d, ?array $base = null): array
{
    $s = array_merge(SUCC_P2_CABINET, is_array($base) ? array_intersect_key($base, SUCC_P2_CABINET) : []);
    if (!is_array($d)) { return $s; }
    foreach (['name' => 160, 'address' => 400, 'siret' => 40, 'vat' => 40, 'mentions' => 3000] as $k => $max) { if (array_key_exists($k, $d)) { $s[$k] = succ_txt($d[$k], $max, in_array($k, ['address', 'mentions'], true)); } }
    if (array_key_exists('required', $d) && is_array($d['required'])) { $s['required'] = array_values(array_intersect(SUCC_P2_CABINET_REQ, array_map('strval', $d['required']))); }
    return $s;
}
function succ_p2_set(): array { $s = succ_settings(); return succ_p2_settings_clean($s['p2'] ?? [], $s['p2'] ?? []); }
function succ_p2_cabinet(): array { $s = succ_settings(); return succ_p2_cabinet_clean($s['cabinet'] ?? [], $s['cabinet'] ?? []); }

/* ═════════ Migration 97 ═════════ */
function succ_p2_has(PDO $pdo, string $table, string $col = ''): bool
{
    try {
        if ($col === '') { return (bool) $pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name=" . $pdo->quote($table))->fetchColumn(); }
        return (bool) $pdo->query("SELECT 1 FROM pragma_table_info(" . $pdo->quote($table) . ") WHERE name=" . $pdo->quote($col))->fetchColumn();
    } catch (Throwable $_) { return false; }
}
function succ_p2_schema(PDO $pdo): void
{
    if (!succ_p2_has($pdo, 'succ_cases')) { successoral_schema($pdo); }
    if (function_exists('succ_outils_schema')) { succ_outils_schema($pdo); }
    $pdo->exec("CREATE TABLE IF NOT EXISTS succ_insee_checks (id INTEGER PRIMARY KEY AUTOINCREMENT, case_id INTEGER NOT NULL, person_id INTEGER NOT NULL, insee_key TEXT NOT NULL DEFAULT '',
        insee_id INTEGER, score INTEGER NOT NULL DEFAULT 0, verdict TEXT NOT NULL DEFAULT '', detail_json TEXT NOT NULL DEFAULT '', event_id INTEGER, prev_json TEXT NOT NULL DEFAULT '',
        at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_succ_insee_checks ON succ_insee_checks(case_id, person_id)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS succ_calls (id INTEGER PRIMARY KEY AUTOINCREMENT, case_id INTEGER NOT NULL, at TEXT NOT NULL DEFAULT '', person_id INTEGER, who_text TEXT NOT NULL DEFAULT '',
        means TEXT NOT NULL DEFAULT 'phone', summary TEXT NOT NULL DEFAULT '', minutes INTEGER NOT NULL DEFAULT 0, next_action TEXT NOT NULL DEFAULT '', deadline_id INTEGER, fee_id INTEGER,
        research INTEGER NOT NULL DEFAULT 0, noanswer INTEGER NOT NULL DEFAULT 0, origin_case_id INTEGER, deleted_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_succ_calls_case ON succ_calls(case_id, at)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS succ_funds (id INTEGER PRIMARY KEY AUTOINCREMENT, case_id INTEGER NOT NULL, person_id INTEGER NOT NULL, day TEXT NOT NULL DEFAULT '', sens TEXT NOT NULL DEFAULT 'recu',
        amount_cents INTEGER NOT NULL DEFAULT 0, moyen TEXT NOT NULL DEFAULT '', paid_to TEXT NOT NULL DEFAULT '', media_id INTEGER, note TEXT NOT NULL DEFAULT '', invoice_ref TEXT NOT NULL DEFAULT '',
        origin_case_id INTEGER, deleted_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_succ_funds_case ON succ_funds(case_id, person_id)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS succ_questionnaires (id INTEGER PRIMARY KEY AUTOINCREMENT, case_id INTEGER NOT NULL, person_id INTEGER NOT NULL, token TEXT NOT NULL UNIQUE,
        fields_json TEXT NOT NULL DEFAULT '', made_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, answered_at TEXT, applied_json TEXT NOT NULL DEFAULT '', deleted_at TEXT)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS succ_template_versions (id INTEGER PRIMARY KEY AUTOINCREMENT, template_id INTEGER NOT NULL, version INTEGER NOT NULL, body TEXT NOT NULL DEFAULT '',
        saved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(template_id, version))");
    succ_inv_schema($pdo); // 🧾 réglage « registre dans la généalogie » : mêmes tables ici
    $add = static function (string $t, string $c, string $def) use ($pdo): void { if (succ_p2_has($pdo, $t) && !succ_p2_has($pdo, $t, $c)) { $pdo->exec("ALTER TABLE $t ADD COLUMN $c $def"); } };
    foreach (['recommande' => "TEXT NOT NULL DEFAULT ''", 'recommande_num' => "TEXT NOT NULL DEFAULT ''", 'ar_date' => "TEXT NOT NULL DEFAULT ''", 'ar_relance_jours' => 'INTEGER',
        'ar_etat' => "TEXT NOT NULL DEFAULT ''", 'ar_media_id' => 'INTEGER', 'depot_media_id' => 'INTEGER', 'template_version' => "TEXT NOT NULL DEFAULT ''", 'reponse_le' => "TEXT NOT NULL DEFAULT ''", 'origin_case_id' => 'INTEGER'] as $c => $def) { $add('courriers', $c, $def); }
    foreach (['origin' => "TEXT NOT NULL DEFAULT ''", 'media_id' => 'INTEGER', 'reminders' => "TEXT NOT NULL DEFAULT ''", 'important' => 'INTEGER NOT NULL DEFAULT 0',
        'reminders_seen' => "TEXT NOT NULL DEFAULT ''", 'prev_due' => "TEXT NOT NULL DEFAULT ''", 'origin_case_id' => 'INTEGER'] as $c => $def) { $add('succ_deadlines', $c, $def); }
    $add('succ_fees', 'origin_case_id', 'INTEGER');
    $add('succ_cases', 'merged_into', 'INTEGER');
    $add('succ_pieces', 'issued_on', "TEXT NOT NULL DEFAULT ''");
    $add('succ_pieces', 'valid_months', 'INTEGER');
}
function succ_p2_ready(PDO $pdo): bool
{
    static $ok = [];
    $k = spl_object_id($pdo);
    if (!empty($ok[$k])) { return true; }
    return $ok[$k] = succ_p2_has($pdo, 'succ_questionnaires') && succ_p2_has($pdo, 'succ_pieces', 'valid_months') && succ_p2_has($pdo, 'succ_invoices');
}
function succ_p2_ensure(PDO $pdo): void { if (!succ_p2_ready($pdo)) { succ_p2_schema($pdo); } }

/* ═════════ outils communs ═════════ */
function succ_p2_norm(string $s): string
{
    $s = strtoupper(function_exists('ascii_fold') ? ascii_fold($s) : $s);
    return trim((string) preg_replace('/\s+/', ' ', (string) preg_replace('/[^A-Z0-9]+/', ' ', $s)));
}
function succ_p2_case_open(PDO $pdo, int $id): array
{
    $c = succ_row($pdo, $id);
    if (in_array((string) $c['state'], ['archive'], true)) { throw new LcndaBadInput('Ce dossier est archivé : rouvre-le d’abord.'); }
    return $c;
}
function succ_p2_options(PDO $pdo, int $id): array { $c = succ_row($pdo, $id, true); $o = json_decode((string) $c['options_json'], true); return is_array($o) ? $o : []; }
function succ_p2_options_save(PDO $pdo, int $id, array $o): void { $pdo->prepare('UPDATE succ_cases SET options_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([json_encode($o ?: new stdClass(), JSON_UNESCAPED_UNICODE), $id]); }
function succ_p2_access(PDO $pdo, string $kind, int $caseId, string $what): void { if (function_exists('access_log_add')) { access_log_add($pdo, $kind, 'case', $caseId ?: null, $caseId ? access_case_label($pdo, $caseId) : '', $what); } }
function succ_p2_tag_id(PDO $pdo, string $tag): int { $s = $pdo->prepare("SELECT id FROM event_types WHERE gedcom_tag=? ORDER BY id LIMIT 1"); $s->execute([$tag]); return (int) $s->fetchColumn(); }
function succ_p2_place_id(PDO $pdo, string $name): ?int
{
    $name = trim($name); if ($name === '') { return null; }
    $s = $pdo->prepare('SELECT id FROM places WHERE name=? COLLATE NOCASE ORDER BY id LIMIT 1'); $s->execute([$name]);
    $id = (int) $s->fetchColumn(); if ($id) { return $id; }
    $pdo->prepare('INSERT INTO places(name) VALUES(?)')->execute([$name]);
    return (int) $pdo->lastInsertId();
}
const SUCC_P2_MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
function succ_p2_fr_date(string $iso): string
{
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $iso, $m)) { return $iso; }
    if (!checkdate((int) $m[2], (int) $m[3], (int) $m[1])) { return (int) $m[2] >= 1 && (int) $m[2] <= 12 ? SUCC_P2_MONTHS[(int) $m[2] - 1] . ' ' . $m[1] : $m[1]; } // « 1985-00-00 » → « 1985 »
    return (int) $m[3] . ' ' . SUCC_P2_MONTHS[(int) $m[2] - 1] . ' ' . $m[1];
}
/** une date du fichier INSEE (« 19850312 », « 19850000 », « 19850300 ») : iso seulement si elle est complète et existe, sinon l'année seule */
function succ_p2_insee_date(string $dd): array
{
    if (!preg_match('/^(\d{4})(\d{2})(\d{2})$/', $dd, $m)) { return ['iso' => '', 'year' => null, 'text' => $dd]; }
    if (checkdate((int) $m[2], (int) $m[3], (int) $m[1])) { $iso = "$m[1]-$m[2]-$m[3]"; return ['iso' => $iso, 'year' => (int) $m[1], 'text' => succ_p2_fr_date($iso)]; }
    return ['iso' => '', 'year' => (int) $m[1] ?: null, 'text' => (int) $m[1] ? $m[1] : ''];
}
/** le statut retenu d'après la date du décès INSEE : « avant » ou « après » le défunt seulement si les deux dates sont complètes et différentes */
function succ_p2_insee_status(string $iso, string $death): string
{
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $iso) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $death) || $iso === $death) { return 'unknown'; } // le même jour : l'ordre des décès n'est pas connu
    return $iso < $death ? 'dead_before' : 'dead_after';
}
/** les héritiers « vivants » du dossier (avec une part, ou rattachés comme héritiers), sans décès sur la fiche */
function succ_p2_living_heirs(PDO $pdo, array $c): array
{
    $ids = [];
    $snap = json_decode((string) $c['snapshot_json'], true);
    foreach ((array) ($snap['shares'] ?? []) as $k => $v) { if ((string) $v !== '0') { $ids[(int) $k] = true; } }
    foreach ((array) ($snap['unknown'] ?? []) as $k) { $ids[(int) $k] = true; }
    try { $s = $pdo->prepare("SELECT person_id FROM succ_case_persons WHERE case_id=? AND role='heir' AND deleted_at IS NULL"); $s->execute([(int) $c['id']]); foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $p) { $ids[(int) $p] = true; } } catch (Throwable $_) {}
    unset($ids[(int) $c['deceased_id']]);
    $ps = succ_persons($pdo, array_keys($ids));
    return array_filter($ps, static fn($p) => !$p['death'] && $p['status'] !== 'deceased');
}

/* ═════════ 1. ⚰️ Vérifier si un héritier est décédé (fichier INSEE déjà importé) ═════════ */
/** le nom cherché : le nom de naissance (jamais le nom d'épouse) ; sans nom de naissance, le nom d'usage (pistes moins sûres) */
function succ_p2_birth_name(PDO $pdo, int $pid, string $last): array
{
    try {
        $s = $pdo->prepare("SELECT last_name, type FROM name_variants WHERE person_id=? AND last_name<>'' ORDER BY id"); $s->execute([$pid]);
        $married = '';
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $v) {
            if (in_array((string) $v['type'], ['birth', 'maiden'], true)) { return [(string) $v['last_name'], false]; }
            if (in_array((string) $v['type'], ['historical', 'married'], true) && $married === '') { $married = (string) $v['last_name']; }
        }
        if (trim($last) === '' && $married !== '') { return [$married, true]; }
    } catch (Throwable $_) {}
    return [$last, false];
}
function succ_p2_dept(string $place): string
{
    if (preg_match('/\((\d{2,3}|2[AB])\)/i', $place, $m)) { return strtoupper(substr($m[1], 0, 2)); }
    if (preg_match('/\b(\d{5})\b/', $place, $m)) { return substr($m[1], 0, 2); }
    return '';
}
/** la ressemblance d'une ligne INSEE avec une fiche : points, détail, plafond */
function succ_p2_insee_score(array $p, string $birthName, array $row, array $place = []): ?array
{
    $d = []; $score = 0; $cap = 100;
    // sexe : différent → écartée
    $sx = strtoupper((string) $row['sexe']); $g = ['male' => '1', 'female' => '2'][$p['gender'] ?? ''] ?? '';
    $sxv = $sx === 'M' ? '1' : ($sx === 'F' ? '2' : $sx);
    if ($g !== '' && $sxv !== '' && $g !== $sxv) { return null; }
    if ($g !== '' && $g === $sxv) { $score += 5; $d['sex'] = 1; }
    $n1 = succ_p2_norm($birthName); $n2 = succ_p2_norm((string) $row['nom']);
    if ($n1 !== '' && $n1 === $n2) { $score += 25; $d['name'] = 1; } elseif ($n1 !== '' && (str_starts_with($n2 . ' ', $n1 . ' ') || str_starts_with($n1 . ' ', $n2 . ' '))) { $score += 15; $d['name'] = 0.5; } else { $d['name'] = 0; }
    $first = trim((string) preg_split('/\s+/', trim((string) ($p['first'] ?? '')))[0]);
    $f1 = succ_p2_norm($first); $pr = ' ' . succ_p2_norm((string) ($row['prenoms'] ?: $row['prenom'])) . ' ';
    if ($f1 !== '' && str_contains($pr, ' ' . $f1 . ' ')) { $score += 20; $d['first'] = 1; } elseif ($f1 !== '' && str_starts_with(trim($pr), explode(' ', $f1)[0])) { $score += 10; $d['first'] = 0.5; } else { $d['first'] = 0; }
    // date de naissance
    $iso = (string) ($p['birth']['date'] ?? ''); $by = $p['birth']['year'] ?? null;
    $ib = (string) $row['date_naissance']; $iy = (int) ($row['annee_naissance'] ?? 0);
    $idate = strlen($ib) === 8 ? substr($ib, 0, 4) . '-' . substr($ib, 4, 2) . '-' . substr($ib, 6, 2) : '';
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $iso) && $idate !== '' && $idate === $iso) { $score += 30; $d['birth'] = 'day'; }
    elseif (preg_match('/^\d{4}-\d{2}/', $iso) && $idate !== '' && substr($idate, 0, 7) === substr($iso, 0, 7)) { $score += 20; $d['birth'] = 'month'; }
    elseif ($by && $iy && (int) $by === $iy) { $score += 12; $d['birth'] = 'year'; }
    elseif ($by && $iy && abs((int) $by - $iy) === 1) { $score += 6; $d['birth'] = 'near'; }
    elseif (!$by) { $d['birth'] = 'unknown'; $cap = 70; }
    else { $d['birth'] = 'diff'; }
    // lieu de naissance : commune, sinon le département ; né à l'étranger : le pays
    $ptxt = (string) ($p['birth']['place'] ?? '');
    $commune = succ_p2_norm((string) preg_split('/[,(]/', $ptxt)[0]);
    $pays = succ_p2_norm((string) $row['pays_naissance']);
    if ($pays !== '' && $pays !== 'FRANCE') {
        $cap = min($cap, 80); $d['abroad'] = 1;
        $country = succ_p2_norm((string) ($place['country'] ?? ''));
        if (($country !== '' && $country === $pays) || ($commune !== '' && str_contains(succ_p2_norm($ptxt), $pays))) { $score += 20; $d['place'] = 1; } else { $d['place'] = 0; }
    } elseif ($commune !== '' && $commune === succ_p2_norm((string) $row['commune_naissance'])) { $score += 20; $d['place'] = 1; }
    elseif (($dep = succ_p2_dept($ptxt . ' ' . (string) ($place['county'] ?? ''))) !== '' && strtoupper(substr((string) $row['code_lieu_naissance'], 0, 2)) === $dep) { $score += 10; $d['place'] = 0.5; }
    else { $d['place'] = $ptxt === '' ? -1 : 0; }
    return ['score' => min($score, $cap), 'cap' => $cap, 'detail' => $d];
}
function succ_p2_insee_key(array $r): string { return succ_p2_norm((string) $r['nom']) . '|' . succ_p2_norm((string) $r['prenoms']) . '|' . $r['date_naissance'] . '|' . $r['date_deces'] . '|' . $r['numero_acte_deces']; }
function succ_p2_insee_rows(PDO $pdo, string $name, ?int $by): array
{
    if (!succ_p2_has($pdo, 'insee_deces')) { return []; }
    $n = succ_p2_norm($name); if ($n === '') { return []; }
    $sql = 'SELECT * FROM insee_deces WHERE (nom = ? OR nom GLOB ?)';
    $par = [$n, str_replace(['*', '?', '['], '', $n) . '[ -]*'];
    if ($by) { $sql .= ' AND (annee_naissance BETWEEN ? AND ? OR annee_naissance IS NULL)'; $par[] = $by - 1; $par[] = $by + 1; }
    $s = $pdo->prepare($sql . ' LIMIT 300'); $s->execute($par);
    return $s->fetchAll(PDO::FETCH_ASSOC);
}
function succ_p2_insee_stats(PDO $pdo): array
{
    if (!succ_p2_has($pdo, 'insee_deces')) { return ['rows' => 0]; }
    $n = (int) $pdo->query('SELECT count(*) FROM (SELECT 1 FROM insee_deces LIMIT 1)')->fetchColumn();
    if (!$n) { return ['rows' => 0]; }
    $r = $pdo->query('SELECT MIN(annee_deces), MAX(annee_deces) FROM insee_deces WHERE annee_deces BETWEEN 1900 AND ' . ((int) date('Y') + 1))->fetch(PDO::FETCH_NUM);
    $last = 0; try { $last = (int) $pdo->query('SELECT MAX(id) FROM insee_deces_imports')->fetchColumn(); } catch (Throwable $_) {}
    return ['rows' => 1, 'from' => (int) $r[0], 'to' => (int) $r[1], 'import' => $last];
}
/** toutes les pistes d'un dossier (sans rien écrire) ; « pas la même personne » ne revient jamais */
function succ_p2_insee_pistes(PDO $pdo, array $c, ?int $threshold = null): array
{
    $threshold ??= (int) succ_p2_set()['insee_threshold'];
    $no = [];
    $s = $pdo->prepare("SELECT person_id, insee_key, verdict FROM succ_insee_checks WHERE case_id=? AND verdict IN ('not_same','same')"); $s->execute([(int) $c['id']]);
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { $no[(int) $r['person_id'] . '|' . $r['insee_key']] = (string) $r['verdict']; }
    $out = [];
    foreach (succ_p2_living_heirs($pdo, $c) as $pid => $p) {
        [$bn, $marriedOnly] = succ_p2_birth_name($pdo, $pid, (string) $p['last']);
        $place = [];
        if (($p['birth']['event_id'] ?? 0)) { $q = $pdo->prepare('SELECT pl.county, pl.country FROM events e LEFT JOIN places pl ON pl.id=e.place_id WHERE e.id=?'); $q->execute([(int) $p['birth']['event_id']]); $place = $q->fetch(PDO::FETCH_ASSOC) ?: []; }
        $pistes = []; $seen = [];
        foreach (succ_p2_insee_rows($pdo, $bn, $p['birth']['year'] ?? null) as $row) {
            $sc = succ_p2_insee_score($p, $bn, $row, $place); if (!$sc || $sc['score'] < $threshold) { continue; }
            $key = succ_p2_insee_key($row);
            if (($no[$pid . '|' . $key] ?? '') === 'not_same' || isset($seen[$key])) { continue; } // une ligne importée deux fois : une piste
            $seen[$key] = true;
            $dd = (string) $row['date_deces'];
            $pistes[] = ['insee_id' => (int) $row['id'], 'key' => $key, 'score' => $sc['score'], 'cap' => $sc['cap'], 'detail' => $sc['detail'],
                'nom' => (string) $row['nom'], 'prenoms' => (string) $row['prenoms'], 'sexe' => (string) $row['sexe'], 'naissance' => (string) $row['date_naissance'],
                'lieu_naissance' => trim((string) $row['commune_naissance'] . ' ' . ((string) $row['pays_naissance'] !== '' ? '(' . $row['pays_naissance'] . ')' : '')), 'code_naissance' => (string) $row['code_lieu_naissance'],
                'deces' => ($DD = succ_p2_insee_date($dd))['iso'] ?: $DD['text'], 'status' => succ_p2_insee_status($DD['iso'], (string) ($c['death_iso'] ?? '')), 'lieu_deces' => (string) $row['commune_deces'], 'acte' => (string) $row['numero_acte_deces'],
                'same' => ($no[$pid . '|' . $key] ?? '') === 'same'];
        }
        usort($pistes, static fn($a, $b) => $b['score'] <=> $a['score']);
        $out[] = ['person_id' => $pid, 'name' => succ_name($p), 'birth_name' => $bn, 'married_only' => $marriedOnly, 'birth' => $p['birth']['text'] ?? '', 'birth_place' => $p['birth']['place'] ?? '',
            'abroad' => (bool) array_filter($pistes, static fn($x) => !empty($x['detail']['abroad'])), 'pistes' => array_slice($pistes, 0, 10), 'twins' => count(array_filter($pistes, static fn($x) => $x['score'] >= 80)) >= 2];
    }
    return $out;
}
function succ_p2_insee_check(PDO $pdo, array $d): array
{
    $c = succ_p2_case_open($pdo, safe_int($d['case_id'] ?? 0));
    $stats = succ_p2_insee_stats($pdo);
    if (!$stats['rows']) { return ['stats' => $stats, 'heirs' => []]; }
    $heirs = succ_p2_insee_pistes($pdo, $c);
    foreach ($heirs as $h) { $pdo->prepare("INSERT INTO succ_insee_checks(case_id, person_id, insee_key, score, verdict, detail_json) VALUES(?,?,'',?, 'run', ?)")->execute([(int) $c['id'], $h['person_id'], count($h['pistes']), json_encode(['import' => $stats['import']])]); }
    $o = succ_p2_options($pdo, (int) $c['id']); $o['insee_seen'] = $stats['import']; succ_p2_options_save($pdo, (int) $c['id'], $o);
    succ_journal($pdo, (int) $c['id'], 'search', '⚰️ Décès vérifiés dans le fichier INSEE : ' . count($heirs) . ' héritier(s), ' . array_sum(array_map(static fn($h) => count($h['pistes']), $heirs)) . ' piste(s)');
    return ['stats' => $stats, 'heirs' => $heirs, 'last' => succ_p2_insee_last($pdo, (int) $c['id'])];
}
function succ_p2_insee_last(PDO $pdo, int $caseId): array
{
    $out = [];
    try { $s = $pdo->prepare("SELECT person_id, MAX(at) AS at, score FROM succ_insee_checks WHERE case_id=? AND verdict='run' GROUP BY person_id"); $s->execute([$caseId]); foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { $out[(string) $r['person_id']] = ['at' => (string) $r['at'], 'n' => (int) $r['score']]; } } catch (Throwable $_) {}
    return $out;
}
/** « ✓ C'est lui » : le décès sur la fiche (réglage) et le statut retenu du dossier, d'après la date ; ↶ Annuler */
function succ_p2_insee_confirm(PDO $pdo, array $d): array
{
    $c = succ_p2_case_open($pdo, safe_int($d['case_id'] ?? 0)); $cid = (int) $c['id'];
    $pid = safe_int($d['person_id'] ?? 0); if (!succ_person_ok($pdo, $pid)) { throw new LcndaBadInput('Fiche introuvable.'); }
    $s = $pdo->prepare('SELECT * FROM insee_deces WHERE id=?'); $s->execute([safe_int($d['insee_id'] ?? 0)]); $row = $s->fetch(PDO::FETCH_ASSOC);
    if (!$row) { throw new LcndaBadInput('Ligne INSEE introuvable.'); }
    $dd = (string) $row['date_deces']; $D = succ_p2_insee_date($dd); $iso = $D['iso'];
    $mode = in_array($d['mode'] ?? '', ['both', 'case'], true) ? (string) $d['mode'] : succ_p2_set()['insee_write'];
    $eventId = null;
    if ($mode === 'both' && function_exists('person_is_locked') && person_is_locked($pdo, $pid)) { throw new LcndaBadInput('Fiche verrouillée : le décès n’est pas écrit. Déverrouille la fiche d’abord, ou choisis « Seulement le statut du dossier » dans les réglages.'); }
    if ($mode === 'both') {
        $tag = succ_p2_tag_id($pdo, 'DEAT'); if (!$tag) { throw new LcndaBadInput('Type d’événement « Décès » introuvable.'); }
        $note = 'Source : Fichier des personnes décédées (INSEE), acte n° ' . ($row['numero_acte_deces'] ?: '—') . ', fichier importé, relevé le ' . succ_p2_fr_date(date('Y-m-d')) . '.';
        $pdo->prepare("INSERT INTO events(scope, person_id, event_type_id, date_text, year, sort_date, place_id, description) VALUES('person',?,?,?,?,?,?,?)")
            ->execute([$pid, $tag, $D['text'] !== '' ? $D['text'] : $dd, $D['year'] ?? ((int) $row['annee_deces'] ?: null), $iso ?: null, succ_p2_place_id($pdo, (string) $row['commune_deces']), $note]);
        $eventId = (int) $pdo->lastInsertId();
        $prevStatus = (string) $pdo->query('SELECT living_status FROM persons WHERE id=' . $pid)->fetchColumn();
        $pdo->prepare("UPDATE persons SET living_status='deceased', updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([$pid]);
        if (function_exists('log_change')) { log_change($pdo, 'person', $pid, 'update', 'Décès ajouté d’après le fichier INSEE (dossier de succession)'); }
        if (function_exists('rebuild_search')) { try { rebuild_search($pdo, $pid); } catch (Throwable $_) {} }
    }
    // le statut retenu dans ce dossier : d'après la date du décès du défunt (le moteur garde la règle)
    $death = (string) $c['death_iso'];
    $status = succ_p2_insee_status($iso, $death);
    $ov = succ_override($pdo, ['case_id' => $cid, 'person_id' => $pid, 'field' => 'status', 'value' => $status]);
    $key = succ_p2_insee_key($row);
    $pdo->prepare("INSERT INTO succ_insee_checks(case_id, person_id, insee_key, insee_id, score, verdict, event_id, prev_json) VALUES(?,?,?,?,?, 'same', ?, ?)")
        ->execute([$cid, $pid, $key, (int) $row['id'], safe_int($d['score'] ?? 0), $eventId, json_encode(['status' => $ov['prev'], 'living' => $prevStatus ?? null])]);
    $chk = (int) $pdo->lastInsertId();
    succ_journal($pdo, $cid, 'calc', '⚰️ ' . succ_person_name($pdo, $pid) . ' marqué(e) décédé(e) d’après le fichier INSEE (' . ($D['text'] !== '' ? $D['text'] : $dd) . ', acte n° ' . ($row['numero_acte_deces'] ?: '—') . ')' . ($mode === 'both' ? ' : décès écrit sur la fiche' : ' : statut du dossier seulement'));
    succ_touch($pdo, $cid);
    return ['check_id' => $chk, 'status' => $status, 'event_id' => $eventId, 'mode' => $mode];
}
function succ_p2_insee_undo(PDO $pdo, array $d): array
{
    $cid = safe_int($d['case_id'] ?? 0); succ_row($pdo, $cid);
    $s = $pdo->prepare("SELECT * FROM succ_insee_checks WHERE id=? AND case_id=?"); $s->execute([safe_int($d['check_id'] ?? 0), $cid]); $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { throw new LcndaBadInput('Rien à annuler.'); }
    $pid = (int) $r['person_id'];
    if ($r['verdict'] === 'same') {
        $prev = json_decode((string) $r['prev_json'], true) ?: [];
        if ((int) $r['event_id']) {
            $pdo->prepare('DELETE FROM events WHERE id=?')->execute([(int) $r['event_id']]);
            $pdo->prepare('UPDATE persons SET living_status=? WHERE id=?')->execute([in_array($prev['living'] ?? '', ['living', 'deceased', 'unknown'], true) ? $prev['living'] : 'living', $pid]);
            if (function_exists('rebuild_search')) { try { rebuild_search($pdo, $pid); } catch (Throwable $_) {} }
        }
        succ_override($pdo, ['case_id' => $cid, 'person_id' => $pid, 'field' => 'status', 'value' => (string) ($prev['status'] ?? '')]);
    }
    $pdo->prepare('DELETE FROM succ_insee_checks WHERE id=?')->execute([(int) $r['id']]);
    succ_journal($pdo, $cid, 'calc', '↶ Vérification INSEE annulée pour ' . succ_person_name($pdo, $pid));
    return ['ok' => true];
}
function succ_p2_insee_not_same(PDO $pdo, array $d): array
{
    $c = succ_row($pdo, safe_int($d['case_id'] ?? 0)); $pid = safe_int($d['person_id'] ?? 0);
    $s = $pdo->prepare('SELECT * FROM insee_deces WHERE id=?'); $s->execute([safe_int($d['insee_id'] ?? 0)]); $row = $s->fetch(PDO::FETCH_ASSOC);
    if (!$row || !succ_person_ok($pdo, $pid)) { throw new LcndaBadInput('Ligne INSEE introuvable.'); }
    $pdo->prepare("INSERT INTO succ_insee_checks(case_id, person_id, insee_key, insee_id, score, verdict) VALUES(?,?,?,?,?, 'not_same')")->execute([(int) $c['id'], $pid, succ_p2_insee_key($row), (int) $row['id'], safe_int($d['score'] ?? 0)]);
    return ['check_id' => (int) $pdo->lastInsertId()];
}
function succ_p2_insee_dismissed(PDO $pdo, int $caseId): array
{
    $s = $pdo->prepare("SELECT k.id, k.person_id, k.insee_key, k.score, k.at FROM succ_insee_checks k WHERE k.case_id=? AND k.verdict='not_same' ORDER BY k.id DESC LIMIT 100"); $s->execute([$caseId]);
    return array_map(static fn($r) => ['id' => (int) $r['id'], 'person_id' => (int) $r['person_id'], 'what' => implode(' · ', array_filter(array_slice(explode('|', (string) $r['insee_key']), 0, 2))), 'score' => (int) $r['score'], 'at' => (string) $r['at']], $s->fetchAll(PDO::FETCH_ASSOC));
}

/* ═════════ 3. 📞 Journal des appels et échanges ═════════ */
function succ_p2_calls(PDO $pdo, int $caseId): array
{
    $s = $pdo->prepare('SELECT * FROM succ_calls WHERE case_id=? AND deleted_at IS NULL ORDER BY at DESC, id DESC'); $s->execute([$caseId]);
    return array_map(static fn($r) => ['id' => (int) $r['id'], 'at' => (string) $r['at'], 'person_id' => (int) $r['person_id'] ?: null, 'who' => (string) $r['who_text'], 'means' => (string) $r['means'],
        'summary' => (string) $r['summary'], 'minutes' => (int) $r['minutes'], 'next' => (string) $r['next_action'], 'deadline_id' => (int) $r['deadline_id'] ?: null, 'research' => (int) $r['research'] === 1,
        'noanswer' => (int) $r['noanswer'] === 1, 'origin' => (int) $r['origin_case_id'] ?: null], $s->fetchAll(PDO::FETCH_ASSOC));
}
function succ_p2_call_save(PDO $pdo, array $d): array
{
    $c = succ_p2_case_open($pdo, safe_int($d['case_id'] ?? 0)); $cid = (int) $c['id'];
    $id = safe_int($d['id'] ?? 0);
    $at = succ_txt($d['at'] ?? '', 16); if (!preg_match('/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/', str_replace('T', ' ', $at))) { throw new LcndaBadInput('Date incorrecte.'); }
    $at = str_replace('T', ' ', $at);
    $pid = safe_int($d['person_id'] ?? 0); if ($pid && !succ_person_ok($pdo, $pid)) { $pid = 0; }
    $who = succ_txt($d['who'] ?? '', 200);
    if (!$pid && $who === '') { throw new LcndaBadInput('Avec qui ?'); }
    $means = in_array($d['means'] ?? '', SUCC_CALL_MEANS, true) ? (string) $d['means'] : 'phone';
    $sum = succ_txt($d['summary'] ?? '', 4000, true);
    $min = max(0, min(1440, safe_int($d['minutes'] ?? 0)));
    $next = succ_txt($d['next'] ?? '', 300); $due = succ_txt($d['due'] ?? '', 10);
    if ($due !== '' && !succ_date_ok($due)) { throw new LcndaBadInput('Date incorrecte.'); }
    $vals = [$cid, $at, $pid ?: null, $who, $means, $sum, $min, $next, !empty($d['research']) ? 1 : 0, !empty($d['noanswer']) ? 1 : 0];
    $prev = null;
    if ($id) {
        $s = $pdo->prepare('SELECT * FROM succ_calls WHERE id=? AND case_id=?'); $s->execute([$id, $cid]); $prev = $s->fetch(PDO::FETCH_ASSOC);
        if (!$prev) { throw new LcndaBadInput('Échange introuvable.'); }
        $pdo->prepare('UPDATE succ_calls SET case_id=?, at=?, person_id=?, who_text=?, means=?, summary=?, minutes=?, next_action=?, research=?, noanswer=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$vals, $id]);
        succ_journal($pdo, $cid, 'note', '📞 Échange du ' . substr($at, 0, 10) . ' corrigé');
    } else {
        $pdo->prepare('INSERT INTO succ_calls(case_id, at, person_id, who_text, means, summary, minutes, next_action, research, noanswer) VALUES(?,?,?,?,?,?,?,?,?,?)')->execute($vals);
        $id = (int) $pdo->lastInsertId();
        $whoTxt = $pid ? succ_person_name($pdo, $pid) : $who;
        succ_journal($pdo, $cid, 'note', '📞 Échange noté (' . $means . ') avec ' . $whoTxt);
        if ($due !== '' && $next !== '') {
            $pdo->prepare("INSERT INTO succ_deadlines(case_id, due, label, kind) VALUES(?,?,?, 'relance')")->execute([$cid, $due, '📞 ' . $next]);
            $pdo->prepare('UPDATE succ_calls SET deadline_id=? WHERE id=?')->execute([(int) $pdo->lastInsertId(), $id]);
        }
        if ($min > 0 && !empty($d['count_time'])) {
            $pdo->prepare("INSERT INTO succ_fees(case_id, kind, day, label, minutes, source) VALUES(?, 'time', ?, ?, ?, 'call')")->execute([$cid, substr($at, 0, 10), '📞 ' . mb_substr($whoTxt, 0, 120), $min]);
            $pdo->prepare('UPDATE succ_calls SET fee_id=? WHERE id=?')->execute([(int) $pdo->lastInsertId(), $id]);
        }
    }
    succ_touch($pdo, $cid);
    // « ne répond pas » trois fois de suite : proposer 🔇
    $silent = false;
    if ($pid) { $s = $pdo->prepare('SELECT noanswer FROM succ_calls WHERE case_id=? AND person_id=? AND deleted_at IS NULL ORDER BY at DESC, id DESC LIMIT 3'); $s->execute([$cid, $pid]); $l = $s->fetchAll(PDO::FETCH_COLUMN); $silent = count($l) === 3 && array_sum(array_map('intval', $l)) === 3; }
    return ['id' => $id, 'prev' => $prev, 'propose_silence' => $silent];
}
function succ_p2_call_delete(PDO $pdo, array $d, bool $restore): array
{
    $cid = safe_int($d['case_id'] ?? 0); succ_row($pdo, $cid); $id = safe_int($d['id'] ?? 0);
    $s = $pdo->prepare('SELECT deadline_id, fee_id FROM succ_calls WHERE id=? AND case_id=?'); $s->execute([$id, $cid]); $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { throw new LcndaBadInput('Échange introuvable.'); }
    $v = $restore ? 'NULL' : 'CURRENT_TIMESTAMP';
    $pdo->prepare("UPDATE succ_calls SET deleted_at=$v WHERE id=?")->execute([$id]);
    if ((int) $r['deadline_id']) { $pdo->prepare("UPDATE succ_deadlines SET deleted_at=$v WHERE id=?")->execute([(int) $r['deadline_id']]); }
    if ((int) $r['fee_id']) { $pdo->prepare("UPDATE succ_fees SET deleted_at=$v WHERE id=?")->execute([(int) $r['fee_id']]); }
    return ['id' => $id];
}
function succ_p2_call_restore_prev(PDO $pdo, array $d): array
{
    $cid = safe_int($d['case_id'] ?? 0); succ_row($pdo, $cid);
    $p = is_array($d['prev'] ?? null) ? $d['prev'] : null; if (!$p) { throw new LcndaBadInput('Rien à annuler.'); }
    $pdo->prepare('UPDATE succ_calls SET at=?, person_id=?, who_text=?, means=?, summary=?, minutes=?, next_action=?, research=?, noanswer=? WHERE id=? AND case_id=?')
        ->execute([succ_txt($p['at'] ?? '', 16), safe_int($p['person_id'] ?? 0) ?: null, succ_txt($p['who_text'] ?? '', 200), in_array($p['means'] ?? '', SUCC_CALL_MEANS, true) ? $p['means'] : 'phone', succ_txt($p['summary'] ?? '', 4000, true), safe_int($p['minutes'] ?? 0), succ_txt($p['next_action'] ?? '', 300), safe_int($p['research'] ?? 0) ? 1 : 0, safe_int($p['noanswer'] ?? 0) ? 1 : 0, safe_int($p['id'] ?? 0), $cid]);
    return ['ok' => true];
}

/* ═════════ 4. 📮 Lettres recommandées (l'app n'interroge pas La Poste) ═════════ */
function succ_p2_rec_rows(PDO $pdo, int $caseId = 0): array
{
    if (!succ_p2_has($pdo, 'courriers', 'recommande')) { return []; }
    $s = $pdo->prepare('SELECT id, succ_case_id, recommande, recommande_num, ar_date, ar_relance_jours, ar_etat, ar_media_id, depot_media_id, template_version, date_envoi, reponse_le FROM courriers WHERE succ_case_id IS NOT NULL' . ($caseId ? ' AND succ_case_id=?' : ''));
    $s->execute($caseId ? [$caseId] : []);
    $out = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { $out[(string) $r['id']] = ['kind' => (string) $r['recommande'], 'num' => (string) $r['recommande_num'], 'ar_date' => (string) $r['ar_date'], 'days' => $r['ar_relance_jours'] === null ? null : (int) $r['ar_relance_jours'],
        'state' => (string) $r['ar_etat'], 'ar_media' => (int) $r['ar_media_id'] ?: null, 'depot_media' => (int) $r['depot_media_id'] ?: null, 'tpl' => (string) $r['template_version'], 'sent' => (string) $r['date_envoi'], 'reponse_le' => (string) $r['reponse_le']]; }
    return $out;
}
/** le numéro : lettres et chiffres, 13 caractères ; sinon « inhabituel », gardé tel quel (jamais refusé) */
function succ_p2_rec_num_ok(string $n): bool { return (bool) preg_match('/^[A-Z0-9]{13}$/', strtoupper((string) preg_replace('/\s+/', '', $n))); }
function succ_p2_rec_set(PDO $pdo, array $d): array
{
    $kid = safe_int($d['courrier_id'] ?? 0);
    $s = $pdo->prepare('SELECT id, succ_case_id, recommande, recommande_num, ar_date, ar_relance_jours, ar_etat, ar_media_id, depot_media_id, date_envoi, reponse_le FROM courriers WHERE id=?'); $s->execute([$kid]); $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r || !(int) $r['succ_case_id']) { throw new LcndaBadInput('Courrier introuvable.'); }
    $vals = [];
    if (array_key_exists('kind', $d)) { if (!in_array($d['kind'], SUCC_REC_KINDS, true)) { throw new LcndaBadInput('Valeur inconnue.'); } $vals['recommande'] = (string) $d['kind']; }
    if (array_key_exists('num', $d)) { $vals['recommande_num'] = succ_txt($d['num'], 40); }
    if (array_key_exists('ar_date', $d)) { $v = succ_txt($d['ar_date'], 10); if ($v !== '' && !succ_date_ok($v)) { throw new LcndaBadInput('Date incorrecte.'); } $vals['ar_date'] = $v; }
    if (array_key_exists('days', $d)) { $vals['ar_relance_jours'] = $d['days'] === null || $d['days'] === '' ? null : max(1, min(120, safe_int($d['days']))); }
    if (array_key_exists('state', $d)) { if (!in_array($d['state'], SUCC_AR_STATES, true)) { throw new LcndaBadInput('Valeur inconnue.'); } $vals['ar_etat'] = (string) $d['state']; }
    if (array_key_exists('reponse_le', $d)) { $v = succ_txt($d['reponse_le'], 10); if ($v !== '' && !succ_date_ok($v)) { throw new LcndaBadInput('Date incorrecte.'); } $vals['reponse_le'] = $v; }
    if (array_key_exists('date_envoi', $d)) { $v = succ_txt($d['date_envoi'], 10); if (!succ_date_ok($v)) { throw new LcndaBadInput('Date incorrecte.'); } $vals['date_envoi'] = $v; }
    foreach (['ar_media_id', 'depot_media_id'] as $k) { if (array_key_exists($k, $d)) { $vals[$k] = safe_int($d[$k]) ?: null; } }
    if (!$vals) { return ['courrier_id' => $kid]; }
    $prev = array_intersect_key($r, $vals);
    $sets = implode(', ', array_map(static fn($c) => "$c=?", array_keys($vals)));
    $pdo->prepare("UPDATE courriers SET $sets, updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([...array_values($vals), $kid]);
    if (empty($d['undo'])) {
        $txt = isset($vals['ar_date']) && $vals['ar_date'] !== '' ? '📮 Accusé de réception reçu le ' . $vals['ar_date'] . ' : courrier n° ' . $kid
            : (isset($vals['ar_etat']) && $vals['ar_etat'] !== '' ? '📮 Retour du courrier n° ' . $kid . ' : ' . ($vals['ar_etat'] === 'npai' ? 'pli non distribué' : 'destinataire inconnu') : '📮 Recommandé noté : courrier n° ' . $kid);
        succ_journal($pdo, (int) $r['succ_case_id'], 'courrier', $txt);
    }
    return ['courrier_id' => $kid, 'prev' => $prev, 'num_ok' => !isset($vals['recommande_num']) || $vals['recommande_num'] === '' || succ_p2_rec_num_ok($vals['recommande_num'])];
}

/* ═════════ 12. 🗓 Dates importantes (l'app ne calcule aucun délai légal) ═════════ */
function succ_p2_reminders_clean(string $s): string
{
    $out = []; foreach (preg_split('/[^0-9]+/', $s) ?: [] as $x) { if ($x !== '' && (int) $x >= 0 && (int) $x <= 365) { $out[(int) $x] = true; } }
    krsort($out); return implode(',', array_keys($out));
}
function succ_p2_imp_save(PDO $pdo, array $d): array
{
    $c = succ_p2_case_open($pdo, safe_int($d['case_id'] ?? 0)); $cid = (int) $c['id'];
    $id = safe_int($d['id'] ?? 0);
    $due = succ_txt($d['due'] ?? '', 10); if (!succ_date_ok($due)) { throw new LcndaBadInput('Choisis la date.'); }
    $label = succ_txt($d['label'] ?? '', 300); if ($label === '') { throw new LcndaBadInput('Écris ce qu’il faut faire.'); }
    $origin = succ_txt($d['origin'] ?? '', 300); if ($origin === '') { throw new LcndaBadInput('« D’où vient cette date » est obligatoire.'); }
    $rem = succ_p2_reminders_clean((string) ($d['reminders'] ?? succ_p2_set()['dates_reminders']));
    $media = safe_int($d['media_id'] ?? 0) ?: null;
    if ($id) {
        $s = $pdo->prepare('SELECT * FROM succ_deadlines WHERE id=? AND case_id=?'); $s->execute([$id, $cid]); $old = $s->fetch(PDO::FETCH_ASSOC);
        if (!$old) { throw new LcndaBadInput('Échéance introuvable.'); }
        $prevDue = $old['due'] !== $due ? (string) $old['due'] : (string) $old['prev_due'];
        $pdo->prepare('UPDATE succ_deadlines SET due=?, label=?, origin=?, reminders=?, media_id=?, important=1, prev_due=?, reminders_seen=? WHERE id=?')->execute([$due, $label, $origin, $rem, $media, $prevDue, $old['due'] !== $due ? '' : (string) $old['reminders_seen'], $id]);
        succ_journal($pdo, $cid, 'deadline', $old['due'] !== $due ? '🗓 Date importante déplacée : ' . $label . ' (était le ' . $old['due'] . ', maintenant le ' . $due . ')' : '🗓 Date importante modifiée : ' . $label);
        return ['id' => $id, 'prev' => array_intersect_key($old, array_flip(['due', 'label', 'origin', 'reminders', 'media_id', 'prev_due', 'reminders_seen']))];
    }
    $pdo->prepare("INSERT INTO succ_deadlines(case_id, due, label, kind, origin, reminders, media_id, important) VALUES(?,?,?, 'autre', ?,?,?, 1)")->execute([$cid, $due, $label, $origin, $rem, $media]);
    $id = (int) $pdo->lastInsertId();
    succ_journal($pdo, $cid, 'deadline', '🗓 Date importante du ' . $due . ' : ' . $label . ' (d’où : ' . $origin . ')');
    return ['id' => $id];
}
function succ_p2_imp_undo(PDO $pdo, array $d): array
{
    $cid = safe_int($d['case_id'] ?? 0); succ_row($pdo, $cid); $id = safe_int($d['id'] ?? 0); $p = is_array($d['prev'] ?? null) ? $d['prev'] : null;
    if (!$p) { $pdo->prepare('UPDATE succ_deadlines SET deleted_at=CURRENT_TIMESTAMP WHERE id=? AND case_id=?')->execute([$id, $cid]); return ['ok' => true]; }
    $pdo->prepare('UPDATE succ_deadlines SET due=?, label=?, origin=?, reminders=?, media_id=?, prev_due=?, reminders_seen=? WHERE id=? AND case_id=?')
        ->execute([succ_txt($p['due'] ?? '', 10), succ_txt($p['label'] ?? '', 300), succ_txt($p['origin'] ?? '', 300), succ_p2_reminders_clean((string) ($p['reminders'] ?? '')), safe_int($p['media_id'] ?? 0) ?: null, succ_txt($p['prev_due'] ?? '', 10), succ_txt($p['reminders_seen'] ?? '', 100), $id, $cid]);
    return ['ok' => true];
}
/** le rappel du jour d'une date importante : J−30, J−7, J−1 (pas vus), ou la date passée ; null sinon */
function succ_p2_reminder_due(string $due, string $rem, string $seen, string $today): ?array
{
    if (!succ_date_ok($due)) { return null; }
    $days = (int) round((strtotime($due . ' 12:00') - strtotime($today . ' 12:00')) / 86400);
    if ($days < 0) { return ['j' => 0, 'day' => $due, 'late' => true, 'days' => $days]; }
    $seenL = array_map('intval', array_filter(explode(',', $seen), 'strlen'));
    $best = null;
    foreach (array_map('intval', array_filter(explode(',', $rem), 'strlen')) as $j) {
        if ($days <= $j && !in_array($j, $seenL, true)) { if ($best === null || $j < $best) { $best = $j; } }
    }
    if ($best === null) { return null; }
    return ['j' => $best, 'day' => date('Y-m-d', strtotime($due . ' -' . $best . ' days')), 'late' => false, 'days' => $days];
}

/* ═════════ 🔔 La cloche : les nouveautés des outils (jamais un nom d'héritier, jamais un montant) ═════════ */
function succ_p2_due_items(PDO $pdo, int $caseId, string $until): array
{
    $out = [];
    if (!succ_p2_has($pdo, 'succ_deadlines', 'important')) { return $out; }
    $today = date('Y-m-d');
    try {
        // 🗓 les dates importantes : leurs rappels (J−30, J−7, J−1)
        $s = $pdo->prepare("SELECT id, due, label, reminders, reminders_seen FROM succ_deadlines WHERE case_id=? AND important=1 AND deleted_at IS NULL AND done=0"); $s->execute([$caseId]);
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $x = succ_p2_reminder_due((string) $r['due'], (string) $r['reminders'], (string) $r['reminders_seen'], $today);
            if (!$x || $x['late'] || $x['day'] > $until || $x['days'] <= 7) { continue; } // dans les 7 jours : déjà dans les échéances
            $out[] = ['kind' => 'p2imp', 'id' => (int) $r['id'] . ':' . $x['j'], 'due' => max($x['day'], $today), 'label' => '🗓 ' . (string) $r['label'] . ' — rappel J−' . $x['j'] . ' (le ' . $r['due'] . ')', 'sort' => 'important'];
        }
        // 📮 accusé de réception attendu
        $set = succ_p2_set();
        $c = $pdo->prepare("SELECT id, date_envoi, ar_relance_jours FROM courriers WHERE succ_case_id=? AND recommande='ar' AND ar_date='' AND ar_etat='' AND date_envoi<>''"); $c->execute([$caseId]);
        foreach ($c->fetchAll(PDO::FETCH_ASSOC) as $k) {
            $due = date('Y-m-d', strtotime((string) $k['date_envoi'] . ' +' . ((int) ($k['ar_relance_jours'] ?? 0) ?: (int) $set['rec_relance']) . ' days'));
            if ($due <= $until) { $out[] = ['kind' => 'p2ar', 'id' => (int) $k['id'], 'due' => $due, 'label' => '📮 AR attendu · courrier n° ' . (int) $k['id'], 'sort' => 'ar']; }
        }
        // 💶 un reversement en attente depuis plus de 30 jours (sans nom ni montant)
        $f = $pdo->prepare("SELECT person_id, MIN(CASE WHEN sens='recu' THEN day END) AS first, SUM(CASE WHEN sens='recu' THEN amount_cents ELSE -amount_cents END) AS rest FROM succ_funds WHERE case_id=? AND deleted_at IS NULL GROUP BY person_id"); $f->execute([$caseId]);
        $late = array_filter($f->fetchAll(PDO::FETCH_ASSOC), static fn($r) => (int) $r['rest'] > 0 && $r['first'] && $r['first'] <= date('Y-m-d', strtotime('-30 days')));
        $opt = succ_p2_options($pdo, $caseId);
        // ✓ fait : caché tant que les reversements en attente ne changent pas ; ⏭ reporter : caché jusqu'à la date choisie
        $fs = is_array($opt['funds_seen'] ?? null) ? $opt['funds_seen'] : [];
        if ($late && !(($fs['sig'] ?? '') === succ_p2_funds_sig($late)) && !(($fs['until'] ?? '') > $today)) { $out[] = ['kind' => 'p2funds', 'id' => $caseId, 'due' => $today, 'label' => '💶 Un reversement en attente', 'sort' => 'funds']; }
        // 📅 une copie d'acte bientôt trop ancienne (durée de validité tapée par toi)
        $warn = (int) $set['validity_warn'];
        $p = $pdo->prepare("SELECT piece_key, issued_on, valid_months FROM succ_pieces WHERE case_id=? AND issued_on<>'' AND valid_months>0"); $p->execute([$caseId]);
        foreach ($p->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $end = date('Y-m-d', strtotime((string) $r['issued_on'] . ' +' . (int) $r['valid_months'] . ' months'));
            $at = date('Y-m-d', strtotime($end . ' -' . $warn . ' days'));
            $vs = is_array($opt['valid_seen'][(string) $r['piece_key']] ?? null) ? $opt['valid_seen'][(string) $r['piece_key']] : [];
            if (($vs['end'] ?? '') === $end || ($vs['until'] ?? '') > $today) { continue; } // ✓ vu pour cette copie (une nouvelle copie revient) ; ⏭ reporté
            if ($at <= $until) { $out[] = ['kind' => 'p2valid', 'id' => $caseId . ':' . $r['piece_key'], 'due' => max($at, $today), 'label' => '📅 Copie d’acte trop ancienne le ' . $end . ' (' . $r['piece_key'] . ')', 'sort' => 'validity']; }
        }
    } catch (Throwable $_) {}
    return $out;
}
/** ⚰️ après un nouvel import INSEE : le nombre de nouvelles pistes (sans nom), seulement dans la généalogie ouverte */
function succ_p2_insee_bell(PDO $pdo, array $caseRow): ?array
{
    $set = succ_p2_set(); if ($set['insee_auto'] !== 'auto') { return null; }
    $stats = succ_p2_insee_stats($pdo); if (!$stats['rows'] || !$stats['import']) { return null; }
    $o = json_decode((string) ($caseRow['options_json'] ?? ''), true) ?: [];
    if ((int) ($o['insee_seen'] ?? 0) >= $stats['import']) { return null; }
    $n = 0; $best = 0;
    foreach (succ_p2_insee_pistes($pdo, $caseRow) as $h) { foreach ($h['pistes'] as $p) { if (!$p['same']) { $n++; $best = max($best, $p['score']); } } }
    return ['kind' => 'p2insee', 'id' => (int) $caseRow['id'], 'due' => date('Y-m-d'), 'label' => $n ? '⚰️ ' . $n . ' nouvelle(s) piste(s) INSEE (score ' . $best . ')' : '⚰️ Nouveau fichier INSEE : rien de nouveau', 'sort' => 'insee', 'n' => $n];
}
/** 💶 l'état des reversements en attente (qui, combien), en empreinte : « ✓ fait » le cache tant qu'il ne change pas */
function succ_p2_funds_sig(array $rows): string { $x = []; foreach ($rows as $r) { $x[(int) $r['person_id']] = (int) $r['rest']; } ksort($x); return hash('sha256', json_encode($x)); }
/** ✓ fait / ⏭ reporter / ↶ pour les lignes de la cloche venues de ces outils */
function succ_p2_due_mark(PDO $pdo, array $d): array
{
    $kind = (string) ($d['kind'] ?? ''); $act = in_array($d['act'] ?? '', ['done', 'snooze', 'undo'], true) ? (string) $d['act'] : 'done';
    $gid = (string) ($d['gid'] ?? succ_gid());
    $base = succ_outils_base($pdo, $gid); succ_p2_ensure($base);
    return succ_outils_in($base, static function (PDO $b) use ($kind, $act, $d): array {
        $id = (string) ($d['id'] ?? '');
        if ($kind === 'p2imp') {
            [$did, $j] = array_map('intval', explode(':', $id . ':0'));
            $s = $b->prepare('SELECT case_id, reminders_seen FROM succ_deadlines WHERE id=?'); $s->execute([$did]); $r = $s->fetch(PDO::FETCH_ASSOC);
            if (!$r) { throw new LcndaBadInput('Échéance introuvable.'); }
            $prev = ['seen' => (string) $r['reminders_seen']];
            $seen = $act === 'undo' ? succ_txt($d['prev']['seen'] ?? '', 100) : implode(',', array_unique(array_filter(array_merge(explode(',', (string) $r['reminders_seen']), [(string) $j]), 'strlen')));
            $b->prepare('UPDATE succ_deadlines SET reminders_seen=? WHERE id=?')->execute([$seen, $did]);
            return ['prev' => $prev];
        }
        if ($kind === 'p2ar') {
            $kid = (int) $id; $s = $b->prepare('SELECT ar_relance_jours, date_envoi, succ_case_id FROM courriers WHERE id=?'); $s->execute([$kid]); $r = $s->fetch(PDO::FETCH_ASSOC);
            if (!$r) { throw new LcndaBadInput('Courrier introuvable.'); }
            $prev = ['days' => $r['ar_relance_jours'] === null ? null : (int) $r['ar_relance_jours']];
            if ($act === 'undo') { $b->prepare('UPDATE courriers SET ar_relance_jours=? WHERE id=?')->execute([($d['prev']['days'] ?? null) === null ? null : safe_int($d['prev']['days']), $kid]); return ['prev' => $prev]; }
            $to = $act === 'done' ? date('Y-m-d', strtotime('+7 days')) : succ_txt($d['to'] ?? '', 10);
            if (!succ_date_ok($to)) { throw new LcndaBadInput('Date incorrecte.'); }
            $days = max(1, (int) round((strtotime($to) - strtotime((string) $r['date_envoi'])) / 86400));
            $b->prepare('UPDATE courriers SET ar_relance_jours=? WHERE id=?')->execute([min(400, $days), $kid]);
            succ_journal($b, (int) $r['succ_case_id'], 'courrier', '📮 Relance de l’AR du courrier n° ' . $kid . ' reportée au ' . $to);
            return ['prev' => $prev];
        }
        if ($kind === 'p2insee' || $kind === 'p2funds' || $kind === 'p2valid') {
            $cid = (int) explode(':', $id)[0]; $o = succ_p2_options($b, $cid); $prev = ['o' => array_intersect_key($o, array_flip(['insee_seen', 'funds_seen', 'valid_seen']))];
            if ($act === 'undo') { foreach (['insee_seen', 'funds_seen', 'valid_seen'] as $k) { unset($o[$k]); } $o = array_merge($o, is_array($d['prev']['o'] ?? null) ? array_intersect_key($d['prev']['o'], array_flip(['insee_seen', 'funds_seen', 'valid_seen'])) : []); }
            elseif ($kind === 'p2insee') { $o['insee_seen'] = succ_p2_insee_stats($b)['import'] ?? 0; }
            else {
                $to = $act === 'done' ? '' : succ_txt($d['to'] ?? date('Y-m-d', strtotime('+7 days')), 10);
                if ($to !== '' && !succ_date_ok($to)) { throw new LcndaBadInput('Date incorrecte.'); }
                if ($kind === 'p2funds') {
                    $f = $b->prepare("SELECT person_id, SUM(CASE WHEN sens='recu' THEN amount_cents ELSE -amount_cents END) AS rest FROM succ_funds WHERE case_id=? AND deleted_at IS NULL GROUP BY person_id"); $f->execute([$cid]);
                    $o['funds_seen'] = $act === 'done' ? ['sig' => succ_p2_funds_sig(array_filter($f->fetchAll(PDO::FETCH_ASSOC), static fn($r) => (int) $r['rest'] > 0)), 'at' => date('Y-m-d')] : ['until' => $to];
                } else {
                    $key = (string) (explode(':', $id, 2)[1] ?? ''); if ($key === '') { throw new LcndaBadInput('Pièce introuvable.'); }
                    $p = $b->prepare("SELECT issued_on, valid_months FROM succ_pieces WHERE case_id=? AND piece_key=?"); $p->execute([$cid, $key]); $pr = $p->fetch(PDO::FETCH_ASSOC);
                    if (!$pr) { throw new LcndaBadInput('Pièce introuvable.'); }
                    $vs = is_array($o['valid_seen'] ?? null) ? $o['valid_seen'] : [];
                    $vs[$key] = $act === 'done' ? ['end' => date('Y-m-d', strtotime((string) $pr['issued_on'] . ' +' . (int) $pr['valid_months'] . ' months'))] : ['until' => $to];
                    $o['valid_seen'] = $vs;
                }
            }
            succ_p2_options_save($b, $cid, $o);
            return ['prev' => $prev];
        }
        throw new LcndaBadInput('Demande inconnue.');
    });
}

/* ═════════ 11. 🔗 Double preuve : les dossiers de preuve « prouvé » et « une pièce me suffit ici » ═════════ */
function succ_p2_proofs(PDO $pdo, array $ids): array
{
    if (!$ids || !succ_p2_has($pdo, 'proof_cases')) { return []; }
    $out = [];
    foreach (array_chunk(array_map('intval', $ids), 400) as $ch) {
        $in = implode(',', $ch);
        foreach ($pdo->query("SELECT person_id, related_id, certainty FROM proof_cases WHERE deleted_at='' AND person_id IN ($in)")->fetchAll(PDO::FETCH_ASSOC) as $r) {
            if (in_array((string) $r['certainty'], ['proved', 'prouve'], true)) { $out[] = ['child' => (int) $r['person_id'], 'parent' => (int) $r['related_id']]; }
        }
    }
    return $out;
}
function succ_p2_proof_ok(PDO $pdo, array $d): array
{
    $c = succ_p2_case_open($pdo, safe_int($d['case_id'] ?? 0)); $cid = (int) $c['id'];
    $key = (string) ($d['key'] ?? ''); if (!preg_match('/^[NDMVR]:\d{1,10}$/', $key)) { throw new LcndaBadInput('Pièce inconnue.'); }
    $o = succ_p2_options($pdo, $cid); $ok = is_array($o['one_piece_ok'] ?? null) ? $o['one_piece_ok'] : [];
    $prev = $ok[$key] ?? null;
    if (!empty($d['on'])) { $ok[$key] = ['at' => date('Y-m-d'), 'who' => function_exists('access_log_machine') ? access_log_machine() : '']; } else { unset($ok[$key]); }
    $o['one_piece_ok'] = $ok ?: new stdClass(); succ_p2_options_save($pdo, $cid, $o);
    succ_journal($pdo, $cid, 'piece', !empty($d['on']) ? '🔗 Une pièce jugée suffisante : ' . succ_txt($d['what'] ?? $key, 200) : '🔗 « Une pièce me suffit » retiré : ' . succ_txt($d['what'] ?? $key, 200));
    return ['prev' => $prev];
}

/* ═════════ 📅 Date de délivrance d'une pièce et validité (tapée par toi ; aucune durée par défaut) ═════════ */
function succ_p2_piece_issued(PDO $pdo, array $d): array
{
    $c = succ_p2_case_open($pdo, safe_int($d['case_id'] ?? 0)); $cid = (int) $c['id'];
    $key = (string) ($d['key'] ?? ''); if (!preg_match('/^[NDMVR]:\d{1,10}$/', $key)) { throw new LcndaBadInput('Pièce inconnue.'); }
    $on = succ_txt($d['issued_on'] ?? '', 10); if ($on !== '' && !succ_date_ok($on)) { throw new LcndaBadInput('Date incorrecte.'); }
    $mo = ($d['valid_months'] ?? '') === '' || $d['valid_months'] === null ? null : max(1, min(120, safe_int($d['valid_months'])));
    $s = $pdo->prepare('SELECT issued_on, valid_months FROM succ_pieces WHERE case_id=? AND piece_key=?'); $s->execute([$cid, $key]); $old = $s->fetch(PDO::FETCH_ASSOC) ?: null;
    if (!$old) { $pdo->prepare("INSERT INTO succ_pieces(case_id, piece_key, state) VALUES(?,?, '')")->execute([$cid, $key]); }
    $pdo->prepare('UPDATE succ_pieces SET issued_on=?, valid_months=?, updated_at=CURRENT_TIMESTAMP WHERE case_id=? AND piece_key=?')->execute([$on, $mo, $cid, $key]);
    if (empty($d['undo'])) { succ_journal($pdo, $cid, 'piece', '📅 ' . succ_txt($d['what'] ?? $key, 200) . ' : délivrée le ' . ($on ?: '—') . ($mo ? ', valable ' . $mo . ' mois (demandé par le notaire)' : '')); }
    return ['prev' => $old ? ['issued_on' => (string) $old['issued_on'], 'valid_months' => $old['valid_months'] === null ? null : (int) $old['valid_months']] : ['issued_on' => '', 'valid_months' => null]];
}

/* ═════════ 📮 Une lettre par service pour les actes manquants ═════════ */
function succ_p2_group_letters(PDO $pdo, array $d): array
{
    $c = succ_p2_case_open($pdo, safe_int($d['case_id'] ?? 0)); $cid = (int) $c['id'];
    $groups = array_slice(is_array($d['groups'] ?? null) ? $d['groups'] : [], 0, 40);
    $date = succ_txt($d['date_envoi'] ?? date('Y-m-d'), 10); if (!succ_date_ok($date)) { throw new LcndaBadInput('Date incorrecte.'); }
    $delay = max(0, min(365, safe_int($d['relance_jours'] ?? 30)));
    $ids = [];
    foreach ($groups as $g) {
        if (!is_array($g)) { continue; }
        $to = succ_txt($g['service'] ?? '', 200); $keys = array_values(array_filter(array_map('strval', is_array($g['keys'] ?? null) ? $g['keys'] : []), static fn($k) => (bool) preg_match('/^[NDMVR]:\d{1,10}$/', $k)));
        $letter = succ_txt($g['letter'] ?? '', 20000, true);
        if ($to === '' || !$keys || $letter === '') { continue; }
        $pdo->prepare("INSERT INTO courriers(organisme, destinataire, objet, date_envoi, statut, relance_delai_jours, relance_date, notes) VALUES('autre',?,?,?,'en_attente',?,?,?)")
            ->execute([$to, 'Demande d’actes (' . count($keys) . ')', $date, $delay, $delay ? date('Y-m-d', strtotime($date . ' +' . $delay . ' days')) : '', $letter]);
        $kid = (int) $pdo->lastInsertId();
        $pdo->prepare("UPDATE courriers SET succ_case_id=?, succ_kind='acte' WHERE id=?")->execute([$cid, $kid]);
        foreach ($keys as $k) { succ_piece_set($pdo, ['case_id' => $cid, 'key' => $k, 'state' => 'asked', 'courrier_id' => $kid, 'quiet' => 1]); }
        $ids[] = $kid;
    }
    if (!$ids) { throw new LcndaBadInput('Aucune lettre à ranger.'); }
    succ_journal($pdo, $cid, 'courrier', '📮 Demandes d’actes regroupées : ' . count($ids) . ' lettre(s) (n° ' . implode(', ', $ids) . ')');
    return ['ids' => $ids];
}
/** ↶ : les lettres retirées, les pièces remises « d'après la fiche » */
function succ_p2_group_undo(PDO $pdo, array $d): array
{
    $cid = safe_int($d['case_id'] ?? 0); succ_row($pdo, $cid); $n = 0;
    foreach (array_slice(array_map('intval', is_array($d['ids'] ?? null) ? $d['ids'] : []), 0, 40) as $kid) {
        $s = $pdo->prepare("SELECT id FROM courriers WHERE id=? AND succ_case_id=? AND succ_kind='acte'"); $s->execute([$kid, $cid]); if (!$s->fetchColumn()) { continue; }
        $pdo->prepare("UPDATE succ_pieces SET state='', courrier_id=NULL WHERE case_id=? AND courrier_id=?")->execute([$cid, $kid]);
        $pdo->prepare('DELETE FROM courriers WHERE id=?')->execute([$kid]); $n++;
    }
    succ_journal($pdo, $cid, 'courrier', '📮 Demandes d’actes regroupées annulées : ' . $n);
    return ['removed' => $n];
}
/** ⏳ délai de réponse par organisme : envoi → réponse reçue (courriers des dossiers) ; moyenne ou médiane (réglage) */
function succ_p2_delays(PDO $pdo): array
{
    $set = succ_p2_set(); $by = [];
    try {
        foreach ($pdo->query("SELECT destinataire, date_envoi, CASE WHEN reponse_le<>'' THEN reponse_le WHEN statut='reponse_recue' THEN substr(updated_at,1,10) ELSE '' END AS rep FROM courriers WHERE succ_case_id IS NOT NULL AND date_envoi<>'' AND succ_kind='acte'")->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $rep = substr((string) $r['rep'], 0, 10); if (!succ_date_ok($rep) || !succ_date_ok((string) $r['date_envoi'])) { continue; }
            $days = (int) round((strtotime($rep) - strtotime((string) $r['date_envoi'])) / 86400); if ($days < 0) { continue; }
            $by[trim((string) $r['destinataire']) ?: '—'][] = $days;
        }
    } catch (Throwable $_) {}
    $out = [];
    foreach ($by as $who => $l) {
        sort($l); $n = count($l);
        $v = $set['delay_stat'] === 'median' ? ($n % 2 ? $l[intdiv($n, 2)] : (int) round(($l[$n / 2 - 1] + $l[$n / 2]) / 2)) : (int) round(array_sum($l) / $n);
        $out[] = ['who' => $who, 'n' => $n, 'days' => $v, 'enough' => $n >= (int) $set['delay_min']];
    }
    usort($out, static fn($a, $b) => $b['n'] <=> $a['n'] ?: strcmp($a['who'], $b['who']));
    return $out;
}

/* ═════════ 8. 🗺 Carte des héritiers (lecture seule ; rien n'est envoyé en ligne) ═════════ */
function succ_p2_commune_point(PDO $pdo, string $city, string $cp): ?array
{
    $n = succ_p2_norm($city); if ($n === '') { return null; }
    try {
        $s = $pdo->prepare('SELECT latitude, longitude FROM places WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND name=? COLLATE NOCASE LIMIT 1'); $s->execute([trim($city)]);
        if ($r = $s->fetch(PDO::FETCH_NUM)) { return ['lat' => (float) $r[0], 'lon' => (float) $r[1], 'how' => 'place']; }
    } catch (Throwable $_) {}
    if (succ_p2_has($pdo, 'commune_contours')) {
        $s = $pdo->prepare('SELECT insee_code, name, centroid_lat, centroid_lon FROM commune_contours WHERE name=? COLLATE NOCASE LIMIT 5'); $s->execute([trim($city)]);
        $rows = $s->fetchAll(PDO::FETCH_ASSOC);
        if (!$rows) { $s = $pdo->prepare("SELECT insee_code, name, centroid_lat, centroid_lon FROM commune_contours WHERE replace(replace(upper(name),'-',' '),'''',' ')=? LIMIT 5"); $s->execute([$n]); $rows = $s->fetchAll(PDO::FETCH_ASSOC); }
        if ($rows) {
            $pick = $rows[0];
            if (count($rows) > 1 && preg_match('/^(\d{2})/', $cp, $m)) { foreach ($rows as $r) { if (str_starts_with((string) $r['insee_code'], $m[1])) { $pick = $r; break; } } }
            return ['lat' => (float) $pick['centroid_lat'], 'lon' => (float) $pick['centroid_lon'], 'how' => 'commune', 'insee' => (string) $pick['insee_code']];
        }
    }
    return null;
}
function succ_p2_ban_point(PDO $pdo, string $insee, string $address): ?array
{
    if ($insee === '' || !succ_p2_has($pdo, 'ban_addresses') || !function_exists('addr_street_key')) { return null; }
    if (!preg_match('/^\s*(\d+\s*(?:bis|ter|[a-z])?)\s+(.+)$/iu', trim(explode("\n", $address)[0]), $m)) { return null; }
    $s = $pdo->prepare('SELECT lat, lon FROM ban_addresses WHERE insee=? AND street_key=? AND house_key=? LIMIT 1'); $s->execute([$insee, addr_street_key($m[2]), function_exists('addr_house_key') ? addr_house_key($m[1]) : strtolower(preg_replace('/\s+/', '', $m[1]))]);
    $r = $s->fetch(PDO::FETCH_NUM);
    return $r ? ['lat' => (float) $r[0], 'lon' => (float) $r[1], 'how' => 'ban'] : null;
}
function succ_p2_map(PDO $pdo, array $g): array
{
    if (!function_exists('addr_street_key') && is_file(__DIR__ . '/addr_map.php')) { require_once __DIR__ . '/addr_map.php'; }
    $set = succ_p2_set();
    $caseIds = [];
    if (safe_int($g['case_id'] ?? 0)) { $caseIds[] = (int) succ_row($pdo, safe_int($g['case_id']))['id']; }
    else { foreach ($pdo->query("SELECT id FROM succ_cases WHERE deleted_at IS NULL AND state NOT IN ('clos','archive')")->fetchAll(PDO::FETCH_COLUMN) as $x) { $caseIds[] = (int) $x; } }
    $points = []; $off = [];
    foreach ($caseIds as $cid) {
        $c = succ_row($pdo, $cid);
        $snap = json_decode((string) $c['snapshot_json'], true);
        $heirs = []; foreach ((array) ($snap['shares'] ?? []) as $k => $v) { if ((string) $v !== '0') { $heirs[(int) $k] = (string) $v; } }
        $ps = succ_persons($pdo, array_keys($heirs));
        foreach ($heirs as $pid => $share) {
            $p = $ps[$pid] ?? null; if (!$p) { continue; }
            $s = $pdo->prepare('SELECT address, postal_code, city, country FROM living_contacts WHERE person_id=? ORDER BY updated_at DESC, id DESC LIMIT 1'); $s->execute([$pid]); $lc = $s->fetch(PDO::FETCH_ASSOC);
            $row = ['case_id' => $cid, 'number' => (string) $c['number'], 'person_id' => $pid, 'name' => succ_name($p), 'share' => $share, 'dead' => (bool) $p['death'], 'city' => '', 'abroad' => false];
            if (!$lc || trim((string) $lc['city']) === '') { $off[] = $row + ['why' => 'noaddr']; continue; }
            $row['city'] = trim((string) $lc['city']);
            if (trim((string) $lc['country']) !== '' && succ_p2_norm((string) $lc['country']) !== 'FRANCE') { $off[] = $row + ['why' => 'abroad', 'country' => (string) $lc['country']]; continue; }
            $pt = succ_p2_commune_point($pdo, (string) $lc['city'], (string) $lc['postal_code']);
            if ($pt && $set['map_precision'] === 'ban' && !empty($pt['insee'])) { $pt = succ_p2_ban_point($pdo, (string) $pt['insee'], (string) $lc['address']) ?? $pt; }
            if (!$pt) { $off[] = $row + ['why' => 'noplace']; continue; }
            $points[] = $row + ['lat' => $pt['lat'], 'lon' => $pt['lon'], 'how' => $pt['how']];
        }
    }
    $notaries = [];
    if ($set['map_notaries'] === 'known') {
        $seen = [];
        foreach ($pdo->query("SELECT id, notary_person_id, notary_text FROM succ_cases WHERE deleted_at IS NULL AND (notary_person_id IS NOT NULL OR notary_text<>'')")->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $pid = (int) $r['notary_person_id'];
            $s = $pdo->prepare('SELECT city, postal_code FROM living_contacts WHERE person_id=? AND person_id IS NOT NULL ORDER BY id DESC LIMIT 1'); $s->execute([$pid]); $lc = $pid ? $s->fetch(PDO::FETCH_ASSOC) : null;
            $name = $pid ? succ_person_name($pdo, $pid) : (string) $r['notary_text'];
            if (!$lc || isset($seen[$name])) { continue; } $seen[$name] = 1;
            $pt = succ_p2_commune_point($pdo, (string) $lc['city'], (string) $lc['postal_code']); if ($pt) { $notaries[] = ['name' => $name, 'city' => (string) $lc['city'], 'lat' => $pt['lat'], 'lon' => $pt['lon']]; }
        }
        try {
            foreach ($pdo->query("SELECT first_name, last_name, city, postal_code FROM living_contacts WHERE relationship LIKE '%notaire%' OR notes LIKE '%notaire%' LIMIT 200")->fetchAll(PDO::FETCH_ASSOC) as $lc) {
                $name = trim((string) $lc['first_name'] . ' ' . (string) $lc['last_name']); if ($name === '' || isset($seen[$name])) { continue; } $seen[$name] = 1;
                $pt = succ_p2_commune_point($pdo, (string) $lc['city'], (string) $lc['postal_code']); if ($pt) { $notaries[] = ['name' => $name, 'city' => (string) $lc['city'], 'lat' => $pt['lat'], 'lon' => $pt['lon']]; }
            }
        } catch (Throwable $_) {}
    }
    return ['points' => $points, 'off' => $off, 'notaries' => $notaries, 'precision' => $set['map_precision'], 'ban_ready' => succ_p2_has($pdo, 'ban_addresses')];
}

/* ═════════ 14. 🕵️ Recherches faites par héritier (rien n'est recopié) ═════════ */
function succ_p2_research(PDO $pdo, int $caseId, int $pid): array
{
    succ_row($pdo, $caseId);
    $rows = [];
    if (function_exists('research_journal_data')) {
        try {
            foreach ((research_journal_data($pdo, ['person_id' => $pid, 'limit' => 300])['rows'] ?? []) as $r) {
                $rows[] = ['date' => substr((string) ($r['date'] ?? ''), 0, 10), 'where' => trim(implode(' · ', array_filter([(string) ($r['service'] ?? ''), (string) ($r['commune'] ?? ''), (string) ($r['cote'] ?? '')]))) ?: (string) ($r['title'] ?? ''),
                    'what' => trim((string) ($r['record_label'] ?? '') . ' ' . (string) ($r['years'] ?? '')) ?: (string) ($r['title'] ?? ''), 'result' => (string) ($r['result_label'] ?? '') ?: (string) ($r['status_label'] ?? ''), 'negative' => ($r['result'] ?? '') === 'none', 'src' => 'journal'];
            }
        } catch (Throwable $_) {}
    }
    try {
        $s = $pdo->prepare("SELECT at, score, verdict FROM succ_insee_checks WHERE case_id=? AND person_id=? AND verdict IN ('run','same') ORDER BY id DESC LIMIT 20"); $s->execute([$caseId, $pid]);
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { $rows[] = ['date' => substr((string) $r['at'], 0, 10), 'where' => 'Fichier INSEE des décès', 'what' => '⚰️ vérification', 'result' => $r['verdict'] === 'same' ? 'décès confirmé' : ((int) $r['score'] ? (int) $r['score'] . ' piste(s)' : 'rien trouvé dans le fichier'), 'negative' => $r['verdict'] === 'run' && !(int) $r['score'], 'src' => 'insee']; }
        $s = $pdo->prepare("SELECT at, who_text, means, summary FROM succ_calls WHERE case_id=? AND person_id=? AND research=1 AND deleted_at IS NULL ORDER BY at DESC"); $s->execute([$caseId, $pid]);
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { $rows[] = ['date' => substr((string) $r['at'], 0, 10), 'where' => (string) $r['who_text'] ?: '📞', 'what' => '📞 ' . (string) $r['means'], 'result' => mb_substr((string) $r['summary'], 0, 200), 'negative' => false, 'src' => 'call']; }
    } catch (Throwable $_) {}
    usort($rows, static fn($a, $b) => strcmp($b['date'], $a['date']));
    return ['rows' => $rows, 'negative' => count(array_filter($rows, static fn($r) => $r['negative']))];
}
function succ_p2_research_add(PDO $pdo, array $d): array
{
    $c = succ_p2_case_open($pdo, safe_int($d['case_id'] ?? 0));
    $ids = array_values(array_filter(array_map('intval', is_array($d['person_ids'] ?? null) ? $d['person_ids'] : [safe_int($d['person_id'] ?? 0)]), static fn($x) => succ_person_ok($pdo, $x)));
    if (!$ids) { throw new LcndaBadInput('Fiche introuvable.'); }
    if (!function_exists('save_archive_digest')) { throw new RuntimeException('Journal des recherches indisponible.'); }
    $where = succ_txt($d['where'] ?? '', 200); if ($where === '') { throw new LcndaBadInput('Où as-tu cherché ?'); }
    $r = save_archive_digest($pdo, ['archive_service' => $where, 'city_name' => succ_txt($d['commune'] ?? '', 120), 'year_text' => succ_txt($d['years'] ?? '', 60), 'record_type' => 'autre',
        'status' => 'done', 'searched' => succ_txt($d['what'] ?? '', 300), 'found' => succ_txt($d['found'] ?? '', 1000), 'result' => in_array($d['result'] ?? '', ['found', 'none', 'partial'], true) ? $d['result'] : '', 'sought_ids' => $ids]);
    succ_journal($pdo, (int) $c['id'], 'search', '🕵️ Recherche notée : ' . $where);
    return ['digest_id' => (int) $r['id']];
}

/* ═════════ 9. 📝 Ton contrat : versions de tes modèles (aucun texte de l'app) ═════════ */
function succ_p2_tpl_versions(PDO $pdo, int $tplId): array
{
    $s = $pdo->prepare('SELECT version, body, saved_at FROM succ_template_versions WHERE template_id=? ORDER BY version DESC'); $s->execute([$tplId]);
    return array_map(static fn($r) => ['version' => (int) $r['version'], 'body' => (string) $r['body'], 'saved_at' => (string) $r['saved_at']], $s->fetchAll(PDO::FETCH_ASSOC));
}
function succ_p2_contract_save(PDO $pdo, array $d): array
{
    $r = succ_tpl_save($pdo, ['id' => $d['id'] ?? 0, 'name' => $d['name'] ?? '', 'kind' => 'contrat', 'body' => $d['body'] ?? '']);
    $id = (int) $r['id'];
    $v = (int) $pdo->query('SELECT COALESCE(MAX(version),0) FROM succ_template_versions WHERE template_id=' . $id)->fetchColumn() + 1;
    $pdo->prepare('INSERT INTO succ_template_versions(template_id, version, body) VALUES(?,?,?)')->execute([$id, $v, succ_txt($d['body'] ?? '', 20000, true)]);
    if (succ_p2_set()['contract_versions'] === 'last') { $pdo->prepare('DELETE FROM succ_template_versions WHERE template_id=? AND version<?')->execute([$id, $v]); }
    return ['id' => $id, 'version' => $v, 'prev' => $r['prev']];
}
function succ_p2_contract_undo(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0); $v = safe_int($d['version'] ?? 0);
    $pdo->prepare('DELETE FROM succ_template_versions WHERE template_id=? AND version=?')->execute([$id, $v]);
    $p = is_array($d['prev'] ?? null) ? $d['prev'] : null;
    if ($p) { $pdo->prepare('UPDATE succ_templates SET name=?, body=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([succ_txt($p['name'] ?? '', 120), succ_txt($p['body'] ?? '', 20000, true), $id]); }
    else { $pdo->prepare('UPDATE succ_templates SET deleted_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$id]); }
    return ['ok' => true];
}
/** ⤒ un .docx : le texte seulement (mise en forme simple), lu ici sans rien envoyer ailleurs */
function succ_p2_docx_text(array $d): array
{
    $b64 = (string) ($d['data'] ?? ''); if ($b64 === '' || strlen($b64) > 8_000_000) { throw new LcndaBadInput('Fichier trop gros.'); }
    $bin = base64_decode($b64, true); if ($bin === false) { throw new LcndaBadInput('Ce fichier n’est pas un .docx.'); }
    $tmp = tempnam(sys_get_temp_dir(), 'lcnda-docx'); file_put_contents($tmp, $bin);
    try {
        $z = new ZipArchive(); if ($z->open($tmp) !== true) { throw new LcndaBadInput('Ce fichier n’est pas un .docx.'); }
        $st = $z->statName('word/document.xml'); // la taille décompressée d'abord : une « bombe » zip n'est jamais décompressée
        if (!is_array($st) || (int) $st['size'] > 20_000_000) { $z->close(); throw new LcndaBadInput('Ce fichier n’est pas un .docx.'); }
        $xml = $z->getFromName('word/document.xml', 20_000_001); $z->close();
        if (!is_string($xml) || strlen($xml) > 20_000_000) { throw new LcndaBadInput('Ce fichier n’est pas un .docx.'); }
        $xml = (string) preg_replace(['#</w:p>#', '#<w:tab/>#', '#<w:br\s*/>#'], ["\n\n", "\t", "\n"], $xml);
        $text = html_entity_decode(strip_tags($xml), ENT_QUOTES | ENT_XML1, 'UTF-8');
        return ['text' => trim((string) preg_replace("/\n{3,}/", "\n\n", mb_substr($text, 0, 20000)))];
    } finally { @unlink($tmp); }
}
/** la version du modèle utilisée pour un contrat rangé au Registre (on sait ce que l'héritier a signé) */
function succ_p2_courrier_tpl(PDO $pdo, array $d): array
{
    $ids = array_slice(array_map('intval', is_array($d['ids'] ?? null) ? $d['ids'] : []), 0, 200); $tv = succ_txt($d['tpl'] ?? '', 40);
    if (!preg_match('/^\d+:\d+$/', $tv)) { throw new LcndaBadInput('Valeur inconnue.'); }
    foreach ($ids as $kid) { $pdo->prepare('UPDATE courriers SET template_version=? WHERE id=? AND succ_case_id IS NOT NULL')->execute([$tv, $kid]); }
    return ['ok' => true];
}

/* ═════════ 2. 📋 Questionnaire à envoyer à un héritier ═════════ */
const SUCC_Q_FIELDS = ['civil', 'spouses', 'children', 'contact', 'family', 'documents', 'question'];
function succ_p2_q_make(PDO $pdo, array $d): array
{
    $c = succ_p2_case_open($pdo, safe_int($d['case_id'] ?? 0)); $cid = (int) $c['id'];
    $fields = array_values(array_intersect(SUCC_Q_FIELDS, array_map('strval', is_array($d['fields'] ?? null) ? $d['fields'] : SUCC_Q_FIELDS)));
    $question = succ_txt($d['question'] ?? '', 600);
    $prefill = ($d['prefill'] ?? succ_p2_set()['q_prefill']) === 'yes';
    $out = [];
    foreach (array_slice(array_map('intval', is_array($d['person_ids'] ?? null) ? $d['person_ids'] : []), 0, 60) as $pid) {
        if (!succ_person_ok($pdo, $pid)) { continue; }
        $token = bin2hex(random_bytes(12));
        $p = succ_persons($pdo, [$pid])[$pid] ?? null;
        $pre = $prefill && $p ? ['last' => (string) $p['last'], 'first' => (string) $p['first'], 'birth' => (string) ($p['birth']['text'] ?? ''), 'birth_place' => (string) ($p['birth']['place'] ?? '')] : new stdClass();
        $pdo->prepare('INSERT INTO succ_questionnaires(case_id, person_id, token, fields_json) VALUES(?,?,?,?)')->execute([$cid, $pid, $token, json_encode(['fields' => $fields, 'question' => $question], JSON_UNESCAPED_UNICODE)]);
        $out[] = ['person_id' => $pid, 'token' => $token, 'prefill' => $pre, 'fields' => $fields, 'question' => $question, 'number' => (string) $c['number']];
    }
    if (!$out) { throw new LcndaBadInput('Coche au moins un héritier.'); }
    $kids = [];
    if (!empty($d['register'])) { // une ligne « questionnaire » au Registre de courriers, avec sa relance
        foreach ($out as $o) { $kids[] = (int) succ_file_letter($pdo, ['case_id' => $cid, 'person_id' => $o['person_id'], 'kind' => 'contact', 'objet' => 'Questionnaire', 'letter' => 'Questionnaire envoyé (dossier ' . $c['number'] . ')', 'relance_jours' => 30, 'quiet' => 1])['courrier_id']; }
    }
    succ_journal($pdo, $cid, 'courrier', '📋 Questionnaire préparé pour ' . count($out) . ' héritier(s)');
    return ['items' => $out, 'courriers' => $kids];
}
function succ_p2_q_undo_make(PDO $pdo, array $d): array
{
    $cid = safe_int($d['case_id'] ?? 0); succ_row($pdo, $cid);
    foreach (array_slice(is_array($d['tokens'] ?? null) ? $d['tokens'] : [], 0, 60) as $t) { $pdo->prepare('DELETE FROM succ_questionnaires WHERE case_id=? AND token=? AND answered_at IS NULL')->execute([$cid, (string) $t]); }
    if (is_array($d['courriers'] ?? null) && $d['courriers']) { succ_unfile_letters($pdo, ['case_id' => $cid, 'ids' => $d['courriers']]); }
    return ['ok' => true];
}
/** la somme de contrôle d'un fichier de réponses : SHA-256 de l'identifiant et des réponses (le fichier modifié est refusé) */
function succ_p2_q_sum(string $token, array $answers): string { return hash('sha256', $token . '|' . json_encode($answers, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_LINE_TERMINATORS)); }
function succ_p2_q_check(PDO $pdo, array $d): array
{
    $c = succ_row($pdo, safe_int($d['case_id'] ?? 0)); $cid = (int) $c['id'];
    if ($c['state'] === 'archive') { throw new LcndaBadInput('Ce dossier est archivé : rouvre-le d’abord.'); }
    $f = is_array($d['file'] ?? null) ? $d['file'] : null;
    $paper = !empty($d['paper']);
    if ($paper) {
        $pid = safe_int($d['person_id'] ?? 0); if (!succ_person_ok($pdo, $pid)) { throw new LcndaBadInput('Choisis l’héritier.'); }
        $q = ['token' => '', 'person_id' => $pid, 'answered_at' => null]; $answers = is_array($d['answers'] ?? null) ? $d['answers'] : [];
    } else {
        if (!$f || ($f['format'] ?? '') !== 'lcnda-succ-questionnaire' || !is_string($f['token'] ?? null) || !is_array($f['answers'] ?? null) || !is_string($f['sum'] ?? null)) { throw new LcndaBadInput('Ce fichier ne vient pas d’un questionnaire de ce dossier.'); }
        $s = $pdo->prepare('SELECT * FROM succ_questionnaires WHERE token=? AND case_id=? AND deleted_at IS NULL'); $s->execute([(string) $f['token'], $cid]); $q = $s->fetch(PDO::FETCH_ASSOC);
        if (!$q || !hash_equals(succ_p2_q_sum((string) $f['token'], $f['answers']), (string) $f['sum'])) { throw new LcndaBadInput('Ce fichier ne vient pas d’un questionnaire de ce dossier.'); }
        $answers = $f['answers']; $pid = (int) $q['person_id'];
    }
    $p = succ_persons($pdo, [$pid])[$pid] ?? null;
    $lc = $pdo->prepare('SELECT address, postal_code, city FROM living_contacts WHERE person_id=? ORDER BY updated_at DESC LIMIT 1'); $lc->execute([$pid]); $lc = $lc->fetch(PDO::FETCH_ASSOC) ?: null;
    $t = static fn($k, $max = 400) => succ_txt($answers[$k] ?? '', $max, true);
    $rows = [];
    $birth = trim($t('birth', 60) . ' ' . $t('birth_place', 160));
    if ($birth !== '') { $rows[] = ['key' => 'birth', 'base' => trim(($p['birth']['text'] ?? '') . ' ' . ($p['birth']['place'] ?? '')), 'answer' => $birth, 'check' => !($p['birth']['event_id'] ?? 0) || !($p['birth']['media'] ?? false), 'date' => $t('birth', 60), 'place' => $t('birth_place', 160)]; }
    $spouses = array_slice(array_values(array_filter(is_array($answers['spouses'] ?? null) ? $answers['spouses'] : [], 'is_array')), 0, 4);
    foreach ($spouses as $i => $sp) { $n = succ_txt($sp['name'] ?? '', 160); if ($n !== '') { $rows[] = ['key' => 'spouse:' . $i, 'base' => '', 'answer' => $n . (($sp['date'] ?? '') !== '' ? ' · ' . succ_txt($sp['date'], 60) : '') . (($sp['place'] ?? '') !== '' ? ' · ' . succ_txt($sp['place'], 120) : ''), 'check' => true, 'name' => $n, 'date' => succ_txt($sp['date'] ?? '', 60), 'place' => succ_txt($sp['place'] ?? '', 120)]; } }
    $kids = array_slice(array_values(array_filter(is_array($answers['children'] ?? null) ? $answers['children'] : [], 'is_array')), 0, 15);
    $kl = []; foreach ($kids as $k) { $n = succ_txt($k['name'] ?? '', 120); if ($n !== '') { $kl[] = ['name' => $n, 'birth' => succ_txt($k['birth'] ?? '', 60), 'dead' => !empty($k['dead'])]; } }
    if ($kl) { $rows[] = ['key' => 'children', 'base' => '', 'answer' => implode(' · ', array_map(static fn($k) => $k['name'] . ($k['birth'] !== '' ? ' (' . $k['birth'] . ')' : '') . ($k['dead'] ? ' †' : ''), $kl)), 'check' => true, 'children' => $kl]; }
    $addr = trim($t('address', 300)); $cpv = $t('postal_code', 12); $city = $t('city', 120);
    if ($addr !== '' || $city !== '') { $rows[] = ['key' => 'address', 'base' => $lc ? trim($lc['address'] . ', ' . $lc['postal_code'] . ' ' . $lc['city'], ', ') : '', 'answer' => trim($addr . ', ' . $cpv . ' ' . $city, ', '), 'check' => true, 'address' => $addr, 'postal_code' => $cpv, 'city' => $city, 'phone' => $t('phone', 40), 'email' => $t('email', 160)]; }
    if ($t('family', 2000) !== '') { $rows[] = ['key' => 'family', 'base' => '', 'answer' => $t('family', 2000), 'check' => false]; }
    $docs = array_slice(array_values(array_filter(array_map(static fn($x) => succ_txt($x, 120), is_array($answers['documents'] ?? null) ? $answers['documents'] : []), 'strlen')), 0, 12);
    if ($docs) { $rows[] = ['key' => 'documents', 'base' => '', 'answer' => implode(', ', $docs), 'check' => true, 'documents' => $docs]; }
    if ($t('question', 2000) !== '') { $rows[] = ['key' => 'question', 'base' => '', 'answer' => $t('question', 2000), 'check' => false]; }
    $earlier = $q['answered_at'] ?? null;
    return ['token' => (string) ($q['token'] ?? ''), 'person_id' => $pid, 'name' => $p ? succ_name($p) : '', 'rows' => $rows, 'earlier' => $earlier, 'paper' => $paper];
}
/** « Écrire N changements » : seulement les lignes cochées ; « source : déclaration de l'héritier, questionnaire du … » ; ↶ */
function succ_p2_q_apply(PDO $pdo, array $d): array
{
    $chk = succ_p2_q_check($pdo, $d); $cid = safe_int($d['case_id'] ?? 0); $pid = $chk['person_id'];
    $on = array_flip(array_map('strval', is_array($d['keys'] ?? null) ? $d['keys'] : []));
    $src = 'Source : déclaration de l’héritier, questionnaire du ' . succ_p2_fr_date(date('Y-m-d'));
    $made = ['persons' => [], 'families' => [], 'events' => [], 'contacts' => [], 'contact_prev' => [], 'deadlines' => []];
    $n = 0;
    $person = succ_persons($pdo, [$pid])[$pid] ?? null;
    $touches = array_filter(array_keys($on), static fn($k) => $k === 'birth' || $k === 'children' || $k === 'address' || str_starts_with((string) $k, 'spouse:'));
    if ($touches && function_exists('person_is_locked') && person_is_locked($pdo, $pid)) { throw new LcndaBadInput('Fiche verrouillée : les réponses ne sont pas écrites sur la fiche. Déverrouille-la d’abord.'); }
    $fam = static function (int $a, ?int $b) use ($pdo, $person): int {
        $female = ($person['gender'] ?? '') === 'female';
        $pdo->prepare('INSERT INTO families(partner1_id, partner2_id) VALUES(?,?)')->execute($female ? [$b, $a] : [$a, $b]);
        return (int) $pdo->lastInsertId();
    };
    foreach ($chk['rows'] as $r) {
        if (!isset($on[$r['key']]) || in_array($r['key'], ['question'], true)) { continue; }
        if ($r['key'] === 'birth') {
            $tag = succ_p2_tag_id($pdo, 'BIRT'); $iso = succ_iso((string) $r['date']);
            $ev = $person['birth']['event_id'] ?? 0;
            if ($ev) {
                $s = $pdo->prepare('SELECT date_text, year, sort_date, place_id, description FROM events WHERE id=?'); $s->execute([$ev]); $old = $s->fetch(PDO::FETCH_ASSOC); $made['event_prev'][$ev] = $old;
                // seulement les champs remplis : une réponse sans date garde la date de la fiche, une réponse sans lieu garde le lieu
                $hasDate = trim((string) $r['date']) !== '';
                $pdo->prepare('UPDATE events SET date_text=?, year=?, sort_date=?, place_id=COALESCE(?, place_id), description=trim(description || ? ) WHERE id=?')->execute([$hasDate ? $r['date'] : (string) $old['date_text'], $hasDate ? ($iso ? (int) substr($iso, 0, 4) : null) : $old['year'], $hasDate ? (strlen($iso) === 10 ? $iso : null) : $old['sort_date'], trim((string) $r['place']) !== '' ? succ_p2_place_id($pdo, (string) $r['place']) : null, "\n" . $src, $ev]);
            }
            elseif ($tag) { $pdo->prepare("INSERT INTO events(scope, person_id, event_type_id, date_text, year, sort_date, place_id, description) VALUES('person',?,?,?,?,?,?,?)")->execute([$pid, $tag, $r['date'], $iso ? (int) substr($iso, 0, 4) : null, strlen($iso) === 10 ? $iso : null, succ_p2_place_id($pdo, (string) $r['place']), $src]); $made['events'][] = (int) $pdo->lastInsertId(); }
            $n++;
        } elseif (str_starts_with($r['key'], 'spouse:')) {
            $parts = preg_split('/\s+/', trim((string) $r['name'])) ?: [];
            $last = count($parts) > 1 ? array_pop($parts) : ''; $first = implode(' ', $parts);
            $pdo->prepare("INSERT INTO persons(first_name, last_name, gender, living_status) VALUES(?,?,?, 'unknown')")->execute([$first, $last, ($person['gender'] ?? '') === 'female' ? 'male' : (($person['gender'] ?? '') === 'male' ? 'female' : 'unknown')]);
            $sp = (int) $pdo->lastInsertId(); $made['persons'][] = $sp;
            $fid = $fam($pid, $sp); $made['families'][] = $fid;
            $tag = succ_p2_tag_id($pdo, 'MARR'); $iso = succ_iso((string) $r['date']);
            if ($tag && ($r['date'] !== '' || $r['place'] !== '')) { $pdo->prepare("INSERT INTO events(scope, family_id, event_type_id, date_text, year, sort_date, place_id, description) VALUES('family',?,?,?,?,?,?,?)")->execute([$fid, $tag, $r['date'], $iso ? (int) substr($iso, 0, 4) : null, strlen($iso) === 10 ? $iso : null, succ_p2_place_id($pdo, (string) $r['place']), $src]); $made['events'][] = (int) $pdo->lastInsertId(); }
            $n++;
        } elseif ($r['key'] === 'children') {
            $fid = $fam($pid, null); $made['families'][] = $fid;
            foreach ($r['children'] as $k) {
                $pdo->prepare("INSERT INTO persons(first_name, last_name, living_status) VALUES(?,?,?)")->execute([$k['name'], (string) ($person['last'] ?? ''), $k['dead'] ? 'deceased' : 'unknown']);
                $kid = (int) $pdo->lastInsertId(); $made['persons'][] = $kid;
                $pdo->prepare('INSERT INTO family_children(family_id, child_id) VALUES(?,?)')->execute([$fid, $kid]);
                $tag = succ_p2_tag_id($pdo, 'BIRT'); $iso = succ_iso((string) $k['birth']);
                if ($tag && $k['birth'] !== '') { $pdo->prepare("INSERT INTO events(scope, person_id, event_type_id, date_text, year, sort_date, description) VALUES('person',?,?,?,?,?,?)")->execute([$kid, $tag, $k['birth'], $iso ? (int) substr($iso, 0, 4) : null, strlen($iso) === 10 ? $iso : null, $src]); $made['events'][] = (int) $pdo->lastInsertId(); }
                if (succ_dossiers_ready($pdo)) { succ_attach($pdo, $cid, $kid, 'verify', 'hand'); }
                $n++;
            }
        } elseif ($r['key'] === 'address') {
            $s = $pdo->prepare('SELECT * FROM living_contacts WHERE person_id=? ORDER BY updated_at DESC, id DESC LIMIT 1'); $s->execute([$pid]); $old = $s->fetch(PDO::FETCH_ASSOC);
            if ($old) { $made['contact_prev'][] = $old; $pdo->prepare('UPDATE living_contacts SET address=CASE WHEN ?<>\'\' THEN ? ELSE address END, postal_code=CASE WHEN ?<>\'\' THEN ? ELSE postal_code END, city=CASE WHEN ?<>\'\' THEN ? ELSE city END, phone_mobile=CASE WHEN ?<>\'\' THEN ? ELSE phone_mobile END, email=CASE WHEN ?<>\'\' THEN ? ELSE email END, notes=CASE WHEN notes=\'\' THEN ? ELSE notes || char(10) || ? END, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$r['address'], $r['address'], $r['postal_code'], $r['postal_code'], $r['city'], $r['city'], $r['phone'], $r['phone'], $r['email'], $r['email'], $src, $src, (int) $old['id']]); }
            else { $pdo->prepare('INSERT INTO living_contacts(person_id, first_name, last_name, address, postal_code, city, phone_mobile, email, notes) VALUES(?,?,?,?,?,?,?,?,?)')->execute([$pid, (string) ($person['first'] ?? ''), (string) ($person['last'] ?? ''), $r['address'], $r['postal_code'], $r['city'], $r['phone'], $r['email'], $src]); $made['contacts'][] = (int) $pdo->lastInsertId(); }
            $n++;
        } elseif ($r['key'] === 'family') {
            $old = (string) $pdo->query('SELECT hypothesis_note FROM succ_cases WHERE id=' . $cid)->fetchColumn(); $made['note_prev'] = $old;
            $pdo->prepare('UPDATE succ_cases SET hypothesis_note=? WHERE id=?')->execute([mb_substr(trim($old . "\n" . 'Famille connue (' . $chk['name'] . ') : ' . $r['answer']), 0, 4000), $cid]); $n++;
        } elseif ($r['key'] === 'documents') {
            $pdo->prepare("INSERT INTO succ_deadlines(case_id, due, label, kind) VALUES(?,?,?, 'relance')")->execute([$cid, date('Y-m-d', strtotime('+21 days')), '📑 Documents promis par ' . $chk['name'] . ' : ' . $r['answer']]);
            $made['deadlines'][] = (int) $pdo->lastInsertId(); $n++;
        }
    }
    foreach ($made['persons'] as $x) { if (function_exists('rebuild_search')) { try { rebuild_search($pdo, $x); } catch (Throwable $_) {} } }
    // ce qui a été écrit reste côté serveur : « ↶ Annuler » ne défait que cela (jamais une liste venue du navigateur)
    $undoToken = $chk['token'];
    if ($undoToken !== '') { $pdo->prepare('UPDATE succ_questionnaires SET answered_at=CURRENT_TIMESTAMP, applied_json=? WHERE token=?')->execute([json_encode($made), $undoToken]); }
    else { $undoToken = 'papier-' . bin2hex(random_bytes(12)); $pdo->prepare("INSERT INTO succ_questionnaires(case_id, person_id, token, fields_json, answered_at, applied_json) VALUES(?,?,?,?, CURRENT_TIMESTAMP, ?)")->execute([$cid, $pid, $undoToken, json_encode(['paper' => true]), json_encode($made)]); }
    succ_journal($pdo, $cid, 'edit', '📋 Réponses de ' . $chk['name'] . ' : ' . $n . ' changement(s) écrit(s)' . ($chk['paper'] ? ' (questionnaire papier)' : ''));
    if (function_exists('log_change')) { log_change($pdo, 'person', $pid, 'update', 'Réponses au questionnaire d’héritier écrites'); }
    return ['changes' => $n, 'made' => $made, 'persons' => count($made['persons']), 'undo_token' => $undoToken];
}
function succ_p2_q_undo_apply(PDO $pdo, array $d): array
{
    $cid = safe_int($d['case_id'] ?? 0); succ_row($pdo, $cid);
    // ce qui a été écrit, relu côté serveur (succ_questionnaires.applied_json) : jamais la liste envoyée par le navigateur
    $s = $pdo->prepare("SELECT id, person_id, applied_json, fields_json FROM succ_questionnaires WHERE token=? AND case_id=? AND applied_json<>''"); $s->execute([(string) ($d['token'] ?? ''), $cid]); $q = $s->fetch(PDO::FETCH_ASSOC);
    $m = $q ? json_decode((string) $q['applied_json'], true) : null;
    if (!is_array($m)) { throw new LcndaBadInput('Rien à annuler.'); }
    $persons = array_values(array_filter(array_map('intval', (array) ($m['persons'] ?? []))));
    // une fiche verrouillée depuis (créée par les réponses, ou l'héritier lui-même) : rien n'est défait
    if (function_exists('person_is_locked')) { foreach (array_merge($persons, [(int) $q['person_id']]) as $x) { if (person_is_locked($pdo, $x)) { throw new LcndaBadInput('Fiche verrouillée : les réponses ne sont pas retirées. Déverrouille-la d’abord.'); } } }
    foreach (array_map('intval', (array) ($m['events'] ?? [])) as $id) { $pdo->prepare('DELETE FROM events WHERE id=?')->execute([$id]); }
    foreach ((array) ($m['event_prev'] ?? []) as $id => $p) { if (is_array($p)) { $pdo->prepare('UPDATE events SET date_text=?, year=?, sort_date=?, place_id=?, description=? WHERE id=?')->execute([(string) ($p['date_text'] ?? ''), $p['year'] ?? null, $p['sort_date'] ?? null, $p['place_id'] ?? null, (string) ($p['description'] ?? ''), (int) $id]); } }
    foreach (array_map('intval', (array) ($m['families'] ?? [])) as $id) { $pdo->prepare('DELETE FROM family_children WHERE family_id=?')->execute([$id]); $pdo->prepare('DELETE FROM families WHERE id=?')->execute([$id]); }
    foreach ($persons as $id) {
        $pdo->prepare('DELETE FROM succ_case_persons WHERE person_id=? AND case_id=?')->execute([$id, $cid]);
        // la suppression ordinaire d'une fiche : corbeille (Historique → Restaurer), journal des changements, liens défaits
        if (function_exists('delete_person')) { try { delete_person($pdo, ['id' => $id]); } catch (RuntimeException $e) { if (!str_contains($e->getMessage(), 'introuvable')) { throw $e; } } }
        else { $pdo->prepare('DELETE FROM events WHERE person_id=?')->execute([$id]); $pdo->prepare('DELETE FROM persons WHERE id=?')->execute([$id]); }
    }
    foreach (array_map('intval', (array) ($m['contacts'] ?? [])) as $id) { $pdo->prepare('DELETE FROM living_contacts WHERE id=? AND person_id=?')->execute([$id, (int) $q['person_id']]); }
    foreach ((array) ($m['contact_prev'] ?? []) as $p) { if (is_array($p)) { $pdo->prepare('UPDATE living_contacts SET address=?, postal_code=?, city=?, phone_mobile=?, email=?, notes=? WHERE id=?')->execute([(string) $p['address'], (string) $p['postal_code'], (string) $p['city'], (string) ($p['phone_mobile'] ?? ''), (string) $p['email'], (string) $p['notes'], (int) $p['id']]); } }
    foreach (array_map('intval', (array) ($m['deadlines'] ?? [])) as $id) { $pdo->prepare('UPDATE succ_deadlines SET deleted_at=CURRENT_TIMESTAMP WHERE id=? AND case_id=?')->execute([$id, $cid]); }
    if (array_key_exists('note_prev', $m)) { $pdo->prepare('UPDATE succ_cases SET hypothesis_note=? WHERE id=?')->execute([succ_txt($m['note_prev'], 4000, true), $cid]); }
    $paper = !empty((json_decode((string) $q['fields_json'], true) ?: [])['paper']);
    if ($paper) { $pdo->prepare('DELETE FROM succ_questionnaires WHERE id=?')->execute([(int) $q['id']]); }
    else { $pdo->prepare("UPDATE succ_questionnaires SET answered_at=NULL, applied_json='' WHERE id=?")->execute([(int) $q['id']]); }
    if (function_exists('log_change')) { log_change($pdo, 'person', (int) $q['person_id'], 'update', 'Réponses au questionnaire d’héritier retirées'); }
    succ_journal($pdo, $cid, 'edit', '↶ Réponses au questionnaire annulées');
    return ['ok' => true];
}

/* ═════════ 7. 🤝 Copie pour le notaire : la liste des copies faites (pas les fichiers), le registre ═════════ */
/** 🔐 la généalogie ouverte est protégée par un mot de passe (Verrou) : archive et copie pour le notaire seulement chiffrées */
function succ_p2_protected(): bool { try { return function_exists('glock_info') && !empty(glock_info()['locked']); } catch (Throwable $_) { return false; } }
function succ_p2_notary_copy(PDO $pdo, array $d): array
{
    $c = succ_row($pdo, safe_int($d['case_id'] ?? 0)); $cid = (int) $c['id'];
    if (empty($d['encrypted']) && succ_p2_protected()) { throw new LcndaBadInput('Cette généalogie est protégée par un mot de passe : la copie pour le notaire doit être chiffrée (coche « Mot de passe »).'); }
    $o = succ_p2_options($pdo, $cid); $list = is_array($o['notary_copies'] ?? null) ? $o['notary_copies'] : [];
    $v = count($list) + 1;
    $row = ['v' => $v, 'at' => date('Y-m-d H:i'), 'addresses' => !empty($d['addresses']), 'encrypted' => !empty($d['encrypted']), 'pieces' => max(0, safe_int($d['pieces'] ?? 0)), 'research' => !empty($d['research'])];
    $list[] = $row; $o['notary_copies'] = $list; succ_p2_options_save($pdo, $cid, $o);
    succ_journal($pdo, $cid, 'export', '🤝 Copie pour le notaire v' . $v . ($row['encrypted'] ? ', chiffrée' : ', sans mot de passe') . ($row['addresses'] ? ', avec les adresses' : ', sans adresse'));
    return $row;
}

/** les images des actes du dossier (pour la copie du notaire) : le média de preuve de l'acte, ou ses médias reliés */
function succ_p2_piece_media(PDO $pdo, int $caseId): array
{
    $c = succ_row($pdo, $caseId);
    $did = (int) $c['deceased_id']; if (!$did) { return []; }
    $graph = succ_graph($pdo, $did); [$acts] = succ_acts($pdo, $graph, $caseId);
    // 🙈 les fiches confidentielles laissées hors du calcul (réglage « private_heirs » décoché) : leurs actes ne partent pas non plus
    // (même règle que withoutPrivate du moteur : toute fiche « privée » sauf le défunt ; un mariage dont l'un des deux l'est)
    $priv = [];
    if (function_exists('succ_settings') && empty(succ_settings()['private_heirs'])) { foreach ($graph['persons'] as $id => $p) { if (!empty($p['private']) && (int) $id !== $did) { $priv[(int) $id] = true; } } }
    $unions = []; foreach ($graph['unions'] ?? [] as $u) { $unions[(string) ($u['id'] ?? '')] = [(int) ($u['a'] ?? 0), (int) ($u['b'] ?? 0)]; }
    $out = [];
    foreach ($acts as $key => $a) {
        if (empty($a['media']) || empty($a['event_id'])) { continue; }
        if ($priv) {
            [$pre, $ref] = explode(':', (string) $key, 2) + [1 => ''];
            if (($pre === 'N' || $pre === 'D') && isset($priv[(int) $ref])) { continue; }
            if (($pre === 'M' || $pre === 'V') && (isset($priv[$unions[$ref][0] ?? 0]) || isset($priv[$unions[$ref][1] ?? 0]))) { continue; }
        }
        $s = $pdo->prepare("SELECT m.id, m.filename, m.media_type, m.title FROM media m WHERE m.id=(SELECT confidence_media_id FROM events WHERE id=?) UNION SELECT m.id, m.filename, m.media_type, m.title FROM media m JOIN media_links ml ON ml.media_id=m.id WHERE ml.entity_type='event' AND ml.entity_id=? LIMIT 4");
        try { $s->execute([(int) $a['event_id'], (int) $a['event_id']]); } catch (Throwable $_) { continue; }
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $m) { if (preg_match('/\.(jpe?g|png|webp|gif)$/i', (string) $m['filename']) && (string) $m['filename'] !== '' && !str_contains((string) $m['filename'], '..')) { $out[] = ['key' => (string) $key, 'id' => (int) $m['id'], 'filename' => (string) $m['filename'], 'title' => (string) $m['title'], 'size' => (int) @filesize(MEDIA_DIR . '/' . $m['filename'])]; } }
    }
    return $out;
}

/* ═════════ 13. 👥 Fusion de deux dossiers ═════════ */
function succ_p2_merge_preview(PDO $pdo, int $a, int $b): array
{
    $A = succ_row($pdo, $a); $B = succ_row($pdo, $b);
    $cnt = static function (string $sql, int $id) use ($pdo): int { try { $s = $pdo->prepare($sql); $s->execute([$id]); return (int) $s->fetchColumn(); } catch (Throwable $_) { return 0; } };
    $pa = array_map('intval', $pdo->query('SELECT person_id FROM succ_case_persons WHERE deleted_at IS NULL AND case_id=' . $a)->fetchAll(PDO::FETCH_COLUMN));
    $pb = array_map('intval', $pdo->query('SELECT person_id FROM succ_case_persons WHERE deleted_at IS NULL AND case_id=' . $b)->fetchAll(PDO::FETCH_COLUMN));
    $ka = $pdo->query('SELECT piece_key FROM succ_pieces WHERE case_id=' . $a)->fetchAll(PDO::FETCH_COLUMN); $kb = $pdo->query('SELECT piece_key FROM succ_pieces WHERE case_id=' . $b)->fetchAll(PDO::FETCH_COLUMN);
    return ['into' => ['id' => $a, 'number' => (string) $A['number'], 'title' => (string) $A['title'], 'state' => (string) $A['state'], 'notary' => (int) $A['notary_person_id'] ? succ_person_name($pdo, (int) $A['notary_person_id']) : (string) $A['notary_text']],
        'from' => ['id' => $b, 'number' => (string) $B['number'], 'title' => (string) $B['title'], 'state' => (string) $B['state'], 'notary' => (int) $B['notary_person_id'] ? succ_person_name($pdo, (int) $B['notary_person_id']) : (string) $B['notary_text']],
        'persons' => ['into' => count($pa), 'common' => count(array_intersect($pa, $pb)), 'added' => count(array_diff($pb, $pa))],
        'pieces' => ['into' => count($ka), 'added' => count(array_diff($kb, $ka)), 'double' => count(array_intersect($kb, $ka))],
        'rows' => ['courriers' => $cnt('SELECT count(*) FROM courriers WHERE succ_case_id=?', $b), 'calls' => $cnt('SELECT count(*) FROM succ_calls WHERE deleted_at IS NULL AND case_id=?', $b), 'funds' => $cnt('SELECT count(*) FROM succ_funds WHERE deleted_at IS NULL AND case_id=?', $b),
            'fees' => $cnt('SELECT count(*) FROM succ_fees WHERE deleted_at IS NULL AND case_id=?', $b), 'deadlines' => $cnt('SELECT count(*) FROM succ_deadlines WHERE deleted_at IS NULL AND case_id=?', $b)],
        'two_notaries' => ((int) $A['notary_person_id'] || $A['notary_text'] !== '') && ((int) $B['notary_person_id'] || $B['notary_text'] !== '') && ((int) $A['notary_person_id'] !== (int) $B['notary_person_id'] || $A['notary_text'] !== $B['notary_text'])];
}
function succ_p2_merge(PDO $pdo, array $d): array
{
    $a = safe_int($d['into'] ?? 0); $b = safe_int($d['from'] ?? 0);
    if ($a === $b) { throw new LcndaBadInput('Choisis un autre dossier.'); }
    $A = succ_row($pdo, $a); $B = succ_row($pdo, $b);
    foreach ([$A, $B] as $x) { if (in_array((string) $x['state'], ['clos', 'archive'], true)) { throw new LcndaBadInput('Dossier clos ou archivé : rouvre-le d’abord.'); } }
    $mode = in_array($d['mode'] ?? '', ['two', 'linked'], true) ? (string) $d['mode'] : succ_p2_set()['merge_mode'];
    $rec = ['from' => $b, 'mode' => $mode, 'at' => date('Y-m-d H:i:s'), 'moved' => [], 'persons' => [], 'pieces' => [], 'journal_id' => 0];
    // les personnes : celles de B rattachées à A (les communes ne bougent pas)
    foreach ($pdo->query('SELECT person_id, role FROM succ_case_persons WHERE deleted_at IS NULL AND case_id=' . $b)->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $s = $pdo->prepare('SELECT 1 FROM succ_case_persons WHERE case_id=? AND person_id=? AND deleted_at IS NULL'); $s->execute([$a, (int) $r['person_id']]);
        if ($s->fetchColumn()) { continue; }
        succ_attach($pdo, $a, (int) $r['person_id'], $r['role'] === 'deceased' ? ($mode === 'two' ? 'deceased' : 'verify') : (string) $r['role'], 'hand');
        $rec['persons'][] = (int) $r['person_id'];
    }
    if ($mode === 'linked') {
        foreach ($pdo->query('SELECT person_id, role FROM succ_case_persons WHERE deleted_at IS NULL AND case_id=' . $a)->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $s = $pdo->prepare('SELECT 1 FROM succ_case_persons WHERE case_id=? AND person_id=? AND deleted_at IS NULL'); $s->execute([$b, (int) $r['person_id']]);
            if (!$s->fetchColumn()) { succ_attach($pdo, $b, (int) $r['person_id'], $r['role'] === 'deceased' ? 'verify' : (string) $r['role'], 'hand'); $rec['persons_b'][] = (int) $r['person_id']; }
        }
        $oa = succ_p2_options($pdo, $a); $ob = succ_p2_options($pdo, $b);
        $oa['linked'] = array_values(array_unique(array_merge((array) ($oa['linked'] ?? []), [$b]))); $ob['linked'] = array_values(array_unique(array_merge((array) ($ob['linked'] ?? []), [$a])));
        $oa['merges'][] = $rec; succ_p2_options_save($pdo, $a, $oa); succ_p2_options_save($pdo, $b, $ob);
        succ_journal($pdo, $a, 'edit', '👥 Recherches mises en commun avec le dossier ' . $B['number'] . ' (dossiers liés)');
        succ_journal($pdo, $b, 'edit', '👥 Recherches mises en commun avec le dossier ' . $A['number'] . ' (dossiers liés)');
        succ_p2_access($pdo, 'export', $a, 'succ_merge|linked');
        return ['into' => $a, 'mode' => $mode];
    }
    // les lignes rattachées : chacune garde son dossier d'origine
    foreach (['succ_deadlines' => 'case_id', 'succ_fees' => 'case_id', 'succ_calls' => 'case_id', 'succ_funds' => 'case_id', 'courriers' => 'succ_case_id'] as $t => $col) {
        if (!succ_p2_has($pdo, $t)) { continue; }
        $ids = array_map('intval', $pdo->query("SELECT id FROM $t WHERE $col=$b")->fetchAll(PDO::FETCH_COLUMN));
        if ($ids) { $pdo->exec("UPDATE $t SET $col=$a, origin_case_id=$b WHERE id IN (" . implode(',', $ids) . ')'); $rec['moved'][$t] = $ids; }
    }
    // les pièces : celles qui manquent à A ; une pièce en double (même acte) gardée une fois
    foreach ($pdo->query("SELECT piece_key FROM succ_pieces WHERE case_id=$b")->fetchAll(PDO::FETCH_COLUMN) as $k) {
        $s = $pdo->prepare('SELECT 1 FROM succ_pieces WHERE case_id=? AND piece_key=?'); $s->execute([$a, $k]);
        if ($s->fetchColumn()) { continue; }
        $pdo->prepare('UPDATE succ_pieces SET case_id=? WHERE case_id=? AND piece_key=?')->execute([$a, $b, $k]); $rec['pieces'][] = (string) $k;
    }
    // le deuxième défunt : deux calculs côte à côte (jamais mélangés)
    $oa = succ_p2_options($pdo, $a);
    $oa['second'] = ['case_id' => $b, 'deceased_id' => (int) $B['deceased_id'], 'death_iso' => (string) $B['death_iso'], 'death_date_text' => (string) $B['death_date_text'], 'number' => (string) $B['number'], 'overrides' => json_decode((string) $B['overrides_json'], true) ?: new stdClass()];
    if (!empty($d['keep_notary']) && $d['keep_notary'] === 'from') { $rec['notary_prev'] = ['notary_person_id' => $A['notary_person_id'], 'notary_text' => $A['notary_text']]; $pdo->prepare('UPDATE succ_cases SET notary_person_id=?, notary_text=? WHERE id=?')->execute([$B['notary_person_id'], $B['notary_text'], $a]); }
    $other = !empty($d['keep_notary']) && $d['keep_notary'] === 'from' ? $A : $B; $otherName = (int) $other['notary_person_id'] ? succ_person_name($pdo, (int) $other['notary_person_id']) : (string) $other['notary_text'];
    succ_journal($pdo, $a, 'edit', '👥 Fusion : le dossier ' . $B['number'] . ' (' . $B['title'] . ') est réuni à celui-ci' . ($otherName !== '' && $otherName !== ((int) $A['notary_person_id'] ? succ_person_name($pdo, (int) $A['notary_person_id']) : (string) $A['notary_text']) ? ' ; autre notaire, gardé en note : ' . $otherName : ''));
    $rec['journal_id'] = (int) $pdo->lastInsertId();
    $oa['merges'][] = $rec; succ_p2_options_save($pdo, $a, $oa);
    $pdo->prepare('UPDATE succ_cases SET merged_into=?, deleted_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$a, $b]);
    succ_journal($pdo, $b, 'edit', '👥 Fusionné dans le dossier ' . $A['number'] . ' (le numéro ' . $B['number'] . ' n’est pas réutilisé)');
    succ_p2_access($pdo, 'export', $a, 'succ_merge|two');
    return ['into' => $a, 'mode' => $mode];
}
function succ_p2_merge_undo(PDO $pdo, array $d): array
{
    $a = safe_int($d['into'] ?? 0); succ_row($pdo, $a);
    $oa = succ_p2_options($pdo, $a); $merges = (array) ($oa['merges'] ?? []);
    if (!$merges) { throw new LcndaBadInput('Rien à annuler.'); }
    $rec = array_pop($merges); $b = (int) $rec['from'];
    if ($rec['mode'] === 'two') {
        $limit = succ_p2_set()['merge_undo'];
        if ($limit === '30d' && strtotime((string) $rec['at']) < strtotime('-30 days')) { throw new LcndaBadInput('La fusion date de plus de 30 jours : elle ne peut plus être annulée.'); }
        if ($limit === 'untouched' && (int) $pdo->query("SELECT count(*) FROM succ_journal WHERE case_id=$a AND id>" . (int) $rec['journal_id'])->fetchColumn() > 0) { throw new LcndaBadInput('Quelque chose a été ajouté depuis la fusion : elle ne peut plus être annulée.'); }
        foreach ((array) ($rec['moved'] ?? []) as $t => $ids) {
            if (!isset(['succ_deadlines' => 1, 'succ_fees' => 1, 'succ_calls' => 1, 'succ_funds' => 1, 'courriers' => 1][$t]) || !$ids) { continue; }
            $col = $t === 'courriers' ? 'succ_case_id' : 'case_id';
            $pdo->exec("UPDATE $t SET $col=$b, origin_case_id=NULL WHERE id IN (" . implode(',', array_map('intval', $ids)) . ')');
        }
        foreach ((array) ($rec['pieces'] ?? []) as $k) { $pdo->prepare('UPDATE succ_pieces SET case_id=? WHERE case_id=? AND piece_key=?')->execute([$b, $a, (string) $k]); }
        if (is_array($rec['notary_prev'] ?? null)) { $pdo->prepare('UPDATE succ_cases SET notary_person_id=?, notary_text=? WHERE id=?')->execute([$rec['notary_prev']['notary_person_id'], (string) $rec['notary_prev']['notary_text'], $a]); }
        unset($oa['second']);
        $pdo->prepare('UPDATE succ_cases SET merged_into=NULL, deleted_at=NULL WHERE id=?')->execute([$b]);
    } else {
        foreach ((array) ($rec['persons_b'] ?? []) as $p) { $pdo->prepare('DELETE FROM succ_case_persons WHERE case_id=? AND person_id=?')->execute([$b, (int) $p]); }
        $ob = succ_p2_options($pdo, $b); $ob['linked'] = array_values(array_diff((array) ($ob['linked'] ?? []), [$a])); succ_p2_options_save($pdo, $b, $ob);
        $oa['linked'] = array_values(array_diff((array) ($oa['linked'] ?? []), [$b]));
    }
    foreach ((array) ($rec['persons'] ?? []) as $p) { $pdo->prepare('DELETE FROM succ_case_persons WHERE case_id=? AND person_id=?')->execute([$a, (int) $p]); }
    $oa['merges'] = $merges; succ_p2_options_save($pdo, $a, $oa);
    succ_journal($pdo, $a, 'edit', '↶ Fusion annulée : les deux dossiers sont séparés comme avant');
    if ($rec['mode'] === 'two') { succ_journal($pdo, $b, 'edit', '↶ Fusion annulée : dossier séparé à nouveau'); }
    return ['ok' => true, 'from' => $b];
}

/* ═════════ 🔗 Dossier lié pour un héritier mort après le défunt ═════════ */
function succ_p2_link_case(PDO $pdo, array $d): array
{
    $c = succ_p2_case_open($pdo, safe_int($d['case_id'] ?? 0)); $cid = (int) $c['id'];
    $pid = safe_int($d['person_id'] ?? 0); if (!succ_person_ok($pdo, $pid)) { throw new LcndaBadInput('Fiche introuvable.'); }
    $s = $pdo->prepare('SELECT id FROM succ_cases WHERE deceased_id=? AND deleted_at IS NULL'); $s->execute([$pid]);
    $new = (int) $s->fetchColumn(); $created = false;
    if (!$new) { $r = succ_save($pdo, ['deceased_id' => $pid, 'notary_text' => '']); $new = (int) $r['id']; $created = true; }
    $attached = [];
    if ($created && ($d['attach'] ?? succ_p2_set()['linked_attach']) === 'descendants') {
        $g = succ_graph($pdo, $pid); $kids = [$pid => true]; $todo = [$pid];
        while ($todo) { $x = array_pop($todo); foreach ($g['parents'] ?? [] as $l) { if ((int) ($l['parent'] ?? 0) === $x && !isset($kids[(int) $l['child']])) { $kids[(int) $l['child']] = true; $todo[] = (int) $l['child']; } } }
        unset($kids[$pid]);
        foreach (array_keys($kids) as $k) { succ_attach($pdo, $new, $k, 'heir', 'hand'); $attached[] = $k; }
    }
    $o = succ_p2_options($pdo, $cid); $o['linked'] = array_values(array_unique(array_merge((array) ($o['linked'] ?? []), [$new]))); succ_p2_options_save($pdo, $cid, $o);
    $on = succ_p2_options($pdo, $new); $on['linked'] = array_values(array_unique(array_merge((array) ($on['linked'] ?? []), [$cid]))); $on['linked_from'] = $cid; succ_p2_options_save($pdo, $new, $on);
    $nn = (string) succ_row($pdo, $new)['number'];
    succ_journal($pdo, $cid, 'edit', '🔗 Dossier lié ' . $nn . ' : succession de ' . succ_person_name($pdo, $pid) . ' (mort après le défunt)');
    succ_journal($pdo, $new, 'edit', '🔗 Lié au dossier ' . $c['number'] . ' (sa part y vient de cette succession)' . ($attached ? ' ; ' . count($attached) . ' descendant(s) rattaché(s)' : ''));
    return ['id' => $new, 'created' => $created, 'attached' => count($attached), 'number' => $nn];
}
function succ_p2_link_undo(PDO $pdo, array $d): array
{
    $cid = safe_int($d['case_id'] ?? 0); $new = safe_int($d['id'] ?? 0); succ_row($pdo, $cid);
    $o = succ_p2_options($pdo, $cid); $o['linked'] = array_values(array_diff((array) ($o['linked'] ?? []), [$new])); succ_p2_options_save($pdo, $cid, $o);
    if (!empty($d['created'])) { $pdo->prepare('UPDATE succ_cases SET deleted_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$new]); }
    return ['ok' => true];
}

/* ═════════ 15. 📦 Archive de fin de dossier : mot de passe (réglage), nouvelles tables dans le paquet ═════════ */
function succ_p2_bundle(PDO $pdo, int $caseId): array
{
    $q = static function (string $sql) use ($pdo, $caseId): array { try { $s = $pdo->prepare($sql); $s->execute([$caseId]); return $s->fetchAll(PDO::FETCH_ASSOC); } catch (Throwable $_) { return []; } };
    $inv = [];
    try { $inv = array_values(array_filter(succ_inv_list(succ_inv_pdo($pdo), ['case_number' => (string) succ_row($pdo, $caseId, true)['number']]), static fn($x) => $x['number'] !== '' && $x['genealogy'] === (string) GENEALOGY_ID)); /* les pièces de CE dossier : même n° de dossier ET même généalogie */ } catch (Throwable $_) {}
    return ['p2_calls' => $q('SELECT * FROM succ_calls WHERE case_id=?'), 'p2_funds' => $q('SELECT * FROM succ_funds WHERE case_id=?'), 'p2_insee' => $q('SELECT * FROM succ_insee_checks WHERE case_id=?'),
        'p2_questionnaires' => $q('SELECT * FROM succ_questionnaires WHERE case_id=?'), 'p2_invoices_copy' => $inv];
}
function succ_p2_bundle_import(PDO $to, array $b, int $caseId, array $pmap, array $cmap): void
{
    if (!$caseId) { return; }
    succ_p2_ensure($to);
    $pm = static fn($x) => $x ? ($pmap[(int) $x] ?? null) : null;
    foreach ((array) ($b['p2_calls'] ?? []) as $r) { if (is_array($r)) { succ_insert($to, 'succ_calls', $r, ['case_id' => $caseId, 'person_id' => $pm($r['person_id'] ?? null), 'deadline_id' => null, 'fee_id' => null]); } }
    foreach ((array) ($b['p2_funds'] ?? []) as $r) { if (is_array($r) && $pm($r['person_id'] ?? null)) { succ_insert($to, 'succ_funds', $r, ['case_id' => $caseId, 'person_id' => $pm($r['person_id']), 'media_id' => null]); } }
    foreach ((array) ($b['p2_insee'] ?? []) as $r) { if (is_array($r) && $pm($r['person_id'] ?? null)) { succ_insert($to, 'succ_insee_checks', $r, ['case_id' => $caseId, 'person_id' => $pm($r['person_id']), 'event_id' => null]); } }
    foreach ((array) ($b['p2_questionnaires'] ?? []) as $r) { if (is_array($r) && $pm($r['person_id'] ?? null)) { try { succ_insert($to, 'succ_questionnaires', $r, ['case_id' => $caseId, 'person_id' => $pm($r['person_id'])]); } catch (Throwable $_) {} } }
}
/** l'archive chiffrée : la même enveloppe que les sauvegardes protégées ; « Oublié = archive perdue » */
function succ_p2_archive_file(PDO $pdo, array $d): array
{
    $mode = succ_p2_set()['archive_password'];
    $pw = is_string($d['password'] ?? null) ? (string) $d['password'] : '';
    if ($mode === 'required' && $pw === '') { throw new LcndaBadInput('Le mot de passe est obligatoire (réglage).'); }
    if ($mode === 'none') { $pw = ''; }
    // 🔐 une généalogie protégée par un mot de passe : l'archive ne sort jamais en clair (quel que soit le réglage)
    if ($pw === '' && succ_p2_protected()) { throw new LcndaBadInput('Cette généalogie est protégée par un mot de passe : l’archive doit être chiffrée. Choisis un mot de passe pour l’archive.'); }
    if ($pw !== '' && mb_strlen($pw) < 8) { throw new LcndaBadInput('Mot de passe trop court (8 caractères au moins).'); }
    $id = safe_int($d['id'] ?? 0);
    $number = ''; try { $number = (string) succ_row($pdo, $id, true)['number']; } catch (Throwable $_) {}
    if (succ_p2_ready($pdo)) {
        $s = $pdo->prepare("SELECT person_id, SUM(CASE WHEN sens='recu' THEN amount_cents ELSE -amount_cents END) AS r FROM succ_funds WHERE case_id=? AND deleted_at IS NULL GROUP BY person_id HAVING r<>0"); $s->execute([$id]);
        $rest = array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN, 1));
        $due = (bool) array_filter($rest, static fn($r) => $r > 0); $over = (bool) array_filter($rest, static fn($r) => $r < 0); // reste à reverser / trop versé
        if (($due || $over) && empty($d['funds_ok'])) {
            throw new LcndaBadInput($due && $over ? '💶 Un reversement reste en attente, et un héritier a été trop payé (plus reversé que reçu) : archiver quand même ?'
                : ($due ? '💶 Un reversement reste en attente : archiver quand même ?' : '💶 Trop versé : un héritier a reçu plus que ce que le notaire a versé pour lui (reste négatif) : archiver quand même ?'));
        }
    }
    $r = succ_archive_file($pdo, $d);
    if ($pw !== '') {
        if (!function_exists('vault_encrypt_file')) { require_once __DIR__ . '/heritage_more.php'; }
        $path = succ_archive_dir() . '/' . $r['token']; $tmp = $path . '.chiffre';
        vault_encrypt_file($path, $tmp, $pw, ['kind' => 'lcnda-succ', 'number' => $number]); // l'en-tête (lisible sans le mot de passe) : le numéro du dossier seulement, jamais le nom du défunt
        @unlink($path); rename($tmp, $path);
        $r['encrypted'] = true;
    }
    succ_p2_access($pdo, 'export', $id, 'succ_archive|' . ($pw !== '' ? 'enc' : 'plain'));
    return $r;
}
function succ_p2_archive_encrypted(string $path): bool
{
    $fh = @fopen($path, 'rb'); if (!$fh) { return false; }
    $head = (string) fread($fh, 16); fclose($fh);
    if (!function_exists('vault_decrypt_file')) { require_once __DIR__ . '/heritage_more.php'; }
    return defined('VAULT_MAGIC2') && (str_starts_with($head, VAULT_MAGIC2) || str_starts_with($head, VAULT_MAGIC));
}
/** lire une archive chiffrée : déchiffrée dans un fichier temporaire (le mot de passe vient de la demande) */
function succ_p2_archive_open(string $path): string
{
    if (!succ_p2_archive_encrypted($path)) { return $path; }
    $pw = (string) ($GLOBALS['succ_p2_archive_pw'] ?? '');
    if ($pw === '') { throw new LcndaBadInput('🔐 Archive protégée : tape son mot de passe.'); }
    $tmp = succ_archive_dir() . '/.tmp-' . bin2hex(random_bytes(6)) . '.zip';
    try { vault_decrypt_file($path, $tmp, $pw); } catch (Throwable $e) { @unlink($tmp); throw new LcndaBadInput('Mot de passe incorrect, ou fichier abîmé.'); }
    register_shutdown_function(static function () use ($tmp) { @unlink($tmp); });
    return $tmp;
}

/* ═════════ Ce que la page du dossier reçoit en plus (D.p2) ═════════ */
function succ_p2_case_extra(PDO $pdo, int $id, array $r, array $graph): array
{
    if (!succ_p2_ready($pdo)) { return []; }
    $o = json_decode((string) $r['options_json'], true) ?: [];
    $out = ['calls' => succ_p2_calls($pdo, $id), 'rec' => succ_p2_rec_rows($pdo, $id) ?: new stdClass(), 'insee_last' => succ_p2_insee_last($pdo, $id) ?: new stdClass(),
        'insee_dismissed' => succ_p2_insee_dismissed($pdo, $id), 'proofs' => succ_p2_proofs($pdo, array_keys($graph['persons'] ?? [])), 'one_piece_ok' => $o['one_piece_ok'] ?? new stdClass(),
        'notary_copies' => $o['notary_copies'] ?? [], 'linked' => [], 'merges' => array_map(static fn($m) => ['from' => $m['from'], 'mode' => $m['mode'], 'at' => $m['at']], (array) ($o['merges'] ?? [])),
        'funds' => succ_funds_rows($pdo, $id), 'imp' => [], 'issued' => new stdClass(), 'second' => null, 'merged_journal' => [], 'questionnaires' => []];
    foreach ((array) ($o['linked'] ?? []) as $lid) { try { $l = succ_row($pdo, (int) $lid); $out['linked'][] = ['id' => (int) $l['id'], 'number' => (string) $l['number'], 'title' => (string) $l['title']]; } catch (Throwable $_) {} }
    $s = $pdo->prepare('SELECT id, origin, reminders, reminders_seen, prev_due, media_id, important FROM succ_deadlines WHERE case_id=? AND deleted_at IS NULL AND important=1'); $s->execute([$id]);
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $x) { $out['imp'][(string) $x['id']] = ['origin' => (string) $x['origin'], 'reminders' => (string) $x['reminders'], 'seen' => (string) $x['reminders_seen'], 'prev_due' => (string) $x['prev_due'], 'media_id' => (int) $x['media_id'] ?: null]; }
    $out['imp'] = $out['imp'] ?: new stdClass();
    $s = $pdo->prepare("SELECT piece_key, issued_on, valid_months FROM succ_pieces WHERE case_id=? AND (issued_on<>'' OR valid_months IS NOT NULL)"); $s->execute([$id]);
    $iss = []; foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $x) { $iss[(string) $x['piece_key']] = ['on' => (string) $x['issued_on'], 'months' => $x['valid_months'] === null ? null : (int) $x['valid_months']]; } $out['issued'] = $iss ?: new stdClass();
    $s = $pdo->prepare('SELECT token, person_id, made_at, answered_at FROM succ_questionnaires WHERE case_id=? AND deleted_at IS NULL ORDER BY id DESC'); $s->execute([$id]);
    $out['questionnaires'] = array_map(static fn($x) => ['person_id' => (int) $x['person_id'], 'made_at' => (string) $x['made_at'], 'answered_at' => (string) ($x['answered_at'] ?? '')], $s->fetchAll(PDO::FETCH_ASSOC));
    if (is_array($o['second'] ?? null) && (int) ($o['second']['deceased_id'] ?? 0)) {
        $sd = (int) $o['second']['deceased_id'];
        $out['second'] = ['deceased_id' => $sd, 'name' => succ_person_name($pdo, $sd), 'death_iso' => (string) ($o['second']['death_iso'] ?? ''), 'death_date_text' => (string) ($o['second']['death_date_text'] ?? ''),
            'number' => (string) ($o['second']['number'] ?? ''), 'overrides' => $o['second']['overrides'] ?? new stdClass(), 'graph' => succ_graph($pdo, $sd)];
    }
    foreach ((array) ($o['merges'] ?? []) as $m) {
        if (($m['mode'] ?? '') !== 'two') { continue; }
        try { $n = (string) succ_row($pdo, (int) $m['from'], true)['number']; $j = $pdo->prepare('SELECT id, at, kind, text FROM succ_journal WHERE case_id=? ORDER BY at DESC, id DESC'); $j->execute([(int) $m['from']]);
            foreach ($j->fetchAll(PDO::FETCH_ASSOC) as $x) { $out['merged_journal'][] = ['id' => -(int) $x['id'], 'at' => (string) $x['at'], 'kind' => (string) $x['kind'], 'text' => (string) $x['text'], 'from' => $n]; } } catch (Throwable $_) {}
    }
    return $out;
}

/* ═════════ API ═════════ */
function succ_p2_get(PDO $pdo, string $op, array $g): ?array
{
    if (!str_starts_with($op, 'p2_')) { return null; }
    succ_p2_ensure($pdo);
    return match ($op) {
        'p2_settings' => ['p2' => succ_p2_set(), 'cabinet' => succ_p2_cabinet(), 'defaults' => succ_p2_defaults(), 'protected' => succ_p2_protected()],
        'p2_insee_stats' => succ_p2_insee_stats($pdo),
        'p2_research' => succ_p2_research($pdo, safe_int($g['case_id'] ?? 0), safe_int($g['person_id'] ?? 0)),
        'p2_map' => succ_p2_map($pdo, $g),
        'p2_tpl_versions' => ['items' => succ_p2_tpl_versions($pdo, safe_int($g['id'] ?? 0))],
        'p2_delays' => ['items' => succ_p2_delays($pdo)],
        'p2_rec_list' => ['items' => succ_p2_rec_rows($pdo) ?: new stdClass()],
        'p2_piece_media' => ['items' => succ_p2_piece_media($pdo, safe_int($g['case_id'] ?? 0))],
        'p2_merge_preview' => succ_p2_merge_preview($pdo, safe_int($g['into'] ?? 0), safe_int($g['from'] ?? 0)),
        'p2_cases' => ['items' => array_map(static fn($r) => ['id' => (int) $r['id'], 'number' => (string) $r['number'], 'title' => (string) $r['title'], 'state' => (string) $r['state']], $pdo->query("SELECT id, number, title, state FROM succ_cases WHERE deleted_at IS NULL ORDER BY number")->fetchAll(PDO::FETCH_ASSOC))],
        default => succ_fact_get($pdo, $op, $g),
    };
}
function succ_p2_post(PDO $pdo, string $op, array $d): ?array
{
    if ($op === 'due_mark' && str_starts_with((string) ($d['kind'] ?? ''), 'p2')) { return succ_p2_due_mark($pdo, $d); }
    if ($op === 'archive_file') { succ_p2_ensure($pdo); return succ_p2_archive_file($pdo, $d); }
    if (!str_starts_with($op, 'p2_')) { return null; }
    succ_p2_ensure($pdo);
    return match ($op) {
        'p2_insee_check' => succ_p2_insee_check($pdo, $d),
        'p2_insee_confirm' => succ_p2_insee_confirm($pdo, $d),
        'p2_insee_not_same' => succ_p2_insee_not_same($pdo, $d),
        'p2_insee_undo' => succ_p2_insee_undo($pdo, $d),
        'p2_call_save' => succ_p2_call_save($pdo, $d),
        'p2_call_delete' => succ_p2_call_delete($pdo, $d, false),
        'p2_call_restore' => succ_p2_call_delete($pdo, $d, true),
        'p2_call_undo_edit' => succ_p2_call_restore_prev($pdo, $d),
        'p2_rec_set' => succ_p2_rec_set($pdo, $d),
        'p2_imp_save' => succ_p2_imp_save($pdo, $d),
        'p2_imp_undo' => succ_p2_imp_undo($pdo, $d),
        'p2_proof_ok' => succ_p2_proof_ok($pdo, $d),
        'p2_piece_issued' => succ_p2_piece_issued($pdo, $d),
        'p2_group_letters' => succ_p2_group_letters($pdo, $d),
        'p2_group_undo' => succ_p2_group_undo($pdo, $d),
        'p2_research_add' => succ_p2_research_add($pdo, $d),
        'p2_contract_save' => succ_p2_contract_save($pdo, $d),
        'p2_contract_undo' => succ_p2_contract_undo($pdo, $d),
        'p2_docx_text' => succ_p2_docx_text($d),
        'p2_courrier_tpl' => succ_p2_courrier_tpl($pdo, $d),
        'p2_q_make' => succ_p2_q_make($pdo, $d),
        'p2_q_undo_make' => succ_p2_q_undo_make($pdo, $d),
        'p2_q_check' => succ_p2_q_check($pdo, $d),
        'p2_q_apply' => succ_p2_q_apply($pdo, $d),
        'p2_q_undo_apply' => succ_p2_q_undo_apply($pdo, $d),
        'p2_notary_copy' => succ_p2_notary_copy($pdo, $d),
        'p2_merge' => succ_p2_merge($pdo, $d),
        'p2_merge_undo' => succ_p2_merge_undo($pdo, $d),
        'p2_link_case' => succ_p2_link_case($pdo, $d),
        'p2_link_undo' => succ_p2_link_undo($pdo, $d),
        'p2_reimport_preview' => succ_reimport_preview($pdo, (string) ($d['token'] ?? ''), (string) ($d['to'] ?? succ_gid())),
        'p2_print' => (static function () use ($pdo, $d) { $cid = safe_int($d['case_id'] ?? 0); if ($cid) { succ_row($pdo, $cid); } return ['ok' => true]; })(), // 📜 noté par succ_p2_access_note
        default => succ_fact_post($pdo, $op, $d),
    };
}
/** 📜 Qui a vu quoi : chaque export, copie ou impression de ces outils (une sorte et un code connus ; jamais un montant ni un mot de passe) */
const SUCC_P2_PRINTS = ['decompte' => 'succ_decompte', 'research' => 'succ_research', 'map' => 'succ_map', 'invoice' => 'succ_invoice', 'contract' => 'succ_contract', 'questionnaire' => 'succ_questionnaire'];
function succ_p2_access_note(PDO $pdo, array $d, mixed $out): void
{
    $op = (string) ($d['op'] ?? ''); $cid = safe_int($d['case_id'] ?? 0);
    match (true) {
        $op === 'p2_q_make' => succ_p2_access($pdo, 'export', $cid, 'succ_questionnaire|' . (is_array($out) ? count($out['items'] ?? []) : 0)),
        $op === 'p2_q_apply' => succ_p2_access($pdo, 'export', $cid, 'succ_answers'),
        $op === 'p2_notary_copy' => succ_p2_access($pdo, 'export', $cid, 'succ_notary_copy|v' . (is_array($out) ? (int) ($out['v'] ?? 0) : 0) . '|' . (!empty($d['addresses']) ? 'addr' : 'noaddr') . '|' . (!empty($d['encrypted']) ? 'enc' : 'plain')),
        $op === 'p2_print' && isset(SUCC_P2_PRINTS[(string) ($d['what'] ?? '')]) => succ_p2_access($pdo, 'print', $cid, SUCC_P2_PRINTS[(string) $d['what']]),
        $op === 'p2_inv_emit' || $op === 'p2_inv_avoir' => succ_p2_access($pdo, 'export', 0, 'succ_invoice'),
        $op === 'p2_group_letters' => succ_p2_access($pdo, 'letters', $cid, 'file|' . (is_array($out) ? count($out['ids'] ?? []) : 0)),
        default => null,
    };
}
