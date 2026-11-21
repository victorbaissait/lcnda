<?php
declare(strict_types=1);

/**
 * 💌 🛡 🖊 🌐 « Et quatre outils de plus » (maquette docs/design/successoral-et-plus.html, écrans 9 à 12) — le serveur.
 * Écrans : assets/js/plus-famille.js (fiabilité), plus-famille-lettre.js (lettre de famille), plus-famille-relecture.js
 * (relecture par un cousin), plus-famille-latin.js (traduire un acte latin).
 *
 *  9. 💌 Lettre de famille : ce qui remplit la lettre d'un mois (anniversaires du mois — vivants : prénom et âge seulement,
 *     fiches confidentielles jamais —, fiches et médias ajoutés ce mois-ci, photos, ancêtre à l'honneur) et les lettres
 *     gardées (family_letters, migration 89 ; supprimée = deleted_at, « ↶ Annuler » la remet).
 * 10. 🛡 Fiabilité par personne : une note sur 100 qui réunit la fiabilité de chaque fait (events.fact_confidence), les dates
 *     estimées (« vers 1871 »), les sources (citations et médias posés sur les faits) et la 🛡 solidité des liens avec les
 *     parents (solidite_run, lib/preuve.php). Calculée pour toute la base en quelques lectures, gardée dans
 *     DATA_DIR/cache/fiabilite.json tant que la base ne change pas (même signature que la solidité des liens). Seuil
 *     « à revoir avant publication » : Réglages → ⚙️ Seuils du contrôle (reliability_min, 50 au départ).
 * 11. 🖊 Relecture d'une branche par un cousin : la copie « 📤 Partager avec la famille » reçoit une case sur chaque fait ;
 *     chaque fait y porte un repère opaque (HMAC du numéro de l'événement avec un secret gardé ici : aucun numéro de la base
 *     ne part) ; le cousin renvoie un .json (« lcnda-relecture ») importé par « ⤒ Importer les réponses » des Questions aux
 *     proches. ✓ Accepter : « d'accord » → témoignage sur la fiche (Mémoire familiale) ; « faux » → note sur le fait et
 *     fiabilité « doute ». ✕ Refuser : rien ne change. Plus tard : la remarque reste sur le fait (pastille 💬).
 *     Tout est défait par « ↶ Annuler » (l'import entier, ou une décision).
 * 12. 🌐 Traduire un acte latin : le niveau 2 envoie le texte transcrit au modèle de la lecture approfondie (Ollama sur cet
 *     ordinateur seulement, lib/transcription_actes.php) ; le niveau 1 (mot à mot) est calculé dans le navigateur.
 *
 *  GET  pfam&op=rel_person&id= | rel_scores&ids= | rel_review[&limit] | rel_summary[&limit] | rel_export_check
 *       | letter_data&month=AAAA-MM | letters | letter&id= | reviews | review_pending&person_id=
 *  POST pfam_write {op: letter_save | letter_delete | letter_restore | review_new | review_analyze | review_import
 *       | review_undo_import | review_decide | review_undecide | review_delete | review_restore | review_status | translate_start}
 */

const PFAM_REL_VERSION = 1; // à monter quand le calcul de la note change : le cache est refait
const PFAM_FACT_POINTS = ['certain' => 100, 'deduced' => 80, 'estimated' => 55, 'doubt' => 15, 'unknown' => 60];
const PFAM_LINK_POINTS = ['proved' => 100, 'probable' => 75, 'supposed' => 45, 'unsourced' => 20, 'refuted' => 0];
const PFAM_WEIGHTS = ['facts' => 0.4, 'sources' => 0.35, 'links' => 0.25];
const PFAM_REVIEW_FORMAT = 'lcnda-relecture';

/* ═════════════════════════ Structure (migration 89) ═════════════════════════ */

function pfam_schema(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS family_letters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        month TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL DEFAULT '',
        number INTEGER NOT NULL DEFAULT 1,
        options_json TEXT NOT NULL DEFAULT '{}',
        body_html TEXT NOT NULL DEFAULT '',
        photo_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
        ancestor_id INTEGER REFERENCES persons(id) ON DELETE SET NULL,
        deleted_at TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_family_letters_month ON family_letters(month, deleted_at)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS family_reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT NOT NULL UNIQUE,
        secret TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        recipient TEXT NOT NULL DEFAULT '',
        branches_json TEXT NOT NULL DEFAULT '[]',
        person_id INTEGER REFERENCES persons(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'sent',
        from_name TEXT NOT NULL DEFAULT '',
        answered_at TEXT NOT NULL DEFAULT '',
        imports_json TEXT NOT NULL DEFAULT '[]',
        deleted_at TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS family_review_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        review_id INTEGER NOT NULL REFERENCES family_reviews(id) ON DELETE CASCADE,
        fact_key TEXT NOT NULL,
        event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
        person_id INTEGER REFERENCES persons(id) ON DELETE CASCADE,
        verdict TEXT NOT NULL DEFAULT 'ok',
        comment TEXT NOT NULL DEFAULT '',
        reviewer TEXT NOT NULL DEFAULT '',
        decision TEXT NOT NULL DEFAULT '',
        made_json TEXT NOT NULL DEFAULT '{}',
        import_no INTEGER NOT NULL DEFAULT 0,
        decided_at TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_family_review_items ON family_review_items(review_id, decision)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_family_review_items_event ON family_review_items(event_id, decision)');
}

function pfam_ready(PDO $pdo): bool
{
    static $ok = null;
    if (!$ok) { $ok = (bool) $pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='family_reviews'")->fetchColumn(); }
    return $ok;
}

function pfam_need(PDO $pdo): void
{
    if (!pfam_ready($pdo)) { throw new RuntimeException('Ces outils ne sont pas encore prêts : relance l’app.'); }
}

function pfam_text(mixed $v, int $max): string
{
    return mb_substr(trim(str_replace("\0", '', is_scalar($v) ? (string) $v : '')), 0, $max);
}

function pfam_kiosk(): bool { return function_exists('kiosk_state') && !empty(kiosk_state()['on']); }

/** Les vivants (déclarés ou probables) et les fiches confidentielles : la règle de l'export « Pour partager ». */
function pfam_hidden(PDO $pdo): array
{
    static $memo = null;
    if ($memo !== null) { return $memo; }
    if (!function_exists('tresor_share_rows')) { require_once __DIR__ . '/tresors.php'; }
    if (!function_exists('gedcom_share_hidden')) { require_once __DIR__ . '/gedcom.php'; }
    try { $memo = tresor_share_hidden_all($pdo); }
    catch (Throwable $e) { $memo = []; foreach ($pdo->query('SELECT id FROM persons') as $r) { $memo[(int) $r['id']] = 'living'; } } // dans le doute, personne ne part
    return $memo;
}

function pfam_has_col(PDO $pdo, string $table, string $col): bool
{
    static $memo = [];
    $k = "$table.$col";
    if (!isset($memo[$k])) { $memo[$k] = in_array($col, array_column($pdo->query("PRAGMA table_info($table)")->fetchAll(PDO::FETCH_ASSOC), 'name'), true); }
    return $memo[$k];
}

/* ═════════════════════════ 10. 🛡 Fiabilité par personne ═════════════════════════ */

function pfam_rel_threshold(PDO $pdo): int
{
    $s = function_exists('controle_seuils') ? controle_seuils($pdo) : [];
    return (int) round((float) ($s['reliability_min'] ?? 50));
}

/** Une date écrite « vers », « avant », « entre »… (ou avec un point d'interrogation) : une date estimée. */
function pfam_date_estimated(string $d): bool
{
    $d = trim($d);
    if ($d === '') { return false; }
    return (bool) preg_match('/^(vers|env\.?|environ|avant|apr[eè]s|entre|abt|abo?u?t|bef|aft|bet|est|cal|ca\.?|c\.|circa|~|≈)(\s|$|\d)/iu', $d) || str_contains($d, '?');
}

/**
 * Les données du calcul, en quelques lectures de la base (toute la base, ou une seule personne avec le détail).
 * @return array{facts: array, srcPerson: array, links: array, names: array}
 */
function pfam_rel_collect(PDO $pdo, ?int $only = null, bool $detail = false): array
{
    $famPartners = [];
    $fq = $only ? $pdo->prepare('SELECT id, partner1_id, partner2_id FROM families WHERE partner1_id=? OR partner2_id=?') : null;
    if ($fq) { $fq->execute([$only, $only]); $rows = $fq->fetchAll(PDO::FETCH_ASSOC); } else { $rows = $pdo->query('SELECT id, partner1_id, partner2_id FROM families')->fetchAll(PDO::FETCH_ASSOC); }
    foreach ($rows as $r) { $famPartners[(int) $r['id']] = array_values(array_filter([(int) $r['partner1_id'], (int) $r['partner2_id']])); }
    // les faits : événements de la personne et de ses couples
    $sql = 'SELECT e.id, e.person_id, e.family_id, e.fact_confidence, e.date_text, e.year, t.label, t.gedcom_tag FROM events e JOIN event_types t ON t.id=e.event_type_id';
    if ($only) {
        $ids = array_keys($famPartners);
        $st = $pdo->prepare($sql . ' WHERE e.person_id=?' . ($ids ? ' OR e.family_id IN (' . implode(',', array_map('intval', $ids)) . ')' : '') . ' ORDER BY COALESCE(e.sort_date,\'\'), e.year, e.id');
        $st->execute([$only]); $events = $st->fetchAll(PDO::FETCH_ASSOC);
    } else { $events = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC); }
    $evIds = [];
    foreach ($events as $e) { $evIds[(int) $e['id']] = true; }
    // ce qui appuie un fait : une citation (source_links) ou un média (l'acte en image) posé dessus ; une source sur la famille vaut pour ses faits
    $sourcedEv = []; $sourcedFam = []; $srcPerson = [];
    $q = $only ? $pdo->prepare("SELECT entity_type, entity_id FROM source_links WHERE (entity_type='person' AND entity_id=?) OR (entity_type='family' AND entity_id IN (" . ($famPartners ? implode(',', array_map('intval', array_keys($famPartners))) : '0') . ")) OR (entity_type='event' AND entity_id IN (" . ($evIds ? implode(',', array_keys($evIds)) : '0') . '))') : null;
    if ($q) { $q->execute([$only]); $sl = $q->fetchAll(PDO::FETCH_ASSOC); } else { $sl = $pdo->query("SELECT entity_type, entity_id FROM source_links WHERE entity_type IN ('person','family','event')")->fetchAll(PDO::FETCH_ASSOC); }
    foreach ($sl as $r) {
        $id = (int) $r['entity_id'];
        if ($r['entity_type'] === 'event') { $sourcedEv[$id] = true; } elseif ($r['entity_type'] === 'family') { $sourcedFam[$id] = true; } else { $srcPerson[$id] = true; }
    }
    $mq = $only ? $pdo->prepare("SELECT entity_id FROM media_links WHERE entity_type='event' AND entity_id IN (" . ($evIds ? implode(',', array_keys($evIds)) : '0') . ')') : null;
    if ($mq) { $mq->execute(); $ml = $mq->fetchAll(PDO::FETCH_COLUMN); } else { $ml = $pdo->query("SELECT entity_id FROM media_links WHERE entity_type='event'")->fetchAll(PDO::FETCH_COLUMN); }
    foreach ($ml as $id) { $sourcedEv[(int) $id] = true; }
    $facts = [];
    foreach ($events as $e) {
        $conf = (string) ($e['fact_confidence'] ?: 'unknown'); if (!isset(PFAM_FACT_POINTS[$conf])) { $conf = 'unknown'; }
        $est = pfam_date_estimated((string) $e['date_text']);
        $pts = PFAM_FACT_POINTS[$conf];
        if ($est && $pts > PFAM_FACT_POINTS['estimated'] && $conf !== 'certain') { $pts = PFAM_FACT_POINTS['estimated']; }
        $fid = (int) $e['family_id'];
        $sourced = isset($sourcedEv[(int) $e['id']]) || ($fid && isset($sourcedFam[$fid]));
        $owners = $e['person_id'] ? [(int) $e['person_id']] : ($famPartners[$fid] ?? []);
        $f = [$pts, $conf, $est, $sourced];
        if ($detail) { $f[] = ['id' => (int) $e['id'], 'label' => (string) $e['label'], 'tag' => (string) $e['gedcom_tag'], 'date' => (string) $e['date_text'], 'year' => $e['year'] !== null ? (int) $e['year'] : null]; }
        foreach ($owners as $o) { $facts[$o][] = $f; }
    }
    // les liens avec les parents : la 🛡 solidité (lib/preuve.php)
    $links = [];
    $all = function_exists('solidite_run') ? solidite_run($pdo) : ['links' => []];
    if ($only) {
        foreach ($all['links'] as $key => $v) { [$c, $p] = array_map('intval', explode(':', (string) $key)); if ($c === $only) { $links[$c][$p] = (string) $v[0]; } }
    } else {
        foreach ($all['links'] as $key => $v) { [$c, $p] = array_map('intval', explode(':', (string) $key)); $links[$c][$p] = (string) $v[0]; }
    }
    return ['facts' => $facts, 'srcPerson' => $srcPerson, 'links' => $links];
}

/** La note d'une personne à partir de ses faits, de ses sources et de ses liens : [note, faits, sources, liens] (null = sans objet). */
function pfam_rel_score(array $facts, bool $personSource, array $links): array
{
    $n = count($facts);
    $fs = $n ? array_sum(array_map(static fn($f) => $f[0], $facts)) / $n : 30.0;
    $ss = $n ? 100 * count(array_filter($facts, static fn($f) => $f[3])) / $n : ($personSource ? 100.0 : 0.0);
    $ls = $links ? array_sum(array_map(static fn($l) => PFAM_LINK_POINTS[$l] ?? 20, $links)) / count($links) : null;
    $w = PFAM_WEIGHTS; $sum = $w['facts'] * $fs + $w['sources'] * $ss; $tw = $w['facts'] + $w['sources'];
    if ($ls !== null) { $sum += $w['links'] * $ls; $tw += $w['links']; }
    return [(int) round($sum / $tw), (int) round($fs), (int) round($ss), $ls === null ? null : (int) round($ls)];
}

function pfam_rel_cache_file(): string { return DATA_DIR . '/cache/fiabilite.json'; }

/** Toutes les notes de la base : {scores: {id: [note, faits, sources, liens]}, hidden: {id: 1}}, gardées tant que la base ne change pas. */
function pfam_rel_run(PDO $pdo, bool $fresh = false): array
{
    static $memo = null;
    $sig = md5(json_encode([function_exists('solidite_signature') ? solidite_signature($pdo) : '', PFAM_REL_VERSION,
        $pdo->query("SELECT count(*)||'.'||COALESCE(total(length(fact_confidence)*id),0)||'.'||COALESCE(total(length(date_text)),0) FROM events")->fetchColumn()]));
    if (!$fresh && $memo && ($memo['sig'] ?? '') === $sig) { return $memo; }
    $file = pfam_rel_cache_file();
    if (!$fresh && is_file($file)) {
        $c = json_decode((string) @file_get_contents($file), true);
        if (is_array($c) && ($c['sig'] ?? '') === $sig) { return $memo = $c; }
    }
    if (function_exists('memory_for_persons')) { memory_for_persons($pdo, 8, 1024); } elseif (function_exists('memory_at_least')) { memory_at_least(1024); } // 200 000 fiches : 1,5 Go avec la solidité des liens
    @set_time_limit(300);
    $t0 = microtime(true);
    $d = pfam_rel_collect($pdo);
    $hasKind = pfam_has_col($pdo, 'persons', 'kind');
    $scores = [];
    foreach ($pdo->query('SELECT id' . ($hasKind ? ", COALESCE(kind,'human') AS kind" : ", 'human' AS kind") . ' FROM persons') as $r) {
        if ($r['kind'] === 'animal') { continue; }
        $id = (int) $r['id'];
        $scores[$id] = pfam_rel_score($d['facts'][$id] ?? [], isset($d['srcPerson'][$id]), $d['links'][$id] ?? []);
    }
    $hidden = array_map(static fn() => 1, pfam_hidden($pdo));
    $res = ['sig' => $sig, 'scores' => $scores, 'hidden' => $hidden, 'ms' => (int) round((microtime(true) - $t0) * 1000)];
    $dir = dirname($file);
    if (is_dir($dir) || @mkdir($dir, 0775, true)) {
        $tmp = $file . '.' . bin2hex(random_bytes(4)) . '.tmp';
        if (@file_put_contents($tmp, json_encode($res)) !== false) { @rename($tmp, $file); } else { @unlink($tmp); }
    }
    return $memo = $res;
}

/** Le niveau d'une note : très sûr (80+), assez sûr (65+), moyen (seuil+), à revoir (sous le seuil). */
function pfam_rel_level(int $score, int $min): string
{
    return $score < $min ? 'review' : ($score >= 80 ? 'high' : ($score >= 65 ? 'good' : 'medium'));
}

/** Le bloc « 🛡 Fiabilité » d'une fiche : la note, ses trois parts et leurs raisons (le navigateur écrit les phrases). */
function pfam_rel_person(PDO $pdo, int $pid): array
{
    $s = $pdo->prepare('SELECT id, first_name, last_name, gender FROM persons WHERE id=?'); $s->execute([$pid]);
    $p = $s->fetch(PDO::FETCH_ASSOC);
    if (!$p) { throw new RuntimeException('Fiche introuvable.'); }
    $d = pfam_rel_collect($pdo, $pid, true);
    $facts = $d['facts'][$pid] ?? []; $links = $d['links'][$pid] ?? [];
    [$score, $fs, $ss, $ls] = pfam_rel_score($facts, isset($d['srcPerson'][$pid]), $links);
    $count = array_fill_keys(array_keys(PFAM_FACT_POINTS), 0); $doubt = []; $estimated = []; $unsourced = []; $sourced = 0;
    foreach ($facts as $f) {
        $count[$f[1]]++;
        $info = $f[4];
        if ($f[1] === 'doubt') { $doubt[] = $info; }
        if ($f[2]) { $estimated[] = $info; }
        if ($f[3]) { $sourced++; } else { $unsourced[] = $info; }
    }
    $parents = [];
    foreach ($links as $parId => $lvl) {
        $q = $pdo->prepare('SELECT id, first_name, last_name, gender FROM persons WHERE id=?'); $q->execute([$parId]); $r = $q->fetch(PDO::FETCH_ASSOC);
        if ($r) { $parents[] = ['id' => (int) $r['id'], 'name' => trim($r['first_name'] . ' ' . mb_strtoupper((string) $r['last_name'])), 'gender' => (string) $r['gender'], 'level' => $lvl]; }
    }
    $min = pfam_rel_threshold($pdo);
    $hidden = pfam_hidden($pdo);
    // 💡 pour gagner des points : la source qui manque sur un fait clé, le fait en doute, le lien le plus fragile
    $tips = [];
    $key = static fn($f) => in_array($f['tag'], ['BIRT', 'CHR', 'BAPM', 'MARR', 'DEAT', 'BURI'], true);
    foreach (array_filter($unsourced, $key) as $f) { $tips[] = ['kind' => 'source', 'event' => $f]; if (count($tips) >= 2) { break; } }
    foreach ($doubt as $f) { $tips[] = ['kind' => 'doubt', 'event' => $f]; break; }
    $weak = array_values(array_filter($parents, static fn($x) => in_array($x['level'], ['supposed', 'unsourced', 'refuted'], true)));
    if ($weak) { $tips[] = ['kind' => 'link', 'parent' => $weak[0]]; }
    if (!$facts) { $tips[] = ['kind' => 'facts']; }
    return ['person_id' => $pid, 'name' => trim($p['first_name'] . ' ' . mb_strtoupper((string) $p['last_name'])), 'gender' => (string) $p['gender'],
        'score' => $score, 'level' => pfam_rel_level($score, $min), 'threshold' => $min, 'review' => $score < $min && !isset($hidden[$pid]), 'hidden' => isset($hidden[$pid]),
        'facts' => ['score' => $fs, 'n' => count($facts), 'count' => $count, 'doubt' => $doubt, 'estimated' => $estimated],
        'sources' => ['score' => $ss, 'sourced' => $sourced, 'n' => count($facts), 'unsourced' => $unsourced, 'person' => isset($d['srcPerson'][$pid])],
        'links' => ['score' => $ls, 'parents' => $parents], 'tips' => $tips, 'weights' => PFAM_WEIGHTS];
}

/** Les notes de quelques fiches (liste des personnes, arbres) : {id: note}. */
function pfam_rel_scores(PDO $pdo, string $ids): array
{
    $run = pfam_rel_run($pdo); $out = [];
    foreach (array_slice(array_unique(array_filter(array_map('intval', explode(',', $ids)))), 0, 5000) as $id) { if (isset($run['scores'][$id])) { $out[$id] = $run['scores'][$id][0]; } }
    return ['scores' => (object) $out, 'threshold' => pfam_rel_threshold($pdo)];
}

/** Les fiches « à revoir avant publication » : note sous le seuil, sans les vivants ni les fiches confidentielles (elles ne partent pas). */
function pfam_rel_review_ids(PDO $pdo): array
{
    $run = pfam_rel_run($pdo); $min = pfam_rel_threshold($pdo); $out = [];
    foreach ($run['scores'] as $id => $v) { if ($v[0] < $min && !isset($run['hidden'][$id])) { $out[(int) $id] = $v[0]; } }
    asort($out);
    return $out;
}

function pfam_rel_people(PDO $pdo, array $ids): array
{
    if (!$ids) { return []; }
    $in = implode(',', array_map('intval', $ids));
    $out = [];
    foreach ($pdo->query("SELECT p.id, p.first_name, p.last_name, p.gender,
            (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('BIRT','CHR','BAPM') ORDER BY t.gedcom_tag<>'BIRT', e.id LIMIT 1) AS by_,
            (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('DEAT','BURI') ORDER BY t.gedcom_tag<>'DEAT', e.id LIMIT 1) AS dy_
            FROM persons p WHERE p.id IN ($in)") as $r) {
        $out[(int) $r['id']] = ['id' => (int) $r['id'], 'name' => trim($r['first_name'] . ' ' . mb_strtoupper((string) $r['last_name'])) ?: 'Sans nom', 'gender' => (string) $r['gender'],
            'years' => ($r['by_'] || $r['dy_']) ? (($r['by_'] ?: '?') . '-' . ($r['dy_'] ?: '?')) : ''];
    }
    return $out;
}

/** Le widget « 🛡 Fiches les moins fiables » et le contrôle avant l'export. */
function pfam_rel_summary(PDO $pdo, int $limit = 5): array
{
    $ids = pfam_rel_review_ids($pdo);
    $run = pfam_rel_run($pdo);
    $limit = max(1, min(50, $limit));
    $top = array_slice($ids, 0, $limit, true);
    $people = pfam_rel_people($pdo, array_keys($top));
    $published = count(array_diff_key($run['scores'], $run['hidden']));
    return ['count' => count($ids), 'threshold' => pfam_rel_threshold($pdo), 'published' => $published,
        'top' => array_values(array_filter(array_map(static fn($id, $s) => isset($people[$id]) ? $people[$id] + ['score' => $s] : null, array_keys($top), array_values($top))))];
}

/* ═════════════════════════ 9. 💌 Lettre de famille ═════════════════════════ */

function pfam_month(string $m): string
{
    return preg_match('/^(\d{4})-(0[1-9]|1[0-2])$/', $m) ? $m : date('Y-m');
}

/** Ce qui remplit la lettre d'un mois : anniversaires, découvertes du mois, photos, ancêtre à l'honneur. */
function pfam_letter_data(PDO $pdo, string $month): array
{
    $month = pfam_month($month);
    [$Y, $M] = array_map('intval', explode('-', $month));
    $hidden = pfam_hidden($pdo);
    $kiosk = pfam_kiosk();
    $hasPriv = pfam_has_col($pdo, 'persons', 'is_private');
    $hasKind = pfam_has_col($pdo, 'persons', 'kind');
    $persons = [];
    foreach ($pdo->query('SELECT id, first_name, last_name, gender, living_status, is_start, created_at' . ($hasPriv ? ', COALESCE(is_private,0) AS priv' : ', 0 AS priv') . ' FROM persons' . ($hasKind ? " WHERE COALESCE(kind,'human')<>'animal'" : '')) as $r) {
        $persons[(int) $r['id']] = $r;
    }
    // 🎂 anniversaires du mois (naissances avec un jour précis) ; vivants : prénom et âge ; décédés : seulement les anniversaires ronds (50, 100, 150… ans)
    $birthdays = [];
    $st = $pdo->query("SELECT e.person_id, e.sort_date, e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE t.gedcom_tag='BIRT' AND e.person_id IS NOT NULL AND e.sort_date LIKE '____-" . sprintf('%02d', $M) . "-__%' ORDER BY substr(e.sort_date, 9, 2), e.id");
    $seen = [];
    foreach ($st as $e) {
        $pid = (int) $e['person_id']; $p = $persons[$pid] ?? null;
        if (!$p || isset($seen[$pid]) || (int) $p['priv'] === 1) { continue; }
        if (!preg_match('/^(\d{3,4})-(\d{2})-(\d{2})/', (string) $e['sort_date'], $m) || (int) $m[3] < 1) { continue; }
        $seen[$pid] = true;
        $by = (int) $m[1]; $day = (int) $m[3]; $age = $Y - $by;
        if ($age < 0) { continue; }
        $first = trim((string) preg_split('/\s+/u', trim((string) $p['first_name']))[0]);
        if (isset($hidden[$pid])) {
            if ($kiosk) { continue; }
            if ($age > 110 || $first === '') { continue; }
            $birthdays[] = ['day' => $day, 'kind' => 'living', 'first' => $first, 'age' => $age]; // ni nom, ni lieu, ni fiche
            continue;
        }
        if ($age < 50 || $age % 50 !== 0) { continue; }
        $birthdays[] = ['day' => $day, 'kind' => 'past', 'id' => $pid, 'first' => $first, 'name' => trim($p['first_name'] . ' ' . mb_strtoupper((string) $p['last_name'])), 'years' => $age, 'year' => $by, 'gender' => (string) $p['gender']];
    }
    // 💍 mariages ronds (50, 100… ans) dont aucun des deux n'est caché
    $st = $pdo->query("SELECT e.sort_date, f.partner1_id, f.partner2_id FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN families f ON f.id=e.family_id WHERE t.gedcom_tag='MARR' AND e.sort_date LIKE '____-" . sprintf('%02d', $M) . "-__%'");
    foreach ($st as $e) {
        if (!preg_match('/^(\d{3,4})-\d{2}-(\d{2})/', (string) $e['sort_date'], $m) || (int) $m[2] < 1) { continue; }
        $a = (int) $e['partner1_id']; $b = (int) $e['partner2_id']; $yrs = $Y - (int) $m[1];
        if ($yrs < 50 || $yrs % 50 !== 0 || !isset($persons[$a], $persons[$b]) || isset($hidden[$a]) || isset($hidden[$b])) { continue; }
        $birthdays[] = ['day' => (int) $m[2], 'kind' => 'wedding', 'names' => [trim((string) $persons[$a]['first_name']), trim((string) $persons[$b]['first_name'])], 'ids' => [$a, $b], 'years' => $yrs];
    }
    usort($birthdays, static fn($x, $y) => $x['day'] <=> $y['day']);
    // 🔎 découvertes du mois : fiches et médias ajoutés ce mois-ci (jamais une fiche cachée, ni un média où elle figure)
    $from = sprintf('%04d-%02d-01', $Y, $M); $to = date('Y-m-d', strtotime($from . ' +1 month'));
    $newPeople = [];
    foreach ($persons as $id => $p) {
        $c = substr((string) $p['created_at'], 0, 10);
        if ($c >= $from && $c < $to && !isset($hidden[$id])) { $newPeople[] = ['id' => $id, 'name' => trim($p['first_name'] . ' ' . mb_strtoupper((string) $p['last_name'])), 'gender' => (string) $p['gender']]; }
    }
    $mediaPeople = [];
    foreach ($pdo->query("SELECT ml.media_id, ml.entity_type, ml.entity_id, e.person_id AS evp, f.partner1_id AS fa, f.partner2_id AS fb FROM media_links ml LEFT JOIN events e ON ml.entity_type='event' AND e.id=ml.entity_id LEFT JOIN families f ON f.id=CASE WHEN ml.entity_type='family' THEN ml.entity_id ELSE e.family_id END") as $l) {
        $who = $l['entity_type'] === 'person' ? [(int) $l['entity_id']] : array_filter([(int) $l['evp'], (int) $l['fa'], (int) $l['fb']]);
        foreach ($who as $w) { $mediaPeople[(int) $l['media_id']][$w] = true; }
    }
    try { foreach ($pdo->query('SELECT media_id, person_id FROM media_tags WHERE person_id IS NOT NULL') as $t) { $mediaPeople[(int) $t['media_id']][(int) $t['person_id']] = true; } } catch (Throwable $_) {}
    $sealed = function_exists('sealed_media_sql') ? sealed_media_sql($pdo) : '';
    $okMedia = static fn(int $mid) => !array_intersect_key($mediaPeople[$mid] ?? [], $hidden);
    $newMedia = []; $photos = [];
    $st = $pdo->prepare("SELECT m.id, m.title, m.media_type, m.filename, m.thumbnail, m.date_text, m.created_at FROM media m WHERE m.created_at>=? AND m.created_at<?" . $sealed . ' ORDER BY m.created_at, m.id LIMIT 400');
    $st->execute([$from, $to]);
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $m) {
        if (!$okMedia((int) $m['id'])) { continue; }
        $row = ['id' => (int) $m['id'], 'title' => (string) $m['title'], 'type' => (string) $m['media_type'], 'filename' => (string) $m['filename'], 'thumbnail' => (string) ($m['thumbnail'] ?: $m['filename']), 'date' => (string) $m['date_text']];
        $newMedia[] = $row;
        if ($m['media_type'] === 'image') { $photos[] = $row; }
    }
    // la photo proposée : la plus ancienne des photos ajoutées ce mois-ci (par la date écrite), sinon la plus ancienne photo de la base prise ce mois-là
    $yearOf = static fn($r) => preg_match('/\b(1[0-9]{3}|20[0-9]{2})\b/', $r['date'] . ' ' . $r['title'], $mm) ? (int) $mm[1] : 9999;
    usort($photos, static fn($a, $b) => $yearOf($a) <=> $yearOf($b));
    if (!$photos) {
        $st = $pdo->query("SELECT m.id, m.title, m.media_type, m.filename, m.thumbnail, m.date_text FROM media m WHERE m.media_type='image'" . $sealed . " ORDER BY m.id LIMIT 3000");
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $m) {
            if (!$okMedia((int) $m['id'])) { continue; }
            $row = ['id' => (int) $m['id'], 'title' => (string) $m['title'], 'type' => 'image', 'filename' => (string) $m['filename'], 'thumbnail' => (string) ($m['thumbnail'] ?: $m['filename']), 'date' => (string) $m['date_text']];
            if ($yearOf($row) < 9999) { $photos[] = $row; }
        }
        usort($photos, static fn($a, $b) => $yearOf($a) <=> $yearOf($b));
        $photos = array_slice($photos, 0, 12);
    }
    // ⭐ l'ancêtre à l'honneur : un ancêtre direct décédé (Sosa), le même tout le mois, un autre le mois suivant
    $start = 0; foreach ($persons as $id => $p) { if ((int) $p['is_start'] === 1) { $start = $id; break; } }
    if (!$start && $persons) { $start = (int) array_key_first($persons); }
    $ancestor = 0;
    if ($start && function_exists('sosa_positions')) {
        $pos = sosa_positions($pdo, $start, 2000)['positions'] ?? [];
        $cand = array_values(array_filter(array_unique(array_map('intval', array_slice(array_values($pos), 1))), static fn($id) => isset($persons[$id]) && !isset($hidden[$id])));
        if ($cand) { $ancestor = $cand[($Y * 12 + $M) % count($cand)]; }
    }
    if (!$ancestor) { foreach ($persons as $id => $p) { if (!isset($hidden[$id]) && $id !== $start) { $ancestor = $id; break; } } }
    $last = $start ? mb_strtoupper(trim((string) $persons[$start]['last_name'])) : '';
    $number = pfam_ready($pdo) ? 1 + (int) $pdo->query("SELECT count(*) FROM family_letters WHERE deleted_at=''")->fetchColumn() : 1;
    return ['month' => $month, 'family' => $last, 'number' => $number, 'birthdays' => $birthdays,
        'discoveries' => ['people' => array_slice($newPeople, 0, 40), 'people_count' => count($newPeople), 'media' => array_slice($newMedia, 0, 40), 'media_count' => count($newMedia)],
        'photos' => array_slice($photos, 0, 12), 'ancestor' => $ancestor ? (pfam_rel_people($pdo, [$ancestor])[$ancestor] ?? null) : null];
}

function pfam_letter_row(PDO $pdo, int $id, bool $deleted = false): array
{
    pfam_need($pdo);
    $s = $pdo->prepare('SELECT * FROM family_letters WHERE id=?' . ($deleted ? '' : " AND deleted_at=''")); $s->execute([$id]);
    $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { throw new RuntimeException('Lettre introuvable.'); }
    return $r;
}

function pfam_letter_view(array $r): array
{
    return ['id' => (int) $r['id'], 'month' => (string) $r['month'], 'title' => (string) $r['title'], 'number' => (int) $r['number'], 'options' => json_decode((string) $r['options_json'], true) ?: new stdClass(),
        'body_html' => (string) $r['body_html'], 'photo_media_id' => $r['photo_media_id'] !== null ? (int) $r['photo_media_id'] : null, 'ancestor_id' => $r['ancestor_id'] !== null ? (int) $r['ancestor_id'] : null,
        'created_at' => (string) $r['created_at'], 'updated_at' => (string) $r['updated_at']];
}

function pfam_letters(PDO $pdo): array
{
    if (!pfam_ready($pdo)) { return ['letters' => []]; }
    $rows = $pdo->query("SELECT * FROM family_letters WHERE deleted_at='' ORDER BY month DESC, id DESC LIMIT 2000")->fetchAll(PDO::FETCH_ASSOC);
    return ['letters' => array_map(static function ($r) { $v = pfam_letter_view($r); unset($v['body_html']); $v['words'] = str_word_count(strip_tags((string) $r['body_html'])); return $v; }, $rows)];
}

/** Le texte d'une lettre gardée : seulement des balises simples (le reste est retiré), jamais de script. */
function pfam_clean_html(string $html): string
{
    $html = mb_substr(str_replace("\0", '', $html), 0, 200000);
    $html = (string) preg_replace('#<(script|style|iframe|object|embed|form|input|button|textarea|select)\b[^>]*>.*?</\1>#is', '', $html);
    $html = strip_tags($html, '<p><br><b><strong><i><em><u><h1><h2><h3><h4><ul><ol><li><figure><figcaption><img><div><span><section><header><footer><small><blockquote><hr><article>');
    $html = (string) preg_replace('/\son\w+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)/i', '', $html);
    $html = (string) preg_replace_callback('/\s(src|href)\s*=\s*("([^"]*)"|\'([^\']*)\')/i', static function ($m) {
        $u = $m[3] !== '' ? $m[3] : ($m[4] ?? '');
        return preg_match('#^(media/[\w./%-]+|data:image/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+)$#i', $u) ? ' ' . strtolower($m[1]) . '="' . htmlspecialchars($u, ENT_QUOTES) . '"' : '';
    }, $html);
    return (string) preg_replace('/\sstyle\s*=\s*("[^"]*(expression|url\s*\(|javascript)[^"]*"|\'[^\']*(expression|url\s*\(|javascript)[^\']*\')/i', '', $html);
}

function pfam_letter_save(PDO $pdo, array $d): array
{
    pfam_need($pdo);
    $id = safe_int($d['id'] ?? 0);
    $month = pfam_month(pfam_text($d['month'] ?? '', 7));
    $title = pfam_text($d['title'] ?? '', 200);
    if ($title === '') { throw new LcndaBadInput('Donne un titre à la lettre.'); }
    $opts = is_array($d['options'] ?? null) ? $d['options'] : [];
    $opts = array_intersect_key($opts, array_flip(['birthdays', 'discoveries', 'photo', 'ancestor', 'note', 'style', 'edition']));
    array_walk($opts, static function (&$v) { $v = is_bool($v) || is_int($v) ? $v : pfam_text($v, 2000); });
    $photo = safe_int($d['photo_media_id'] ?? 0); if ($photo) { $c = $pdo->prepare('SELECT 1 FROM media WHERE id=?'); $c->execute([$photo]); if (!$c->fetchColumn()) { $photo = 0; } }
    $anc = safe_int($d['ancestor_id'] ?? 0); if ($anc) { $c = $pdo->prepare('SELECT 1 FROM persons WHERE id=?'); $c->execute([$anc]); if (!$c->fetchColumn()) { $anc = 0; } }
    $vals = [$month, $title, max(1, min(9999, safe_int($d['number'] ?? 1) ?: 1)), json_encode($opts, JSON_UNESCAPED_UNICODE) ?: '{}', pfam_clean_html((string) (is_scalar($d['body_html'] ?? '') ? $d['body_html'] ?? '' : '')), $photo ?: null, $anc ?: null];
    if ($id) {
        $prev = pfam_letter_view(pfam_letter_row($pdo, $id));
        $pdo->prepare('UPDATE family_letters SET month=?, title=?, number=?, options_json=?, body_html=?, photo_media_id=?, ancestor_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$vals, $id]);
    } else {
        $prev = null;
        $pdo->prepare('INSERT INTO family_letters(month, title, number, options_json, body_html, photo_media_id, ancestor_id) VALUES(?,?,?,?,?,?,?)')->execute($vals);
        $id = (int) $pdo->lastInsertId();
    }
    log_change($pdo, 'meta', 0, $prev ? 'update' : 'create', 'Lettre de famille gardée : ' . $title);
    return ['ok' => true, 'id' => $id, 'prev' => $prev, 'letter' => pfam_letter_view(pfam_letter_row($pdo, $id))];
}

function pfam_letter_delete(PDO $pdo, array $d, bool $restore = false): array
{
    $r = pfam_letter_row($pdo, safe_int($d['id'] ?? 0), true);
    $pdo->prepare('UPDATE family_letters SET deleted_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$restore ? '' : date('Y-m-d H:i:s'), (int) $r['id']]);
    log_change($pdo, 'meta', 0, 'update', ($restore ? 'Lettre de famille remise : ' : 'Lettre de famille supprimée : ') . $r['title']);
    return ['ok' => true, 'id' => (int) $r['id']];
}

/* ═════════════════════════ 11. 🖊 Relecture d'une branche par un cousin ═════════════════════════ */

/** Le repère d'un fait dans la copie : rien qui ressemble à un numéro de la base. */
function pfam_fact_key(string $secret, int $eventId): string
{
    return substr(hash_hmac('sha256', 'e' . $eventId, $secret), 0, 12);
}

function pfam_review_by_token(PDO $pdo, string $token): ?array
{
    if (!pfam_ready($pdo) || !preg_match('/^[a-f0-9]{16,40}$/', $token)) { return null; }
    $s = $pdo->prepare("SELECT * FROM family_reviews WHERE token=? AND deleted_at=''"); $s->execute([$token]);
    return $s->fetch(PDO::FETCH_ASSOC) ?: null;
}

/** « 🖊 Demander une relecture » : la demande est créée avant de fabriquer la copie (le jeton part dans le fichier). */
function pfam_review_new(PDO $pdo, array $d): array
{
    pfam_need($pdo);
    $token = bin2hex(random_bytes(10)); $secret = bin2hex(random_bytes(24));
    $branches = is_string($d['branches'] ?? null) ? (json_decode((string) $d['branches'], true) ?: []) : (is_array($d['branches'] ?? null) ? $d['branches'] : []);
    $branches = array_slice(array_values(array_filter($branches, 'is_array')), 0, 12);
    $pid = 0; foreach ($branches as $b) { $pid = safe_int($b['person'] ?? 0); if ($pid) { break; } }
    if ($pid) { $c = $pdo->prepare('SELECT 1 FROM persons WHERE id=?'); $c->execute([$pid]); if (!$c->fetchColumn()) { $pid = 0; } }
    $title = pfam_text($d['title'] ?? '', 160) ?: 'Relecture de l’arbre';
    $pdo->prepare('INSERT INTO family_reviews(token, secret, title, recipient, branches_json, person_id) VALUES(?,?,?,?,?,?)')
        ->execute([$token, $secret, $title, pfam_text($d['recipient'] ?? '', 160), json_encode($branches, JSON_UNESCAPED_UNICODE) ?: '[]', $pid ?: null]);
    $id = (int) $pdo->lastInsertId();
    log_change($pdo, 'meta', 0, 'create', 'Relecture demandée : ' . $title);
    return ['ok' => true, 'id' => $id, 'token' => $token];
}

/** Pour lib/family_share.php : le secret de la relecture demandée (ou null). */
function pfam_review_secret(PDO $pdo, string $token): ?array
{
    $r = pfam_review_by_token($pdo, $token);
    return $r ? ['token' => (string) $r['token'], 'secret' => (string) $r['secret'], 'title' => (string) $r['title']] : null;
}

/** La description d'un fait, pour la fenêtre d'import et la pastille de la fiche. */
function pfam_event_view(PDO $pdo, int $eid): ?array
{
    $s = $pdo->prepare('SELECT e.id, e.person_id, e.family_id, e.date_text, e.fact_confidence, t.label, t.gedcom_tag, pl.name AS place, f.partner1_id, f.partner2_id FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id LEFT JOIN families f ON f.id=e.family_id WHERE e.id=?');
    $s->execute([$eid]); $e = $s->fetch(PDO::FETCH_ASSOC);
    if (!$e) { return null; }
    $who = $e['person_id'] ? [(int) $e['person_id']] : array_values(array_filter([(int) $e['partner1_id'], (int) $e['partner2_id']]));
    $people = pfam_rel_people($pdo, $who);
    return ['event_id' => (int) $e['id'], 'label' => (string) $e['label'], 'tag' => (string) $e['gedcom_tag'], 'date' => (string) $e['date_text'], 'place' => (string) $e['place'], 'confidence' => (string) $e['fact_confidence'],
        'person_id' => $who[0] ?? 0, 'people' => array_values(array_map(static fn($id) => $people[$id] ?? ['id' => $id, 'name' => '?'], $who))];
}

/** Lire le fichier renvoyé par le cousin : la demande, et chaque remarque reliée à son fait. */
function pfam_review_read(PDO $pdo, array $d): array
{
    pfam_need($pdo);
    $raw = is_string($d['file'] ?? null) ? (string) $d['file'] : '';
    if (strlen($raw) > 600 * 1024) { throw new LcndaBadInput('Ce fichier est trop gros pour un fichier de remarques.'); }
    $j = json_decode($raw, true);
    if (!is_array($j) || ($j['format'] ?? '') !== PFAM_REVIEW_FORMAT) { throw new LcndaBadInput('Ce n’est pas un fichier de remarques de relecture.'); }
    $rv = pfam_review_by_token($pdo, (string) ($j['token'] ?? ''));
    if (!$rv) { throw new RuntimeException('Cette relecture n’est pas dans cette base (ou elle a été supprimée).'); }
    $keys = [];
    foreach ($pdo->query('SELECT id FROM events') as $e) { $keys[pfam_fact_key((string) $rv['secret'], (int) $e['id'])] = (int) $e['id']; }
    $from = pfam_text($j['from'] ?? '', 120);
    $date = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($j['date'] ?? '')) ? (string) $j['date'] : date('Y-m-d');
    $done = [];
    $q = $pdo->prepare('SELECT fact_key, verdict, comment FROM family_review_items WHERE review_id=?'); $q->execute([(int) $rv['id']]);
    foreach ($q as $r) { $done[$r['fact_key'] . '|' . $r['verdict'] . '|' . $r['comment']] = true; }
    $answers = []; $unknown = 0; $already = 0;
    foreach (array_slice(is_array($j['answers'] ?? null) ? $j['answers'] : [], 0, 5000) as $a) {
        if (!is_array($a)) { continue; }
        $k = (string) ($a['r'] ?? ''); $v = ($a['v'] ?? '') === 'wrong' ? 'wrong' : (($a['v'] ?? '') === 'ok' ? 'ok' : '');
        $c = pfam_text($a['c'] ?? '', 4000);
        if ($v === '' && $c === '') { continue; }
        if ($v === '') { $v = 'wrong'; } // un mot sans case cochée : une remarque, à lire
        $eid = $keys[$k] ?? 0;
        if (!$eid) { $unknown++; continue; }
        if (isset($done[$k . '|' . $v . '|' . $c])) { $already++; continue; }
        $ev = pfam_event_view($pdo, $eid);
        if (!$ev) { $unknown++; continue; }
        $answers[] = ['r' => $k, 'v' => $v, 'c' => $c, 'fact' => $ev];
    }
    return ['review' => pfam_review_out($pdo, $rv), 'from' => $from, 'date' => $date, 'answers' => $answers, 'unknown' => $unknown, 'already' => $already];
}

function pfam_review_out(PDO $pdo, array $r): array
{
    $c = $pdo->prepare("SELECT count(*) AS n, sum(decision='') AS pending, sum(verdict='ok' AND decision='accepted') AS ok, sum(verdict='wrong') AS wrong FROM family_review_items WHERE review_id=?");
    $c->execute([(int) $r['id']]); $n = $c->fetch(PDO::FETCH_ASSOC) ?: [];
    return ['id' => (int) $r['id'], 'token' => (string) $r['token'], 'title' => (string) $r['title'], 'recipient' => (string) $r['recipient'], 'status' => (string) $r['status'], 'from' => (string) $r['from_name'],
        'answered_at' => (string) $r['answered_at'], 'created_at' => (string) $r['created_at'], 'updated_at' => (string) $r['updated_at'], 'person' => $r['person_id'] ? (pfam_rel_people($pdo, [(int) $r['person_id']])[(int) $r['person_id']] ?? null) : null,
        'counts' => ['items' => (int) ($n['n'] ?? 0), 'pending' => (int) ($n['pending'] ?? 0), 'confirmed' => (int) ($n['ok'] ?? 0), 'wrong' => (int) ($n['wrong'] ?? 0)],
        'can_undo_import' => count(json_decode((string) $r['imports_json'], true) ?: []) > 0];
}

function pfam_reviews(PDO $pdo): array
{
    if (!pfam_ready($pdo)) { return ['reviews' => []]; }
    return ['reviews' => array_map(static fn($r) => pfam_review_out($pdo, $r), $pdo->query("SELECT * FROM family_reviews WHERE deleted_at='' ORDER BY updated_at DESC, id DESC LIMIT 500")->fetchAll(PDO::FETCH_ASSOC))];
}

function pfam_review_row(PDO $pdo, int $id, bool $deleted = false): array
{
    pfam_need($pdo);
    $s = $pdo->prepare('SELECT * FROM family_reviews WHERE id=?' . ($deleted ? '' : " AND deleted_at=''")); $s->execute([$id]);
    $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { throw new RuntimeException('Relecture introuvable.'); }
    return $r;
}

/** ✓ Accepter une remarque : « d'accord » → un témoignage sur la fiche ; « faux » → une note sur le fait et « doute ». */
function pfam_item_accept(PDO $pdo, array $it, string $from, string $title, string $date): array
{
    $ev = pfam_event_view($pdo, (int) $it['event_id']);
    if (!$ev) { throw new RuntimeException('Ce fait n’existe plus.'); }
    $who = $from !== '' ? $from : i18n_t('ton cousin');
    $fact = trim($ev['label'] . ($ev['date'] !== '' ? ' ' . $ev['date'] : '') . ($ev['place'] !== '' ? ', ' . $ev['place'] : ''));
    $made = [];
    if ($it['verdict'] === 'ok') {
        $content = i18n_t('{who} confirme : {fact}.', ['who' => $who, 'fact' => $fact]) . ($it['comment'] !== '' ? "\n« " . $it['comment'] . ' »' : '');
        $pdo->prepare("INSERT INTO family_memories(kind, title, content, origin_text, notes) VALUES('testimony',?,?,?,?)")
            ->execute([mb_substr(i18n_t('Confirmé par {who} : {fact}', ['who' => $who, 'fact' => $fact]), 0, 160), $content, i18n_t('{who}, relecture « {title} », le {date}', ['who' => $who, 'title' => $title, 'date' => $date]), i18n_t('Relecture d’une branche')]);
        $mid = (int) $pdo->lastInsertId();
        foreach (array_column($ev['people'], 'id') as $pid) { $pdo->prepare("INSERT OR IGNORE INTO family_memory_people(memory_id, person_id, role) VALUES(?,?,'about')")->execute([$mid, (int) $pid]); }
        log_change($pdo, 'family_memory', $mid, 'create', 'Témoignage ajouté : ' . $fact);
        $made['memory_id'] = $mid;
    } else {
        $body = i18n_t('{who} pense que c’est faux.', ['who' => $who]) . ($it['comment'] !== '' ? ' « ' . $it['comment'] . ' »' : '') . ' — ' . i18n_t('relecture « {title} », le {date}', ['title' => $title, 'date' => $date]);
        $pdo->prepare("INSERT INTO notes(entity_type, entity_id, title, body, created_at, updated_at) VALUES('event',?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)")->execute([(int) $it['event_id'], mb_substr(i18n_t('💬 Remarque de {who}', ['who' => $who]), 0, 160), $body]);
        $made['note_id'] = (int) $pdo->lastInsertId();
        $made['prev_confidence'] = $ev['confidence'];
        if ($ev['confidence'] !== 'doubt') { $pdo->prepare("UPDATE events SET fact_confidence='doubt', updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([(int) $it['event_id']]); }
        log_change($pdo, 'event', (int) $it['event_id'], 'update', 'Remarque de relecture notée : ' . $fact);
    }
    return $made;
}

/** Défaire ce qu'une décision a créé. */
function pfam_item_unmake(PDO $pdo, array $made, int $eventId): void
{
    if (!empty($made['memory_id'])) { $c = $pdo->prepare('SELECT 1 FROM family_memories WHERE id=?'); $c->execute([(int) $made['memory_id']]); if ($c->fetchColumn()) { delete_family_memory($pdo, ['id' => (int) $made['memory_id']]); } }
    if (!empty($made['note_id'])) { $pdo->prepare('DELETE FROM notes WHERE id=?')->execute([(int) $made['note_id']]); }
    if (isset($made['prev_confidence']) && $eventId) { $pdo->prepare('UPDATE events SET fact_confidence=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([in_array($made['prev_confidence'], ['certain', 'deduced', 'estimated', 'doubt', 'unknown'], true) ? $made['prev_confidence'] : 'unknown', $eventId]); }
}

function pfam_review_refresh_status(PDO $pdo, int $id): void
{
    $c = $pdo->prepare("SELECT count(*) AS n, sum(decision='') AS p FROM family_review_items WHERE review_id=?"); $c->execute([$id]); $n = $c->fetch(PDO::FETCH_ASSOC);
    $st = (int) $n['n'] === 0 ? 'sent' : ((int) $n['p'] === 0 ? 'filed' : 'answered');
    $pdo->prepare('UPDATE family_reviews SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$st, $id]);
}

/** ⤒ Importer : chaque remarque est gardée ; ✓ / ✕ appliqués tout de suite, « plus tard » reste sur le fait (pastille 💬). */
function pfam_review_import(PDO $pdo, array $d): array
{
    $r = pfam_review_read($pdo, $d);
    $rv = pfam_review_row($pdo, $r['review']['id']);
    $choices = [];
    foreach (is_array($d['choices'] ?? null) ? $d['choices'] : [] as $c) { if (is_array($c) && is_string($c['r'] ?? null)) { $choices[$c['r']] = in_array($c['decision'] ?? '', ['accept', 'refuse', 'later'], true) ? $c['decision'] : 'later'; } }
    $imports = json_decode((string) $rv['imports_json'], true) ?: [];
    $no = count($imports) + 1;
    $counts = ['accepted' => 0, 'refused' => 0, 'later' => 0, 'confirmed' => 0, 'noted' => 0];
    $ins = $pdo->prepare('INSERT INTO family_review_items(review_id, fact_key, event_id, person_id, verdict, comment, reviewer, decision, made_json, import_no, decided_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
    foreach ($r['answers'] as $a) {
        $dec = $choices[$a['r']] ?? ($a['v'] === 'ok' ? 'accept' : 'later');
        $it = ['event_id' => $a['fact']['event_id'], 'verdict' => $a['v'], 'comment' => $a['c']];
        $made = $dec === 'accept' ? pfam_item_accept($pdo, $it, $r['from'], (string) $rv['title'], $r['date']) : [];
        $decision = $dec === 'accept' ? 'accepted' : ($dec === 'refuse' ? 'refused' : '');
        $ins->execute([(int) $rv['id'], $a['r'], $a['fact']['event_id'], $a['fact']['person_id'] ?: null, $a['v'], $a['c'], $r['from'], $decision, json_encode($made) ?: '{}', $no, $decision !== '' ? date('Y-m-d H:i:s') : '']);
        $counts[$dec === 'accept' ? 'accepted' : ($dec === 'refuse' ? 'refused' : 'later')]++;
        if ($dec === 'accept') { $counts[$a['v'] === 'ok' ? 'confirmed' : 'noted']++; }
    }
    $imports[] = ['no' => $no, 'at' => date('c'), 'prev_status' => $rv['status'], 'prev_from' => $rv['from_name'], 'prev_at' => $rv['answered_at']];
    $pdo->prepare('UPDATE family_reviews SET from_name=?, answered_at=?, imports_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$r['from'], $r['date'], json_encode(array_slice($imports, -20)), (int) $rv['id']]);
    pfam_review_refresh_status($pdo, (int) $rv['id']);
    log_change($pdo, 'meta', 0, 'update', 'Remarques de relecture importées : ' . $rv['title']);
    return ['ok' => true, 'id' => (int) $rv['id'], 'counts' => $counts, 'from' => $r['from']];
}

/** ↶ Annuler le dernier import : remarques retirées, témoignages et notes défaits, fiabilité des faits remise. */
function pfam_review_undo_import(PDO $pdo, array $d): array
{
    $rv = pfam_review_row($pdo, safe_int($d['id'] ?? 0));
    $imports = json_decode((string) $rv['imports_json'], true) ?: [];
    $last = array_pop($imports);
    if (!$last) { throw new RuntimeException('Rien à annuler.'); }
    $q = $pdo->prepare('SELECT * FROM family_review_items WHERE review_id=? AND import_no=?'); $q->execute([(int) $rv['id'], (int) $last['no']]);
    $n = 0;
    foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $it) { pfam_item_unmake($pdo, json_decode((string) $it['made_json'], true) ?: [], (int) $it['event_id']); $n++; }
    $pdo->prepare('DELETE FROM family_review_items WHERE review_id=? AND import_no=?')->execute([(int) $rv['id'], (int) $last['no']]);
    $pdo->prepare('UPDATE family_reviews SET status=?, from_name=?, answered_at=?, imports_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
        ->execute([in_array($last['prev_status'] ?? '', ['sent', 'answered', 'filed'], true) ? $last['prev_status'] : 'sent', (string) ($last['prev_from'] ?? ''), (string) ($last['prev_at'] ?? ''), json_encode($imports), (int) $rv['id']]);
    log_change($pdo, 'meta', 0, 'update', 'Import des remarques annulé : ' . $rv['title']);
    return ['ok' => true, 'removed' => $n];
}

function pfam_item_row(PDO $pdo, int $id): array
{
    pfam_need($pdo);
    $s = $pdo->prepare('SELECT i.*, r.title AS review_title, r.answered_at FROM family_review_items i JOIN family_reviews r ON r.id=i.review_id WHERE i.id=?'); $s->execute([$id]);
    $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { throw new RuntimeException('Remarque introuvable.'); }
    return $r;
}

/** Une remarque gardée « plus tard » (pastille 💬 de la fiche) : ✓ Accepter ou ✕ Refuser ; « ↶ Annuler » la remet en attente. */
function pfam_review_decide(PDO $pdo, array $d, bool $undo = false): array
{
    $it = pfam_item_row($pdo, safe_int($d['item_id'] ?? 0));
    if ($undo) {
        pfam_item_unmake($pdo, json_decode((string) $it['made_json'], true) ?: [], (int) $it['event_id']);
        $pdo->prepare("UPDATE family_review_items SET decision='', made_json='{}', decided_at='' WHERE id=?")->execute([(int) $it['id']]);
    } else {
        if ($it['decision'] !== '') { throw new RuntimeException('Cette remarque est déjà rangée.'); }
        $dec = ($d['decision'] ?? '') === 'refuse' ? 'refused' : 'accepted';
        $made = $dec === 'accepted' ? pfam_item_accept($pdo, ['event_id' => (int) $it['event_id'], 'verdict' => $it['verdict'], 'comment' => (string) $it['comment']], (string) $it['reviewer'], (string) $it['review_title'], substr((string) $it['answered_at'], 0, 10) ?: date('Y-m-d')) : [];
        $pdo->prepare('UPDATE family_review_items SET decision=?, made_json=?, decided_at=? WHERE id=?')->execute([$dec, json_encode($made) ?: '{}', date('Y-m-d H:i:s'), (int) $it['id']]);
    }
    pfam_review_refresh_status($pdo, (int) $it['review_id']);
    return ['ok' => true, 'item_id' => (int) $it['id']];
}

/** Les remarques en attente sur les faits d'une fiche (et de ses couples). */
function pfam_review_pending(PDO $pdo, int $pid): array
{
    if (!pfam_ready($pdo) || $pid <= 0) { return ['items' => []]; }
    $s = $pdo->prepare("SELECT i.id, i.event_id, i.verdict, i.comment, i.reviewer, r.title, r.answered_at FROM family_review_items i JOIN family_reviews r ON r.id=i.review_id AND r.deleted_at=''
        JOIN events e ON e.id=i.event_id LEFT JOIN families f ON f.id=e.family_id WHERE i.decision='' AND (e.person_id=? OR f.partner1_id=? OR f.partner2_id=?) ORDER BY i.id");
    $s->execute([$pid, $pid, $pid]);
    return ['items' => array_map(static fn($r) => ['id' => (int) $r['id'], 'event_id' => (int) $r['event_id'], 'verdict' => (string) $r['verdict'], 'comment' => (string) $r['comment'], 'from' => (string) $r['reviewer'], 'review' => (string) $r['title'], 'date' => substr((string) $r['answered_at'], 0, 10)], $s->fetchAll(PDO::FETCH_ASSOC))];
}

function pfam_review_delete(PDO $pdo, array $d, bool $restore = false): array
{
    $rv = pfam_review_row($pdo, safe_int($d['id'] ?? 0), true);
    $pdo->prepare('UPDATE family_reviews SET deleted_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$restore ? '' : date('Y-m-d H:i:s'), (int) $rv['id']]);
    return ['ok' => true, 'id' => (int) $rv['id']];
}

function pfam_review_status(PDO $pdo, array $d): array
{
    $rv = pfam_review_row($pdo, safe_int($d['id'] ?? 0));
    $st = in_array($d['status'] ?? '', ['sent', 'answered', 'filed'], true) ? (string) $d['status'] : 'sent';
    $pdo->prepare('UPDATE family_reviews SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$st, (int) $rv['id']]);
    return ['ok' => true, 'prev' => (string) $rv['status']];
}

/* ═════════════════════════ 12. 🌐 Traduire un acte latin (niveau 2) ═════════════════════════ */

function pfam_translate_prompt(string $text): string
{
    return "Tu es paléographe et latiniste. Traduis en français simple et fidèle cet acte d'un registre paroissial écrit en latin.\n"
        . "- Garde les noms de personnes et de lieux tels qu'ils sont écrits (tu peux donner le prénom français entre parenthèses).\n"
        . "- Écris les dates en toutes lettres comme dans l'acte, puis entre parenthèses en chiffres (ex. « le quatorzième jour du mois de mars (14 mars 1752) »).\n"
        . "- N'invente rien : écris [?] après un mot que tu n'es pas sûr de comprendre, [illisible] pour un passage marqué illisible.\n"
        . "- Réponds seulement par la traduction, sans commentaire.\n\nL'acte :\n" . $text;
}

/** Le texte transcrit, envoyé au modèle déjà installé de la lecture approfondie (Ollama, 127.0.0.1 seulement). */
function pfam_translate_start(array $d): array
{
    if (!function_exists('tx_deep_status')) { require_once __DIR__ . '/transcription_actes.php'; }
    $text = pfam_text($d['text'] ?? '', 20000);
    if (mb_strlen($text) < 3) { throw new LcndaBadInput('Il n’y a pas encore de texte à traduire.'); }
    $st = tx_deep_status();
    if (!$st['running']) { throw new LcndaBadInput('Ollama ne répond pas sur cet ordinateur : installe-le (ollama.com), lance-le, puis réessaie.'); }
    $present = array_values(array_filter($st['models'], static fn($x) => $x['present']));
    $want = pfam_text($d['model'] ?? '', 60);
    $m = null; foreach ($present as $x) { if ($x['tag'] === $want) { $m = $x; } }
    $m = $m ?? ($present[0] ?? null);
    if (!$m) { throw new LcndaBadInput('Le modèle de la lecture approfondie n’est pas encore téléchargé : « ⤓ Installer la lecture approfondie ».'); }
    [$id, $dir] = tx_deep_new_job([]);
    file_put_contents($dir . '/job.json', json_encode(['kind' => 'translate', 'model' => $m['tag'], 'base' => tx_deep_base(), 'prompt' => pfam_translate_prompt($text), 'created' => time()], JSON_UNESCAPED_UNICODE));
    file_put_contents($dir . '/result.json', json_encode(['state' => 'running', 'updated' => time(), 'text' => '']));
    htr_spawn_php([APP_ROOT . '/scripts/tx_deep_job.php', $dir, APP_ROOT], $dir . '/run.log');
    return ['id' => $id, 'model' => $m['tag']];
}

/* ═════════════════════════ api.php ═════════════════════════ */

function pfam_dispatch(PDO $pdo, string $action, bool $isWrite, array $payload): never
{
    try {
        if (!$isWrite && $action === 'pfam') {
            $op = scalar_text($_GET['op'] ?? '', 'op');
            json_response(match ($op) {
                'rel_person' => pfam_rel_person($pdo, safe_int($_GET['id'] ?? 0)),
                'rel_scores' => pfam_rel_scores($pdo, scalar_text($_GET['ids'] ?? '', 'ids')),
                'rel_summary', 'rel_export_check' => pfam_rel_summary($pdo, safe_int($_GET['limit'] ?? 5) ?: 5),
                'letter_data' => pfam_letter_data($pdo, scalar_text($_GET['month'] ?? '', 'month')),
                'letters' => pfam_letters($pdo),
                'letter' => ['letter' => pfam_letter_view(pfam_letter_row($pdo, safe_int($_GET['id'] ?? 0)))],
                'reviews' => pfam_reviews($pdo),
                'review_pending' => pfam_review_pending($pdo, safe_int($_GET['person_id'] ?? 0)),
                default => throw new LcndaBadInput('Demande inconnue.'),
            });
        }
        if ($isWrite && $action === 'pfam_write') {
            $op = scalar_text($payload['op'] ?? '', 'op');
            if ($op === 'review_analyze') { json_response(pfam_review_read($pdo, $payload)); } // lecture seule
            if ($op === 'translate_start') { json_response(['ok' => true, 'result' => pfam_translate_start($payload)]); } // rien n'est écrit dans la base
            $pdo->beginTransaction();
            try {
                $out = match ($op) {
                    'letter_save' => pfam_letter_save($pdo, $payload),
                    'letter_delete' => pfam_letter_delete($pdo, $payload),
                    'letter_restore' => pfam_letter_delete($pdo, $payload, true),
                    'review_new' => pfam_review_new($pdo, $payload),
                    'review_import' => pfam_review_import($pdo, $payload),
                    'review_undo_import' => pfam_review_undo_import($pdo, $payload),
                    'review_decide' => pfam_review_decide($pdo, $payload),
                    'review_undecide' => pfam_review_decide($pdo, $payload, true),
                    'review_delete' => pfam_review_delete($pdo, $payload),
                    'review_restore' => pfam_review_delete($pdo, $payload, true),
                    'review_status' => pfam_review_status($pdo, $payload),
                    default => throw new LcndaBadInput('Demande inconnue.'),
                };
                $pdo->commit();
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) { $pdo->rollBack(); }
                throw $e;
            }
            json_response($out);
        }
        json_response(['error' => 'Action inconnue.'], 400);
    } catch (LcndaBadInput $e) {
        json_response(['error' => $e->getMessage()], 422);
    } catch (RuntimeException $e) {
        json_response(['error' => $e->getMessage()], str_contains($e->getMessage(), 'introuvable') ? 404 : 422);
    }
}
