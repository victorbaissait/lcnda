<?php
declare(strict_types=1);

/*
 * 🏛 La fiche d'identité d'un recueil (maquette docs/design/registres-etat-fonds.html, partie 5) :
 *  - où il est : le service d'archives (la liste qui existe, Réglages › Services d'archives), le fonds, la série, la cote (recueils.reference),
 *    le lien en ligne du recueil, le lien d'une vue (« …/vue/{n} ») et le décalage vue ↔ page, l'autre exemplaire (un autre recueil, ou un texte) ;
 *  - la citation prête à copier (« AD Cher, 3 E 1234, f° 11 r° (vue 23) ») ;
 *  - qui peut le voir : la communicabilité CALCULÉE d'après les années et les sortes d'actes (Code du patrimoine, L213-2 ; l'app propose, on
 *    corrige), ou choisie (libre, réservée jusqu'en…, sur autorisation) ; la réutilisation (licence) ; en mode consultation, un recueil non
 *    communicable n'est pas montré (réglage, conseillé : oui) ;
 *  - le support, l'état matériel, la langue, l'écriture, la provenance, qui l'a numérisé.
 * Et la vue par service d'archives : les recueils chez un service, leur avancement, et les lacunes (Lacunes d'archives) qui les concernent.
 * Colonnes ajoutées par la migration 108 (rejouable). Écran : assets/js/heritage-recueil-fiche.js. Essai : tests/test-recueil-fiche.js.
 */

const RECUEIL_COMM_MODES = ['libre', 'reserve', 'autorisation'];
const RECUEIL_REUSE = ['etalab', 'cc-by', 'cc-by-sa', 'cc-by-nc', 'public', 'reserve', 'demander', 'autre'];
const RECUEIL_SUPPORT = ['papier', 'parchemin', 'microfilm', 'numerique', 'autre'];
const RECUEIL_STATE = ['bon', 'abime', 'fragile', 'a_restaurer', 'restaure'];
const RECUEIL_HIDE_KEY = 'genealogie-recueils-caches-consultation'; // '0' : montrer aussi les recueils non communicables en mode consultation
/** les délais (années après l'acte le plus récent) ; décès et sépultures : tout de suite */
const RECUEIL_DELAY = ['naissance' => 75, 'bapteme' => 75, 'mariage' => 75, 'notarial' => 75, 'notoriete' => 75, 'recensement' => 75, 'militaire' => 50, 'deces' => 0, 'sepulture' => 0, 'lettre' => 0, 'autre' => 0];

function recueil_fiche_ensure(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    recueil_fiche_install($pdo);
    $done = true;
}

/** migration 108 : les colonnes (rejouable) */
function recueil_fiche_install(PDO $pdo): void
{
    if (!$pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='recueils'")->fetchColumn()) { return; }
    $have = array_column($pdo->query('PRAGMA table_info(recueils)')->fetchAll(PDO::FETCH_ASSOC), 'name');
    foreach (['archive_service_id' => 'INTEGER', 'fonds' => "TEXT NOT NULL DEFAULT ''", 'series' => "TEXT NOT NULL DEFAULT ''", 'url' => "TEXT NOT NULL DEFAULT ''",
        'view_url' => "TEXT NOT NULL DEFAULT ''", 'view_offset' => 'INTEGER NOT NULL DEFAULT 0', 'twin_id' => 'INTEGER', 'twin_text' => "TEXT NOT NULL DEFAULT ''",
        'comm_mode' => "TEXT NOT NULL DEFAULT ''", 'comm_until' => "TEXT NOT NULL DEFAULT ''", 'reuse' => "TEXT NOT NULL DEFAULT ''", 'support' => "TEXT NOT NULL DEFAULT ''",
        'material_state' => "TEXT NOT NULL DEFAULT ''", 'language' => "TEXT NOT NULL DEFAULT ''", 'script' => "TEXT NOT NULL DEFAULT ''", 'provenance' => "TEXT NOT NULL DEFAULT ''",
        'digitized_by' => "TEXT NOT NULL DEFAULT ''"] as $c => $def) {
        if (!in_array($c, $have, true)) { $pdo->exec("ALTER TABLE recueils ADD COLUMN $c $def"); }
    }
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_recueils_service ON recueils(archive_service_id)');
}

/** un lien web (http/https) ou rien ; le lien d'une vue doit contenir {n} */
function recueil_fiche_url(string $v, bool $view = false): string
{
    $v = trim($v);
    if ($v === '') { return ''; }
    if (!preg_match('#^https?://#i', $v)) { throw new RuntimeException('Le lien doit commencer par http:// ou https://.'); }
    if ($view && !str_contains($v, '{n}')) { throw new RuntimeException('Le lien d’une vue doit contenir {n} à la place du numéro de la vue.'); }
    if (!filter_var(str_replace('{n}', '1', $v), FILTER_VALIDATE_URL)) { throw new RuntimeException('Ce lien n’est pas une adresse valide.'); }
    return mb_substr($v, 0, 1000);
}

/** enregistre les champs de la fiche (appelé par save_recueil : seulement les champs donnés) */
function recueil_fiche_save_meta(PDO $pdo, int $rid, array $data): void
{
    recueil_fiche_ensure($pdo);
    $set = [];
    if (array_key_exists('archive_service_id', $data)) {
        $sid = safe_int($data['archive_service_id'] ?? 0);
        if ($sid && function_exists('archive_service_row') && !archive_service_row($pdo, $sid)) { throw new RuntimeException('Service d’archives introuvable.'); }
        $set['archive_service_id'] = $sid ?: null;
    }
    foreach (['fonds' => 300, 'series' => 200, 'twin_text' => 300, 'language' => 100, 'script' => 100, 'provenance' => 500, 'digitized_by' => 300] as $k => $max) {
        if (array_key_exists($k, $data)) { $set[$k] = mb_substr(safe_text((string) ($data[$k] ?? '')), 0, $max); }
    }
    if (array_key_exists('url', $data)) { $set['url'] = recueil_fiche_url((string) ($data['url'] ?? '')); }
    if (array_key_exists('view_url', $data)) { $set['view_url'] = recueil_fiche_url((string) ($data['view_url'] ?? ''), true); }
    if (array_key_exists('view_offset', $data)) { $set['view_offset'] = max(-10000, min(10000, (int) ($data['view_offset'] ?? 0))); }
    if (array_key_exists('twin_id', $data)) {
        $tw = safe_int($data['twin_id'] ?? 0);
        if ($tw === $rid) { throw new RuntimeException('Un recueil ne peut pas être son propre autre exemplaire.'); }
        if ($tw) { recueil_row($pdo, $tw); }
        $set['twin_id'] = $tw ?: null;
    }
    $pick = static fn($k, array $list) => in_array($data[$k] ?? '', $list, true) ? $data[$k] : '';
    if (array_key_exists('comm_mode', $data)) { $set['comm_mode'] = $pick('comm_mode', RECUEIL_COMM_MODES); }
    if (array_key_exists('comm_until', $data)) { $y = (string) ($data['comm_until'] ?? ''); $set['comm_until'] = preg_match('/^\d{4}$/', $y) ? $y : ''; }
    if (array_key_exists('reuse', $data)) { $set['reuse'] = $pick('reuse', RECUEIL_REUSE); }
    if (array_key_exists('support', $data)) { $set['support'] = $pick('support', RECUEIL_SUPPORT); }
    if (array_key_exists('material_state', $data)) { $set['material_state'] = $pick('material_state', RECUEIL_STATE); }
    if (!$set) { return; }
    $pdo->prepare('UPDATE recueils SET ' . implode(', ', array_map(static fn($k) => "$k=?", array_keys($set))) . ' WHERE id=?')->execute([...array_values($set), $rid]);
}

/** les années et les sortes d'actes d'un recueil : sa date, son sommaire, ses actes de l'Atelier */
function recueil_fiche_years_kinds(PDO $pdo, array $r): array
{
    $years = []; $kinds = [];
    if (preg_match_all('/\b(1[0-9]{3}|20[0-9]{2})\b/', (string) ($r['date_text'] ?? ''), $m)) { $years = array_map('intval', $m[1]); }
    $rid = (int) $r['id'];
    if (function_exists('recueil_toc_ensure')) {
        recueil_toc_ensure($pdo);
        $s = $pdo->prepare('SELECT act_kind, year_from, year_to FROM recueil_toc WHERE recueil_id=?'); $s->execute([$rid]);
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $t) { if ($t['act_kind']) { $kinds[] = $t['act_kind']; } foreach (['year_from', 'year_to'] as $k) { if ($t[$k]) { $years[] = (int) $t[$k]; } } }
    }
    if (function_exists('recueil_toc_page_acts')) { foreach (recueil_toc_page_acts($pdo, $rid) as $list) { foreach ($list as $a) { if ($a['kind']) { $kinds[] = $a['kind']; } if ($a['year']) { $years[] = $a['year']; } } } }
    return [array_values(array_unique($years)), array_values(array_unique($kinds))];
}

/**
 * Qui peut le voir : {state: free|reserved|authorization|unknown, until, mode, why, delay}.
 * Calculée : l'acte le plus récent + le délai le plus long de ses sortes (naissances, mariages, notaires : 75 ans ; décès : tout de suite ;
 * sorte inconnue : 75 ans par prudence). Choisie : libre, réservée jusqu'en…, sur autorisation.
 */
function recueil_communicability(PDO $pdo, array $r): array
{
    $mode = (string) ($r['comm_mode'] ?? ''); $now = (int) date('Y');
    if ($mode === 'libre') { return ['state' => 'free', 'mode' => 'libre', 'until' => '', 'why' => 'choisi', 'delay' => 0]; }
    if ($mode === 'autorisation') { return ['state' => 'authorization', 'mode' => 'autorisation', 'until' => '', 'why' => 'choisi', 'delay' => 0]; }
    if ($mode === 'reserve') { $u = (int) ($r['comm_until'] ?? 0); return ['state' => $u && $u <= $now ? 'free' : 'reserved', 'mode' => 'reserve', 'until' => $u ? (string) $u : '', 'why' => 'choisi', 'delay' => 0]; }
    [$years, $kinds] = recueil_fiche_years_kinds($pdo, $r);
    if (!$years) { return ['state' => 'unknown', 'mode' => '', 'until' => '', 'why' => 'sans_annee', 'delay' => 0]; }
    $last = max($years);
    $delay = $kinds ? max(array_map(static fn($k) => RECUEIL_DELAY[$k] ?? 75, $kinds)) : 75;
    $until = $last + $delay;
    return ['state' => $until <= $now ? 'free' : 'reserved', 'mode' => '', 'until' => $until > $now ? (string) $until : '', 'why' => $kinds ? 'sortes' : 'sans_sorte', 'delay' => $delay, 'last_year' => $last, 'kinds' => $kinds];
}

/** ajoute la fiche à recueil_detail() */
function recueil_fiche_decorate(PDO $pdo, array $detail): array
{
    recueil_fiche_ensure($pdo);
    $rid = (int) $detail['recueil']['id'];
    $s = $pdo->prepare('SELECT * FROM recueils WHERE id=?'); $s->execute([$rid]); $r = $s->fetch(PDO::FETCH_ASSOC) ?: [];
    foreach (['fonds', 'series', 'url', 'view_url', 'twin_text', 'comm_mode', 'comm_until', 'reuse', 'support', 'material_state', 'language', 'script', 'provenance', 'digitized_by'] as $k) { $detail['recueil'][$k] = (string) ($r[$k] ?? ''); }
    $detail['recueil']['view_offset'] = (int) ($r['view_offset'] ?? 0);
    $detail['recueil']['archive_service_id'] = isset($r['archive_service_id']) && $r['archive_service_id'] !== null ? (int) $r['archive_service_id'] : 0;
    $detail['recueil']['twin_id'] = isset($r['twin_id']) && $r['twin_id'] !== null ? (int) $r['twin_id'] : 0;
    $svc = null;
    if ($detail['recueil']['archive_service_id'] && function_exists('archive_service_row') && ($row = archive_service_row($pdo, $detail['recueil']['archive_service_id']))) {
        $svc = ['id' => (int) $row['id'], 'name' => (string) $row['name'], 'short_name' => (string) $row['short_name'], 'website_url' => (string) $row['website_url'], 'search_url' => (string) $row['search_url'], 'city' => (string) $row['city']];
    }
    $detail['recueil']['service'] = $svc;
    $twin = null;
    if ($detail['recueil']['twin_id']) { $t = $pdo->prepare('SELECT id, title, reference FROM recueils WHERE id=?'); $t->execute([$detail['recueil']['twin_id']]); if ($x = $t->fetch(PDO::FETCH_ASSOC)) { $twin = ['id' => (int) $x['id'], 'title' => (string) $x['title'], 'reference' => (string) $x['reference']]; } }
    // l'autre exemplaire peut aussi pointer vers celui-ci
    if (!$twin) { $t = $pdo->prepare('SELECT id, title, reference FROM recueils WHERE twin_id=? LIMIT 1'); $t->execute([$rid]); if ($x = $t->fetch(PDO::FETCH_ASSOC)) { $twin = ['id' => (int) $x['id'], 'title' => (string) $x['title'], 'reference' => (string) $x['reference'], 'from_other' => true]; } }
    $detail['recueil']['twin'] = $twin;
    $detail['recueil']['communicability'] = recueil_communicability($pdo, $r + ['id' => $rid]);
    return $detail;
}

/** en mode consultation : un recueil non communicable est-il caché ? (réglage, conseillé : oui) */
function recueil_hidden_in_kiosk(PDO $pdo, array $r): bool
{
    if (!function_exists('kiosk_state') || empty(kiosk_state()['on'])) { return false; }
    try { $s = $pdo->prepare('SELECT value FROM app_settings WHERE key=?'); $s->execute([RECUEIL_HIDE_KEY]); if (trim((string) $s->fetchColumn(), '"') === '0') { return false; } } catch (Throwable $_) {}
    recueil_fiche_ensure($pdo);
    $c = recueil_communicability($pdo, $r);
    return in_array($c['state'], ['reserved', 'authorization'], true);
}

/** 🏛 GET archive_service_recueils&id= : les recueils chez ce service (avec leur avancement) et les lacunes qui les concernent */
function archive_service_recueils(PDO $pdo, int $sid): array
{
    recueil_fiche_ensure($pdo);
    $svc = function_exists('archive_service_row') ? archive_service_row($pdo, $sid) : null;
    if (!$svc) { throw new RuntimeException('Service d’archives introuvable.'); }
    $s = $pdo->prepare('SELECT id FROM recueils WHERE archive_service_id=? ORDER BY fonds COLLATE NOCASE, series COLLATE NOCASE, reference COLLATE NOCASE, title COLLATE NOCASE'); $s->execute([$sid]);
    $out = []; $gapIds = [];
    foreach (array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN)) as $rid) {
        if (recueil_hidden_in_kiosk($pdo, recueil_row($pdo, $rid))) { continue; } // 🔐 mode consultation
        $d = recueil_detail($pdo, $rid); $r = $d['recueil'];
        foreach ($d['pages'] as $p) { if (!empty($p['gap_id'])) { $gapIds[(int) $p['gap_id']] = true; } }
        $out[] = ['id' => $rid, 'title' => $r['title'], 'icon' => $r['icon'], 'reference' => $r['reference'], 'fonds' => $r['fonds'] ?? '', 'series' => $r['series'] ?? '', 'date_text' => $r['date_text'],
            'url' => $r['url'] ?? '', 'pages' => count($d['pages']), 'expected' => $r['expected_pages'] ?? 0, 'etat' => $d['etat'] ?? null, 'communicability' => $r['communicability'] ?? null, 'numbering' => $r['numbering'] ?? ''];
    }
    // les lacunes : celles des pages de ces recueils, et celles des dépouillements faits chez ce service
    $gaps = [];
    $keys = function_exists('archive_service_keys') ? archive_service_keys($svc) : [];
    $q = $pdo->query('SELECT g.id, g.gap_type, g.period_text, g.title, g.status, a.archive_service FROM archive_digest_gaps g LEFT JOIN archive_digest_entries a ON a.id=g.archive_digest_id ORDER BY g.status, g.id DESC');
    foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $g) {
        $mine = isset($gapIds[(int) $g['id']]) || ($g['archive_service'] && $keys && archive_service_matches($keys, (string) $g['archive_service']));
        if ($mine) { $gaps[] = ['id' => (int) $g['id'], 'type' => (string) $g['gap_type'], 'title' => (string) $g['title'], 'period' => (string) $g['period_text'], 'status' => (string) $g['status']]; }
    }
    return ['recueils' => $out, 'gaps' => array_slice($gaps, 0, 200)];
}

/**
 * 🏛 GET recueils_fonds : tous les recueils avec leur fiche et leur avancement, pour la vue « Par fonds » (Listes › Recueils) et le widget
 * « 🗂 Registres : reste à faire ». Mode consultation : sans les recueils non communicables (réglage).
 */
function recueils_fonds_data(PDO $pdo): array
{
    recueil_fiche_ensure($pdo);
    $out = [];
    foreach (array_map('intval', $pdo->query('SELECT id FROM recueils ORDER BY title COLLATE NOCASE, id')->fetchAll(PDO::FETCH_COLUMN)) as $rid) {
        if (recueil_hidden_in_kiosk($pdo, recueil_row($pdo, $rid))) { continue; }
        $d = recueil_detail($pdo, $rid); $r = $d['recueil'];
        $gaps = []; foreach ($d['pages'] as $p) { if (!empty($p['gap_id'])) { $gaps[(int) $p['gap_id']] = true; } }
        $out[] = ['id' => $rid, 'title' => (string) $r['title'], 'icon' => (string) $r['icon'], 'reference' => (string) $r['reference'], 'place_text' => (string) $r['place_text'],
            'fonds' => (string) ($r['fonds'] ?? ''), 'series' => (string) ($r['series'] ?? ''), 'date_text' => (string) $r['date_text'], 'url' => (string) ($r['url'] ?? ''),
            'service' => $r['service'] ?? null, 'pages' => count($d['pages']), 'expected' => (int) ($r['expected_pages'] ?? 0), 'etat' => $d['etat'] ?? null, 'gaps' => count($gaps),
            'communicability' => $r['communicability'] ?? null, 'numbering' => (string) ($r['numbering'] ?? ''), 'support' => (string) ($r['support'] ?? ''), 'material_state' => (string) ($r['material_state'] ?? ''),
            'language' => (string) ($r['language'] ?? ''), 'script' => (string) ($r['script'] ?? ''), 'reuse' => (string) ($r['reuse'] ?? ''), 'updated_at' => (string) $r['updated_at']];
    }
    return ['recueils' => $out];
}
