<?php
declare(strict_types=1);

/**
 * ✅ Contrôle de la base (F3, design A validé le 21/10/2026) : UNE seule liste qui réunit les anciens écrans
 * « Incohérences avancées » (compute_issues, date_check_issues), « Âges et écarts » (age_checks), « Fusion de doublons »
 * (la liste), « Lieux mal placés » (suspicious_places) et « Voyages impossibles » (impossible_journeys).
 *
 * - Un problème = une ligne : chaque contrôle est écrit une seule fois ici, avec un seul seuil (réglable, « ⚙️ Seuils du
 *   contrôle »), et la ligne cite toutes les fiches touchées (l'enfant ET le parent). Les clés des anciens écrans sont
 *   gardées (old-parent:…, child-after-parent-death:…, young-marriage:…) : une exception déjà gardée reste valable.
 * - Sortes : dates, ages, parents, doublons, lieux ; gravités : red 🔴 impossible, orange 🟠 à vérifier, yellow 🟡 curieux.
 * - Exceptions (« Ce n'est pas une erreur ») : table dismissed_issues pour toutes les sortes (raison, note, empreinte des
 *   dates). Si une des dates en cause change, l'alerte revient toute seule (« Dates changées »).
 * - Rapide sur 5 000 fiches : une seule lecture de la base, et le résultat est gardé dans DATA_DIR/cache/controle.json
 *   tant que rien n'a changé (signature : nombres et dernières modifications des fiches, événements, familles, lieux).
 * - Lecture seule, sauf les corrections (controle_fix_date) et les exceptions.
 *
 * Le contrôle « commune qui n'existait pas encore à cette date » n'est pas fait : geo-fr.sqlite n'a que les communes
 * d'aujourd'hui, sans dates de création ni de fusion (il faudrait l'historique INSEE / Cassini comme nouveau référentiel).
 */

const CONTROLE_VERSION = 3; // à monter quand un contrôle change : le cache est refait
const CONTROLE_SORTS = ['dates', 'ages', 'parents', 'doublons', 'lieux'];
const CONTROLE_LEVELS = ['red', 'orange', 'yellow'];

/** Seuils : [valeur de départ, min, max, pas] */
const CONTROLE_SEUILS = [
    'mother_warn' => [50, 40, 60, 1],
    'mother_max' => [55, 45, 70, 1],
    'father_warn' => [75, 55, 90, 1],
    'father_max' => [85, 60, 100, 1],
    'parent_min' => [15, 10, 20, 1],
    'marriage_min' => [14, 10, 20, 1],
    'marriage_old' => [75, 50, 100, 1],
    'longevity' => [105, 90, 120, 1],
    'longevity_max' => [115, 100, 130, 1],
    'father_death_days' => [300, 270, 400, 5],
    'birth_gap_months' => [8.5, 5, 12, 0.5],
    'sibling_span' => [25, 15, 40, 1],
    'baptism_km' => [20, 2, 200, 1],
    'baptism_days' => [90, 15, 365, 5],
    'burial_days' => [15, 3, 90, 1],
    'dup_min' => [60, 40, 95, 5],
];

function controle_seuils(PDO $pdo): array
{
    $saved = function_exists('ht_setting') ? ht_setting($pdo, 'lcnda-controle-seuils', []) : [];
    $out = [];
    foreach (CONTROLE_SEUILS as $k => [$def, $min, $max, $step]) {
        $v = isset($saved[$k]) && is_numeric($saved[$k]) ? (float) $saved[$k] : (float) $def;
        $out[$k] = max($min, min($max, $v));
    }
    // un seuil « à vérifier » ne passe jamais au-dessus du seuil « impossible »
    $out['mother_warn'] = min($out['mother_warn'], $out['mother_max']);
    $out['father_warn'] = min($out['father_warn'], $out['father_max']);
    $out['longevity'] = min($out['longevity'], $out['longevity_max']);
    $out['banner'] = in_array($saved['banner'] ?? '', ['all', 'red', 'never'], true) ? $saved['banner'] : 'all';
    return $out;
}

function controle_seuils_save(PDO $pdo, array $data): array
{
    $vals = $data['values'] ?? $data;
    if (is_string($vals)) { $vals = json_decode($vals, true) ?: []; }
    if (!is_array($vals)) { throw new RuntimeException('Réglages illisibles.'); }
    $cur = controle_seuils($pdo); $new = [];
    foreach (CONTROLE_SEUILS as $k => [$def, $min, $max, $step]) {
        $v = array_key_exists($k, $vals) && is_numeric($vals[$k]) ? (float) $vals[$k] : (float) $cur[$k];
        $v = max($min, min($max, round($v / $step) * $step));
        $new[$k] = $v == (int) $v ? (int) $v : $v;
    }
    $new['banner'] = in_array($vals['banner'] ?? $cur['banner'], ['all', 'red', 'never'], true) ? ($vals['banner'] ?? $cur['banner']) : 'all';
    ht_save_setting($pdo, 'lcnda-controle-seuils', $new);
    return ['values' => controle_seuils($pdo)];
}

/** Jour julien (calendrier grégorien proleptique) : pour compter les jours entre deux dates exactes, même avant 1900. */
function controle_jd(int $y, int $m, int $d): int
{
    $y -= $m <= 2 ? 1 : 0;
    $era = intdiv($y >= 0 ? $y : $y - 399, 400);
    $yoe = $y - $era * 400;
    $doy = intdiv(153 * ($m + ($m > 2 ? -3 : 9)) + 2, 5) + $d - 1;
    $doe = $yoe * 365 + intdiv($yoe, 4) - intdiv($yoe, 100) + $doy;
    return $era * 146097 + $doe - 719468;
}

/** Une date d'événement : année, jour julien si la date est exacte, texte tel qu'écrit. */
function controle_date(array $r): ?array
{
    $text = trim((string) ($r['date_text'] ?? ''));
    $cal = (string) ($r['date_calendar'] ?? '');
    $iso = ($cal === '' || $cal === 'gregorian' || $cal === 'julian') && $text !== '' && function_exists('exact_date') ? exact_date($text) : null;
    $year = $r['year'] !== null && $r['year'] !== '' ? (int) $r['year'] : null;
    $jd = null;
    if ($iso) { [$y, $m, $d] = array_map('intval', explode('-', $iso)); $jd = controle_jd($y, $m, $d); $year ??= $y; }
    if ($year === null) { return null; }
    return ['y' => $year, 'j' => $jd, 't' => $text !== '' ? $text : (string) $year, 'e' => (int) $r['id'], 'pl' => $r['place_id'] ? (int) $r['place_id'] : 0];
}

/** Écart en jours de a à b (exact si les deux dates le sont), sinon en années × 365,25. */
function controle_gap(array $a, array $b): array
{
    if ($a['j'] !== null && $b['j'] !== null) { return ['days' => $b['j'] - $a['j'], 'exact' => true]; }
    return ['days' => ($b['y'] - $a['y']) * 365.25, 'exact' => false];
}

function controle_years(array $a, array $b): float { return controle_gap($a, $b)['days'] / 365.25; }

function controle_span_text(float $days): string
{
    $days = abs($days);
    if ($days < 60) { return (int) round($days) . ' jour' . (round($days) > 1 ? 's' : ''); }
    if ($days < 730) { return (int) floor($days / 30.44) . ' mois'; }
    $y = (int) floor($days / 365.25); return $y . ' an' . ($y > 1 ? 's' : '');
}

/** Signature de ce qui sert au contrôle : si elle ne bouge pas, le résultat gardé est encore bon. */
function controle_signature(PDO $pdo, array $th): string
{
    $row = $pdo->query("SELECT
        (SELECT count(*)||'.'||COALESCE(max(id),0)||'.'||COALESCE(max(updated_at),'') FROM persons),
        (SELECT count(*)||'.'||COALESCE(max(id),0)||'.'||COALESCE(max(updated_at),'')||'.'||COALESCE(total(year),0) FROM events),
        (SELECT count(*)||'.'||COALESCE(max(id),0)||'.'||COALESCE(total(COALESCE(partner1_id,0)*3+COALESCE(partner2_id,0)),0) FROM families),
        (SELECT count(*)||'.'||COALESCE(total(family_id*7+child_id),0) FROM family_children),
        (SELECT COALESCE(max(id),0) FROM change_log),
        (SELECT COALESCE(max(id),0) FROM persons WHERE is_start=1),
        (SELECT total(COALESCE(latitude,0))+total(COALESCE(longitude,0)) FROM places WHERE id IN (SELECT place_id FROM events WHERE place_id IS NOT NULL))")->fetch(PDO::FETCH_NUM);
    unset($th['banner']);
    return md5(json_encode([$row, $th, CONTROLE_VERSION]));
}

function controle_cache_file(): string { return DATA_DIR . '/cache/controle.json'; }

/** Le contrôle complet (sans les exceptions), gardé tant que la base ne change pas. */
function controle_run(PDO $pdo, bool $fresh = false): array
{
    static $memo = null;
    if (!$fresh && $memo) { return $memo; }
    $th = controle_seuils($pdo);
    $sig = controle_signature($pdo, $th);
    $file = controle_cache_file();
    if (!$fresh && is_file($file)) {
        $c = json_decode((string) @file_get_contents($file), true);
        if (is_array($c) && ($c['sig'] ?? '') === $sig) { return $memo = $c; }
    }
    $t0 = microtime(true);
    $res = controle_compute($pdo, $th);
    $res['sig'] = $sig;
    $res['checked_at'] = gmdate('Y-m-d H:i:s');
    $res['ms'] = (int) round((microtime(true) - $t0) * 1000);
    $dir = dirname($file);
    if (is_dir($dir) || @mkdir($dir, 0775, true)) {
        $tmp = $file . '.' . bin2hex(random_bytes(4)) . '.tmp';
        if (@file_put_contents($tmp, json_encode($res, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) !== false) { @rename($tmp, $file); } else { @unlink($tmp); }
    }
    return $memo = $res;
}

/** Tous les contrôles, une seule lecture de la base. */
function controle_compute(PDO $pdo, array $th): array
{
    $hasKind = (bool) $pdo->query("SELECT 1 FROM pragma_table_info('persons') WHERE name='kind'")->fetchColumn();
    $P = [];
    foreach ($pdo->query('SELECT id, first_name, last_name, gender' . ($hasKind ? ", COALESCE(kind,'') AS kind" : ", '' AS kind") . ' FROM persons') as $r) {
        if ($r['kind'] === 'animal') { continue; }
        $P[(int) $r['id']] = ['fn' => (string) $r['first_name'], 'ln' => (string) $r['last_name'], 'g' => (string) $r['gender'], 'b' => null, 'bapt' => null, 'd' => null, 'buri' => null, 'bs' => [], 'ds' => [], 'bpl' => [], 'dpl' => []];
    }
    $name = static function (int $id) use (&$P): string {
        $p = $P[$id] ?? null; if (!$p) { return 'Personne #' . $id; }
        $n = trim($p['fn'] . ' ' . mb_strtoupper($p['ln'])); return $n !== '' ? $n : 'Personne sans nom';
    };
    $first = static function (int $id) use (&$P, $name): string { $f = trim(explode(' ', trim($P[$id]['fn'] ?? ''))[0] ?? ''); return $f !== '' ? $f : $name($id); };
    $g = static fn(int $id, string $m, string $f, string $x) => ($P[$id]['g'] ?? '') === 'male' ? $m : (($P[$id]['g'] ?? '') === 'female' ? $f : $x);

    // ── événements : une lecture ──
    $lifeTags = ['CHR', 'BAPM', 'CONF', 'FCOM', 'BARM', 'BASM', 'BLES', 'ADOP', 'GRAD', 'EDUC', 'OCCU', 'RETI', 'EMIG', 'IMMI', 'NATU', 'CENS', 'RESI', 'ORDN'];
    $famEv = []; $lifeEv = []; $allDated = [];
    $evRows = $pdo->query("SELECT e.id, e.person_id, e.family_id, e.date_text, e.date_calendar, e.year, e.place_id, t.gedcom_tag AS tag, t.label
        FROM events e JOIN event_types t ON t.id=e.event_type_id")->fetchAll();
    foreach ($evRows as $r) {
        $tag = (string) $r['tag']; $pid = (int) $r['person_id']; $fid = (int) $r['family_id'];
        if (preg_match('/\d/', (string) $r['date_text'])) { $allDated[] = $r; }
        $d = controle_date($r);
        if ($pid && isset($P[$pid])) {
            if ($tag === 'BIRT') { if ($d) { $P[$pid]['bs'][$d['y']] = $d; } if ($r['place_id']) { $P[$pid]['bpl'][(int) $r['place_id']] = true; } if ($d && (!$P[$pid]['b'] || $d['e'] < $P[$pid]['b']['e'])) { $P[$pid]['b'] = $d; } elseif (!$d && $r['place_id'] && !$P[$pid]['b']) { /* lieu seul */ } }
            elseif ($tag === 'DEAT') { if ($d) { $P[$pid]['ds'][$d['y']] = $d; } if ($r['place_id']) { $P[$pid]['dpl'][(int) $r['place_id']] = true; } if ($d && (!$P[$pid]['d'] || $d['e'] < $P[$pid]['d']['e'])) { $P[$pid]['d'] = $d; } }
            elseif ($tag === 'CHR' || $tag === 'BAPM') { if ($d && !$P[$pid]['bapt']) { $P[$pid]['bapt'] = $d + ['label' => $r['label']]; } elseif (!$d && $r['place_id'] && !$P[$pid]['bapt']) { $P[$pid]['bapt_pl'] = (int) $r['place_id']; } }
            elseif ($tag === 'BURI') { if ($d && !$P[$pid]['buri']) { $P[$pid]['buri'] = $d; } }
            if ($d && in_array($tag, $lifeTags, true)) { $lifeEv[] = ['pid' => $pid, 'd' => $d, 'label' => (string) $r['label']]; }
        } elseif ($fid && in_array($tag, ['MARR', 'MRCI', 'MRRE', 'ENGA'], true) && $d) {
            $famEv[$fid][] = $d + ['tag' => $tag, 'label' => (string) $r['label']];
        }
    }
    // naissance pour les âges : l'acte de naissance, sinon le baptême ; décès : sinon l'inhumation
    $birth = static fn(int $id) => $P[$id]['b'] ?? ($P[$id]['bapt'] ?? null);
    $death = static fn(int $id) => $P[$id]['d'] ?? ($P[$id]['buri'] ?? null);

    $families = [];
    foreach ($pdo->query('SELECT id, partner1_id, partner2_id FROM families') as $f) { $families[(int) $f['id']] = [(int) $f['partner1_id'], (int) $f['partner2_id']]; }
    $kids = []; $parentFams = [];
    foreach ($pdo->query('SELECT family_id, child_id FROM family_children') as $c) { $kids[(int) $c['family_id']][] = (int) $c['child_id']; $parentFams[(int) $c['child_id']][] = (int) $c['family_id']; }
    $spouses = [];
    foreach ($families as $fid => [$a, $b]) { if ($a && $b) { $spouses[$a][$b] = $fid; $spouses[$b][$a] = $fid; } }

    $A = [];
    $add = static function (array $a) use (&$A) {
        $a['people'] = array_values(array_unique(array_filter(array_map('intval', $a['people'] ?? []))));
        $A[$a['key']] ??= $a; // un problème = une ligne
    };
    $fpOf = static fn(array ...$ds) => md5(implode('|', array_map(static fn($d) => $d ? ($d['e'] . '=' . $d['t']) : '-', $ds)));
    $dt = static fn(?array $d, string $label, int $pid = 0) => $d ? ['label' => $label, 'text' => $d['t'], 'y' => $d['y'], 'j' => $d['j'], 'event_id' => $d['e'], 'person_id' => $pid] : null;
    $current = (int) date('Y');

    // ═══ 📅 DATES ═══
    // 1. une date qui n'existe pas (31 février, 31 avril, mois 13…), calendrier grégorien ou julien
    foreach ($allDated as $r) {
        $cal = (string) ($r['date_calendar'] ?? '');
        if (!in_array($cal, ['', 'gregorian', 'julian'], true) || !function_exists('date_text_parts')) { continue; }
        $dp = date_text_parts((string) $r['date_text']); if (!$dp) { continue; }
        [$day, $month, $year] = $dp;
        $julian = $cal === 'julian' || $year < 1583;
        $ok = $month >= 1 && $month <= 12 && $day >= 1 && ($julian ? $day <= [31, ($year % 4 === 0 ? 29 : 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][$month - 1] : checkdate($month, $day, max(1, $year)));
        if ($ok) { continue; }
        $pid = (int) $r['person_id']; $people = $pid ? [$pid] : array_filter($families[(int) $r['family_id']] ?? []);
        $add(['key' => "impossible-date:{$r['id']}", 'check' => 'impossible-date', 'sort' => 'dates', 'level' => 'red', 'title' => 'Date qui n’existe pas : « ' . $r['date_text'] . ' »',
            'detail' => $r['label'] . ' le « ' . $r['date_text'] . ' » : ce jour n’existe pas dans le calendrier ' . ($julian ? 'julien' : 'grégorien') . '.', 'people' => $people,
            'dates' => [['label' => (string) $r['label'], 'text' => (string) $r['date_text'], 'y' => (int) $r['year'], 'j' => null, 'event_id' => (int) $r['id'], 'person_id' => $pid ?: (int) ($people[0] ?? 0)]],
            'fix' => ['event_id' => (int) $r['id'], 'person_id' => $pid ?: (int) ($people[0] ?? 0)], 'fp' => md5($r['id'] . '=' . $r['date_text'])]);
    }
    foreach ($P as $id => $p) {
        $b = $p['b']; $d = $p['d'];
        // 2. décès avant la naissance
        if ($b && $d && (($b['j'] !== null && $d['j'] !== null) ? $d['j'] < $b['j'] : $d['y'] < $b['y'])) {
            $add(['key' => "death-before-birth:$id", 'check' => 'death-before-birth', 'sort' => 'dates', 'level' => 'red', 'title' => 'Décès avant la naissance',
                'detail' => "Naissance {$b['t']} · décès {$d['t']}", 'views' => [$id => "Décès ({$d['t']}) avant sa naissance ({$b['t']})"], 'people' => [$id],
                'dates' => [$dt($b, 'naissance', $id), $dt($d, 'décès', $id)], 'fix' => ['event_id' => $d['e'], 'person_id' => $id], 'fp' => $fpOf($b, $d)]);
        } elseif ($b && $d) {
            // 4. longévité
            $life = controle_years($b, $d);
            if ($life > $th['longevity']) {
                $lvl = $life > $th['longevity_max'] ? 'red' : 'orange';
                $add(['key' => "lifespan:$id", 'check' => 'lifespan', 'sort' => 'dates', 'level' => $lvl, 'title' => $g($id, 'Mort', 'Morte', 'Mort(e)') . ' à ' . floor($life) . ' ans',
                    'detail' => "Naissance {$b['t']} · décès {$d['t']} (seuil : " . ($lvl === 'red' ? $th['longevity_max'] : $th['longevity']) . ' ans)', 'people' => [$id],
                    'rule' => 'Très peu de gens dépassent ' . $th['longevity'] . ' ans ; au-delà de ' . $th['longevity_max'] . ' ans, c’est presque toujours une erreur.',
                    'dates' => [$dt($b, 'naissance', $id), $dt($d, 'décès', $id)], 'fix' => ['event_id' => $b['e'], 'person_id' => $id], 'fp' => $fpOf($b, $d)]);
            }
        }
        // 3. naissance dans le futur
        if ($b && $b['y'] > $current) {
            $add(['key' => "future-birth:$id", 'check' => 'future-birth', 'sort' => 'dates', 'level' => 'red', 'title' => 'Naissance dans le futur', 'detail' => "Naissance {$b['t']}", 'people' => [$id],
                'dates' => [$dt($b, 'naissance', $id)], 'fix' => ['event_id' => $b['e'], 'person_id' => $id], 'fp' => $fpOf($b)]);
        }
        // dates de naissance ou de décès contradictoires (deux années différentes)
        foreach (['bs' => ['naissance', 'conflicting-naissance-date'], 'ds' => ['décès', 'conflicting-décès-date']] as $k => [$what, $ck]) {
            if (count($p[$k]) > 1) {
                $ds = array_values($p[$k]);
                $add(['key' => "$ck:$id", 'check' => 'conflicting-date', 'sort' => 'dates', 'level' => 'orange', 'title' => "Dates de $what contradictoires",
                    'detail' => implode(' / ', array_map(static fn($x) => $x['t'], $ds)), 'people' => [$id], 'dates' => array_map(static fn($x) => $dt($x, $what, $id), $ds),
                    'fix' => ['event_id' => $ds[1]['e'], 'person_id' => $id], 'fp' => $fpOf(...$ds)]);
            }
        }
        // inhumation avant le décès, ou bien après (avant 1900)
        $bu = $p['buri'];
        if ($bu && $d) {
            $gap = controle_gap($d, $bu);
            if (($gap['exact'] && $gap['days'] < 0) || (!$gap['exact'] && $bu['y'] < $d['y'])) {
                $add(['key' => "burial-before-death:$id", 'check' => 'burial-before-death', 'sort' => 'dates', 'level' => 'red', 'title' => 'Inhumation avant le décès',
                    'detail' => "Décès {$d['t']} · inhumation {$bu['t']}", 'people' => [$id], 'dates' => [$dt($d, 'décès', $id), $dt($bu, 'inhumation', $id)],
                    'fix' => ['event_id' => $bu['e'], 'person_id' => $id], 'fp' => $fpOf($d, $bu)]);
            } elseif ($gap['exact'] && $d['y'] < 1900 && $gap['days'] > $th['burial_days']) {
                $add(['key' => "burial-late:$id", 'check' => 'burial-late', 'sort' => 'dates', 'level' => 'yellow', 'title' => 'Inhumation ' . controle_span_text($gap['days']) . ' après le décès',
                    'detail' => "Décès {$d['t']} · inhumation {$bu['t']} (seuil : {$th['burial_days']} jours)", 'people' => [$id], 'dates' => [$dt($d, 'décès', $id), $dt($bu, 'inhumation', $id)],
                    'fix' => ['event_id' => $bu['e'], 'person_id' => $id], 'fp' => $fpOf($d, $bu)]);
            }
        }
        // baptême longtemps après la naissance (avant 1900)
        $ba = $p['bapt'];
        if ($ba && $b && $b['j'] !== null && $ba['j'] !== null && $b['y'] < 1900 && $ba['j'] - $b['j'] > $th['baptism_days']) {
            $add(['key' => "baptism-late:$id", 'check' => 'baptism-late', 'sort' => 'dates', 'level' => 'yellow', 'title' => 'Baptême ' . controle_span_text($ba['j'] - $b['j']) . ' après la naissance',
                'detail' => "Naissance {$b['t']} · baptême {$ba['t']} (seuil : {$th['baptism_days']} jours)", 'people' => [$id], 'dates' => [$dt($b, 'naissance', $id), $dt($ba, 'baptême', $id)],
                'fix' => ['event_id' => $ba['e'], 'person_id' => $id], 'fp' => $fpOf($b, $ba)]);
        }
    }
    // 5. un événement de la vie avant la naissance ou après le décès
    foreach ($lifeEv as $x) {
        $id = $x['pid']; $e = $x['d']; $b = $P[$id]['b']; $d = $P[$id]['d'];
        if ($b && (($e['j'] !== null && $b['j'] !== null) ? $e['j'] < $b['j'] : $e['y'] < $b['y'])) {
            $add(['key' => "event-before-birth:{$e['e']}", 'check' => 'event-before-birth', 'sort' => 'dates', 'level' => 'red', 'title' => "{$x['label']} avant la naissance",
                'detail' => "{$x['label']} {$e['t']} · naissance {$b['t']}", 'people' => [$id], 'dates' => [$dt($b, 'naissance', $id), $dt($e, mb_strtolower($x['label']), $id)],
                'fix' => ['event_id' => $e['e'], 'person_id' => $id], 'fp' => $fpOf($b, $e)]);
        }
        if ($d && (($e['j'] !== null && $d['j'] !== null) ? $e['j'] > $d['j'] : $e['y'] > $d['y'])) {
            $add(['key' => "event-after-death:{$e['e']}", 'check' => 'event-after-death', 'sort' => 'dates', 'level' => 'red', 'title' => "{$x['label']} après le décès",
                'detail' => "{$x['label']} {$e['t']} · décès {$d['t']}", 'people' => [$id], 'dates' => [$dt($d, 'décès', $id), $dt($e, mb_strtolower($x['label']), $id)],
                'fix' => ['event_id' => $e['e'], 'person_id' => $id], 'fp' => $fpOf($d, $e)]);
        }
    }

    // ═══ mariages : 📅 après le décès, avant la naissance ; 🎂 trop jeune, très tard ═══
    $marr = [];
    foreach ($famEv as $fid => $list) {
        foreach ($list as $m) {
            if ($m['tag'] !== 'ENGA' && (!isset($marr[$fid]) || $m['e'] < $marr[$fid]['e'])) { $marr[$fid] = $m; }
            foreach (array_filter($families[$fid] ?? []) as $id) {
                if (!isset($P[$id])) { continue; }
                $d = $P[$id]['d']; $b = $birth($id);
                $isMarr = $m['tag'] !== 'ENGA';
                if ($isMarr && $d && (($m['j'] !== null && $d['j'] !== null) ? $m['j'] > $d['j'] : $m['y'] > $d['y'])) {
                    $add(['key' => "marriage-after-death:$id:{$m['e']}", 'check' => 'marriage-after-death', 'sort' => 'dates', 'level' => 'red', 'title' => $g($id, 'Marié', 'Mariée', 'Marié(e)') . ' après son décès',
                        'detail' => "Mariage {$m['t']} · décès {$d['t']}", 'views' => [$id => $g($id, 'Marié', 'Mariée', 'Marié(e)') . " le {$m['t']}, après sa mort"], 'people' => [$id],
                        'dates' => [$dt($d, 'décès', $id), $dt($m, 'mariage', $id)], 'fix' => ['event_id' => $m['e'], 'person_id' => $id], 'fp' => $fpOf($d, $m)]);
                }
                if (!$b) { continue; }
                $age = controle_years($b, $m);
                if ($age < 0 && (($m['j'] !== null && $b['j'] !== null) || $m['y'] < $b['y'])) {
                    $add(['key' => "young-marriage:$id:{$m['e']}", 'check' => 'marriage-before-birth', 'sort' => 'dates', 'level' => 'red', 'title' => 'Mariage avant la naissance',
                        'detail' => "Mariage {$m['t']} · naissance {$b['t']}", 'people' => [$id], 'dates' => [$dt($m, 'mariage', $id), $dt($b, 'naissance', $id)],
                        'fix' => ['event_id' => $m['e'], 'person_id' => $id], 'fp' => $fpOf($b, $m)]);
                } elseif ($age >= 0 && $age < $th['marriage_min']) {
                    $add(['key' => "young-marriage:$id:{$m['e']}", 'check' => 'young-marriage', 'sort' => 'ages', 'level' => 'red', 'title' => $g($id, 'Marié', 'Mariée', 'Marié(e)') . ' à ' . floor($age) . ' ans',
                        'detail' => "Mariage {$m['t']} · naissance {$b['t']} (seuil : {$th['marriage_min']} ans)", 'people' => [$id], 'rule' => 'Avant ' . $th['marriage_min'] . ' ans, un mariage est presque impossible.',
                        'dates' => [$dt($b, 'naissance', $id), $dt($m, 'mariage', $id)], 'fix' => ['event_id' => $m['e'], 'person_id' => $id], 'fp' => $fpOf($b, $m)]);
                } elseif ($isMarr && $age > $th['marriage_old']) {
                    $add(['key' => "old-marriage:$id:{$m['e']}", 'check' => 'old-marriage', 'sort' => 'ages', 'level' => 'yellow', 'title' => $g($id, 'Marié', 'Mariée', 'Marié(e)') . ' à ' . floor($age) . ' ans',
                        'detail' => "Mariage {$m['t']} · naissance {$b['t']} (seuil : {$th['marriage_old']} ans)", 'people' => [$id],
                        'dates' => [$dt($b, 'naissance', $id), $dt($m, 'mariage', $id)], 'fix' => ['event_id' => $m['e'], 'person_id' => $id], 'fp' => $fpOf($b, $m)]);
                }
            }
        }
    }

    // ═══ 👪 PARENTS et 🎂 âges des parents ═══
    foreach ($kids as $fid => $children) {
        [$p1, $p2] = $families[$fid] ?? [0, 0];
        $parents = array_values(array_filter([$p1, $p2], static fn($x) => $x && isset($P[$x])));
        $list = [];
        foreach ($children as $c) { if (isset($P[$c]) && ($cb = $birth($c))) { $list[] = ['id' => $c, 'b' => $cb]; } }
        usort($list, static fn($x, $y) => ($x['b']['j'] ?? (int) (($x['b']['y'] - 1) * 365.25 + 180)) <=> ($y['b']['j'] ?? (int) (($y['b']['y'] - 1) * 365.25 + 180)));
        foreach ($list as $i => $ch) {
            $c = $ch['id']; $cb = $ch['b']; $cn = $first($c);
            foreach ($parents as $pid) {
                $pg = $P[$pid]['g'];
                $pb = $birth($pid);
                $role = $pg === 'female' ? 'mère' : ($pg === 'male' ? 'père' : 'parent');
                if ($pb) {
                    $age = controle_years($pb, $cb);
                    $cmpAge = $pb['j'] !== null && $cb['j'] !== null ? $age : (float) ($cb['y'] - $pb['y']);
                    if ($cmpAge <= 0) {
                        $add(['key' => "young-parent:$pid:$c", 'check' => 'parent-after-child', 'sort' => 'parents', 'level' => 'red', 'title' => ucfirst($role) . ' né' . ($pg === 'female' ? 'e' : '') . ' après son enfant',
                            'detail' => "Naissance de {$cn} {$cb['t']} · {$role} né" . ($pg === 'female' ? 'e' : '') . " {$pb['t']}", 'people' => [$pid, $c],
                            'views' => [$pid => "Né" . ($pg === 'female' ? 'e' : '') . " après son enfant {$cn} ({$cb['t']})", $c => ($pg === 'female' ? 'Sa mère est née' : ($pg === 'male' ? 'Son père est né' : 'Son parent est né')) . " après sa naissance ({$pb['t']})"],
                            'dates' => [$dt($pb, "naiss. {$first($pid)}", $pid), $dt($cb, "naiss. {$cn}", $c)], 'fix' => ['event_id' => $pb['e'], 'person_id' => $pid], 'fp' => $fpOf($pb, $cb)]);
                    } elseif ($cmpAge < $th['parent_min']) {
                        $add(['key' => "young-parent:$pid:$c", 'check' => 'young-parent', 'sort' => 'ages', 'level' => $cmpAge < 12 ? 'red' : 'orange', 'title' => ucfirst($role) . ' de ' . floor($cmpAge) . ' an' . (floor($cmpAge) > 1 ? 's' : '') . ' à la naissance',
                            'detail' => "Naissance {$cb['t']} · {$role} né" . ($pg === 'female' ? 'e' : '') . " {$pb['t']} (seuil : {$th['parent_min']} ans)", 'people' => [$pid, $c],
                            'views' => [$pid => ucfirst($role) . ' de ' . $cn . ' à ' . floor($cmpAge) . ' ans', $c => ($pg === 'female' ? 'Sa mère' : ($pg === 'male' ? 'Son père' : 'Son parent')) . " n’avait que " . floor($cmpAge) . ' ans à sa naissance'],
                            'dates' => [$dt($pb, "naiss. {$first($pid)}", $pid), $dt($cb, "naiss. {$cn}", $c)], 'fix' => ['event_id' => $pb['e'], 'person_id' => $pid], 'fp' => $fpOf($pb, $cb)]);
                    } elseif ($pg === 'female' && $age >= $th['mother_warn']) {
                        $lvl = $age >= $th['mother_max'] ? 'red' : 'orange';
                        $add(['key' => "old-parent:$pid:$c", 'check' => 'old-mother', 'sort' => 'ages', 'level' => $lvl, 'title' => 'Mère de ' . floor($age) . ' ans à la naissance',
                            'detail' => "Naissance {$cb['t']} · mère née {$pb['t']} (seuil : " . ($lvl === 'red' ? $th['mother_max'] : $th['mother_warn']) . ' ans)', 'people' => [$pid, $c],
                            'views' => [$pid => 'Mère de ' . $cn . ' à ' . floor($age) . ' ans', $c => 'Sa mère avait ' . floor($age) . ' ans à sa naissance'],
                            'rule' => 'Une naissance après ' . $th['mother_max'] . ' ans est presque impossible ; à partir de ' . $th['mother_warn'] . ' ans, c’est à vérifier.',
                            'dates' => [$dt($pb, "naiss. {$first($pid)}", $pid), $dt($cb, "naiss. {$cn}", $c)], 'fix' => ['event_id' => $pb['e'], 'person_id' => $pid], 'fp' => $fpOf($pb, $cb)]);
                    } elseif ($pg === 'male' && $age > $th['father_warn']) {
                        $lvl = $age > $th['father_max'] ? 'red' : 'orange';
                        $add(['key' => "old-parent:$pid:$c", 'check' => 'old-father', 'sort' => 'ages', 'level' => $lvl, 'title' => 'Père de ' . floor($age) . ' ans à la naissance',
                            'detail' => "Naissance {$cb['t']} · père né {$pb['t']} (seuil : " . ($lvl === 'red' ? $th['father_max'] : $th['father_warn']) . ' ans)', 'people' => [$pid, $c],
                            'views' => [$pid => 'Père de ' . $cn . ' à ' . floor($age) . ' ans', $c => 'Son père avait ' . floor($age) . ' ans à sa naissance'],
                            'dates' => [$dt($pb, "naiss. {$first($pid)}", $pid), $dt($cb, "naiss. {$cn}", $c)], 'fix' => ['event_id' => $pb['e'], 'person_id' => $pid], 'fp' => $fpOf($pb, $cb)]);
                    }
                }
                // né après la mort d'un parent (père : 300 jours au plus ; mère : jamais)
                $pd = $P[$pid]['d'] ?? null;
                if ($pd) {
                    $gap = controle_gap($pd, $cb);
                    $late = $pg === 'female'
                        ? ($gap['exact'] ? $gap['days'] > 1 : $cb['y'] > $pd['y'])
                        : ($gap['exact'] ? $gap['days'] > $th['father_death_days'] : $cb['y'] > $pd['y'] + 1);
                    if ($late) {
                        $span = controle_span_text($gap['days']);
                        $born = $g($c, 'Né', 'Née', 'Né(e)');
                        $kid = $g($c, 'Son fils', 'Sa fille', 'Son enfant');
                        $add(['key' => "child-after-parent-death:$pid:$c", 'check' => $pg === 'female' ? 'after-mother-death' : 'after-father-death', 'sort' => 'parents', 'level' => 'red',
                            'title' => $gap['exact'] || $gap['days'] > 730 ? "$born $span après la mort de " . ($pg === 'female' ? 'sa mère' : ($pg === 'male' ? 'son père' : 'son parent')) : "$born après la mort de " . ($pg === 'female' ? 'sa mère' : ($pg === 'male' ? 'son père' : 'son parent')),
                            'detail' => "Naissance {$cb['t']} · décès " . ($pg === 'female' ? 'de la mère' : ($pg === 'male' ? 'du père' : 'du parent')) . " {$pd['t']}" . ($pg !== 'female' ? " (seuil : {$th['father_death_days']} jours)" : ''),
                            'views' => [$pid => "$kid {$cn} naît " . ($gap['days'] > 0 ? "$span après sa mort" : 'après sa mort'), $c => "$born $span après la mort de " . ($pg === 'female' ? 'sa mère' : 'son père')],
                            'rule' => $pg === 'female' ? 'Un enfant ne peut pas naître après la mort de sa mère.' : 'Un enfant naît au plus 9 à 10 mois après la mort du père (seuil : ' . $th['father_death_days'] . ' jours).',
                            'people' => [$c, $pid], 'dates' => [$dt($pb, "naiss. {$first($pid)}", $pid), $dt($pd, "décès {$first($pid)}", $pid), $dt($cb, "naiss. {$cn}", $c)],
                            'fix' => ['event_id' => $pd['e'], 'person_id' => $pid], 'fp' => $fpOf($pd, $cb)]);
                    }
                }
            }
            // naissances trop rapprochées (dates exactes) ; même année (sinon)
            if ($i > 0) {
                $prev = $list[$i - 1]; $pb2 = $prev['b'];
                if ($pb2['j'] !== null && $cb['j'] !== null) {
                    $months = ($cb['j'] - $pb2['j']) / 30.44;
                    if ($months > 0.1 && $months < $th['birth_gap_months']) {
                        $older = $g($prev['id'], 'son frère', 'sa sœur', 'son aîné');
                        $add(['key' => "close-births:{$prev['id']}:$c", 'check' => 'close-births', 'sort' => 'parents', 'level' => 'red', 'title' => 'Seulement ' . str_replace('.', ',', (string) round($months, 1)) . " mois après $older",
                            'detail' => "Naissances {$pb2['t']} et {$cb['t']} (seuil : " . str_replace('.', ',', (string) $th['birth_gap_months']) . ' mois)', 'people' => [$c, $prev['id']],
                            'rule' => 'Deux enfants de la même mère naissent au moins 8 à 9 mois l’un après l’autre (sauf jumeaux).',
                            'dates' => [$dt($pb2, "naiss. {$first($prev['id'])}", $prev['id']), $dt($cb, "naiss. {$cn}", $c)], 'fix' => ['event_id' => $cb['e'], 'person_id' => $c], 'fp' => $fpOf($pb2, $cb)]);
                    }
                } elseif ($pb2['y'] === $cb['y']) {
                    $a1 = min($prev['id'], $c); $a2 = max($prev['id'], $c);
                    $add(['key' => "same-year-siblings:$fid:$a1:$a2", 'check' => 'same-year-siblings', 'sort' => 'parents', 'level' => 'yellow', 'title' => 'Deux enfants la même année',
                        'detail' => "{$name($a1)} et {$name($a2)} : naissance en {$cb['y']} (jumeaux, doublon ou date approximative ?)", 'people' => [$a1, $a2],
                        'dates' => [$dt($pb2, "naiss. {$first($prev['id'])}", $prev['id']), $dt($cb, "naiss. {$cn}", $c)], 'fix' => ['event_id' => $cb['e'], 'person_id' => $c], 'fp' => $fpOf($pb2, $cb)]);
                }
            }
            // né bien avant le mariage des parents (15 ans)
            $m = $marr[$fid] ?? null;
            if ($m && controle_years($cb, $m) > 15) {
                $add(['key' => "before-marriage:$c:$fid", 'check' => 'before-marriage', 'sort' => 'parents', 'level' => 'yellow', 'title' => $g($c, 'Né', 'Née', 'Né(e)') . ' bien avant le mariage des parents',
                    'detail' => "Naissance {$cb['t']} · mariage {$m['t']}", 'people' => array_merge([$c], $parents), 'dates' => [$dt($cb, "naiss. {$cn}", $c), $dt($m, 'mariage', $parents[0] ?? 0)],
                    'fix' => ['event_id' => $m['e'], 'person_id' => $parents[0] ?? $c], 'fp' => $fpOf($cb, $m)]);
            }
        }
        // fratrie étalée (deux générations mélangées ?)
        if (count($list) >= 2) {
            $f0 = $list[0]; $fl = $list[count($list) - 1];
            $span = controle_years($f0['b'], $fl['b']);
            $hasMother = (bool) array_filter($parents, static fn($x) => ($P[$x]['g'] ?? '') === 'female');
            $limit = $th['sibling_span'] + ($hasMother ? 0 : 5);
            if ($span > $limit) {
                $add(['key' => "sibling-span:$fid", 'check' => 'sibling-span', 'sort' => 'parents', 'level' => $span > $limit + 10 ? 'red' : 'orange', 'title' => 'Fratrie étalée sur ' . floor($span) . ' ans',
                    'detail' => "Aîné(e) {$first($f0['id'])} {$f0['b']['t']}, cadet(te) {$first($fl['id'])} {$fl['b']['t']} (seuil : $limit ans) : deux générations mélangées ?", 'people' => [$fl['id'], $f0['id']],
                    'dates' => [$dt($f0['b'], "naiss. {$first($f0['id'])}", $f0['id']), $dt($fl['b'], "naiss. {$first($fl['id'])}", $fl['id'])], 'fix' => ['event_id' => $fl['b']['e'], 'person_id' => $fl['id']], 'fp' => $fpOf($f0['b'], $fl['b'])]);
            }
        }
    }
    // rattaché à plusieurs familles
    foreach ($parentFams as $c => $fams) {
        if (count(array_unique($fams)) > 1 && isset($P[$c])) {
            $add(['key' => "multiple-parent-families:$c", 'check' => 'multiple-parents', 'sort' => 'parents', 'level' => 'orange', 'title' => 'Rattaché' . ($P[$c]['g'] === 'female' ? 'e' : '') . ' à ' . count(array_unique($fams)) . ' familles de parents',
                'detail' => 'Cela peut être voulu (adoption, famille recomposée) ou être une erreur.', 'people' => [$c], 'fp' => md5(implode(',', $fams))]);
        }
    }
    // familles sans conjoint (mais avec des enfants ou des événements)
    foreach ($families as $fid => [$a, $b]) {
        if ($a || $b) { continue; }
        $ch = array_values(array_filter($kids[$fid] ?? [], static fn($x) => isset($P[$x])));
        if (!$ch && empty($famEv[$fid])) { continue; }
        $add(['key' => "ghost-family:$fid", 'check' => 'ghost-family', 'sort' => 'parents', 'level' => 'yellow', 'title' => 'Famille n° ' . $fid . ' sans conjoint',
            'detail' => ($ch ? 'Enfants : ' . implode(', ', array_map($name, array_slice($ch, 0, 4))) . (count($ch) > 4 ? '…' : '') : 'Un mariage, sans les époux') . ' : il manque le père et la mère.', 'people' => $ch, 'fp' => md5(implode(',', $ch))]);
    }

    // ═══ Sosa : sexe et place dans l'arbre ; ancêtre trop jeune ou trop vieux pour sa génération ═══
    $root = (int) $pdo->query('SELECT id FROM persons ORDER BY is_start DESC, id LIMIT 1')->fetchColumn();
    $sosaOf = [];
    if ($root && function_exists('sosa_positions')) {
        $positions = sosa_positions($pdo, $root, 60000)['positions'] ?? [];
        foreach ($positions as $s => $pid) { $s = (int) $s; if (!isset($sosaOf[(int) $pid]) || $s < $sosaOf[(int) $pid]) { $sosaOf[(int) $pid] = $s; } }
        $gen = 0;
        foreach ($positions as $s => $pid) {
            $s = (int) $s; $pid = (int) $pid; if ($s < 2 || !isset($P[$pid])) { continue; }
            $gd = $P[$pid]['g'];
            if (($s % 2 === 0 && $gd === 'female') || ($s % 2 === 1 && $gd === 'male')) {
                $add(['key' => "sosa-sex:$pid", 'check' => 'sosa-sex', 'sort' => 'parents', 'level' => 'orange', 'title' => "Sosa $s noté" . ($gd === 'female' ? 'e femme' : ' homme'),
                    'detail' => 'Un Sosa ' . ($s % 2 === 0 ? 'pair est un père' : 'impair est une mère') . ' : le sexe de la fiche, ou sa place dans l’arbre, est à vérifier.', 'people' => [$pid], 'fp' => md5($gd . $s)]);
            }
            $b = $birth($pid); if (!$b || $s < 4) { continue; }
            $k = 0; $n = $s; $desc = null;
            while ($n > 1) { $n = intdiv($n, 2); $k++; $did = (int) ($positions[$n] ?? 0); if ($did && isset($P[$did]) && ($db = $birth($did))) { $desc = [$n, $did, $db]; break; } }
            if (!$desc || $k < 2) { continue; }
            $gap = controle_years($b, $desc[2]);
            if ($gap < 15 * $k || $gap > 55 * $k) {
                $add(['key' => "sosa-gap:$pid", 'check' => 'sosa-gap', 'sort' => 'ages', 'level' => $gap < 12 * $k || $gap > 65 * $k ? 'red' : 'orange', 'title' => "Sosa $s : " . floor($gap) . " ans pour $k générations",
                    'detail' => "Né(e) {$b['t']}, son descendant Sosa {$desc[0]} {$desc[2]['t']} : " . ($gap < 15 * $k ? 'une génération en trop (homonyme pris pour son père) ?' : 'une génération oubliée ?'), 'people' => [$pid, $desc[1]],
                    'dates' => [$dt($b, "naiss. {$first($pid)}", $pid), $dt($desc[2], "naiss. {$first($desc[1])}", $desc[1])], 'fix' => ['event_id' => $b['e'], 'person_id' => $pid], 'fp' => $fpOf($b, $desc[2])]);
                if (++$gen >= 200) { break; }
            }
        }
    }

    // ═══ 👥 DOUBLONS : nom + début du prénom, puis sexe, parents, conjoints, lieux, années ═══
    $placeRows = [];
    foreach ($pdo->query('SELECT p.id, p.name, p.county, p.country, p.latitude, p.longitude, p.admin4_code FROM places p WHERE p.id IN (SELECT place_id FROM events WHERE place_id IS NOT NULL)') as $r) { $placeRows[(int) $r['id']] = $r; }
    $plDist = static function (int $a, int $b) use ($placeRows): ?float {
        if ($a === $b) { return 0.0; }
        $x = $placeRows[$a] ?? null; $y = $placeRows[$b] ?? null;
        if (!$x || !$y || $x['latitude'] === null || $y['latitude'] === null || ((float) $x['latitude'] == 0.0 && (float) $x['longitude'] == 0.0) || ((float) $y['latitude'] == 0.0 && (float) $y['longitude'] == 0.0)) { return null; }
        return h_distance_km((float) $x['latitude'], (float) $x['longitude'], (float) $y['latitude'], (float) $y['longitude']);
    };
    $groups = [];
    foreach ($P as $id => $p) {
        $ln = trim(preg_replace('/[^a-z]+/', ' ', strtolower(ascii_fold($p['ln'])))); $fn = trim(preg_replace('/[^a-z]+/', ' ', strtolower(ascii_fold($p['fn']))));
        if ($ln === '' || $fn === '') { continue; }
        $P[$id]['lk'] = $ln; $P[$id]['fk'] = $fn;
        $groups[$ln . '|' . substr($fn, 0, 3)][] = $id;
    }
    $parentsOf = static function (int $id) use ($parentFams, $families): array { $out = []; foreach ($parentFams[$id] ?? [] as $f) { foreach ($families[$f] ?? [] as $x) { if ($x) { $out[$x] = true; } } } return $out; };
    $dupCount = 0;
    foreach ($groups as $ids) {
        $n = count($ids); if ($n < 2 || $n > 400) { continue; }
        for ($i = 0; $i < $n; $i++) {
            for ($j = $i + 1; $j < $n; $j++) {
                $a = min($ids[$i], $ids[$j]); $b = max($ids[$i], $ids[$j]); $pa = $P[$a]; $pb = $P[$b];
                $ba = $birth($a); $bb = $birth($b); $da = $death($a); $db = $death($b);
                if ($ba && $bb && abs($ba['y'] - $bb['y']) > 5) { continue; }
                // sexes connus et différents : deux personnes (fini « Marie ↔ Martin »)
                if (in_array($pa['g'], ['male', 'female'], true) && in_array($pb['g'], ['male', 'female'], true) && $pa['g'] !== $pb['g']) { continue; }
                if (isset($spouses[$a][$b])) { continue; }
                $par1 = $parentsOf($a); $par2 = $parentsOf($b);
                $sameParents = $par1 && $par2 && array_intersect_key($par1, $par2);
                if ($par1 && $par2 && !$sameParents) { continue; } // parents différents
                // même fratrie, deux naissances exactes éloignées : un enfant mort, puis un autre du même prénom
                if ($sameParents && $ba && $bb && $ba['j'] !== null && $bb['j'] !== null && abs($ba['j'] - $bb['j']) > 270) { continue; }
                if (isset($par1[$b]) || isset($par2[$a])) { continue; }
                $checks = []; $score = 0; $max = 0;
                $checks[] = ['ok', 'même nom']; $score += 25; $max += 25;
                $max += 20; if ($pa['fk'] === $pb['fk']) { $checks[] = ['ok', 'même prénom']; $score += 20; } else { $checks[] = ['?', 'prénom proche']; $score += 8; }
                $max += 5; if ($pa['g'] === $pb['g'] && $pa['g'] !== 'unknown') { $checks[] = ['ok', 'même sexe']; $score += 5; } else { $checks[] = ['?', 'sexe']; $score += 2; }
                $max += 20;
                if ($ba && $bb) { if ($ba['j'] !== null && $ba['j'] === $bb['j']) { $checks[] = ['ok', 'même naissance']; $score += 20; } elseif (abs($ba['y'] - $bb['y']) <= 2) { $checks[] = ['ok', 'nés à ' . (abs($ba['y'] - $bb['y']) ? abs($ba['y'] - $bb['y']) . ' an près' : 'la même année')]; $score += 14; } else { $checks[] = ['no', 'nés ' . $ba['y'] . ' / ' . $bb['y']]; } }
                else { $score += 8; }
                $max += 10;
                if ($da && $db) { if (abs($da['y'] - $db['y']) <= 2) { $checks[] = ['ok', 'même décès']; $score += 10; } else { $checks[] = ['no', 'morts ' . $da['y'] . ' / ' . $db['y']]; } }
                else { $score += 4; }
                $max += 15; if ($sameParents) { $checks[] = ['ok', 'mêmes parents']; $score += 15; } else { $checks[] = ['?', 'parents']; $score += 5; }
                $max += 10;
                $sp1 = $spouses[$a] ?? []; $sp2 = $spouses[$b] ?? [];
                if ($sp1 && $sp2) { if (array_intersect_key($sp1, $sp2)) { $checks[] = ['ok', 'même conjoint']; $score += 10; } else { $checks[] = ['no', 'autres conjoints']; } }
                else { $score += 4; }
                $pl1 = array_keys($pa['bpl']); $pl2 = array_keys($pb['bpl']);
                if ($pl1 && $pl2) {
                    $max += 10; $best = null;
                    foreach ($pl1 as $x) { foreach ($pl2 as $y) { $dd = $plDist($x, $y); if ($dd !== null && ($best === null || $dd < $best)) { $best = $dd; } if ($x === $y) { $best = 0.0; } } }
                    if ($best !== null && $best < 1) { $checks[] = ['ok', 'nés au même endroit']; $score += 10; }
                    elseif ($best !== null && $best <= 15) { $checks[] = ['ok', 'nés à ' . round($best) . ' km']; $score += 8; }
                    elseif ($best !== null && $best > 60) { $checks[] = ['no', 'nés à ' . round($best) . ' km']; }
                    else { $score += 3; }
                }
                $pct = (int) round(100 * $score / max(1, $max));
                if ($pct < $th['dup_min']) { continue; }
                $years = static fn($x, $y) => ($x ? 'né ' . $x['y'] : 'né ?') . ($y ? ' / mort ' . $y['y'] : '');
                $add(['key' => "dup:$a:$b", 'check' => 'duplicate', 'sort' => 'doublons', 'level' => $pct >= 85 ? 'orange' : 'yellow', 'title' => $name($a) . ' ↔ ' . $name($b), 'score' => $pct,
                    'detail' => $years($ba, $da) . ' · ' . $years($bb, $db), 'checks' => $checks, 'people' => [$a, $b],
                    'views' => [$a => 'Ressemble à la fiche n° ' . $b . ' (' . $pct . ' %)', $b => 'Ressemble à la fiche n° ' . $a . ' (' . $pct . ' %)'],
                    'fp' => md5($pa['fn'] . $pa['ln'] . $pb['fn'] . $pb['ln'] . json_encode([$ba['t'] ?? '', $bb['t'] ?? '']))]);
                if (++$dupCount > 3000) { break 3; }
            }
        }
    }

    // ═══ 📍 LIEUX ═══
    // lieux mal placés (0, 0 ; hors du pays ; latitude et longitude inversées ; homonyme plus près de la famille)
    try {
        $sus = function_exists('suspicious_places') ? suspicious_places($pdo) : ['alerts' => []];
        foreach ($sus['alerts'] ?? [] as $s) {
            $pl = $s['place']; $id = (int) $pl['id'];
            $onlyFar = count($s['reasons']) === 1 && str_starts_with($s['reasons'][0], 'À ');
            $add(['key' => "place:$id", 'check' => 'misplaced', 'sort' => 'lieux', 'sub' => 'misplaced', 'level' => $onlyFar ? 'yellow' : 'orange', 'title' => $s['reasons'][0],
                'detail' => (int) $pl['n'] . ' événement' . ((int) $pl['n'] > 1 ? 's' : '') . ' à cet endroit' . (count($s['reasons']) > 1 ? ' · ' . implode(' · ', array_slice($s['reasons'], 1)) : ''),
                'people' => [], 'place' => ['id' => $id, 'name' => (string) $pl['name'], 'county' => (string) $pl['county'], 'country' => (string) $pl['country'], 'lat' => (float) $pl['lat'], 'lon' => (float) $pl['lon'], 'n' => (int) $pl['n']],
                'suggest' => $s['suggest'] ?? null, 'fp' => md5(round((float) $pl['lat'], 5) . ',' . round((float) $pl['lon'], 5))]);
        }
    } catch (Throwable $_) {}
    // voyages impossibles (deux endroits trop loin en trop peu de jours : homonymes confondus)
    try {
        foreach (function_exists('impossible_journeys') ? impossible_journeys($pdo) : [] as $j) {
            $pid = (int) $j['person_id']; if (!isset($P[$pid])) { continue; }
            $ea = (int) $j['a']['event_id']; $eb = (int) $j['b']['event_id'];
            $add(['key' => "journey:$pid:$ea:$eb", 'check' => 'journey', 'sort' => 'lieux', 'sub' => 'journeys', 'level' => $j['ratio'] >= 3 ? 'red' : 'orange',
                'title' => 'À ' . number_format((float) $j['km'], 0, ',', ' ') . ' km en ' . ($j['days'] ? $j['days'] . ' jour' . ($j['days'] > 1 ? 's' : '') : 'moins d’un jour'),
                'detail' => "{$j['a']['type_label']} {$j['a']['date_text']} à " . ($j['a']['place_name'] ?: '?') . " · {$j['b']['type_label']} {$j['b']['date_text']} à " . ($j['b']['place_name'] ?: '?') . ' (au plus ≈ ' . $j['speed_limit'] . ' km par jour à cette époque)',
                'people' => [$pid], 'rule' => 'Une même personne ne peut pas être à deux endroits aussi éloignés en si peu de temps : souvent deux homonymes confondus dans une seule fiche.',
                'dates' => [['label' => $j['a']['type_label'], 'text' => $j['a']['date_text'], 'y' => (int) $j['a']['year'], 'j' => null, 'event_id' => $ea, 'person_id' => $pid], ['label' => $j['b']['type_label'], 'text' => $j['b']['date_text'], 'y' => (int) $j['b']['year'], 'j' => null, 'event_id' => $eb, 'person_id' => $pid]],
                'fix' => ['event_id' => $eb, 'person_id' => $pid], 'fp' => md5($ea . $j['a']['date_text'] . $eb . $j['b']['date_text'])]);
        }
    } catch (Throwable $_) {}
    // lieux de naissance ou de décès contradictoires
    foreach ($P as $id => $p) {
        foreach (['bpl' => ['naissance', 'conflicting-naissance-place'], 'dpl' => ['décès', 'conflicting-décès-place']] as $k => [$what, $ck]) {
            if (count($p[$k]) < 2) { continue; }
            $ids = array_keys($p[$k]); $names = array_map(static fn($x) => (string) ($placeRows[$x]['name'] ?? '?'), $ids);
            $far = false; foreach ($ids as $x) { foreach ($ids as $y) { if ($x < $y) { $dd = $plDist($x, $y); if ($dd === null || $dd > 5) { $far = true; } } } }
            if (!$far) { continue; }
            $add(['key' => "$ck:$id", 'check' => 'conflicting-place', 'sort' => 'lieux', 'sub' => 'conflicting', 'level' => 'yellow', 'title' => "Lieux de $what contradictoires",
                'detail' => implode(' / ', array_unique($names)), 'people' => [$id], 'fp' => md5(implode(',', $ids))]);
        }
    }
    // baptême loin du lieu de naissance (pas la commune voisine)
    $nb = []; $wantNb = [];
    foreach ($P as $id => $p) { $bp = $p['b']['pl'] ?? 0; $tp = $p['bapt']['pl'] ?? ($p['bapt_pl'] ?? 0); if ($bp && $tp && $bp !== $tp) { $wantNb[] = [$id, $bp, $tp]; } }
    if ($wantNb) {
        $codes = [];
        foreach ($wantNb as [, $x, $y]) { foreach ([$x, $y] as $z) { $c = (string) ($placeRows[$z]['admin4_code'] ?? ''); if ($c !== '') { $codes[$c] = true; } } }
        if ($codes) {
            try {
                foreach (array_chunk(array_keys($codes), 400) as $chunk) {
                    $st = $pdo->prepare('SELECT insee_code, neighbor_insee_code FROM commune_neighbors WHERE insee_code IN (' . implode(',', array_fill(0, count($chunk), '?')) . ')');
                    $st->execute($chunk); foreach ($st as $r) { $nb[$r['insee_code']][$r['neighbor_insee_code']] = true; }
                }
            } catch (Throwable $_) {}
        }
        foreach ($wantNb as [$id, $x, $y]) {
            $dd = $plDist($x, $y); if ($dd === null || $dd <= $th['baptism_km']) { continue; }
            $cx = (string) ($placeRows[$x]['admin4_code'] ?? ''); $cy = (string) ($placeRows[$y]['admin4_code'] ?? '');
            if ($cx !== '' && $cy !== '' && (isset($nb[$cx][$cy]) || isset($nb[$cy][$cx]))) { continue; }
            $bn = (string) ($placeRows[$x]['name'] ?? '?'); $tn = (string) ($placeRows[$y]['name'] ?? '?');
            $add(['key' => "baptism-far:$id", 'check' => 'baptism-far', 'sort' => 'lieux', 'sub' => 'baptism', 'level' => 'orange', 'title' => 'Baptême à ' . round($dd) . ' km du lieu de naissance',
                'detail' => "Naissance à $bn · baptême à $tn (seuil : {$th['baptism_km']} km). Souvent : une commune homonyme.", 'people' => [$id],
                'place' => ['id' => $y, 'name' => $tn, 'county' => (string) ($placeRows[$y]['county'] ?? ''), 'country' => (string) ($placeRows[$y]['country'] ?? ''), 'lat' => (float) ($placeRows[$y]['latitude'] ?? 0), 'lon' => (float) ($placeRows[$y]['longitude'] ?? 0)],
                'fix' => ['event_id' => $P[$id]['bapt']['e'] ?? ($P[$id]['b']['e'] ?? 0), 'person_id' => $id], 'fp' => md5("$x,$y")]);
        }
    }

    // ── fiches citées (nom, sexe, années, Sosa) ──
    $need = [];
    foreach ($A as $a) { foreach ($a['people'] as $id) { $need[$id] = true; } }
    $people = [];
    foreach (array_keys($need) as $id) {
        if (!isset($P[$id])) { continue; }
        $b = $birth($id); $d = $death($id);
        $people[$id] = ['id' => $id, 'first_name' => $P[$id]['fn'], 'last_name' => $P[$id]['ln'], 'gender' => $P[$id]['g'], 'birth_year' => $b['y'] ?? null, 'death_year' => $d['y'] ?? null, 'birth' => $b['t'] ?? '', 'death' => $d['t'] ?? '', 'sosa' => $sosaOf[$id] ?? 0];
    }
    $order = ['red' => 0, 'orange' => 1, 'yellow' => 2];
    $list = array_values($A);
    usort($list, static fn($x, $y) => [$order[$x['level']], CONTROLE_SORTS_ORDER[$x['sort']] ?? 9, $x['title']] <=> [$order[$y['level']], CONTROLE_SORTS_ORDER[$y['sort']] ?? 9, $y['title']]);
    foreach ($list as &$a) { $a['dates'] = array_values(array_filter($a['dates'] ?? [])); }
    unset($a);
    return ['alerts' => $list, 'people' => $people, 'persons_total' => count($P), 'sosa_root' => $root];
}

const CONTROLE_SORTS_ORDER = ['parents' => 0, 'dates' => 1, 'ages' => 2, 'doublons' => 3, 'lieux' => 4];

/* ─── Exceptions (« Ce n'est pas une erreur ») ─────────────────────────── */

/** Colonnes ajoutées à dismissed_issues (migration) : toutes les sortes y sont gardées, avec raison, note et empreinte. */
function controle_schema(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS dismissed_issues (issue_key TEXT PRIMARY KEY, reason TEXT DEFAULT '', dismissed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $cols = array_column($pdo->query('PRAGMA table_info(dismissed_issues)')->fetchAll(), 'name');
    foreach (['kind' => "TEXT NOT NULL DEFAULT ''", 'title' => "TEXT NOT NULL DEFAULT ''", 'note' => "TEXT NOT NULL DEFAULT ''", 'fingerprint' => "TEXT NOT NULL DEFAULT ''", 'watch' => 'INTEGER NOT NULL DEFAULT 0', 'people' => "TEXT NOT NULL DEFAULT ''", 'place_id' => 'INTEGER'] as $c => $def) {
        if (!in_array($c, $cols, true)) { $pdo->exec("ALTER TABLE dismissed_issues ADD COLUMN $c $def"); }
    }
    // les lieux écartés par l'ancien écran « Lieux mal placés » (réglage à part, sans raison) entrent dans la même table
    $row = $pdo->query("SELECT value FROM app_settings WHERE key='lcnda-place-ignored'")->fetchColumn();
    $ids = $row ? (json_decode((string) $row, true)['ids'] ?? []) : [];
    if ($ids) {
        $ins = $pdo->prepare("INSERT OR IGNORE INTO dismissed_issues(issue_key, reason, kind, title, place_id) VALUES(?, 'Le lieu est juste', 'lieux', ?, ?)");
        foreach ($ids as $id) { $id = (int) $id; if ($id) { $name = (string) $pdo->query('SELECT name FROM places WHERE id=' . $id)->fetchColumn(); $ins->execute(["place:$id", $name !== '' ? $name . ' : coordonnées' : 'Lieu n° ' . $id, $id]); } }
        $pdo->exec("DELETE FROM app_settings WHERE key='lcnda-place-ignored'");
    }
}

function controle_dismissed(PDO $pdo): array
{
    $out = [];
    try { foreach ($pdo->query('SELECT * FROM dismissed_issues') as $r) { $out[(string) $r['issue_key']] = $r; } } catch (Throwable $_) {}
    return $out;
}

/** La liste avec les exceptions : actives (dont celles revenues parce qu'une date a changé) et écartées. */
function controle_state(PDO $pdo, bool $fresh = false): array
{
    $run = controle_run($pdo, $fresh);
    $dis = controle_dismissed($pdo);
    $active = []; $byKey = [];
    foreach ($run['alerts'] as $a) {
        $byKey[$a['key']] = true;
        $d = $dis[$a['key']] ?? null;
        if ($d) {
            $changed = (int) ($d['watch'] ?? 0) === 1 && (string) ($d['fingerprint'] ?? '') !== '' && $d['fingerprint'] !== $a['fp'];
            if (!$changed) { continue; }
            $a['returned'] = true; $a['dismissal'] = ['reason' => $d['reason'], 'note' => $d['note'] ?? '', 'at' => $d['dismissed_at']];
        }
        $active[] = $a;
    }
    $alertsByKey = array_column($run['alerts'], null, 'key');
    $exceptions = [];
    foreach ($dis as $key => $d) {
        $a = $alertsByKey[$key] ?? null;
        $status = !$a ? 'gone' : (((int) ($d['watch'] ?? 0) === 1 && (string) ($d['fingerprint'] ?? '') !== '' && $d['fingerprint'] !== $a['fp']) ? 'changed' : 'ok');
        $exceptions[] = ['key' => $key, 'reason' => (string) $d['reason'], 'note' => (string) ($d['note'] ?? ''), 'at' => (string) $d['dismissed_at'], 'watch' => (int) ($d['watch'] ?? 0),
            'title' => $a['title'] ?? ((string) ($d['title'] ?? '') ?: $key), 'sort' => $a['sort'] ?? ((string) ($d['kind'] ?? '') ?: controle_sort_of_key($key)), 'level' => $a['level'] ?? 'yellow',
            'people' => $a['people'] ?? array_values(array_filter(array_map('intval', explode(',', (string) ($d['people'] ?? ''))))), 'place' => $a['place'] ?? (($d['place_id'] ?? null) ? ['id' => (int) $d['place_id'], 'name' => (string) ($d['title'] ?? '')] : null),
            'detail' => $a['detail'] ?? '', 'status' => $status];
    }
    usort($exceptions, static fn($x, $y) => strcmp($y['at'], $x['at']));
    // fiches citées par les exceptions qui ne sont plus dans la liste
    $people = $run['people'];
    $missing = [];
    foreach ($exceptions as $e) { foreach ($e['people'] as $id) { if (!isset($people[$id])) { $missing[$id] = true; } } }
    if ($missing) {
        $st = $pdo->prepare('SELECT id, first_name, last_name, gender FROM persons WHERE id IN (' . implode(',', array_fill(0, count($missing), '?')) . ')');
        $st->execute(array_keys($missing));
        foreach ($st as $r) { $people[(int) $r['id']] = ['id' => (int) $r['id'], 'first_name' => $r['first_name'], 'last_name' => $r['last_name'], 'gender' => $r['gender'], 'birth_year' => null, 'death_year' => null, 'sosa' => 0]; }
    }
    return ['alerts' => $active, 'exceptions' => $exceptions, 'people' => $people, 'checked_at' => $run['checked_at'], 'persons_total' => $run['persons_total'], 'ms' => $run['ms'] ?? 0];
}

function controle_sort_of_key(string $key): string
{
    $k = strtok($key, ':');
    return match (true) {
        in_array($k, ['dup'], true) => 'doublons',
        in_array($k, ['place', 'journey', 'baptism-far', 'conflicting-naissance-place', 'conflicting-décès-place'], true) => 'lieux',
        in_array($k, ['old-parent', 'young-marriage', 'old-marriage', 'sosa-gap'], true) => 'ages',
        in_array($k, ['child-after-parent-death', 'close-births', 'same-year-siblings', 'before-marriage', 'sibling-span', 'multiple-parent-families', 'ghost-family', 'sosa-sex', 'young-parent'], true) => 'parents',
        default => 'dates',
    };
}

/** GET controle : la page entière (alertes actives, exceptions, fiches citées, branches). */
function controle_page_data(PDO $pdo, array $q): array
{
    $st = controle_state($pdo, ($q['fresh'] ?? '') === '1');
    $st['branches'] = [];
    try { $st['branches'] = $pdo->query('SELECT b.id, b.name, b.color, (SELECT count(*) FROM branch_people bp WHERE bp.branch_id=b.id) AS n FROM branches b ORDER BY b.name COLLATE NOCASE')->fetchAll(); } catch (Throwable $_) {}
    $st['seuils'] = controle_seuils($pdo);
    return $st;
}

/** Fiches d'une branche, des ancêtres (Sosa) ou des descendants d'une personne : pour le filtre « Branche ». */
function controle_scope_ids(PDO $pdo, string $scope): array
{
    if (preg_match('/^branch:(\d+)$/', $scope, $m)) {
        $st = $pdo->prepare('SELECT person_id FROM branch_people WHERE branch_id=?'); $st->execute([(int) $m[1]]);
        return array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
    }
    if ($scope === 'sosa') {
        $root = (int) $pdo->query('SELECT id FROM persons ORDER BY is_start DESC, id LIMIT 1')->fetchColumn();
        return $root && function_exists('sosa_positions') ? array_values(array_unique(array_map('intval', sosa_positions($pdo, $root, 60000)['positions'] ?? []))) : [];
    }
    if (preg_match('/^desc:(\d+)$/', $scope, $m)) {
        $children = [];
        foreach ($pdo->query('SELECT f.partner1_id, f.partner2_id, fc.child_id FROM family_children fc JOIN families f ON f.id=fc.family_id') as $r) {
            foreach ([(int) $r['partner1_id'], (int) $r['partner2_id']] as $p) { if ($p) { $children[$p][] = (int) $r['child_id']; } }
        }
        $seen = [(int) $m[1] => true]; $queue = [(int) $m[1]];
        while ($queue && count($seen) < 200000) { $x = array_shift($queue); foreach ($children[$x] ?? [] as $c) { if (!isset($seen[$c])) { $seen[$c] = true; $queue[] = $c; } } }
        return array_keys($seen);
    }
    return [];
}

/** GET controle_summary : le widget (nombres par sorte et par gravité, % des fiches sans alerte, 3 premières alertes). */
function controle_summary(PDO $pdo): array
{
    $st = controle_state($pdo);
    $bySort = array_fill_keys(CONTROLE_SORTS, 0); $byLevel = array_fill_keys(CONTROLE_LEVELS, 0); $touched = [];
    foreach ($st['alerts'] as $a) { $bySort[$a['sort']]++; $byLevel[$a['level']]++; foreach ($a['people'] as $id) { $touched[$id] = true; } }
    $total = max(0, (int) $st['persons_total']);
    $ok = max(0, $total - count($touched));
    $top = array_map(static fn($a) => ['key' => $a['key'], 'level' => $a['level'], 'sort' => $a['sort'], 'title' => $a['title'], 'people' => array_slice($a['people'], 0, 2)], array_slice($st['alerts'], 0, 5));
    $people = [];
    foreach ($top as $t) { foreach ($t['people'] as $id) { if (isset($st['people'][$id])) { $people[$id] = $st['people'][$id]; } } }
    return ['total' => count($st['alerts']), 'by_sort' => $bySort, 'by_level' => $byLevel, 'exceptions' => count(array_filter($st['exceptions'], static fn($e) => $e['status'] !== 'changed')),
        'returned' => count(array_filter($st['alerts'], static fn($a) => !empty($a['returned']))), 'persons_total' => $total, 'persons_ok' => $ok, 'persons_touched' => count($touched),
        'pct_ok' => $total ? (int) floor(100 * $ok / $total) : 100, 'top' => $top, 'people' => $people, 'checked_at' => $st['checked_at']];
}

/** GET controle_person : ce qui touche une fiche (le bandeau « ⚠️ N choses à vérifier »). */
function controle_person(PDO $pdo, int $id): array
{
    if (!$id) { return ['alerts' => [], 'people' => []]; }
    $st = controle_state($pdo);
    $list = []; $people = [];
    foreach ($st['alerts'] as $a) {
        if (!in_array($id, $a['people'], true)) { continue; }
        $a['view'] = $a['views'][$id] ?? $a['views'][(string) $id] ?? $a['title'];
        $list[] = $a;
        foreach ($a['people'] as $p) { if (isset($st['people'][$p])) { $people[$p] = $st['people'][$p]; } }
    }
    return ['alerts' => $list, 'people' => $people, 'banner' => controle_seuils($pdo)['banner']];
}

/** POST controle_dismiss : « Ce n'est pas une erreur » (raison, note, « me le signaler à nouveau si une date change »). */
function controle_dismiss(PDO $pdo, array $data): array
{
    $key = mb_substr(safe_text($data['key'] ?? ''), 0, 200);
    if ($key === '' || !preg_match('/^[a-zé-]+:[\d:]+$/u', $key)) { throw new RuntimeException('Alerte inconnue.'); }
    $reason = mb_substr(safe_text($data['reason'] ?? ''), 0, 200) ?: 'Vérifié : ce n’est pas une erreur';
    $note = mb_substr(safe_text($data['note'] ?? ''), 0, 1000);
    $watch = !empty($data['watch']) && $data['watch'] !== '0' ? 1 : 0;
    $alert = null;
    foreach (controle_run($pdo)['alerts'] as $a) { if ($a['key'] === $key) { $alert = $a; break; } }
    $before = controle_dismissed($pdo)[$key] ?? null;
    $pdo->prepare('INSERT OR REPLACE INTO dismissed_issues(issue_key, reason, dismissed_at, kind, title, note, fingerprint, watch, people, place_id) VALUES(?,?,CURRENT_TIMESTAMP,?,?,?,?,?,?,?)')
        ->execute([$key, $reason, $alert['sort'] ?? controle_sort_of_key($key), mb_substr((string) ($alert['title'] ?? ''), 0, 300), $note, (string) ($alert['fp'] ?? ''), $watch, implode(',', $alert['people'] ?? []), $alert['place']['id'] ?? null]);
    log_change($pdo, 'maintenance', null, 'dismiss', 'Contrôle de la base : « ' . ($alert['title'] ?? $key) . ' » écarté (' . $reason . ')', $before ?: null, ['key' => $key, 'reason' => $reason]);
    return ['key' => $key, 'title' => $alert['title'] ?? $key, 'before' => $before];
}

/** POST controle_undismiss : « ↺ Signaler de nouveau » (rend aussi l'exception d'avant, pour « ↶ Annuler »). */
function controle_undismiss(PDO $pdo, array $data): array
{
    $key = mb_substr(safe_text($data['key'] ?? ''), 0, 200);
    if ($key === '') { throw new RuntimeException('Alerte inconnue.'); }
    $before = controle_dismissed($pdo)[$key] ?? null;
    $pdo->prepare('DELETE FROM dismissed_issues WHERE issue_key=?')->execute([$key]);
    if ($before) { log_change($pdo, 'maintenance', null, 'undismiss', 'Contrôle de la base : « ' . (($before['title'] ?? '') ?: $key) . ' » signalé de nouveau', $before, null); }
    return ['key' => $key, 'before' => $before];
}

/** POST controle_fix_date : corriger une date sur place (mode « Une à une »), le reste de l'événement ne bouge pas. */
function controle_fix_date(PDO $pdo, array $data): array
{
    $id = safe_int($data['event_id'] ?? 0);
    $date = mb_substr(safe_text($data['date_text'] ?? ''), 0, 120);
    $stmt = $pdo->prepare('SELECT * FROM events WHERE id=?'); $stmt->execute([$id]); $before = $stmt->fetch();
    if (!$before) { throw new RuntimeException('Événement introuvable.'); }
    if (function_exists('assert_event_unlocked')) { assert_event_unlocked($pdo, $id); }
    $cal = (string) ($before['date_calendar'] ?: 'gregorian');
    [$year, $converted] = function_exists('event_year_and_converted') ? event_year_and_converted($date, '', $cal) : [preg_match('/\b(\d{3,4})\b/', $date, $m) ? (int) $m[1] : null, ''];
    $pdo->prepare('UPDATE events SET date_text=?, year=?, date_converted=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$date, $year, $converted, $id]);
    $stmt->execute([$id]); $after = $stmt->fetch();
    log_change($pdo, 'event', $id, 'update', 'Contrôle de la base : date corrigée (« ' . $before['date_text'] . ' » → « ' . $date . ' »)', $before, $after);
    return ['event_id' => $id, 'before' => (string) $before['date_text'], 'date_text' => $date, 'year' => $year];
}

/** GET controle_family_stats : « Moyennes de la famille » (âge au mariage, écart entre les naissances), déplacées dans Graphiques. */
function controle_family_stats(PDO $pdo): array
{
    $r = function_exists('age_checks') ? age_checks($pdo) : [];
    return ['periods' => $r['periods'] ?? [], 'marriages' => $r['marriages'] ?? 0];
}
